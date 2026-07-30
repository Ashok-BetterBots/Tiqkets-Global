import { db } from "./db";
import { tickets, branches, organizations, services } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { renderWaMessage, type WaVars } from "./wa-templates";
import { normalizeWaMode } from "@shared/wa-templates";
import { getApprovedWaTemplate } from "@shared/wa-approved-templates";

const WHATSAPP_API_VERSION = "v21.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// Business phone number that customers message via the wa.me link.
// MUST be the same number registered to WHATSAPP_PHONE_NUMBER_ID on
// Meta — if these drift, the customer messages one number and we
// reply from another, which silently breaks the entire confirm flow.
// Falls back to the original hardcoded value so existing deployments
// keep working until the env var is set.
const DEFAULT_BUSINESS_PHONE = "919150086101";
function getBusinessPhone(): string {
  return (process.env.WHATSAPP_BUSINESS_PHONE || DEFAULT_BUSINESS_PHONE)
    .replace(/[^0-9]/g, "");
}

// Normalize a customer-entered phone number into the full international
// digits-only format the WhatsApp Cloud API requires in `to` (country code
// + number, no "+", no spaces). The Cloud API does NOT reject a bare
// 10-digit local number — it accepts it and returns a message id — but the
// message is never delivered because it isn't a real WhatsApp account id.
// Most of the app (mobile login, OTP) collects phone via a country-code
// picker that defaults to +91 and builds the full number client-side, but
// a couple of plain web forms (e.g. the public event registration page)
// only collect a bare 10-digit number. Bridge that gap here so every path
// that saves a `customerPhone` ends up with a deliverable number.
export function normalizeIndianPhone(raw: string): string {
  const digits = String(raw || "").replace(/[^0-9]/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

function getPhoneNumberId(): string {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || "";
}

function getAccessToken(): string {
  return process.env.WHATSAPP_ACCESS_TOKEN || "";
}

function getVerifyToken(): string {
  return process.env.WHATSAPP_VERIFY_TOKEN || "tiqkets_whatsapp_verify_2025";
}

/**
 * Boot-time sanity check. Calls Meta's `/{phone-number-id}` endpoint
 * to fetch the display number registered for our WHATSAPP_PHONE_NUMBER_ID
 * and compares it (digits-only) against the BUSINESS_PHONE that the
 * wa.me link uses. A mismatch is the #1 silent killer of the inbound
 * confirm flow: customers message one number, our webhook listens on
 * a different one, and we never see a single event in the logs.
 *
 * Logs a single line per outcome and never throws — observability
 * only, not a hard failure.
 */
export async function verifyWhatsAppConfig(): Promise<void> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();
  const businessPhone = getBusinessPhone();

  if (!phoneNumberId || !accessToken) {
    console.log("[whatsapp-config] credentials not configured, skipping self-test");
    return;
  }

  try {
    const resp = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(
        `[whatsapp-config] self-test FAILED — Meta returned ${resp.status}: ${errText.slice(0, 300)}`,
      );
      return;
    }
    const data: any = await resp.json();
    const displayDigits = String(data.display_phone_number || "").replace(/[^0-9]/g, "");
    const match = displayDigits === businessPhone;
    console.log(
      `[whatsapp-config] phoneNumberId=${phoneNumberId} → display=${data.display_phone_number} verified_name="${data.verified_name}" quality=${data.quality_rating}`,
    );
    console.log(
      `[whatsapp-config] wa.me link points to ${businessPhone}; Meta-registered number is ${displayDigits}; match=${match}`,
    );
    if (!match) {
      console.error(
        `[whatsapp-config] MISMATCH: customers message ${businessPhone} on WhatsApp but our outbound API replies as ${displayDigits}. ` +
        `Inbound webhooks will NEVER fire and customers will NEVER receive the confirmation reply. ` +
        `Either set WHATSAPP_BUSINESS_PHONE=${displayDigits} (so the wa.me link points at the correct number) ` +
        `or change WHATSAPP_PHONE_NUMBER_ID to the one registered for ${businessPhone}.`,
      );
    }
  } catch (err) {
    console.error("[whatsapp-config] self-test error:", err);
  }
}

export function generateRefCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "TQ";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function getWhatsAppRedirectUrl(refCode: string): string {
  const message = encodeURIComponent(
    `TIQKET ID: ${refCode}\n\nI just joined the queue at TIQKETS. Please confirm my registration.`,
  );
  return `https://wa.me/${getBusinessPhone()}?text=${message}`;
}

/**
 * Increment the billable WhatsApp message tally for an organization. Called
 * once per successful Cloud API send when the caller passes an organizationId.
 * Failures here are swallowed (best-effort accounting) so they can never break
 * an actual message send. Event accounts are billed on this count.
 */
async function incrementOrgWhatsappCount(organizationId?: string): Promise<void> {
  if (!organizationId) return;
  try {
    await db
      .update(organizations)
      .set({ whatsappMessageCount: sql`${organizations.whatsappMessageCount} + 1` })
      .where(eq(organizations.id, organizationId));
  } catch (e) {
    console.error("[whatsapp] failed to increment org message count:", e);
  }
}

async function sendWhatsAppMessage(
  to: string,
  message: string,
  organizationId?: string,
): Promise<boolean> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();

  if (!phoneNumberId || !accessToken) {
    console.log(
      "WhatsApp API credentials not configured, skipping notification",
    );
    return false;
  }

  const cleanPhone = to.replace(/[^0-9]/g, "");

  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "text",
          text: {
            preview_url: false,
            body: message,
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("WhatsApp send error:", response.status, errorData);
      return false;
    }

    const result = await response.json();
    console.log("WhatsApp message sent:", result.messages?.[0]?.id);
    await incrementOrgWhatsappCount(organizationId);
    return true;
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
    return false;
  }
}

/**
 * Send an image message (WhatsApp Cloud API `type: "image"` with a public
 * link) plus an optional caption. Used for the Events-mode QR boarding
 * pass. The link must be a publicly reachable HTTPS URL (Meta's servers
 * fetch it), so callers pass an absolute URL built from the app domain.
 */
export async function sendWhatsAppImage(
  to: string,
  imageUrl: string,
  caption?: string,
  organizationId?: string,
): Promise<boolean> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();

  if (!phoneNumberId || !accessToken) {
    console.log("WhatsApp API credentials not configured, skipping image send");
    return false;
  }

  const cleanPhone = to.replace(/[^0-9]/g, "");

  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "image",
          image: {
            link: imageUrl,
            ...(caption ? { caption: caption.slice(0, 1024) } : {}),
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("WhatsApp image send error:", response.status, errorData);
      return false;
    }

    const result = await response.json();
    console.log("WhatsApp image sent:", result.messages?.[0]?.id);
    await incrementOrgWhatsappCount(organizationId);
    return true;
  } catch (error) {
    console.error("Failed to send WhatsApp image:", error);
    return false;
  }
}

