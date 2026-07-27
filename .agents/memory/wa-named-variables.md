---
name: WhatsApp named template variables
description: Meta-approved templates use named variables ({{customer_name}}) not positional ({{1}}); Cloud API requires parameter_name in each body param.
---

## Rule
All registered Tiqkets Meta-approved templates use **named** body variables (`{{customer_name}}`, `{{restaurant_name}}`, etc.), not positional (`{{1}}`, `{{2}}`).

The WhatsApp Cloud API returns `(#100) "Parameter name is missing or empty"` when you send body parameters without the `parameter_name` field for named-variable templates.

## Fix
`sendWhatsAppTemplateMessage` accepts `opts.bodyParamNames?: string[]`. When provided, each body parameter object gets `parameter_name: <name>`:
```js
{ type: "text", text: "Thiagu Raju", parameter_name: "customer_name" }
```

**Both call sites must pass names:**
- `sendDineInApprovedTemplate` → passes `bodyParamNames: template.bodyVariables`
- `sendEventTrigger` (events-routes.ts) → passes `bodyParamNames: approved.bodyVariables`

## Why
Discovered July 2026 during dine-in Tamil template testing. Body-only test with all non-empty values still returned #100. Adding `parameter_name` to each param made Meta accept the call (`message_status: accepted`).

The error progression was:
1. `(#131008)` "Parameter of type text is missing text value" → empty body params (reservation_time fallback missing)
2. `(#100)` "Parameter name is missing or empty" → named vars without parameter_name field
3. `(#132012)` "header: Format mismatch, expected IMAGE, received UNKNOWN" → confirms template DOES have image header (appeared only when body-only was tested)

## CTA URL button format
For URL buttons with dynamic suffix: pass **only the qrToken** (not the full URL) as `ctaUrlParam`. The template's button URL already contains the static base; Meta appends the parameter value. `index` must be number `0`, not string `"0"`.
