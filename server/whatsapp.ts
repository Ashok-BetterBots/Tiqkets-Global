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
    console.error("WhatsApp API credentials not configured");
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

export async function sendWhatsAppTurnNotification(ticketId: string, branchName: string): Promise<void> {
  try {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket || !ticket.whatsappPhone || !ticket.whatsappConfirmed) return;

    const sentNotifications = (ticket.notificationsSent as string[]) || [];
    if (sentNotifications.includes("whatsapp_turn")) return;

    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `IT'S YOUR TURN!\n\n` +
      `Ticket: *${ticket.ticketNumber}*\n` +
      `Service: ${ticket.serviceName}\n` +
      `Location: ${branchName}\n\n` +
      `Please proceed to the counter now.`
    );

    const updatedNotifications = [...sentNotifications, "whatsapp_turn"];
    await db
      .update(tickets)
      .set({ notificationsSent: updatedNotifications, updatedAt: new Date() })
      .where(eq(tickets.id, ticketId));

    console.log(`WhatsApp turn notification sent: ticket ${ticket.ticketNumber}`);
  } catch (error) {
    console.error("Error sending WhatsApp turn notification:", error);
  }
}

export async function sendWhatsAppApproachingNotification(
  ticketId: string,
  branchName: string,
  position: number
): Promise<void> {
  try {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    if (!ticket || !ticket.whatsappPhone || !ticket.whatsappConfirmed) return;

    const sentNotifications = (ticket.notificationsSent as string[]) || [];

    if (position === 1 && !sentNotifications.includes("whatsapp_next")) {
      await sendWhatsAppMessage(
        ticket.whatsappPhone,
        `You're NEXT in line!\n\n` +
        `Ticket: *${ticket.ticketNumber}*\n` +
        `Service: ${ticket.serviceName}\n` +
        `Location: ${branchName}\n\n` +
        `Please be ready!`
      );
      const updated = [...sentNotifications, "whatsapp_next"];
      await db.update(tickets).set({ notificationsSent: updated, updatedAt: new Date() }).where(eq(tickets.id, ticketId));
    } else if (position === 2 && !sentNotifications.includes("whatsapp_almost")) {
      await sendWhatsAppMessage(
        ticket.whatsappPhone,
        `Almost there! You're *2nd* in line.\n\n` +
        `Ticket: *${ticket.ticketNumber}*\n` +
        `Service: ${ticket.serviceName}\n` +
        `Location: ${branchName}\n\n` +
        `Please start heading to the counter.`
      );
      const updated = [...sentNotifications, "whatsapp_almost"];
      await db.update(tickets).set({ notificationsSent: updated, updatedAt: new Date() }).where(eq(tickets.id, ticketId));
    }
  } catch (error) {
    console.error("Error sending WhatsApp approaching notification:", error);
  }
}

export { sendWhatsAppMessage, getVerifyToken };