/**
 * Send a pre-approved WhatsApp Business template message used for
 * organization-side queue alerts (high volume, wait time, queue
 * start, queue end). All four templates share the same shape: a
 * single body component whose parameters are positional text
 * substitutions for the template's {{1}}…{{N}} placeholders.
 *
 * Returns true on a successful send, false if the API rejects the
 * call or credentials are missing. The caller is responsible for
 * any plain-text fallback / logging beyond the error printed here.
 */
export async function sendWhatsAppAlertTemplate(
  to: string,
  templateName:
    | "org_alert_high_volume"
    | "org_alert_queue_end"
    | "org_alert_queue_start"
    | "org_alert_wait_time",
  params: Array<string | number>,
): Promise<boolean> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();

  if (!phoneNumberId || !accessToken) {
    console.log(
      "WhatsApp API credentials not configured, skipping alert template",
    );
    return false;
  }

  const cleanPhone = to.replace(/[^0-9]/g, "");
  const parameters = params.map((p) => ({
    type: "text" as const,
    text: String(p ?? ""),
  }));

  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "template",
          template: {
            name: templateName,
            // Templates are registered under the plain "en" locale,
            // not "en_US" — using the wrong code returns Cloud API
            // error 132001 ("template name does not exist in …").
            language: { code: "en" },
            components: [{ type: "body", parameters }],
          },
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        `WhatsApp template "${templateName}" send error:`,
        response.status,
        errorData,
      );
      return false;
    }

    const result = await response.json();
    console.log(
      `WhatsApp alert template "${templateName}" sent:`,
      result.messages?.[0]?.id,
      "to:",
      cleanPhone,
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to send WhatsApp alert template "${templateName}":`,
      error,
    );
    return false;
  }
}

/**
 * Send a pre-approved WhatsApp Business template message with positional
 * body parameters and, optionally, an image header (e.g. the generated
 * Tiqket boarding pass). Used for triggers that have an approved template
 * registered in shared/wa-approved-templates.ts — see that file for the
 * per-(mode, trigger, language) mapping this powers.
 *
 * Unlike sendWhatsAppImage (a free-form media message that only delivers
 * within Meta's 24-hour customer-service window), pre-approved templates
 * can be sent anytime, which is why triggers like the event ticket/reminder
 * messages move to this path once a template is registered for them.
 */
export async function sendWhatsAppTemplateMessage(
  to: string,
  templateName: string,
  languageCode: string,
  bodyParams: Array<string | number>,
  opts: {
    headerImageUrl?: string;
    organizationId?: string;
    flowToken?: string;
    ctaUrlParam?: string;
    // When the template was created with named variables ({{customer_name}} etc.)
    // rather than positional ones ({{1}} etc.), each body parameter must include
    // a `parameter_name` field.  Pass the ordered variable name list here.
    bodyParamNames?: string[];
  } = {},
): Promise<boolean> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();

  if (!phoneNumberId || !accessToken) {
    console.log("WhatsApp API credentials not configured, skipping template message");
    return false;
  }

  const cleanPhone = to.replace(/[^0-9]/g, "");
  const components: Array<Record<string, unknown>> = [];
  if (opts.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: opts.headerImageUrl } }],
    });
  }
  // Build body parameters.  When bodyParamNames is provided the template uses
  // named variables — include parameter_name on each entry so Meta can match
  // them. Without it Meta returns (#100) "Parameter name is missing or empty".
  components.push({
    type: "body",
    parameters: bodyParams.map((p, i) => {
      const base: Record<string, unknown> = { type: "text", text: String(p ?? "") };
      if (opts.bodyParamNames?.[i]) base.parameter_name = opts.bodyParamNames[i];
      return base;
    }),
  });
  // Flow-type templates (Utility · Flows) require a buttons component with
  // sub_type "flow" and a flow_token. Without it Meta rejects the API call.
  if (opts.flowToken) {
    components.push({
      type: "button",
      sub_type: "flow",
      index: "0",
      parameters: [
        { type: "action", action: { flow_token: opts.flowToken } },
      ],
    });
  }
  // CTA URL button with a dynamic URL suffix. The template defines the static
  // base URL; we pass only the dynamic suffix (e.g. the qrToken) as {{1}}.
  // index must be a number (0-indexed), not a string.
  if (opts.ctaUrlParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: 0,
      parameters: [{ type: "text", text: opts.ctaUrlParam }],
    });
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  };
  console.log(`[wa-template-send] FULL PAYLOAD → ${JSON.stringify(payload)}`);

  try {
    const response = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error(
        `WhatsApp template "${templateName}" (${languageCode}) send error:`,
        response.status,
        errorData,
      );
      return false;
    }

    const result = await response.json();
    console.log(
      `WhatsApp template "${templateName}" (${languageCode}) sent:`,
      result.messages?.[0]?.id,
      "to:",
      cleanPhone,
    );
    await incrementOrgWhatsappCount(opts.organizationId);
    return true;
  } catch (error) {
    console.error(
      `Failed to send WhatsApp template "${templateName}" (${languageCode}):`,
      error,
    );
    return false;
  }
}

export async function sendWhatsAppOTP(
  to: string,
  otpCode: string,
  purpose: string,
): Promise<boolean> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();

  if (!phoneNumberId || !accessToken) {
    console.log("WhatsApp API credentials not configured, skipping OTP");
    return false;
  }

  const cleanPhone = to.replace(/[^0-9]/g, "");

  try {
    const templateResponse = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "template",
          template: {
            name: "otp_tiqkets_global",
            language: { code: "en" },
            components: [
              {
                type: "body",
                parameters: [{ type: "text", text: otpCode }],
              },
              {
                type: "button",
                sub_type: "url",
                index: "0",
                parameters: [{ type: "text", text: otpCode }],
              },
            ],
          },
        }),
      },
    );

    if (templateResponse.ok) {
      const result = await templateResponse.json();
      console.log("WhatsApp OTP sent via template:", result.messages?.[0]?.id, "to:", cleanPhone);
      return true;
    }

    const templateError = await templateResponse.text();
    console.log("Template OTP failed, falling back to text message:", templateResponse.status, templateError);

    const textMessage = `${otpCode} is your TIQKETS verification code. For your security, do not share this code.\n\nThis code expires in 10 minutes.`;
    const textResponse = await fetch(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone,
          type: "text",
          text: {
            preview_url: false,
            body: textMessage,
          },
        }),
      },
    );

    if (!textResponse.ok) {
      const errorData = await textResponse.text();
      console.error("WhatsApp OTP text send error:", textResponse.status, errorData);
      return false;
    }

    const result = await textResponse.json();
    console.log(
      "WhatsApp OTP sent via text:",
      result.messages?.[0]?.id,
      "to:",
      cleanPhone,
    );
    return true;
  } catch (error) {
    console.error("Failed to send WhatsApp OTP:", error);
    return false;
  }
}

// ─── Helper to get ticket with WhatsApp guard ───

async function getWhatsAppTicket(
  ticketId: string,
  notifKey: string,
): Promise<any | null> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!ticket || !ticket.whatsappPhone || !ticket.whatsappConfirmed)
    return null;

  const sentNotifications = (ticket.notificationsSent as string[]) || [];
  if (sentNotifications.includes(notifKey)) return null;

  return { ...ticket, _sentNotifications: sentNotifications };
}

async function markWhatsAppSent(
  ticketId: string,
  sentNotifications: string[],
  notifKey: string,
): Promise<void> {
  const updated = [...sentNotifications, notifKey];
  await db
    .update(tickets)
    .set({ notificationsSent: updated, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId));
}

// ─── Incoming WhatsApp Processing ───

export async function processIncomingWhatsApp(
  from: string,
  messageBody: string,
): Promise<void> {
  const refCodeMatch = messageBody.match(/(?:TIQKET\s*ID:\s*)?(TQ[A-Z0-9]{5})/);
  if (!refCodeMatch) {
    await sendWhatsAppMessage(
      from,
      `Hi! We couldn't find a valid reference code in your message.\n\nPlease send the exact reference code you received after joining the queue (e.g., TQ3AB7K).\n\nIf you haven't joined a queue yet, scan the QR code at the location to get started.`,
    );
    return;
  }

  const refCode = refCodeMatch[1];

  try {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.whatsappRefCode, refCode))
      .limit(1);

    if (!ticket) {
      await sendWhatsAppMessage(
        from,
        `Sorry, the reference code *${refCode}* was not found. It may have expired or been entered incorrectly.\n\nPlease check the code and try again, or scan the QR code to join a new queue.`,
      );
      return;
    }

    // Status-aware reply for repeat reference codes. The customer never
    // gets silently re-added to the queue — instead we tell them where
    // their existing ticket stands. Only the unconfirmed-and-still-waiting
    // case continues to the original confirm-and-join path below.
    const existingBranch = ticket.branchId
      ? await db.select().from(branches).where(eq(branches.id, ticket.branchId)).limit(1).then((r: any[]) => r[0])
      : null;
    const branchNameForStatus = existingBranch?.name || "the venue";
    const status = String(ticket.status || "").toLowerCase();
    const customerLabel = ticket.customerName ? ticket.customerName : "there";
    const tn = ticket.ticketNumber;

    if (status === "completed" || status === "served") {
      await sendWhatsAppMessage(
        from,
        `Hi ${customerLabel}, your ticket *${tn}* at *${branchNameForStatus}* has already been serviced. Thank you for visiting!\n\nIf you need to join again, please scan the QR code at the venue.`,
      );
      return;
    }

    if (status === "no_show") {
      await sendWhatsAppMessage(
        from,
        `Hi ${customerLabel}, ticket *${tn}* was marked as no-show and is no longer active.\n\nPlease scan the QR code at *${branchNameForStatus}* to register again.`,
      );
      return;
    }

    if (status === "cancelled" || status === "canceled") {
      await sendWhatsAppMessage(
        from,
        `Hi ${customerLabel}, ticket *${tn}* was cancelled and is no longer active.\n\nPlease scan the QR code at *${branchNameForStatus}* to register again.`,
      );
      return;
    }

    if (status === "serving") {
      const deskLine = ticket.deskName ? `\nDesk: *${ticket.deskName}*` : "";
      await sendWhatsAppMessage(
        from,
        `Hi ${customerLabel}, your ticket *${tn}* is currently being served at *${branchNameForStatus}*.${deskLine}\n\nPlease proceed to the counter if you haven't already.`,
      );
      return;
    }

    if (status === "hold") {
      await sendWhatsAppMessage(
        from,
        `Hi ${customerLabel}, your ticket *${tn}* at *${branchNameForStatus}* is currently on hold.\n\nPlease contact the front desk to resume your booking.`,
      );
      return;
    }

    if (ticket.whatsappConfirmed) {
      // Already in queue — surface the live position/wait so the customer
      // gets a useful answer instead of a duplicate "you joined" message.
      const positionLine = typeof ticket.position === "number" && ticket.position > 0
        ? `\nPosition: *#${ticket.position}*`
        : "";
      const waitLine = typeof ticket.estimatedWaitTime === "number" && ticket.estimatedWaitTime > 0
        ? `\nEstimated wait: ~${ticket.estimatedWaitTime} min`
        : "";
      const serviceLine = ticket.serviceName ? `\nService: ${ticket.serviceName}` : "";

      await sendWhatsAppMessage(
        from,
        `Hi ${customerLabel}, you're already in the queue at *${branchNameForStatus}*.\n\nTicket: *${tn}*${serviceLine}${positionLine}${waitLine}\n\nWe'll notify you on WhatsApp when it's your turn. There's no need to register again.`,
      );
      return;
    }

    if (status !== "waiting") {
      // Defensive catch-all for any other non-active status (e.g. paused).
      await sendWhatsAppMessage(
        from,
        `Hi ${customerLabel}, ticket *${tn}* is no longer active (status: ${ticket.status}).\n\nPlease scan the QR code at *${branchNameForStatus}* to register again.`,
      );
      return;
    }

    const cleanPhone = from.replace(/[^0-9]/g, "");
    await db
      .update(tickets)
      .set({
        whatsappConfirmed: true,
        whatsappPhone: cleanPhone,
        customerPhone: ticket.customerPhone || cleanPhone,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, ticket.id));

    const branch = ticket.branchId ? await db.select().from(branches).where(eq(branches.id, ticket.branchId)).limit(1).then((r: any[]) => r[0]) : null;
    const branchName = branch?.name || "Queue";
    const queueMode = branch?.queueMode || "fifo";
    const mode = normalizeWaMode(queueMode);
    const guestCount = (ticket.formData as any)?.partySize || (ticket.formData as any)?.guests || "";

    // Inbound-confirm reply uses the same templates as the proactive
    // "joined / confirmed / received" sends, so a Super Admin edit takes
    // effect everywhere customers see this content.
    const formData = (ticket.formData as any) || {};
    const baseVars: WaVars = {
      customer_name: ticket.customerName || "",
      ticket_number: ticket.ticketNumber,
      service_name: ticket.serviceName || "",
      branch_name: branchName,
      restaurant_name: branchName,
      foodcourt_name: branchName,
      booking_id: ticket.ticketNumber,
      order_id: ticket.ticketNumber,
      queue_position: ticket.position ?? "",
      wait_time: ticket.estimatedWaitTime ?? "",
      guest_count: guestCount,
      appointment_time: formData.appointmentTime || formData.time || "",
      appointment_date: formData.appointmentDate || formData.date || "",
      staff_name: formData.staffName || "",
    };

    let replyKey = "joined";
    if (mode === "dinein") replyKey = "confirmed";
    else if (mode === "takeaway") replyKey = "confirmed";
    else if (mode === "checkin") replyKey = "confirmed";

    const replyBody = await renderWaMessage(mode, replyKey, "en", baseVars);
    if (replyBody) await sendWhatsAppMessage(from, replyBody);

    console.log(
      `WhatsApp confirmed: ticket ${ticket.ticketNumber}, phone ${cleanPhone}, ref ${refCode}`,
    );
  } catch (error) {
    console.error("Error processing WhatsApp reference:", error);
    await sendWhatsAppMessage(
      from,
      `Something went wrong while confirming your registration. Please try again in a moment.`,
    );
  }
}

