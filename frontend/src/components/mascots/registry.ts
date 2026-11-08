// The six glass mascots from the "AI Agent Mascot Models" Figma Make file
// (ported via ethnmz/Harbor). In ShiftSync each one stands for one AI step,
// so a mascot always means "the AI wrote or checked this", never "a person
// confirmed it". They mark AI output; they don't approve anything.
export type MascotKind = "orbit" | "facet" | "murmur" | "nimbus" | "lumen" | "sentry";

// `ai: false` marks a deterministic code check (no model involved).
export const MASCOTS: Record<MascotKind, { color: string; role: string; ai?: false }> = {
  murmur: { color: "#f97316", role: "Notes" }, // pulls items out of the handoff note
  orbit: { color: "#8b5cf6", role: "Questions" }, // asks the clarifying questions
  facet: { color: "#14b8a6", role: "Source check", ai: false }, // code: matches quotes word for word
  nimbus: { color: "#0ea5e9", role: "Briefing" }, // writes the incoming briefing
  lumen: { color: "#eab308", role: "Understanding check" }, // grades check answers
  sentry: { color: "#f43f5e", role: "Supervisor" }, // reserved for the P1 Supervisor view
};

export const mascotLabel = (k: MascotKind) => `${MASCOTS[k].ai === false ? "ShiftSync" : "ShiftSync AI"} · ${MASCOTS[k].role}`;
