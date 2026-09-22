import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRegistrationSourceMetrics } from "./events-routes";

test("separates store and customer registrations and excludes store revenue", () => {
  const result = aggregateRegistrationSourceMetrics([
    { registrationSource: "customer", amountPaid: 12_500 },
    { registrationSource: "store", amountPaid: 9_000 },
    { registrationSource: "store", amountPaid: 0 },
    { registrationSource: "customer", amountPaid: 5_000 },
  ]);

  assert.deepEqual(result, {
    storeRegistrations: 2,
    customerRegistrations: 2,
    customerRevenue: 17_500,
  });
});

test("treats missing legacy source values as customer registrations", () => {
  const result = aggregateRegistrationSourceMetrics([
    { amountPaid: 2_500 },
    { registrationSource: null, amountPaid: 0 },
  ]);

  assert.deepEqual(result, {
    storeRegistrations: 0,
    customerRegistrations: 2,
    customerRevenue: 2_500,
  });
});

test("aggregates only the rows supplied by the active location filter", () => {
  const selectedLocationRows = [
    { registrationSource: "store", amountPaid: 8_000 },
    { registrationSource: "customer", amountPaid: 4_000 },
  ];

  assert.deepEqual(aggregateRegistrationSourceMetrics(selectedLocationRows), {
    storeRegistrations: 1,
    customerRegistrations: 1,
    customerRevenue: 4_000,
  });
});

test("excludes incomplete customer attempts from registration cards and revenue", () => {
  const result = aggregateRegistrationSourceMetrics([
    { registrationSource: "customer", status: "registration_started", amountPaid: 0 },
    { registrationSource: "customer", status: "ticket_generated", amountPaid: 5_000 },
    { registrationSource: "store", status: "payment_completed", amountPaid: 2_000 },
  ]);

  assert.deepEqual(result, {
    storeRegistrations: 1,
    customerRegistrations: 1,
    customerRevenue: 5_000,
  });
});