// All notification senders below resolve their message body through
// `renderForBranch` / `renderWaMessage`, which read live overrides from
// the `whatsapp_overrides` table. This means the moment a Super Admin
// saves an edit in the Content Manager, the next outgoing send picks
// up the change — no restart, no separate sync step.

// Internal: load a ticket's branch and assemble the variables every
// template can ask for. Falls back to safe defaults so missing fields
// render as empty rather than literal `{{var}}`.
async function buildTicketVars(ticketRow: any, branchName: string): Promise<{ mode: ReturnType<typeof normalizeWaMode>; vars: WaVars }> {
  const branch = ticketRow.branchId
    ? await db.select().from(branches).where(eq(branches.id, ticketRow.branchId)).limit(1).then((r: any[]) => r[0])
    : null;
  const mode = normalizeWaMode(branch?.queueMode || "fifo");
  const formData = (ticketRow.formData as any) || {};
  const guestCount = formData.partySize || formData.guests || "";

  const vars: WaVars = {
    customer_name: ticketRow.customerName || "",
    ticket_number: ticketRow.ticketNumber,
    service_name: ticketRow.serviceName || "",
    branch_name: branchName,
    restaurant_name: branchName,
    foodcourt_name: branchName,
    booking_id: ticketRow.ticketNumber,
    order_id: ticketRow.ticketNumber,
    queue_position: ticketRow.position ?? "",
    wait_time: ticketRow.estimatedWaitTime ?? "",
    counter_no: ticketRow.deskName || "",
    pickup_counter: ticketRow.deskName || "",
    guest_count: guestCount,
    // Optional fields the multistage / checkin / dinein templates can ask for.
    // Pulled from the booking form payload so they survive across the whole
    // ticket lifecycle without extra DB lookups.
    appointment_time: formData.appointmentTime || formData.time || "",
    appointment_date: formData.appointmentDate || formData.date || "",
    reservation_time: formData.reservationTime || formData.time || "",
    staff_name: formData.staffName || "",
    stage_name: ticketRow.currentStageName || formData.stageName || "",
    table_no: formData.tableNumber || "",
  };
  return { mode, vars };
}

