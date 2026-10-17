"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Building2, GitBranch, Lock, MessageSquareQuote, User, Users, Workflow } from "lucide-react";
import { Logo } from "@/components/hm/bits";
import { cn } from "@/components/hm/utils";
import { memories, scopes } from "@/mocks/data";
import { Fit, Note } from "./notes";

// "How it's built": three zoom levels, switched like spacefs.com's desktop tabs.
//   1. The company: the scope tree (org → team → repo → you). Click a box to see what an agent there loads.
//   2. The loop: agents → hooks/MCP → the engine → memory → the context pack, back to every agent.
//   3. One lesson: a real seeded lesson, annotated part by part.
// Everything shown comes from src/mocks/data.ts (the demo company, Meridian Data) or docs/engine.md.

const EASE = [0.22, 1, 0.36, 1] as const;
const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" } as const;

const LEVELS = [
  { id: "company", label: "The company", icon: Building2 },
  { id: "loop", label: "The loop", icon: Workflow },
  { id: "lesson", label: "One lesson", icon: MessageSquareQuote },
] as const;
type Level = (typeof LEVELS)[number]["id"];

export function Structure() {
  const [level, setLevel] = useState<Level>("company");
  return (
    <div className="mx-auto max-w-[1120px]">
      <LayoutGroup id="structure-tabs">
        <div role="tablist" aria-label="Zoom level" className="hm-glass hm-glass-strong mx-auto flex w-fit gap-1 rounded-full p-1">
          {LEVELS.map((l, i) => {
            const on = level === l.id;
            const Icon = l.icon;
            return (
              <button
                key={l.id}
                role="tab"
                aria-selected={on}
                aria-controls={`level-${l.id}`}
                onClick={() => setLevel(l.id)}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-3 py-2 text-[13px] whitespace-nowrap transition-colors duration-200 sm:px-4 sm:text-[13.5px]",
                  on ? "text-fg" : "text-fg/55 hover:text-fg",
                )}
              >
                {on ? (
                  <motion.span
                    layoutId="structure-tab"
                    className="absolute inset-0 rounded-full bg-white shadow-[0_0_0_1px_rgba(14,15,18,.06),0_2px_8px_rgba(15,23,42,.08)]"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  />
                ) : null}
                <span className="relative hidden text-[11px] text-muted tabular-nums sm:inline" style={MONO}>
                  {i + 1}
                </span>
                <Icon className="relative size-4" />
                <span className="relative">{l.label}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <div className="hm-card relative mt-6 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ backgroundImage: "radial-gradient(circle, #d9dce2 1px, transparent 1.2px)", backgroundSize: "18px 18px" }}
          aria-hidden
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={level}
            id={`level-${level}`}
            role="tabpanel"
            initial={{ opacity: 0, scale: 0.985, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 1.01, filter: "blur(6px)" }}
            transition={{ duration: 0.45, ease: EASE }}
            className="relative px-4 py-8 sm:px-8"
          >
            {level === "company" ? <Company /> : level === "loop" ? <Loop /> : <OneLesson />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── 1. The company ───────────────────────────────────────────────────────────

const byId = Object.fromEntries(scopes.map((s) => [s.id, s]));
const handle = (id?: string | null) => (id ? `@${id}` : "");

/** org first, the scope itself last. */
function chainOf(id: string) {
  const out: string[] = [];
  for (let s: (typeof scopes)[number] | undefined = byId[id]; s; s = s.parentId ? byId[s.parentId] : undefined) out.unshift(s.id);
  return out;
}

const live = memories.filter((m) => m.status === "active");

/** What a session-start context pack holds for an agent in this scope: 🔒 first, then org → … → here. */
function packFor(id: string) {
  const chain = chainOf(id);
  return live
    .filter((m) => chain.includes(m.scopeId))
    .sort((a, b) => Number(b.locked) - Number(a.locked) || chain.indexOf(a.scopeId) - chain.indexOf(b.scopeId));
}

type Box = { id: string; x: number; y: number; w: number; h: number };
const BOXES: Box[] = [
  { id: "org", x: 520, y: 60, w: 236, h: 66 },
  { id: "team/data-pipelines", x: 300, y: 200, w: 184, h: 60 },
  { id: "team/evals", x: 640, y: 200, w: 184, h: 60 },
  { id: "team/expert-platform", x: 880, y: 200, w: 184, h: 60 },
  { id: "repo/export-service", x: 170, y: 336, w: 170, h: 56 },
  { id: "repo/dataset-builder", x: 430, y: 336, w: 170, h: 56 },
  { id: "repo/eval-harness", x: 640, y: 336, w: 170, h: 56 },
  { id: "repo/expert-portal", x: 880, y: 336, w: 170, h: 56 },
  { id: "personal/alex", x: 226, y: 456, w: 124, h: 40 },
  { id: "personal/noor", x: 374, y: 456, w: 124, h: 40 },
];
const boxOf = Object.fromEntries(BOXES.map((b) => [b.id, b]));

function Company() {
  const [sel, setSel] = useState("repo/export-service");
  const chain = chainOf(sel);
  const pack = packFor(sel);
  const scope = byId[sel];

  return (
    <div>
      <Fit w={1040} h={500}>
        <svg viewBox="0 0 1040 500" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {BOXES.filter((b) => byId[b.id].parentId).map((b) => {
            const p = boxOf[byId[b.id].parentId!];
            const top = b.y - b.h / 2;
            const bottom = p.y + p.h / 2;
            const mid = b.id.startsWith("personal/") ? top - 22 : (top + bottom) / 2;
            const d = `M${p.x} ${bottom} V${mid} H${b.x} V${top}`;
            const on = chain.includes(b.id);
            return (
              <g key={b.id}>
                <path d={d} fill="none" stroke="#d4d7dd" strokeWidth={1.3} strokeLinejoin="round" />
                {on ? <path d={d} fill="none" stroke="var(--honey)" strokeWidth={2.2} strokeLinejoin="round" className="hm-flow" /> : null}
              </g>
            );
          })}
        </svg>

        {BOXES.map((b) => (
          <ScopeBox key={b.id} box={b} on={chain.includes(b.id)} selected={sel === b.id} onPick={() => setSel(b.id)} />
        ))}

        <Note dir="left" className="absolute top-[26px] left-[648px]" width={230} delay={0.1}>
          @maya (Security) locks rules here. Nobody below can override them.
        </Note>
        <Note dir="right" className="absolute top-[150px] left-[8px]" width={150} delay={0.3}>
          @jordan approves lessons for the team and its repos
        </Note>
        <Note dir="up-right" className="absolute top-[372px] left-[40px]" width={84} delay={0.5}>
          click any box
        </Note>
        <Note dir="left" className="absolute top-[436px] left-[444px]" width={210} delay={0.7}>
          personal: only that engineer&apos;s agents see these
        </Note>
      </Fit>

      {/* The context pack for the picked scope */}
      <div className="mt-6 rounded-[14px] bg-window p-4 text-[12.5px] text-[var(--win-text)] sm:p-5" style={MONO}>
        <div className="flex flex-wrap items-center gap-x-2 text-[var(--win-honey)]">
          <Logo onDark className="size-3.5" />
          An agent in <span className="text-white">#{sel}</span> starts every session with {pack.length} rules
          <span className="text-[var(--win-muted)]">(🔒 first, then from {scope.level === "org" ? "the company" : "the company down to here"})</span>
        </div>
        <motion.ol layout className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          <AnimatePresence initial={false} mode="popLayout">
            {pack.map((m) => (
              <motion.li
                key={m.id}
                layout
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="flex min-w-0 items-baseline gap-2"
              >
                <span className={cn("shrink-0", m.locked ? "text-[var(--win-rose)]" : "text-[var(--win-honey)]")}>{m.locked ? "🔒" : "⬢"}</span>
                <span className="truncate">{m.title}</span>
                <span className="ml-auto shrink-0 text-[11px] text-[var(--win-muted)]">#{m.scopeId.split("/").pop()}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ol>
      </div>
    </div>
  );
}

const LEVEL_STYLE = {
  org: { icon: Building2, dot: "var(--chip-org)", label: "company" },
  team: { icon: Users, dot: "var(--chip-team)", label: "team" },
  repo: { icon: GitBranch, dot: "var(--chip-repo)", label: "repo" },
  personal: { icon: User, dot: "var(--chip-person)", label: "you" },
} as const;

function ScopeBox({ box, on, selected, onPick }: { box: Box; on: boolean; selected: boolean; onPick: () => void }) {
  const s = byId[box.id];
  const st = LEVEL_STYLE[s.level as keyof typeof LEVEL_STYLE];
  const here = live.filter((m) => m.scopeId === s.id);
  const locked = here.filter((m) => m.locked).length;
  const personal = s.level === "personal";
  const Icon = st.icon;
  return (
    <motion.button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      aria-label={`${s.name}, ${st.label}${s.owner ? `, owned by ${handle(s.owner)}` : ""}. Show what an agent here loads.`}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "absolute flex items-center gap-2.5 rounded-[14px] bg-white px-3 text-left transition-shadow duration-300",
        personal ? "rounded-full border border-dashed border-[#c9ccd3] px-3" : "shadow-[0_0_0_1px_var(--border),0_6px_18px_rgba(15,23,42,.06)]",
        on && !personal && "shadow-[0_0_0_1.5px_var(--honey),0_10px_24px_-6px_rgba(224,154,43,.35)]",
        on && personal && "border-solid border-[var(--honey)]",
        selected && "ring-4 ring-[color-mix(in_srgb,var(--honey)_22%,transparent)]",
      )}
      style={{ left: box.x - box.w / 2, top: box.y - box.h / 2, width: box.w, height: box.h }}
    >
      {personal ? (
        <span className="size-2 shrink-0 rounded-full" style={{ background: st.dot }} />
      ) : (
        <span
          className={cn("flex size-8 shrink-0 items-center justify-center rounded-[9px]", s.level === "org" ? "bg-fg text-white" : "bg-elevated")}
          style={s.level === "org" ? undefined : { color: st.dot }}
        >
          <Icon className="size-4" />
        </span>
      )}
      <span className="min-w-0 leading-tight">
        <span className={cn("block truncate font-medium", s.level === "org" ? "text-[15px]" : personal ? "text-[13px]" : "text-[14px]")}>
          {personal ? `just ${handle(s.owner)}` : s.name}
        </span>
        {personal ? null : (
          <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted">
            {st.label}
            {s.level !== "repo" ? <span>· {handle(s.owner)}</span> : null}
            {locked ? (
              <span className="flex items-center gap-0.5 text-lock">
                · <Lock className="size-3" />
                {locked}
              </span>
            ) : null}
            <span>· {here.length - locked} ⬢</span>
          </span>
        )}
      </span>
    </motion.button>
  );
}

// ── 2. The loop ──────────────────────────────────────────────────────────────

const AGENTS = ["Claude Code", "Cursor", "Gemini CLI", "Codex", "GitHub Copilot", "Windsurf"];
const STEPS = [
  { n: 1, t: "Filter", s: "no model" },
  { n: 2, t: "Extract", s: "a short rule" },
  { n: 3, t: "Check 🔒 + merge", s: "in parallel" },
  { n: 4, t: "A lead approves", s: "or rejects" },
];
const PATHS = {
  in: "M232 262 C 274 262, 282 252, 320 252",
  out: "M760 252 C 792 252, 812 252, 842 252",
  pack: "M920 372 C 920 470, 890 478, 760 478 L 300 478 C 160 478, 135 466, 135 424",
  live: "M135 98 C 135 44, 168 34, 300 34 L 760 34 C 892 34, 920 52, 920 126",
};

function Loop() {
  return (
    <Fit w={1040} h={510}>
      <svg viewBox="0 0 1040 510" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {Object.entries(PATHS).map(([k, d]) => (
          <path key={k} d={d} fill="none" stroke="var(--honey)" strokeOpacity={0.7} strokeWidth={1.8} strokeDasharray="5 5" className="hm-flow" />
        ))}
      </svg>
      {Object.entries(PATHS).map(([k, d], i) => (
        <span
          key={k}
          className="hm-travel absolute top-0 left-0 size-2.5 rounded-full bg-honey shadow-[0_0_0_3px_rgba(224,154,43,.25)]"
          style={{ offsetPath: `path('${d}')`, animationDelay: `${i * 0.7}s`, animationDuration: k === "pack" || k === "live" ? "4.2s" : "2.2s" }}
          aria-hidden
        />
      ))}

      {/* Your agents */}
      <div className="absolute top-[100px] left-[40px] w-[192px] rounded-[16px] bg-white p-3 shadow-[0_0_0_1px_var(--border),0_8px_24px_rgba(15,23,42,.06)]">
        <div className="px-1 pb-2 text-[12px] text-muted">Your agents, through their own hooks + MCP</div>
        <div className="flex flex-col gap-1.5">
          {AGENTS.map((a) => (
            <span key={a} className="flex items-center gap-2 rounded-[10px] bg-elevated px-2.5 py-1.5 text-[13px]">
              <span className="size-1.5 rounded-full bg-fg/40" />
              {a}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute top-[272px] left-[238px] text-[10.5px] leading-[1.35] whitespace-nowrap text-muted" style={MONO}>
        corrections
        <br />
        reviews
        <br />
        MCP proposals
      </div>

      {/* The engine */}
      <div className="absolute top-[168px] left-[320px] h-[168px] w-[440px] rounded-[20px] border-[1.5px] border-dashed border-[color-mix(in_srgb,var(--honey)_60%,transparent)] bg-[#fffaf1]/80 p-3">
        <div className="flex items-center gap-1.5 px-1 text-[12px] font-medium text-[#9a6413]">
          <Logo className="size-3.5" /> Hivemind engine
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2.5">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-[12px] bg-white p-2.5 shadow-[0_0_0_1px_var(--border)]">
              <span className="flex size-5 items-center justify-center rounded-full bg-fg text-[10.5px] font-semibold text-white">{s.n}</span>
              <div className="mt-1.5 text-[13px] leading-tight font-medium">{s.t}</div>
              <div className="text-[11px] text-muted">{s.s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Memory */}
      <div className="absolute top-[126px] left-[842px] w-[158px] rounded-[16px] bg-white p-3 shadow-[0_0_0_1px_var(--border),0_8px_24px_rgba(15,23,42,.06)]">
        <div className="px-1 pb-2 text-[12px] text-muted">Memory, by scope</div>
        {(["org", "team", "repo", "personal"] as const).map((lv, i) => {
          const st = LEVEL_STYLE[lv];
          return (
            <div key={lv} className="flex items-center gap-2 rounded-[9px] px-1.5 py-1.5 text-[13px]" style={{ marginLeft: i * 8 }}>
              <span className="size-2 rounded-full" style={{ background: st.dot }} />
              {lv === "org" ? (
                <>
                  company <Lock className="size-3 text-lock" />
                </>
              ) : (
                st.label
              )}
            </div>
          );
        })}
        <div className="mt-1 px-1.5 text-[11px] leading-snug text-muted">ranked by confidence; nothing is ever hard-deleted</div>
      </div>

      {/* Path labels */}
      <PathLabel className="top-[466px] left-[330px]">every session start: a context pack, 🔒 first, then ranked · ≤ 6k chars</PathLabel>
      <PathLabel className="top-[22px] left-[330px]">while working: ⚠️ who else edited this file · session end: confidence up or down</PathLabel>

      <Note dir="down-left" className="absolute top-[132px] left-[372px]" width={300} delay={0.1}>
        drops &ldquo;lgtm&rdquo;, bots, and one-offs like &ldquo;rename this&rdquo;
      </Note>
      <Note dir="up-right" className="absolute top-[344px] left-[340px]" width={236} delay={0.3} tone="rose">
        a model and a plain-code guard. either one can block it
      </Note>
      <Note dir="up-left" className="absolute top-[344px] left-[698px]" width={150} delay={0.5}>
        agents can only propose
      </Note>
    </Fit>
  );
}

function PathLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("absolute rounded-full bg-white px-3 py-1 text-[11.5px] text-fg/80 shadow-[0_0_0_1px_var(--border)]", className)} style={MONO}>
      {children}
    </span>
  );
}

// ── 3. One lesson ────────────────────────────────────────────────────────────

const LESSON = memories.find((m) => m.slug === "tag-lab-customer-id")!;
const RULE = memories.find((m) => m.slug === "sec-lab-isolation")!;

/** `code` spans in a lesson body, rendered as inline code. */
function Md({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") ? (
      <code key={i} className="rounded bg-elevated px-1 text-[12.5px]" style={MONO}>
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function OneLesson() {
  const ev = LESSON.evidence[0];
  const mean = LESSON.alpha / (LESSON.alpha + LESSON.beta);
  const body = LESSON.body.split("\n\n")[0];
  return (
    <Fit w={1040} h={500}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="absolute top-[24px] left-[330px] w-[380px] rounded-[18px] bg-white p-5 shadow-[0_0_0_1px_var(--border),0_24px_60px_-20px_rgba(15,23,42,.25)]"
      >
        <div className="flex items-center justify-between">
          <span className="hm-chip" data-kind="team">
            #{LESSON.scopeId}
          </span>
          <span className="rounded-full bg-ok/10 px-2.5 py-0.5 text-[12px] font-medium text-ok">Active</span>
        </div>
        <div className="mt-3 text-[18px] leading-snug font-semibold">{LESSON.title}</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg/75">
          <Md text={body} />
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lock/[0.07] px-2.5 py-1 text-[12px] text-lock">
          <Lock className="size-3" /> Related: {RULE.title}
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <div className="text-[11.5px] text-muted">Evidence</div>
          <blockquote className="mt-1.5 rounded-[10px] bg-elevated p-3 text-[13px] leading-snug">
            &ldquo;{ev.quote}&rdquo;
            <footer className="mt-1.5 text-[11.5px] text-muted">
              {handle(ev.actor)} · review comment · {ev.ref}
            </footer>
          </blockquote>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <div className="flex items-baseline justify-between text-[11.5px] text-muted">
            <span>Confidence</span>
            <span className="tabular-nums" style={MONO}>
              α {LESSON.alpha} · β {LESSON.beta} → {Math.round(mean * 100)}%
            </span>
          </div>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: LESSON.alpha + LESSON.beta }, (_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.5 + i * 0.07, type: "spring", stiffness: 500, damping: 22 }}
                className={cn("size-3 [clip-path:polygon(50%_0,93%_25%,93%_75%,50%_100%,7%_75%,7%_25%)]", i < LESSON.alpha ? "bg-honey" : "bg-[#cfd2d8]")}
              />
            ))}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${mean * 100}%` }}
              transition={{ delay: 0.4, duration: 1.1, ease: EASE }}
              className="h-full rounded-full bg-honey"
            />
          </div>
        </div>
      </motion.div>

      <Note dir="right" className="absolute top-[36px] left-[40px]" width={240} delay={0.2}>
        where it applies: this team and every repo under it
      </Note>
      <Note dir="right" className="absolute top-[82px] left-[80px]" width={200} delay={0.35}>
        one rule, in plain words
      </Note>
      <Note dir="right" className="absolute top-[274px] left-[60px]" width={220} delay={0.5}>
        who taught it, and where. this one came from a review comment
      </Note>
      <Note dir="left" className="absolute top-[36px] left-[716px]" width={270} delay={0.65}>
        a lead or Security made it active. agents can only propose
      </Note>
      <Note dir="left" className="absolute top-[180px] left-[716px]" width={230} delay={0.8} tone="rose">
        linked to @maya&apos;s 🔒 rule, never merged into it
      </Note>
      <Note dir="left" className="absolute top-[366px] left-[716px]" width={270} delay={0.95} tone="honey">
        honey counts for it, grey against (both start at 1). a session with no repeat correction adds honey; a correction against it adds grey
      </Note>
    </Fit>
  );
}
