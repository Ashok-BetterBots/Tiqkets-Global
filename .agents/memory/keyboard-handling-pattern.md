---
name: Keyboard handling pattern
description: Which keyboard-avoidance approach to use for forms vs modals in this RN/Expo app.
---

# Keyboard-overlap handling convention

Two distinct approaches are used across the app — pick by container type:

- **Full-screen scrolls that contain TextInputs** → use `KeyboardAwareScrollViewCompat`
  (`client/components/KeyboardAwareScrollViewCompat.tsx`, falls back to plain ScrollView on web).
  This is the project standard for any non-modal screen with inputs.
- **RN `<Modal>` form content** → wrap with React Native's `KeyboardAvoidingView`
  (`behavior={Platform.OS === "ios" ? "padding" : "height"}`), NOT the keyboard-controller one.

**Why:** `react-native-keyboard-controller` (which powers KeyboardAwareScrollViewCompat) is
unreliable inside native RN `<Modal>` (its KeyboardProvider context / native listeners do not
propagate cleanly into the modal window, esp. Android). The proven in-modal pattern already used
by JourneyManagementScreen and OrgSupportScreen is plain RN `KeyboardAvoidingView`.

**How to apply:**
- pageSheet/formSheet modal whose root child is a plain `View` → swap that `View` for
  `KeyboardAvoidingView` (carries the same flex:1 container style).
- modal root is a `ThemedView` (themed bg) → don't swap it; instead swap the inner form
  `ScrollView` for `KeyboardAwareScrollViewCompat` only if it works, otherwise nest a KAV. In
  practice the inner-scroll swap was used for ThemedView-rooted formSheet modals.
- bottom-sheet modal (transparent + Animated.View anchored flex-end + full-screen backdrop
  Pressable) → put `KeyboardAvoidingView` (style width:'100%') INSIDE the backdrop Pressable
  wrapping only the sheet/Animated.View, never around the whole backdrop (wrapping the backdrop
  shifts the tap area and the whole overlay).
- A transparent native bottom sheet can still remain fixed above Android's keyboard despite
  `KeyboardAvoidingView` height behavior. For that case, listen for `keyboardDidShow`, measure the
  entire sheet in window coordinates, and animate only its remaining overlap above the keyboard.
  Put the transform on a wrapper around the unchanged card; reset it on hide/close and leave iOS
  on its existing KAV path.

**Android edge-to-edge gotcha:** Never leave an Android form with
`KeyboardAvoidingView` `behavior={undefined}`; it is a complete NO-OP and the keyboard overlaps
the inputs. `softwareKeyboardLayoutMode: "resize"` should be explicit in the Expo config, but a
transparent core Modal may still need its own measured container adjustment. Full-screen
auth/login forms should use `KeyboardAwareScrollViewCompat`, not only RN KAV.
