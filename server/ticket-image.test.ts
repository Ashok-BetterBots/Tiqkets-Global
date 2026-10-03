import assert from "node:assert/strict";
import test from "node:test";
import {
  getCachedQueueTicketImage,
  preRenderAndCacheQueueTicketImage,
} from "./ticket-image";

test("queue ticket image pre-render coalesces concurrent misses and caches the result", async () => {
  let renderCalls = 0;
  let releaseRender!: (buffer: Buffer) => void;
  const renderResult = new Promise<Buffer>((resolve) => {
    releaseRender = resolve;
  });
  const mockPng = Buffer.from("mock queue ticket PNG");
  const mockRenderer = async () => {
    renderCalls += 1;
    return renderResult;
  };

  const first = preRenderAndCacheQueueTicketImage("mock-coalesced-ticket", mockRenderer);
  const second = preRenderAndCacheQueueTicketImage("mock-coalesced-ticket", mockRenderer);

  assert.equal(renderCalls, 1);
  releaseRender(mockPng);

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.strictEqual(firstResult, mockPng);
  assert.strictEqual(secondResult, mockPng);
  assert.strictEqual(getCachedQueueTicketImage("mock-coalesced-ticket"), mockPng);
  assert.strictEqual(
    await preRenderAndCacheQueueTicketImage("mock-coalesced-ticket", async () => {
      assert.fail("a cached queue ticket should not be rendered again");
    }),
    mockPng,
  );
});

test("a failed queue ticket render clears its in-flight entry so a later request can retry", async () => {
  let renderCalls = 0;
  await assert.rejects(
    preRenderAndCacheQueueTicketImage("mock-retry-ticket", async () => {
      renderCalls += 1;
      throw new Error("mock render failure");
    }),
    /mock render failure/,
  );

  const mockPng = Buffer.from("mock retry PNG");
  const result = await preRenderAndCacheQueueTicketImage("mock-retry-ticket", async () => {
    renderCalls += 1;
    return mockPng;
  });

  assert.equal(renderCalls, 2);
  assert.strictEqual(result, mockPng);
});

test("dine-in images are automatically deleted at 24 hours without another request", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalNow = Date.now;
  Date.now = () => 1000;
  try {
    const image = Buffer.from("dine-in image");
    await preRenderAndCacheQueueTicketImage("mock-dine-in-expiry", async () => image, { deleteAfterDay: true });
    t.mock.timers.tick(24 * 60 * 60 * 1000 - 1);
    assert.strictEqual(getCachedQueueTicketImage("mock-dine-in-expiry"), image);
    t.mock.timers.tick(1);
    // The clock is still at creation time: only the timer, not a cache read,
    // could have removed the entry.
    assert.equal(getCachedQueueTicketImage("mock-dine-in-expiry"), null);
  } finally {
    Date.now = originalNow;
    t.mock.timers.reset();
  }
});

test("serving a cached dine-in image does not extend its original retention", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    const image = Buffer.from("dine-in cached image");
    await preRenderAndCacheQueueTicketImage("mock-dine-in-original-expiry", async () => image);
    now += 5 * 60 * 60 * 1000;
    await preRenderAndCacheQueueTicketImage("mock-dine-in-original-expiry", undefined, { deleteAfterDay: true });
    t.mock.timers.tick(19 * 60 * 60 * 1000);
    assert.equal(getCachedQueueTicketImage("mock-dine-in-original-expiry"), null);
  } finally {
    Date.now = originalNow;
    t.mock.timers.reset();
  }
});