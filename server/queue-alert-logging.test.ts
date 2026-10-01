import assert from "node:assert/strict";
import test from "node:test";
import { sendAlertToRecipient } from "./branch-alerts";
import { sendWhatsAppAlertTemplate } from "./whatsapp";

const phoneNumber = "919876543210";
const accessToken = "queue-alert-test-token";

function captureLogs() {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  return {
    lines,
    restore() {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

test("queue alert template logs redact recipient and provider details", async () => {
  const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalFetch = global.fetch;
  const logs = captureLogs();
  process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
  process.env.WHATSAPP_ACCESS_TOKEN = accessToken;

  try {
    global.fetch = (async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
        status: 200,
      })) as typeof fetch;
    assert.equal(
      await sendWhatsAppAlertTemplate(
        phoneNumber,
        "org_alert_queue_start",
        ["Test recipient", "Service", "Branch", "10:30 AM"],
      ),
      true,
    );

    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 131047,
            message: `Rejected ${phoneNumber} with ${accessToken}; provider-body-secret`,
          },
        }),
        { status: 400 },
      )) as typeof fetch;
    assert.equal(
      await sendWhatsAppAlertTemplate(
        phoneNumber,
        "org_alert_queue_end",
        ["Test recipient", "Service"],
      ),
      false,
    );

    const output = logs.lines.join("\n");
    assert.match(output, /template=org_alert_queue_start outcome=sent httpStatus=200 metaErrorCode=none/);
    assert.match(output, /template=org_alert_queue_end outcome=failed httpStatus=400 metaErrorCode=131047/);
    assert.doesNotMatch(output, new RegExp(phoneNumber));
    assert.doesNotMatch(output, new RegExp(accessToken));
    assert.doesNotMatch(output, /provider-body-secret/);
  } finally {
    logs.restore();
    global.fetch = originalFetch;
    if (originalPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
    if (originalAccessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
  }
});

test("queue template fallback error and success logs redact recipient and provider details", async () => {
  const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalFetch = global.fetch;
  const logs = captureLogs();
  const requestBodies: any[] = [];
  process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
  process.env.WHATSAPP_ACCESS_TOKEN = accessToken;

  const recipient = {
    branchId: "test-branch",
    sendViaWhatsapp: true,
    phoneNumber,
    sendViaPush: false,
  } as any;
  const queuePayload = {
    title: "Queue opened",
    message: "Queue opened for Service",
    template: { name: "org_alert_queue_start" as const, params: ["Service"] },
  };

  try {
    let responses = [
      new Response(
        JSON.stringify({
          error: {
            code: 132001,
            message: `Template rejected for ${phoneNumber} using ${accessToken}; provider-body-secret`,
          },
        }),
        { status: 400 },
      ),
      new Response(
        JSON.stringify({
          error: {
            code: 131026,
            message: `Fallback rejected for ${phoneNumber} using ${accessToken}; fallback-body-secret`,
          },
        }),
        { status: 500 },
      ),
    ];
    global.fetch = (async (_input: any, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)));
      return responses.shift()!;
    }) as typeof fetch;

    await sendAlertToRecipient(recipient, queuePayload);
    const errorOutput = logs.lines.join("\n");
    assert.match(errorOutput, /template=org_alert_queue_start outcome=failed httpStatus=400 metaErrorCode=132001/);
    assert.match(errorOutput, /fallback template=org_alert_queue_start outcome=failed httpStatus=500 metaErrorCode=131026/);
    assert.doesNotMatch(errorOutput, new RegExp(phoneNumber));
    assert.doesNotMatch(errorOutput, new RegExp(accessToken));
    assert.doesNotMatch(errorOutput, /provider-body-secret|fallback-body-secret/);
    assert.equal(requestBodies[1].type, "text");
    assert.equal(requestBodies[1].text.body, "Queue opened\nQueue opened for Service");

    logs.lines.length = 0;
    requestBodies.length = 0;
    responses = [
      new Response(JSON.stringify({ error: { code: 132001 } }), { status: 400 }),
      new Response(JSON.stringify({ messages: [{ id: "wamid.test-fallback" }] }), {
        status: 200,
      }),
    ];
    await sendAlertToRecipient(recipient, queuePayload);
    const successOutput = logs.lines.join("\n");
    assert.match(successOutput, /fallback template=org_alert_queue_start outcome=sent httpStatus=200 metaErrorCode=none/);
    assert.doesNotMatch(successOutput, new RegExp(phoneNumber));
    assert.doesNotMatch(successOutput, new RegExp(accessToken));
  } finally {
    logs.restore();
    global.fetch = originalFetch;
    if (originalPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
    if (originalAccessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
  }
});

test("recipient-send exceptions redact only queue open/close alert details", async () => {
  const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalReplace = String.prototype.replace;
  const logs = captureLogs();
  process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
  process.env.WHATSAPP_ACCESS_TOKEN = accessToken;

  try {
    String.prototype.replace = function (searchValue: any, replaceValue: any) {
      if (String(this) === phoneNumber) {
        throw new Error(`failed for ${phoneNumber} and ${accessToken}`);
      }
      return originalReplace.call(this, searchValue, replaceValue);
    };

    const recipient = {
      branchId: "test-branch",
      sendViaWhatsapp: true,
      phoneNumber,
      sendViaPush: false,
    } as any;

    await sendAlertToRecipient(recipient, {
      title: "Queue opened",
      message: "Queue opened",
      template: { name: "org_alert_queue_start", params: ["Service"] },
    });
    const queueOutput = logs.lines.join("\n");
    assert.match(queueOutput, /recipient send error template=org_alert_queue_start/);
    assert.doesNotMatch(queueOutput, new RegExp(phoneNumber));
    assert.doesNotMatch(queueOutput, new RegExp(accessToken));

    logs.lines.length = 0;
    await sendAlertToRecipient(recipient, {
      title: "High volume",
      message: "High volume",
      template: { name: "org_alert_high_volume", params: ["Branch"] },
    });
    const otherAlertOutput = logs.lines.join("\n");
    assert.match(otherAlertOutput, new RegExp(phoneNumber));
    assert.match(otherAlertOutput, new RegExp(accessToken));
  } finally {
    String.prototype.replace = originalReplace;
    logs.restore();
    if (originalPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
    if (originalAccessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
  }
});