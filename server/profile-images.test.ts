import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { permanentProfilePicture, ProfilePictureError } from "./profile-images";
import { profileImageUri, uploadProfilePicture } from "../client/lib/profile-images";

const path = "/public-objects/profiles/profile_test.png";

test("profile storage accepts permanent paths and rejects new cache references and expiring URLs", () => {
  assert.equal(permanentProfilePicture(path), path);
  assert.equal(permanentProfilePicture(`https://queue.tiqkets.in${path}`), path);
  assert.equal(permanentProfilePicture(""), "");
  for (const value of [
    "file:///data/user/0/cache/ImagePicker/photo.jpg", "blob:https://example.org/123",
    "data:image/jpeg;base64,abc", "/uploads/profiles/lost.jpg",
    `https://queue.tiqkets.in${path}?X-Goog-Signature=expired`, "/public-objects/events/banner.jpg",
    "/public-objects/profiles/../events/photo.jpg", null,
  ]) assert.throws(() => permanentProfilePicture(value), ProfilePictureError);
  const legacy = "file:///var/mobile/Caches/ImagePicker/old.jpg";
  assert.equal(permanentProfilePicture(legacy, legacy), legacy, "Do not destroy existing data when editing another field");
});

test("display resolves persistent paths against the API without changing saved paths or legacy references", () => {
  assert.match(profileImageUri(path)!, /^https?:\/\/[^/]+\/public-objects\/profiles\/profile_test\.png$/);
  assert.equal(profileImageUri("https://queue.tiqkets.in" + path), "https://queue.tiqkets.in" + path);
  assert.equal(profileImageUri("file:///still-readable.jpg"), "file:///still-readable.jpg");
  assert.equal(profileImageUri(null), undefined);
});

test("mobile upload sends image bytes and returns only a permanent path", async t => {
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    assert.equal(url.pathname, "/api/upload/profile-picture");
    assert.equal(init.method, "POST");
    assert.equal(JSON.parse(init.body as string).image, "data:image/png;base64,iVBORexample");
    assert.equal(init.credentials, "include");
    return Response.json({ url: path });
  });
  assert.equal(await uploadProfilePicture({ base64: "iVBORexample" }), path);
  await assert.rejects(uploadProfilePicture({ base64: null }), /could not be read/);
});

test("failed uploads and temporary upload responses cannot be saved", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json({ error: "Upload failed" }, { status: 500 }));
  await assert.rejects(uploadProfilePicture({ base64: "/9j/example" }), /Upload failed/);
  fetchMock.mock.mockImplementation(async () => Response.json({ url: "file:///temporary.jpg" }));
  await assert.rejects(uploadProfilePicture({ base64: "/9j/example" }), /permanent image path/);
});

function initializer(file: string, variable: string) {
  const text = readFileSync(new URL(file, import.meta.url), "utf8");
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === variable && node.initializer) expression = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(expression);
  return expression;
}
function evaluate(expression: string, context: Record<string, unknown>) {
  return runInNewContext(ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
}

test("organization picture saves are server-first, owner-scoped, and failures leave the old picture intact", async () => {
  const expression = initializer("../client/contexts/OrganizationContext.tsx", "updateCurrentUser");
  for (const role of ["owner", "staff-admin"]) {
    const events: string[] = [];
    const context = {
      currentUser: { id: role === "owner" ? "owner:org" : "staff", role: "admin", profilePictureUrl: "/old.png" },
      organization: { id: "org" }, STORAGE_KEY: "key",
      useCallback: (fn: unknown) => fn,
      AsyncStorage: { setItem: async () => events.push("local") },
      setCurrentUser: () => events.push("state"), setUsers: () => {}, setOrganization: () => {},
      logHandledError: () => {},
      apiRequest: async (_method: string, route: string) => { events.push(route); },
    };
    await evaluate(expression, context)({ profilePictureUrl: path });
    assert.equal(events[0], role === "owner" ? "/api/organizations/org" : "/api/dashboard/profile/staff");
    assert.equal(events.length, 3);
    events.length = 0;
    context.apiRequest = async () => { throw new Error("Save failed"); };
    await assert.rejects(evaluate(expression, context)({ profilePictureUrl: path }), /Save failed/);
    assert.deepEqual(events, []);
  }
});

test("customer picture failures do not replace the previously saved local profile", async () => {
  const events: string[] = [];
  const save = evaluate(initializer("../client/contexts/AuthContext.tsx", "updateUser"), {
    user: { id: "customer", avatarUrl: "/old.png" }, STORAGE_KEY: "key",
    AsyncStorage: { setItem: async () => events.push("local") }, setUser: () => events.push("state"),
    apiRequest: async () => { throw new Error("Save failed"); }, logHandledError: () => {},
  });
  await assert.rejects(save({ avatarUrl: path }), /Save failed/);
  assert.deepEqual(events, []);
});

test("web reload restores only the authoritative picture, without replacing other profile fields", async () => {
  const text = readFileSync(new URL("./templates/dashboard.html", import.meta.url), "utf8");
  const start = text.indexOf("async refreshProfilePicture()");
  const end = text.indexOf("async loadAllData()", start);
  const state = evaluate(`({${text.slice(start, end)}})`, {
    api: async () => ({ mode: "owner", organization: { logoUrl: path } }),
    localStorage: { setItem: () => {} }, console,
  });
  Object.assign(state, { org: { name: "Unchanged" }, currentUser: { name: "Owner", profilePictureUrl: "" } });
  await state.refreshProfilePicture();
  assert.equal(state.currentUser.profilePictureUrl, path);
  assert.equal(state.org.logoUrl, path);
  assert.equal(state.currentUser.name, "Owner");
  assert.match(text, /profilePictureUrl: data\.organization\.logoUrl \|\| ''/);
  assert.match(text, /profilePictureUrl: data\.logoUrl \|\| ''/);
});
