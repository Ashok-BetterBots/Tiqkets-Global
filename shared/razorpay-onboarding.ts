import { City, State } from "country-state-city";

export type OnboardingOption = { value: string; label: string };

// These are the entity types accepted by Razorpay Route linked accounts.
export const RAZORPAY_BUSINESS_TYPES: OnboardingOption[] = [
  { value: "individual", label: "Individual" },
  { value: "proprietorship", label: "Sole proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "private_limited", label: "Private limited company" },
  { value: "public_limited", label: "Public limited company" },
  { value: "llp", label: "Limited liability partnership" },
  { value: "trust", label: "Trust" },
  { value: "society", label: "Society" },
];

// Ticket Payments is available only to event organisations. Keep the provider
// category constrained to the Route value used for event organisers instead of
// exposing unrelated categories which Razorpay could reject during review.
export const RAZORPAY_EVENT_CATEGORIES = [{
  value: "events_and_entertainment",
  label: "Events & entertainment",
  subcategories: [{ value: "event_management", label: "Event management" }],
}] as const;

// Razorpay treats business_model as a business description rather than an enum.
// Controlled choices keep the experience consistent while serialising to valid
// human-readable descriptions for the provider.
export const RAZORPAY_EVENT_BUSINESS_MODELS: OnboardingOption[] = [
  { value: "Ticketed live events and experiences", label: "Ticketed live events & experiences" },
  { value: "Cultural and community events", label: "Cultural & community events" },
  { value: "Music and entertainment events", label: "Music & entertainment events" },
  { value: "Sports and recreation events", label: "Sports & recreation events" },
  { value: "Religious and spiritual events", label: "Religious & spiritual events" },
  { value: "Professional conferences and exhibitions", label: "Conferences & exhibitions" },
];

export const RAZORPAY_BANK_ACCOUNT_TYPES: OnboardingOption[] = [
  { value: "savings", label: "Savings account" },
  { value: "current", label: "Current account" },
];

export const INDIA_STATES: OnboardingOption[] = State.getStatesOfCountry("IN")
  .map((state) => ({ value: state.isoCode, label: state.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function getIndiaCities(stateCode: string): OnboardingOption[] {
  return City.getCitiesOfState("IN", stateCode)
    .map((city) => ({ value: city.name, label: city.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getRazorpaySubcategories(category: string): OnboardingOption[] {
  return RAZORPAY_EVENT_CATEGORIES.find((item) => item.value === category)?.subcategories.slice() || [];
}

export function isRazorpayBusinessType(value: string): boolean {
  return RAZORPAY_BUSINESS_TYPES.some((item) => item.value === value);
}

export function isRazorpayCategory(value: string): boolean {
  return RAZORPAY_EVENT_CATEGORIES.some((item) => item.value === value);
}

export function isRazorpaySubcategory(category: string, value: string): boolean {
  return getRazorpaySubcategories(category).some((item) => item.value === value);
}

export function isRazorpayBusinessModel(value: string): boolean {
  return RAZORPAY_EVENT_BUSINESS_MODELS.some((item) => item.value === value);
}

export function isIndiaState(value: string): boolean {
  return INDIA_STATES.some((item) => item.value === value);
}

export function isIndiaCity(stateCode: string, city: string): boolean {
  return getIndiaCities(stateCode).some((item) => item.value === city);
}

export function isRazorpayBankAccountType(value: string): boolean {
  return RAZORPAY_BANK_ACCOUNT_TYPES.some((item) => item.value === value);
}