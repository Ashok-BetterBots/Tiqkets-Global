import { db } from "./db";
import { tickets, branches } from "@shared/schema";
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

    if (ticket.whatsappConfirmed) {
      const existingBranch = ticket.branchId ? await db.select().from(branches).where(eq(branches.id, ticket.branchId)).limit(1).then((r: any[]) => r[0]) : null;
      const existingMode = existingBranch?.queueMode || "fifo";
      const existingBranchName = existingBranch?.name || "Queue";

      if (existingMode === "dine_in") {
        await sendWhatsAppMessage(
          from,
          `Your booking *${ticket.ticketNumber}* at *${existingBranchName}* is already confirmed!\n\n` +
            `We'll notify you on WhatsApp when your table is ready.\n\n` +
            `\u{26A0}\u{FE0F} Once notified, please proceed to the host desk within 3 minutes.\n` +
            `\u{1F4CD} Kindly stay nearby to avoid delays.`,
        );
      } else if (existingMode === "takeaway") {
        await sendWhatsAppMessage(
          from,
          `Your order *#${ticket.ticketNumber}* at *${existingBranchName}* is already confirmed!\n\n` +
            `We'll notify you on WhatsApp when your order is ready for pickup.`,
        );
      } else {
        await sendWhatsAppMessage(
          from,
          `Your registration *${ticket.ticketNumber}* is already confirmed!\n\n` +
            `Service: ${ticket.serviceName}\n` +
            `Position: #${ticket.position}\n\n` +
            `We'll notify you on WhatsApp when it's your turn.\n\n` +
            `Download the TIQKETS app for real-time tracking, snooze, swap, and more features!`,
        );
      }
      return;
    }

    if (ticket.status !== "waiting") {
      await sendWhatsAppMessage(
        from,
        `This queue entry *${ticket.ticketNumber}* is no longer active (status: ${ticket.status}).\n\nPlease scan the QR code to join a new queue.`,
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
    const guestCount = (ticket.formData as any)?.partySize || (ticket.formData as any)?.guests || "";

    if (queueMode === "dine_in") {
      const guestLine = guestCount ? `\n\u{1F465} Number of people: ${guestCount}` : "";
      await sendWhatsAppMessage(
        from,
        `\u{1F514} Table booking confirmed!\n\n` +
          `\u{1F37D}\u{FE0F} Restaurant: ${branchName}` +
          `\n\u{1F9FE} Booking ID: ${ticket.ticketNumber}` +
          `${guestLine}\n\n` +
          `\u{1F4F2} You will receive WhatsApp updates when your table is ready.\n` +
          `Thank you!\n\n` +
          `\u{26A0}\u{FE0F} Once notified, please proceed to the host desk within 3 minutes.\n` +
          `Due to high demand, we may not be able to hold the table beyond that time, and it may be offered to the next guest in queue.\n` +
          `\u{1F4CD} Kindly stay nearby to avoid delays.`,
      );
    } else if (queueMode === "takeaway") {
      await sendWhatsAppMessage(
        from,
        `\u{2705} Thank you! Your order *#${ticket.ticketNumber}* has been received at *${branchName}*. \u{1F3AB} Token Number: *#${ticket.ticketNumber}* Your order will be processed shortly.`,
      );
    } else {
      await sendWhatsAppMessage(
        from,
        `Your queue registration is confirmed!\n\n` +
          `Ticket: *${ticket.ticketNumber}*\n` +
          `Service: ${ticket.serviceName}\n` +
          `Position: #${ticket.position}\n` +
          `Est. Wait: ~${ticket.estimatedWaitTime} min\n\n` +
          `We'll send you a WhatsApp message when it's your turn.\n\n` +
          `Download the TIQKETS app for real-time tracking, position updates, snooze your turn, swap positions, and much more!`,
      );
    }

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

// ─── FIFO / Multi-Stage: Your Turn (Called) ───

export async function sendWhatsAppTurnNotification(
  ticketId: string,
  branchName: string,
): Promise<void> {
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
        `Please proceed${ticket.deskName ? ` to ${ticket.deskName}` : ""} now.`,
    );

    await markWhatsAppSent(
      ticketId,
      ticket._sentNotifications,
      "whatsapp_turn",
    );
    console.log(
      `WhatsApp turn notification sent: ticket ${ticket.ticketNumber}`,
    );
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
  branchName: string,
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
        `You're now in the queue. We'll notify you when it's your turn.`,
    );

    await markWhatsAppSent(
      ticketId,
      ticket._sentNotifications,
      "whatsapp_checkin",
    );
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

    const guestCount = (ticket.formData as any)?.partySize || (ticket.formData as any)?.guests || "";
    const guestLine = guestCount ? `\n\u{1F465} Number of people: ${guestCount}` : "";

    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `\u{1F514} Table booking confirmed!\n\n` +
        `\u{1F37D}\u{FE0F} Restaurant: ${branchName}` +
        `\n\u{1F9FE} Booking ID: ${ticket.ticketNumber}` +
        `${guestLine}\n\n` +
        `\u{1F4F2} You will receive WhatsApp updates when your table is ready.\n` +
        `Thank you!\n\n` +
        `\u{26A0}\u{FE0F} Once notified, please proceed to the host desk within 3 minutes.\n` +
        `Due to high demand, we may not be able to hold the table beyond that time, and it may be offered to the next guest in queue.\n` +
        `\u{1F4CD} Kindly stay nearby to avoid delays.`,
    );

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

    const guestCount = (ticketRow.formData as any)?.partySize || (ticketRow.formData as any)?.guests || "";
    const tableLine = tableNumber ? `\n\u{1F37D} *Table:* ${tableNumber}` : "";
    const guestLine = guestCount ? `\n\u{1F465} *Guests:* ${guestCount}` : "";

    let message: string;

    if (isReminder) {
      message =
        `\u{1F4E2} *Reminder!*\n\n` +
        `Your table at *${branchName}* is ready!` +
        `${tableLine}${guestLine}\n\n` +
        `\u{1F3AB} *Booking ID:* ${ticketRow.ticketNumber}\n\n` +
        `Please proceed to the host desk within 3 minutes.\nEnjoy your meal!`;
    } else {
      message =
        `\u{2705} *Table Ready!*\n\n` +
        `Your table at *${branchName}* is ready!` +
        `${tableLine}${guestLine}\n\n` +
        `\u{1F3AB} *Booking ID:* ${ticketRow.ticketNumber}\n\n` +
        `Please proceed to the host desk within 3 minutes.\nEnjoy your meal!`;
    }

    await sendWhatsAppMessage(ticketRow.whatsappPhone, message);
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

    const guestCount = (ticket.formData as any)?.partySize || (ticket.formData as any)?.guests || "";
    const guestLine = guestCount ? `\n\u{1F465} People: ${guestCount}` : "";

    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `\u{1F514} *Table Reservation Confirmed!*\n\n` +
        `\u{1F3EA} Restaurant: ${branchName}` +
        `\n\u{1F4CB} Booking ID: ${ticket.ticketNumber}` +
        `${guestLine}\n\n` +
        `You will receive WhatsApp updates when your table is ready.\n\n` +
        `\u{1F4E3} Please proceed to the host desk within 3 minutes once notified.\n` +
        `Thank you for your understanding!`,
    );

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

    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `\u{2705} Thank you! Your order *#${ticket.ticketNumber}* has been received at *${branchName}*. \u{1F3AB} Token Number: *#${ticket.ticketNumber}* Your order will be processed shortly.`,
    );

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

    let message: string;

    if (isReminder) {
      message = `\u{1F4E2} *Reminder!* Your *#${ticketRow.ticketNumber}* is ready for pickup. Please collect it soon from ${branchName}.`;
    } else {
      message = `\u{1F37D}\u{FE0F} *Your Order *${ticketRow.ticketNumber}* is ready at ${branchName}. Please pick it up!*`;
    }

    await sendWhatsAppMessage(ticketRow.whatsappPhone, message);
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
    const ticket = await getWhatsAppTicket(
      ticketId,
      "whatsapp_takeaway_delivered",
    );
    if (!ticket) return;

    await sendWhatsAppMessage(
      ticket.whatsappPhone,
      `\u{2705}Your order *#${ticket.ticketNumber}* has been successfully delivered.Thank you for choosing ${branchName}! \u{1F389}\n\nEnjoy your meal!`,
    );

    await markWhatsAppSent(
      ticketId,
      ticket._sentNotifications,
      "whatsapp_takeaway_delivered",
    );
  } catch (error) {
    console.error(
      "Error sending WhatsApp takeaway delivered notification:",
      error,
    );
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

    let message = "";

    const customerName = ticket.customerName || "Customer";
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
          `\u{23F3} *Booking on Hold*\n\n` +
          `Hello ${customerName},\n` +
          `Your booking (ID: ${ticket.ticketNumber}) is on hold.\n\n` +
          `Please contact the front desk to resume your booking.\n\n` +
          `Thank you!`;
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
      case "waiting":
        message =
          `\u{25B6}\u{FE0F} *Booking Resumed!*\n\n` +
          ` Hello *${customerName}*,\n` +
          ` Your booking has been resumed.\n` +
          ` Please wait for your table to be assigned shortly. \u{1F37D}\u{FE0F}`;
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
