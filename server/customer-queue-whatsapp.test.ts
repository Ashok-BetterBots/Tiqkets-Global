import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import { getApprovedWaTemplate } from "../shared/wa-approved-templates";

// Execute production functions without importing the server/DB or contacting
// Meta. Every send, image preparation, and database operation is a test double.
const source = readFileSync(new URL("./whatsapp.ts", import.meta.url), "utf8");
function extract(start: string, end: string) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return source.slice(a, b).replaceAll("export async function", "async function");
}
const helperCode = transformSync(extract(
  "async function sendDineInApprovedTemplate(",
  "// ─── FIFO / Multi-Stage: Your Turn",
), { loader: "ts" }).code;
const queueCode = transformSync(extract(
  "export async function sendWhatsAppQueueTicket(",
  "export { sendWhatsAppMessage",
), { loader: "ts" }).code;

function harness(language = "en") {
  const row: any = {
    id: "ticket", ticketNumber: "TEST-1", customerName: "Private Name",
    customerPhone: "9876543210", whatsappPhone: null, whatsappConfirmed: false,
    preferredLanguage: language, notificationsSent: [], qrToken: "private-qr",
    orgId: "org", orgName: "Restaurant", branchName: "Branch",
    branchQueueMode: "fifo", serviceSettings: { queueMode: "dine_in" },
    formData: { guests: 2 }, tableNumber: "A1",
  };
  const sends: any[][] = [], marks: string[] = [], logs: string[] = [];
  let imageFails = false, sendSucceeds = true;
  let imageWait: Promise<void> | undefined;
  const context: any = {
    db: {
      select: () => {
        const chain: any = {
          from: () => chain, leftJoin: () => chain, where: () => chain,
          limit: async () => [{ ...row, notificationsSent: [...row.notificationsSent] }],
        };
        return chain;
      },
    },
    tickets: {}, branches: {}, organizations: {}, services: {},
    eq: () => true,
    normalizeWaMode: (mode: string) => mode === "dine_in" ? "dinein" : mode,
    normalizeIndianPhone: (phone: string) => phone.length === 10 ? `91${phone}` : phone,
    getApprovedWaTemplate,
    formatReservationTime: () => "",
    process: { env: { APP_DOMAIN: "test.invalid" } },
    _inFlightDineInSends: new Map(),
    preRenderAndCacheQueueTicketImage: async () => {
      if (imageWait) await imageWait;
      if (imageFails) throw new Error("private renderer detail");
      return Buffer.from("test-image");
    },
    sendWhatsAppTemplateMessage: async (...args: any[]) => {
      sends.push(args);
      return sendSucceeds;
    },
    markWhatsAppSent: async (_id: string, _old: string[], key: string) => {
      marks.push(key);
      row.notificationsSent = [...new Set([...row.notificationsSent, key])];
    },
    sendWhatsAppImage: async () => { throw new Error("Unexpected free-form fallback"); },
    sendWhatsAppMessage: async () => { throw new Error("Unexpected free-form fallback"); },
    console: {
      log: (...args: any[]) => logs.push(args.join(" ")),
      error: (...args: any[]) => logs.push(args.join(" ")),
    },
  };
  runInNewContext(helperCode + queueCode +
    "\nglobalThis.send = sendDineInApprovedTemplate; globalThis.join = sendWhatsAppQueueTicket;", context);
  return {
    row, sends, marks, logs, send: context.send, join: context.join,
    failImage(value: boolean) { imageFails = value; },
    failSend(value: boolean) { sendSucceeds = !value; },
    waitForImage(promise: Promise<void>) { imageWait = promise; },
  };
}

for (const language of ["en", "ta"]) {
  test(`all five dine-in actions use approved ${language} templates without a conversation gate`, async () => {
    const h = harness(language);
    const cases = [
      ["booking_confirmed", "whatsapp_dinein_confirmed"],
      ["table_ready", "whatsapp_dinein_called"],
      ["booking_on_hold", "whatsapp_status_hold"],
      ["booking_resumed", "whatsapp_status_waiting"],
      ["booking_reminder", "whatsapp_dinein_reminder_2"],
    ];
    for (const [trigger, key] of cases) {
      assert.equal(await h.send("ticket", trigger, {}, key), true);
      const call = h.sends.at(-1)!;
      const approved = getApprovedWaTemplate("dinein", trigger, language)!;
      assert.equal(call[0], "919876543210");
      assert.equal(call[1], approved.templateName);
      assert.equal(call[2], language);
      assert.equal(call[3].length, approved.bodyVariables.length);
      assert.deepEqual(Array.from(call[4].bodyParamNames), approved.bodyVariables);
      assert.equal(Boolean(call[4].headerImageUrl), Boolean(approved.hasImageHeader));
      if (approved.hasCTAUrl) assert.equal(call[4].ctaUrlParam, "private-qr");
    }
    assert.equal(h.marks.length, 5);
    assert.doesNotMatch(h.logs.join("\n"), /Private Name|9876543210|private-qr|private renderer detail/);
  });
}

test("an image failure leaves creation retryable and does not call Meta or mark sent", async () => {
  const h = harness();
  h.failImage(true);
  assert.equal(await h.join("ticket"), false);
  assert.equal(h.sends.length, 0);
  assert.equal(h.marks.length, 0);
  h.failImage(false);
  assert.equal(await h.join("ticket"), true);
  assert.equal(h.sends.length, 1);
});

test("an API rejection can retry immediately without a poisoned five-second guard", async () => {
  const h = harness();
  h.failSend(true);
  assert.equal(await h.send("ticket", "booking_on_hold", {}, "whatsapp_status_hold"), false);
  assert.equal(h.marks.length, 0);
  h.failSend(false);
  assert.equal(await h.send("ticket", "booking_on_hold", {}, "whatsapp_status_hold"), true);
  assert.equal(h.sends.length, 2);
});

test("concurrent duplicates share one send; already accepted creation has no fallback", async () => {
  const h = harness();
  let release!: () => void;
  h.waitForImage(new Promise<void>(resolve => { release = resolve; }));
  const first = h.join("ticket"), second = h.join("ticket");
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(h.sends.length, 1);
  assert.equal(await h.join("ticket"), true);
  assert.equal(h.sends.length, 1);
});

test("rapid distinct recalls and a subsequent hold cycle are not suppressed", async () => {
  const h = harness();
  for (const callCount of [2, 3]) {
    assert.equal(await h.send("ticket", "booking_reminder", {}, `whatsapp_dinein_reminder_${callCount}`), true);
  }
  assert.equal(await h.send("ticket", "booking_on_hold", {}, "whatsapp_status_hold"), true);
  assert.equal(await h.send("ticket", "booking_resumed", {}, "whatsapp_status_waiting"), true);
  h.row.notificationsSent = h.row.notificationsSent.filter((key: string) => key !== "whatsapp_status_hold");
  assert.equal(await h.send("ticket", "booking_on_hold", {}, "whatsapp_status_hold"), true);
  assert.equal(h.sends.length, 5);
});

test("creation without a recipient skips safely without a send", async () => {
  const h = harness();
  h.row.customerPhone = null;
  assert.equal(await h.join("ticket"), true);
  assert.equal(h.sends.length, 0);
});