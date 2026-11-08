import { createContext, useContext, useState, type ReactNode } from "react";
import { setApiUser } from "../api/client";

import { person, type RosterPerson } from "./roster";
export * from "./roster";

const UserContext = createContext<{ user: RosterPerson; setUser: (id: string) => void } | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState("maya");
  function setUser(id: string) {
    setApiUser(id);
    setUserId(id);
  }
  return <UserContext.Provider value={{ user: person(userId)!, setUser }}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser outside UserProvider");
  return ctx;
}

