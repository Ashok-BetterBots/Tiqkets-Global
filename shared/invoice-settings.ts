/**
 * Invoice configuration shared between the Super Admin editor, the API
 * layer, and the PDF generator. Stored as a single JSONB row in
 * `system_settings` under the key `invoice_settings`, so adding a new
 * field never requires a DB migration.
 *
 * Every field has a default below. `normalizeInvoiceSettings` accepts
 * untrusted input (from the PUT route OR a legacy stored row) and
 * returns a canonical, fully-populated object — callers never have to
 * worry about missing keys, null vs undefined, or extra junk.
 */
export interface InvoiceSettings {
  // Issuer (TIQKETS) — these print in the "From" block on every invoice.
  issuerLegalName: string;
  /** Multi-line postal address. Up to 6 lines, trimmed, blanks dropped. */
  issuerAddressLines: string[];
  issuerCity: string | null;
  /** Place of supply. Used to decide CGST+SGST (intra-state) vs IGST. */
  issuerState: string | null;
  issuerPincode: string | null;
  issuerCountry: string;
  /** 15-char GSTIN. When empty, the PDF skips the tax breakdown. */
  issuerGstin: string | null;
  /** 10-char PAN. Optional but standard on Indian B2B invoices. */
  issuerPan: string | null;
  issuerEmail: string;
  issuerPhone: string | null;
  issuerWebsite: string;

  // Tax + line-item metadata
  /** Whole-number percent, e.g. 18 for 18% GST. */
  gstRatePercent: number;
  /** HSN/SAC code printed in the line-item description. */
  hsnSacCode: string;
  /**
   * true  → plan prices already include GST; the PDF back-calculates
   *         base + tax from the paid amount.
   * false → plan prices are exclusive; the PDF shows "Taxes: Included"
   *         (we never actually charged tax on top, so there's nothing
   *         to break down).
   */
  pricesAreTaxInclusive: boolean;

  // Cosmetic
  invoiceNumberPrefix: string;
  footerNote: string;
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  issuerLegalName: "TIQKETS Technologies",
  issuerAddressLines: [],
  issuerCity: null,
  issuerState: null,
  issuerPincode: null,
  issuerCountry: "India",
  issuerGstin: null,
  issuerPan: null,
  issuerEmail: "support@tiqkets.in",
  issuerPhone: null,
  issuerWebsite: "tiqkets.in",
  gstRatePercent: 18,
  hsnSacCode: "998314",
  pricesAreTaxInclusive: true,
  invoiceNumberPrefix: "INV",
  footerNote:
    "Thank you for choosing TIQKETS. This is a system-generated invoice and does not require a signature.",
};

/**
 * Coerce arbitrary input into a fully-valid InvoiceSettings. Trims
 * strings, drops empties, clamps the GST rate to [0, 100], and falls
 * back to the default for any missing or wrong-typed field.
 */
export function normalizeInvoiceSettings(raw: unknown): InvoiceSettings {
  const d = DEFAULT_INVOICE_SETTINGS;
  if (!raw || typeof raw !== "object") return { ...d, issuerAddressLines: [...d.issuerAddressLines] };
  const r = raw as Record<string, unknown>;

  const str = (v: unknown, def: string): string =>
    typeof v === "string" ? v.trim() : def;
  const strOrNull = (v: unknown, def: string | null): string | null => {
    if (v === null) return null;
    if (typeof v !== "string") return def;
    const t = v.trim();
    return t === "" ? null : t;
  };
  const lines = (v: unknown): string[] => {
    if (Array.isArray(v)) {
      return v
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6);
    }
    if (typeof v === "string") {
      return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, 6);
    }
    return [];
  };
  const num = (v: unknown, def: number): number => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : def;
  };
  const bool = (v: unknown, def: boolean): boolean =>
    typeof v === "boolean" ? v : def;

  const prefix = str(r.invoiceNumberPrefix, d.invoiceNumberPrefix) || "INV";

  return {
    issuerLegalName: str(r.issuerLegalName, d.issuerLegalName),
    issuerAddressLines: lines(r.issuerAddressLines),
    issuerCity: strOrNull(r.issuerCity, d.issuerCity),
    issuerState: strOrNull(r.issuerState, d.issuerState),
    issuerPincode: strOrNull(r.issuerPincode, d.issuerPincode),
    issuerCountry: str(r.issuerCountry, d.issuerCountry),
    issuerGstin: strOrNull(r.issuerGstin, d.issuerGstin),
    issuerPan: strOrNull(r.issuerPan, d.issuerPan),
    issuerEmail: str(r.issuerEmail, d.issuerEmail),
    issuerPhone: strOrNull(r.issuerPhone, d.issuerPhone),
    issuerWebsite: str(r.issuerWebsite, d.issuerWebsite),
    gstRatePercent: Math.max(0, Math.min(100, num(r.gstRatePercent, d.gstRatePercent))),
    hsnSacCode: str(r.hsnSacCode, d.hsnSacCode),
    pricesAreTaxInclusive: bool(r.pricesAreTaxInclusive, d.pricesAreTaxInclusive),
    invoiceNumberPrefix: prefix,
    footerNote: str(r.footerNote, d.footerNote),
  };
}
