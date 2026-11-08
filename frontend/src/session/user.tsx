import { createContext, useContext, useState, type ReactNode } from "react";
import { setApiUser } from "../api/client";

// Demo user switcher (docs/UI.md). Ids match config/roster.yaml. This is a demo
// selector, not authentication. No roster endpoint exists in docs/API.md.
export const DEMO_USERS = [
  { id: "maya", name: "Maya" },
  { id: "jordan", name: "Jordan" },
  { id: "dana", name: "Dana" },
];

const UserContext = createContext<{ user: string; setUser: (id: string) => void } | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState("maya");
  function setUser(id: string) {
    setApiUser(id);
    setUserState(id);
  }
  return <UserContext.Provider value={{ user, setUser }}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser outside UserProvider");
  return ctx;
}
