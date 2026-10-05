import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { getQueueModeForService } from "../client/utils/settingsHierarchy";

const mobileText = readFileSync(new URL("../client/screens/org/OrgBookingsScreen.tsx", import.meta.url), "utf8");
const mobile = ts.createSourceFile("OrgBookingsScreen.tsx", mobileText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const html = readFileSync(new URL("./templates/dashboard.html", import.meta.url), "utf8");
const webScript = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .find(match => match[1].includes("get currentQueueMode()"))?.[1];
assert.ok(webScript);
const web = ts.createSourceFile("dashboard.js", webScript, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declarations: Record<string, string> = {};
const getters: Record<string, string> = {};
const navigatorText = readFileSync(new URL("../client/navigation/OrgTabNavigator.tsx", import.meta.url), "utf8");
const navigator = ts.createSourceFile("OrgTabNavigator.tsx", navigatorText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const navDeclarations: Record<string, string> = {};
let mobileContent = "";
function visitMobile(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) declarations[node.name.getText(mobile)] = node.initializer.getText(mobile);
  if (ts.isConditionalExpression(node) && node.condition.getText(mobile) === "isAvailabilityNotApplicable") mobileContent = node.getText(mobile);
  ts.forEachChild(node, visitMobile);
}
function visitWeb(node: ts.Node) {
  if (ts.isGetAccessorDeclaration(node)) getters[node.name.getText(web)] = node.getText(web);
  ts.forEachChild(node, visitWeb);
}
visitMobile(mobile);
visitWeb(web);
function visitNavigator(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer) navDeclarations[node.name.getText(navigator)] = node.initializer.getText(navigator);
  ts.forEachChild(node, visitNavigator);
}
visitNavigator(navigator);
function evaluate(expression: string, context: Record<string, unknown> = {}) {
  return runInNewContext(ts.transpileModule(`const result = ${expression}; result;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText, { ...context });
}
function mobileHidden(branchMode: string, serviceMode?: string | null, orgMode = "fifo", platform = "ios") {
  const context: Record<string, any> = {
    getQueueModeForService, organization: { settings: { queueMode: orgMode } },
    selectedBranch: { settings: { queueMode: branchMode } },
    selectedService: { serviceSettings: { queueMode: serviceMode } },
    Platform: { OS: platform },
  };
  context.availabilityQueueMode = evaluate(declarations.availabilityQueueMode, context);
  context.normalizedAvailabilityMode = evaluate(declarations.normalizedAvailabilityMode, context);
  return evaluate(declarations.isAvailabilityNotApplicable, context);
}
function webState(branchMode: string, serviceMode?: string | null) {
  const state = evaluate(`({${["selectedBranch", "currentQueueMode", "isAvailabilityNotApplicable"].map(name => getters[name]).join(",")}})`);
  Object.assign(state, {
    selectedBranchId: "branch-a", selectedServiceId: "service-a",
    branches: [
      { id: "branch-b", queueMode: "takeaway", services: [{ id: "service-a", serviceSettings: { queueMode: "takeaway" } }] },
      { id: "branch-a", queueMode: branchMode, settings: { queueMode: branchMode }, services: [
        { id: "service-a", serviceSettings: { queueMode: serviceMode } },
        { id: "service-b", serviceSettings: { queueMode: "takeaway" } },
      ] },
    ],
  });
  return state;
}

test("Dine In and Take Away Availability is hidden on mobile but editable on web, including inherited modes", () => {
  for (const mode of ["dine_in", "dinein", "Dine In", "takeaway", "Take Away", "take_away"]) {
    assert.equal(mobileHidden("fifo", mode), true, `Mobile service: ${mode}`);
    assert.equal(webState("fifo", mode).isAvailabilityNotApplicable, false, `Web service: ${mode}`);
    assert.equal(mobileHidden("fifo", mode, "fifo", "web"), false, `Expo web: ${mode}`);
    assert.equal(mobileHidden(mode, null), true, `Mobile inherited: ${mode}`);
    assert.equal(webState(mode, null).isAvailabilityNotApplicable, false, `Web inherited: ${mode}`);
    assert.equal(mobileHidden(mode, null, "fifo", "android"), true, `Android inherited: ${mode}`);
  }
  for (const mode of ["fifo", "selective", "checkin", "check_in", "multistage", "multi_stage"]) {
    assert.equal(mobileHidden("dine_in", mode), false);
    assert.equal(webState("dine_in", mode).isAvailabilityNotApplicable, false);
  }
});

test("the selected branch and service drive visibility, and switching restores the original controls", () => {
  const state = webState("fifo", "fifo");
  const original = JSON.stringify(state.branches);
  assert.equal(state.isAvailabilityNotApplicable, false, "Do not use another service or another branch's mode");
  state.selectedServiceId = "service-b";
  assert.equal(state.isAvailabilityNotApplicable, false);
  state.selectedServiceId = "service-a";
  assert.equal(state.isAvailabilityNotApplicable, false);
  state.selectedBranchId = "branch-b";
  assert.equal(state.isAvailabilityNotApplicable, false);
  state.selectedBranchId = "branch-a";
  assert.equal(state.isAvailabilityNotApplicable, false);
  assert.equal(JSON.stringify(state.branches), original, "Visibility checks never mutate settings");
  assert.equal(mobileHidden("takeaway", "fifo"), false, "Service override wins over the food-mode branch");
});

test("mobile replaces all four tabs and editor content with the message, preserving other modes and slot permissions", () => {
  let renders = 0;
  const context = {
    React: { Fragment: "Fragment", createElement: (type: any, props: any, ...children: any[]) => ({ type, props, children }) },
    Card: "Card", ThemedText: "ThemedText", View: "View", Pressable: "Pressable",
    styles: {}, colors: { textSecondary: "grey" }, activeTab: "hours",
    renderTabContent: () => { renders++; return "original-editor"; },
  };
  const unavailable = evaluate(mobileContent, { ...context, isAvailabilityNotApplicable: true, canSeeSlots: true });
  assert.equal(unavailable.type, "Card");
  assert.equal(unavailable.props.testID, "availability-not-applicable");
  assert.equal(renders, 0);
  assert.match(JSON.stringify(unavailable), /Availability details are not applicable to this queue mode/);
  assert.match(JSON.stringify(unavailable), /Home page for the selected branch and service/);
  for (const slotsAllowed of [false, true]) {
    const available = evaluate(mobileContent, { ...context, isAvailabilityNotApplicable: false, canSeeSlots: slotsAllowed });
    assert.equal(available.type, "Fragment");
    assert.equal(available.children[0].children[0].length, slotsAllowed ? 4 : 3);
    assert.equal(available.children[1], "original-editor");
  }
  assert.equal(renders, 2);
  for (const modal of ["showBreakModal", "showHolidayModal", "showHoursTimePicker"]) {
    assert.ok(mobileText.includes(`visible={${modal} && !isAvailabilityNotApplicable}`));
  }
  assert.ok(mobileText.includes("visible={showBranchPicker}"), "Keep branch/service switching available");
});

test("web shows the complete original Availability section with balanced markup and the old not-applicable message hidden", () => {
  const section = html.slice(html.indexOf("<!-- BOOKINGS PAGE -->"), html.indexOf("<!-- MANUAL ADD TO QUEUE MODAL -->"))
    .replace(/<!--[\s\S]*?-->/g, "");
  const stack: any[] = [];
  const nodes: any[] = [];
  const voidTags = new Set(["input", "br", "hr", "img", "link", "meta"]);
  for (const match of section.matchAll(/<\/?([a-z][\w:-]*)(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)) {
    const tag = match[1].toLowerCase();
    if (match[0].startsWith("</")) {
      assert.equal(stack.pop()?.tag, tag, `Balanced ${tag} in Availability markup`);
    } else {
      const node = { tag, markup: match[0], parent: stack.at(-1) };
      nodes.push(node);
      if (!voidTags.has(tag) && !match[0].endsWith("/>")) stack.push(node);
    }
  }
  assert.equal(stack.length, 0, "Availability closes before the adjacent queue modal");
  const page = nodes.find(node => node.markup.includes(`currentPage === 'bookings'`));
  const message = nodes.find(node => node.markup.includes('data-testid="availability-not-applicable"'));
  const editors = nodes.find(node => node.markup.includes('x-show="!isAvailabilityNotApplicable"'));
  assert.equal(message?.parent, page);
  assert.equal(editors?.parent, page);
  assert.ok(message.markup.includes('x-show="isAvailabilityNotApplicable"'));
  assert.equal(webState("dinein").isAvailabilityNotApplicable, false);
  assert.equal(webState("takeaway").isAvailabilityNotApplicable, false);
  for (const tab of ["hours", "breaks", "holidays", "slots", "appointments"]) {
    const body = nodes.find(node => node.markup.includes(`bookingTab === '${tab}'`));
    assert.equal(body?.parent, editors, `${tab} belongs inside the visibility guard`);
  }
  assert.match(section, /Availability details are not applicable to this queue mode/);
  assert.match(section, /Home page for the selected branch and service/);
});

test("mobile navigation removes the Availability page only for the selected effective food mode", () => {
  const context: Record<string, any> = {
    organization: { settings: { queueMode: "fifo" } }, getQueueModeForService,
    selectedBranchId: "branch-a", selectedServiceId: "service-a",
    accessibleBranches: [
      { id: "branch-a", settings: { queueMode: "dinein" } },
      { id: "branch-b", settings: { queueMode: "takeaway" } },
    ],
    getAccessibleServices: () => [
      { id: "service-a", serviceSettings: { queueMode: "fifo" } },
      { id: "service-b", serviceSettings: { queueMode: "takeaway" } },
    ],
    Platform: { OS: "ios" },
  };
  function tabs() {
    for (const name of ["availabilityBranch", "availabilityServices", "availabilityService", "availabilityMode", "normalizedAvailabilityMode", "hideMobileAvailability"]) {
      context[name] = evaluate(navDeclarations[name], context);
    }
    return evaluate(navDeclarations.tabs, {
      ...context, useMemo: (fn: () => unknown) => fn(),
      isEventAccount: false, hasPermission: () => true, hasAnyPermission: () => true,
      ORG_QUEUE_NAV_PERMISSIONS: [],
      OrgDashboardScreen: "Home", OrgQueueScreen: "Queue", OrgServicesScreen: "Branches",
      OrgBookingsScreen: "Availability", OrgSettingsScreen: "Settings",
    });
  }
  assert.ok(tabs().some((tab: any) => tab.name === "OrgBookings"), "A FIFO override remains visible on a Dine In branch");
  context.selectedServiceId = "service-b";
  assert.equal(tabs().some((tab: any) => tab.name === "OrgBookings"), false);
  for (const mode of ["dine_in", "Dine In", "dine-in", "Take Away", "take_away"]) {
    context.getAccessibleServices = () => [{ id: "service-b", serviceSettings: { queueMode: mode } }];
    assert.equal(tabs().some((tab: any) => tab.name === "OrgBookings"), false, mode);
    context.Platform.OS = "web";
    assert.ok(tabs().some((tab: any) => tab.name === "OrgBookings"), `Web ${mode}`);
    context.Platform.OS = "android";
    assert.equal(tabs().some((tab: any) => tab.name === "OrgBookings"), false, `Android ${mode}`);
  }
  context.selectedServiceId = "stale-service";
  assert.equal(tabs().some((tab: any) => tab.name === "OrgBookings"), false, "Fallback follows the first accessible service");
  context.getAccessibleServices = () => [{ id: "service-a", serviceSettings: { queueMode: "fifo" } }];
  assert.ok(tabs().some((tab: any) => tab.name === "OrgBookings"), "Switching back restores Availability");
  assert.match(navigatorText, /hasPermission\("org\.bookings\.view"\) && !hideMobileAvailability/);
  assert.match(navigatorText, /isEventAccount, hideMobileAvailability\]/, "Mode changes recompute the tab list");
});
