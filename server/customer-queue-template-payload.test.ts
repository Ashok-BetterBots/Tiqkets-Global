import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const source = readFileSync(new URL("./whatsapp.ts", import.meta.url), "utf8");
const a = source.indexOf("export async function sendWhatsAppTemplateMessage(");
const b = source.indexOf("export async function sendWhatsAppOTP(", a);
assert.ok(a >= 0 && b > a);
const code = transformSync(source.slice(a, b).replace("export async function", "async function"), { loader: "ts" }).code;

test("dine-in payload has named variables, image and suffix; logs omit recipient/provider data", async () => {
  const bodies: any[] = [], logs: string[] = [];
  let rejected = false;
  const context: any = {
    getPhoneNumberId: () => "mock-phone-id",
    getAccessToken: () => "mock-access-token",
    WHATSAPP_API_BASE: "https://test.invalid",
    fetch: async (_url: string, options: any) => {
      bodies.push(JSON.parse(options.body));
      return rejected
        ? { ok: false, status: 400, text: async () => JSON.stringify({ error: {
          code: 132012, message: "provider-private 919876543210 mock-access-token",
        } }) }
        : { ok: true, status: 200, json: async () => ({ messages: [{ id: "private-message-id" }] }) };
    },
    incrementOrgWhatsappCount: async () => {},
    console: {
      log: (...args: any[]) => logs.push(args.join(" ")),
      error: (...args: any[]) => logs.push(args.join(" ")),
    },
  };
  runInNewContext(code + "\nglobalThis.send = sendWhatsAppTemplateMessage;", context);
  const opts = {
    bodyParamNames: ["customer_name"],
    headerImageUrl: "https://test.invalid/queue-ticket-image/private-qr.png",
    ctaUrlParam: "private-qr",
  };
  assert.equal(await context.send("919876543210", "tiqkets_global_dinein_booking_confirmed_en", "en", ["Private Name"], opts), true);
  assert.equal(bodies[0].template.components[1].parameters[0].parameter_name, "customer_name");
  assert.equal(bodies[0].template.components[2].parameters[0].text, "private-qr");
  rejected = true;
  assert.equal(await context.send("919876543210", "tiqkets_global_dinein_booking_confirmed_en", "en", ["Private Name"], opts), false);
  const output = logs.join("\n");
  assert.match(output, /outcome=accepted/);
  assert.match(output, /httpStatus=400 metaErrorCode=132012/);
  assert.doesNotMatch(output, /919876543210|Private Name|private-qr|provider-private|mock-access-token|private-message-id/);
});