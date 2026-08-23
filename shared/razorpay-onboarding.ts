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