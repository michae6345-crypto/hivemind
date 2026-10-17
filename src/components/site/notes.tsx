"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/components/hm/utils";

// Hand-drawn annotations (Shantell Sans + a pencil arrow that draws itself in), and a fixed-size canvas that scales
// to fit its column, the way spacefs.com scales its Finder mockups.

export type ArrowDir = "left" | "right" | "down-left" | "down-right" | "up-left" | "up-right" | "down" | "up";

// Each arrow is drawn in a 48x36 box, from the end nearest the text to the head.
const ARROWS: Record<"side" | "down" | "up" | "vdown", { stem: string; head: string }> = {
  side: { stem: "M46 17c-9-7-22 8-40 2", head: "M12 13L5 19l8 4" },
  down: { stem: "M44 5C30 3 14 11 8 30", head: "M3 22l5 9 7-6" },
  up: { stem: "M44 31C30 33 14 25 8 6", head: "M3 14l5-9 7 6" },
  vdown: { stem: "M24 2c-7 10 6 20 0 31", head: "M18 26l6 8 5-8" },
};

function Arrow({ dir, delay }: { dir: ArrowDir; delay: number }) {
  const kind = dir === "left" || dir === "right" ? "side" : dir === "down" || dir === "up" ? "vdown" : dir.startsWith("down") ? "down" : "up";
  const a = ARROWS[kind];
  const flip = dir === "right" || dir.endsWith("-right");
  const vflip = dir === "up";
  const draw = {
    initial: { pathLength: 0, opacity: 0 },
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true, amount: 0.6 },
  };
  return (
    <svg
      viewBox="0 0 48 36"
      className={cn("h-7 w-9 shrink-0 overflow-visible", flip && "-scale-x-100", vflip && "-scale-y-100")}
      fill="none"
      aria-hidden
    >
      <motion.path d={a.stem} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...draw} transition={{ duration: 0.6, delay, ease: "easeInOut" }} />
      <motion.path
        d={a.head}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw}
        transition={{ duration: 0.25, delay: delay + 0.55, ease: "easeOut" }}
      />
    </svg>
  );
}

/**
 * A hand-written note with a little arrow. `dir` is where the arrow points; the text sits on the other side.
 * Purely decorative (aria-hidden): anything a note says must also be said in the page's real text or labels.
 */
export function Note({
  children,
  dir = "left",
  className,
  delay = 0,
  tone = "ink",
  width,
}: {
  children: ReactNode;
  dir?: ArrowDir;
  className?: string;
  delay?: number;
  tone?: "ink" | "honey" | "rose" | "muted";
  width?: number;
}) {
  const arrowFirst = dir === "left" || dir.endsWith("-left") || dir === "up";
  const vertical = dir === "up" || dir === "down";
  const color = { ink: "text-fg/75", honey: "text-[#b9771a]", rose: "text-lock", muted: "text-muted" }[tone];
  return (
    <span
      className={cn(
        "pointer-events-none flex gap-1",
        vertical ? "flex-col items-center text-center" : dir.startsWith("down") ? "items-start" : dir.startsWith("up") ? "items-end" : "items-center",
        color,
        className,
      )}
      aria-hidden
    >
      {arrowFirst ? <Arrow dir={dir} delay={delay + 0.2} /> : null}
      <motion.span
        initial={{ opacity: 0, y: 4, rotate: -1.5 }}
        whileInView={{ opacity: 1, y: 0, rotate: -1.5 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.5, delay }}
        className="font-note text-[15px] leading-[1.25]"
        style={{ fontVariationSettings: "'INFM' 100, 'BNCE' 30", width }}
      >
        {children}
      </motion.span>
      {arrowFirst ? null : <Arrow dir={dir} delay={delay + 0.2} />}
    </span>
  );
}

/**
 * Lays out a fixed `w`x`h` design and scales it to the width of its column (never above 1). Below `min` it stops
 * shrinking and the column scrolls sideways instead, so phones get a readable diagram rather than a tiny one.
 */
export function Fit({ w, h, children, className, min = 0.6 }: { w: number; h: number; children: ReactNode; className?: string; min?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFit(Math.min(1, e.contentRect.width / w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  const k = Math.max(fit, min);
  return (
    <div ref={box} className={cn("relative mx-auto w-full", fit < min && "overflow-x-auto overscroll-x-contain", className)} style={{ maxWidth: w }}>
      <div className="relative" style={{ width: w * k, height: h * k }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: w, height: h, transform: `scale(${k})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}
