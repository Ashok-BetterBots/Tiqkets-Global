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

test("print sheets use one front master and seven-up mixed-orientation back pages", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");

  assert.match(routes, /PREPRINTED_PRINT_TICKET_WIDTH_MM = 202/);
  assert.match(routes, /PREPRINTED_PRINT_TICKET_HEIGHT_MM = 82/);
  assert.match(routes, /PREPRINTED_PRINT_FRONT_GUTTER_MM = 4/);
  assert.match(routes, /PREPRINTED_PRINT_BACK_GUTTER_MM = 2/);
  assert.match(routes, /PREPRINTED_PRINT_CORNER_RADIUS_MM = 5/);
  assert.match(routes, /PREPRINTED_PRINT_BACK_TICKETS_PER_SHEET = 7/);
  assert.match(routes, /PREPRINTED_PRINT_BACK_LEFT_COUNT = 5/);
  assert.match(routes, /@page \{ size: A3 portrait; margin:0; \}/);
  assert.match(routes, /\.front-sheet \{ padding:6mm 21\.5mm; \}/);
  assert.match(routes, /\.back-ticket-layout \{ display:flex; gap:\$\{PREPRINTED_PRINT_BACK_GUTTER_MM\}mm; width:286mm; height:420mm; margin:0 auto; \}/);
  assert.match(routes, /height:418mm; margin-top:1mm;/);
  assert.match(routes, /height:406mm; margin-top:7mm;/);
  assert.match(routes, /\.rotated-ticket-slot \.ticket-face \{ transform:translate\(-50%,-50%\) rotate\(90deg\); \}/);
  assert.match(routes, /\.back-sheet \.ticket-face::after \{[^}]*left:57mm;/);
  assert.doesNotMatch(routes, /\.front-sheet \.ticket-face::after/);
  assert.match(routes, /const printSheets: string\[\] = \[/);
  assert.match(routes, /offset \+= PREPRINTED_PRINT_BACK_TICKETS_PER_SHEET/);
  assert.match(routes, /slice\(0, PREPRINTED_PRINT_BACK_LEFT_COUNT\)/);
  assert.match(routes, /slice\(PREPRINTED_PRINT_BACK_LEFT_COUNT\)/);
  assert.match(routes, /Math\.ceil\(rows\.length \/ PREPRINTED_PRINT_BACK_TICKETS_PER_SHEET\)/);
  assert.doesNotMatch(routes, /const duplexSheets/);
});