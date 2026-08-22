export type RouteTransfer = {
  id?: string;
  status?: string;
  recipient?: string;
  account?: string;
  amount_reversed?: number | string | null;
  settlement_status?: string | null;
  recipient_settlement_id?: string | null;
  notes?: Record<string, unknown> | null;
  error?: { description?: string | null } | null;
  error_description?: string | null;
  source?: string | null;
  order_id?: string | null;
};

const ROUTE_TRANSFER_STATUSES = new Set([
  "created",
  "pending",
  "processed",
  "failed",
  "reversed",
  "partially_reversed",
]);

const ROUTE_SETTLEMENT_STATUSES = new Set(["pending", "on_hold", "settled"]);

export function routeOrderReceipt(allocationId: string): string {
  return `rt_${allocationId.replace(/-/g, "").slice(0, 37)}`;
}

export function routeOrderIdempotencyKey(allocationId: string, storedKey?: string | null): string {
  return storedKey || `route-order:${allocationId}`;
}

export function buildRouteOrderPayload(input: {
  amount: number;
  allocationId: string;
  registrationId: string;
  eventId: string;
  providerAccountId: string;
}) {
  return {
    amount: input.amount,
    currency: "INR",
    receipt: routeOrderReceipt(input.allocationId),
    notes: {
      type: "event_registration",
      registrationId: input.registrationId,
      eventId: input.eventId,
    },
    // Razorpay documents this as a boolean. Paid event registrations accept
    // one full payment only, never a partial payment.
    partial_payment: false,
    transfers: [{
      account: input.providerAccountId,
      amount: input.amount,
      currency: "INR",
      notes: {
        type: "event_registration_payout",
        registrationId: input.registrationId,
        eventId: input.eventId,
        allocationId: input.allocationId,
      },
      linked_account_notes: ["registrationId", "eventId", "allocationId"],
    }],
  };
}

export function extractRouteOrderTransfers(order: unknown): RouteTransfer[] {
  const body = order as { transfers?: { items?: unknown } | unknown[]; items?: unknown } | null;
  if (Array.isArray(body?.transfers)) return body.transfers as RouteTransfer[];
  if (Array.isArray(body?.transfers?.items)) return body.transfers.items as RouteTransfer[];
  // Older payloads and mocked responses occasionally expose the collection at
  // the root. Keep this fallback only for backwards-compatible reconciliation.
  return Array.isArray(body?.items) ? body.items as RouteTransfer[] : [];
}

export function selectRouteTransfer(
  transfers: RouteTransfer[],
  allocationId: string,
  providerAccountId?: string | null,
): RouteTransfer | null {
  return transfers.find((transfer) => String(transfer.notes?.allocationId || "") === allocationId)
    || transfers.find((transfer) => (
      String(transfer.recipient || transfer.account || "") === String(providerAccountId || "")
    ))
    || (transfers.length === 1 ? transfers[0] : null);
}

export function routeTransferStatus(value: unknown): string {
  const status = String(value || "").toLowerCase();
  return ROUTE_TRANSFER_STATUSES.has(status) ? status : "pending";
}

export function routeSettlementStatus(value: unknown): string {
  const status = String(value || "").toLowerCase();
  return ROUTE_SETTLEMENT_STATUSES.has(status) ? status : "pending";
}

export function localAllocationStatusForTransfer(status: unknown): string {
  switch (routeTransferStatus(status)) {
    case "processed":
      return "completed";
    case "failed":
      return "failed";
    case "reversed":
      return "reversed";
    case "partially_reversed":
      return "partially_reversed";
    default:
      return "processing";
  }
}

export function shouldUseAutomaticRouteReversal(input: {
  refundAmount: number;
  remainingAllocationAmount: number;
  transferCount: number;
}): boolean {
  return input.refundAmount >= input.remainingAllocationAmount || input.transferCount === 1;
}

export function routeRefundAmountForAttempt(input: {
  requestedAmount: number;
  persistedAmount: number;
  isRetry: boolean;
}): number {
  if (input.isRetry && input.requestedAmount !== input.persistedAmount) {
    throw new Error("A retry must use the original refund amount.");
  }
  return input.persistedAmount;
}

export function routeRefundStatus(value: unknown): "processing" | "succeeded" | "failed" {
  const status = String(value || "").toLowerCase();
  if (["processed", "succeeded"].includes(status)) return "succeeded";
  if (["failed", "rejected"].includes(status)) return "failed";
  return "processing";
}
