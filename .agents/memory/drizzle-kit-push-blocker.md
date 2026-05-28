---
name: drizzle-kit push interactive prompt blocker
description: drizzle-kit push hangs waiting on terminal input for a legacy `tickets_whatsapp_ref_code_unique` constraint rename; safe additive schema changes should bypass it via direct SQL.
---

`npx drizzle-kit push` (the standard route for syncing `shared/schema.ts` to Postgres) prompts interactively about renaming/dropping the legacy unique constraint `tickets_whatsapp_ref_code_unique` and blocks the agent shell. The prompt is unrelated to whatever migration you actually wanted to apply.

**Why:** the constraint exists in the live DB under a generated name that doesn't match what Drizzle would emit today, so every push session re-asks. We are not fixing that constraint right now because it's load-bearing for inbound WhatsApp lookups.

**How to apply:** for *additive* schema work (new columns with defaults, new tables, new indexes) skip `drizzle-kit push` and apply the SQL directly via the `executeSql` callback in code_execution. Always add the matching declarations to `shared/schema.ts` in the same change so the TS types stay in sync. Reach for `drizzle-kit push` only when you're ready to interactively resolve the legacy constraint too.
