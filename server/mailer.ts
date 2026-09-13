// Centralised transactional email sender (ZeptoMail SMTP via nodemailer).
//
// Every outgoing email — verification, payment success/failure, invoice
// copy, expiry reminder — funnels through `sendTransactional` so the
// branded HTML wrapper, From identity, retry behaviour, and "no-op when
// SMTP isn't configured" guard live in one place. Individual feature
// helpers (sendOrgVerificationEmail, sendPaymentSuccessEmail, etc.)
// build the inner content and delegate the actual delivery.
//
// Why ZeptoMail SMTP instead of the HTTP API: the user provided sample
// nodemailer code wired against smtp.zeptomail.in:587 with the literal
// SMTP user "emailapikey" and a "Send Mail Token" as the password.
// Using nodemailer keeps us provider-agnostic — swapping to a different
// SMTP relay later only requires changing env vars, not code.

import nodemailer, { type Transporter } from "nodemailer";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SMTP_HOST = "smtp.zeptomail.in";
const SMTP_PORT = 587;
const SMTP_USER = "emailapikey";

const FROM_EMAIL = process.env.ZEPTOMAIL_FROM_EMAIL || "noreply@tiqkets.in";
const FROM_NAME = process.env.ZEPTOMAIL_FROM_NAME || "TIQKETS";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@tiqkets.in";

// Brand palette — kept inline so emails render the same in every client
// regardless of CSS support. Numbers were chosen to mirror the in-app
// theme (constants/theme.ts) without importing React Native code.
const BRAND_PRIMARY = "#0F172A"; // slate-900
const BRAND_ACCENT = "#2563EB"; // blue-600
const BRAND_MUTED = "#64748B"; // slate-500
const BRAND_BG = "#F8FAFC"; // slate-50
const BRAND_BORDER = "#E2E8F0"; // slate-200
const BRAND_DANGER = "#DC2626"; // red-600
const BRAND_SUCCESS = "#16A34A"; // green-600

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const pass = process.env.ZEPTOMAIL_SMTP_PASSWORD;
  if (!pass) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false, // STARTTLS on 587
    auth: { user: SMTP_USER, pass },
  });
  return cachedTransporter;
}

