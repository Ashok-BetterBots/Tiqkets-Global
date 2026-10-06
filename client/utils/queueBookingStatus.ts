export interface LiveBranchMeta {
  settings: { queueMode: string };
  services: Array<{
    id: string;
    serviceSettings?: { queueMode?: string | null } | null;
    queueStatus?: string;
    desks?: Array<{ id: string; queueStatus?: string }>;
  }>;
  journeys: any[];
  queueStatus?: string;
}

/** Resolve only the selected scope; undefined lets older servers use the snapshot. */
export function liveBookingStatus(meta: LiveBranchMeta | undefined, serviceId?: string | null, deskId?: string): string | undefined {
  const service = meta?.services.find(s => s.id === serviceId);
  if (deskId && deskId !== "all") return service?.desks?.find(d => d.id === deskId)?.queueStatus;
  if (serviceId) return service?.queueStatus;
  return meta?.queueStatus;
}

/** Keep the live view in sync with a confirmed local mutation, without touching scope/settings. */
export function patchLiveBookingStatus(
  previous: Record<string, LiveBranchMeta>,
  target: { type: "branch" | "service" | "desk"; id: string },
  status: string,
): Record<string, LiveBranchMeta> {
  const next = { ...previous };
  for (const [branchId, meta] of Object.entries(previous)) {
    if (target.type === "branch") {
      if (branchId === target.id) next[branchId] = { ...meta, queueStatus: status };
      continue;
    }
    const affected = meta.services.find(s => target.type === "service"
      ? s.id === target.id : s.desks?.some(d => d.id === target.id));
    if (!affected) continue;
    next[branchId] = {
      ...meta,
      queueStatus: status === "active" && meta.queueStatus === "ended" ? "active" : meta.queueStatus,
      services: meta.services.map(s => s.id !== affected.id ? s : {
        ...s,
        queueStatus: target.type === "service" || (status === "active" && s.queueStatus === "ended") ? status : s.queueStatus,
        ...(target.type === "desk" ? {
          desks: s.desks?.map(d => d.id === target.id ? { ...d, queueStatus: status } : d),
        } : {}),
      }),
    };
  }
  return next;
}
