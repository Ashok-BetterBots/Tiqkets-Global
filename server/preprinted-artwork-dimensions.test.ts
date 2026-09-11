import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("event ticket artwork editor preserves its existing design dimensions", () => {
  const dashboard = readFileSync("server/templates/dashboard.html", "utf8");
  const routes = readFileSync("server/events-routes.ts", "utf8");

  assert.match(dashboard, /Front and back artwork use the 20\.3 cm × 8\.2 cm ticket size/);
  assert.equal((dashboard.match(/aspect-ratio:203\/82/g) || []).length, 2);
  assert.match(dashboard, /ptkCanvasAspectRatio: 203 \/ 82/);
  assert.match(dashboard, /ptkMaxQrWidth: 100 \/ \(203 \/ 82\)/);

  assert.match(routes, /PREPRINTED_CANVAS_ASPECT_RATIO = 203 \/ 82/);
});

test("print sheets use the A3 six-up rotated layout and front-master pagination", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");

  assert.match(routes, /PREPRINTED_PRINT_TICKET_WIDTH_MM = 202/);
  assert.match(routes, /PREPRINTED_PRINT_TICKET_HEIGHT_MM = 82/);
  assert.match(routes, /PREPRINTED_PRINT_GUTTER_MM = 4/);
  assert.match(routes, /PREPRINTED_PRINT_CORNER_RADIUS_MM = 5/);
  assert.match(routes, /PREPRINTED_PRINT_BACK_CUT_LINE_OFFSET_MM = 57/);
  assert.match(routes, /PREPRINTED_PRINT_COLUMNS = 3/);
  assert.match(routes, /PREPRINTED_PRINT_ROWS = 2/);
  assert.match(routes, /@page \{ size: A3 portrait;/);
  assert.match(routes, /border-radius:\$\{PREPRINTED_PRINT_CORNER_RADIUS_MM\}mm;/);
  assert.match(routes, /rotate\(90deg\)/);
  assert.match(routes, /\.back-sheet \.ticket-face::after/);
  assert.match(routes, /left:\$\{PREPRINTED_PRINT_BACK_CUT_LINE_OFFSET_MM\}mm; border-left:\.3mm dashed/);
  assert.doesNotMatch(routes, /(^|})\s*\.ticket-face::after/m);
  assert.match(routes, /const printSheets: string\[\] = \[/);
  assert.match(routes, /offset \+= PREPRINTED_PRINT_TICKETS_PER_SHEET/);
  assert.match(routes, /Math\.ceil\(rows\.length \/ PREPRINTED_PRINT_TICKETS_PER_SHEET\)/);
  assert.doesNotMatch(routes, /const duplexSheets/);
});