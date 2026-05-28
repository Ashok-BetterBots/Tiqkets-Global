import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { Organization, Payment, Subscription, SubscriptionPlan } from "@shared/schema";
import type { InvoiceSettings } from "@shared/invoice-settings";
import { DEFAULT_INVOICE_SETTINGS } from "@shared/invoice-settings";

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
  /**
   * Issuer + tax configuration loaded from `system_settings.invoice_settings`
   * (managed by Super Admin → System Settings → Invoice details). Caller
   * may omit; we fall back to the defaults from shared/invoice-settings.
   */
  settings?: InvoiceSettings;
}

/** Brand palette — kept in sync with the dashboard theme. */
const BRAND = "#8c1867";
const BRAND_DARK = "#6a1250";
const MUTED = "#64748B";
const DARK = "#0F172A";
const HAIRLINE = "#E2E8F0";
const TABLE_HEAD_BG = "#FBF1F7"; // brand-50-ish

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
 * Decide the GST breakdown for an Indian invoice.
 *
 *   - If the issuer doesn't have a GSTIN configured, we are not legally
 *     allowed to charge GST → no breakdown, "Taxes: Included" line only.
 *   - If prices are tax-exclusive we never collected tax on top, so the
 *     paid amount IS the base. Same display ("Included").
 *   - Otherwise back-calculate base + tax from the paid amount and split:
 *       intra-state (issuer state == customer state)  → CGST + SGST
 *       inter-state (or customer state unknown)       → IGST
 *
 * Returns amounts in MINOR units (paise) so callers can format with
 * formatMoney directly.
 */
