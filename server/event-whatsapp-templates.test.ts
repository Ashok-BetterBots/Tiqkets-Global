import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "./db";
import {
  branches,
  eventRegistrations,
  events,
  organizations,
  type Event,
  type EventRegistration,
} from "@shared/schema";
import { getApprovedWaTemplate } from "@shared/wa-approved-templates";
import {
  normalizeEventParkingEnabled,
  normalizeEventWhatsappTriggers,
  sendEventTrigger,
} from "./events-routes";
import {
  getDueEventReminderTrigger,
  isEventReminderTriggerEnabled,
  sendEventReminderOnce,
} from "./event-reminders";

const uniqueSuffix = crypto.randomBytes(4).toString("hex");

let organizationId: string;
let branchId: string;
let eventRow: Event;

before(async () => {
  const [organization] = await db
    .insert(organizations)
    .values({
      name: `Event WhatsApp Test Org ${uniqueSuffix}`,
      email: `event-wa-${uniqueSuffix}@example.com`,
      passwordHash: "test-only",
    })
    .returning({ id: organizations.id });
  organizationId = organization.id;

  const [branch] = await db
    .insert(branches)
    .values({
      organizationId,
      name: `Event WhatsApp Test Branch ${uniqueSuffix}`,
      timezone: "Asia/Kolkata",
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
      name: `Event WhatsApp Test Event ${uniqueSuffix}`,
      venue: "Test Hall",
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
  await db.delete(events).where(eq(events.id, eventRow.id)).catch(() => {});
  await db.delete(branches).where(eq(branches.id, branchId)).catch(() => {});
  await db.delete(organizations).where(eq(organizations.id, organizationId)).catch(() => {});
  await pool.end().catch(() => {});
});

function registration(language: "en" | "ta"): EventRegistration {
  return {
    id: crypto.randomUUID(),
    eventId: eventRow.id,
    locationId: null,
    formData: {},
    bookingId: `EVT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
    qrToken: crypto.randomBytes(20).toString("hex"),
    customerName: language === "ta" ? "தமிழ் வாடிக்கையாளர்" : "English Customer",
    customerPhone: "919999000001",
    customerEmail: null,
    preferredLanguage: language,
    familyMembersCount: 0,
    priorityAccess: false,
    slotDate: "2026-09-01",
    slotTime: "10:00",
    status: "ticket_generated",
    paymentId: null,
    amountPaid: 0,
    ticketImageUrl: "https://example.com/ticket.png",
    arrivedAt: null,
    checkedInAt: null,
    exitedAt: null,
    visitDurationMinutes: null,
    invalidScanAttempts: 0,
    duplicateEntryAttempts: 0,
    reminderDaySentAt: null,
    reminderHourSentAt: null,
    slotActiveSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Event WhatsApp approved templates", () => {
  test("defaults event controls to enabled and validates organizer input", () => {
    assert.deepEqual(normalizeEventWhatsappTriggers(undefined), {
      reminder_day: true,
      reminder_hour: true,
      checked_in: true,
      billing: true,
      thank_you_feedback: true,
    });
    assert.equal(normalizeEventParkingEnabled(undefined), true);
    assert.equal(normalizeEventParkingEnabled(false), false);
    assert.equal(normalizeEventWhatsappTriggers({ reminder_day: false }).reminder_day, false);
    assert.throws(() => normalizeEventWhatsappTriggers({ ticket: false }), /Unknown WhatsApp trigger/);
    assert.throws(() => normalizeEventWhatsappTriggers({ billing: "no" }), /must be a boolean/);
    assert.throws(() => normalizeEventParkingEnabled("false"), /must be a boolean/);
  });

  test("blocks each disabled event trigger before attempting WhatsApp delivery", async () => {
    const triggers = [
      "reminder_day",
      "reminder_hour",
      "checked_in",
      "billing",
      "thank_you_feedback",
    ] as const;
    const originalFetch = global.fetch;
    let fetchCalls = 0;
    global.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("WhatsApp delivery should not be attempted");
    }) as typeof fetch;
    try {
      for (const trigger of triggers) {
        const enabled = normalizeEventWhatsappTriggers(undefined);
        enabled[trigger] = false;
        assert.equal(
          await sendEventTrigger(
            { ...eventRow, whatsappTriggers: enabled },
            registration("en"),
            trigger,
          ),
          false,
        );
      }
      assert.equal(fetchCalls, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("uses the exact approved names for check-in and reminder languages", () => {
    const expected = {
      "reminder_day|en": "tiqkets_global_event_reminder_24hr_english",
      "reminder_day|ta": "tiqkets_global_event_reminder_24hr_tamil",
      "reminder_hour|en": "tiqkets_global_event_reminder_30min_english",
      "reminder_hour|ta": "tiqkets_global_events_reminder_30min_tamil",
      "checked_in|en": "tiqkets_global_event_checkin_success_english",
      "checked_in|ta": "tiqkets_global_events_checkin_success_tamil",
    } as const;

    for (const [key, templateName] of Object.entries(expected)) {
      const [trigger, language] = key.split("|");
      assert.equal(
        getApprovedWaTemplate("events", trigger, language)?.templateName,
        templateName,
      );
    }
  });

  test("sends exact language templates with named parameters and the 30-minute image", async () => {
    const originalFetch = global.fetch;
    const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const payloads: Array<Record<string, any>> = [];

    process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-number-id";
    process.env.WHATSAPP_ACCESS_TOKEN = "test-access-token";
    global.fetch = async (_input, init) => {
      payloads.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const cases = [
        { trigger: "checked_in", language: "ta", image: undefined },
        { trigger: "reminder_day", language: "en", image: undefined },
        { trigger: "reminder_day", language: "ta", image: undefined },
        { trigger: "reminder_hour", language: "en", image: "https://example.com/ticket.png" },
        { trigger: "reminder_hour", language: "ta", image: "https://example.com/ticket.png" },
      ] as const;

      for (const item of cases) {
        assert.equal(
          await sendEventTrigger(
            { ...eventRow, organizationId: "" },
            registration(item.language),
            item.trigger,
            item.image,
          ),
          true,
        );
      }

      assert.deepEqual(
        payloads.map((payload) => payload.template.name),
        [
          "tiqkets_global_events_checkin_success_tamil",
          "tiqkets_global_event_reminder_24hr_english",
          "tiqkets_global_event_reminder_24hr_tamil",
          "tiqkets_global_event_reminder_30min_english",
          "tiqkets_global_events_reminder_30min_tamil",
        ],
      );
      assert.deepEqual(
        payloads.map((payload) => payload.template.language.code),
        ["ta", "en", "ta", "en", "ta"],
      );

      for (const payload of payloads) {
        const body = payload.template.components.find((component: any) => component.type === "body");
        assert.ok(body.parameters.length > 0);
        assert.ok(body.parameters.every((parameter: any) => parameter.parameter_name));
        assert.ok(body.parameters.every((parameter: any) => parameter.text));
      }
      assert.equal(payloads[0].template.components.some((component: any) => component.type === "header"), false);
      assert.equal(payloads[1].template.components.some((component: any) => component.type === "header"), false);
      assert.equal(payloads[2].template.components.some((component: any) => component.type === "header"), false);
      assert.equal(payloads[3].template.components.some((component: any) => component.type === "header"), true);
      assert.equal(payloads[4].template.components.some((component: any) => component.type === "header"), true);
    } finally {
      global.fetch = originalFetch;
      if (originalPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
      if (originalAccessToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
      else process.env.WHATSAPP_ACCESS_TOKEN = originalAccessToken;
    }
  });
});

describe("Event reminder scheduling", () => {
  test("skips disabled reminders without affecting the separate slot-active trigger", () => {
    const controls = normalizeEventWhatsappTriggers({
      reminder_day: false,
      reminder_hour: false,
    });
    assert.equal(isEventReminderTriggerEnabled(controls, "reminder_day"), false);
    assert.equal(isEventReminderTriggerEnabled(controls, "reminder_hour"), false);
    assert.equal(isEventReminderTriggerEnabled(controls, "slot_active"), true);
  });

  test("selects the 24-hour and 30-minute windows once", () => {
    const slotStart = Date.UTC(2026, 8, 1, 10, 0, 0);

    assert.equal(
      getDueEventReminderTrigger(slotStart - 24 * 60 * 60 * 1000, slotStart),
      "reminder_day",
    );
    assert.equal(
      getDueEventReminderTrigger(slotStart - 30 * 60 * 1000, slotStart),
      "reminder_hour",
    );
    assert.equal(
      getDueEventReminderTrigger(slotStart - 24 * 60 * 60 * 1000, slotStart, {
        reminderDaySentAt: new Date(),
      }),
      null,
    );
    assert.equal(
      getDueEventReminderTrigger(slotStart - 30 * 60 * 1000, slotStart, {
        reminderHourSentAt: new Date(),
      }),
      null,
    );
    assert.equal(
      getDueEventReminderTrigger(slotStart - 24 * 60 * 60 * 1000 - 1, slotStart),
      null,
    );
    assert.equal(
      getDueEventReminderTrigger(slotStart - 35 * 60 * 1000 - 1, slotStart),
      null,
    );
  });

  test("releases a failed reminder claim so the next scheduler tick retries", async () => {
    const reg = registration("ta");
    const [saved] = await db.insert(eventRegistrations).values(reg).returning();
    const attemptedTriggers: string[] = [];

    try {
      await sendEventReminderOnce(
        eventRow,
        saved,
        "reminder_day",
        { reminderDaySentAt: new Date() },
        async (_event, _registration, trigger) => {
          attemptedTriggers.push(trigger);
          return false;
        },
      );

      let [afterFailure] = await db
        .select()
        .from(eventRegistrations)
        .where(eq(eventRegistrations.id, saved.id));
      assert.equal(afterFailure.reminderDaySentAt, null);

      await sendEventReminderOnce(
        eventRow,
        afterFailure,
        "reminder_day",
        { reminderDaySentAt: new Date() },
        async (_event, _registration, trigger) => {
          attemptedTriggers.push(trigger);
          return true;
        },
      );

      [afterFailure] = await db
        .select()
        .from(eventRegistrations)
        .where(eq(eventRegistrations.id, saved.id));
      assert.ok(afterFailure.reminderDaySentAt);
      assert.deepEqual(attemptedTriggers, ["reminder_day", "reminder_day"]);
    } finally {
      await db
        .delete(eventRegistrations)
        .where(eq(eventRegistrations.id, saved.id))
        .catch(() => {});
    }
  });
});