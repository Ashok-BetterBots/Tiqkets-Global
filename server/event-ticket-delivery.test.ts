import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import {
  branches,
  eventRegistrations,
  eventStageLog,
  events,
  organizations,
  waQueue,
  type Event,
  type EventRegistration,
  type WaQueueJob,
} from "@shared/schema";
import { getPublicBaseUrl } from "./mailer";
import { ObjectStorageService } from "./objectStorage";
import { eventTicketImageRoute } from "./events-routes";
import { processEventTicketJob } from "./wa-queue-worker";

const uniqueSuffix = crypto.randomBytes(4).toString("hex");
const baseUrl = getPublicBaseUrl();

let organizationId: string;
let branchId: string;
let eventRow: Event;

before(async () => {
  const [organization] = await db
    .insert(organizations)
    .values({
      name: `Ticket Delivery Test Org ${uniqueSuffix}`,
      email: `ticket-delivery-${uniqueSuffix}@example.com`,
      passwordHash: "test-only",
    })
    .returning({ id: organizations.id });
  organizationId = organization.id;

  const [branch] = await db
    .insert(branches)
    .values({
      organizationId,
      name: `Ticket Delivery Test Branch ${uniqueSuffix}`,
    })
    .returning({ id: branches.id });
  branchId = branch.id;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  [eventRow] = await db
    .insert(events)
    .values({
      organizationId,
      branchId,
      name: `Ticket Delivery Test Event ${uniqueSuffix}`,
      startDate: today,
      endDate: today,
      operatingHoursStart: "09:00",
      operatingHoursEnd: "21:00",
      slotDurationMinutes: 30,
      maxCapacityPerSlot: 100,
      registrationFee: 0,
      status: "published",
    })
    .returning();
});

after(async () => {
  await db
    .delete(events)
    .where(eq(events.id, eventRow.id))
    .catch(() => {});
  await db
    .delete(branches)
    .where(eq(branches.id, branchId))
    .catch(() => {});
  await db
    .delete(organizations)
    .where(eq(organizations.id, organizationId))
    .catch(() => {});
  await pool.end().catch(() => {});
});

async function makeRegistration(
  qrToken: string,
  ticketImageUrl: string,
): Promise<EventRegistration> {
  const [registration] = await db
    .insert(eventRegistrations)
    .values({
      eventId: eventRow.id,
      customerName: "Delivery Test Customer",
      customerPhone: "919999000001",
      slotDate: new Date().toISOString().slice(0, 10),
      slotTime: "10:00",
      status: "ticket_generated",
      bookingId: `EVT-${qrToken.slice(-8).toUpperCase()}`,
      qrToken,
      ticketImageUrl,
    })
    .returning();
  return registration;
}

async function makeJob(registrationId: string): Promise<WaQueueJob> {
  const [job] = await db
    .insert(waQueue)
    .values({
      jobType: "event_ticket",
      refId: registrationId,
      phone: "919999000001",
      orgId: organizationId,
      dedupeKey: `event-ticket-delivery-test:${registrationId}`,
    })
    .returning();
  return job;
}

async function cleanupRegistration(
  registrationId: string,
  jobId: string,
): Promise<void> {
  await db
    .delete(waQueue)
    .where(eq(waQueue.id, jobId))
    .catch(() => {});
  await db
    .delete(eventStageLog)
    .where(eq(eventStageLog.registrationId, registrationId))
    .catch(() => {});
  await db
    .delete(eventRegistrations)
    .where(eq(eventRegistrations.id, registrationId))
    .catch(() => {});
}

