import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("./templates/join-queue.html", import.meta.url), "utf8");
const a = html.indexOf("// ── Determine flow type");
const b = html.indexOf("hideLoading();", a);
assert.ok(a >= 0 && b > a);
const confirmationCode = html.slice(a, b);

function confirmation(result: Record<string, unknown>) {
  const elements = new Map<string, any>();
  const element = (id: string) => {
    if (!elements.has(id)) {
      const classes = new Set(["hidden"]);
      elements.set(id, {
        style: { display: "none" }, textContent: "", attributes: {},
        classList: {
          add: (name: string) => classes.add(name),
          remove: (name: string) => classes.delete(name),
          contains: (name: string) => classes.has(name),
        },
        setAttribute(name: string, value: string) { this.attributes[name] = value; },
      });
    }
    return elements.get(id);
  };
  runInNewContext(confirmationCode, {
    result, document: { getElementById: element },
    selectedService: { name: "Tables" }, data: { guests: "2" },
    saveSession: () => {}, t: (key: string) => key,
  });
  return element;
}

const baseResult = {
  ticketNumber: "TEST-1", position: 1, totalInQueue: 1, estimatedWait: 5,
  whatsappRefCode: "TESTREF", whatsappUrl: "https://test.invalid/whatsapp",
};

test("Dine-In QR confirmation shows the same ticket image, not a WhatsApp redirect", () => {
  const get = confirmation({
    ...baseResult, isDineIn: true, ticketImageUrl: "/queue-ticket-image/mock-ticket.png",
  });
  assert.equal(get("ticketImage").src, "/queue-ticket-image/mock-ticket.png");
  assert.equal(get("ticketImageSection").classList.contains("hidden"), false);
  for (const id of ["whatsappBtn", "whatsappHint", "whatsappSection"]) {
    assert.equal(get(id).style.display, "none");
  }
  get("ticketImage").onload();
  assert.equal(get("ticketImage").classList.contains("hidden"), false);
  assert.equal(get("ticketImageLoading").classList.contains("hidden"), true);
});

test("a failed image load surfaces an error without a WhatsApp redirect", () => {
  const get = confirmation({
    ...baseResult, isDineIn: true, ticketImageUrl: "/queue-ticket-image/mock-ticket.png",
  });
  get("ticketImage").onerror();
  assert.equal(get("ticketImageError").classList.contains("hidden"), false);
  assert.equal(get("whatsappBtn").style.display, "none");
});

test("other modes retain their WhatsApp confirmation button and no image", () => {
  const get = confirmation(baseResult);
  assert.equal(get("whatsappBtn").href, baseResult.whatsappUrl);
  assert.equal(get("whatsappBtn").style.display, "flex");
  assert.equal(get("whatsappSection").style.display, "block");
  assert.equal(get("ticketImageSection").classList.contains("hidden"), true);
});

test("the join response includes the image only for Dine-In", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const routeStart = routes.indexOf('app.post("/api/join/:branchId"');
  const responseStart = routes.indexOf("res.json({", routeStart);
  const responseEnd = routes.indexOf("\n    } catch", responseStart);
  const responseCode = routes.slice(responseStart, responseEnd);
  for (const isDineIn of [true, false]) {
    let result: any;
    runInNewContext(responseCode, {
      isDineIn, qrToken: "mock-ticket",
      ticket: { id: "ticket", ticketNumber: "TEST-1", joinedAt: "2026-10-03" },
      position: 1, estimatedWait: 5, predictedServiceAt: null,
      whatsappRefCode: "TESTREF", whatsappUrl: "https://test.invalid/whatsapp",
      res: { json: (data: unknown) => { result = data; } },
    });
    if (isDineIn) {
      assert.equal(result.isDineIn, true);
      assert.equal(result.ticketImageUrl, "/queue-ticket-image/mock-ticket.png");
    } else {
      assert.equal(Object.hasOwn(result, "ticketImageUrl"), false);
      assert.equal(Object.hasOwn(result, "isDineIn"), false);
    }
    assert.equal(result.whatsappRefCode, "TESTREF");
  }
});