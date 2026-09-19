import { ConnectKitButton } from 'connectkit';
import { Zap, Bot, Globe, ChevronRight, Layers } from 'lucide-react';

type Props = { onEnter: () => void };

export function Landing({ onEnter }: Props) {
  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{
          position: 'absolute', top: '10%', left: '5%', width: 360, height: 360,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }} />
        <div style={{
          position: 'absolute', bottom: '12%', right: '8%', width: 300, height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(163,230,53,0.10) 0%, transparent 70%)',
          filter: 'blur(72px)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', right: '20%', width: 200, height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(244,114,182,0.10) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }} />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 md:px-10">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(172,198,233,0.2)', border: '1px solid rgba(172,198,233,0.3)' }}>
            <Bot size={15} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="display font-bold text-base" style={{ color: 'var(--ink)' }}>
            BookAnAI
          </span>
        </div>
        <ConnectKitButton />
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium mb-6"
          style={{
            background: 'rgba(163,230,53,0.10)',
            border: '1px solid rgba(163,230,53,0.25)',
            color: 'var(--arc-lime)',
          }}>
          <Zap size={11} />
          Arc Testnet · USDC gas · x402 payments
        </div>

        <h1 className="display font-bold text-5xl md:text-6xl lg:text-7xl max-w-3xl mb-6"
          style={{ color: 'var(--ink)', letterSpacing: '-0.04em', lineHeight: 1.05 }}>
          Run AI Agents.<br />
          <span style={{ color: 'var(--accent)' }}>Pay with USDC.</span>
        </h1>

        <p className="text-base md:text-lg max-w-xl mb-10" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
          Book and run x402 AI agents on Arc — the blockchain where USDC is the native gas token.
          No ETH required. Sub-second finality. Pay only for what you use.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={onEnter}
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ background: 'var(--accent)', color: '#0d1b2f' }}
          >
            Open Marketplace
            <ChevronRight size={16} />
          </button>
          <a
            href="https://docs.arc.io"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-70"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--ink-2)',
            }}
          >
            <Globe size={15} />
            Arc Docs
          </a>
        </div>

        {/* Feature chips */}
        <div className="mt-16 flex flex-wrap justify-center gap-3 max-w-2xl">
          {[
            { icon: <Zap size={13} />, label: 'Sub-second finality' },
            { icon: <Layers size={13} />, label: 'USDC-native gas' },
            { icon: <Bot size={13} />, label: '5 x402 agents' },
          ].map(f => (
            <div key={f.label}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs mono"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
              }}>
              <span style={{ color: 'var(--accent)' }}>{f.icon}</span>
              {f.label}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
