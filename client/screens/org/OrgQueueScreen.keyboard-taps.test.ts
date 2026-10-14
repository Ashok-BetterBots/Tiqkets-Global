import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile(
  "OrgQueueScreen.tsx",
  readFileSync("client/screens/org/OrgQueueScreen.tsx", "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(root)) return root;
  let result: ts.Node | undefined;
  ts.forEachChild(root, child => { result ??= find(child, predicate); });
  return result;
}
const renderField = find(source, node => ts.isVariableDeclaration(node)
  && node.name.getText(source) === "renderField"
  && node.getText(source).includes("setManualRegistrationFormData")) as ts.VariableDeclaration;
const sheet = find(source, node => ts.isJsxElement(node)
  && node.openingElement.tagName.getText(source) === "Modal"
  && node.openingElement.getText(source).includes("showManualRegistrationModal")) as ts.JsxElement;

test("Add Customer keeps handled taps in both outer and nested options scroll areas", () => {
  const scrolls: ts.JsxOpeningElement[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "ScrollView") scrolls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sheet);
  assert.equal(scrolls.length, 2);
  for (const scroll of scrolls) {
    assert.match(scroll.getText(source), /keyboardShouldPersistTaps="handled"/);
  }
});

test("Each Gender option's existing press handler selects it and preserves other form values", () => {
  let form: Record<string, unknown> = { gender: "", partySize: 3, shareTable: true };
  type Element = { type: string; props: any; children: any[] };
  const createElement = (type: string, props: any, ...children: any[]): Element =>
    ({ type, props: props ?? {}, children: children.flat() });
  const js = ts.transpileModule(`(${renderField.initializer!.getText(source)})`, {
    compilerOptions: { jsx: ts.JsxEmit.React },
  }).outputText;
  const render = runInNewContext(js, {
    React: { createElement }, View: "View", ScrollView: "ScrollView",
    Pressable: "Pressable", ThemedText: "ThemedText",
    styles: {}, colors: {}, dynTextFields: [],
    manualRegistrationFormData: form,
    setManualRegistrationFormData: (update: (previous: typeof form) => typeof form) => { form = update(form); },
  });
  const options = ["Men only", "Women only", "Men & Women"];
  const root: Element = render({ id: "gender", label: "Gender", type: "select", required: true, options });
  const scroll = root.children.find(child => child?.type === "ScrollView");
  assert.equal(scroll.props.keyboardShouldPersistTaps, "handled");
  const buttons = scroll.children[0].children;
  assert.equal(buttons.length, 3);
  for (let index = 0; index < options.length; index++) {
    buttons[index].props.onPress();
    assert.deepEqual({ ...form }, { gender: options[index], partySize: 3, shareTable: true });
  }
});

test("Edit Details retains its existing nested scroll behavior", () => {
  const edit = find(source, node => ts.isVariableDeclaration(node)
    && node.name.getText(source) === "renderEditField")!;
  const scroll = find(edit, node => ts.isJsxOpeningElement(node)
    && node.tagName.getText(source) === "ScrollView")!;
  assert.doesNotMatch(scroll.getText(source), /keyboardShouldPersistTaps/);
});
