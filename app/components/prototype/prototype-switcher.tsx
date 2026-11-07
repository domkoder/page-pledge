"use client";

import { useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export interface PrototypeVariantDef {
  id: string;
  label: string;
  description: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariantDef[];
  currentVariant: string;
}

export function PrototypeSwitcher({
  variants,
  currentVariant,
}: PrototypeSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentIndex = Math.max(
    0,
    variants.findIndex((v) => v.id === currentVariant)
  );

  const selectVariant = useCallback(
    (nextId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("variant", nextId);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handlePrev = useCallback(() => {
    const prevIndex = (currentIndex - 1 + variants.length) % variants.length;
    selectVariant(variants[prevIndex].id);
  }, [currentIndex, variants, selectVariant]);

  const handleNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % variants.length;
    selectVariant(variants[nextIndex].id);
  }, [currentIndex, variants, selectVariant]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext]);

  return (
    <>
      {/* Top Inline Variant Switcher Bar (Right above the prototype) */}
      <div className="mb-6 p-2 rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2 pl-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            UI Prototype Switcher:
          </span>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-neutral-950 rounded-xl border border-neutral-200 dark:border-neutral-800">
          {variants.map((v) => {
            const isActive = v.id === currentVariant;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => selectVariant(v.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
                  isActive
                    ? "bg-amber-500 text-neutral-950 shadow-sm font-bold"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900"
                }`}
              >
                Variant {v.id}: {v.label.split("+")[0].trim()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Floating Bottom Switcher (Pill with direct buttons + Prev/Next) */}
      <aside
        aria-label="UI Prototype Switcher"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-neutral-950/95 text-white backdrop-blur-md shadow-2xl border border-neutral-700 text-xs font-mono select-none"
      >
        <button
          onClick={handlePrev}
          type="button"
          title="Previous variant (Left Arrow)"
          className="flex items-center justify-center w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition cursor-pointer"
        >
          ←
        </button>

        <div className="flex items-center gap-1 px-2 border-x border-neutral-800">
          {variants.map((v) => {
            const isCurrent = v.id === currentVariant;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => selectVariant(v.id)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  isCurrent
                    ? "bg-amber-400 text-neutral-950 shadow-xs"
                    : "text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800"
                }`}
              >
                {v.id}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleNext}
          type="button"
          title="Next variant (Right Arrow)"
          className="flex items-center justify-center w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition cursor-pointer"
        >
          →
        </button>
      </aside>
    </>
  );
}
