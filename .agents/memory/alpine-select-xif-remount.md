---
name: Alpine select desync on x-if remount
description: Why dropdowns bound with x-model visually reset to the first option after SPA navigation, and the fix.
---

# Alpine `<select x-model>` resets to first option after navigation

A `<select x-model="...">` whose `<option>`s come from `<template x-for>` will
**visually snap back to the first option** when the select is unmounted and
remounted — e.g. when it lives inside a `<template x-if="...page check...">` that
toggles on SPA page navigation. The underlying state value stays correct (page
content is right; a full page refresh shows the right value), but the rendered
dropdown shows index 0. On remount Alpine binds `x-model` before the `x-for`
options exist, so the browser keeps `selectedIndex = 0` and x-model doesn't
re-apply.

**Fix:** keep the select mounted. Wrap the selector group in a persistent
`<div x-show="...">` instead of `<template x-if="...">`. x-show only toggles
`display`, so the select never unmounts and its bound value never desyncs.

**Why:** the bug is a mount-time race between `x-model` and `x-for`, not a state
bug — that's why refresh fixes it but in-app navigation re-triggers it.

**How to apply:** any Alpine select (or radio group) with dynamic x-for options
that can be hidden/shown by page or tab state should use `x-show`, not a
remounting `x-if`. Reserve `x-if` for blocks that have no stateful form controls
needing to retain a value across show/hide.
