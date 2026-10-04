import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createHomeReportCalendar, shiftHomeReportDate, resolveOrganizationTimezone } from "../../../shared/home-report-calendar";
import { buildMonthlyServedTrend } from "../../../shared/home-monthly-trend";

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
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(js, { ...context });
}

const queries = ["todayReportQuery", "longRangeReportQuery", "hourlyReportQuery"];
function query(name: string, branchId: string, serviceId: string, fetch: unknown, ready = true, deskId = "all") {
  return evaluate(initializer(name), {
    useQuery: (options: unknown) => options,
    organization: { id: "org-test" }, activeBranch: { id: branchId },
    analyticsServiceId: serviceId, analyticsScopeReady: ready, hourlyTrendPeriod: 30,
    analyticsDeskId: deskId === "all" ? undefined : deskId,
    analyticsTimeZone: "Asia/Kolkata", homeCalendar: createHomeReportCalendar("Asia/Kolkata"),
    shiftHomeReportDate,
    getApiUrl: () => "https://test.invalid", URL, Date, fetch,
  });
}

test("all Home analytics include branch/service and the selected desk, across all staff", async () => {
  for (const name of queries) {
    for (const desk of ["all", "desk-a", "desk-b"]) {
    for (const [branch, service] of [["branch-a", "service-a"], ["branch-b", "service-b"]]) {
      let requested!: URL;
      const controller = new AbortController();
      const options = query(name, branch, service, async (url: string, init: RequestInit) => {
        requested = new URL(url);
        assert.equal(init.credentials, "include");
        assert.equal(init.signal, controller.signal);
        return { ok: true, json: async () => ({ scoped: true }) };
      }, true, desk);
      assert.equal(options.enabled, true);
      await options.queryFn({ signal: controller.signal });
      assert.equal(requested.pathname, "/api/reports/org-test/summary");
      assert.equal(requested.searchParams.get("branchId"), branch);
      assert.equal(requested.searchParams.get("serviceId"), service);
      assert.equal(requested.searchParams.has("staffId"), false);
      assert.equal(requested.searchParams.get("deskId"), desk === "all" ? null : desk);
      assert.equal(requested.searchParams.get("homeTimeZone"), "Asia/Kolkata");
      assert.ok(requested.searchParams.get("t"), "Live reports bypass stale HTTP caches");
      assert.ok(requested.searchParams.get("startDate"));
      assert.equal(requested.searchParams.has("endDate"), name === "todayReportQuery");
    }
    }
  }
});

test("every Home analytics cache key separates branches, services and desks", () => {
  for (const name of queries) {
    const a = query(name, "branch-a", "service-a", null);
    const otherBranch = query(name, "branch-b", "service-a", null);
    const otherService = query(name, "branch-a", "service-b", null);
    const otherDesk = query(name, "branch-a", "service-a", null, true, "desk-a");
    const secondDesk = query(name, "branch-a", "service-a", null, true, "desk-b");
    assert.notDeepEqual(a.queryKey, otherBranch.queryKey);
    assert.notDeepEqual(a.queryKey, otherService.queryKey);
    assert.notDeepEqual(a.queryKey, otherDesk.queryKey);
    assert.notDeepEqual(otherDesk.queryKey, secondDesk.queryKey);
    assert.equal(query(name, "branch-a", "service-a", null, false).enabled, false);
  }
});

test("Home calendar comes from the organisation, never the phone timezone", () => {
  for (const [timezone, expected] of [[undefined, "Asia/Kolkata"], ["Asia/Kolkata", "Asia/Kolkata"], ["America/New_York", "America/New_York"]]) {
    assert.equal(evaluate(initializer("analyticsTimeZone"), {
      organization: { timezone }, resolveOrganizationTimezone,
      Intl: { DateTimeFormat: () => { throw new Error("Phone timezone must not be used"); } },
    }), expected);
  }
});

test("late responses cannot replace the selected service or desk's data", async () => {
  for (const switchDesk of [false, true]) {
  for (const name of queries) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    let finishPrevious!: () => void;
    const previousStarted = new Promise<void>(resolve => {
      finishPrevious = resolve;
    });
    const previous = query(name, "branch-a", "service-a", async () => {
      await previousStarted;
      return { ok: true, json: async () => ({ marker: "previous-service" }) };
    }, true, "desk-a");
    const selected = query(name, switchDesk ? "branch-a" : "branch-b", switchDesk ? "service-a" : "service-b", async () => ({
      ok: true, json: async () => ({ marker: "selected-service" }),
    }), true, "desk-b");
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
  }
});

