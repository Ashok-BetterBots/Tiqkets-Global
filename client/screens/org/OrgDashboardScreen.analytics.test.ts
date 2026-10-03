import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const source = ts.createSourceFile(
  "OrgDashboardScreen.tsx",
  readFileSync(new URL("./OrgDashboardScreen.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
);

// Execute the actual screen's query definitions, not a copy of their logic.
function initializer(name: string): string {
  let result = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      result = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(result, `Missing screen declaration: ${name}`);
  return result;
}

function evaluate(expression: string, context: Record<string, unknown>) {
  const js = ts.transpileModule(`const result = ${expression}; result;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(js, context);
}

const queries = ["todayReportQuery", "longRangeReportQuery", "hourlyReportQuery"];
function query(name: string, branchId: string, serviceId: string, fetch: unknown, ready = true) {
  return evaluate(initializer(name), {
    useQuery: (options: unknown) => options,
    organization: { id: "org-test" }, activeBranch: { id: branchId },
    analyticsServiceId: serviceId, analyticsScopeReady: ready, hourlyTrendPeriod: 30,
    getApiUrl: () => "https://test.invalid", URL, Date, fetch,
  });
}

test("all Home analytics requests include the selected branch/service, never staff or desk", async () => {
  for (const name of queries) {
    for (const [branch, service] of [["branch-a", "service-a"], ["branch-b", "service-b"]]) {
      let requested!: URL;
      const controller = new AbortController();
      const options = query(name, branch, service, async (url: string, init: RequestInit) => {
        requested = new URL(url);
        assert.equal(init.credentials, "include");
        assert.equal(init.signal, controller.signal);
        return { ok: true, json: async () => ({ scoped: true }) };
      });
      assert.equal(options.enabled, true);
      await options.queryFn({ signal: controller.signal });
      assert.equal(requested.pathname, "/api/reports/org-test/summary");
      assert.equal(requested.searchParams.get("branchId"), branch);
      assert.equal(requested.searchParams.get("serviceId"), service);
      assert.equal(requested.searchParams.has("staffId"), false);
      assert.equal(requested.searchParams.has("deskId"), false);
      assert.ok(requested.searchParams.get("startDate"));
      assert.equal(requested.searchParams.has("endDate"), name === "todayReportQuery");
    }
  }
});

test("every Home analytics cache key separates branches and services", () => {
  for (const name of queries) {
    const a = query(name, "branch-a", "service-a", null);
    const otherBranch = query(name, "branch-b", "service-a", null);
    const otherService = query(name, "branch-a", "service-b", null);
    assert.notDeepEqual(a.queryKey, otherBranch.queryKey);
    assert.notDeepEqual(a.queryKey, otherService.queryKey);
    assert.equal(query(name, "branch-a", "service-a", null, false).enabled, false);
  }
});

test("a late response from the previous service cannot replace the selected service's data", async () => {
  for (const name of queries) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    let finishPrevious!: () => void;
    const previousStarted = new Promise<void>(resolve => {
      finishPrevious = resolve;
    });
    const previous = query(name, "branch-a", "service-a", async () => {
      await previousStarted;
      return { ok: true, json: async () => ({ marker: "previous-service" }) };
    });
    const selected = query(name, "branch-b", "service-b", async () => ({
      ok: true, json: async () => ({ marker: "selected-service" }),
    }));
    const observer = new QueryObserver(client, previous);
    const unsubscribe = observer.subscribe(() => {});
    try {
      observer.setOptions(selected);
      await client.fetchQuery(selected);
      finishPrevious();
      await new Promise(resolve => setTimeout(resolve, 0));
      assert.equal((observer.getCurrentResult().data as any).marker, "selected-service");
      assert.equal((client.getQueryData(selected.queryKey) as any).marker, "selected-service");
    } finally {
      unsubscribe();
      client.clear();
    }
  }
});

test("a previous branch's service cannot enable analytics during selection changes", () => {
  const names = ["activeBranch", "branchServices", "selectedService", "analyticsServiceId", "analyticsScopeReady"];
  const expression = `(() => { ${names.map(name => `const ${name} = ${initializer(name)};`).join("\n")} return analyticsScopeReady; })()`;
  for (const [selectedServiceId, ready] of [["service-a", false], ["service-b", true], [null, false]] as const) {
    assert.equal(evaluate(expression, {
      organization: { id: "org-test" },
      accessibleBranches: [{ id: "branch-a" }, { id: "branch-b" }],
      selectedBranchId: "branch-b", selectedServiceId,
      getAccessibleServices: () => [{ id: "service-b" }],
    }), ready);
  }
});

test("Today's Performance uses scoped totals instead of shared organisation statistics", () => {
  const cards = evaluate(initializer("perfCards"), {
    todayReportQuery: { data: { summary: { totalTickets: 12, completed: 8, noShows: 2, avgWaitTime: 6.5 } } },
    peakWaitMinutes: 14,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(cards.map((card: any) => [card.label, card.value]))), [
    ["Bookings", 12], ["Served", 8], ["No Shows", 2], ["Avg Wait", "6.5m"], ["Peak Wait", "14m"],
  ]);
});

test("focus and pull refresh all scoped reports, but never fetch an unresolved scope", async () => {
  let calls = 0;
  const refetch = async () => { calls++; };
  for (const ready of [false, true]) {
    const refresh = evaluate(initializer("refreshHomeAnalytics"), {
      useCallback: (callback: unknown) => callback,
      analyticsScopeReady: ready, activeBranch: { id: "branch-a" }, analyticsServiceId: "service-a",
      longRangeReportQuery: { refetch }, hourlyReportQuery: { refetch }, todayReportQuery: { refetch },
    });
    await refresh();
    assert.equal(calls, ready ? 3 : 0);
  }
});

test("report failures are surfaced rather than returned as successful empty data", async () => {
  for (const name of queries) {
    const options = query(name, "branch-a", "service-a", async () => ({ ok: false, status: 500 }));
    await assert.rejects(options.queryFn({ signal: new AbortController().signal }), /Failed to load/);
  }
});