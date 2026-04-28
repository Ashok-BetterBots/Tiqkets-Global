import { db } from "./db";
import { tickets, branches } from "@shared/schema";
import { eq } from "drizzle-orm";
import { renderWaMessage, type WaVars } from "./wa-templates";
import { normalizeWaMode } from "@shared/wa-templates";

const WHATSAPP_API_VERSION = "v21.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;
const BUSINESS_PHONE = "919150086101";

function getPhoneNumberId(): string {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || "";
}

function getAccessToken(): string {
  return process.env.WHATSAPP_ACCESS_TOKEN || "";
}

function getVerifyToken(): string {
  return process.env.WHATSAPP_VERIFY_TOKEN || "tiqkets_whatsapp_verify_2025";
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
  return `https://wa.me/${BUSINESS_PHONE}?text=${message}`;
}

async function sendWhatsAppMessage(
  to: string,
  message: string,
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
    return true;
  } catch (error) {
    console.error("Failed to send WhatsApp message:", error);
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
    };

    let replyKey = "joined";
    if (mode === "dinein") replyKey = "confirmed";
    else if (mode === "takeaway") replyKey = "confirmed";
    else if (mode === "checkin") replyKey = "checked_in";

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

    // get_ready / position_1 -> "almost your turn"; position_3 -> "position update"
    const triggerKey = type === "position_3" ? "position" : "almost";
    const body = await renderWaMessage(mode, triggerKey, "en", vars);
    if (!body) return;

    await sendWhatsAppMessage(ticket.whatsappPhone, body);
    await markWhatsAppSent(ticketId, ticket._sentNotifications, notifKey);
  } catch (error) {
    console.error("Error sending WhatsApp approaching notification:", error);
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
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_dinein_confirmed");
    if (!ticket) return;

    const { vars } = await buildTicketVars(ticket, branchName);
    const body = await renderWaMessage("dinein", "confirmed", "en", vars);
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

    if (!ticketRow.whatsappPhone || !ticketRow.whatsappConfirmed) return;
    const sentNotifications = (ticketRow.notificationsSent as string[]) || [];
    if (sentNotifications.includes(notifKey)) return;

    const { vars } = await buildTicketVars(ticketRow, branchName);
    if (tableNumber) vars.table_no = tableNumber;

    const triggerKey = isReminder ? "reminder" : "table_ready";
    const body = await renderWaMessage("dinein", triggerKey, "en", vars);
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
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_reservation_confirmed");
    if (!ticket) return;

    const { vars } = await buildTicketVars(ticket, branchName);
    const body = await renderWaMessage("dinein", "reservation", "en", vars);
    if (body) await sendWhatsAppMessage(ticket.whatsappPhone, body);

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_reservation_confirmed");
  } catch (error) {
    console.error("Error sending WhatsApp reservation confirmed:", error);
  }
}

// ─── Takeaway Mode: Order Confirmed (joined queue) ───

export async function sendWhatsAppTakeawayConfirmedNotification(
  ticketId: string,
  branchName: string,
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_takeaway_confirmed");
    if (!ticket) return;

    const { vars } = await buildTicketVars(ticket, branchName);
    const body = await renderWaMessage("takeaway", "confirmed", "en", vars);
    if (body) await sendWhatsAppMessage(ticket.whatsappPhone, body);

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_takeaway_confirmed");
  } catch (error) {
    console.error("Error sending WhatsApp takeaway confirmed:", error);
  }
}

// ─── Takeaway Mode: Order Ready ───

export async function sendWhatsAppTakeawayReadyNotification(
  ticketId: string,
  branchName: string,
): Promise<void> {
  try {
    const [ticketRow] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticketRow) return;

    const callCount = ticketRow.callCount || 1;
    const isReminder = callCount > 1;
    const notifKey = isReminder ? `whatsapp_takeaway_reminder_${callCount}` : "whatsapp_takeaway_ready";

    if (!ticketRow.whatsappPhone || !ticketRow.whatsappConfirmed) return;
    const sentNotifications = (ticketRow.notificationsSent as string[]) || [];
    if (sentNotifications.includes(notifKey)) return;

    const { vars } = await buildTicketVars(ticketRow, branchName);
    const triggerKey = isReminder ? "call_again" : "ready";
    const body = await renderWaMessage("takeaway", triggerKey, "en", vars);
    if (!body) return;

    await sendWhatsAppMessage(ticketRow.whatsappPhone, body);
    await markWhatsAppSent(ticketId, sentNotifications, notifKey);
  } catch (error) {
    console.error("Error sending WhatsApp takeaway ready notification:", error);
  }
}

// ─── Takeaway Mode: Order Delivered ───

export async function sendWhatsAppTakeawayDeliveredNotification(
  ticketId: string,
  branchName: string,
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_takeaway_delivered");
    if (!ticket) return;

    const { vars } = await buildTicketVars(ticket, branchName);
    const body = await renderWaMessage("takeaway", "delivered", "en", vars);
    if (body) await sendWhatsAppMessage(ticket.whatsappPhone, body);

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_takeaway_delivered");
  } catch (error) {
    console.error("Error sending WhatsApp takeaway delivered notification:", error);
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
    const ticket = await getWhatsAppTicket(ticketId, notifKey);
    if (!ticket) return;

    const { mode, vars } = await buildTicketVars(ticket, branchName);

    // Map a status transition to the (mode, trigger) pair the manager exposes.
    // FIFO / Selective / Multistage share `now_serving` and `completed`. The
    // remaining transitions are only authored under one mode in the manager
    // taxonomy, so we pin to that mode regardless of the branch's queueMode
    // — the message is generic enough (e.g. "Marked as No Show") to apply
    // to any queue type and this guarantees the customer always gets a body.
    let target: { mode: string; key: string } | null = null;
    switch (newStatus) {
      case "serving":   target = { mode,         key: "now_serving" }; break;
      case "completed": target = { mode,         key: "completed"   }; break;
      case "no_show":   target = { mode: "fifo",   key: "no_show"   }; break;
      case "hold":      target = { mode: "dinein", key: "hold"      }; break;
      case "waiting":   target = { mode: "dinein", key: "resume"    }; break;
      default: return;
    }

    const body = await renderWaMessage(target.mode, target.key, "en", vars);
    if (!body) return;

    await sendWhatsAppMessage(ticket.whatsappPhone, body);
    await markWhatsAppSent(ticketId, ticket._sentNotifications, notifKey);
  } catch (error) {
    console.error("Error sending WhatsApp status change notification:", error);
  }
}

export { sendWhatsAppMessage, getVerifyToken };
