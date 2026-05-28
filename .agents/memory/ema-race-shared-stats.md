---
name: EMA / counter races on shared stats rows
description: Any "read row, blend, write back" loop against a row keyed by a unique tuple silently drops concurrent updates; do the blend inside `INSERT ... ON CONFLICT DO UPDATE`.
---

When multiple requests update the same stats row at once — for example the AI wait-time predictor blending each new completion sample into a `(branch, service, hour_of_week)` cell — a read-then-update implementation will lose updates: both requests read the same old EMA, both compute new EMAs from it, and the second write overwrites the first instead of compounding it. The sample counter undercounts too.

**Why:** the unique constraint guarantees one row per cell, but it does not serialize reads. Without `SELECT ... FOR UPDATE` or an atomic upsert, the read happens outside any lock the eventual write would take.

**How to apply:** do the EMA blend in SQL via `db.insert(table).values(freshSample).onConflictDoUpdate({ target: [...uniqueCols], set: { metric: sql\`round(${table.metric}::numeric * ${1-α} + excluded.metric::numeric * ${α})::int\`, sampleCount: sql\`${table.sampleCount} + 1\`, ... } })`. Clamp/normalise the incoming sample in JS *before* the insert so the SQL never has to defend against bad values. Same pattern applies to any per-key counter or running average (alert dedup tables, rate-limit buckets, per-customer aggregates).