// ─── Dine-In: Approved-Template Helpers ──────────────────────────────────────

/** Format a reservation timestamp for template body text. */
function formatReservationTime(reservationTime: Date | null | undefined, formData: any): string {
  if (formData?.reservationTime && typeof formData.reservationTime === "string") return formData.reservationTime;
  if (formData?.time) return String(formData.time);
  if (reservationTime) {
    return new Date(reservationTime).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });
  }
  return "";
}

/**
 * In-memory short-window dedup guard for approved-template sends.
 * Keyed by "ticketId|trigger". If the same ticketId+trigger is attempted
 * within TEMPLATE_DEDUP_WINDOW_MS (5 s), the second call is suppressed.
 * This catches rapid double-taps and network retries without blocking
 * legitimate second-hold cycles (which take at least a few seconds).
 */
const _recentTemplateSends = new Map<string, number>();
const TEMPLATE_DEDUP_WINDOW_MS = 5_000;

/**
 * Generic helper: look up ticket + branch + org, resolve the correct
 * approved template for the (dinein, trigger, preferredLanguage) tuple,
 * build the ordered positional body-variable array, and fire the Cloud API
 * template call. Falls back silently when no approved template is registered.
 *
 * @param extraVars  Any variable values that must override the defaults
 *                   (e.g. table_no when the staff assigns a table at call-time).
 * @param notifKey   The `notificationsSent` dedup key (e.g. "whatsapp_dinein_called").
 */
