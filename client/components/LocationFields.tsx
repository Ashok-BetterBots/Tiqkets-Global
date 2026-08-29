// ============================================================================
// LocationFields — reusable Country / State / City pickers and a phone-with-
// dial-code field, all backed by `country-state-city` so the data stays in
// sync with the standard ISO catalog. Used by the org signup form (and
// available for any other "collect a postal address" flow).
//
// Each picker opens a full-screen modal with a search box + scrollable list.
// We deliberately avoid native pickers (no @react-native-picker/picker) so the
// experience is identical on iOS, Android and web, matches the rest of the
// org-side UI, and supports search — without which a 250-country list is
// painful to use.
//
// Phone field: a tappable dial-code button on the left + a phone-number
// TextInput on the right. Changing the dial code from the picker also updates
// the country selection (one-way sync from phone -> country) so the user
// doesn't have to keep them aligned manually. The opposite direction
// (country -> dial code) happens via the parent's onCountryChange.
// ============================================================================

import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Country, State, City } from "country-state-city";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";

type ThemeColors = ReturnType<typeof useTheme>["theme"];

// ----------------------------------------------------------------------------
// Shared picker modal
// ----------------------------------------------------------------------------

type PickerItem = {
  key: string;          // unique value sent back via onSelect (e.g. iso code)
  label: string;        // primary display string (e.g. "India")
  sublabel?: string;    // optional secondary line (e.g. "+91")
  prefix?: string;      // optional left-of-label glyph (flag emoji)
};

type PickerModalProps = {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedKey?: string;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
  emptyHint?: string;
};

