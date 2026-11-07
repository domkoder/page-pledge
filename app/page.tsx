'use client';

import { useState } from 'react';
import { BookMarked, Layers } from 'lucide-react';
import { ClusterSelect } from './components/cluster-select';
import { GridBackground } from './components/grid-background';
import { PagePledgeWorkbench } from './components/pagepledge/pagepledge-workbench';
import { PrototypeAppFlow } from './components/prototype/prototype-app-flow';
import { ThemeToggle } from './components/theme-toggle';
import { WalletButton } from './components/wallet-button';

export default function Home() {
  const [showLegacyVariants, setShowLegacyVariants] = useState(false);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <GridBackground />

      <div className="relative z-10">
        {/* Top App Header */}
        <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-neutral-200/80 px-6 py-4 dark:border-neutral-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <BookMarked className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-tight">PagePledge</h1>
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  Solana USDC Cohort Vaults
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                AI grades learning • Deterministic Solana program rules enforce stakes &amp; payouts
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowLegacyVariants((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900"
            >
              <Layers className="h-3.5 w-3.5 text-indigo-500" />
              {showLegacyVariants ? 'Back to Full Protocol Workbench' : 'UI Layout Variants (A/B/C)'}
            </button>
            <ThemeToggle />
            <ClusterSelect />
            <WalletButton />
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-6 py-6 pb-20">
          {showLegacyVariants ? <PrototypeAppFlow /> : <PagePledgeWorkbench />}
        </main>
      </div>
    </div>
  );
}
