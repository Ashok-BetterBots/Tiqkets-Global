import { db } from "./db";
import { tickets } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { sendWhatsAppApproachingNotification } from "./whatsapp";

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

type NotificationLevel = "approaching" | "position_2" | "position_1" | "your_turn";

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

function buildNotificationMessage(
  pushToken: string,
  level: NotificationLevel,
  ticketNumber: string,
  serviceName: string,
  branchName: string,
  position: number,
  estimatedWaitMinutes: number,
  deskName?: string | null
): ExpoPushMessage {
  const deskInfo = deskName ? ` at ${deskName}` : "";
  switch (level) {
    case "approaching":
      return {
        to: pushToken,
        title: "Get Ready! Your Turn is Approaching",
        body: `You're #${position} in line at ${branchName}. Estimated wait: ~${estimatedWaitMinutes} min`,
        data: { type: "approaching", ticketNumber, position, estimatedWaitMinutes },
        sound: "default",
        badge: position,
        channelId: "queue-alerts",
        priority: "high",
      };
    case "position_2":
      return {
        to: pushToken,
        title: "Almost There!",
        body: `${ticketNumber} - You're 2nd in line at ${branchName} for ${serviceName}. Please head over!`,
        data: { type: "position_2", ticketNumber, position: 2 },
        sound: "default",
        badge: 2,
        channelId: "queue-alerts",
        priority: "high",
      };
    case "position_1":
      return {
        to: pushToken,
        title: "You're Next!",
        body: `${ticketNumber} - You're next in line at ${branchName}. Please be ready!`,
        data: { type: "next", ticketNumber, position: 1 },
        sound: "default",
        badge: 1,
        channelId: "queue-urgent",
        priority: "high",
      };
    case "your_turn":
      return {
        to: pushToken,
        title: "IT'S YOUR TURN!",
        body: `${ticketNumber} - Please proceed to ${serviceName}${deskInfo} at ${branchName} now!`,
        data: { type: "your_turn", ticketNumber, position: 0, deskName: deskName || null },
        sound: "default",
        badge: 0,
        channelId: "queue-urgent",
        priority: "high",
        categoryId: "urgent",
      };
  }
}

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

      if (
        (position <= 3 || estimatedRemainingMinutes <= 15) &&
        position > 2 &&
        !sentNotifications.includes("approaching")
      ) {
        messagesToSend.push(
          buildNotificationMessage(ticket.pushToken, "approaching", ticket.ticketNumber, serviceName, branchName, position, estimatedRemainingMinutes)
        );
        await markNotificationSent(ticket.id, sentNotifications, "approaching");
      }

      if (position === 2 && !sentNotifications.includes("position_2")) {
        messagesToSend.push(
          buildNotificationMessage(ticket.pushToken, "position_2", ticket.ticketNumber, serviceName, branchName, position, estimatedRemainingMinutes)
        );
        await markNotificationSent(ticket.id, sentNotifications, "position_2");
        sendWhatsAppApproachingNotification(ticket.id, branchName, 2).catch(console.error);
      }

      if (position === 1 && !sentNotifications.includes("position_1")) {
        messagesToSend.push(
          buildNotificationMessage(ticket.pushToken, "position_1", ticket.ticketNumber, serviceName, branchName, position, estimatedRemainingMinutes)
        );
        await markNotificationSent(ticket.id, sentNotifications, "position_1");
        sendWhatsAppApproachingNotification(ticket.id, branchName, 1).catch(console.error);
      }
    }

    if (messagesToSend.length > 0) {
      await sendExpoPushNotifications(messagesToSend);
    }
  } catch (error) {
    console.error("Error checking queue notifications:", error);
  }
}

export async function sendCalledNotification(
  ticketId: string,
  branchName: string
): Promise<void> {
  try {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket || !ticket.pushToken || !isValidExpoPushToken(ticket.pushToken)) return;

    const sentNotifications = (ticket.notificationsSent as string[]) || [];
    if (sentNotifications.includes("your_turn")) return;

    const message = buildNotificationMessage(
      ticket.pushToken,
      "your_turn",
      ticket.ticketNumber,
      ticket.serviceName || "Service",
      branchName,
      0,
      0,
      ticket.deskName
    );

    await sendExpoPushNotifications([message]);
    await markNotificationSent(ticket.id, sentNotifications, "your_turn");
  } catch (error) {
    console.error("Error sending called notification:", error);
  }
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