function computeTaxBreakdown(
  paidMinor: number,
  settings: InvoiceSettings,
  customerState: string | null | undefined,
): {
  base: number;
  total: number;
  /** undefined when we have no breakdown to render */
  breakdown:
    | { kind: "cgst_sgst"; cgst: number; sgst: number; ratePercent: number }
    | { kind: "igst"; igst: number; ratePercent: number }
    | undefined;
} {
  const hasGstin = !!settings.issuerGstin;
  if (!hasGstin || !settings.pricesAreTaxInclusive || settings.gstRatePercent <= 0) {
    return { base: paidMinor, total: paidMinor, breakdown: undefined };
  }
  const rate = settings.gstRatePercent / 100;
  // Round to nearest paise; absorb any sub-paise drift into `tax` so
  // base + tax always equals exactly the paid amount.
  const base = Math.round(paidMinor / (1 + rate));
  const tax = paidMinor - base;
  const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
  const intraState =
    !!settings.issuerState && !!customerState && norm(settings.issuerState) === norm(customerState);
  if (intraState) {
    const cgst = Math.round(tax / 2);
    const sgst = tax - cgst;
    return {
      base,
      total: paidMinor,
      breakdown: { kind: "cgst_sgst", cgst, sgst, ratePercent: settings.gstRatePercent },
    };
  }
  return {
    base,
    total: paidMinor,
    breakdown: { kind: "igst", igst: tax, ratePercent: settings.gstRatePercent },
  };
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
  const {
    payment,
    organization,
    plan: currentPlan,
    periodStart: ctxPeriodStart,
    periodEnd: ctxPeriodEnd,
    billingCycle: ctxBillingCycle,
  } = ctx;
  const settings: InvoiceSettings = ctx.settings || DEFAULT_INVOICE_SETTINGS;

  // Prefer the immutable snapshot stamped on the payment row at
  // /verify-payment time. For legacy rows (pre-snapshot) those fields
  // are NULL and we fall back to whatever the caller passed in (which
  // is the current subscription's period/cycle/plan).
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
      Author: settings.issuerLegalName,
      Subject: payment.description || "Subscription payment",
      Creator: settings.issuerLegalName,
    },
  });

  // Stream-error handling (see prior version for the why).
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
      try { doc.end(); } catch { /* ignore */ }
    }
  });

  doc.pipe(res);

  const pageWidth = doc.page.width;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  // ---- Header bar -------------------------------------------------------
  //
  // The issuer legal name can be very long (e.g. "BETTERBOTS AI SOLUTIONS
  // PRIVATE LIMITED"), so we measure its rendered height first and grow
  // the maroon bar to fit. The right-side TAX INVOICE block is kept on
  // its own column with a fixed width, and we reserve a gap so the two
  // columns can never collide even on the longest names.
  const headerTop = 26;
  const headerNameFontSize = 18;
  const headerMetaWidth = 180;
  const headerGap = 16;
  const headerNameWidth = pageWidth - margin * 2 - headerMetaWidth - headerGap;

  doc.font("Helvetica-Bold").fontSize(headerNameFontSize);
  const nameHeight = doc.heightOfString(settings.issuerLegalName, {
    width: headerNameWidth,
  });
  doc.font("Helvetica").fontSize(9);
  const tagline = "Smart Queue & Booking Platform";
  const taglineHeight = doc.heightOfString(tagline, { width: headerNameWidth });
  const headerH = Math.max(88, headerTop + nameHeight + 6 + taglineHeight + 18);

  doc.rect(0, 0, pageWidth, headerH).fill(BRAND);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(headerNameFontSize)
    .text(settings.issuerLegalName, margin, headerTop, { width: headerNameWidth });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#F5E0EE")
    .text(tagline, margin, headerTop + nameHeight + 4, { width: headerNameWidth });

  // Invoice meta on the right — sits at the top of the bar regardless of
  // how tall the left column grows.
  const metaX = pageWidth - margin - headerMetaWidth;
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("TAX INVOICE", metaX, headerTop, { width: headerMetaWidth, align: "right" })
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#F5E0EE")
    .text(`No. ${invoiceNumber}`, metaX, headerTop + 22, {
      width: headerMetaWidth,
      align: "right",
    })
    .text(
      `Date ${formatDate(payment.paidAt || payment.createdAt)}`,
      metaX,
      headerTop + 36,
      { width: headerMetaWidth, align: "right" },
    );

  // ---- Bill-to / Bill-from columns -------------------------------------
  //
  // We render each address line and let PDFKit advance `doc.y`
  // automatically, then track the bottom of each column separately so
  // the next section starts below the taller of the two. This is what
  // prevents the wrapped legal-name line from colliding with the
  // wrapped address line (the original fixed-i*14 math couldn't know
  // the address had wrapped).
  const colTop = headerH + 24;
  const colWidth = (contentWidth - 24) / 2;
  const billToX = margin + colWidth + 24;

  const renderAddressBlock = (
    heading: string,
    name: string,
    lines: string[],
    x: number,
  ): number => {
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(heading, x, colTop, { width: colWidth });
    doc
      .fillColor(DARK)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(name, x, colTop + 14, { width: colWidth, lineGap: 1 });
    let y = doc.y + 4;
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
    for (const line of lines) {
      doc.text(line, x, y, { width: colWidth, lineGap: 1 });
      y = doc.y + 2;
    }
    return y;
  };

  const fromLines: string[] = [];
  for (const line of settings.issuerAddressLines) fromLines.push(line);
  const issuerCityLine = [settings.issuerCity, settings.issuerState, settings.issuerPincode]
    .filter(Boolean)
    .join(", ");
  if (issuerCityLine) fromLines.push(issuerCityLine);
  if (settings.issuerCountry) fromLines.push(settings.issuerCountry);
  if (settings.issuerEmail) fromLines.push(settings.issuerEmail);
  if (settings.issuerPhone) fromLines.push(settings.issuerPhone);
  if (settings.issuerGstin) fromLines.push(`GSTIN: ${settings.issuerGstin}`);
  if (settings.issuerPan) fromLines.push(`PAN: ${settings.issuerPan}`);

  const billToLines: string[] = [];
  if (organization.address) billToLines.push(organization.address);
  const cityLine = [organization.city, organization.state, organization.pincode]
    .filter(Boolean)
    .join(", ");
  if (cityLine) billToLines.push(cityLine);
  if (organization.email) billToLines.push(organization.email);
  if (organization.phone) billToLines.push(organization.phone);

  const fromBottom = renderAddressBlock("FROM", settings.issuerLegalName, fromLines, margin);
  const billToBottom = renderAddressBlock("BILL TO", organization.name, billToLines, billToX);
  const columnsBottom = Math.max(fromBottom, billToBottom);

  // Place-of-supply line under the columns (useful for B2B claims).
  let belowColumns = columnsBottom;
  if (organization.state || settings.issuerState) {
    const posY = columnsBottom + 10;
    doc
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text("PLACE OF SUPPLY", margin, posY);
    doc
      .fillColor(DARK)
      .font("Helvetica")
      .fontSize(10)
      .text(organization.state || settings.issuerState || "—", margin + 120, posY);
    belowColumns = posY + 18;
  }

  // ---- Line-item table -------------------------------------------------
  const tableTop = belowColumns + 16;
  const descColX = margin;
  const descColWidth = 240;
  const periodColX = descColX + descColWidth + 12;
  const periodColWidth = 160;
  const amountColX = periodColX + periodColWidth + 12;
  const amountColWidth = contentWidth - descColWidth - periodColWidth - 24;

  doc.rect(margin, tableTop, contentWidth, 28).fill(TABLE_HEAD_BG);
  doc
    .fillColor(DARK)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("DESCRIPTION", descColX + 10, tableTop + 9)
    .text("PERIOD", periodColX, tableTop + 9, { width: periodColWidth })
    .text("AMOUNT", amountColX, tableTop + 9, { width: amountColWidth, align: "right" });

  const rowTop = tableTop + 36;
  const planName = planLabel || "Subscription";
  const cycleLabel = formatBillingCycle(billingCycle);
  const periodLabel =
    periodStart && periodEnd
      ? `${formatDate(periodStart)} —\n${formatDate(periodEnd)}`
      : "—";

  doc
    .fillColor(DARK)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(`${planName} Plan`, descColX + 10, rowTop, { width: descColWidth - 10 })
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(
      `${cycleLabel}  ·  HSN/SAC: ${settings.hsnSacCode}`,
      descColX + 10,
      rowTop + 16,
      { width: descColWidth - 10 },
    )
    .fillColor(DARK)
    .fontSize(10)
    .text(periodLabel, periodColX, rowTop, { width: periodColWidth, lineGap: 2 })
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(DARK)
    .text(formatMoney(payment.amount, payment.currency), amountColX, rowTop, {
      width: amountColWidth,
      align: "right",
    });

  // ---- Totals block ----------------------------------------------------
  const breakdown = computeTaxBreakdown(payment.amount, settings, organization.state);
  const totalsTop = rowTop + 70;
  const totalsLabelX = pageWidth - margin - 240;
  const totalsValueX = pageWidth - margin - 110;

  doc
    .moveTo(totalsLabelX, totalsTop - 8)
    .lineTo(pageWidth - margin, totalsTop - 8)
    .strokeColor(HAIRLINE)
    .lineWidth(1)
    .stroke();

  let y = totalsTop;
  const writeRow = (label: string, value: string, opts2?: { strong?: boolean; accent?: boolean }) => {
    doc
      .fillColor(opts2?.strong ? DARK : MUTED)
      .font(opts2?.strong ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts2?.strong ? 13 : 10)
      .text(label, totalsLabelX, y, { width: 130 });
    doc
      .fillColor(opts2?.accent ? BRAND : DARK)
      .font(opts2?.strong ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts2?.strong ? 13 : 10)
      .text(value, totalsValueX, y, { width: 110, align: "right" });
    y += opts2?.strong ? 22 : 18;
  };

  writeRow("Subtotal", formatMoney(breakdown.base, payment.currency));
  if (breakdown.breakdown?.kind === "cgst_sgst") {
    const halfRate = breakdown.breakdown.ratePercent / 2;
    writeRow(`CGST (${halfRate}%)`, formatMoney(breakdown.breakdown.cgst, payment.currency));
    writeRow(`SGST (${halfRate}%)`, formatMoney(breakdown.breakdown.sgst, payment.currency));
  } else if (breakdown.breakdown?.kind === "igst") {
    writeRow(
      `IGST (${breakdown.breakdown.ratePercent}%)`,
      formatMoney(breakdown.breakdown.igst, payment.currency),
    );
  } else {
    writeRow("Taxes", "Included");
  }

  doc
    .moveTo(totalsLabelX, y)
    .lineTo(pageWidth - margin, y)
    .strokeColor(HAIRLINE)
    .lineWidth(1)
    .stroke();
  y += 10;
  writeRow("Total Paid", formatMoney(breakdown.total, payment.currency), { strong: true, accent: true });

  // ---- Payment details block -------------------------------------------
  const payTop = Math.max(y + 20, totalsTop + 140);
  doc
    .fillColor(MUTED)
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
    const ry = payTop + 18 + i * 16;
    doc
      .fillColor(MUTED)
      .text(label, margin, ry, { width: 120 })
      .fillColor(DARK)
      .text(value, margin + 130, ry, { width: contentWidth - 130 });
  }

  // ---- Footer ----------------------------------------------------------
  const footerY = doc.page.height - margin - 50;
  doc
    .moveTo(margin, footerY)
    .lineTo(pageWidth - margin, footerY)
    .strokeColor(HAIRLINE)
    .lineWidth(1)
    .stroke();
  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(9)
    .text(settings.footerNote, margin, footerY + 10, { width: contentWidth, align: "center" })
    .fillColor(BRAND_DARK)
    .text(settings.issuerWebsite, margin, footerY + 24, { width: contentWidth, align: "center" });

  doc.end();
}