async function sendDineInApprovedTemplate(
  ticketId: string,
  trigger: string,
  extraVars: Record<string, string>,
  notifKey: string,
): Promise<boolean> {
  console.log(`[dinein-template] ▶ ticketId=${ticketId} trigger=${trigger} notifKey=${notifKey}`);

  const [row] = await db.select({
    id: tickets.id,
    ticketNumber: tickets.ticketNumber,
    customerName: tickets.customerName,
    whatsappPhone: tickets.whatsappPhone,
    customerPhone: tickets.customerPhone,
    preferredLanguage: tickets.preferredLanguage,
    formData: tickets.formData,
    tableNumber: tickets.tableNumber,
    reservationTime: tickets.reservationTime,
    notificationsSent: tickets.notificationsSent,
    whatsappConfirmed: tickets.whatsappConfirmed,
    qrToken: tickets.qrToken,
    orgId: branches.organizationId,
    branchName: branches.name,
    orgName: organizations.name,
  })
    .from(tickets)
    .leftJoin(branches, eq(tickets.branchId, branches.id))
    .leftJoin(organizations, eq(branches.organizationId, organizations.id))
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!row) {
    console.log(`[dinein-template] ✗ no row found for ticketId=${ticketId}`);
    return false;
  }

  console.log(`[dinein-template] row: ticket=${row.ticketNumber} customer=${row.customerName} phone=${row.customerPhone} waPhone=${row.whatsappPhone} lang=${row.preferredLanguage} qrToken=${row.qrToken}`);

  const phone = row.whatsappPhone || row.customerPhone;
  // Approved Meta templates can be sent without a prior customer-initiated
  // conversation — no whatsappConfirmed gate needed here (unlike free-form).
  if (!phone) {
    console.log(`[dinein-template] ✗ no phone on ticket`);
    return false;
  }

  const normalizedPhone = normalizeIndianPhone(phone);
  console.log(`[dinein-template] phone raw="${phone}" normalized="${normalizedPhone}"`);

  const sentNotifications = (row.notificationsSent as string[]) || [];
  if (sentNotifications.includes(notifKey)) {
    console.log(`[dinein-template] ✗ already sent (dedup): notifKey=${notifKey} sentNotifications=${JSON.stringify(sentNotifications)}`);
    return false;
  }

  // In-memory short-window dedup: absorb rapid duplicate API calls (double-tap,
  // network retry) without blocking the next legitimate hold/resume cycle.
  const memKey = `${ticketId}|${trigger}`;
  const lastSentAt = _recentTemplateSends.get(memKey);
  if (lastSentAt && Date.now() - lastSentAt < TEMPLATE_DEDUP_WINDOW_MS) {
    console.log(`[dinein-template] ✗ in-memory dedup (${Date.now() - lastSentAt}ms ago): ${memKey}`);
    return false;
  }
  _recentTemplateSends.set(memKey, Date.now());
  // Prune stale entries to prevent unbounded growth.
  if (_recentTemplateSends.size > 500) {
    const cutoff = Date.now() - TEMPLATE_DEDUP_WINDOW_MS * 4;
    for (const [k, v] of _recentTemplateSends) {
      if (v < cutoff) _recentTemplateSends.delete(k);
    }
  }

  const lang = (row.preferredLanguage as string) || "en";
  const template = getApprovedWaTemplate("dinein", trigger, lang);
  if (!template) {
    console.log(`[dinein-template] ✗ no approved template for dinein|${trigger}|${lang}`);
    return false;
  }

  const formData = (row.formData as any) || {};

  // Walk-in customers have no reservation_time; format the current IST time
  // as a human-readable fallback so Meta never receives an empty string param.
  const rawReservationTime = formatReservationTime(row.reservationTime, formData);
  const fallbackReservationTime = rawReservationTime || new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const rawGuestCount = String(formData.partySize || formData.guests || formData.guestCount || "");
  const fallbackGuestCount = rawGuestCount || "1";

  const varMap: Record<string, string> = {
    customer_name:    row.customerName || "-",
    restaurant_name:  (row.orgName as string | null) || (row.branchName as string | null) || "-",
    branch_name:      (row.branchName as string | null) || "-",
    booking_id:       row.ticketNumber || "-",
    guest_count:      fallbackGuestCount,
    reservation_time: fallbackReservationTime,
    table_no:         (row.tableNumber as string | null) || formData.tableNumber || "-",
    ...extraVars,
  };

  const bodyParams = template.bodyVariables.map((v) => varMap[v] ?? "");

  const domain = process.env.APP_DOMAIN || process.env.EXPO_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  const proto  = domain?.startsWith("localhost") ? "http" : "https";
  const base   = domain ? `${proto}://${domain}` : "";

  const opts: { headerImageUrl?: string; organizationId?: string; ctaUrlParam?: string } = {
    organizationId: (row.orgId as string | null) || undefined,
  };
  if (template.hasImageHeader && base && row.qrToken) {
    opts.headerImageUrl = `${base}/queue-ticket-image/${row.qrToken}.png`;
    // Pre-render and cache the ticket image BEFORE sending the template URL
    // to Meta.  Meta fetches the URL immediately after receiving the API
    // request; without this the Playwright render (3-8 s) happens inside
    // Meta's fetch window, adding a visible delay to every message.
    // After pre-render the cache serves the image in ~0 ms.
    try {
      const { preRenderAndCacheQueueTicketImage } = await import("./ticket-image");
      await preRenderAndCacheQueueTicketImage(row.qrToken as string);
    } catch (cacheErr) {
      console.warn("[dinein-template] image pre-render failed (non-fatal):", cacheErr);
    }
  }
  // For URL buttons the CTA parameter must be the full ticket URL so that
  // the "Visit Website" button in WhatsApp opens the live ticket page.
  // Example: https://tiqketsglobal.replit.app/ticket/<qrToken>
  if (template.hasCTAUrl && row.qrToken && base) {
    opts.ctaUrlParam = `${base}/ticket/${row.qrToken as string}`;
  }

  console.log(`[dinein-template] ► sending template="${template.templateName}" lang="${template.languageCode}" to="${normalizedPhone}"`);
  console.log(`[dinein-template]   bodyVars=${JSON.stringify(template.bodyVariables)}`);
  console.log(`[dinein-template]   bodyParams=${JSON.stringify(bodyParams)}`);
  console.log(`[dinein-template]   headerImageUrl=${opts.headerImageUrl ?? "(none)"}`);
  console.log(`[dinein-template]   ctaUrlParam=${opts.ctaUrlParam ?? "(none)"}`);

  const sent = await sendWhatsAppTemplateMessage(normalizedPhone, template.templateName, template.languageCode, bodyParams, {
    ...opts,
    bodyParamNames: template.bodyVariables,
  });
  console.log(`[dinein-template] sendWhatsAppTemplateMessage returned: ${sent}`);
  if (sent) await markWhatsAppSent(ticketId, sentNotifications, notifKey);
  return sent;
}

// ─── FIFO / Multi-Stage: Your Turn (Called) ───

export async function sendWhatsAppTurnNotification(
  ticketId: string,
  branchName: string,
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_turn");
    if (!ticket) return;

    const { mode, vars } = await buildTicketVars(ticket, branchName);
    const body = await renderWaMessage(mode, "now_serving", "en", vars);
    if (body) await sendWhatsAppMessage(ticket.whatsappPhone, body);

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_turn");
    console.log(`WhatsApp turn notification sent: ticket ${ticket.ticketNumber}`);
  } catch (error) {
    console.error("Error sending WhatsApp turn notification:", error);
  }
}

// ─── FIFO / Multi-Stage: Approaching Notifications ───

export async function sendWhatsAppApproachingNotification(
  ticketId: string,
  branchName: string,
  position: number,
  type: string,
): Promise<void> {
  try {
    const notifKey = `whatsapp_${type}`;
    const ticket = await getWhatsAppTicket(ticketId, notifKey);
    if (!ticket) return;

    const { mode, vars } = await buildTicketVars(ticket, branchName);
    // Override the position with the value the caller provided so the
    // per-call number wins over the cached one on the ticket row.
    vars.queue_position = position;

    // position_3 -> "position update"; get_ready -> "get ready"; position_1 -> "almost your turn"
    const triggerKey =
      type === "position_3" ? "position" : type === "get_ready" ? "get_ready" : "almost";
    const body = await renderWaMessage(mode, triggerKey, "en", vars);
    if (!body) return;

    await sendWhatsAppMessage(ticket.whatsappPhone, body);
    await markWhatsAppSent(ticketId, ticket._sentNotifications, notifKey);
  } catch (error) {
    console.error("Error sending WhatsApp approaching notification:", error);
  }
}

