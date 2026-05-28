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
  const pageHeight = doc.page.height;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const rightEdge = pageWidth - margin;

  // Tiny helpers — keep the rendering code below readable. Each one
  // resets font/colour explicitly so callers never inherit stale state.
  const setText = (font: string, size: number, color: string) => {
    doc.font(font).fontSize(size).fillColor(color);
  };
  const drawRule = (x1: number, y: number, x2: number, color = HAIRLINE) => {
    doc.moveTo(x1, y).lineTo(x2, y).strokeColor(color).lineWidth(1).stroke();
  };

  // =====================================================================
  // 1. HEADER — clean white header with a thin brand rule on top.
  //    Logo square + company name on the left; "TAX INVOICE", number,
  //    date, and STATUS pill on the right. No giant filled block.
  // =====================================================================

  // 3px brand rule at the very top edge of the page.
  doc.rect(0, 0, pageWidth, 3).fill(BRAND);

  const headerTop = margin;
  const logoSize = 38;
  const logoX = margin;
  const logoY = headerTop;
  // Brand-tinted rounded square as a stand-in logo mark (the issuer
  // initial is centred inside it).
  doc
    .roundedRect(logoX, logoY, logoSize, logoSize, 8)
    .fillColor(BRAND)
    .fill();
  const initial = (settings.issuerLegalName.trim()[0] || "T").toUpperCase();
  setText("Helvetica-Bold", 20, "#FFFFFF");
  doc.text(initial, logoX, logoY + 9, { width: logoSize, align: "center" });

  // Company name + tagline to the right of the logo. We measure the
  // wrapped name height so the tagline always sits just below it and
  // the right-side meta column has a generous fixed width that the
  // name's wrap-width respects.
  const metaColWidth = 180;
  const nameX = logoX + logoSize + 14;
  const nameWidth = rightEdge - metaColWidth - 20 - nameX;

  setText("Helvetica-Bold", 14, DARK);
  const issuerNameHeight = doc.heightOfString(settings.issuerLegalName, {
    width: nameWidth,
  });
  doc.text(settings.issuerLegalName, nameX, logoY + 2, {
    width: nameWidth,
    lineGap: 1,
  });
  setText("Helvetica", 9, MUTED);
  doc.text("Smart Queue & Booking Platform", nameX, logoY + 4 + issuerNameHeight, {
    width: nameWidth,
  });

  // Right column — TAX INVOICE label, number, date, status pill.
  const metaX = rightEdge - metaColWidth;
  setText("Helvetica-Bold", 16, DARK);
  doc.text("TAX INVOICE", metaX, headerTop, {
    width: metaColWidth,
    align: "right",
  });

  setText("Helvetica", 9, MUTED);
  doc.text("Invoice No.", metaX, headerTop + 24, {
    width: metaColWidth,
    align: "right",
  });
  setText("Helvetica-Bold", 9.5, DARK);
  doc.text(invoiceNumber, metaX, headerTop + 36, {
    width: metaColWidth,
    align: "right",
  });

  setText("Helvetica", 9, MUTED);
  doc.text("Issue Date", metaX, headerTop + 52, {
    width: metaColWidth,
    align: "right",
  });
  setText("Helvetica-Bold", 9.5, DARK);
  doc.text(
    formatDate(payment.paidAt || payment.createdAt),
    metaX,
    headerTop + 64,
    { width: metaColWidth, align: "right" },
  );

  // PAID status pill, right-aligned under the date.
  const statusText = (payment.status || "captured").toUpperCase() === "CAPTURED" ? "PAID" : (payment.status || "").toUpperCase();
  setText("Helvetica-Bold", 8.5, "#0F5132");
  const pillTextWidth = doc.widthOfString(statusText);
  const pillW = pillTextWidth + 16;
  const pillH = 16;
  const pillX = rightEdge - pillW;
  const pillY = headerTop + 80;
  doc
    .roundedRect(pillX, pillY, pillW, pillH, pillH / 2)
    .fillColor("#D1FADF")
    .fill();
  setText("Helvetica-Bold", 8.5, "#0F5132");
  doc.text(statusText, pillX, pillY + 4, { width: pillW, align: "center" });

  // Where the rest of the document starts (below the taller of the
  // two header columns).
  const headerBottom = Math.max(
    logoY + Math.max(logoSize, issuerNameHeight + 18),
    pillY + pillH,
  );

  // Thin hairline divider beneath the header.
  drawRule(margin, headerBottom + 14, rightEdge);

  // =====================================================================
  // 2. BILLED FROM / BILLED TO — two equal columns with section labels.
  // =====================================================================
  const billTop = headerBottom + 28;
  const colGap = 24;
  const colWidth = (contentWidth - colGap) / 2;
  const billToX = margin + colWidth + colGap;

  const renderParty = (
    label: string,
    name: string,
    lines: string[],
    x: number,
  ): number => {
    setText("Helvetica-Bold", 8.5, MUTED);
    doc.text(label, x, billTop, { width: colWidth, characterSpacing: 0.6 });

    setText("Helvetica-Bold", 11.5, DARK);
    doc.text(name, x, billTop + 14, { width: colWidth, lineGap: 1.5 });

    let y = doc.y + 4;
    setText("Helvetica", 9.5, "#475569");
    for (const line of lines) {
      doc.text(line, x, y, { width: colWidth, lineGap: 2 });
      y = doc.y + 1;
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

  const fromBottom = renderParty("BILLED FROM", settings.issuerLegalName, fromLines, margin);
  const billToBottom = renderParty("BILLED TO", organization.name, billToLines, billToX);
  let cursorY = Math.max(fromBottom, billToBottom) + 18;

  // Place-of-supply chip row — only when we actually know the customer's
  // or issuer's state, useful for B2B GST claims.
  if (organization.state || settings.issuerState) {
    setText("Helvetica-Bold", 8.5, MUTED);
    doc.text("PLACE OF SUPPLY", margin, cursorY, { characterSpacing: 0.6 });
    setText("Helvetica", 10, DARK);
    doc.text(organization.state || settings.issuerState || "—", margin + 130, cursorY);
    cursorY += 22;
  }

  drawRule(margin, cursorY + 2, rightEdge);
  cursorY += 18;

  // =====================================================================
  // 3. INVOICE ITEMS — clean table with hairline borders and generous
  //    row padding. Right-aligned currency.
  // =====================================================================
  setText("Helvetica-Bold", 8.5, MUTED);
  doc.text("INVOICE ITEMS", margin, cursorY, { characterSpacing: 0.6 });
  cursorY += 16;

  const descColX = margin;
  const amountColWidth = 110;
  const periodColWidth = 150;
  const descColWidth = contentWidth - amountColWidth - periodColWidth - 24;
  const periodColX = descColX + descColWidth + 12;
  const amountColX = periodColX + periodColWidth + 12;

  // Table header — subtle brand-tinted strip, no heavy fill.
  const tableHeaderH = 26;
  doc.rect(margin, cursorY, contentWidth, tableHeaderH).fill(TABLE_HEAD_BG);
  setText("Helvetica-Bold", 9, BRAND_DARK);
  doc.text("DESCRIPTION", descColX + 12, cursorY + 9, {
    width: descColWidth - 12,
    characterSpacing: 0.5,
  });
  doc.text("PERIOD", periodColX, cursorY + 9, {
    width: periodColWidth,
    characterSpacing: 0.5,
  });
  doc.text("AMOUNT", amountColX, cursorY + 9, {
    width: amountColWidth,
    align: "right",
    characterSpacing: 0.5,
  });
  cursorY += tableHeaderH;

  // Item row — measure the tallest cell to size the row.
  const rowTopPadding = 14;
  const rowBottomPadding = 14;
  const planName = planLabel || "Subscription";
  const cycleLabel = formatBillingCycle(billingCycle);
  const periodLabel =
    periodStart && periodEnd
      ? `${formatDate(periodStart)} —\n${formatDate(periodEnd)}`
      : "—";

  setText("Helvetica-Bold", 11, DARK);
  const planHeight = doc.heightOfString(`${planName} Plan`, {
    width: descColWidth - 24,
  });
  setText("Helvetica", 9, MUTED);
  const subHeight = doc.heightOfString(
    `${cycleLabel}  ·  HSN/SAC: ${settings.hsnSacCode}`,
    { width: descColWidth - 24 },
  );
  setText("Helvetica", 10, DARK);
  const periodHeight = doc.heightOfString(periodLabel, {
    width: periodColWidth,
    lineGap: 2,
  });
  const cellContentH = Math.max(planHeight + 6 + subHeight, periodHeight);
  const rowH = rowTopPadding + cellContentH + rowBottomPadding;

  // Render row contents.
  const rowContentY = cursorY + rowTopPadding;
  setText("Helvetica-Bold", 11, DARK);
  doc.text(`${planName} Plan`, descColX + 12, rowContentY, {
    width: descColWidth - 24,
  });
  setText("Helvetica", 9, MUTED);
  doc.text(
    `${cycleLabel}  ·  HSN/SAC: ${settings.hsnSacCode}`,
    descColX + 12,
    rowContentY + planHeight + 6,
    { width: descColWidth - 24 },
  );
  setText("Helvetica", 10, DARK);
  doc.text(periodLabel, periodColX, rowContentY, {
    width: periodColWidth,
    lineGap: 2,
  });
  setText("Helvetica-Bold", 11, DARK);
  doc.text(formatMoney(payment.amount, payment.currency), amountColX, rowContentY, {
    width: amountColWidth,
    align: "right",
  });

  cursorY += rowH;
  drawRule(margin, cursorY, rightEdge);
  cursorY += 8;

  // =====================================================================
  // 4. SUMMARY (totals) — right-aligned, clear hierarchy. Total Paid in
  //    brand colour at a larger size.
  // =====================================================================
  const breakdown = computeTaxBreakdown(payment.amount, settings, organization.state);
  const summaryWidth = 240;
  const summaryX = rightEdge - summaryWidth;
  const summaryLabelW = 140;
  const summaryValueW = summaryWidth - summaryLabelW;

  const writeSummaryRow = (
    label: string,
    value: string,
    options?: { strong?: boolean; accent?: boolean },
  ) => {
    const labelColor = options?.strong ? DARK : MUTED;
    const valueColor = options?.accent ? BRAND : DARK;
    const labelFont = options?.strong ? "Helvetica-Bold" : "Helvetica";
    const valueFont = options?.strong ? "Helvetica-Bold" : "Helvetica";
    const size = options?.strong ? 13 : 10;
    setText(labelFont, size, labelColor);
    doc.text(label, summaryX, cursorY, { width: summaryLabelW });
    setText(valueFont, options?.accent ? 16 : size, valueColor);
    doc.text(value, summaryX + summaryLabelW, cursorY, {
      width: summaryValueW,
      align: "right",
    });
    cursorY += options?.accent ? 26 : 20;
  };

  cursorY += 6;
  writeSummaryRow("Subtotal", formatMoney(breakdown.base, payment.currency));
  if (breakdown.breakdown?.kind === "cgst_sgst") {
    const halfRate = breakdown.breakdown.ratePercent / 2;
    writeSummaryRow(`CGST (${halfRate}%)`, formatMoney(breakdown.breakdown.cgst, payment.currency));
    writeSummaryRow(`SGST (${halfRate}%)`, formatMoney(breakdown.breakdown.sgst, payment.currency));
  } else if (breakdown.breakdown?.kind === "igst") {
    writeSummaryRow(
      `IGST (${breakdown.breakdown.ratePercent}%)`,
      formatMoney(breakdown.breakdown.igst, payment.currency),
    );
  } else {
    writeSummaryRow("Taxes", "Included");
  }
  drawRule(summaryX, cursorY + 2, rightEdge);
  cursorY += 12;
  writeSummaryRow("Total Paid", formatMoney(breakdown.total, payment.currency), {
    strong: true,
    accent: true,
  });

  // =====================================================================
  // 5. PAYMENT DETAILS — compact 2-column grid below the summary block.
  // =====================================================================
  cursorY += 16;
  drawRule(margin, cursorY, rightEdge);
  cursorY += 16;

  setText("Helvetica-Bold", 8.5, MUTED);
  doc.text("PAYMENT DETAILS", margin, cursorY, { characterSpacing: 0.6 });
  cursorY += 16;

  const detailRows: Array<[string, string]> = [
    ["Status", (payment.status || "captured").toUpperCase()],
    ["Paid On", formatDate(payment.paidAt || payment.createdAt)],
    ["Payment Method", payment.paymentMethod || "Razorpay"],
  ];
  if (payment.razorpayPaymentId) detailRows.push(["Payment ID", payment.razorpayPaymentId]);
  if (payment.razorpayOrderId) detailRows.push(["Order ID", payment.razorpayOrderId]);

  // Two-column grid: split rows roughly in half so the block stays
  // compact even with 5+ rows. Row height is auto-tightened when the
  // vertical budget to the pinned footer is small — this is the
  // overflow guard that keeps everything on one A4 page even when the
  // FROM/BILL TO blocks are very tall.
  const halfCount = Math.ceil(detailRows.length / 2);
  const gridColW = (contentWidth - 32) / 2;
  const gridLeftX = margin;
  const gridRightX = margin + gridColW + 32;
  const footerY = pageHeight - margin - 44;
  // Space remaining for the details grid (leave 12pt breathing room
  // above the footer rule). Choose the largest cell height we can
  // afford in the range [22, 32] so dense invoices still fit.
  const detailsBudget = footerY - 12 - cursorY;
  const idealCellH = 32;
  const minCellH = 22;
  const cellH = Math.max(
    minCellH,
    Math.min(idealCellH, Math.floor(detailsBudget / halfCount)),
  );

  const drawDetailCell = (label: string, value: string, x: number, y: number) => {
    setText("Helvetica", 8.5, MUTED);
    doc.text(label, x, y, { width: gridColW, characterSpacing: 0.4 });
    setText("Helvetica-Bold", 10, DARK);
    doc.text(value, x, y + 12, { width: gridColW, lineBreak: false, ellipsis: true });
  };

  for (let i = 0; i < detailRows.length; i++) {
    const [label, value] = detailRows[i];
    const col = i < halfCount ? gridLeftX : gridRightX;
    const row = i < halfCount ? i : i - halfCount;
    drawDetailCell(label, value, col, cursorY + row * cellH);
  }
  cursorY += halfCount * cellH;

  // =====================================================================
  // 6. FOOTER — pinned to the bottom of the page with a hairline rule.
  // =====================================================================
  drawRule(margin, footerY, rightEdge);
  setText("Helvetica", 9, MUTED);
  doc.text(settings.footerNote, margin, footerY + 12, {
    width: contentWidth,
    align: "center",
  });
  setText("Helvetica-Bold", 9, BRAND_DARK);
  doc.text(settings.issuerWebsite, margin, footerY + 26, {
    width: contentWidth,
    align: "center",
  });

  doc.end();
}
