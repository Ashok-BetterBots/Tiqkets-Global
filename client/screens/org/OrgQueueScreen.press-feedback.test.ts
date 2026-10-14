import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile(
  "OrgQueueScreen.tsx",
  readFileSync(new URL("./OrgQueueScreen.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);

const customer = { id: "test-ticket" };
const expectedActions: Record<string, string> = {
  "button-assign-table-test-ticket": "handleOpenTableAllocation",
  "button-more-test-ticket": "setMorePopupCustomer",
  "button-hold-test-ticket": "handleHoldCustomer",
  "button-call-again-test-ticket": "handleDineInCallAgain",
  "button-seated-test-ticket": "handleMarkArrived",
  "button-walkin-hold-test-ticket": "handleWalkIn",
  "button-resume-test-ticket": "handleResumeCustomer",
  "button-popup-walkin": "handleWalkIn",
  "button-popup-edit": "handleOpenEdit",
  "button-popup-hold": "handleHoldCustomer",
};

function evaluate(expression: string, context: Record<string, unknown> = {}) {
  const js = ts.transpileModule(`const result = ${expression}; result;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(js, context);
}

const buttons = new Map<string, { style: string; onPress: string }>();
let pressedStyle: any;
function visit(node: ts.Node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(source) === "diActionPressed") {
    pressedStyle = evaluate(node.initializer.getText(source));
  }
  if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "Pressable") {
    const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
    const attr = (name: string) => {
      const init = attrs.find(a => a.name.getText(source) === name)?.initializer;
      return init && ts.isJsxExpression(init) ? init.expression?.getText(source) : init?.getText(source);
    };
    const style = attr("style");
    if (style?.includes("styles.diActionPressed")) {
      const id = evaluate(attr("testID")!, { customer });
      buttons.set(id, { style, onPress: attr("onPress")! });
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);

test("pressed feedback is limited to the ten Dine-In transaction and More-menu buttons", () => {
  assert.deepEqual([...buttons.keys()].sort(), Object.keys(expectedActions).sort());
});

test("every transaction button visibly presses in and returns to its original style on release", () => {
  for (const dark of [false, true]) {
    const styles = new Proxy({ diActionPressed: pressedStyle } as Record<string, unknown>, {
      get: (target, name: string) => target[name] ?? { baseStyle: name },
    });
    const colors = { primary: dark ? "#dd83bf" : "#8c1867", primaryDark: dark ? "#772d62" : "#64104a" };
    for (const { style } of buttons.values()) {
      const callback = evaluate(style, { styles, colors });
      const released = callback({ pressed: false }).filter(Boolean);
      const pressed = callback({ pressed: true }).filter(Boolean);
      assert.deepEqual(pressed.slice(0, -1), released);
      const feedback = pressed.at(-1);
      assert.ok(feedback.opacity > 0 && feedback.opacity < 1);
      assert.ok(feedback.transform[0].scale > 0.9 && feedback.transform[0].scale < 1);
      assert.equal(released.includes(feedback), false);
      assert.deepEqual(callback({ pressed: false }).filter(Boolean), released);
    }
  }
});

test("the existing transaction callbacks still receive the same ticket, exactly once", () => {
  for (const [id, { onPress }] of buttons) {
    const calls: { name: string; value: unknown }[] = [];
    const context: Record<string, unknown> = { customer, morePopupCustomer: customer };
    for (const name of new Set(Object.values(expectedActions))) {
      context[name] = (value: unknown) => calls.push({ name, value });
    }
    evaluate(onPress, context)();
    const actionCalls = calls.filter(call => call.name === expectedActions[id]);
    assert.equal(actionCalls.length, 1, id);
    const receivesCustomer = ["handleOpenTableAllocation", "setMorePopupCustomer", "handleOpenEdit"].includes(expectedActions[id]);
    assert.equal(actionCalls[0].value, receivesCustomer ? customer : customer.id, id);
    if (id === "button-popup-walkin" || id === "button-popup-hold") {
      assert.equal(calls[0].name, "setMorePopupCustomer");
      assert.equal(calls[0].value, null);
    }
  }
});