describe("event ticket WhatsApp delivery", () => {
  test("stores the Object Storage URL before sending the WhatsApp trigger", async () => {
    const qrToken = crypto.randomBytes(20).toString("hex");
    const localUrl = `${baseUrl}/event-ticket-image/${qrToken}.png`;
    const objectPath = `/public-objects/event-tickets/${qrToken}.png`;
    const registration = await makeRegistration(qrToken, localUrl);
    const job = await makeJob(registration.id);
    const uploaded: Array<{
      fileName: string;
      contentType: string;
      subDir: string;
    }> = [];
    const sentUrls: string[] = [];
    const originalUpload = ObjectStorageService.prototype.uploadPublicObject;

    ObjectStorageService.prototype.uploadPublicObject = async function (
      _buffer,
      fileName,
      contentType,
      subDir,
    ) {
      uploaded.push({ fileName, contentType, subDir });
      return objectPath;
    };

    try {
      await processEventTicketJob(job, {
        renderTicketImage: async (token) => {
          assert.equal(token, qrToken);
          return Buffer.from("test-png");
        },
        sendEventTrigger: async (_event, _reg, trigger, imageUrl) => {
          assert.equal(trigger, "ticket");
          sentUrls.push(imageUrl || "");
          return true;
        },
      });

      const [updated] = await db
        .select({ ticketImageUrl: eventRegistrations.ticketImageUrl })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.id, registration.id));

      assert.equal(uploaded.length, 1);
      assert.deepEqual(uploaded[0], {
        fileName: `${qrToken}.png`,
        contentType: "image/png",
        subDir: "event-tickets",
      });
      assert.equal(updated?.ticketImageUrl, `${baseUrl}${objectPath}`);
      assert.match(updated?.ticketImageUrl || "", /\/public-objects\//);
      assert.deepEqual(sentUrls, [`${baseUrl}${objectPath}`]);
      assert.notEqual(sentUrls[0], localUrl);
    } finally {
      ObjectStorageService.prototype.uploadPublicObject = originalUpload;
      await cleanupRegistration(registration.id, job.id);
    }
  });

  test("continues with the dynamic ticket URL when Object Storage upload fails", async () => {
    const qrToken = crypto.randomBytes(20).toString("hex");
    const localUrl = `${baseUrl}/event-ticket-image/${qrToken}.png`;
    const registration = await makeRegistration(qrToken, localUrl);
    const job = await makeJob(registration.id);
    const sentUrls: string[] = [];
    const originalUpload = ObjectStorageService.prototype.uploadPublicObject;

    ObjectStorageService.prototype.uploadPublicObject = async function () {
      throw new Error("simulated Object Storage outage");
    };

    try {
      await processEventTicketJob(job, {
        renderTicketImage: async () => Buffer.from("test-png"),
        sendEventTrigger: async (_event, _reg, trigger, imageUrl) => {
          assert.equal(trigger, "ticket");
          sentUrls.push(imageUrl || "");
          return true;
        },
      });

      const [updated] = await db
        .select({ ticketImageUrl: eventRegistrations.ticketImageUrl })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.id, registration.id));

      assert.deepEqual(sentUrls, [localUrl]);
      assert.equal(updated?.ticketImageUrl, localUrl);
    } finally {
      ObjectStorageService.prototype.uploadPublicObject = originalUpload;
      await cleanupRegistration(registration.id, job.id);
    }
  });

  test("redirects to the stored Object Storage URL instead of re-rendering", async () => {
    const qrToken = crypto.randomBytes(20).toString("hex");
    const objectUrl = `${baseUrl}/public-objects/event-tickets/${qrToken}.png`;
    const registration = await makeRegistration(qrToken, objectUrl);
    const responseState: {
      statusCode: number;
      redirectStatus?: number;
      redirectUrl?: string;
      headers: Record<string, string | number>;
    } = { statusCode: 200, headers: {} };
    const response = {
      setHeader(name: string, value: string | number) {
        responseState.headers[name] = value;
        return this;
      },
      status(code: number) {
        responseState.statusCode = code;
        return this;
      },
      send() {
        return this;
      },
      redirect(code: number, url: string) {
        responseState.redirectStatus = code;
        responseState.redirectUrl = url;
        return this;
      },
    } as unknown as Response;

    try {
      await eventTicketImageRoute(
        { params: { token: qrToken } } as unknown as Request,
        response,
      );
    } finally {
      await db
        .delete(eventRegistrations)
        .where(eq(eventRegistrations.id, registration.id))
        .catch(() => {});
    }

    assert.equal(responseState.statusCode, 200);
    assert.equal(responseState.redirectStatus, 302);
    assert.equal(responseState.redirectUrl, objectUrl);
    assert.equal(
      responseState.headers["Cache-Control"],
      "public, max-age=86400",
    );
  });
});