test("a previous branch's service cannot enable analytics during selection changes", () => {
  const names = ["activeBranch", "branchServices", "selectedService", "analyticsServiceId", "analyticsDeskId", "analyticsScopeReady"];
  const expression = `(() => { ${names.map(name => `const ${name} = ${initializer(name)};`).join("\n")} return analyticsScopeReady; })()`;
  for (const [selectedServiceId, ready] of [["service-a", false], ["service-b", true], [null, false]] as const) {
    assert.equal(evaluate(expression, {
      organization: { id: "org-test" },
      accessibleBranches: [{ id: "branch-a" }, { id: "branch-b" }],
      selectedBranchId: "branch-b", selectedServiceId,
      selectedDeskId: "all", availableDesks: [],
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
      analyticsDeskId: undefined, analyticsTimeZone: "Asia/Riyadh",
      longRangeReportQuery: { refetch }, hourlyReportQuery: { refetch }, todayReportQuery: { refetch },
    });
    await refresh();
    assert.equal(calls, ready ? 3 : 0);
  }
});

test("analytics cannot fetch a desk belonging to a previous service", () => {
  for (const [selectedDeskId, ready] of [["all", true], ["desk-b", true], ["desk-a", false]]) {
    const context = {
      selectedDeskId, availableDesks: [{ id: "desk-b" }],
      organization: { id: "org-test" }, activeBranch: { id: "branch-b" }, analyticsServiceId: "service-b",
    };
    const analyticsDeskId = evaluate(initializer("analyticsDeskId"), context);
    assert.equal(evaluate(initializer("analyticsScopeReady"), { ...context, analyticsDeskId }), ready);
  }
});

test("Served Report and Weekly Trend include today's data without shifting it to yesterday", () => {
  class FixedDate extends Date {
    constructor(value?: string | number | Date) {
      super(value === undefined ? "2026-10-04T12:00:00.000Z" : value instanceof Date ? value.getTime() : value);
    }
  }
  const homeCalendar = createHomeReportCalendar("Asia/Riyadh");
  const base = {
    useCallback: (callback: unknown) => callback,
    useMemo: (callback: () => unknown) => callback(),
    Date: FixedDate, homeCalendar, shiftHomeReportDate,
    dailyCompletedByDate: new Map([["2026-10-03", 3], ["2026-10-04", 8]]),
  };
  const buildDailySeries = evaluate(initializer("buildDailySeries"), base);
  assert.deepEqual(Array.from(buildDailySeries(7)).slice(-2), [3, 8]);
  const weekly = evaluate(initializer("currentWeeklyData"), { ...base, buildDailySeries, weeklyTrendPeriod: 7 });
  assert.equal(weekly[0], 8, "Sunday must include all eight served transactions");
  assert.equal(weekly[6], 3);
  assert.equal(evaluate(initializer("weeklyAggregates"), { ...base, buildDailySeries, weeklyTrendPeriod: 7 }).total, 11);
});

test("Hourly Trend includes all 24 hours, including early and late transactions", () => {
  const HOUR_VALUES = evaluate(initializer("HOUR_VALUES"), {});
  assert.equal(HOUR_VALUES.length, 24);
  const hourly = evaluate(initializer("currentHourlyData"), {
    useMemo: (callback: () => unknown) => callback(),
    hourlyReportQuery: { data: { hourly: [
      { hour: 1, completed: 2 }, { hour: 9, completed: 5 }, { hour: 13, completed: 8 },
      { hour: 23, completed: 3 },
    ] } },
    HOUR_VALUES,
  });
  assert.equal(hourly[1], 2);
  assert.equal(hourly[9], 5);
  assert.equal(hourly[13], 8);
  assert.equal(hourly[23], 3);
  assert.equal(hourly.reduce((sum: number, value: number) => sum + value, 0), 18);
});

test("report failures are surfaced rather than returned as successful empty data", async () => {
  for (const name of queries) {
    const options = query(name, "branch-a", "service-a", async () => ({ ok: false, status: 500 }));
    await assert.rejects(options.queryFn({ signal: new AbortController().signal }), /Failed to load/);
  }
});

test("Home chart order is Served Report, Hourly Trend, Weekly Trend, then Monthly Trend", () => {
  const titles: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxText(node) && /^(Served Report|Hourly Trend|Weekly Trend|Monthly Trend)$/.test(node.text.trim())) {
      titles.push(node.text.trim());
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.deepEqual(titles, ["Served Report", "Hourly Trend", "Weekly Trend", "Monthly Trend"]);
});

test("Monthly Trend uses the already-scoped live report for totals, averages and peak month", () => {
  class FixedDate extends Date {
    constructor(value?: string | number | Date) {
      super(value === undefined ? "2026-10-04T20:00:00Z" : value instanceof Date ? value.getTime() : value);
    }
  }
  const context = {
    Date: FixedDate,
    useMemo: (callback: () => unknown) => callback(),
    buildMonthlyServedTrend, homeCalendar: createHomeReportCalendar("Asia/Kolkata"),
    reportingDateKey: "2026-10-05",
    monthlyTrendMonths: 3,
    dailyCompletedByDate: new Map([["2026-08-01", 6], ["2026-09-01", 3], ["2026-10-05", 9]]),
  };
  const currentMonthlyData = evaluate(initializer("currentMonthlyData"), context);
  const totalsContext = { ...context, currentMonthlyData };
  const totalMonthly = evaluate(initializer("totalMonthly"), totalsContext);
  assert.equal(totalMonthly, 18);
  assert.equal(evaluate(initializer("avgPerMonth"), { ...totalsContext, totalMonthly }), 6);
  assert.equal(evaluate(initializer("maxMonthlyValue"), totalsContext), 9);
  assert.equal(evaluate(initializer("selectedMonthlyMonth"), { ...totalsContext, selectedMonthlyBarIndex: 2 }).fullLabel, "Oct 2026");
  assert.equal(evaluate(initializer("selectedMonthlyMonth"), { ...totalsContext, selectedMonthlyBarIndex: null }), undefined);
});

test("scrollable chart values have real space within the viewport and selected bars render above siblings", () => {
  const wanted: Record<string, string> = {};
  function visit(node: ts.Node) {
    if (ts.isPropertyAssignment(node) && ["scrollChartRow", "selectedChartBar", "barTooltipText"].includes(node.name.getText(source))) {
      wanted[node.name.getText(source)] = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  const row = evaluate(wanted.scrollChartRow, {});
  const text = evaluate(wanted.barTooltipText, { OrgDesign: { fonts: { bold: "bold" } } });
  assert.ok(row.paddingTop >= text.lineHeight + 8 + 6, "Reserve the tooltip height, padding and gap inside ScrollView");
  assert.ok(row.paddingHorizontal >= 16, "First and last tooltip edges must remain in the viewport");
  assert.ok(evaluate(wanted.selectedChartBar, {}).zIndex > 0);
  assert.match(source.text, /style=\{\[styles\.barTouchTarget, isSelected && styles\.selectedChartBar\]\}/);
  assert.equal((source.text.match(/removeClippedSubviews=\{false\}/g) || []).length, 1);
  assert.match(source.text, /testID="hourly-selection"/, "Selected hour and its value also remain visible outside the scroll viewport");
});

test("monthly period changes clear the selected value; tapping a monthly bar selects and deselects it", () => {
  let periodCallback = "";
  let monthlyMap = "";
  function visit(node: ts.Node) {
    if (ts.isArrowFunction(node) && node.getText(source).includes("setMonthlyTrendMonths(v);")) periodCallback = node.getText(source);
    if (ts.isCallExpression(node) && node.expression.getText(source) === "currentMonthlyData.map") monthlyMap = node.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let period = 6, selected: number | null = 1, haptics = 0;
  const setSelectedMonthlyBarIndex = (value: number | null) => { selected = value; };
  const callback = evaluate(periodCallback, {
    setMonthlyTrendMonths: (value: number) => { period = value; }, setSelectedMonthlyBarIndex,
  });
  callback(3);
  assert.equal(period, 3);
  assert.equal(selected, null);
  const renderBars = () => evaluate(monthlyMap, {
    React: { createElement: (type: unknown, props: unknown) => ({ type, props }) },
    ChartBar: "ChartBar",
    currentMonthlyData: buildMonthlyServedTrend(new Map(), "2026-10-04", period),
    maxMonthlyValue: 0, selectedMonthlyBarIndex: selected, setSelectedMonthlyBarIndex,
    Haptics: { impactAsync: () => { haptics++; }, ImpactFeedbackStyle: { Light: "light" } },
  });
  for (const months of [3, 6, 12]) {
    callback(months);
    assert.equal(renderBars().length, months, `Render every bar for the ${months}-month filter`);
    assert.equal(selected, null);
  }
  callback(3);
  renderBars()[1].props.onPress();
  assert.equal(selected, 1);
  renderBars()[1].props.onPress();
  assert.equal(selected, null);
  assert.equal(haptics, 2);
});

test("monthly filters fit within the card without a horizontal scroll container", () => {
  let chart: ts.JsxElement | undefined;
  const wanted: Record<string, string> = {};
  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.attributes.getText(source).includes('testID="monthly-chart"')) chart = node;
    if (ts.isPropertyAssignment(node) && ["chartRow", "monthlyChartRow", "yearlyChartRow", "barTouchTarget"].includes(node.name.getText(source))) {
      wanted[node.name.getText(source)] = node.initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(chart);
  assert.equal(chart.openingElement.tagName.getText(source), "View");
  assert.match(chart.getText(source), /currentMonthlyData\.map/);
  for (let ancestor: ts.Node | undefined = chart.parent; ancestor; ancestor = ancestor.parent) {
    if (!ts.isJsxElement(ancestor)) continue;
    if (ancestor.openingElement.attributes.getText(source).includes('testID="monthly-trend"')) break;
    assert.notEqual(ancestor.openingElement.tagName.getText(source), "ScrollView");
  }
  const row = evaluate(wanted.chartRow, {});
  const monthly = evaluate(wanted.monthlyChartRow, {});
  const yearly = evaluate(wanted.yearlyChartRow, {});
  const bar = evaluate(wanted.barTouchTarget, {});
  assert.equal(monthly.width, "100%");
  assert.equal(bar.flex, 1);
  assert.ok(monthly.paddingTop >= 40, "Keep room for selected-value tooltips");
  for (const width of [216, 248, 288, 340]) {
    for (const months of [3, 6, 12]) {
      const gap = months === 12 ? yearly.gap : row.gap;
      const available = width - monthly.paddingHorizontal * 2 - gap * (months - 1);
      assert.ok(available / months >= bar.minWidth, `${months} bars fit inside a ${width}px chart`);
    }
  }
});