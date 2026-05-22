import { createContext, useContext, useState, type ReactNode } from "react";
import { AGENTS, type Agent } from "./mock-data";

type Ctx = {
  activeAgent: Agent;
  setActiveAgent: (a: Agent) => void;
};

const AgentContext = createContext<Ctx | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [activeAgent, setActiveAgent] = useState<Agent>(AGENTS[0]);
  return (
    <AgentContext.Provider value={{ activeAgent, setActiveAgent }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useActiveAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useActiveAgent must be inside AgentProvider");
  return ctx;
}
