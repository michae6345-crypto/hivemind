"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { cn, confidence, scopeLabel } from "./utils";

/** Quiet honeycomb texture for empty states. */
export function HexField({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden>
      <defs>
        <pattern id="hm-hexfield" width="42" height="72.75" patternUnits="userSpaceOnUse">
          <path
            d="M21 0 42 12.125v24.25L21 48.5 0 36.375v-24.25L21 0Zm0 48.5 21 12.125V72.75M21 48.5 0 60.625V72.75"
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
          />
        </pattern>
        <radialGradient id="hm-hexfade" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id="hm-hexmask">
          <rect width="100%" height="100%" fill="url(#hm-hexfade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#hm-hexfield)" mask="url(#hm-hexmask)" />
    </svg>
  );
}

// Axial hex coordinates, spiralling out from the centre: the hive grows outward as lessons are added.
const DIRS: [number, number][] = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

function spiral(n: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  for (let k = 1; out.length < n; k++) {
    let q = DIRS[4][0] * k;
    let r = DIRS[4][1] * k;
    for (let side = 0; side < 6 && out.length < n; side++) {
      for (let step = 0; step < k && out.length < n; step++) {
        out.push([q, r]);
        q += DIRS[side][0];
        r += DIRS[side][1];
      }
    }
  }
  return out;
}

const RADIUS = 16;
const hexPath = (cx: number, cy: number, rad: number) => {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join("L")}Z`;
};

function order(m: Memory) {
  if (m.locked) return 0;
  if (m.status === "active") return 1;
  if (m.status === "pending") return 2;
  return 3; // blocked
}

/**
 * The hive: one cell per lesson the company has. Locked rules sit at the core, approved lessons fill outward
 * (brighter = more confident), and lessons waiting for approval or blocked sit on the edge.
 */
export function Hive({ className }: { className?: string }) {
  const { memories, recentlyChanged, openMemory } = useHivemind();
  const router = useRouter();
  const [hover, setHover] = useState<Memory | null>(null);

  const cells = useMemo(() => {
    const shown = memories
      .filter((m) => m.status !== "rejected" && m.status !== "invalid")
      .slice()
      .sort((a, b) => order(a) - order(b) || a.createdAt.localeCompare(b.createdAt));
    const coords = spiral(shown.length);
    const w = Math.sqrt(3) * RADIUS + 3;
    const h = 1.5 * RADIUS + 2.6;
    return shown.map((m, i) => {
      const [q, r] = coords[i];
      return { m, x: w * (q + r / 2), y: h * r };
    });
  }, [memories]);

  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const pad = RADIUS + 6;
  const minX = Math.min(0, ...xs) - pad;
  const minY = Math.min(0, ...ys) - pad;
  const width = Math.max(0, ...xs) - minX + pad;
  const height = Math.max(0, ...ys) - minY + pad;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        className="h-full w-full"
        role="img"
        aria-label={`${cells.length} lessons in the hive`}
      >
        {cells.map(({ m, x, y }) => {
          const c = confidence(m);
          const hovered = hover?.id === m.id;
          // Each cell is a comb (outline) holding honey (solid core): the core grows with confidence.
          const ring =
            m.locked || m.status === "blocked"
              ? { stroke: m.locked ? "var(--chip-lock)" : "var(--danger)", strokeOpacity: 0.85 }
              : { stroke: "var(--accent)", strokeOpacity: m.status === "pending" ? 0.9 : 0.4 };
          const core =
            m.locked
              ? { r: RADIUS * 0.6, fill: "var(--chip-lock)", opacity: 0.9 }
              : m.status === "active"
                ? { r: RADIUS * (0.3 + 0.6 * c), fill: "var(--accent)", opacity: 0.95 }
                : null;
          return (
            <g
              key={m.id}
              className={cn(
                "cursor-pointer outline-none",
                m.status === "pending" && "hm-cell-wait",
                recentlyChanged.has(m.id) && "hm-cell-pop",
              )}
              style={{ transformOrigin: `${x}px ${y}px` }}
              tabIndex={0}
              role="button"
              aria-label={`${m.title}, ${m.status}`}
              onMouseEnter={() => setHover(m)}
              onMouseLeave={() => setHover((h) => (h?.id === m.id ? null : h))}
              onFocus={() => setHover(m)}
              onBlur={() => setHover(null)}
              onClick={() => {
                openMemory(m.id);
                router.push("/");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  openMemory(m.id);
                  router.push("/");
                }
              }}
            >
              <path
                d={hexPath(x, y, RADIUS)}
                fill={hovered ? "var(--elevated)" : "var(--panel)"}
                {...ring}
                strokeWidth={hovered ? 1.8 : 1.1}
                strokeDasharray={m.status === "pending" ? "3 2.5" : undefined}
                className="transition-[stroke-width] duration-150"
              />
              {core ? <path d={hexPath(x, y, core.r)} fill={core.fill} fillOpacity={core.opacity} /> : null}
              {m.status === "blocked" ? (
                <path
                  d={`M${x - 4.5} ${y - 4.5}L${x + 4.5} ${y + 4.5}M${x + 4.5} ${y - 4.5}L${x - 4.5} ${y + 4.5}`}
                  stroke="var(--danger)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 min-h-10 text-center">
        {hover ? (
          <div className="inline-block max-w-full rounded-md border border-line bg-elevated px-2.5 py-1.5 text-left text-[12px] shadow-none">
            <div className="truncate font-medium text-fg">{hover.title}</div>
            <div className="text-muted">
              {scopeLabel(hover.scopeId)}, {hover.locked ? "locked" : hover.status === "active" ? `${Math.round(confidence(hover) * 100)}% confidence` : hover.status}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HiveLegend() {
  const item = (swatch: React.ReactNode, label: string) => (
    <span className="flex items-center gap-1.5">
      <svg viewBox="-9 -9 18 18" className="size-3.5" aria-hidden>
        {swatch}
      </svg>
      {label}
    </span>
  );
  const h = hexPath(0, 0, 7.5);
  const core = (r: number, fill: string) => <path d={hexPath(0, 0, r)} fill={fill} />;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
      {item(<><path d={h} fill="none" stroke="var(--chip-lock)" />{core(4.5, "var(--chip-lock)")}</>, "Locked rule")}
      {item(<><path d={h} fill="none" stroke="var(--accent)" strokeOpacity={0.5} />{core(5.5, "var(--accent)")}</>, "Approved lesson; a fuller cell is more trusted")}
      {item(<path d={h} fill="none" stroke="var(--accent)" strokeDasharray="2.5 2" />, "Waiting for approval")}
      {item(<path d={h} fill="none" stroke="var(--danger)" />, "Blocked")}
    </div>
  );
}
