import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import ts from "typescript";

const compile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const file of ["billing-routes.ts", "routes.ts"]) {
  test(`${file}: authorised branch-only flag saves persist and broadcast, without replacing other settings`, async () => {
    const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
    let route: ts.CallExpression | undefined;
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === "app.put"
        && node.arguments[0]?.getText(source) === '"/api/dashboard/branches/:branchId/settings"') route = node;
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(route);
    assert.match(route.arguments[1].getText(source), /requirePermission\("org.settings.queue.edit"\)/);
    const records: Record<string, any> = {
      A: { id: "A", name: "Test branch", displaySettings: { announcementsEnabled: false, announcementLanguage: "ta", enableTVDisplay: true } },
      B: { id: "B", displaySettings: { announcementsEnabled: false } },
    };
    const signals: any[] = [];
    let permitted = true;
    let writes = 0;
    const context = {
      storage: { getBranchById: async (id: string) => records[id],
        updateBranch: async () => { throw new Error("Flag-only request must use atomic field update"); } },
      isAnnouncementOnlyUpdate: () => true,
      updateBranchAnnouncementEnabled: async (id: string, enabled: boolean) => {
        writes++;
        return records[id] = { ...records[id], displaySettings: { ...records[id].displaySettings, announcementsEnabled: enabled } };
      },
      assertBranchOwnership: async (_req: any, res: any) => {
        if (!permitted) res.status(403).json({ error: "Forbidden" });
        return permitted;
      },
      writeAudit: async () => {},
      broadcastBranchAnnouncementSetting: (...args: any[]) => signals.push(args),
      console,
    };
    const handler = runInNewContext(compile(`const handler = ${route.arguments.at(-1)!.getText(source)}; handler;`), context);
    const response: any = { code: 200, status(code: number) { this.code = code; return this; }, json(value: any) { this.body = value; } };
    const request = (enabled: boolean) => ({ params: { branchId: "A" }, body: { displaySettings: { announcementsEnabled: enabled } } });
    await handler(request(true), response);
    assert.equal(response.code, 200);
    assert.equal(records.A.displaySettings.announcementsEnabled, true);
    assert.equal(records.A.displaySettings.announcementLanguage, "ta");
    assert.equal(records.A.displaySettings.enableTVDisplay, true);
    assert.equal(records.B.displaySettings.announcementsEnabled, false);
    assert.deepEqual(signals, [["A", true]]);
    await handler(request(true), response);
    assert.equal(signals.length, 1);
    await handler(request(false), response);
    assert.deepEqual(signals.at(-1), ["A", false]);
    permitted = false;
    const before = writes;
    await handler(request(true), response);
    assert.equal(response.code, 403);
    assert.equal(writes, before);
  });
}

test("mobile audio master bypasses service overrides and web uses the same existing branch field", () => {
  const mobile = readFileSync(new URL("../client/screens/org/OrgSettingsScreen.tsx", import.meta.url), "utf8");
  const handler = mobile.slice(mobile.indexOf("const handleToggleAnnouncements"), mobile.indexOf("const handleToggleDedicatedPlayer"));
  assert.match(handler, /updateBranchSettings\(selectedBranch.id/);
  assert.doesNotMatch(handler, /saveSetting|updateServiceSettings/);
  assert.match(mobile, /value=\{branchAnnouncementsEnabled\}/);
  const web = readFileSync(new URL("./templates/dashboard.html", import.meta.url), "utf8");
  assert.match(web, /const displaySettings = \{ announcementsEnabled: enabled \}/);
  assert.match(web, /addEventListener\('branch_settings_changed'/);
});

test("mobile branch-only optimistic save reverts on failure without changing another branch or its other display fields", async () => {
  const text = readFileSync(new URL("../client/contexts/OrganizationContext.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("context.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "doUpdateBranchSettings") {
      callback = (node.initializer as ts.CallExpression).arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  const b = { id: "B", settings: { display: { announcementsEnabled: false } } };
  let current: any[] = [{ id: "A", settings: { display: { announcementsEnabled: false, announcementLanguage: "ta" } } }, b];
  const branchesRef = { current };
  let reject!: (error: Error) => void;
  const handler = runInNewContext(compile(`const handler = ${callback.getText(source)}; handler;`), {
    branchesRef,
    setBranches: (update: (prev: any[]) => any[]) => { current = update(current); branchesRef.current = current; },
    apiRequest: (method: string, url: string, payload: any) => {
      assert.equal(method, "PUT");
      assert.equal(url, "/api/dashboard/branches/A/settings");
      assert.equal(payload.displaySettings.announcementsEnabled, true);
      assert.equal(Object.keys(payload.displaySettings).length, 1);
      return new Promise((_resolve, fail) => { reject = fail; });
    },
    logHandledError: () => {},
  });
  const save = handler("A", { display: { announcementsEnabled: true } });
  assert.equal(current[0].settings.display.announcementsEnabled, true);
  assert.equal(current[0].settings.display.announcementLanguage, "ta");
  reject(new Error("offline"));
  await assert.rejects(save, /offline/);
  assert.equal(current[0].settings.display.announcementsEnabled, false);
  assert.equal(current[0].settings.display.announcementLanguage, "ta");
  assert.equal(current[1], b);
});

test("mobile toggle failure uses the existing save-error alert, not a service save", async () => {
  const text = readFileSync(new URL("../client/screens/org/OrgSettingsScreen.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("settings.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "handleToggleAnnouncements") callback = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback);
  const alerts: string[][] = [];
  const handler = runInNewContext(compile(`const handler = ${callback.getText(source)}; handler;`), {
    selectedBranch: { id: "A" }, branchAnnouncementsEnabled: false,
    Haptics: { impactAsync: () => {}, ImpactFeedbackStyle: { Light: "light" } },
    updateBranchSettings: async (id: string, settings: any) => {
      assert.equal(id, "A");
      assert.equal(settings.display.announcementsEnabled, true);
      throw new Error("offline");
    },
    Alert: { alert: (...args: string[]) => alerts.push(args) },
  });
  await handler();
  assert.deepEqual(alerts, [["Couldn't save settings", "offline"]]);
});
