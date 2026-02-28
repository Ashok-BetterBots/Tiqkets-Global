import { db } from "./db";
import { tickets } from "@shared/schema";
import { eq } from "drizzle-orm";

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
    `TIQKET ID: ${refCode}\n\nI just joined the queue at TIQKETS. Please confirm my registration.`
  );
  return `https://wa.me/${BUSINESS_PHONE}?text=${message}`;
}

async function sendWhatsAppMessage(to: string, message: string): Promise<boolean> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();

  if (!phoneNumberId || !accessToken) {
    console.log("WhatsApp API credentials not configured, skipping notification");
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
      }
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

// ─── Helper to get ticket with WhatsApp guard ───

async function getWhatsAppTicket(ticketId: string, notifKey: string): Promise<any | null> {
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);

  if (!ticket || !ticket.whatsappPhone || !ticket.whatsappConfirmed) return null;

  const sentNotifications = (ticket.notificationsSent as string[]) || [];
  if (sentNotifications.includes(notifKey)) return null;

  return { ...ticket, _sentNotifications: sentNotifications };
}

async function markWhatsAppSent(ticketId: string, sentNotifications: string[], notifKey: string): Promise<void> {
  const updated = [...sentNotifications, notifKey];
  await db
    .update(tickets)
    .set({ notificationsSent: updated, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId));
}

// ─── Incoming WhatsApp Processing ───

export async function processIncomingWhatsApp(
  from: string,
  messageBody: string
): Promise<void> {
  const refCodeMatch = messageBody.match(/(?:TIQKET\s*ID:\s*)?(TQ[A-Z0-9]{5})/);
  if (!refCodeMatch) {
    await sendWhatsAppMessage(
      from,
      `Hi! We couldn't find a valid reference code in your message.\n\nPlease send the exact reference code you received after joining the queue (e.g., TQ3AB7K).\n\nIf you haven't joined a queue yet, scan the QR code at the location to get started.`
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
        `Sorry, the reference code *${refCode}* was not found. It may have expired or been entered incorrectly.\n\nPlease check the code and try again, or scan the QR code to join a new queue.`
      );
      return;
    }

    if (ticket.whatsappConfirmed) {
      await sendWhatsAppMessage(
        from,
        `Your registration *${ticket.ticketNumber}* is already confirmed!\n\n` +
        `Service: ${ticket.serviceName}\n` +
        `Position: #${ticket.position}\n\n` +
        `We'll notify you on WhatsApp when it's your turn.\n\n` +
        `Download the TIQKETS app for real-time tracking, snooze, swap, and more features!`
      );
      return;
    }

    if (ticket.status !== "waiting") {
      await sendWhatsAppMessage(
        from,
        `This queue entry *${ticket.ticketNumber}* is no longer active (status: ${ticket.status}).\n\nPlease scan the QR code to join a new queue.`
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

    await sendWhatsAppMessage(
      from,
      `Your queue registration is confirmed!\n\n` +
      `Ticket: *${ticket.ticketNumber}*\n` +
      `Service: ${ticket.serviceName}\n` +
      `Position: #${ticket.position}\n` +
      `Est. Wait: ~${ticket.estimatedWaitTime} min\n\n` +
      `We'll send you a WhatsApp message when it's your turn.\n\n` +
      `Download the TIQKETS app for real-time tracking, position updates, snooze your turn, swap positions, and much more!`
    );

    console.log(`WhatsApp confirmed: ticket ${ticket.ticketNumber}, phone ${cleanPhone}, ref ${refCode}`);
  } catch (error) {
    console.error("Error processing WhatsApp reference:", error);
    await sendWhatsAppMessage(
      from,
      `Something went wrong while confirming your registration. Please try again in a moment.`
    );
  }
}

// ─── FIFO / Multi-Stage: Your Turn (Called) ───

export async function sendWhatsAppTurnNotification(ticketId: string, branchName: string): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_turn");
    if (!ticket) return;

    const deskLine = ticket.deskName ? `\nDesk: *${ticket.deskName}*` : "";
    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `IT'S YOUR TURN!\n\n` +
      `Ticket: *${ticket.ticketNumber}*\n` +
      `Service: ${ticket.serviceName}${deskLine}\n` +
      `Location: ${branchName}\n\n` +
      `Please proceed${ticket.deskName ? ` to ${ticket.deskName}` : ""} now.`
    );

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
  type: string
): Promise<void> {
  try {
    const notifKey = `whatsapp_${type}`;
    const ticket = await getWhatsAppTicket(ticketId, notifKey);
    if (!ticket) return;

    let message = "";

    if (type === "get_ready") {
      message =
        `Get Ready! Your turn is approaching.\n\n` +
        `Ticket: *${ticket.ticketNumber}*\n` +
        `Service: ${ticket.serviceName}\n` +
        `Position: #${position}\n` +
        `Location: ${branchName}\n\n` +
        `Your expected service time is within 15 minutes. Please start heading over!`;
    } else if (type === "position_3") {
      message =
        `Your turn will arrive soon!\n\n` +
        `Ticket: *${ticket.ticketNumber}*\n` +
        `Service: ${ticket.serviceName}\n` +
        `Position: *3rd in line*\n` +
        `Location: ${branchName}\n\n` +
        `Please be nearby and ready.`;
    } else if (type === "position_1") {
      message =
        `You're NEXT in line!\n\n` +
        `Ticket: *${ticket.ticketNumber}*\n` +
        `Service: ${ticket.serviceName}\n` +
        `Location: ${branchName}\n\n` +
        `Please be ready! You will be called shortly.`;
    }

    if (message) {
      await sendWhatsAppMessage(ticket.whatsappPhone, message);
      await markWhatsAppSent(ticketId, ticket._sentNotifications, notifKey);
    }
  } catch (error) {
    console.error("Error sending WhatsApp approaching notification:", error);
  }
}

