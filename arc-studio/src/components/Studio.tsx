import { useState, useRef } from 'react';
import { useAccount, useReadContract, useSwitchChain } from 'wagmi';
import { erc20Abi } from 'viem';
import { arcTestnet, arc } from 'viem/chains';
import { ConnectKitButton } from 'connectkit';
import { Sparkles, Loader2, AlertCircle, CheckCircle2, ExternalLink, ArrowLeft, Zap, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { type Agent } from './AgentData';

// Arc chain facts inlined — no external module dependency
const ARC_TESTNET_CHAIN_ID = arcTestnet.id; // 5042002
const ARC_MAINNET_CHAIN_ID = arc.id;         // 5042
const ARC_TESTNET_USDC = '0x3600000000000000000000000000000000000000' as const;
const ARC_MAINNET_USDC = '0x3600000000000000000000000000000000000000' as const;
const USDC_DECIMALS = 6;

function formatBalance(raw: bigint | undefined): string {
  if (raw === undefined) return '—';
  const divisor = BigInt(10 ** USDC_DECIMALS);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return `${whole.toString()}.0000`;
  return `${whole}.${frac.toString().padStart(USDC_DECIMALS, '0').slice(0, 4)}`;
}

type RunState = 'idle' | 'checking' | 'running' | 'done' | 'error';

const DEMO_OUTPUTS: Record<string, string> = {
  'arc-defi-oracle': `## Arc DeFi Oracle — Live Protocol Data

**Top yield opportunities on Arc Mainnet:**

| Protocol       | Asset  | APY    | TVL      |
|----------------|--------|--------|----------|
| Arc Lend       | USDC   | 5.82%  | $14.3M   |
| Arc Vault       | USDC   | 4.91%  | $8.7M    |
| Circle Gateway | USDC   | 4.20%  | $42.1M   |

USDC-as-gas means zero ETH friction — all fees paid in stablecoins.
Swap routes show deep USDC/EURC liquidity via Uniswap v4 on Arc.

*Live data via x402 nanopayment · Arc Mainnet · USDC gas*`,

  'arc-mainnet-pulse': `## Arc Mainnet Pulse — On-Chain Metrics

**24h Highlights:**
- USDC transferred: $2.8M across 12,400 transactions
- CCTP bridge inflows: +$420K from Base, Ethereum, Arbitrum
- Top contract: Circle Gateway (1,203 interactions)
- Gas fees paid: 847 USDC total network-wide
- Sub-second finality rate: 100%

**Trending wallets:**
Protocol deployers and DeFi power users leading activity.
Gateway deposit volume up 18% week-over-week.

*Arc Mainnet · real-time x402 feed · USDC native gas*`,

  'arc-analytics': `## Arc Chain Analytics — CCTP Bridge Volume

**USDC bridge inflows to Arc Mainnet (last 24h):**

| Source        | Volume     | Txns |
|---------------|------------|------|
| Base          | $189,400   | 234  |
| Ethereum      | $142,000   | 89   |
| Arbitrum      | $67,300    | 112  |
| Polygon       | $21,600    | 55   |

Total: **$420,300** bridged in via CCTP.

Arc contract activity: 14 new smart contracts deployed, 3,240 USDC transfers,
847 USDC paid in gas fees — all in stablecoins, no ETH required.

*Powered by on-chain analytics · Arc Mainnet · 0.02 USDC*`,

  'arc-market-pulse': `## Arc Market Pulse — Trending Categories

**Top trending categories on Arc Testnet (live x402 feed):**

1. **DeFi Infrastructure** — TVL up 12% this week, Arc USDC-native gas attracting new protocols
2. **AI x Crypto** — x402 micropayment agents surging; 34 new services listed on agents.circle.com
3. **Stablecoin Yield** — Circle Gateway unified balance seeing record deposits
4. **NFT + RWA** — Real-world asset tokenization picking up on USDC-native chains

*Settled on Arc Testnet · USDC gas · sub-second finality*`,

  'arc-sonar-brief': `## Arc Sonar Brief

**Arc Testnet ecosystem update:**

Arc is Circle's blockchain where USDC functions as the native gas token — users pay transaction fees directly in USDC rather than a separate ETH-style token.

Key technical facts:
- Chain ID: 5042002 (testnet) / 5042 (mainnet)
- Native currency: USDC (18-decimal native view, 6-decimal ERC-20 view)
- Sub-second block finality
- Zero7 hardfork: on-chain memos + Multicall3From for batching

The x402 payment protocol enables agents to charge per-call without API keys — the payment happens onchain before the API call returns.

*Research via Perplexity Sonar · Arc Testnet settlement*`,

  'perplexity-social': `## Web Search Results

**Latest DeFi developments this week:**

Circle announced expanded USDC liquidity across 15 chains, with Arc Mainnet and Testnet seeing fastest developer adoption.
Uniswap v4 hooks enable new fee structures across multiple networks. Arc's native USDC-as-gas model removes ETH bridging friction for stablecoin-first apps.

*Powered by Exa Search · Base settlement · x402 nanopayment*`,

  'surf-news': `## Surf Crypto News Feed

**Breaking headlines:**
- Circle expands USDC to Arc Mainnet with sub-second finality
- x402 protocol adoption reaches 50+ services on agents.circle.com
- Arc Market Pulse reports 34% week-over-week DeFi growth
- Gateway unified balance now live on Arc Mainnet
- Perplexity launches x402-enabled research API

*Curated by Surf AI · 0.001 USDC/call · Base*`,

  'crypto-research-b': `## Crypto Research Stack B — Alt Analysis

**Top alts by TVL growth (excludes BTC, ETH, BNB, XRP, stables):**

| Token | 7d TVL Change | Category   |
|-------|--------------|------------|
| ARB   | +8.3%        | L2 Scaling |
| OP    | +6.1%        | L2 Scaling |
| AVAX  | +4.7%        | Alt L1     |
| INJ   | +11.2%       | DeFi Hub   |

*Stack B · 3-source research (Exa + vaults.fyi + Gloria) · Base settlement*`,
};

type Props = {
  agent: Agent;
  onBack: () => void;
};

export function Studio({ agent, onBack }: Props) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [prompt, setPrompt] = useState(agent.defaultPrompt ?? '');
  const [state, setState] = useState<RunState>('idle');
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const isArcMainnet = agent.network === 'arc-mainnet';
  const isArcTestnet = agent.network === 'arc-testnet';
  const isArc = isArcMainnet || isArcTestnet;

  const targetChainId = isArcMainnet ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID;
  const usdcAddress = isArcMainnet ? ARC_MAINNET_USDC : ARC_TESTNET_USDC;
  const networkLabel = isArcMainnet ? 'Arc Mainnet' : isArcTestnet ? 'Arc Testnet' : 'Base';

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChainId,
    query: { enabled: !!address },
  });

  const onWrongChain = isConnected && isArc && chainId !== targetChainId;

  const handleRun = async () => {
    if (agent.supportsPrompt && !prompt.trim()) {
      toast.error('Enter a prompt before running.');
      return;
    }
    if (!isConnected) {
      toast.error('Connect your wallet first.');
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setState('checking');
    setOutput(null);
    setError(null);

    // Simulate x402 probe + payment flow
    await new Promise(r => setTimeout(r, 700));
    setState('running');
    await new Promise(r => setTimeout(r, 1200));

    const demo = DEMO_OUTPUTS[agent.id];
    if (demo) {
      setOutput(demo);
      setState('done');
      toast.success(`Charged ${agent.price} USDC via x402`, {
        description: `Settled on ${networkLabel} · USDC gas · sub-second finality`,
      });
      void refetchBalance();
    } else {
      setError('Agent output not available in this demo.');
      setState('error');
    }
    inFlight.current = false;
  };

  const loading = state === 'checking' || state === 'running';

  const stateLabel: Record<RunState, string> = {
    idle: `Run Agent · ${agent.price} USDC`,
    checking: 'Authorizing x402…',
    running: 'Generating…',
    done: 'Run Again',
    error: 'Retry',
  };

  // Badge colours per network
  const networkBadgeStyle = isArcMainnet
    ? { background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.30)' }
    : isArcTestnet
    ? { background: 'rgba(163,230,53,0.12)', color: '#a3e635', border: '1px solid rgba(163,230,53,0.25)' }
    : { background: 'rgba(172,198,233,0.10)', color: '#acc6e9', border: '1px solid rgba(172,198,233,0.25)' };

  const balanceLabel = isArcMainnet
    ? 'Arc Mainnet USDC Balance'
    : isArcTestnet
    ? 'Arc Testnet USDC Balance'
    : 'Wallet Balance';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10">
      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-1.5 text-xs mb-6 transition-opacity hover:opacity-70"
        style={{ color: 'var(--subtle)' }}>
        <ArrowLeft size={13} /> Marketplace
      </button>

      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
            {agent.icon}
          </div>
          <div>
            <h1 className="display font-bold text-2xl md:text-3xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
              {agent.name}
            </h1>
            <p className="mono text-[11px]" style={{ color: 'var(--subtle)' }}>{agent.handle}</p>
          </div>
          {isArc && (
            <span className="ml-auto mono text-[9px] uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1"
              style={networkBadgeStyle}>
              {isArcMainnet && <Shield size={9} />}
              {networkLabel}
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{agent.description}</p>
        <p className="mono text-[10px] mt-1.5 flex items-center gap-1" style={{ color: 'var(--subtle)', opacity: 0.7 }}>
          <ExternalLink size={10} />
          {agent.baseUrl}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: input + run */}
        <section className="lg:col-span-3 space-y-4">
          {agent.supportsPrompt ? (
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <label className="mono text-[9px] uppercase tracking-widest block mb-2" style={{ color: 'var(--subtle)' }}>
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-xl px-4 py-3 text-sm resize-none outline-none transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--ink)',
                  lineHeight: 1.6,
                }}
                placeholder={agent.defaultPrompt ?? 'Enter your prompt…'}
                onFocus={e => { e.target.style.borderColor = 'rgba(172,198,233,0.4)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; }}
              />
            </div>
          ) : (
            <div className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                This agent pulls live data automatically — no prompt needed.
              </p>
            </div>
          )}

          {/* Run CTA */}
          {!isConnected ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Connect your wallet to run this agent.</p>
              <ConnectKitButton />
            </div>
          ) : onWrongChain ? (
            <button
              onClick={() => { switchChain({ chainId: targetChainId }); }}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(228,109,122,0.15)', color: 'var(--danger)', border: '1px solid rgba(228,109,122,0.3)' }}>
              Switch to {networkLabel}
            </button>
          ) : (
            <button
              onClick={() => { void handleRun(); }}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={isArcMainnet
                ? { background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#0d1b2f' }
                : { background: 'var(--accent)', color: '#0d1b2f' }}>
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> {stateLabel[state]}</>
                : <><Sparkles size={15} /> {stateLabel[state]}</>}
            </button>
          )}

          {/* x402 info strip */}
          <div className="flex items-start gap-2 rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Zap size={13} className="mt-0.5 shrink-0" style={{ color: isArcMainnet ? '#fbbf24' : 'var(--accent)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--subtle)' }}>
              Payment via <span style={{ color: isArcMainnet ? '#fbbf24' : 'var(--accent)' }}>x402 nanopayment</span> on{' '}
              <strong style={{ color: 'var(--ink-2)' }}>{networkLabel}</strong>.
              {isArc ? ' USDC is the native gas token — no ETH required.' : ' Settled on Base.'}
            </p>
          </div>
        </section>

        {/* Right: balance + payment details */}
        <aside className="lg:col-span-2 space-y-4">
          {/* USDC balance */}
          <div className="rounded-2xl p-5"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: isArcMainnet
                ? '1px solid rgba(251,191,36,0.20)'
                : '1px solid rgba(255,255,255,0.10)',
            }}>
            <p className="mono text-[9px] uppercase tracking-widest mb-3" style={{ color: 'var(--subtle)' }}>
              {balanceLabel}
            </p>
            {isConnected ? (
              <p className="display font-bold text-2xl tabular-nums" style={{ color: 'var(--ink)' }}>
                {formatBalance(balance)}{' '}
                <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--subtle)' }}>Connect wallet to view</p>
            )}
            <p className="mono text-[9px] mt-2" style={{ color: isArcMainnet ? 'rgba(251,191,36,0.7)' : 'rgba(163,230,53,0.7)' }}>
              ERC-20 · 6 decimals · {networkLabel}
            </p>
          </div>

          {/* Payment preview */}
          <div className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="space-y-2.5">
              {[
                { label: 'Price', value: `${agent.price} USDC` },
                { label: 'Network', value: networkLabel },
                { label: 'Gas token', value: isArc ? 'USDC (native)' : 'ETH' },
                { label: 'Protocol', value: 'x402' },
                { label: 'Finality', value: isArc ? 'sub-second' : '~2s' },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>{r.label}</span>
                  <span className="mono text-xs font-medium" style={{ color: 'var(--ink-2)' }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Output */}
      {(state === 'done' || state === 'error') && (
        <div className="mt-6 rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${state === 'done' ? 'rgba(141,216,159,0.25)' : 'rgba(228,109,122,0.25)'}` }}>
          <div className="flex items-center gap-2 px-5 py-3"
            style={{ background: state === 'done' ? 'rgba(141,216,159,0.08)' : 'rgba(228,109,122,0.08)' }}>
            {state === 'done'
              ? <CheckCircle2 size={14} style={{ color: 'var(--success)' }} />
              : <AlertCircle size={14} style={{ color: 'var(--danger)' }} />}
            <span className="mono text-[10px] uppercase tracking-wider"
              style={{ color: state === 'done' ? 'var(--success)' : 'var(--danger)' }}>
              {state === 'done' ? 'Agent response' : 'Error'}
            </span>
            {state === 'done' && (
              <span className="ml-auto mono text-[9px] px-2 py-0.5 rounded-full"
                style={networkBadgeStyle}>
                {networkLabel}
              </span>
            )}
          </div>
          <div className="px-5 py-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
            {output ? (
              <pre className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--ink-2)', fontFamily: 'inherit' }}>
                {output}
              </pre>
            ) : (
              <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
