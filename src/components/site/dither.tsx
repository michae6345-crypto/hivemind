"use client";

import { useEffect, useRef } from "react";

// 4x4 Bayer matrix, normalised to (0, 1): an ordered dither turns a smooth band into a field of tiny dots.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const GRID = 7;
const LOOP_S = 60;

const BANDS = [
  { color: "77,107,153", y: 0.26, amp: 0.07, width: 0.13, freq: 1.4, phase: 0, alpha: 0.42 }, // blue-grey #4D6B99
  { color: "224,154,43", y: 0.62, amp: 0.06, width: 0.1, freq: 1.1, phase: 2.1, alpha: 0.38 }, // honey #E09A2B
];

/**
 * Ambient dither waves: a fixed full-screen canvas behind the page, two slow bands of dots on a 7px grid.
 * Fades in over 1.8s and drifts on a ~60s loop; with reduced motion it is drawn once and holds still.
 */
export function Dither() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (t: number) => {
      const phase = ((t / 1000) % LOOP_S) / LOOP_S * Math.PI * 2;
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / GRID);
      const rows = Math.ceil(h / GRID);
      for (const b of BANDS) {
        ctx.fillStyle = `rgba(${b.color},${b.alpha})`;
        const half = b.width * h * 2.2;
        for (let c = 0; c < cols; c++) {
          const x = c * GRID;
          const nx = x / w;
          const center = h * (b.y + b.amp * Math.sin(nx * Math.PI * 2 * b.freq + phase + b.phase) + 0.025 * Math.sin(nx * 9 + phase * 2));
          const r0 = Math.max(0, Math.floor((center - half) / GRID));
          const r1 = Math.min(rows, Math.ceil((center + half) / GRID));
          for (let r = r0; r < r1; r++) {
            const y = r * GRID;
            const d = (y - center) / (b.width * h);
            const v = Math.exp(-d * d) * (0.75 + 0.25 * Math.sin(nx * 5 - phase));
            if (v > BAYER[(r & 3) * 4 + (c & 3)]) ctx.fillRect(x + 2.5, y + 2.5, 1.6, 1.6);
          }
        }
      }
    };

    const tick = (t: number) => {
      // ~30fps is plenty for a drift this slow.
      if (t - last > 33) {
        draw(t);
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };

    resize();
    window.addEventListener("resize", resize);
    if (reduce) draw(0);
    else raf = requestAnimationFrame(tick);
    const onResizeStill = () => reduce && draw(0);
    window.addEventListener("resize", onResizeStill);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", onResizeStill);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 animate-[hm-fade-in_1.8s_ease-out_both] motion-reduce:animate-none"
    />
  );
}
