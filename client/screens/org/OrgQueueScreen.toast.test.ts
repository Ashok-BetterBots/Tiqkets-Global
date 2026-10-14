import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = ts.createSourceFile(
  "OrgQueueScreen.tsx",
  readFileSync(new URL("./OrgQueueScreen.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

const calls: { handler: string; name: string; node: ts.CallExpression }[] = [];
const handlers = new Map<string, ts.ArrowFunction>();
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) {
    handlers.set(node.name.getText(source), node.initializer);
  }
  if (ts.isCallExpression(node)) {
    let parent: ts.Node | undefined = node.parent;
    let handler = "";
    while (parent) {
      if (ts.isVariableDeclaration(parent) && parent.initializer && ts.isArrowFunction(parent.initializer)) {
        handler = parent.name.getText(source);
        break;
      }
      parent = parent.parent;
    }
    calls.push({ handler, name: node.expression.getText(source), node });
  }
  ts.forEachChild(node, visit);
}
visit(source);

const text = (node: ts.Node) => node.getText(source).replace(/\s+/g, " ");
const successMessages: [string, string, string][] = [
  ["handleCallNext", '"No Customers"', '"There are no customers waiting in the queue."'],
  ["handleCompleteAllActive", '"Done"', 'n > 0 ? `${n} customer${n === 1 ? "" : "s"} moved to completed.` : "No active customers to complete."'],
  ["handleCallAgain", '"Called Again"', '"Notification sent to customer"'],
  ["handleSkip", '"No Show"', '"Customer marked as No Show after 3 skips. Notification sent."'],
  ["handleSkip", '"Skipped"', '"Customer moved back in queue. Notification sent."'],
  ["handleCheckIn", '"Check-In Successful"', '`${result.customer.customerName} (${result.customer.ticketNumber}) has been checked in.`'],
  ["handleCreateCounterOrder", '"Order Created"', '`Order ${newOrderId.trim()} created for ${customerName}`'],
  ["handleCheckInReservation", '"Checked In"', '`${result.customer?.customerName || "Customer"} has been checked in and moved to Waiting.`'],
  ["handleCheckInApiReservation", '"Checked In"', '`${customerName} has been checked in and added to the waiting queue.`'],
  ["handleManualRegistration", '"Customer Registered"', '`${result.customer?.customerName} has been added to the queue.\\n\\nTicket: ${result.customer?.ticketNumber}`'],
  ["handleAllocateTable", '"Table Allocated"', '`Table ${tableNumberInput.trim()} has been allocated to ${selectedCustomerForTable.customerName}. Notification sent to customer.`'],
  ["handleDineInCallAgain", '"Customer Notified"', '`Reminder sent to ${customer?.customerName || "customer"}. (Called ${callNum} time${callNum > 1 ? "s" : ""})`'],
  ["handleHoldCustomer", '"On Hold"', '`${customer?.customerName || "Customer"} has been placed on hold.`'],
  ["handleResumeCustomer", '"Resumed"', '`${customer?.customerName || "Customer"} has been moved back to the waiting queue with their original position.`'],
  ["handleMarkArrived", '"Arrived"', '`${result.customer?.customerName || "Customer"} has been marked as arrived at table ${result.customer?.tableNumber || ""}.`'],
  ["handleWalkIn", '"Walk In"', '`${customer?.customerName || "Customer"} has been marked as walked in.`'],
];

for (const [handler, title, message] of successMessages) {
  test(`${handler}: preserves the original success title and message`, () => {
    const matches = calls.filter((call) =>
      call.handler === handler && call.name === "showToast" && text(call.node.arguments[0]) === title);
    assert.equal(matches.length, 1);
    assert.equal(text(matches[0].node.arguments[1]), message);
    // No OK callback, new navigation, or action function passed to the helper.
    assert.ok(matches[0].node.arguments.length <= 3);
    if (matches[0].node.arguments.length === 3) {
      assert.equal(text(matches[0].node.arguments[2]), '"info"');
    }
  });
}

test("exactly 16 conversions, with 34 error/validation alerts and 3 decision alerts remaining", () => {
  assert.equal(calls.filter((call) => call.name === "showToast").length, 16);
  const remaining = calls.filter((call) => call.name === "Alert.alert");
  assert.equal(remaining.length, 37);
  assert.equal(remaining.filter((call) => call.node.arguments.length === 2).length, 34);
  assert.deepEqual(
    remaining.filter((call) => call.node.arguments.length === 3).map((call) => call.handler),
    ["handleSkip", "handleNoShow", "handleDineInSkip"],
  );
});

test("confirmation button labels, API decisions, and destructive styles remain", () => {
  for (const handler of ["handleSkip", "handleNoShow", "handleDineInSkip"]) {
    const dialog = calls.find((call) => call.name === "Alert.alert" && call.handler === handler)!;
    const buttons = text(dialog.node.arguments[2]);
    assert.ok(buttons.includes('{ text: "Cancel", style: "cancel" }'));
    if (handler === "handleNoShow") {
      assert.ok(buttons.includes('text: "Yes, No Show"'));
      assert.ok(buttons.includes("await markAsNoShow(customerId)"));
    } else {
      assert.ok(buttons.includes('text: isLastSkip ? "Mark No Show" : "Skip"'));
      assert.ok(buttons.includes("await skipCustomer(customerId)"));
    }
    assert.ok(buttons.includes('"destructive"'));
  }
});

test("form closure, refresh, and tab updates keep their existing order", () => {
  const ordered: Record<string, string[]> = {
    handleManualRegistration: ["await addManualCustomer(", "showToast(", "setShowManualRegistrationModal(false)", "setManualRegistrationFormData({})", "refreshQueueForBranch(currentBranchId)"],
    handleAllocateTable: ["await allocateTable(", "showToast(", "setShowTableAllocationModal(false)", "setSelectedCustomerForTable(null)", 'setTableNumberInput("")'],
    handleCreateCounterOrder: ["await addCounterOrder(", "showToast(", "setCounterOrderCount(", 'setNewOrderId("")', "setShowNewOrderModal(false)"],
    handleResumeCustomer: ["await resumeCustomer(", 'setDineInTab("waiting")', "showToast("],
    handleCompleteAllActive: ["await apiRequest(", "setShowCompleteAllModal(false)", "refreshQueueForBranch(currentBranchId)", "showToast("],
    handleCheckIn: ["await checkInCustomer(", "setLastCheckIn(", 'setTicketInput("")', "showToast("],
  };
  for (const [handler, sequence] of Object.entries(ordered)) {
    const body = handlers.get(handler)!.getText(source);
    let position = -1;
    for (const operation of sequence) {
      const next = body.indexOf(operation, position + 1);
      assert.ok(next > position, `${handler}: missing/out-of-order ${operation}`);
      position = next;
    }
  }
});

test("native Queue modals use the shared host; the edit sheet opts in explicitly", () => {
  const body = source.text;
  assert.ok(body.includes('import { QueueToastModal as Modal }'));
  assert.ok(/<BottomSheetModal\s+visible=\{editCustomer !== null\}\s+queueToastHost/.test(body));
  const sheet = readFileSync(new URL("../../components/BottomSheetModal.tsx", import.meta.url), "utf8");
  assert.ok(sheet.includes("queueToastHost = false"));
  assert.ok(sheet.includes("queueToastHost ? QueueToastModal : Modal"));
});

test("the app has one toast controller mount; renderer is touch-transparent and silent", () => {
  const app = readFileSync(new URL("../../App.tsx", import.meta.url), "utf8");
  assert.equal((app.match(/<AppToastProvider>/g) || []).length, 1);
  const toast = readFileSync(new URL("../../components/Toast.tsx", import.meta.url), "utf8");
  assert.ok(toast.includes('pointerEvents="none"'));
  assert.ok(toast.includes("top: insets.top + Spacing.sm"));
  assert.ok(toast.includes("announceForAccessibilityWithOptions"));
  assert.ok(toast.includes("announceForAccessibility(text)"));
  assert.ok(toast.includes("reduceMotionChanged"));
  assert.ok(!/Haptics|expo-audio|expo-av|playSuccessTone|playErrorTone|expo-speech/.test(toast));
});