// ─── Multi-Stage: Passed to Next Stage ───

export async function sendWhatsAppStageMovedNotification(
  ticketId: string,
  branchName: string,
  stageName: string,
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_stage_moved");
    if (!ticket) return;

    const stage = stageName || ticket.serviceName || "the next step";
    const greeting = ticket.customerName ? `Hi ${ticket.customerName}, ` : "";
    const body = `${greeting}you've been moved to ${stage} at ${branchName}. Your queue number is ${ticket.ticketNumber}. We'll let you know when it's your turn.`;
    await sendWhatsAppMessage(ticket.whatsappPhone, body);

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_stage_moved");
  } catch (error) {
    console.error("Error sending WhatsApp stage moved notification:", error);
  }
}

// ─── Check-In Mode: Confirmed ───

export async function sendWhatsAppCheckinNotification(
  ticketId: string,
  branchName: string,
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_checkin");
    if (!ticket) return;

    const { vars } = await buildTicketVars(ticket, branchName);
    const body = await renderWaMessage("checkin", "checked_in", "en", vars);
    if (body) await sendWhatsAppMessage(ticket.whatsappPhone, body);

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_checkin");
  } catch (error) {
    console.error("Error sending WhatsApp checkin notification:", error);
  }
}

// ─── Dine-In Mode: Booking Confirmed (joined queue) ───

export async function sendWhatsAppDineInBookingConfirmedNotification(
  ticketId: string,
  branchName: string,
): Promise<void> {
  try {
    // Try approved template first (booking_confirmed). Falls back to free-form
    // text when no template is registered for the ticket's language.
    const sent = await sendDineInApprovedTemplate(ticketId, "booking_confirmed", {}, "whatsapp_dinein_confirmed");
    if (sent) return;

    // Free-form fallback
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_dinein_confirmed");
    if (!ticket) return;

    const { vars } = await buildTicketVars(ticket, branchName);
    const lang = (ticket.preferredLanguage as string) || "en";
    const body = await renderWaMessage("dinein", "confirmed", lang, vars);
    if (body) await sendWhatsAppMessage(ticket.whatsappPhone, body);

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_dinein_confirmed");
  } catch (error) {
    console.error("Error sending WhatsApp dine-in booking confirmed:", error);
  }
}

// ─── Dine-In Mode: Table Ready (Called) ───

export async function sendWhatsAppDineInCalledNotification(
  ticketId: string,
  branchName: string,
  tableNumber: string | null,
): Promise<void> {
  try {
    const [ticketRow] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticketRow) return;

    const callCount = ticketRow.callCount || 1;
    const isReminder = callCount > 1;
    const notifKey = isReminder ? `whatsapp_dinein_reminder_${callCount}` : "whatsapp_dinein_called";

    // Guard on any phone (whatsappPhone preferred; customerPhone accepted).
    // Approved templates can be sent to any customer regardless of whatsappPhone.
    const phone = ticketRow.whatsappPhone || ticketRow.customerPhone;
    if (!phone) return;
    const sentNotifications = (ticketRow.notificationsSent as string[]) || [];
    if (sentNotifications.includes(notifKey)) return;

    // Try approved template first (no whatsappConfirmed gate — approved templates
    // can be sent to any customer who provided a phone number, unlike free-form
    // messages which require prior customer opt-in within Meta's 24h window).
    const approvedTrigger = isReminder ? "booking_reminder" : "table_ready";
    const extraVars: Record<string, string> = {};
    if (tableNumber) extraVars.table_no = tableNumber;
    const sent = await sendDineInApprovedTemplate(ticketId, approvedTrigger, extraVars, notifKey);
    if (sent) return;

    // Free-form fallback — only reaches here when no approved template is
    // registered; requires prior customer opt-in (whatsappConfirmed).
    if (!ticketRow.whatsappConfirmed) return;
    const { vars } = await buildTicketVars(ticketRow, branchName);
    if (tableNumber) vars.table_no = tableNumber;
    const lang = (ticketRow.preferredLanguage as string) || "en";
    const triggerKey = isReminder ? "reminder" : "table_ready";
    const body = await renderWaMessage("dinein", triggerKey, lang, vars);
    if (!body) return;

    await sendWhatsAppMessage(ticketRow.whatsappPhone, body);
    await markWhatsAppSent(ticketId, sentNotifications, notifKey);
  } catch (error) {
    console.error("Error sending WhatsApp dine-in notification:", error);
  }
}

// ─── Dine-In Mode: Reservation Confirmed ───

export async function sendWhatsAppReservationConfirmedNotification(
  ticketId: string,
  branchName: string,
): Promise<void> {
  try {
    const sent = await sendDineInApprovedTemplate(ticketId, "reservation_confirmed", {}, "whatsapp_reservation_confirmed");
    if (sent) return;

    // Free-form fallback
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_reservation_confirmed");
    if (!ticket) return;

    const { vars } = await buildTicketVars(ticket, branchName);
    const lang = (ticket.preferredLanguage as string) || "en";
    const body = await renderWaMessage("dinein", "reservation", lang, vars);
    if (body) await sendWhatsAppMessage(ticket.whatsappPhone, body);

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_reservation_confirmed");
  } catch (error) {
    console.error("Error sending WhatsApp reservation confirmed:", error);
  }
}

// ─── Takeaway Mode: Approved-Template Helpers ────────────────────────────────

type TakeawayTrigger = "confirmed" | "ready" | "delivered" | "call_again";

/**
 * Return the ordered body-parameter values and named-variable keys for a
 * given (trigger, lang) pair.  Variable order differs between EN and TA for
 * several triggers — always map per (trigger, lang), never per trigger alone.
 */
function getTakeawayTemplateParams(
  trigger: TakeawayTrigger,
  lang: string,
  v: { order_id: string; branch_name: string; pickup_counter: string; foodcourt_name: string },
): { params: string[]; paramNames: string[] } {
  switch (trigger) {
    case "confirmed":
      // EN & TA: branch_name, order_id
      return { params: [v.branch_name, v.order_id], paramNames: ["branch_name", "order_id"] };

    case "ready":
      if (lang === "ta")
        // TA: branch_name, pickup_counter, order_id
        return { params: [v.branch_name, v.pickup_counter, v.order_id], paramNames: ["branch_name", "pickup_counter", "order_id"] };
      // EN: order_id, branch_name, pickup_counter
      return { params: [v.order_id, v.branch_name, v.pickup_counter], paramNames: ["order_id", "branch_name", "pickup_counter"] };

    case "delivered":
      if (lang === "ta")
        // TA: order_id, foodcourt_name, branch_name
        return { params: [v.order_id, v.foodcourt_name, v.branch_name], paramNames: ["order_id", "foodcourt_name", "branch_name"] };
      // EN: order_id, branch_name, foodcourt_name
      return { params: [v.order_id, v.branch_name, v.foodcourt_name], paramNames: ["order_id", "branch_name", "foodcourt_name"] };

    case "call_again":
      if (lang === "ta")
        // TA: branch_name, order_id
        return { params: [v.branch_name, v.order_id], paramNames: ["branch_name", "order_id"] };
      // EN: order_id, branch_name
      return { params: [v.order_id, v.branch_name], paramNames: ["order_id", "branch_name"] };
  }
}

