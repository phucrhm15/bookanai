import { useState, useMemo } from 'react';
import { Search, Sparkles, Check, Zap, ChevronRight, Shield } from 'lucide-react';
import { AGENTS, type Agent } from './AgentData';

type Props = {
  activeAgent: Agent | null;
  onSelect: (agent: Agent) => void;
  onOpenStudio: () => void;
};

const accentColors: Record<Agent['accent'], { glow: string; badge: string; badgeText: string }> = {
  cyan: {
    glow: 'rgba(34,211,238,0.12)',
    badge: 'rgba(34,211,238,0.10)',
    badgeText: '#22d3ee',
  },
  magenta: {
    glow: 'rgba(244,114,182,0.12)',
    badge: 'rgba(244,114,182,0.10)',
    badgeText: '#f472b6',
  },
  lime: {
    glow: 'rgba(163,230,53,0.12)',
    badge: 'rgba(163,230,53,0.10)',
    badgeText: '#a3e635',
  },
  gold: {
    glow: 'rgba(251,191,36,0.14)',
    badge: 'rgba(251,191,36,0.10)',
    badgeText: '#fbbf24',
  },
};

function AgentCard({
  agent,
  active,
  onSelect,
  onOpenStudio,
}: {
  agent: Agent;
  active: boolean;
  onSelect: () => void;
  onOpenStudio: () => void;
}) {
  const colors = accentColors[agent.accent];
  const isArcMainnet = agent.network === 'arc-mainnet';
  const isArcTestnet = agent.network === 'arc-testnet';
  const isArc = isArcMainnet || isArcTestnet;

  const activeBorderColor = isArcMainnet
    ? 'rgba(251,191,36,0.50)'
    : isArcTestnet
    ? 'rgba(163,230,53,0.45)'
    : 'rgba(172,198,233,0.50)';

  const activeGlow = isArcMainnet
    ? 'rgba(251,191,36,0.08)'
    : isArcTestnet
    ? 'rgba(163,230,53,0.08)'
    : 'rgba(172,198,233,0.08)';

  const networkBadge = isArcMainnet
    ? { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.28)' }
    : isArcTestnet
    ? { bg: 'rgba(163,230,53,0.12)', color: '#a3e635', border: '1px solid rgba(163,230,53,0.25)' }
    : null;

  const ctaStyle = active
    ? { background: 'rgba(255,255,255,0.10)', color: 'var(--muted)', border: '1px solid rgba(255,255,255,0.15)' }
    : isArcMainnet
    ? { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#0d1b2f', border: 'none' }
    : { background: 'var(--accent)', color: '#0d1b2f', border: 'none' };

  return (
    <article
      className="relative overflow-hidden rounded-2xl p-5 transition-all cursor-pointer"
      style={{
        background: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)',
        border: active ? `1.5px solid ${activeBorderColor}` : '1px solid rgba(255,255,255,0.10)',
        boxShadow: active ? `0 0 32px ${activeGlow}` : 'none',
      }}
      onClick={onSelect}
    >
      {/* Accent glow blob */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full"
        style={{ background: `radial-gradient(circle, ${colors.glow} 0%, transparent 70%)`, filter: 'blur(20px)' }} />

      <div className="relative flex items-start justify-between gap-2 mb-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
          {agent.icon}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {networkBadge && (
            <span className="mono text-[9px] uppercase tracking-widest font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: networkBadge.bg, color: networkBadge.color, border: networkBadge.border }}>
              {isArcMainnet && <Shield size={8} />}
              {isArcMainnet ? 'Arc Mainnet' : 'Arc Testnet'}
            </span>
          )}
          <span className="mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: colors.badge, color: colors.badgeText, border: `1px solid ${colors.badgeText}30` }}>
            {agent.category}
          </span>
        </div>
      </div>

      <div className="relative mb-3">
        <h3 className="display font-semibold text-base" style={{ color: 'var(--ink)' }}>
          {agent.name}
        </h3>
        <p className="mono text-[11px] mt-0.5" style={{ color: 'var(--subtle)' }}>
          {agent.handle}
        </p>
      </div>

      <p className="relative text-sm leading-relaxed mb-1" style={{ color: 'var(--muted)' }}>
        {agent.description}
      </p>
      <p className="mono text-[9px] mb-4" style={{ color: 'var(--subtle)', opacity: 0.7 }}>
        {agent.baseUrl}
      </p>

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1 rounded-lg px-2.5 py-1"
          style={{
            background: isArcMainnet ? 'rgba(251,191,36,0.08)' : 'rgba(172,198,233,0.08)',
            border: isArcMainnet ? '1px solid rgba(251,191,36,0.20)' : '1px solid rgba(172,198,233,0.20)',
          }}>
          <span className="mono text-sm font-bold"
            style={{ color: isArcMainnet ? '#fbbf24' : isArc ? '#a3e635' : 'var(--accent)' }}>
            {agent.price}
          </span>
          <span className="mono text-[9px] uppercase tracking-wider"
            style={{ color: isArcMainnet ? 'rgba(251,191,36,0.6)' : 'rgba(172,198,233,0.6)' }}>
            USDC/req
          </span>
        </div>

        <button
          onClick={e => { e.stopPropagation(); onSelect(); }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
          style={ctaStyle}
        >
          {active ? <><Check size={12} /> Selected</> : <><Sparkles size={12} /> Select</>}
        </button>
      </div>

      {active && (
        <button
          onClick={e => { e.stopPropagation(); onOpenStudio(); }}
          className="relative mt-3 flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color: isArcMainnet ? '#fbbf24' : isArc ? '#a3e635' : 'var(--accent)' }}
        >
          Open Studio <ChevronRight size={12} />
        </button>
      )}
    </article>
  );
}

export function Marketplace({ activeAgent, onSelect, onOpenStudio }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AGENTS;
    return AGENTS.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.handle.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.network.includes(q),
    );
  }, [query]);

  const mainnetAgents = filtered.filter(a => a.network === 'arc-mainnet');
  const testnetAgents = filtered.filter(a => a.network === 'arc-testnet');
  const baseAgents = filtered.filter(a => a.network === 'base');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(172,198,233,0.10)', color: 'var(--accent)', border: '1px solid rgba(172,198,233,0.2)' }}>
            Agent Marketplace
          </span>
          <span className="mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--subtle)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <Zap size={9} style={{ color: 'var(--accent)' }} />
            agents.circle.com/services
          </span>
        </div>
        <h1 className="display font-bold text-3xl md:text-4xl mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Pick an Agent,{' '}
          <span style={{ color: 'var(--accent)' }}>Pay with USDC</span>
        </h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          x402 micropayments · Arc Mainnet, Arc Testnet, or Base · no API keys needed
        </p>
      </header>

      {/* Search bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-10">
        <div className="relative w-full sm:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--subtle)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search agents…"
            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--ink)' }}
            onFocus={e => { e.target.style.borderColor = 'rgba(172,198,233,0.4)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          />
        </div>
        <span className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          {filtered.length} / {AGENTS.length} agents
        </span>
      </div>

      {/* ── Arc Mainnet agents — top billing ──────────────────────────────── */}
      {mainnetAgents.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-px flex-1" style={{ background: 'rgba(251,191,36,0.25)' }} />
            <span className="mono text-[9px] uppercase tracking-[0.2em] flex items-center gap-1.5 px-3 py-1 rounded-full"
              style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.22)' }}>
              <Shield size={8} />
              Arc Mainnet Agents
            </span>
            <div className="h-px flex-1" style={{ background: 'rgba(251,191,36,0.25)' }} />
          </div>
          {/* Subtle mainnet call-out */}
          <div className="mb-5 flex items-start gap-3 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <Zap size={13} className="mt-0.5 shrink-0" style={{ color: '#fbbf24' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'rgba(251,191,36,0.80)' }}>
              These agents settle on <strong>Arc Mainnet</strong> — real USDC, real finality.
              USDC is the native gas token: no ETH bridging, no wrapped tokens, predictable fees.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {mainnetAgents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                active={activeAgent?.id === agent.id}
                onSelect={() => onSelect(agent)}
                onOpenStudio={onOpenStudio}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Arc Testnet agents ─────────────────────────────────────────────── */}
      {testnetAgents.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1" style={{ background: 'rgba(163,230,53,0.20)' }} />
            <span className="mono text-[9px] uppercase tracking-[0.2em] flex items-center gap-1.5 px-2"
              style={{ color: '#a3e635' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a3e635', display: 'inline-block' }} />
              Arc Testnet Agents
            </span>
            <div className="h-px flex-1" style={{ background: 'rgba(163,230,53,0.20)' }} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {testnetAgents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                active={activeAgent?.id === agent.id}
                onSelect={() => onSelect(agent)}
                onOpenStudio={onOpenStudio}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Base agents ────────────────────────────────────────────────────── */}
      {baseAgents.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <span className="mono text-[9px] uppercase tracking-[0.2em] px-2" style={{ color: 'var(--subtle)' }}>
              Base Agents
            </span>
            <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.08)' }} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {baseAgents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                active={activeAgent?.id === agent.id}
                onSelect={() => onSelect(agent)}
                onOpenStudio={onOpenStudio}
              />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-sm" style={{ color: 'var(--subtle)' }}>No agents match your search.</p>
        </div>
      )}
    </div>
  );
}
