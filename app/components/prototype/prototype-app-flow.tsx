"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PrototypeSwitcher, PrototypeVariantDef } from "./prototype-switcher";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";

const PROTOTYPE_VARIANTS: PrototypeVariantDef[] = [
  {
    id: "A",
    label: "Card Grid + Modal Quiz",
    description: "Grid of active cohorts with quick quiz modal and citation input",
  },
  {
    id: "B",
    label: "Master-Detail Sidebar + Terminal",
    description: "Multi-cohort sidebar with step-by-step split screen examiner",
  },
  {
    id: "C",
    label: "High-Stakes Tabbed + Voice Defense",
    description: "Financial risk-forward layout with interactive oral/audio follow-up",
  },
];

function PrototypeAppFlowInner() {
  const searchParams = useSearchParams();
  const currentVariantId = searchParams.get("variant") ?? "A";

  return (
    <div className="relative pb-24">
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
    <Suspense fallback={<div className="p-8 font-mono text-xs">Loading prototype flow...</div>}>
      <PrototypeAppFlowInner />
    </Suspense>
  );
}
