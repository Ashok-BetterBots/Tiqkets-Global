import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("event ticket artwork uses 20.3 cm by 8.2 cm for front and back", () => {
  const dashboard = readFileSync("server/templates/dashboard.html", "utf8");
  const routes = readFileSync("server/events-routes.ts", "utf8");

  assert.match(dashboard, /Front and back artwork use the 20\.3 cm × 8\.2 cm ticket size/);
  assert.equal((dashboard.match(/aspect-ratio:203\/82/g) || []).length, 2);
  assert.match(dashboard, /ptkCanvasAspectRatio: 203 \/ 82/);
  assert.match(dashboard, /ptkMaxQrWidth: 100 \/ \(203 \/ 82\)/);

  assert.match(routes, /PREPRINTED_CANVAS_ASPECT_RATIO = 203 \/ 82/);
  assert.match(routes, /\.artwork-grid \.ticket-face \{ width:203mm; height:82mm; \}/);
  assert.match(routes, /const usesArtworkSheetLayout = hasArtwork/);
});