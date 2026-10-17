"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { useHivemind } from "./store";
import { Avatar, Label } from "./bits";
import { RichText } from "./rich-text";
import { Hive, HiveLegend } from "./hex";
import { timeAgo } from "./utils";

export function Learning() {
  const { metrics, metricsLive, memoryBySlug, people, memories } = useHivemind();
  const curve = metrics.curve;
  const avg = (xs: typeof curve) => (xs.length ? xs.reduce((s, x) => s + x.corrections, 0) / xs.length : 0);
  const before = avg(curve.slice(0, 5));
  const after = avg(curve.slice(-5));
  const approvals = curve.filter((c) => c.lessonApproved);
  const ev = metrics.eval;

  const active = memories.filter((m) => m.status === "active");
  const locked = active.filter((m) => m.locked).length;
  const waiting = memories.filter((m) => m.status === "pending").length;
  const blocked = memories.filter((m) => m.status === "blocked").length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="font-brand text-[32px] leading-none font-extrabold tracking-[-0.02em]">
              Every agent gets smarter
            </h1>
            <p className="mt-3 max-w-[60ch] text-[14px] text-muted">
              When one engineer corrects an agent, the lesson spreads to every agent at the company, so the same
              correction doesn&apos;t have to be given twice.
            </p>
          </div>
          {!metricsLive ? (
            <span
              className="mt-1 flex shrink-0 items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] text-accent"
              title="Switches automatically when GET /api/metrics returns the eval results"
            >
              <TriangleAlert className="size-3.5" /> Seed data, not results
            </span>
          ) : null}
        </div>

        <section className="mt-7 grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-6 rounded-xl border border-line bg-panel p-6">
          <div className="flex flex-col">
            <Label>The hive</Label>
            <p className="text-[13px] text-muted">
              {active.length} lessons every agent shares, {locked} locked at the core. {waiting} waiting for approval
              {blocked ? `, ${blocked} blocked` : ""}.
            </p>
            <Hive className="mt-3 h-[300px]" />
            <HiveLegend />
          </div>

          <div className="flex flex-col justify-center border-l border-line pl-6">
            <Label>Corrections per session</Label>
            <div className="flex items-baseline gap-3">
              <span className="font-condensed text-[56px] leading-none font-black tracking-[-0.02em] text-muted tabular-nums [font-stretch:75%]">
                {before.toFixed(1)}
              </span>
              <ArrowRight className="size-6 self-center text-muted" />
              <span className="font-condensed text-[56px] leading-none font-black tracking-[-0.02em] text-accent tabular-nums [font-stretch:75%]">
                {after.toFixed(1)}
              </span>
            </div>
            <p className="mt-2 text-[13px] text-muted">
              Average of the first five sessions against the last five, across {curve.length} sessions.
            </p>

            <dl className="mt-7 grid grid-cols-3 border-t border-line pt-5">
              <Stat label="Same mistake twice" value={`${Math.round(metrics.repeatMistakeRate * 100)}%`} />
              <Stat label="Lessons accepted" value={`${Math.round(metrics.acceptanceRate * 100)}%`} divided />
              <Stat label="Taught by one, used by another" value={`${metrics.transfer.length}`} divided />
            </dl>
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-line bg-panel p-6">
          <div className="mb-1 flex items-baseline justify-between">
            <Label className="mb-0">How many corrections each session needed</Label>
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              <span className="inline-block size-2 rounded-full bg-accent ring-2 ring-accent/25" /> a lesson was approved
            </span>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 34, right: 28, bottom: 6, left: -18 }}>
                <defs>
                  <linearGradient id="hm-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="session"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval={4}
                  tickFormatter={(s) => `Session ${s}`}
                />
                <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ stroke: "var(--border)" }}
                  contentStyle={{
                    background: "var(--elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                  labelFormatter={(s) => `Session ${s}`}
                  formatter={(v) => [`${v}`, "corrections"]}
                />
                <Area
                  type="monotone"
                  dataKey="corrections"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="url(#hm-area)"
                  dot={false}
                  activeDot={{ r: 3.5, fill: "var(--accent)", stroke: "var(--panel)" }}
                  isAnimationActive={false}
                />
                {approvals.map((a, i) => (
                  <ReferenceDot
                    key={a.session}
                    x={a.session}
                    y={a.corrections}
                    r={5}
                    fill="var(--accent)"
                    stroke="var(--panel)"
                    strokeWidth={2.5}
                    label={<DotLabel text={shortTitle(memoryBySlug(a.lessonApproved ?? "")?.title ?? a.lessonApproved ?? "")} below={i % 2 === 1} />}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="mt-6 grid grid-cols-5 gap-6">
          <section className="col-span-3 rounded-xl border border-line bg-panel p-6">
            <div className="flex items-baseline justify-between">
              <Label className="mb-0">Replay eval: Hivemind off against on</Label>
              {ev ? (
                <span className="text-[12px] text-muted">
                  {ev.tasks} tasks, {ev.runs} runs each, checked by code
                </span>
              ) : null}
            </div>
            {ev ? (
              <div className="mt-5 space-y-5">
                <BarPair
                  label="Rule violations per task"
                  off={ev.off.violationsPerTask}
                  on={ev.on.violationsPerTask}
                  max={Math.max(ev.off.violationsPerTask, ev.on.violationsPerTask, 0.01)}
                  fmt={(v) => v.toFixed(2)}
                  note="lower is better"
                />
                <BarPair
                  label="Tasks done with zero corrections"
                  off={ev.off.passRate}
                  on={ev.on.passRate}
                  max={1}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  note="higher is better"
                />
              </div>
            ) : (
              <p className="mt-3 text-muted">Eval results appear once the replay has run.</p>
            )}
          </section>

          <section className="col-span-2 rounded-xl border border-line bg-panel p-6">
            <Label>Taught by one, used by another</Label>
            <ul className="mt-1 space-y-4">
              {metrics.transfer.map((t, i) => {
                const from = people.find((p) => p.id === t.from);
                const to = people.find((p) => p.id === t.to);
                return (
                  <li key={i}>
                    <RichText text={`[[${t.lesson}]]`} className="text-[13px]" />
                    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
                      <Avatar person={from} id={t.from} className="size-4 text-[9px]" />
                      {from?.name.split(" ")[0] ?? t.from}
                      <ArrowRight className="size-3" />
                      <Avatar person={to} id={t.to} className="size-4 text-[9px]" />
                      {to?.name.split(" ")[0] ?? t.to}
                      <span className="ml-auto">{timeAgo(t.at)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Lesson name next to its approval dot, hand-written like a note on the chart, with a halo over the line. */
function DotLabel({ viewBox, text, below }: { viewBox?: { x: number; y: number; width: number; height: number }; text: string; below?: boolean }) {
  if (!viewBox) return null;
  const cx = viewBox.x + viewBox.width / 2;
  const y = below ? viewBox.y + viewBox.height + 17 : viewBox.y - 9;
  return (
    <text
      x={cx}
      y={y}
      textAnchor="middle"
      fontSize={13}
      fontWeight={600}
      style={{ fontFamily: "var(--font-shantell), 'Comic Sans MS', cursive", fontVariationSettings: "'INFM' 100, 'BNCE' 40" }}
      fill="var(--chip-person)"
      stroke="var(--panel)"
      strokeWidth={6}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

function shortTitle(t: string) {
  return t.length > 28 ? `${t.slice(0, 27).trimEnd()}…` : t;
}

function Stat({ label, value, divided }: { label: string; value: string; divided?: boolean }) {
  return (
    <div className={divided ? "border-l border-line pl-4" : "pr-4"}>
      <dd className="text-[22px] font-semibold tracking-[-0.01em] tabular-nums">{value}</dd>
      <dt className="mt-0.5 text-[12px] leading-snug text-muted">{label}</dt>
    </div>
  );
}

function BarPair({
  label,
  off,
  on,
  max,
  fmt,
  note,
}: {
  label: string;
  off: number;
  on: number;
  max: number;
  fmt: (v: number) => string;
  note: string;
}) {
  const rows = [
    { name: "Without Hivemind", v: off, color: "var(--muted)" },
    { name: "With Hivemind", v: on, color: "var(--accent)" },
  ];
  return (
    <div>
      <div className="mb-2 flex justify-between text-[12px]">
        <span className="text-fg/80">{label}</span>
        <span className="text-muted">{note}</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="mb-1.5 flex items-center gap-3">
          <span className="w-32 shrink-0 text-[12px] text-muted">{r.name}</span>
          <div className="h-5 flex-1 rounded bg-elevated">
            <div className="h-full rounded" style={{ width: `${Math.max((r.v / max) * 100, 1)}%`, background: r.color }} />
          </div>
          <span className="w-12 text-right text-[12px] tabular-nums">{fmt(r.v)}</span>
        </div>
      ))}
    </div>
  );
}
