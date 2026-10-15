import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./QueueSearchBar.tsx", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
type Element = { type: string; props: Record<string, any>; children: Element[] };

function render(compact: boolean, value: string, open = true) {
  const changes: string[] = [];
  let focusCalls = 0;
  let dismissCalls = 0;
  const ref = { current: { focus: () => { focusCalls++; } } };
  const createElement = (type: string, props: Record<string, any>, ...children: any[]) =>
    ({ type, props: props || {}, children: children.flat().filter(Boolean) });
  const react = { createElement, Fragment: "Fragment",
    useState: () => [open, () => {}], useRef: () => ref };
  const native = { View: "View", Pressable: "Pressable", TextInput: "TextInput",
    Keyboard: { dismiss: () => { dismissCalls++; } },
    StyleSheet: { create: (styles: unknown) => styles } };
  const exports: Record<string, any> = {};
  runInNewContext(js, { exports, require: (name: string) => {
    if (name === "react") return { ...react, default: react };
    if (name === "react-native") return native;
    if (name === "@expo/vector-icons") return { Feather: "Feather" };
    if (name.endsWith("ThemedText")) return { ThemedText: "Text" };
    if (name.endsWith("useTheme")) return { useTheme: () => ({ theme: {} }) };
    throw new Error(`Unexpected dependency: ${name}`);
  } });
  const root = exports.QueueSearchBar({ compact, value, onChange: (next: string) => changes.push(next) });
  const nodes: Element[] = [];
  function visit(node: any) {
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    node.children?.forEach(visit);
  }
  visit(root);
  return { nodes, changes, focused: () => focusCalls, dismissed: () => dismissCalls };
}

test("compact text search has exactly one plain clear icon and no close control", () => {
  const { nodes } = render(true, "tdx");
  const controls = nodes.filter(n => n.type === "Pressable");
  assert.equal(controls.length, 1);
  assert.equal(controls[0].props.accessibilityLabel, "Clear search");
  assert.equal(controls[0].children[0].props.name, "x");
  assert.equal(nodes.some(n => n.props.name === "x-circle"), false);
  assert.equal(nodes.find(n => n.type === "TextInput")!.props.clearButtonMode, "never");
});

test("compact clear resets the filter and retains input focus without dismissing the keyboard", () => {
  const result = render(true, "tdx");
  const clear = result.nodes.find(n => n.props.accessibilityLabel === "Clear search")!;
  clear.props.onPress();
  assert.deepEqual(result.changes, [""]);
  assert.equal(result.focused(), 1);
  assert.equal(result.dismissed(), 0);
});

test("empty compact search has no clear or close icon", () => {
  const { nodes } = render(true, "");
  assert.equal(nodes.filter(n => n.type === "Pressable").length, 0);
  assert.equal(nodes.some(n => ["x", "x-circle"].includes(n.props.name)), false);
});

test("compact clear target is 36 by 36 and separate from the flexible input", () => {
  const { nodes } = render(true, "tdx");
  const clear = nodes.find(n => n.props.accessibilityLabel === "Clear search")!;
  assert.equal(clear.props.style.width, 36);
  assert.equal(clear.props.style.height, 36);
  const input = nodes.find(n => n.type === "TextInput")!;
  assert.equal(input.props.style[0].flex, 1);
});

test("noncompact modes keep their circled clear button and existing close behavior", () => {
  const result = render(false, "tdx");
  const clear = result.nodes.find(n => n.props.accessibilityLabel === "Clear search")!;
  assert.equal(clear.children[0].props.name, "x-circle");
  assert.equal(clear.props.style, undefined);
  clear.props.onPress();
  assert.deepEqual(result.changes, [""]);
  assert.equal(result.focused(), 0);
  const close = result.nodes.find(n => n.props.accessibilityLabel === "Close queue search")!;
  close.props.onPress();
  assert.equal(result.dismissed(), 1);
});