function PickerModal({
  visible,
  title,
  items,
  selectedKey,
  onSelect,
  onClose,
  emptyHint,
}: PickerModalProps) {
  const { theme: colors } = useTheme();
  const modalStyles = useMemo(() => makeModalStyles(colors), [colors]);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        (it.sublabel || "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : undefined}
    >
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.headerTitle}>{title}</Text>
          <Pressable
            onPress={handleClose}
            hitSlop={12}
            style={modalStyles.closeBtn}
          >
            <Feather name="x" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={modalStyles.searchWrap}>
          <Feather
            name="search"
            size={16}
            color={colors.mutedText}
            style={{ marginRight: Spacing.sm }}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search…"
            placeholderTextColor={colors.mutedText}
            style={modalStyles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {items.length === 0 ? (
          <View style={modalStyles.emptyWrap}>
            <Text style={modalStyles.emptyText}>
              {emptyHint || "No options available."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.key}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            renderItem={({ item }) => {
              const isSelected = item.key === selectedKey;
              return (
                <Pressable
                  onPress={() => {
                    setQuery("");
                    onSelect(item);
                  }}
                  style={({ pressed }) => [
                    modalStyles.row,
                    isSelected && modalStyles.rowSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  {item.prefix ? (
                    <Text style={modalStyles.rowPrefix}>{item.prefix}</Text>
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={modalStyles.rowLabel}>{item.label}</Text>
                    {item.sublabel ? (
                      <Text style={modalStyles.rowSublabel}>
                        {item.sublabel}
                      </Text>
                    ) : null}
                  </View>
                  {isSelected ? (
                    <Feather name="check" size={18} color={colors.brand} />
                  ) : null}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View style={modalStyles.emptyWrap}>
                <Text style={modalStyles.emptyText}>
                  No matches for "{query}".
                </Text>
              </View>
            }
          />
        )}
      </View>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// Shared tappable field shell (mimics the screen's TextInput look)
// ----------------------------------------------------------------------------

type PickerFieldProps = {
  label: string;
  placeholder: string;
  value: string;        // human-readable selection
  required?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
};

function PickerField({
  label,
  placeholder,
  value,
  required,
  disabled,
  onPress,
  testID,
}: PickerFieldProps) {
  const { theme: colors } = useTheme();
  const pickerFieldStyles = useMemo(
    () => makePickerFieldStyles(colors),
    [colors],
  );
  return (
    <View style={pickerFieldStyles.group}>
      <Text style={pickerFieldStyles.label}>
        {label}
        {required ? " *" : ""}
      </Text>
      <Pressable
        onPress={disabled ? undefined : onPress}
        testID={testID}
        style={({ pressed }) => [
          pickerFieldStyles.field,
          disabled && pickerFieldStyles.fieldDisabled,
          pressed && !disabled && { opacity: 0.85 },
        ]}
      >
        <Text
          style={[
            pickerFieldStyles.value,
            !value && pickerFieldStyles.placeholder,
            disabled && { color: colors.mutedText },
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Feather
          name="chevron-down"
          size={18}
          color={disabled ? colors.mutedText : colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Country / State / City pickers
// ----------------------------------------------------------------------------

export type CountrySelection = {
  isoCode: string;   // "IN"
  name: string;      // "India"
  dialCode: string;  // "91" (no leading "+")
  flag: string;      // "🇮🇳"
};

export function getCountryByIso(isoCode: string | undefined): CountrySelection | null {
  if (!isoCode) return null;
  const c = Country.getCountryByCode(isoCode);
  if (!c) return null;
  return {
    isoCode: c.isoCode,
    name: c.name,
    dialCode: (c.phonecode || "").replace(/^\+/, ""),
    flag: c.flag,
  };
}

// Find the first country whose phonecode matches the given dial-code string.
// Some countries share dial codes (e.g. US/Canada both share "1") — we return
// the first match which matches `country-state-city`'s alphabetical order.
export function getCountryByDialCode(dial: string): CountrySelection | null {
  const normalized = String(dial || "").replace(/^\+/, "").trim();
  if (!normalized) return null;
  const all = Country.getAllCountries();
  const hit = all.find(
    (c) => (c.phonecode || "").replace(/^\+/, "") === normalized,
  );
  return hit
    ? { isoCode: hit.isoCode, name: hit.name, dialCode: normalized, flag: hit.flag }
    : null;
}

type CountryPickerProps = {
  value?: string; // iso code
  onChange: (sel: CountrySelection) => void;
  required?: boolean;
  label?: string;
};

export function CountryPicker({
  value,
  onChange,
  required,
  label = "Country",
}: CountryPickerProps) {
  const [open, setOpen] = useState(false);

  const items: PickerItem[] = useMemo(
    () =>
      Country.getAllCountries().map((c) => ({
        key: c.isoCode,
        label: c.name,
        sublabel: c.phonecode ? `+${c.phonecode.replace(/^\+/, "")}` : undefined,
        prefix: c.flag,
      })),
    [],
  );

  const selected = getCountryByIso(value);
  const displayValue = selected
    ? `${selected.flag ? selected.flag + " " : ""}${selected.name}`
    : "";

  return (
    <>
      <PickerField
        label={label}
        placeholder="Select country"
        value={displayValue}
        required={required}
        onPress={() => setOpen(true)}
        testID="picker-country"
      />
      <PickerModal
        visible={open}
        title="Select country"
        items={items}
        selectedKey={value}
        onClose={() => setOpen(false)}
        onSelect={(it) => {
          setOpen(false);
          const sel = getCountryByIso(it.key);
          if (sel) onChange(sel);
        }}
      />
    </>
  );
}

type StatePickerProps = {
  countryCode?: string;
  value?: string; // state iso code
  onChange: (state: { isoCode: string; name: string }) => void;
  required?: boolean;
  label?: string;
};

export function StatePicker({
  countryCode,
  value,
  onChange,
  required,
  label = "State / Region",
}: StatePickerProps) {
  const [open, setOpen] = useState(false);

  const items: PickerItem[] = useMemo(() => {
    if (!countryCode) return [];
    return State.getStatesOfCountry(countryCode).map((s) => ({
      key: s.isoCode,
      label: s.name,
    }));
  }, [countryCode]);

  const selectedName = useMemo(() => {
    if (!countryCode || !value) return "";
    const s = State.getStateByCodeAndCountry(value, countryCode);
    return s?.name || "";
  }, [countryCode, value]);

  return (
    <>
      <PickerField
        label={label}
        placeholder={
          !countryCode
            ? "Select country first"
            : items.length === 0
              ? "No states available"
              : "Select state"
        }
        value={selectedName}
        required={required}
        disabled={!countryCode || items.length === 0}
        onPress={() => setOpen(true)}
        testID="picker-state"
      />
      <PickerModal
        visible={open}
        title="Select state / region"
        items={items}
        selectedKey={value}
        onClose={() => setOpen(false)}
        onSelect={(it) => {
          setOpen(false);
          onChange({ isoCode: it.key, name: it.label });
        }}
        emptyHint="This country has no sub-regions in our directory."
      />
    </>
  );
}

type CityPickerProps = {
  countryCode?: string;
  stateCode?: string;
  value?: string;
  onChange: (cityName: string) => void;
  required?: boolean;
  label?: string;
  // When a country has no state list, we fall back to "any city in country".
  allowFreeText?: boolean;
};

export function CityPicker({
  countryCode,
  stateCode,
  value,
  onChange,
  required,
  label = "City",
  allowFreeText = true,
}: CityPickerProps) {
  const { theme: colors } = useTheme();
  const pickerFieldStyles = useMemo(
    () => makePickerFieldStyles(colors),
    [colors],
  );
  const [open, setOpen] = useState(false);
  const [freeText, setFreeText] = useState(value || "");

  const items: PickerItem[] = useMemo(() => {
    if (!countryCode) return [];
    const cities = stateCode
      ? City.getCitiesOfState(countryCode, stateCode)
      : City.getCitiesOfCountry(countryCode) || [];
    return cities.map((c) => ({
      key: `${c.name}|${c.stateCode || ""}`,
      label: c.name,
    }));
  }, [countryCode, stateCode]);

  // If the city directory is empty (smaller countries / territories) we fall
  // back to a plain TextInput so the user can still type a city name.
  if (countryCode && items.length === 0 && allowFreeText) {
    return (
      <View style={pickerFieldStyles.group}>
        <Text style={pickerFieldStyles.label}>
          {label}
          {required ? " *" : ""}
        </Text>
        <TextInput
          value={freeText}
          onChangeText={(t) => {
            setFreeText(t);
            onChange(t);
          }}
          placeholder="Type city name"
          placeholderTextColor={colors.mutedText}
          style={[
            pickerFieldStyles.field,
            { color: colors.text, fontSize: 15 },
          ]}
        />
      </View>
    );
  }

  return (
    <>
      <PickerField
        label={label}
        placeholder={
          !countryCode
            ? "Select country first"
            : items.length === 0
              ? "Select state first"
              : "Select city"
        }
        value={value || ""}
        required={required}
        disabled={!countryCode || items.length === 0}
        onPress={() => setOpen(true)}
        testID="picker-city"
      />
      <PickerModal
        visible={open}
        title="Select city"
        items={items}
        selectedKey={items.find((it) => it.label === value)?.key}
        onClose={() => setOpen(false)}
        onSelect={(it) => {
          setOpen(false);
          onChange(it.label);
        }}
      />
    </>
  );
}

// ----------------------------------------------------------------------------
// Phone + dial-code combo
// ----------------------------------------------------------------------------

type PhoneWithDialCodeProps = {
  dialCode: string;        // "91" (no leading "+")
  phone: string;           // local number, no dial code
  onChangeDialCode: (next: { dialCode: string; isoCode: string; name: string; flag: string }) => void;
  onChangePhone: (next: string) => void;
  // Notified when the user picks a different country from the dial-code
  // picker, so the parent can keep the Country field in sync.
  onCountryChange?: (sel: CountrySelection) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  isoCode?: string;        // currently selected country (for highlight + flag)
};

export function PhoneWithDialCode({
  dialCode,
  phone,
  onChangeDialCode,
  onChangePhone,
  onCountryChange,
  required,
  label = "Phone Number",
  placeholder = "Phone number",
  isoCode,
}: PhoneWithDialCodeProps) {
  const { theme: colors } = useTheme();
  const pickerFieldStyles = useMemo(
    () => makePickerFieldStyles(colors),
    [colors],
  );
  const phoneStyles = useMemo(() => makePhoneStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  const items: PickerItem[] = useMemo(
    () =>
      Country.getAllCountries()
        .filter((c) => !!c.phonecode)
        .map((c) => ({
          key: c.isoCode,
          label: c.name,
          sublabel: `+${c.phonecode.replace(/^\+/, "")}`,
          prefix: c.flag,
        })),
    [],
  );

  const flag = useMemo(() => {
    if (!isoCode) return "";
    return Country.getCountryByCode(isoCode)?.flag || "";
  }, [isoCode]);

  return (
    <View style={pickerFieldStyles.group}>
      <Text style={pickerFieldStyles.label}>
        {label}
        {required ? " *" : ""}
      </Text>
      <View style={phoneStyles.row}>
        <Pressable
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            phoneStyles.dialBtn,
            pressed && { opacity: 0.85 },
          ]}
          testID="picker-dial-code"
        >
          {flag ? <Text style={phoneStyles.dialFlag}>{flag}</Text> : null}
          <Text style={phoneStyles.dialText}>
            +{(dialCode || "").replace(/^\+/, "") || "—"}
          </Text>
          <Feather
            name="chevron-down"
            size={14}
            color={colors.textSecondary}
            style={{ marginLeft: 2 }}
          />
        </Pressable>
        <TextInput
          value={phone}
          onChangeText={onChangePhone}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedText}
          keyboardType="phone-pad"
          style={phoneStyles.input}
          testID="input-phone"
        />
      </View>

      <PickerModal
        visible={open}
        title="Select country code"
        items={items}
        selectedKey={isoCode}
        onClose={() => setOpen(false)}
        onSelect={(it) => {
          setOpen(false);
          const c = Country.getCountryByCode(it.key);
          if (!c) return;
          const dial = (c.phonecode || "").replace(/^\+/, "");
          onChangeDialCode({
            dialCode: dial,
            isoCode: c.isoCode,
            name: c.name,
            flag: c.flag,
          });
          // Keep parent's Country field in sync — picking a new dial code
          // implies the user is in that country.
          if (onCountryChange) {
            onCountryChange({
              isoCode: c.isoCode,
              name: c.name,
              dialCode: dial,
              flag: c.flag,
            });
          }
        }}
      />
    </View>
  );
}

// ----------------------------------------------------------------------------
// Styles
// ----------------------------------------------------------------------------

const makePickerFieldStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  group: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: Spacing.xs,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: colors.textSecondary,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    minHeight: Spacing.inputHeight,
  },
  fieldDisabled: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.85,
  },
  value: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  placeholder: {
    color: colors.mutedText,
  },
  });

const makePhoneStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  dialBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    borderTopLeftRadius: BorderRadius.md,
    borderBottomLeftRadius: BorderRadius.md,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceMuted,
    minHeight: Spacing.inputHeight,
  },
  dialFlag: {
    fontSize: 16,
    marginRight: 6,
  },
  dialText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  input: {
    flex: 1,
    borderTopRightRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
    color: colors.text,
    minHeight: Spacing.inputHeight,
  },
  });

const makeModalStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === "ios" ? Spacing.md : Spacing.xl,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  closeBtn: {
    padding: Spacing.xs,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceMuted,
  },
  searchInput: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    fontSize: 15,
    color: colors.text,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rowSelected: {
    backgroundColor: colors.brand + "10",
  },
  rowPrefix: {
    fontSize: 20,
    marginRight: Spacing.md,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.text,
    fontWeight: "500",
  },
  rowSublabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyWrap: {
    paddingVertical: Spacing["2xl"],
    alignItems: "center",
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 14,
  },
  });
