import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { Organization, Payment, Subscription, SubscriptionPlan } from "@shared/schema";

/**
 * Standard issuer details for the PDF header / footer. TIQKETS is the
 * platform vendor charging the customer (the organization). Kept here
 * as constants — these are static branding facts, not per-org or
 * per-plan data.
 */
const ISSUER = {
  name: "TIQKETS",
  tagline: "Smart Queue & Booking Platform",
  addressLines: ["TIQKETS Technologies", "support@tiqkets.in"],
  website: "tiqkets.in",
} as const;

export interface InvoicePdfContext {
  payment: Payment;
  organization: Organization;
  plan: SubscriptionPlan | null;
  subscription: Subscription | null;
  /**
   * The billing-cycle / period the payment was actually for. We snapshot
   * these from the subscription's pending* fields at /verify-payment time
   * and persist them on the payment row's description; for the PDF we
   * accept them explicitly so callers can pass either the snapshot or
   * fall back to the subscription's current period.
   */
  periodStart: Date | null;
  periodEnd: Date | null;
  billingCycle: string | null;
}

/**
 * Format a minor-currency-unit integer (e.g. paise for INR) as a human
 * readable string with the appropriate symbol/prefix.
 */
function formatMoney(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  const formatted = major.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === "INR") return `Rs. ${formatted}`;
  return `${currency} ${formatted}`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBillingCycle(cycle: string | null | undefined): string {
  if (!cycle) return "Subscription";
  if (cycle === "monthly") return "Monthly billing";
  if (cycle === "yearly") return "Yearly billing";
  return cycle.charAt(0).toUpperCase() + cycle.slice(1);
}

/**
 * Stream a one-page PDF invoice to the given Express response. Sets the
 * appropriate Content-Type / Content-Disposition headers and ends the
 * response on completion. The caller should NOT write further to `res`.
 *
 * We generate on-demand instead of persisting to disk because:
 *   - the payment row is already the source of truth (immutable post-
 *     capture); the PDF is purely a presentation of that row
 *   - Replit's deployment filesystem is ephemeral, so disk-backed
 *     receipts would silently disappear on the next deploy
 *   - regenerating is sub-100ms for a one-page document
 */
