---
name: Payment "paid" status is "captured"
description: Razorpay payments are persisted with status "captured", not "completed" — any paid-revenue aggregation must include it.
---

# Successful payments are stored as "captured"

When a Razorpay payment succeeds, the billing flow writes the `payments.status`
as `"captured"` (Razorpay's own term). Invoice/PDF logic treats CAPTURED = PAID.
There is no `"completed"` row in the `payments` table for real revenue.

**Why:** Several aggregation points were copy-pasted with a `status = "completed"`
filter (a ticket/appointment term), which silently read **zero revenue** on the
super-admin dashboard and transaction cards even though money had been collected.

**How to apply:** Any query/UI that sums or labels *paid* payments must treat the
set `["captured", "completed", "paid"]` as paid — server stats, CSV exports, and
both the web (`super-admin.html`) and React Native
(`superadmin/TransactionHistoryScreen.tsx`) clients. Subscription tables drift the
same way for MRR — make sure plan price columns are actually selected and MRR is
computed (monthly_price for monthly cycle, yearly_price/12 for yearly). Plan
prices and payment amounts are stored in **minor units (paise)** — divide by 100
for display and use a currency-aware symbol (plans are INR, not USD).
