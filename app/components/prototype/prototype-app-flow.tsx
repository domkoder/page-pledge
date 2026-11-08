"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher, PrototypeVariantDef } from "./prototype-switcher";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import { WinningUnifiedFlow } from "./winning-unified-flow";

const PROTOTYPE_VARIANTS: PrototypeVariantDef[] = [
  {
    id: "WINNER",
    label: "Winning Hybrid: A + B + C Unified",
    description:
      "Variant A card grid + Variant B split-screen terminal + Variant C radial timer & adaptive defense",
  },
  {
    id: "A",
    label: "Variant A (Card Grid + Modal)",
    description:
      "Grid of active cohorts with quick quiz modal and citation input",
  },
  {
    id: "B",
    label: "Variant B (Sidebar + Terminal)",
    description: "Multi-cohort sidebar with step-by-step split screen examiner",
  },
  {
    id: "C",
    label: "Variant C (High-Stakes + Defense)",
    description:
      "Financial risk-forward layout with interactive oral/audio follow-up",
  },
];

function PrototypeAppFlowInner() {
  const searchParams = useSearchParams();
  const currentVariantId = searchParams.get("variant") ?? "WINNER";

  return (
    <div className="relative pb-24">
      {currentVariantId === "WINNER" && <WinningUnifiedFlow />}
      {currentVariantId === "A" && <VariantA />}
      {currentVariantId === "B" && <VariantB />}
      {currentVariantId === "C" && <VariantC />}

      <PrototypeSwitcher
        variants={PROTOTYPE_VARIANTS}
        currentVariant={currentVariantId}
      />
    </div>
  );
}

export function PrototypeAppFlow() {
  return (
    <Suspense
      fallback={
        <div className="p-8 font-mono text-xs">Loading prototype flow...</div>
      }
    >
      <PrototypeAppFlowInner />
    </Suspense>
  );
}