/**
 * Core sender for all four takeaway approved-template triggers.
 *
 * Key differences from the old free-form send:
 * - Joins ticket → branch → organisation to get branchName, orgName, deskName.
 * - Reads preferredLanguage (falls back to "en") to select the right template.
 * - Approved templates do NOT require a prior customer-initiated message, so
 *   the whatsappConfirmed gate used by free-form sends is intentionally skipped.
 * - Applies DB-level (notificationsSent) + in-memory 5-second dedup.
 */
async function sendTakeawayApprovedTemplate(
  ticketId: string,
  trigger: TakeawayTrigger,
  notifKey: string,
): Promise<boolean> {
  console.log(`[takeaway-template] ▶ ticketId=${ticketId} trigger=${trigger} notifKey=${notifKey}`);

  const [row] = await db
    .select({
      id:                tickets.id,
      ticketNumber:      tickets.ticketNumber,
      whatsappPhone:     tickets.whatsappPhone,
      customerPhone:     tickets.customerPhone,
      preferredLanguage: tickets.preferredLanguage,
      deskName:          tickets.deskName,
      notificationsSent: tickets.notificationsSent,
      orgId:             branches.organizationId,
      branchName:        branches.name,
      orgName:           organizations.name,
    })
    .from(tickets)
    .leftJoin(branches,      eq(tickets.branchId,        branches.id))
    .leftJoin(organizations, eq(branches.organizationId, organizations.id))
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!row) {
    console.log(`[takeaway-template] ✗ no row for ticketId=${ticketId}`);
    return false;
  }

  const phone = row.whatsappPhone || row.customerPhone;
  if (!phone) {
    console.log(`[takeaway-template] ✗ no phone on ticket`);
    return false;
  }

  // DB dedup — each notifKey is written once per ticket lifecycle.
  const sentNotifications = (row.notificationsSent as string[]) || [];
  if (sentNotifications.includes(notifKey)) {
    console.log(`[takeaway-template] ✗ already sent (dedup): notifKey=${notifKey}`);
    return false;
  }

  // In-memory 5-second dedup — absorbs rapid double-taps / network retries.
  const memKey = `${ticketId}|${trigger}`;
  const lastSentAt = _recentTemplateSends.get(memKey);
  if (lastSentAt && Date.now() - lastSentAt < TEMPLATE_DEDUP_WINDOW_MS) {
    console.log(`[takeaway-template] ✗ in-memory dedup (${Date.now() - lastSentAt}ms ago): ${memKey}`);
    return false;
  }
  _recentTemplateSends.set(memKey, Date.now());
  if (_recentTemplateSends.size > 500) {
    const cutoff = Date.now() - TEMPLATE_DEDUP_WINDOW_MS * 4;
    for (const [k, v] of _recentTemplateSends) if (v < cutoff) _recentTemplateSends.delete(k);
  }

  // Normalise to "ta" | "en" — only two supported templates exist.
  const lang        = (row.preferredLanguage as string) === "ta" ? "ta" : "en";
  // Template name convention:
  //   tiqkets_global_takeaway_order_{confirmed|ready|delivered}_{en|ta}
  //   tiqkets_global_takeaway_call_again_reminder_{en|ta}
  const triggerSlug = trigger === "call_again" ? "call_again_reminder" : `order_${trigger}`;
  const templateName = `tiqkets_global_takeaway_${triggerSlug}_${lang}`;

  const { params, paramNames } = getTakeawayTemplateParams(trigger, lang, {
    order_id:       row.ticketNumber            || "",
    branch_name:    (row.branchName as string)  || "",
    pickup_counter: (row.deskName   as string)  || "",
    // foodcourt_name = the food-court / mall (org name); falls back to branch name.
    foodcourt_name: (row.orgName    as string)  || (row.branchName as string) || "",
  });

  console.log(`[takeaway-template] templateName=${templateName} lang=${lang} params=${JSON.stringify(params)}`);

  const sent = await sendWhatsAppTemplateMessage(
    normalizeIndianPhone(phone),
    templateName,
    lang,
    params,
    { bodyParamNames: paramNames, organizationId: (row.orgId as string) ?? undefined },
  );

  if (sent) {
    await markWhatsAppSent(ticketId, sentNotifications, notifKey);
    console.log(`[takeaway-template] ✓ sent ${templateName} to ${phone}`);
  }
  return sent;
}

// ─── Takeaway Mode: Order Confirmed (joined queue) ───

export async function sendWhatsAppTakeawayConfirmedNotification(
  ticketId: string,
  _branchName: string,  // kept for API compatibility; value is fetched from DB
): Promise<void> {
  try {
    await sendTakeawayApprovedTemplate(ticketId, "confirmed", "whatsapp_takeaway_confirmed");
  } catch (error) {
    console.error("Error sending WhatsApp takeaway confirmed:", error);
  }
}

// ─── Takeaway Mode: Order Ready / Call-Again Reminder ───

export async function sendWhatsAppTakeawayReadyNotification(
  ticketId: string,
  _branchName: string,  // kept for API compatibility; value is fetched from DB
): Promise<void> {
  try {
    // callCount decides first-ready vs subsequent reminder. Each callCount gets
    // its own dedup key so every reminder fires exactly once per call.
    const [row] = await db
      .select({ callCount: tickets.callCount })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);
    if (!row) return;

    const callCount  = row.callCount || 1;
    const isReminder = callCount > 1;
    const notifKey: string        = isReminder ? `whatsapp_takeaway_reminder_${callCount}` : "whatsapp_takeaway_ready";
    const trigger: TakeawayTrigger = isReminder ? "call_again" : "ready";

    await sendTakeawayApprovedTemplate(ticketId, trigger, notifKey);
  } catch (error) {
    console.error("Error sending WhatsApp takeaway ready notification:", error);
  }
}

// ─── Takeaway Mode: Order Delivered ───

export async function sendWhatsAppTakeawayDeliveredNotification(
  ticketId: string,
  _branchName: string,  // kept for API compatibility; value is fetched from DB
): Promise<void> {
  try {
    await sendTakeawayApprovedTemplate(ticketId, "delivered", "whatsapp_takeaway_delivered");
  } catch (error) {
    console.error("Error sending WhatsApp takeaway delivered:", error);
  }
}

