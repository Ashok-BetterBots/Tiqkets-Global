// ============================================================================
// shared/timezone.ts
// ----------------------------------------------------------------------------
// Country/region -> IANA timezone derivation, used at signup so we can stop
// defaulting every new branch to "Asia/Kolkata". All branch-side schedule
// data (working hours, breaks, holidays, booking slots, appointments) is
// stored as wall-clock strings and interpreted in the branch's IANA tz by
// server/branch-availability.ts — so picking the right tz here is what
// makes the rest "just work" for organisations outside India.
//
// The `country-state-city` package ships a `timezones` array on each
// Country object. For most countries it has exactly one entry and we just
// use it. For multi-timezone countries (US, RU, CA, BR, AU, MX, ID) the
// first entry is arbitrary, so we keep a small curated map of the most
// populous/representative zone. Anything not in the map falls through to
// the package's first timezone, and finally to "UTC" if even that is
// unavailable.
// ============================================================================

import { Country } from "country-state-city";

// Curated defaults for countries spanning multiple timezones. The chosen
// zone is the one covering the largest population / commercial capital —
// the org owner can still change it from branch settings if they're in a
// different region.
const MULTI_TZ_DEFAULTS: Record<string, string> = {
  US: "America/New_York",
  CA: "America/Toronto",
  RU: "Europe/Moscow",
  BR: "America/Sao_Paulo",
  AU: "Australia/Sydney",
  MX: "America/Mexico_City",
  ID: "Asia/Jakarta",
  AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago",
  KZ: "Asia/Almaty",
  CN: "Asia/Shanghai",
  CD: "Africa/Kinshasa",
  GL: "America/Nuuk",
};

// Try the runtime's IANA tz database for validity. Avoids us shipping a
// busted "Foo/Bar" string into the DB that would then throw every time
// Intl tried to format a date in it.
export function isValidIanaTimezone(tz: unknown): boolean {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Primary derivation: ISO-2 country code -> IANA tz. Returns null when we
// can't resolve the country at all; callers should fall back to "UTC".
export function getTimezoneForCountryIso(countryIso: string | undefined | null): string | null {
  if (!countryIso) return null;
  const iso = String(countryIso).toUpperCase();
  // Curated override wins so multi-tz countries get a sensible default.
  const curated = MULTI_TZ_DEFAULTS[iso];
  if (curated && isValidIanaTimezone(curated)) return curated;
  // Fall back to whatever country-state-city has on the country record.
  const country = Country.getCountryByCode(iso);
  if (!country) return null;
  const first = country.timezones?.[0]?.zoneName;
  if (first && isValidIanaTimezone(first)) return first;
  return null;
}

// All timezones the package knows about for a country (so the UI can show
// a follow-up "pick your region" dropdown when the country has more than
// one). Returns [] when the country can't be resolved.
export type CountryTimezoneOption = {
  zoneName: string;       // "America/New_York"
  gmtOffsetName: string;  // "UTC-05:00"
  abbreviation: string;   // "EST"
  tzName?: string;        // "Eastern Standard Time"
};

export function getTimezonesForCountryIso(
  countryIso: string | undefined | null,
): CountryTimezoneOption[] {
  if (!countryIso) return [];
  const country = Country.getCountryByCode(String(countryIso).toUpperCase());
  if (!country || !country.timezones) return [];
  return country.timezones.map((tz) => ({
    zoneName: tz.zoneName,
    gmtOffsetName: tz.gmtOffsetName,
    abbreviation: tz.abbreviation,
    tzName: tz.tzName,
  }));
}

// Fallback used everywhere a tz is structurally required but missing —
// "UTC" is the only sane no-op for time math.
export const DEFAULT_TIMEZONE = "UTC";
