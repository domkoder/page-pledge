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

  const current = variants[currentIndex] ?? variants[0];

  return (
    <aside
      aria-label="UI Prototype Switcher"
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full bg-neutral-900/90 text-white backdrop-blur-md shadow-2xl border border-neutral-700/80 text-xs font-mono select-none"
    >
      <button
        onClick={handlePrev}
        type="button"
        title="Previous variant (Left Arrow)"
        className="flex items-center justify-center w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 hover:text-white transition cursor-pointer"
      >
        ←
      </button>

      <div className="flex flex-col items-center min-w-[220px] text-center">
        <span className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
          UI Prototype • {current.id}
        </span>
        <span className="font-semibold text-neutral-100">{current.label}</span>
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
  );
}
