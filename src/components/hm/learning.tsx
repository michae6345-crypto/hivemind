"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowRightLeft, TriangleAlert } from "lucide-react";
import { useHivemind } from "./store";
import { Avatar } from "./bits";
import { RichText } from "./rich-text";
import { timeAgo } from "./utils";

export function Learning() {
  const { metrics, metricsLive, memoryBySlug, people } = useHivemind();
  const curve = metrics.curve;
  const head = curve.slice(0, 5);
  const tail = curve.slice(-5);
  const avg = (xs: typeof curve) => (xs.length ? xs.reduce((s, x) => s + x.corrections, 0) / xs.length : 0);
  const before = avg(head);
  const after = avg(tail);
  const approvals = curve.filter((c) => c.lessonApproved);
  const ev = metrics.eval;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-8 py-7">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Every agent gets smarter</h1>
            <p className="mt-1 text-muted">
              Corrections engineers had to give per session, as approved lessons spread to every agent.
            </p>
          </div>
          {!metricsLive ? (
            <span
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[12px] text-accent"
              title="Replaced automatically when GET /api/metrics returns eval/results.json"
            >
              <TriangleAlert className="size-3.5" /> Seed data, not results
            </span>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-4 gap-3">
          <Stat
            label="Corrections per session"
            value={`${before.toFixed(1)} → ${after.toFixed(1)}`}
            sub={`first 5 vs last 5 of ${curve.length} sessions`}
            accent
          />
          <Stat label="Repeat-mistake rate" value={`${Math.round(metrics.repeatMistakeRate * 100)}%`} sub="same correction given twice" />
          <Stat label="Lessons accepted" value={`${Math.round(metrics.acceptanceRate * 100)}%`} sub="approved by the scope owner" />
          <Stat label="Cross-user transfers" value={`${metrics.transfer.length}`} sub="taught by one, used by another" />
        </div>

        <div className="mt-4 rounded-lg border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between text-[12px] text-muted">
            <span>Corrections per session</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-px bg-muted" /> lesson approved
            </span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={curve} margin={{ top: 28, right: 24, bottom: 4, left: -16 }}>
                <defs>
                  <linearGradient id="hm-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
                <XAxis
                  dataKey="session"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  label={{ value: "session", position: "insideBottomRight", offset: -2, fill: "var(--muted)", fontSize: 11 }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
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
                {approvals.map((a) => (
                  <ReferenceLine
                    key={a.session}
                    x={a.session}
                    stroke="var(--muted)"
                    strokeDasharray="3 3"
                    label={{
                      value: shortTitle(memoryBySlug(a.lessonApproved ?? "")?.title ?? a.lessonApproved ?? ""),
                      position: "top",
                      fill: "var(--muted)",
                      fontSize: 11,
                    }}
                  />
                ))}
                <Area
                  type="monotone"
                  dataKey="corrections"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  fill="url(#hm-area)"
                  dot={false}
                  activeDot={{ r: 3, fill: "var(--accent)" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-4">
          <div className="col-span-3 rounded-lg border border-line bg-panel p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Replay eval: memory off vs on</h2>
              {ev ? (
                <span className="text-[12px] text-muted">
                  n = {ev.tasks} tasks × {ev.runs} runs, code-checked
                </span>
              ) : null}
            </div>
            {ev ? (
              <div className="mt-4 space-y-4">
                <BarPair label="Rule violations per task" off={ev.off.violationsPerTask} on={ev.on.violationsPerTask} max={Math.max(ev.off.violationsPerTask, ev.on.violationsPerTask, 0.01)} fmt={(v) => v.toFixed(2)} lowerIsBetter />
                <BarPair label="Tasks passed with zero corrections" off={ev.off.passRate} on={ev.on.passRate} max={1} fmt={(v) => `${Math.round(v * 100)}%`} />
              </div>
            ) : (
              <p className="mt-3 text-muted">Eval results appear here once eval/results.json exists.</p>
            )}
          </div>

          <div className="col-span-2 rounded-lg border border-line bg-panel p-4">
            <h2 className="font-semibold">Taught once, used by someone else</h2>
            <ul className="mt-3 space-y-3">
              {metrics.transfer.map((t, i) => {
                const from = people.find((p) => p.id === t.from);
                const to = people.find((p) => p.id === t.to);
                return (
                  <li key={i} className="text-[13px]">
                    <RichText text={`[[${t.lesson}]]`} />
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                      <Avatar person={from} id={t.from} className="size-4 text-[9px]" />
                      {from?.name.split(" ")[0] ?? t.from}
                      <ArrowRightLeft className="size-3" />
                      <Avatar person={to} id={t.to} className="size-4 text-[9px]" />
                      {to?.name.split(" ")[0] ?? t.to}
                      <span className="ml-auto">{timeAgo(t.at)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function shortTitle(t: string) {
  return t.length > 24 ? `${t.slice(0, 23).trimEnd()}…` : t;
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`mt-1 text-[24px] font-semibold tracking-tight tabular-nums ${accent ? "text-accent" : ""}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{sub}</div>
    </div>
  );
}

function BarPair({
  label,
  off,
  on,
  max,
  fmt,
  lowerIsBetter,
}: {
  label: string;
  off: number;
  on: number;
  max: number;
  fmt: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const rows = [
    { name: "Memory off", v: off, color: "var(--muted)" },
    { name: "Hivemind on", v: on, color: "var(--accent)" },
  ];
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[12px] text-muted">
        <span>{label}</span>
        <span>{lowerIsBetter ? "lower is better" : "higher is better"}</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className="mb-1.5 flex items-center gap-3">
          <span className="w-24 shrink-0 text-[12px] text-muted">{r.name}</span>
          <div className="h-5 flex-1 rounded bg-elevated">
            <div className="h-full rounded" style={{ width: `${Math.max((r.v / max) * 100, 1)}%`, background: r.color, opacity: 0.9 }} />
          </div>
          <span className="w-12 text-right font-mono text-[12px] tabular-nums">{fmt(r.v)}</span>
        </div>
      ))}
    </div>
  );
}
