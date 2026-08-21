---
name: React Native DateTimePicker — timezone-safe date extraction
description: d.toISOString().slice(0,10) gives the wrong date for UTC+ timezones; use local date components instead.
---

## Rule
Never use `d.toISOString().slice(0, 10)` to extract a calendar date from a DateTimePicker `onChange` result.

## Why
`toISOString()` converts the Date to UTC. In UTC+ timezones (e.g. Asia/Riyadh = UTC+3) a date selected at local midnight (00:00) is the **previous day** in UTC. For UTC+3 this always produces date-1. The resulting wrong date fails server-side slot validation (`!dates.includes(slotDate)`) and silently breaks registration.

## How to apply
Always use local date components:
```typescript
const y = d.getFullYear();
const mo = String(d.getMonth() + 1).padStart(2, "0");
const dy = String(d.getDate()).padStart(2, "0");
const iso = `${y}-${mo}-${dy}`; // "YYYY-MM-DD" in local time
```

Fixed in: `client/components/EventManualRegModal.tsx` (slot date picker + CustomFieldInput date type).
Search the codebase for other `toISOString().slice(0, 10)` uses paired with DateTimePicker.

## Related
- `autoCapitalize="characters"` on controlled Android TextInputs causes `onChangeText` to not fire with the final capitalized value — state stays `""` while text is visually shown. Fix: `autoCapitalize="none"` + `.toUpperCase()` in `onChangeText`.
