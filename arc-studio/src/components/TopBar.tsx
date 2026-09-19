import { ConnectKitButton } from 'connectkit';
import { Bot, LayoutGrid, Wand2 } from 'lucide-react';
import type { Agent } from './AgentData';

type Page = 'marketplace' | 'studio';

type Props = {
  page: Page;
  activeAgent: Agent | null;
  onNav: (p: Page) => void;
};

export function TopBar({ page, activeAgent, onNav }: Props) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 px-4 py-3 md:px-6"
      style={{
        background: 'rgba(13,27,47,0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(172,198,233,0.15)', border: '1px solid rgba(172,198,233,0.25)' }}>
          <Bot size={14} style={{ color: 'var(--accent)' }} />
        </div>
        <span className="display font-bold text-sm hidden sm:block" style={{ color: 'var(--ink)' }}>
          BookAnAI
        </span>
      </div>

      {/* Nav tabs */}
      <nav className="flex items-center gap-1">
        <button
          onClick={() => onNav('marketplace')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={
            page === 'marketplace'
              ? { background: 'rgba(172,198,233,0.12)', color: 'var(--accent)', border: '1px solid rgba(172,198,233,0.2)' }
              : { background: 'transparent', color: 'var(--subtle)', border: '1px solid transparent' }
          }
        >
          <LayoutGrid size={13} />
          Marketplace
        </button>
        <button
          onClick={() => onNav('studio')}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={
            page === 'studio'
              ? { background: 'rgba(172,198,233,0.12)', color: 'var(--accent)', border: '1px solid rgba(172,198,233,0.2)' }
              : { background: 'transparent', color: 'var(--subtle)', border: '1px solid transparent' }
          }
        >
          <Wand2 size={13} />
          Studio
          {activeAgent && (
            <span className="ml-0.5 mono text-[8px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(163,230,53,0.15)', color: '#a3e635' }}>
              {activeAgent.icon}
            </span>
          )}
        </button>
      </nav>

      {/* Wallet */}
      <div className="shrink-0">
        <ConnectKitButton />
      </div>
    </header>
  );
}