export function streamInvoicePdf(
  res: Response,
  ctx: InvoicePdfContext,
  opts: { mode: "view" | "download" } = { mode: "view" },
): void {
  const { payment, organization, plan: currentPlan, periodStart: ctxPeriodStart, periodEnd: ctxPeriodEnd, billingCycle: ctxBillingCycle } = ctx;
  // Prefer the immutable snapshot stamped on the payment row at
  // /verify-payment time. For legacy rows (pre-snapshot) those fields
  // are NULL and we fall back to whatever the caller passed in (which
  // is the current subscription's period/cycle/plan). The fallback is
  // not historically perfect for old rows, but it's the best we have
  // without a backfill.
  const periodStart = payment.periodStartSnapshot ?? ctxPeriodStart;
  const periodEnd = payment.periodEndSnapshot ?? ctxPeriodEnd;
  const billingCycle = payment.billingCycleSnapshot ?? ctxBillingCycle;
  const planLabel = payment.planSnapshotName ?? currentPlan?.name ?? null;
  const invoiceNumber = payment.invoiceNumber || payment.id.slice(0, 8).toUpperCase();
  const filename = `${invoiceNumber}.pdf`;
  const disposition = opts.mode === "download" ? "attachment" : "inline";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
  // Receipts are immutable; a long browser cache is safe.
  res.setHeader("Cache-Control", "private, max-age=86400");

  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: {
      Title: `Invoice ${invoiceNumber}`,
      Author: ISSUER.name,
      Subject: payment.description || "Subscription payment",
      Creator: ISSUER.name,
    },
  });

  // Stream-error handling: pdfkit emits 'error' on the doc stream when
  // it can't produce output (e.g. font missing); the response stream
  // emits 'error' if the client disconnects mid-flight. Without these
  // listeners those errors crash the process. We log + best-effort end
  // the response. If the client closes early, abort PDF generation so
  // we don't keep buffering bytes for nobody.
  doc.on("error", (err) => {
    console.error("[invoice-pdf] doc stream error:", err);
    try { if (!res.writableEnded) res.end(); } catch { /* ignore */ }
  });
  res.on("error", (err) => {
    console.error("[invoice-pdf] response stream error:", err);
    try { doc.end(); } catch { /* ignore */ }
  });
  res.on("close", () => {
    if (!res.writableEnded) {
      // Client went away before we finished writing. Stop generating.
      try { doc.end(); } catch { /* ignore */ }
    }
  });

  doc.pipe(res);

  // ---- Layout constants -------------------------------------------------
  const pageWidth = doc.page.width;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const accent = "#0EA5E9";
  const muted = "#64748B";
  const dark = "#0F172A";

  // ---- Header bar -------------------------------------------------------
  doc
    .rect(0, 0, pageWidth, 110)
    .fill(accent);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(28)
    .text(ISSUER.name, margin, 32)
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#E0F2FE")
    .text(ISSUER.tagline, margin, 64);

  // Invoice meta on the right
  const metaX = pageWidth - margin - 200;
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("INVOICE", metaX, 32, { width: 200, align: "right" })
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#E0F2FE")
    .text(`No. ${invoiceNumber}`, metaX, 60, { width: 200, align: "right" })
    .text(`Date ${formatDate(payment.paidAt || payment.createdAt)}`, metaX, 75, { width: 200, align: "right" });

  // ---- Bill-to / Bill-from columns -------------------------------------
  const colTop = 140;
  const colWidth = (contentWidth - 24) / 2;

  doc
    .fillColor(muted)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("FROM", margin, colTop)
    .fillColor(dark)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(ISSUER.name, margin, colTop + 14)
    .font("Helvetica")
    .fontSize(10)
    .fillColor(muted);
  for (let i = 0; i < ISSUER.addressLines.length; i++) {
    doc.text(ISSUER.addressLines[i], margin, colTop + 30 + i * 14);
  }

  const billToX = margin + colWidth + 24;
  doc
    .fillColor(muted)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("BILL TO", billToX, colTop)
    .fillColor(dark)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(organization.name, billToX, colTop + 14, { width: colWidth })
    .font("Helvetica")
    .fontSize(10)
    .fillColor(muted);

  const billToLines: string[] = [];
  if (organization.address) billToLines.push(organization.address);
  const cityLine = [organization.city, organization.state, organization.pincode].filter(Boolean).join(", ");
  if (cityLine) billToLines.push(cityLine);
  if (organization.email) billToLines.push(organization.email);
  if (organization.phone) billToLines.push(organization.phone);

  for (let i = 0; i < billToLines.length; i++) {
    doc.text(billToLines[i], billToX, colTop + 30 + i * 14, { width: colWidth });
  }

  // ---- Line-item table -------------------------------------------------
  const tableTop = 280;
  // Column geometry: description | period | amount
  const descColX = margin;
  const descColWidth = 240;
  const periodColX = descColX + descColWidth + 12;
  const periodColWidth = 160;
  const amountColX = periodColX + periodColWidth + 12;
  const amountColWidth = contentWidth - descColWidth - periodColWidth - 24;

  // Table header row (filled background)
  doc
    .rect(margin, tableTop, contentWidth, 28)
    .fill("#F1F5F9");
  doc
    .fillColor(dark)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("DESCRIPTION", descColX + 10, tableTop + 9)
    .text("PERIOD", periodColX, tableTop + 9, { width: periodColWidth })
    .text("AMOUNT", amountColX, tableTop + 9, { width: amountColWidth, align: "right" });

  // Single line item
  const rowTop = tableTop + 36;
  const planName = planLabel || "Subscription";
  const cycleLabel = formatBillingCycle(billingCycle);
  const periodLabel =
    periodStart && periodEnd
      ? `${formatDate(periodStart)} —\n${formatDate(periodEnd)}`
      : "—";

  doc
    .fillColor(dark)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`${planName} Plan`, descColX + 10, rowTop, { width: descColWidth - 10 })
    .font("Helvetica")
    .fontSize(10)
    .fillColor(muted)
    .text(cycleLabel, descColX + 10, rowTop + 16, { width: descColWidth - 10 })
    .fillColor(dark)
    .fontSize(10)
    .text(periodLabel, periodColX, rowTop, { width: periodColWidth, lineGap: 2 })
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(dark)
    .text(formatMoney(payment.amount, payment.currency), amountColX, rowTop, {
      width: amountColWidth,
      align: "right",
    });

  // ---- Totals block ----------------------------------------------------
  const totalsTop = rowTop + 70;
  const totalsLabelX = pageWidth - margin - 220;
  const totalsValueX = pageWidth - margin - 100;

  doc
    .moveTo(totalsLabelX, totalsTop - 8)
    .lineTo(pageWidth - margin, totalsTop - 8)
    .strokeColor("#E2E8F0")
    .lineWidth(1)
    .stroke();

  doc
    .fillColor(muted)
    .font("Helvetica")
    .fontSize(10)
    .text("Subtotal", totalsLabelX, totalsTop, { width: 120 })
    .fillColor(dark)
    .text(formatMoney(payment.amount, payment.currency), totalsValueX, totalsTop, {
      width: 100,
      align: "right",
    })
    .fillColor(muted)
    .text("Taxes", totalsLabelX, totalsTop + 18, { width: 120 })
    .fillColor(dark)
    .text("Included", totalsValueX, totalsTop + 18, { width: 100, align: "right" });

  doc
    .moveTo(totalsLabelX, totalsTop + 42)
    .lineTo(pageWidth - margin, totalsTop + 42)
    .strokeColor("#E2E8F0")
    .lineWidth(1)
    .stroke();

  doc
    .fillColor(dark)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text("Total Paid", totalsLabelX, totalsTop + 50, { width: 120 })
    .fillColor(accent)
    .text(formatMoney(payment.amount, payment.currency), totalsValueX, totalsTop + 50, {
      width: 100,
      align: "right",
    });

  // ---- Payment details block -------------------------------------------
  const payTop = totalsTop + 110;
  doc
    .fillColor(muted)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("PAYMENT DETAILS", margin, payTop);

  const detailRows: Array<[string, string]> = [
    ["Status", (payment.status || "captured").toUpperCase()],
    ["Paid On", formatDate(payment.paidAt || payment.createdAt)],
    ["Payment Method", payment.paymentMethod || "Razorpay"],
  ];
  if (payment.razorpayPaymentId) detailRows.push(["Payment ID", payment.razorpayPaymentId]);
  if (payment.razorpayOrderId) detailRows.push(["Order ID", payment.razorpayOrderId]);

  doc.font("Helvetica").fontSize(10);
  for (let i = 0; i < detailRows.length; i++) {
    const [label, value] = detailRows[i];
    const y = payTop + 18 + i * 16;
    doc
      .fillColor(muted)
      .text(label, margin, y, { width: 120 })
      .fillColor(dark)
      .text(value, margin + 130, y, { width: contentWidth - 130 });
  }

  // ---- Footer ----------------------------------------------------------
  const footerY = doc.page.height - margin - 50;
  doc
    .moveTo(margin, footerY)
    .lineTo(pageWidth - margin, footerY)
    .strokeColor("#E2E8F0")
    .lineWidth(1)
    .stroke();
  doc
    .fillColor(muted)
    .font("Helvetica")
    .fontSize(9)
    .text(
      "Thank you for choosing TIQKETS. This is a system-generated invoice and does not require a signature.",
      margin,
      footerY + 10,
      { width: contentWidth, align: "center" },
    )
    .text(`${ISSUER.website}`, margin, footerY + 24, { width: contentWidth, align: "center" });

  doc.end();
}
