// Short human labels for slot names from config/slots.yaml.
const SLOT_LABELS: Record<string, string> = {
  work_status: "status",
  remaining_work: "remaining work",
  rationale: "reason",
  operational_clearance: "clearance",
  required_verification: "must be verified",
  next_action: "next action",
  vendor_return: "vendor return",
  equipment_scope: "equipment",
  confirmation_source: "confirmed by",
  restore_condition: "restore condition",
  current_mode: "current mode",
  lockout_status: "lockout",
  tag_holder: "tag holder",
};

export function slotLabel(slot: string) {
  return SLOT_LABELS[slot] ?? slot.replace(/_/g, " ");
}

export function formatClock(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
