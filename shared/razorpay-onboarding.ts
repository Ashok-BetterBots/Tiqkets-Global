// Shared safe metadata contract. Never add bank/PAN/GST fields here: sensitive
// onboarding values are transit-only server request data.
export type OrganizerPayoutProfileView = {
  organizationId: string;
  accountId: string;
  status: string;
  accountType: string | null;
  businessName: string | null;
  contactName: string | null;
  email: string | null;
  phoneLast4: string | null;
  lastReconciledAt: Date | null;
  statusReason: string | null;
};

export const ACTIVE_ROUTE_ACCOUNT_STATUSES = new Set(["active", "activated"]);

// Ticket payments are an Event-account capability. Razorpay classifies this
// activity under its media-and-entertainment ticketing category—not the
// similarly named values that may look intuitive but are rejected upstream.
export const EVENT_ROUTE_BUSINESS_PROFILE = {
  category: "media_and_entertainment",
  subcategory: "ticketing",
} as const;