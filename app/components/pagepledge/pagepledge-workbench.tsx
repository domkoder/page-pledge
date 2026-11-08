"use client";

import { useEffect } from "react";
import {
  BookOpenCheck,
  Bot,
  FolderKanban,
  LayoutDashboard,
  PlusSquare,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { formatSol } from "@/lib/economics";
import {
  ScreenTab,
  usePagePledgeStore,
} from "@/lib/store/use-pagepledge-store";
import { DemoControlDrawer } from "./demo-control-drawer";
import { CohortDetailAndSettleScreen } from "./screens/cohort-detail-screen";
import { HomeCreateAndCohortsScreen } from "./screens/home-create-screen";
import { KeeperAndSecurityScreen } from "./screens/keeper-and-security-screen";
import { ParticipantExaminerScreen } from "./screens/participant-screen";
import { SimulatedTxBanner } from "./tx-banner";

const NAV_TABS: {
  id: ScreenTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "home", label: "1. Create & Cohorts", icon: PlusSquare },
  {
    id: "detail",
    label: "2. Cohort Detail & Money Flow",
    icon: LayoutDashboard,
  },
  {
    id: "participant",
    label: "3. Participant Quiz & Oracle",
    icon: BookOpenCheck,
  },
  { id: "settle", label: "4. Settle / Finalize / Claim", icon: Scale },
  { id: "keeper", label: "5. Keeper Bot", icon: Bot },
  { id: "security", label: "6. Security Demo (9 Exploits)", icon: ShieldAlert },
];

export function PagePledgeWorkbench() {
  const {
    chain,
    activeScreen,
    activePersona,
    personas,
    cohorts,
    selectedCohortId,
    lastTx,
    keeperBotEnabled,
    setActiveScreen,
    setSelectedCohortId,
    clearLastTx,
    runKeeperSweepOnce,
    syncFromChain,
  } = usePagePledgeStore();

  // Hydrate client state on mount (reads persisted localStorage state if available)
  useEffect(() => {
    syncFromChain();
  }, [syncFromChain]);

  // Keeper bot background sweep interval when toggled ON
  useEffect(() => {
    if (!keeperBotEnabled) return;
    const timer = setInterval(() => {
      void runKeeperSweepOnce();
    }, 3000);
    return () => clearInterval(timer);
  }, [keeperBotEnabled, runKeeperSweepOnce]);

  const currentPersonaObj = personas.find((p) => p.id === activePersona);

  return (
    <div className="space-y-5">
      {/* Workbench Subheader: Active Cohort Selector + Persona Pill + Navigation Tabs */}
      <div className="rounded-2xl border border-neutral-200 bg-white/95 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/95">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3 dark:border-neutral-800">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1 font-mono text-xs font-bold text-white">
              <FolderKanban className="h-3.5 w-3.5" />
              ChainClient: {chain.mode.toUpperCase()}
            </span>

            <div className="flex items-center gap-1.5 text-xs">
              <label
                htmlFor="cohort-select"
                className="font-semibold text-neutral-500"
              >
                Active Cohort:
              </label>
              <select
                id="cohort-select"
                value={selectedCohortId}
                onChange={(e) => setSelectedCohortId(e.target.value)}
                className="rounded-lg border border-neutral-300 bg-neutral-50 px-2.5 py-1 font-semibold dark:border-neutral-700 dark:bg-neutral-800"
              >
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.status} • {formatSol(c.stake)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {currentPersonaObj && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs">
              <span className="text-neutral-600 dark:text-neutral-300">
                Acting as{" "}
                <strong className="capitalize">{currentPersonaObj.id}</strong>:
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                {formatSol(currentPersonaObj.lamportsBalance)}
              </span>
            </div>
          )}
        </div>

        {/* Screen Navigation Tabs */}
        <nav className="flex flex-wrap gap-1.5" aria-label="PagePledge Screens">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive =
              activeScreen === tab.id ||
              (activeScreen === "cohorts" && tab.id === "home");
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveScreen(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  isActive
                    ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-950"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Latest Simulated Transaction Banner */}
      <SimulatedTxBanner tx={lastTx} onDismiss={clearLastTx} />

      {/* Main Split Layout: Screen Viewport + Always-Visible Demo Control Drawer */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {(activeScreen === "home" || activeScreen === "cohorts") && (
            <HomeCreateAndCohortsScreen />
          )}
          {(activeScreen === "detail" || activeScreen === "settle") && (
            <CohortDetailAndSettleScreen />
          )}
          {activeScreen === "participant" && <ParticipantExaminerScreen />}
          {(activeScreen === "keeper" || activeScreen === "security") && (
            <KeeperAndSecurityScreen />
          )}
        </div>

        <DemoControlDrawer />
      </div>
    </div>
  );
}
