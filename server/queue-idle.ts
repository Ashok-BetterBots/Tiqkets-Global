import { and, eq, inArray, sql } from "drizzle-orm";
import { branchAlertState, branches, services } from "@shared/schema";
import { db } from "./db";

export type QueueTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DineInScope = { id: string; branchId: string };

// Match the effective mode: an explicit service override wins over its branch.
export const dineInModeCondition = sql`regexp_replace(lower(coalesce(
  nullif(${services.serviceSettings}->>'queueMode', ''), ${branches.queueMode}, 'fifo'
)), '[[:space:]_-]', '', 'g') = 'dinein'`;

/**
 * Waiting-ticket writes and the idle closer take the same service row lock.
 * This prevents closing between a waiting transition and its persisted anchor.
 * Only Dine In services are locked/tracked; other modes retain their behaviour.
 */
export async function withDineInQueueLocks<T>(
  serviceIds: Array<string | null | undefined>,
  write: (tx: QueueTransaction, scopes: Map<string, DineInScope>) => Promise<T>,
): Promise<T> {
  const ids = [...new Set(serviceIds.filter((id): id is string => !!id))].sort();
  return db.transaction(async (tx) => {
    const scopes = ids.length ? await tx
      .select({ id: services.id, branchId: services.branchId })
      .from(services)
      .innerJoin(branches, eq(branches.id, services.branchId))
      .where(and(inArray(services.id, ids), dineInModeCondition))
      .orderBy(services.id)
      .for("update", { of: services }) : [];
    return write(tx, new Map(scopes.map(scope => [scope.id, scope])));
  });
}

// An anchor is waiting activity, not notification delivery, notes, table edits,
// or subsequent work on customers who have already left the waiting stage.
export async function recordWaitingActivity(
  tx: QueueTransaction, scope: DineInScope | undefined, at: Date,
): Promise<void> {
  if (!scope) return;
  await tx.insert(branchAlertState).values({
    branchId: scope.branchId, scopeId: scope.id, triggerKind: "queue_idle",
    lastTriggeredAt: at, updatedAt: at,
  }).onConflictDoUpdate({
    target: [branchAlertState.branchId, branchAlertState.triggerKind, branchAlertState.scopeId],
    set: {
      lastTriggeredAt: sql`greatest(${branchAlertState.lastTriggeredAt}, ${at})`,
      updatedAt: at,
    },
  });
}
