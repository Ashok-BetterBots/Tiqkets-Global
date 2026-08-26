---
name: Alpine boolean attributes need booleans
description: Prevent silently disabled controls caused by non-boolean Alpine attribute bindings.
---

Bindings for HTML boolean attributes such as `disabled` must evaluate to an actual boolean, not an empty string or another truthy/falsy sentinel.

**Why:** An idle upload state stored as `""` was returned directly from an Alpine `:disabled` expression. Alpine retained `disabled=""`, which HTML interprets as disabled, so the file picker silently did nothing.

**How to apply:** Write explicit boolean expressions such as `busy || activeSide !== ""`, and reset transient busy state when opening a reusable modal.