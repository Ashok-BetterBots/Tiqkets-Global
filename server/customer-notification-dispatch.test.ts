import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const source = readFileSync(new URL("./notifications.ts", import.meta.url), "utf8");
const cases = [
  ["sendCalledNotification", "sendCheckinConfirmationNotification", ["ticket", "Branch"]],
  ["sendDineInCalledNotification", "sendDineInBookingConfirmedNotification", ["ticket", "Branch", "A1"]],
  ["sendStatusChangeNotification", "notifyServiceQueueStatusChange", ["ticket", "Branch", "hold"]],
  ["sendStatusChangeNotification", "notifyServiceQueueStatusChange", ["ticket", "Branch", "waiting"]],
] as const;

for (const [name, next, args] of cases) {
  test(`${name} ${args[2] ?? ""} sends WhatsApp even when push fails`, async () => {
    const a = source.indexOf(`export async function ${name}(`);
    const b = source.indexOf(`export async function ${next}(`, a);
    assert.ok(a >= 0 && b > a);
    const code = transformSync(source.slice(a, b).replace("export async function", "async function"), { loader: "ts" }).code;
    const calls: any[][] = [];
    const sender = async (...values: any[]) => { calls.push(values); };
    const context: any = {
      db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{
        id: "ticket", ticketNumber: "TEST-1", serviceName: "Service",
        tableNumber: "A1", formData: {}, callCount: 1,
      }] }) }) }) },
      tickets: {}, eq: () => true,
      sendSinglePush: async () => { throw new Error("Mock push failure"); },
      sendWhatsAppTurnNotification: sender,
      sendWhatsAppDineInCalledNotification: sender,
      sendWhatsAppStatusChangeNotification: sender,
      console: { error: () => {} },
    };
    runInNewContext(code + `\nglobalThis.notify = ${name};`, context);
    await context.notify(...args);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], Array.from(args));
  });
}