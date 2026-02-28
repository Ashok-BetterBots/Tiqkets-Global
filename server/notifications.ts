import { db } from "./db";
import { tickets } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  sendWhatsAppApproachingNotification,
  sendWhatsAppTurnNotification,
  sendWhatsAppCheckinNotification,
  sendWhatsAppDineInCalledNotification,
  sendWhatsAppTakeawayReadyNotification,
  sendWhatsAppTakeawayDeliveredNotification,
} from "./whatsapp";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  categoryId?: string;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error("Expo push API error:", response.status, await response.text());
    } else {
      const result = await response.json();
      console.log(`Sent ${messages.length} push notification(s)`, result.data?.map((r: any) => r.status));
    }
  } catch (error) {
    console.error("Failed to send push notifications:", error);
  }
}

function isValidExpoPushToken(token: string): boolean {
  return typeof token === "string" && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
}

async function markNotificationSent(
  ticketId: string,
  currentSent: string[],
  notificationType: string
): Promise<void> {
  const updated = [...currentSent, notificationType];
  await db.update(tickets)
    .set({ notificationsSent: updated, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId));
}

async function sendSinglePush(ticket: any, title: string, body: string, data: Record<string, any>, notifKey: string, channel: string = "queue-alerts"): Promise<void> {
  if (!ticket.pushToken || !isValidExpoPushToken(ticket.pushToken)) return;
  const sentNotifications = (ticket.notificationsSent as string[]) || [];
  if (sentNotifications.includes(notifKey)) return;

  await sendExpoPushNotifications([{
    to: ticket.pushToken,
    title,
    body,
    data,
    sound: "default",
    channelId: channel,
    priority: "high",
  }]);
  await markNotificationSent(ticket.id, sentNotifications, notifKey);
}

// ─── FIFO & Multi-Stage Queue Notifications ───

export async function checkAndSendQueueNotifications(
  branchId: string,
  branchName: string,
  serviceId?: string
): Promise<void> {
  try {
    const conditions = [
      eq(tickets.branchId, branchId),
      eq(tickets.status, "waiting"),
    ];
    if (serviceId) {
      conditions.push(eq(tickets.serviceId, serviceId));
    }

    const waitingTickets = await db.select().from(tickets)
      .where(and(...conditions));

    const messagesToSend: ExpoPushMessage[] = [];

    for (const ticket of waitingTickets) {
      if (!ticket.pushToken || !isValidExpoPushToken(ticket.pushToken)) continue;

      const sentNotifications = (ticket.notificationsSent as string[]) || [];
      const position = ticket.position;
      const joinedAt = new Date(ticket.joinedAt);
      const waitMinutes = Math.round((Date.now() - joinedAt.getTime()) / 60000);
      const estimatedRemainingMinutes = Math.max(0, (ticket.estimatedWaitTime || 0) - waitMinutes);
      const serviceName = ticket.serviceName || "Service";

      // a. Get Ready: estimated wait <= 15 min OR position <= 3 (but not position 3 itself — that gets position_3 below)
      const shouldGetReady = (estimatedRemainingMinutes <= 15 || position <= 3) && position > 1 && position !== 3;
      if (shouldGetReady && !sentNotifications.includes("get_ready")) {
        const messageBody = position === 2
          ? `${ticket.ticketNumber} - You're 2nd in line at ${branchName} for ${serviceName}. Please be nearby!`
          : `${ticket.ticketNumber} - Your turn at ${branchName} for ${serviceName} is expected in ~${estimatedRemainingMinutes} min. Please start heading over!`;
        messagesToSend.push({
          to: ticket.pushToken,
          title: "Get Ready!",
          body: messageBody,
          data: { type: "get_ready", ticketNumber: ticket.ticketNumber, estimatedWaitMinutes: estimatedRemainingMinutes, position },
          sound: "default",
          channelId: "queue-alerts",
          priority: "high",
        });
        await markNotificationSent(ticket.id, sentNotifications, "get_ready");
        sendWhatsAppApproachingNotification(ticket.id, branchName, position, "get_ready").catch(console.error);
      }

      // b. Your turn will arrive soon: position === 3 (also marks get_ready as sent to prevent duplicate)
      if (position === 3 && !sentNotifications.includes("position_3")) {
        messagesToSend.push({
          to: ticket.pushToken,
          title: "Almost Your Turn!",
          body: `${ticket.ticketNumber} - You're 3rd in line at ${branchName} for ${serviceName}. Please be nearby!`,
          data: { type: "position_3", ticketNumber: ticket.ticketNumber, position: 3 },
          sound: "default",
          badge: 3,
          channelId: "queue-alerts",
          priority: "high",
        });
        await markNotificationSent(ticket.id, sentNotifications, "position_3");
        if (!sentNotifications.includes("get_ready")) {
          await markNotificationSent(ticket.id, sentNotifications, "get_ready");
        }
        sendWhatsAppApproachingNotification(ticket.id, branchName, 3, "position_3").catch(console.error);
      }

      // c. Your turn next: position === 1
      if (position === 1 && !sentNotifications.includes("position_1")) {
        messagesToSend.push({
          to: ticket.pushToken,
          title: "You're Next!",
          body: `${ticket.ticketNumber} - You're next in line at ${branchName} for ${serviceName}. Please be ready!`,
          data: { type: "next", ticketNumber: ticket.ticketNumber, position: 1 },
          sound: "default",
          badge: 1,
          channelId: "queue-urgent",
          priority: "high",
        });
        await markNotificationSent(ticket.id, sentNotifications, "position_1");
        sendWhatsAppApproachingNotification(ticket.id, branchName, 1, "position_1").catch(console.error);
      }
    }

    if (messagesToSend.length > 0) {
      await sendExpoPushNotifications(messagesToSend);
    }
  } catch (error) {
    console.error("Error checking queue notifications:", error);
  }
}

