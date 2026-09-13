import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { normalizePreprintedBackLayout, renderPreprintedBackOverlays } from "./events-routes";

describe("normalizePreprintedBackLayout", () => {
  const canvasAspectRatio = 203 / 82;
  const maxQrWidth = 100 / canvasAspectRatio;

  test("converts the legacy three-field layout without losing placement", () => {
    const layout = normalizePreprintedBackLayout({
      bookingId: { x: 21, y: 31, fontSize: 4.1 },
      qr: { x: 44, y: 54, size: 17 },
      serialNumber: { x: 72, y: 88, fontSize: 2.8 },
    });

    assert.equal(layout.version, 2);
    assert.equal(layout.elements.length, 3);
    assert.deepEqual(
      layout.elements.map(({ type, x, y, width, fontSize }) => ({ type, x, y, width, fontSize })),
      [
        { type: "bookingId", x: 21, y: 31, width: 26, fontSize: 4.1 },
        { type: "qr", x: 44, y: 54, width: 17, fontSize: 3 },
        { type: "serialNumber", x: 72, y: 88, width: 20, fontSize: 2.8 },
      ],
    );
  });

  test("preserves an intentionally empty v2 design", () => {
    assert.deepEqual(
      normalizePreprintedBackLayout({ version: 2, elements: [] }),
      { version: 2, elements: [] },
    );
  });

  test("uses the same width-aware bounds when converting legacy edge positions", () => {
    const layout = normalizePreprintedBackLayout({
      bookingId: { x: 99, y: 1, fontSize: 3 },
      qr: { x: 99, y: 1, size: 40 },
      serialNumber: { x: 1, y: 99, fontSize: 2 },
    });
    assert.deepEqual(
      layout.elements.map(({ type, x, y }) => ({ type, x, y })),
      [
        { type: "bookingId", x: 87, y: 3 },
        { type: "qr", x: 80, y: (40 * canvasAspectRatio) / 2 },
        { type: "serialNumber", x: 10, y: 97 },
      ],
    );
  });

  test("sanitizes element fields, bounds, IDs, and unsupported types", () => {
    const layout = normalizePreprintedBackLayout({
      version: 2,
      elements: [
        {
          id: "same-id",
          type: "qr",
          x: 999,
          y: -50,
          width: 99,
          fontSize: -4,
          color: "red;position:fixed",
          fontWeight: "900",
          textAlign: "justify",
          background: "yes",
          visible: false,
        },
        {
          id: "same-id",
          type: "amountPaid",
          x: -10,
          y: 150,
          width: 100,
          fontSize: 50,
          color: "#123ABC",
          fontWeight: "normal",
          textAlign: "right",
          background: false,
          visible: true,
        },
        { id: "ignored", type: "customHtml", x: 50, y: 50 },
      ],
    });

    assert.equal(layout.elements.length, 2);
    assert.equal(layout.elements[0].id, "same-id");
    assert.notEqual(layout.elements[1].id, "same-id");
    assert.deepEqual(
      {
        x: layout.elements[0].x,
        y: layout.elements[0].y,
        width: layout.elements[0].width,
        color: layout.elements[0].color,
        visible: layout.elements[0].visible,
      },
      { x: 100 - maxQrWidth / 2, y: 50, width: maxQrWidth, color: "#1a1a2e", visible: false },
    );
    assert.deepEqual(
      {
        x: layout.elements[1].x,
        y: layout.elements[1].y,
        width: layout.elements[1].width,
        fontSize: layout.elements[1].fontSize,
        color: layout.elements[1].color,
        fontWeight: layout.elements[1].fontWeight,
        textAlign: layout.elements[1].textAlign,
        background: layout.elements[1].background,
      },
      {
        x: 45,
        y: 97,
        width: 90,
        fontSize: 12,
        color: "#123ABC",
        fontWeight: "normal",
        textAlign: "right",
        background: false,
      },
    );
  });

  test("caps a saved design at forty elements", () => {
    const elements = Array.from({ length: 45 }, (_, index) => ({
      id: `booking-${index}`,
      type: "bookingId",
      x: 50,
      y: 50,
      width: 20,
      fontSize: 3,
      color: "#000000",
      fontWeight: "bold",
      textAlign: "center",
      background: true,
      visible: true,
    }));
    assert.equal(normalizePreprintedBackLayout({ version: 2, elements }).elements.length, 40);
  });

  test("renders real ticket values, duplicate fields, visibility, and escaped text", () => {
    const layout = normalizePreprintedBackLayout({
      version: 2,
      elements: [
        { id: "paid-1", type: "amountPaid", x: 30, y: 30, width: 30, fontSize: 3, fontFamily: "Georgia", color: "#112233", fontWeight: "bold", textAlign: "right", background: false, visible: true },
        { id: "paid-2", type: "amountPaid", x: 70, y: 30, width: 30, fontSize: 2, color: "#000000", fontWeight: "normal", textAlign: "left", background: true, visible: true },
        { id: "event-hidden", type: "eventName", x: 50, y: 50, width: 40, fontSize: 3, color: "#000000", fontWeight: "bold", textAlign: "center", background: true, visible: false },
        { id: "event-visible", type: "eventName", x: 50, y: 70, width: 40, fontSize: 3, color: "#000000", fontWeight: "bold", textAlign: "center", background: true, visible: true },
        { id: "qr-1", type: "qr", x: 50, y: 50, width: 18, fontSize: 3, color: "#000000", fontWeight: "normal", textAlign: "center", background: true, visible: true },
      ],
    });
    const html = renderPreprintedBackOverlays(layout, {
      bookingId: "PTK-ABC123",
      qrDataUrl: "data:image/png;base64,SAFE",
      serialNumber: "000042",
      amountPaid: 125000,
      eventName: 'Festival <script>alert("x")</script>',
    });

    assert.equal((html.match(/Amount Paid: ₹1,250/g) || []).length, 2);
    assert.equal(layout.elements[0].fontFamily, "Georgia");
    assert.equal(layout.elements[1].fontFamily, "monospace");
    assert.match(html, /font-family:Georgia, serif;/);
    assert.equal((html.match(/Festival/g) || []).length, 1);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /Festival &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.match(html, /class="overlay qr-overlay has-background"/);
    assert.match(html, /data:image\/png;base64,SAFE/);
  });
});