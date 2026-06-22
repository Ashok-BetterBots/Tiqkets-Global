---
name: Bottom sheet modal template
description: Standardized floating card bottom sheet design used for all org-side form modals
---

## The rule
All new org-side form modals must use `client/components/BottomSheetModal.tsx`. Add `sheetLabel` + `sheetInput` styles to the screen's `createStyles` for consistent bold labels and rounded inputs.

**Why:** The design was locked in during OrgQueueScreen work (Add-to-Queue modals). Keeping every sheet visually identical avoids per-screen design drift.

**How to apply:**
1. Import `BottomSheetModal` from `@/components/BottomSheetModal`
2. Replace any `<Modal animationType="slide">` pattern with `<BottomSheetModal visible={...} onClose={...} title="..." onConfirm={...}>`
3. Add to screen's `createStyles`:
   ```ts
   sheetLabel: { fontSize: 13, fontWeight: "700", fontFamily: "Nunito_700Bold", marginBottom: Spacing.sm },
   sheetInput: { borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: 16, padding: Spacing.md, fontSize: 16, backgroundColor: "#F7F5FE" },
   ```
4. Use `[styles.sheetLabel, { color: colors.textSecondary }]` on labels and `[styles.sheetInput, { color: colors.text }]` on inputs.
5. If a sub-modal (nested picker, etc.) needs to appear on top: hoist it to root-view level after the BottomSheetModal in JSX, guard with `{showParentModal && showSubModal ? ... : null}`, add `zIndex: 200` to its overlay.

## Visual specs (do not change without updating this file)
- Overlay: `absoluteFillObject`, `backgroundColor: rgba(0,0,0,0.5)`, `justifyContent: flex-end`, `paddingHorizontal: 10`, `paddingBottom: 20`, `zIndex: 100`
- Card: `borderRadius: 32`, `overflow: hidden`, `maxHeight: 88%`
- Handle pill: `width: 40, height: 4, borderRadius: 2, backgroundColor: rgba(0,0,0,0.12)`, centered, `marginTop: 12`
- Title: `fontSize: 18, fontFamily: Nunito_800ExtraBold`
- Buttons: `borderRadius: 16`, `paddingVertical: 14`
- Animation: `SlideInDown.duration(300).springify()` enter, `SlideOutDown.duration(220)` exit
