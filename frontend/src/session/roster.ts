export type Role = "tech" | "lead" | "supervisor" | "vendor";
export interface RosterPerson {
  id: string;
  name: string;
  role: Role;
  team: string | null;
}

// Names, roles and teams copied from config/roster.yaml. Phone numbers are
// left out on purpose. docs/API.md has no roster route (CONTRACT_MIGRATION.md
// item 6), so the frontend keeps this short copy for the demo selector and
// the follow-up owner picker. The backend still enforces roles.
export const ROSTER: RosterPerson[] = [
  { id: "maya", name: "Maya Chen", role: "lead", team: "night" },
  { id: "priya", name: "Priya Nair", role: "tech", team: "night" },
  { id: "luis", name: "Luis Ortega", role: "tech", team: "night" },
  { id: "jordan", name: "Jordan Blake", role: "lead", team: "day" },
  { id: "sam", name: "Sam Okafor", role: "tech", team: "day" },
  { id: "ana", name: "Ana Reyes", role: "tech", team: "day" },
  { id: "rob", name: "Rob Kim", role: "lead", team: "swing" },
  { id: "dana", name: "Dana Ellis", role: "supervisor", team: null },
];

// Demo identity switcher (docs/UI.md: Maya / Jordan / Dana). Sent as X-User.
// This is a demo selector, not authentication.
export const DEMO_USERS = ["maya", "jordan", "dana"].map((id) => ROSTER.find((p) => p.id === id)!);

export function person(id: string | null | undefined) {
  return ROSTER.find((p) => p.id === id) ?? null;
}

// Lead and supervisor actions (docs/API.md: follow-up assignment, clarified in person).
export function canAssign(p: RosterPerson) {
  return p.role === "lead" || p.role === "supervisor";
}