// d. Your Turn Now (called): FIFO, Multi-Stage, Selective
export async function sendCalledNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) return;

    const deskInfo = ticket.deskName ? ` at ${ticket.deskName}` : "";
    const serviceName = ticket.serviceName || "Service";
    const title = "IT'S YOUR TURN!";
    const body = `${ticket.ticketNumber} - Please proceed to ${serviceName}${deskInfo} at ${branchName} now!`;

    await sendSinglePush(ticket, title, body, {
      type: "your_turn",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      deskName: ticket.deskName || null,
      branchName,
      serviceName,
    }, "your_turn", "queue-urgent");

    sendWhatsAppTurnNotification(ticketId, branchName).catch(console.error);
  } catch (error) {
    console.error("Error sending called notification:", error);
  }
}

// ─── Check-In Mode Notification ───

export async function sendCheckinConfirmationNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) return;

    const serviceName = ticket.serviceName || "Service";
    const title = "Successfully Checked In!";
    const body = `${ticket.ticketNumber} - You've been checked in for ${serviceName} at ${branchName}. We'll notify you when it's your turn.`;

    await sendSinglePush(ticket, title, body, {
      type: "checkin_confirmed",
      ticketNumber: ticket.ticketNumber,
      branchName,
      serviceName,
    }, "checkin_confirmed");

    sendWhatsAppCheckinNotification(ticketId, branchName).catch(console.error);
  } catch (error) {
    console.error("Error sending checkin notification:", error);
  }
}

// ─── Dine-In Mode Notifications ───

export async function sendDineInCalledNotification(
  ticketId: string,
  branchName: string,
  tableNumber?: string | null
): Promise<void> {
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) return;

    const table = tableNumber || ticket.tableNumber;
    const tableInfo = table ? `Table ${table}` : "your table";
    const title = "Your Table is Ready!";
    const body = `${ticket.ticketNumber} - Please proceed to ${tableInfo} at ${branchName}.`;

    await sendSinglePush(ticket, title, body, {
      type: "dinein_called",
      ticketNumber: ticket.ticketNumber,
      tableNumber: table || null,
      branchName,
    }, "dinein_called", "queue-urgent");

    sendWhatsAppDineInCalledNotification(ticketId, branchName, table || null).catch(console.error);
  } catch (error) {
    console.error("Error sending dine-in called notification:", error);
  }
}

// ─── Takeaway Mode Notifications ───

export async function sendTakeawayReadyNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) return;

    const title = "Your Order is Ready!";
    const body = `${ticket.ticketNumber} - Your order at ${branchName} is ready for pickup. Please collect it now!`;

    await sendSinglePush(ticket, title, body, {
      type: "takeaway_ready",
      ticketNumber: ticket.ticketNumber,
      branchName,
    }, "takeaway_ready", "queue-urgent");

    sendWhatsAppTakeawayReadyNotification(ticketId, branchName).catch(console.error);
  } catch (error) {
    console.error("Error sending takeaway ready notification:", error);
  }
}

export async function sendTakeawayDeliveredNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) return;

    const title = "Order Delivered!";
    const body = `${ticket.ticketNumber} - Your order from ${branchName} has been delivered. Thank you!`;

    await sendSinglePush(ticket, title, body, {
      type: "takeaway_delivered",
      ticketNumber: ticket.ticketNumber,
      branchName,
    }, "takeaway_delivered");

    sendWhatsAppTakeawayDeliveredNotification(ticketId, branchName).catch(console.error);
  } catch (error) {
    console.error("Error sending takeaway delivered notification:", error);
  }
}

// ─── Queue Joined Confirmation ───

export async function sendQueueJoinedNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) return;

    const serviceName = ticket.serviceName || "Service";
    const title = "You've Joined the Queue!";
    const body = `${ticket.ticketNumber} - You're #${ticket.position} in line for ${serviceName} at ${branchName}. Est. wait: ~${ticket.estimatedWaitTime} min.`;

    await sendSinglePush(ticket, title, body, {
      type: "queue_joined",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      branchName,
      serviceName,
      position: ticket.position,
    }, "queue_joined");
  } catch (error) {
    console.error("Error sending queue joined notification:", error);
  }
}

// ─── Status Change Notification (serving, hold, etc.) ───

export async function sendStatusChangeNotification(
  ticketId: string,
  branchName: string,
  newStatus: string
): Promise<void> {
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) return;

    const serviceName = ticket.serviceName || "Service";
    let title = "";
    let body = "";
    const notifKey = `status_${newStatus}`;

    switch (newStatus) {
      case "serving":
        title = "Now Being Served";
        body = `${ticket.ticketNumber} - You are now being served for ${serviceName} at ${branchName}.`;
        break;
      case "hold":
        title = "On Hold";
        body = `${ticket.ticketNumber} - Your queue entry at ${branchName} has been placed on hold.`;
        break;
      case "completed":
        title = "Service Completed";
        body = `${ticket.ticketNumber} - Your service at ${branchName} is complete. Thank you!`;
        break;
      case "no_show":
        title = "Marked as No Show";
        body = `${ticket.ticketNumber} - You were marked as no show at ${branchName}. Please contact them if this is an error.`;
        break;
      default:
        return;
    }

    await sendSinglePush(ticket, title, body, {
      type: "status_change",
      ticketId: ticket.id,
      ticketNumber: ticket.ticketNumber,
      newStatus,
      branchName,
      serviceName,
    }, notifKey);
  } catch (error) {
    console.error("Error sending status change notification:", error);
  }
}

// ─── Selective Mode: uses sendCalledNotification (same as FIFO "your turn") ───
