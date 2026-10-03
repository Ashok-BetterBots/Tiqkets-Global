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
  assert.equal(get("ticketImageLoading").classList.contains("hidden"), false);
  assert.equal(get("ticketImage").classList.contains("hidden"), true);
  assert.equal(get("estWaitTimeRow").style.display, "none");
  for (const id of ["whatsappBtn", "whatsappHint", "whatsappSection"]) {
    assert.equal(get(id).style.display, "none");
  }
  get("ticketImage").onload();
  assert.equal(get("ticketImage").classList.contains("hidden"), false);
  assert.equal(get("ticketImageLoading").classList.contains("hidden"), true);
});

test("ticket generation and the loaded ticket appear above Booking Confirmed", () => {
  const successStart = html.indexOf('<div class="success-screen">');
  const ticketStart = html.indexOf('<div id="ticketImageSection"', successStart);
  const titleStart = html.indexOf('<h2 class="booking-confirmed-title"', successStart);
  assert.ok(successStart >= 0 && ticketStart > successStart && titleStart > ticketStart);
  assert.match(html.slice(ticketStart, titleStart), /role="status">Generating Ticket\.\.\.</);
  assert.equal((html.match(/id="ticketImageSection"/g) || []).length, 1);
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
  assert.equal(get("estWaitTimeRow").style.display, "");
});

test("ticket hides expected wait for Dine-In, including service overrides, but not other modes", () => {
  const ticketHtml = readFileSync(new URL("./templates/queue-ticket.html", import.meta.url), "utf8");
  const start = ticketHtml.indexOf("var hideWait =");
  const end = ticketHtml.indexOf(";", ticketHtml.indexOf("document.getElementById('est-wait-field').style.display =", start)) + 1;
  assert.ok(start >= 0 && end > start);
  for (const [mode, flag, expected] of [
    ["dine_in", undefined, "none"], ["dinein", undefined, "none"],
    ["fifo", true, "none"], ["dine_in", false, ""],
    ["fifo", false, ""], ["takeaway", false, ""],
  ]) {
    const field = { style: { display: "" } };
    runInNewContext(ticketHtml.slice(start, end), {
      mode, data: { hideExpectedWait: flag },
      document: { getElementById: () => field },
    });
    assert.equal(field.style.display, expected);
  }
});

test("Dine-In removes banner and live-view wait estimates while keeping queue position", () => {
  const ticketHtml = readFileSync(new URL("./templates/queue-ticket.html", import.meta.url), "utf8");
  const stripStart = ticketHtml.indexOf("var strip  =");
  const stripEnd = ticketHtml.indexOf("// Instruction text", stripStart);
  const liveStart = ticketHtml.indexOf("var wb =");
  const liveEndMarker = "wb.style.display = 'none';\n      }";
  const liveEnd = ticketHtml.indexOf(liveEndMarker, liveStart) + liveEndMarker.length;
  assert.ok(stripStart >= 0 && stripEnd > stripStart && liveStart >= 0 && liveEnd > liveStart);
  for (const hideWait of [true, false]) {
    const elements: Record<string, any> = {};
    const getElementById = (id: string) =>
      elements[id] ??= { style: {}, innerHTML: "", textContent: "" };
    runInNewContext(ticketHtml.slice(stripStart, stripEnd) + ticketHtml.slice(liveStart, liveEnd), {
      hideWait, wait: 15, pos: 2, status: "waiting", data: { waitingAhead: 1 },
      document: { getElementById },
    });
    assert.match(elements["position-strip"].innerHTML, /party ahead of you/);
    assert.equal(elements["wait-num"].textContent, "2nd");
    if (hideWait) {
      assert.doesNotMatch(elements["position-strip"].innerHTML, /min wait/);
      assert.equal(elements["wait-sub"].textContent, "in queue");
    } else {
      assert.match(elements["position-strip"].innerHTML, /15 min wait/);
      assert.match(elements["wait-sub"].textContent, /15 min wait/);
    }
  }
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