// ─── Check-In Mode: Confirmed ───

export async function sendWhatsAppCheckinNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_checkin");
    if (!ticket) return;

    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `Successfully Checked In!\n\n` +
      `Ticket: *${ticket.ticketNumber}*\n` +
      `Service: ${ticket.serviceName}\n` +
      `Location: ${branchName}\n\n` +
      `You're now in the queue. We'll notify you when it's your turn.`
    );

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_checkin");
  } catch (error) {
    console.error("Error sending WhatsApp checkin notification:", error);
  }
}

// ─── Dine-In Mode: Called with Table Number ───

export async function sendWhatsAppDineInCalledNotification(
  ticketId: string,
  branchName: string,
  tableNumber: string | null
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_dinein_called");
    if (!ticket) return;

    const tableInfo = tableNumber ? `\nTable: *${tableNumber}*` : "";
    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `Your Table is Ready!\n\n` +
      `Ticket: *${ticket.ticketNumber}*${tableInfo}\n` +
      `Location: ${branchName}\n\n` +
      `Please proceed to ${tableNumber ? `Table ${tableNumber}` : "your assigned table"} now.`
    );

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_dinein_called");
  } catch (error) {
    console.error("Error sending WhatsApp dine-in notification:", error);
  }
}

// ─── Takeaway Mode: Order Ready ───

export async function sendWhatsAppTakeawayReadyNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_takeaway_ready");
    if (!ticket) return;

    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `Your Order is Ready!\n\n` +
      `Order: *${ticket.ticketNumber}*\n` +
      `Location: ${branchName}\n\n` +
      `Please collect your order now. Thank you!`
    );

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_takeaway_ready");
  } catch (error) {
    console.error("Error sending WhatsApp takeaway ready notification:", error);
  }
}

// ─── Takeaway Mode: Order Delivered ───

export async function sendWhatsAppTakeawayDeliveredNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const ticket = await getWhatsAppTicket(ticketId, "whatsapp_takeaway_delivered");
    if (!ticket) return;

    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `Order Delivered!\n\n` +
      `Order: *${ticket.ticketNumber}*\n` +
      `Location: ${branchName}\n\n` +
      `Your order has been delivered. Thank you for choosing us!`
    );

    await markWhatsAppSent(ticketId, ticket._sentNotifications, "whatsapp_takeaway_delivered");
  } catch (error) {
    console.error("Error sending WhatsApp takeaway delivered notification:", error);
  }
}

// ─── Status Change Notifications (for WhatsApp users) ───

export async function sendWhatsAppStatusChangeNotification(
  ticketId: string,
  branchName: string,
  newStatus: string
): Promise<void> {
  try {
    const notifKey = `whatsapp_status_${newStatus}`;
    const ticket = await getWhatsAppTicket(ticketId, notifKey);
    if (!ticket) return;

    let message = "";

    switch (newStatus) {
      case "serving":
        message =
          `Now Being Served\n\n` +
          `Ticket: *${ticket.ticketNumber}*\n` +
          `Service: ${ticket.serviceName}\n` +
          `Location: ${branchName}\n\n` +
          `You are now being served.`;
        break;
      case "hold":
        message =
          `On Hold\n\n` +
          `Ticket: *${ticket.ticketNumber}*\n` +
          `Location: ${branchName}\n\n` +
          `Your queue entry has been placed on hold. We'll notify you when you're called again.`;
        break;
      case "completed":
        message =
          `Service Completed\n\n` +
          `Ticket: *${ticket.ticketNumber}*\n` +
          `Location: ${branchName}\n\n` +
          `Your service is complete. Thank you for visiting!`;
        break;
      case "no_show":
        message =
          `Marked as No Show\n\n` +
          `Ticket: *${ticket.ticketNumber}*\n` +
          `Location: ${branchName}\n\n` +
          `You were marked as no show. Please contact ${branchName} if this is an error.`;
        break;
      default:
        return;
    }

    if (message) {
      await sendWhatsAppMessage(ticket.whatsappPhone, message);
      await markWhatsAppSent(ticketId, ticket._sentNotifications, notifKey);
    }
  } catch (error) {
    console.error("Error sending WhatsApp status change notification:", error);
  }
}

export { sendWhatsAppMessage, getVerifyToken };
