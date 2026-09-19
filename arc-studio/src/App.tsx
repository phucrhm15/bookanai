import { useState } from 'react';
import { toast } from 'sonner';
import { Landing } from './components/Landing';
import { TopBar } from './components/TopBar';
import { Marketplace } from './components/Marketplace';
import { Studio } from './components/Studio';
import { AGENTS, type Agent } from './components/AgentData';

type Page = 'landing' | 'marketplace' | 'studio';

export default function App() {
  const [page, setPage] = useState<Page>('landing');
  const [activeAgent, setActiveAgent] = useState<Agent | null>(AGENTS[3]); // Arc Market Pulse as default

  const handleSelectAgent = (agent: Agent) => {
    setActiveAgent(agent);
    toast.success(`${agent.name} selected`, {
      description: `${agent.price} USDC per request · ${agent.network === 'arc-testnet' ? 'Arc Testnet' : 'Base'}`,
    });
  };

  const handleOpenStudio = () => setPage('studio');

  const navPage = (p: 'marketplace' | 'studio') => {
    if (p === 'studio' && !activeAgent) {
      toast.error('Select an agent first');
      setPage('marketplace');
      return;
    }
    setPage(p);
  };

  if (page === 'landing') {
    return (
      <div style={{ background: 'var(--bg-gradient)' }}>
        <Landing onEnter={() => setPage('marketplace')} />
      </div>
    );
  }

  const studioAgent = activeAgent ?? AGENTS[3];

  return (
    <div className="min-h-dvh relative" style={{ background: 'var(--bg-gradient)' }}>
      {/* Ambient blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div style={{
          position: 'absolute', top: '8%', left: '3%', width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
          filter: 'blur(100px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '5%', width: 350, height: 350,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(163,230,53,0.06) 0%, transparent 70%)',
          filter: 'blur(90px)',
        }} />
      </div>

      <div className="relative z-10">
        <TopBar
          page={page === 'studio' ? 'studio' : 'marketplace'}
          activeAgent={activeAgent}
          onNav={navPage}
        />

        {page === 'marketplace' && (
          <Marketplace
            activeAgent={activeAgent}
            onSelect={handleSelectAgent}
            onOpenStudio={handleOpenStudio}
          />
        )}

        {page === 'studio' && (
          <Studio
            agent={studioAgent}
            onBack={() => setPage('marketplace')}
          />
        )}
      </div>
    </div>
  );
}
