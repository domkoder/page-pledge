'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Bot,
  Clock,
  Coins,
  FastForward,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
  UserCheck,
} from 'lucide-react';
import { PersonaId, ScenarioPresetId } from '@/lib/chain';
import { formatUsdc } from '@/lib/economics';
import { usePagePledgeStore } from '@/lib/store/use-pagepledge-store';

export function DemoControlDrawer() {
  const {
    activePersona,
    personas,
    now,
    yieldAprBps,
    lenderLossBps,
    keeperBotEnabled,
    setActivePersona,
    faucet,
    advanceClock,
    jumpToNextDeadline,
    jumpPastGrace,
    setYieldAprPercent,
    setLenderLossPercent,
    setKeeperBotEnabled,
    runScenarioPreset,
    runSecurityDemo,
    resetAll,
  } = usePagePledgeStore();

  const [busyPreset, setBusyPreset] = useState<string | null>(null);

  const aprPercent = Number(yieldAprBps) / 100;
  const lossPercent = Number(lenderLossBps) / 100;

  const handleFaucet = async (id: PersonaId) => {
    try {
      await faucet(id, 500);
      toast.success(`Minted +500.00 USDC to ${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Faucet failed');
    }
  };

  const handleScenario = async (preset: ScenarioPresetId, label: string) => {
    setBusyPreset(preset);
    try {
      const cohort = await runScenarioPreset(preset);
      toast.success(`Scenario "${label}" completed!`, {
        description: `Cohort "${cohort.title}" finalized and payouts claimed.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Scenario failed');
    } finally {
      setBusyPreset(null);
    }
  };

  const handleSecurityDemo = async () => {
    setBusyPreset('security');
    try {
      const rows = await runSecurityDemo();
      const passedCount = rows.filter((r) => r.passedCheck).length;
      toast.success(`Security Demo executed: ${passedCount}/${rows.length} exploits rejected!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Security demo failed');
    } finally {
      setBusyPreset(null);
    }
  };

  const handleReset = () => {
    resetAll();
    toast.info('MockChain state & localStorage reset to initial defaults');
  };

  return (
    <aside
      aria-label="Demo Control Drawer"
      className="w-full shrink-0 rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/95 lg:w-80"
    >
      <div className="mb-4 flex items-center justify-between border-b border-neutral-200 pb-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-bold tracking-tight">Demo Control Drawer</h2>
        </div>
        <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
          Always Active
        </span>
      </div>

      {/* 1. Persona Switcher & Mock USDC Faucet */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <span className=" flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <UserCheck className="h-3.5 w-3.5" />
            Active Persona
          </span>
          <span className="text-[11px] text-neutral-400">Click +USDC for faucet</span>
        </div>

        <div className="space-y-1.5">
          {personas.map((p) => {
            const isActive = p.id === activePersona;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-xl border px-2.5 py-2 transition ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-500/10 dark:border-indigo-400 dark:bg-indigo-500/15'
                    : 'border-neutral-200/80 bg-neutral-50/60 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActivePersona(p.id)}
                  className="flex flex-1 flex-col text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isActive ? 'bg-indigo-500' : 'bg-neutral-300 dark:bg-neutral-700'
                      }`}
                    />
                    <span className="text-xs font-bold capitalize">{p.id}</span>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      ({p.role})
                    </span>
                  </div>
                  <span className="mt-0.5 pl-3.5 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatUsdc(p.usdcBalance)}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleFaucet(p.id)}
                  title={`Mint +500 test USDC to ${p.name}`}
                  className="ml-2 inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1 font-mono text-[10px] font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  <Coins className="h-3 w-3 text-amber-500" />
                  +500
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Simulated Chain Clock Controls */}
      <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            <Clock className="h-3.5 w-3.5" />
            Simulated Chain Clock
          </span>
        </div>
        <div className="mb-2.5 rounded-lg bg-neutral-900 px-2.5 py-1.5 font-mono text-[11px] text-emerald-400 dark:bg-black">
          {new Date(now * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              advanceClock(3600);
              toast.info('Clock advanced +1 hour');
            }}
            className="flex items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            <FastForward className="h-3 w-3" />
            +1 Hour
          </button>
          <button
            type="button"
            onClick={() => {
              jumpToNextDeadline();
              toast.info('Jumped past next milestone deadline');
            }}
            className="flex items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          >
            Next Deadline
          </button>
          <button
            type="button"
            onClick={() => {
              jumpPastGrace();
              toast.info('Jumped past final deadline + grace (Settling ready)');
            }}
            className="col-span-2 flex items-center justify-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-500/20 dark:text-amber-300"
          >
            <FastForward className="h-3.5 w-3.5" />
            Jump Past Final Grace Window
          </button>
        </div>
      </div>

      {/* 3. Simulated Yield APR & Lender-Loss Haircut Controls */}
      <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Yield Reserve & Haircut
          </span>
          <span className="font-mono text-[10px] text-neutral-400">Sim Only</span>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <label htmlFor="sim-yield-apr" className="font-medium">
                Simulated Yield APR
              </label>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {aprPercent.toFixed(1)}%
              </span>
            </div>
            <input
              id="sim-yield-apr"
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={aprPercent}
              onChange={(e) => setYieldAprPercent(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>

          <div>
            <div className="mb-1 flex justify-between text-xs">
              <label htmlFor="lender-loss-slider" className="font-medium">
                Simulated Lender Loss %
              </label>
              <span
                className={`font-mono font-semibold ${
                  lossPercent > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-500'
                }`}
              >
                {lossPercent.toFixed(0)}%
              </span>
            </div>
            <input
              id="lender-loss-slider"
              type="range"
              min={0}
              max={50}
              step={1}
              value={lossPercent}
              onChange={(e) => setLenderLossPercent(parseFloat(e.target.value) || 0)}
              className="w-full accent-rose-600"
            />
            <p className="mt-0.5 text-[10px] text-neutral-500">
              Reduces vault assets A at finalize to demonstrate haircut h = min(1, A/U).
            </p>
          </div>
        </div>
      </div>

      {/* 4. Keeper Bot Quick Toggle */}
      <div className="mb-5 flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50/70 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-indigo-500" />
          <div>
            <div className="text-xs font-semibold">Auto-Keeper Sweeper</div>
            <div className="text-[10px] text-neutral-500">Public settle_user loop (3s)</div>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={keeperBotEnabled}
          onClick={() => {
            setKeeperBotEnabled(!keeperBotEnabled);
            toast.info(keeperBotEnabled ? 'Keeper bot paused' : 'Keeper bot active (sweeping every 3s)');
          }}
          className={`rounded-full px-3 py-1 font-mono text-[11px] font-bold transition ${
            keeperBotEnabled
              ? 'bg-emerald-600 text-white'
              : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
          }`}
        >
          {keeperBotEnabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* 5. Automated Scenario Presets */}
      <div className="mb-5">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          1-Click Scenario Presets
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              { id: 'all_finish', label: 'All Finish' },
              { id: 'all_fail', label: 'All Fail' },
              { id: 'mixed', label: 'Mixed (+Neutral)' },
              { id: 'lender_loss', label: 'Lender Loss (h<1)' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busyPreset !== null}
              onClick={() => handleScenario(item.id, item.label)}
              className="flex items-center justify-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-2 text-xs font-semibold text-indigo-900 transition hover:bg-indigo-500/20 disabled:opacity-50 dark:text-indigo-200"
            >
              <Play className="h-3 w-3 shrink-0" />
              {busyPreset === item.id ? 'Running...' : item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Security Demo & Full Reset */}
      <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
        <button
          type="button"
          disabled={busyPreset !== null}
          onClick={handleSecurityDemo}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
        >
          <ShieldAlert className="h-4 w-4" />
          {busyPreset === 'security' ? 'Running 9 Exploits...' : 'Run Security Demo (9 Exploits)'}
        </button>

        <button
          type="button"
          onClick={handleReset}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Full Reset (Wipe localStorage)
        </button>
      </div>
    </aside>
  );
}
