import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = ts.createSourceFile("OrgQueueScreen.tsx",
  readFileSync(new URL("./OrgQueueScreen.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node | undefined {
  if (predicate(root)) return root;
  let result: ts.Node | undefined;
  ts.forEachChild(root, node => { result ??= find(node, predicate); });
  return result;
}
function evaluate(node: ts.Node, context: Record<string, unknown>) {
  const js = ts.transpileModule(`const result = ${node.getText(source)}; result;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(js, { ...context });
}
function helper(name: string) {
  const declaration = find(source, node => ts.isVariableDeclaration(node)
    && node.name.getText(source) === name) as ts.VariableDeclaration;
  return evaluate(declaration.initializer!, {});
}
const storedTable = helper("getStoredTableNumber");
const doneStatus = helper("getDoneStatus");
type Element = { type: string; props: Record<string, any>; children: any[] };
const createElement = (type: string, props: Record<string, any>, ...children: any[]): Element =>
  ({ type, props: props || {}, children: children.flat() });
const styles = new Proxy({}, { get: (_, key) => String(key) });
const baseCustomer = {
  id: "ticket", customerName: "A very long customer name used for display checks",
  ticketNumber: "S001", joinedAt: "2026-10-14T10:00:00Z",
  holdAt: "2026-10-14T10:02:00Z", arrivedAt: "2026-10-14T10:03:00Z",
};
const renderContext = {
  React: { createElement }, View: "View", ThemedText: "ThemedText",
  Feather: "Feather", MaterialCommunityIcons: "MaterialCommunityIcons", Pressable: "Pressable",
  styles, colors: { primary: "#9C1A5B", text: "#111", textSecondary: "#666" }, isDark: false,
  getDineInCardData: () => ({ partySize: 2 }),
  getStoredTableNumber: storedTable, getDoneStatus: doneStatus, formatTime: () => "9:05 PM",
};
function render(tab: "hold" | "done", tableNumber: unknown): Element {
  const conditional = find(source, node => ts.isConditionalExpression(node)
    && node.condition.getText(source) === `dineInTab === "${tab}"`
    && ts.isCallExpression(node.whenTrue)) as ts.ConditionalExpression;
  const map = conditional.whenTrue as ts.CallExpression;
  const callback = evaluate(map.arguments[0], renderContext);
  return callback({ ...baseCustomer, tableNumber, status: tab === "hold" ? "hold" : "arrived" });
}
function nodes(root: Element, predicate: (element: Element) => boolean): Element[] {
  return [predicate(root) ? root : null, ...root.children
    .filter(child => child && typeof child === "object" && "type" in child)
    .flatMap(child => nodes(child, predicate))].filter(Boolean) as Element[];
}
const hasStyle = (element: Element, name: string) =>
  [element.props.style].flat().includes(name);
const badges = (root: Element) => nodes(root, node => hasStyle(node, "diTablePill"));
const label = (root: Element) => nodes(root, node => hasStyle(node, "diTablePillText"))[0]
  .children.filter(child => typeof child === "string").join("").replace(/\s+/g, " ").trim();

test("On Hold and Seated cards render the received table on the info column's second line", () => {
  for (const tab of ["hold", "done"] as const) {
    const root = render(tab, "6");
    assert.equal(badges(root).length, 1);
    const meta = nodes(root, node => hasStyle(node, "diCardMeta"))[0];
    const children = meta.children.filter(child => child && typeof child === "object");
    assert.ok(hasStyle(children[0], "diNameRow"));
    assert.ok(hasStyle(children[1], "diTableInfoLine"));
    assert.equal(nodes(children[1], node => hasStyle(node, "diTablePill"))[0], badges(root)[0]);
    assert.equal(label(root), "Table 6");
  }
});

test("new assignment replaces the displayed table; cleared Resume data never reuses a stale table", () => {
  assert.equal(label(render("hold", "6")), "Table 6");
  assert.equal(badges(render("hold", null)).length, 0);
  assert.equal(label(render("hold", "9")), "Table 9");
  assert.equal(badges(render("hold", undefined)).length, 0);
});

test("missing, blank and placeholder values render no badge or table label", () => {
  for (const tab of ["hold", "done"] as const) {
    for (const value of [undefined, null, "", "  ", "-", "null", " NULL ", "undefined", 0, false, {}]) {
      const root = render(tab, value);
      assert.equal(badges(root).length, 0);
      assert.equal(nodes(root, node => hasStyle(node, "diTablePillText")).length, 0);
    }
  }
});

test("valid table labels are trimmed and taken only from the received tableNumber", () => {
  assert.equal(storedTable({ tableNumber: " 6 " }), "6");
  assert.equal(storedTable({ tableNumber: "A-12" }), "A-12");
  assert.equal(storedTable({ tableNumber: "0" }), "0");
  assert.equal(storedTable({ tableNumber: null, formData: { tableNumber: "6" },
    stageHistory: [{ tableNumber: "6" }] }), null);
});

test("new badges reuse Assigned badge styles, furniture icon and wording", () => {
  const assigned = find(source, node => ts.isJsxElement(node)
    && node.openingElement.attributes.properties.some(attr => ts.isJsxAttribute(attr)
      && attr.name.getText(source) === "style"
      && attr.initializer?.getText(source).includes("styles.diTablePill,")))!;
  const original = evaluate(assigned, { ...renderContext, customer: { tableNumber: "6" } }) as Element;
  for (const tab of ["hold", "done"] as const) {
    const root = render(tab, "6");
    const badge = badges(root)[0];
    for (const style of [original.props.style].flat()) assert.ok(hasStyle(badge, style));
    assert.equal(JSON.stringify(nodes(badge, node => node.type === "MaterialCommunityIcons")[0].props),
      JSON.stringify(nodes(original, node => node.type === "MaterialCommunityIcons")[0].props));
    assert.equal(JSON.stringify(nodes(badge, node => hasStyle(node, "diTablePillText"))[0].props.style),
      JSON.stringify(nodes(original, node => hasStyle(node, "diTablePillText"))[0].props.style));
    assert.equal(label(root), label(original));
  }
});

test("layout guards are confined to cards with a badge and constrain text without adding a row", () => {
  for (const tab of ["hold", "done"] as const) {
    const withBadge = render(tab, "6");
    assert.ok(nodes(withBadge, node => hasStyle(node, "diTableCardRow")).length > 0);
    assert.ok(nodes(withBadge, node => hasStyle(node, "diTableCardShrink")).length > 0);
    assert.equal(nodes(render(tab, null), node =>
      hasStyle(node, "diTableCardRow") || hasStyle(node, "diTableCardShrink")).length, 0);
    for (const name of nodes(withBadge, node => hasStyle(node, "diCustomerName"))) {
      assert.equal(name.props.numberOfLines, 1);
    }
  }
  const row = find(source, node => ts.isPropertyAssignment(node)
    && node.name.getText(source) === "diTableCardRow") as ts.PropertyAssignment;
  const shrink = find(source, node => ts.isPropertyAssignment(node)
    && node.name.getText(source) === "diTableCardShrink") as ts.PropertyAssignment;
  assert.equal(evaluate(row.initializer, {}).flexWrap, "nowrap");
  assert.equal(evaluate(shrink.initializer, {}).minWidth, 0);
  assert.equal(evaluate(shrink.initializer, {}).flexShrink, 1);
});

test("the table display helper and both calls remain inside the Dine-In branch", () => {
  const references: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === "getStoredTableNumber") references.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(references.length, 3);
  for (const reference of references) {
    let parent: ts.Node | undefined = reference;
    while (parent && !(ts.isIfStatement(parent)
      && parent.expression.getText(source) === "isDineInMode")) parent = parent.parent;
    assert.ok(parent);
  }
});