// ─── Status Change Notifications (for WhatsApp users) ───

export async function sendWhatsAppStatusChangeNotification(
  ticketId: string,
  branchName: string,
  newStatus: string,
): Promise<void> {
  try {
    const notifKey = `whatsapp_status_${newStatus}`;

    // For dine-in hold / resume, attempt the approved template BEFORE the
    // whatsappConfirmed gate. QR-scan walk-in customers never go through OTP
    // so whatsappConfirmed is null — they must still receive these messages.
    // sendDineInApprovedTemplate returns false when no template is registered
    // (non-dine-in mode), so the free-form fallback below still runs for other
    // queue modes that have whatsappConfirmed set.
    if (newStatus === "hold") {
      const sent = await sendDineInApprovedTemplate(ticketId, "booking_on_hold", {}, notifKey);
      if (sent) return;
    } else if (newStatus === "waiting") {
      const sent = await sendDineInApprovedTemplate(ticketId, "booking_resumed", {}, notifKey);
      if (sent) return;
    }

    // Free-form fallback — requires prior customer opt-in (whatsappConfirmed).
    const ticket = await getWhatsAppTicket(ticketId, notifKey);
    if (!ticket) return;

    const { mode, vars } = await buildTicketVars(ticket, branchName);

    // Map a status transition to the (mode, trigger) pair the message manager
    // exposes. FIFO / Selective / Multistage share `now_serving` and
    // `completed`; the remaining transitions are pinned to the mode that
    // authors them so the customer always receives a meaningful body.
    let target: { mode: string; key: string } | null = null;
    switch (newStatus) {
      case "serving":   target = { mode,           key: "now_serving" }; break;
      case "completed": target = { mode,           key: "completed"   }; break;
      case "cancelled": target = { mode,           key: "cancelled"   }; break;
      case "no_show":   target = { mode: "fifo",   key: "no_show"     }; break;
      case "hold":      target = { mode: "dinein", key: "hold"        }; break;
      case "waiting":   target = { mode: "dinein", key: "resume"      }; break;
      default: return;
    }

    const lang = (ticket.preferredLanguage as string) || "en";
    const body = await renderWaMessage(target.mode, target.key, lang, vars);
    if (!body) return;

    await sendWhatsAppMessage(ticket.whatsappPhone, body);
    await markWhatsAppSent(ticketId, ticket._sentNotifications, notifKey);
  } catch (error) {
    console.error("Error sending WhatsApp status change notification:", error);
  }
}

/**
 * Send a queue-join confirmation via WhatsApp: a plain text message with
 * ticket details + live-ticket URL, followed by the designed ticket card
 * image (Playwright screenshot). Both are fire-and-forget on the caller.
 */
export async function sendWhatsAppQueueTicket(ticketId: string): Promise<void> {
  try {
    const [row] = await db.select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      customerName: tickets.customerName,
      whatsappPhone: tickets.whatsappPhone,
      customerPhone: tickets.customerPhone,
      serviceName: tickets.serviceName,
      serviceId: tickets.serviceId,
      position: tickets.position,
      estimatedWaitTime: tickets.estimatedWaitTime,
      qrToken: tickets.qrToken,
      orgId: branches.organizationId,
      branchName: branches.name,
      branchQueueMode: branches.queueMode,
      serviceSettings: services.serviceSettings,
    })
      .from(tickets)
      .leftJoin(branches, eq(tickets.branchId, branches.id))
      .leftJoin(services, eq(tickets.serviceId, services.id))
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!row?.qrToken) return;

    // Resolve effective queue mode: service-level override wins over branch setting.
    const svcModeOverride = (row.serviceSettings as Record<string, any> | null)?.queueMode;
    const effectiveQueueMode = svcModeOverride || row.branchQueueMode || "fifo";
    const normalizedMode = normalizeWaMode(effectiveQueueMode);

    console.log(`[wa-queue-ticket] ticketId=${ticketId} branchQueueMode="${row.branchQueueMode}" svcModeOverride="${svcModeOverride}" effectiveQueueMode="${effectiveQueueMode}" normalizedMode="${normalizedMode}"`);

    // For dine-in queues, use the approved "booking_confirmed" template
    // instead of the free-form image message — it can be sent outside the
    // 24-hour customer-service window and includes the image header + CTA.
    const isDineIn = normalizedMode === "dinein";
    if (isDineIn) {
      console.log(`[wa-queue-ticket] dine-in detected → calling sendDineInApprovedTemplate`);
      const sent = await sendDineInApprovedTemplate(ticketId, "booking_confirmed", {}, "whatsapp_dinein_confirmed");
      if (sent) return; // approved template handled it
      console.log(`[wa-queue-ticket] approved template returned false → falling through to free-form`);
    }

    const phone = row.whatsappPhone || row.customerPhone;
    if (!phone) return;

    const domain =
      process.env.APP_DOMAIN ||
      process.env.EXPO_PUBLIC_DOMAIN ||
      process.env.REPLIT_DEV_DOMAIN;
    if (!domain) return;

    const proto = domain.startsWith("localhost") ? "http" : "https";
    const base = `${proto}://${domain}`;
    const ticketUrl = `${base}/ticket/${row.qrToken}`;
    const imageUrl = `${base}/queue-ticket-image/${row.qrToken}.png`;

    const ordinal = (n: number): string => {
      const s = ["th", "st", "nd", "rd"];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    const pos = row.position || 0;
    const wait = row.estimatedWaitTime || 0;
    const lines: string[] = [
      `Hi ${row.customerName || "there"},`,
      "",
      `Your queue ticket for *${row.serviceName || "Service"}* at *${row.branchName || "Branch"}* is ready.`,
      "",
      `Ticket Number: *${row.ticketNumber}*`,
    ];
    if (pos > 0) {
      lines.push(`Position: *${ordinal(pos)}* in queue`);
      if (wait > 0) lines.push(`Est. Wait: ~${wait} minutes`);
    }
    lines.push("", "View your live ticket:", ticketUrl);
    const caption = lines.join("\n");

    if (proto === "https") {
      // Single image message with all ticket info as the caption
      await sendWhatsAppImage(phone, imageUrl, caption, row.orgId || undefined);
    } else {
      // Development (HTTP) — Meta can't fetch localhost images, send text only
      await sendWhatsAppMessage(phone, caption, row.orgId || undefined);
    }
  } catch (e) {
    console.error("[whatsapp] sendWhatsAppQueueTicket error:", e);
  }
}

export { sendWhatsAppMessage, getVerifyToken };
