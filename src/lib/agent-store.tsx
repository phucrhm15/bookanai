import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AGENTS, type Agent } from "./mock-data";

type Ctx = {
  activeAgent: Agent;
  setActiveAgent: (a: Agent) => void;
};

const AgentContext = createContext<Ctx | null>(null);

const REMOVED_AGENT_IDS = new Set(["messari-analyst", "surf-tokenomics"]);

function resolveActiveAgent(candidate: Agent | undefined): Agent {
  if (!candidate || REMOVED_AGENT_IDS.has(candidate.id)) {
    return AGENTS[0]!;
  }
  return AGENTS.find((a) => a.id === candidate.id) ?? AGENTS[0]!;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [activeAgent, setActiveAgentState] = useState<Agent>(() => resolveActiveAgent(AGENTS[0]));

  useEffect(() => {
    setActiveAgentState((prev) => resolveActiveAgent(prev));
  }, []);

  const setActiveAgent = (agent: Agent) => {
    setActiveAgentState(resolveActiveAgent(agent));
  };

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
