import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { branches } from "../shared/schema";

/** A flag-only save must not replace stale copies of other display settings. */
export function isAnnouncementOnlyUpdate(body: Record<string, any>): boolean {
  const display = body.displaySettings;
  return Object.keys(body).length === 1 && !!display
    && Object.keys(display).length === 1
    && typeof display.announcementsEnabled === "boolean";
}

export async function updateBranchAnnouncementEnabled(branchId: string, enabled: boolean, executor: Pick<typeof db, "update"> = db) {
  const [branch] = await executor.update(branches).set({
    displaySettings: sql`jsonb_set(coalesce(${branches.displaySettings}, '{}'::jsonb),
      '{announcementsEnabled}', ${JSON.stringify(enabled)}::jsonb, true)`,
  }).where(eq(branches.id, branchId)).returning();
  return branch;
}