export function isMailerConfigured(): boolean {
  return !!process.env.ZEPTOMAIL_SMTP_PASSWORD;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort base URL for click-through links (verification, dashboard).
 * Order: explicit APP_DOMAIN > Replit production domain > Replit dev domain >
 * localhost fallback for local testing. Always returns an https://… origin
 * (or http://localhost) without a trailing slash.
 */
export function getPublicBaseUrl(): string {
  const explicit = process.env.APP_DOMAIN;
  if (explicit) {
    return explicit.startsWith("http") ? explicit.replace(/\/$/, "") : `https://${explicit}`;
  }
  const replitProd = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitProd) return `https://${replitProd}`;
  const replitDev = process.env.REPLIT_DEV_DOMAIN;
  if (replitDev) return `https://${replitDev}`;
  return "http://localhost:5000";
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format paise / cents -> human "₹1,234.56" string. */
export function formatMoney(amountMinor: number, currency = "INR"): string {
  const major = amountMinor / 100;
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  return `${symbol}${major.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format ISO/Date -> "28 Apr 2026". */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// HTML wrapper
// ---------------------------------------------------------------------------

interface WrapperOptions {
  preheader?: string; // Hidden preview text shown in inbox listings
  heading: string;
  innerHtml: string;
  // Optional CTA rendered as a styled button below `innerHtml`.
  cta?: { label: string; url: string };
}

/**
 * Apply the TIQKETS branded shell around per-email body markup. Uses
 * inline styles + nested table layout because that's the lowest common
 * denominator across email clients (Gmail, Outlook, Apple Mail, mobile).
 */
function renderEmailHtml(opts: WrapperOptions): string {
  const preheader = opts.preheader ? escapeHtml(opts.preheader) : "";
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
         <tr><td bgcolor="${BRAND_ACCENT}" style="border-radius:8px;">
           <a href="${escapeHtml(opts.cta.url)}" target="_blank"
              style="display:inline-block;padding:12px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
             ${escapeHtml(opts.cta.label)}
           </a>
         </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND_BG};font-family:Helvetica,Arial,sans-serif;color:${BRAND_PRIMARY};">
  <span style="display:none;font-size:0;line-height:0;color:${BRAND_BG};max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND_BG};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid ${BRAND_BORDER};border-radius:12px;overflow:hidden;">
        <tr><td style="background:${BRAND_PRIMARY};padding:20px 28px;">
          <span style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:1px;">TIQKETS</span>
        </td></tr>
        <tr><td style="padding:32px 28px 8px;">
          <h1 style="margin:0 0 16px;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:${BRAND_PRIMARY};">
            ${escapeHtml(opts.heading)}
          </h1>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${BRAND_PRIMARY};">
            ${opts.innerHtml}
          </div>
          ${cta}
        </td></tr>
        <tr><td style="padding:24px 28px 28px;border-top:1px solid ${BRAND_BORDER};margin-top:24px;">
          <p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND_MUTED};">
            Need help? Reach us at
            <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:${BRAND_ACCENT};text-decoration:none;">${escapeHtml(SUPPORT_EMAIL)}</a>.
          </p>
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:${BRAND_MUTED};">
            © ${new Date().getFullYear()} TIQKETS. This is an automated message — please do not reply directly.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Sender
// ---------------------------------------------------------------------------

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string; // Plain-text fallback for clients that block HTML
  replyTo?: string;
}

/**
 * Low-level send. Returns true on success, false on failure (or when SMTP
 * isn't configured). Never throws — emails are best-effort and must
 * never break the originating request flow.
 */
export async function sendTransactional(args: SendEmailArgs): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `[mailer] ZEPTOMAIL_SMTP_PASSWORD not set — skipping email "${args.subject}" to ${args.to}`,
    );
    return false;
  }
  if (!args.to) {
    console.warn(`[mailer] No recipient — skipping "${args.subject}"`);
    return false;
  }
  try {
    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      replyTo: args.replyTo || SUPPORT_EMAIL,
    });
    console.log(`[mailer] Sent "${args.subject}" to ${args.to} — id=${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[mailer] Failed sending "${args.subject}" to ${args.to}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Feature templates
// ---------------------------------------------------------------------------

export async function sendEventTicketEmail(args: {
  to: string;
  customerName: string;
  eventName: string;
  bookingId: string;
  qrToken: string;
  slotDate: string;
  slotTime: string;
  locationName?: string | null;
  guestCount: number;
}): Promise<boolean> {
  const ticketUrl = `${getPublicBaseUrl()}/event-ticket/${encodeURIComponent(args.qrToken)}`;
  const locationRow = args.locationName
    ? `<tr><td style="padding:5px 12px 5px 0;color:${BRAND_MUTED};">Location</td><td style="padding:5px 0;font-weight:600;">${escapeHtml(args.locationName)}</td></tr>`
    : "";
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(args.customerName)},</p>
    <p style="margin:0 0 18px;">
      Your registration for <strong>${escapeHtml(args.eventName)}</strong> is confirmed.
      Keep this ticket ready to show at the event entrance.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 8px;background:${BRAND_BG};border:1px solid ${BRAND_BORDER};border-radius:8px;padding:14px;">
      <tr><td style="padding:5px 12px 5px 0;color:${BRAND_MUTED};">Ticket ID</td><td style="padding:5px 0;font-weight:700;">${escapeHtml(args.bookingId)}</td></tr>
      <tr><td style="padding:5px 12px 5px 0;color:${BRAND_MUTED};">Date</td><td style="padding:5px 0;font-weight:600;">${escapeHtml(args.slotDate)}</td></tr>
      <tr><td style="padding:5px 12px 5px 0;color:${BRAND_MUTED};">Time</td><td style="padding:5px 0;font-weight:600;">${escapeHtml(args.slotTime)}</td></tr>
      ${locationRow}
      <tr><td style="padding:5px 12px 5px 0;color:${BRAND_MUTED};">Guests</td><td style="padding:5px 0;font-weight:600;">${args.guestCount}</td></tr>
    </table>
    <p style="margin:16px 0 0;color:${BRAND_MUTED};font-size:13px;">
      Open the ticket using the button below to view the QR code and complete ticket details.
    </p>
  `;
  const text = `Hi ${args.customerName},

Your registration for ${args.eventName} is confirmed.

Ticket ID: ${args.bookingId}
Date: ${args.slotDate}
Time: ${args.slotTime}
${args.locationName ? `Location: ${args.locationName}\n` : ""}Guests: ${args.guestCount}

View your ticket: ${ticketUrl}

Please keep the ticket ready to show at the event entrance.`;

  return sendTransactional({
    to: args.to,
    subject: `Your ticket for ${args.eventName} — ${args.bookingId}`,
    html: renderEmailHtml({
      heading: "Your event ticket is ready",
      preheader: `${args.eventName} ticket ${args.bookingId}`,
      innerHtml: inner,
      cta: { label: "View ticket", url: ticketUrl },
    }),
    text,
  });
}

/**
 * Verify the registrant's email after org sign-up. The token gets baked
 * into a backend URL that flips is_verified=true and renders a confirmation
 * page; see GET /api/organizations/verify-email/:token in routes.ts.
 */
/**
 * OTP-based email verification — preferred over the legacy link flow because
 * it keeps the user inside the mobile app the whole way through registration
 * (no risky cross-context redirect from a mailto link back into Expo).
 *
 * The OTP is rendered prominently in a monospace box, with explicit
 * "valid for 10 minutes" copy so the recipient knows urgency, and a
 * "didn't ask for this" footer for abuse signaling.
 */
export async function sendOrgVerificationOtpEmail(args: {
  to: string;
  orgName: string;
  recipientName: string;
  otp: string;
  expiresInMinutes: number;
}): Promise<boolean> {
  const otpDisplay = escapeHtml(args.otp);
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(args.recipientName)},</p>
    <p style="margin:0 0 12px;">
      Welcome to TIQKETS! To finish activating
      <strong>${escapeHtml(args.orgName)}</strong>, please confirm this email
      address by entering the 6-digit code below in the app.
    </p>
    <div style="margin:24px 0;text-align:center;">
      <div style="display:inline-block;padding:18px 28px;border:1px solid ${BRAND_BORDER};
        border-radius:8px;background:${BRAND_BG};font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;
        font-size:32px;letter-spacing:8px;color:${BRAND_PRIMARY};font-weight:600;">
        ${otpDisplay}
      </div>
    </div>
    <p style="margin:0 0 12px;color:${BRAND_MUTED};font-size:14px;">
      This code is valid for ${args.expiresInMinutes} minutes. For your security,
      do not share it with anyone — TIQKETS staff will never ask you for it.
    </p>
    <p style="margin:0;color:${BRAND_MUTED};font-size:13px;">
      Didn't try to register? You can safely ignore this email — no account
      will be activated without entering this code.
    </p>
  `;
  const text = `Welcome to TIQKETS!

Your verification code for ${args.orgName} is: ${args.otp}

Enter this 6-digit code in the app to confirm your email address.
This code is valid for ${args.expiresInMinutes} minutes.

If you didn't request this, you can safely ignore this email.`;

  return sendTransactional({
    to: args.to,
    subject: `Your TIQKETS verification code: ${args.otp}`,
    html: renderEmailHtml({
      heading: "Confirm your email address",
      preheader: `Your TIQKETS verification code is ${args.otp}`,
      innerHtml: inner,
    }),
    text,
  });
}

export async function sendOrgVerificationEmail(args: {
  to: string;
  orgName: string;
  recipientName: string;
  verifyUrl: string;
}): Promise<boolean> {
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(args.recipientName)},</p>
    <p style="margin:0 0 12px;">
      Welcome to TIQKETS! We've created an account for
      <strong>${escapeHtml(args.orgName)}</strong>.
    </p>
    <p style="margin:0 0 12px;">
      To activate billing, alerts, and customer-facing booking links, please
      confirm this email address by clicking the button below. The link is
      valid for 24 hours.
    </p>
  `;
  const text = `Welcome to TIQKETS!

Confirm your email for ${args.orgName} by opening this link (valid for 24 hours):

${args.verifyUrl}

If you didn't request this account, you can safely ignore this message.`;

  return sendTransactional({
    to: args.to,
    subject: `Confirm your email for ${args.orgName}`,
    html: renderEmailHtml({
      heading: "Confirm your email address",
      preheader: `Activate ${args.orgName} on TIQKETS`,
      innerHtml: inner,
      cta: { label: "Confirm email", url: args.verifyUrl },
    }),
    text,
  });
}

/**
 * Combined "subscription active + invoice copy" email sent on successful
 * Razorpay payment verification. Embeds the invoice line items inline
 * because there's no PDF generator yet — the invoice number on the email
 * matches the payments.invoice_number column for reconciliation.
 */
export async function sendPaymentSuccessEmail(args: {
  to: string;
  orgName: string;
  recipientName: string;
  planName: string;
  billingCycle: string;
  amountMinor: number;
  currency: string;
  invoiceNumber: string;
  paidAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
}): Promise<boolean> {
  const baseUrl = getPublicBaseUrl();
  const rows: Array<[string, string]> = [
    ["Invoice number", args.invoiceNumber],
    ["Organization", args.orgName],
    ["Plan", `${args.planName} (${args.billingCycle})`],
    ["Amount paid", formatMoney(args.amountMinor, args.currency)],
    ["Payment date", formatDate(args.paidAt)],
    ["Billing period", `${formatDate(args.periodStart)} → ${formatDate(args.periodEnd)}`],
  ];
  const tableRows = rows
    .map(
      ([k, v]) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND_BORDER};font-size:13px;color:${BRAND_MUTED};width:42%;">${escapeHtml(k)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid ${BRAND_BORDER};font-size:14px;font-weight:600;color:${BRAND_PRIMARY};">${escapeHtml(v)}</td>
      </tr>`,
    )
    .join("");

  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(args.recipientName)},</p>
    <p style="margin:0 0 16px;">
      Thank you — your payment for <strong>${escapeHtml(args.orgName)}</strong> was received and your
      <strong>${escapeHtml(args.planName)}</strong> subscription is now active.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
      style="border:1px solid ${BRAND_BORDER};border-radius:8px;overflow:hidden;margin:0 0 8px;">
      <tr><td colspan="2" style="padding:12px 12px;background:${BRAND_BG};font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${BRAND_MUTED};">
        Invoice
      </td></tr>
      ${tableRows}
    </table>
    <p style="margin:16px 0 0;font-size:13px;color:${BRAND_MUTED};">
      Keep this email as your invoice copy. A history of all your payments is also
      available in your TIQKETS dashboard.
    </p>
  `;

  const text = `Payment received — ${args.orgName}

Invoice: ${args.invoiceNumber}
Plan:    ${args.planName} (${args.billingCycle})
Amount:  ${formatMoney(args.amountMinor, args.currency)}
Date:    ${formatDate(args.paidAt)}
Period:  ${formatDate(args.periodStart)} -> ${formatDate(args.periodEnd)}

You can view all invoices in your TIQKETS dashboard.`;

  return sendTransactional({
    to: args.to,
    subject: `Payment received — Invoice ${args.invoiceNumber}`,
    html: renderEmailHtml({
      heading: "Payment received",
      preheader: `${args.planName} active until ${formatDate(args.periodEnd)}`,
      innerHtml: inner,
      cta: { label: "Open dashboard", url: `${baseUrl}/dashboard` },
    }),
    text,
  });
}

/**
 * Sent when a Razorpay checkout fails on the client side (declined card,
 * insufficient funds, network drop). The reason string is supplied by
 * the client and rendered verbatim — keep it short.
 */
export async function sendPaymentFailureEmail(args: {
  to: string;
  orgName: string;
  recipientName: string;
  planName: string;
  amountMinor: number;
  currency: string;
  reason: string;
}): Promise<boolean> {
  const baseUrl = getPublicBaseUrl();
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(args.recipientName)},</p>
    <p style="margin:0 0 12px;">
      We couldn't process your payment of <strong>${escapeHtml(formatMoney(args.amountMinor, args.currency))}</strong>
      for the <strong>${escapeHtml(args.planName)}</strong> plan on
      <strong>${escapeHtml(args.orgName)}</strong>.
    </p>
    <div style="margin:16px 0;padding:12px 14px;background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;">
      <p style="margin:0;font-size:14px;color:${BRAND_DANGER};"><strong>Reason:</strong> ${escapeHtml(args.reason)}</p>
    </div>
    <p style="margin:0 0 12px;">
      No charge was made. You can retry the payment any time from the billing page;
      if your bank declined the transaction, please try a different card or UPI ID.
    </p>
  `;
  const text = `Payment could not be processed for ${args.orgName}.

Plan:   ${args.planName}
Amount: ${formatMoney(args.amountMinor, args.currency)}
Reason: ${args.reason}

You haven't been charged. Retry from your TIQKETS dashboard when ready.`;

  return sendTransactional({
    to: args.to,
    subject: `Payment could not be processed — ${args.orgName}`,
    html: renderEmailHtml({
      heading: "We couldn't process your payment",
      preheader: `Action needed for ${args.orgName}`,
      innerHtml: inner,
      cta: { label: "Retry payment", url: `${baseUrl}/dashboard` },
    }),
    text,
  });
}

/** Confirmation when a subscription is cancelled by the customer. */
export async function sendSubscriptionCancelledEmail(args: {
  to: string;
  orgName: string;
  recipientName: string;
  planName: string;
  accessUntil: Date | null;
}): Promise<boolean> {
  const baseUrl = getPublicBaseUrl();
  const tail = args.accessUntil
    ? `You'll continue to have access to <strong>${escapeHtml(args.planName)}</strong> features until <strong>${escapeHtml(formatDate(args.accessUntil))}</strong>.`
    : `Your subscription has been cancelled effective immediately.`;
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(args.recipientName)},</p>
    <p style="margin:0 0 12px;">
      We've cancelled the subscription for <strong>${escapeHtml(args.orgName)}</strong>.
    </p>
    <p style="margin:0 0 12px;">${tail}</p>
    <p style="margin:0;">If this was a mistake, you can resubscribe from the billing page at any time.</p>
  `;
  const text = `Subscription cancelled for ${args.orgName}.
Plan: ${args.planName}
${args.accessUntil ? `Access until: ${formatDate(args.accessUntil)}` : "Cancelled immediately."}`;

  return sendTransactional({
    to: args.to,
    subject: `Subscription cancelled — ${args.orgName}`,
    html: renderEmailHtml({
      heading: "Subscription cancelled",
      preheader: `${args.planName} cancellation confirmed`,
      innerHtml: inner,
      cta: { label: "Manage billing", url: `${baseUrl}/dashboard` },
    }),
    text,
  });
}

/**
 * Daily-cron reminder fired 7 / 3 / 1 day(s) before subscription expiry
 * (or trial end). Same template handles both — the CTA changes to
 * "Upgrade now" for trials and "Renew now" for active subs.
 */
export async function sendExpiryReminderEmail(args: {
  to: string;
  orgName: string;
  recipientName: string;
  planName: string;
  isTrial: boolean;
  daysRemaining: number;
  expiresAt: Date;
}): Promise<boolean> {
  const baseUrl = getPublicBaseUrl();
  const noun = args.isTrial ? "trial" : "subscription";
  const cta = args.isTrial ? "Upgrade now" : "Renew now";
  const dayWord = args.daysRemaining === 1 ? "day" : "days";
  const inner = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(args.recipientName)},</p>
    <p style="margin:0 0 12px;">
      Your <strong>${escapeHtml(args.planName)}</strong> ${noun} for
      <strong>${escapeHtml(args.orgName)}</strong> ends on
      <strong>${escapeHtml(formatDate(args.expiresAt))}</strong> —
      that's <strong>${args.daysRemaining} ${dayWord}</strong> away.
    </p>
    <p style="margin:0 0 12px;">
      ${
        args.isTrial
          ? "Pick a plan now to keep your queues, alerts, and customer-facing booking pages running without interruption."
          : "Renew now to avoid any interruption to your queues, alerts, and customer bookings."
      }
    </p>
  `;
  const text = `Your ${noun} for ${args.orgName} ends on ${formatDate(args.expiresAt)} (${args.daysRemaining} ${dayWord} from now).

Open your TIQKETS dashboard to ${args.isTrial ? "upgrade" : "renew"}.`;

  return sendTransactional({
    to: args.to,
    subject: `${args.daysRemaining} ${dayWord} left — ${args.orgName}`,
    html: renderEmailHtml({
      heading: `Your ${noun} ends in ${args.daysRemaining} ${dayWord}`,
      preheader: `Ends on ${formatDate(args.expiresAt)}`,
      innerHtml: inner,
      cta: { label: cta, url: `${baseUrl}/dashboard` },
    }),
    text,
  });
}

// Re-export for callers that want to brand-match additional one-off emails
// without re-implementing the wrapper.
export { renderEmailHtml as _internal_renderEmailHtml, BRAND_SUCCESS, BRAND_DANGER };
