---
name: Danger-zone typed-confirmation modal pattern
description: Reusable Alpine.js modal pattern for destructive actions (end/delete) requiring typed confirmation, plus a separate warn-then-confirm pattern for capacity conflicts.
---

Two distinct confirmation UX patterns, used for different risk levels:

1. **Typed-confirmation danger modal** (irreversible single-target actions like End/Delete): a generic reusable Alpine state (`dangerModalOpen`/`dangerModalConfig`/`dangerModalInput`/`dangerModalBusy`) opened via `openDangerConfirm({title, message, requireTypedText, actionLabel, onConfirm})`. The confirm button stays disabled until the input matches `requireTypedText` (case-insensitive, trimmed). Never use native `confirm()` for destructive actions — it can't show context-specific messaging and some environments treat it unreliably.

2. **Warn-then-pick modal** (choosing which of several existing things to end/replace, e.g. exceeding a 2-active cap): a dedicated modal listing the conflicting items with one action button per item — no typed confirmation needed since the user is making an informed choice from a visible list, not confirming an irreversible action on a single named target. The triggering request must return a structured error (e.g. HTTP 409 with a machine-readable `error` code and the list of conflicting items) instead of a generic 400, so the client can distinguish "show picker" from "hard fail" and only mutate state after the user's explicit follow-up request.

**Why:** conflates two different risk shapes — "are you sure you want to destroy X" vs "which of these should give way" — and reusing one pattern for both either adds unnecessary typing friction to a multi-choice pick, or removes needed friction from an irreversible single-target delete.

**How to apply:** any new destructive single-target action reuses the typed-confirmation modal; any new "cap exceeded, pick one to replace" flow reuses the 409 + structured picker pattern rather than silently auto-selecting or hard-blocking.
