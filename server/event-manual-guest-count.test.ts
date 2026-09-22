import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("manual event registrations preserve the entered guest count while customer registration remains capped", () => {
  const routes = readFileSync("server/events-routes.ts", "utf8");
  const ticket = readFileSync("server/templates/event-ticket.html", "utf8");

  const customerStart = routes.indexOf("const handleEventRegister");
  const manualStart = routes.indexOf('app.post("/api/dashboard/events/registrations/manual"');
  const preprintedStart = routes.indexOf('app.post("/api/dashboard/events/:eventId/preprinted-batches"');

  assert.ok(customerStart >= 0 && manualStart > customerStart && preprintedStart > manualStart);

  const customerHandler = routes.slice(customerStart, manualStart);
  const manualHandler = routes.slice(manualStart, preprintedStart);

  assert.match(
    customerHandler,
    /Math\.min\(maxGuests - 1,\s*parseInt\(String\(familyMembersCount \?\? 0\), 10\) \|\| 0\)/,
  );
  assert.match(customerHandler, /allows a maximum of \$\{maxGuests\} guests per registration/);

  assert.match(
    manualHandler,
    /const fam = Math\.max\(0,\s*parseInt\(String\(familyMembersCount \?\? 0\), 10\) \|\| 0\)/,
  );
  assert.doesNotMatch(manualHandler, /Math\.min\(maxGuests - 1/);
  assert.match(manualHandler, /familyMembersCount: fam/);
  assert.match(manualHandler, /const guests = 1 \+ fam/);

  assert.match(
    routes,
    /SUM\(1 \+ \$\{eventRegistrations\.familyMembersCount\}\)/,
  );
  assert.match(ticket, /var guestCount = 1 \+ \(reg\.familyMembersCount \|\| 0\)/);
});