import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function parse(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
const screen = parse("./OrgQueueScreen.tsx");
const context = parse("../../contexts/OrganizationContext.tsx");

function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(root)) return root;
  let match: ts.Node | undefined;
  ts.forEachChild(root, node => { match ??= find(node, predicate); });
  return match;
}
function arrow(source: ts.SourceFile, name: string) {
  const declaration = find(source, node =>
    ts.isVariableDeclaration(node) && node.name.getText(source) === name) as ts.VariableDeclaration;
  const initializer = declaration.initializer!;
  return ts.isCallExpression(initializer) ? initializer.arguments[0] : initializer;
}
function evaluate(node: ts.Node, source: ts.SourceFile, values: Record<string, unknown>) {
  const js = ts.transpileModule(`const result = ${node.getText(source)}; result;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(js, values);
}
function attribute(node: ts.JsxOpeningElement, name: string) {
  return node.attributes.properties.find(attr =>
    ts.isJsxAttribute(attr) && attr.name.getText(screen) === name) as ts.JsxAttribute;
}
const holdButton = find(screen, node => ts.isJsxOpeningElement(node)
  && attribute(node, "testID")?.initializer?.getText(screen) === '"button-popup-hold"') as ts.JsxOpeningElement;
const customer = { id: "ticket", branchId: "own-branch", customerName: "Test Customer" };

test("Hold menu button is Dine-In only, directly after Edit, with identical outlined styling", () => {
  let parent: ts.Node | undefined = holdButton;
  while (parent && !(ts.isIfStatement(parent) && parent.expression.getText(screen) === "isDineInMode")) {
    parent = parent.parent;
  }
  assert.ok(parent);
  const card = holdButton.parent.parent as ts.JsxElement;
  const buttons = card.children.filter(ts.isJsxElement);
  const holdIndex = buttons.findIndex(node => node.openingElement === holdButton);
  const editButton = buttons[holdIndex - 1].openingElement;
  assert.equal(attribute(editButton, "testID").initializer?.getText(screen), '"button-popup-edit"');
  assert.equal(attribute(holdButton, "style").initializer?.getText(screen),
    attribute(editButton, "style").initializer?.getText(screen));
  assert.ok(holdButton.parent.getText(screen).includes('name="pause-circle"'));
});

test("menu closes before invoking the existing Hold handler for the selected ticket", () => {
  const calls: unknown[][] = [];
  const onPress = (attribute(holdButton, "onPress").initializer as ts.JsxExpression).expression!;
  const press = evaluate(onPress, screen, {
    morePopupCustomer: customer,
    setMorePopupCustomer: (value: unknown) => calls.push(["close", value]),
    handleHoldCustomer: (id: string) => calls.push(["hold", id]),
  });
  press();
  assert.deepEqual(calls, [["close", null], ["hold", customer.id]]);
});

function sharedHold(apiRequest: (...args: unknown[]) => Promise<unknown>) {
  const refreshes: string[] = [];
  const logged: unknown[] = [];
  const hold = evaluate(arrow(context, "holdCustomer"), context, {
    apiRequest, queue: [customer], branches: [{ id: "different-branch" }],
    refreshQueueForBranch: async (id: string) => { refreshes.push(id); },
    logHandledError: (...args: unknown[]) => logged.push(args),
  });
  return { hold, refreshes, logged };
}

test("shared Hold reports success and refreshes the customer's branch through the existing path", async () => {
  const requests: unknown[][] = [];
  const { hold, refreshes } = sharedHold(async (...args) => { requests.push(args); });
  assert.equal((await hold(customer.id)).success, true);
  assert.deepEqual(requests, [["POST", "/api/tickets/ticket/hold"]]);
  assert.deepEqual(refreshes, ["own-branch"]);
});

test("shared Hold returns failure without throwing, refreshing or optimistically changing the queue", async () => {
  const { hold, refreshes, logged } = sharedHold(async () => { throw new Error("Rejected"); });
  const result = await hold(customer.id);
  assert.equal(result.success, false);
  assert.equal(result.error, "Could not place customer on hold. Please try again.");
  assert.deepEqual(refreshes, []);
  assert.equal(logged.length, 1);
  assert.ok(!arrow(context, "holdCustomer").getText(context).includes("setQueue"));
});

function handler(holdCustomer: (id: string) => Promise<{ success: boolean; error?: string }>) {
  const toasts: unknown[][] = [];
  const alerts: unknown[][] = [];
  const holdingCustomerIdsRef = { current: new Set<string>() };
  const hold = evaluate(arrow(screen, "handleHoldCustomer"), screen, {
    holdCustomer, holdingCustomerIdsRef, queue: [customer],
    Haptics: { impactAsync: () => {}, ImpactFeedbackStyle: { Medium: "medium" } },
    showToast: (...args: unknown[]) => toasts.push(args),
    Alert: { alert: (...args: unknown[]) => alerts.push(args) },
  });
  return { hold, toasts, alerts, holdingCustomerIdsRef };
}

test("Queue Hold shows its existing success toast only after success", async () => {
  const { hold, toasts, alerts } = handler(async () => ({ success: true }));
  await hold(customer.id);
  assert.deepEqual(toasts, [["On Hold", "Test Customer has been placed on hold."]]);
  assert.deepEqual(alerts, []);
});

test("Queue Hold failure displays a native error, not a success toast, and permits retry", async () => {
  const { hold, toasts, alerts, holdingCustomerIdsRef } = handler(async () => ({ success: false }));
  await hold(customer.id);
  assert.deepEqual(toasts, []);
  assert.deepEqual(alerts, [["Error", "Could not place customer on hold. Please try again."]]);
  assert.equal(holdingCustomerIdsRef.current.size, 0);
});

test("rapid duplicate Holds share one request and unlock after completion", async () => {
  let finish!: (result: { success: boolean }) => void;
  let requests = 0;
  const pending = new Promise<{ success: boolean }>(resolve => { finish = resolve; });
  const { hold, toasts, holdingCustomerIdsRef } = handler(async () => { requests++; return pending; });
  const first = hold(customer.id);
  await hold(customer.id);
  assert.equal(requests, 1);
  assert.equal(toasts.length, 0);
  finish({ success: true });
  await first;
  assert.equal(toasts.length, 1);
  assert.equal(holdingCustomerIdsRef.current.size, 0);
  await hold(customer.id);
  assert.equal(requests, 2);
});
