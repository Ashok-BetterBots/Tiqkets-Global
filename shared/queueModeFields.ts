import { buildDefaultDineInFields, isDineInMode } from "./dineInFields";
import { buildOrderIdField, isTakeawayMode } from "./takeawayFields";

export function normalizeQueueMode(mode?: string | null): string {
  return String(mode || "fifo").toLowerCase().replace(/[_-]/g, "");
}

export function queueModesEqual(a?: string | null, b?: string | null): boolean {
  return normalizeQueueMode(a) === normalizeQueueMode(b);
}

export function buildQueueModePresetFields(mode?: string | null): any[] {
  if (isDineInMode(mode)) return buildDefaultDineInFields();
  if (isTakeawayMode(mode)) return [buildOrderIdField()];
  return [];
}