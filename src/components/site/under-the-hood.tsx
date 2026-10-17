"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Handles } from "@/components/hm/handles";
import { Note } from "./notes";

// "What it does while you work": four cards, one idea each. Each card's terminal lines play once when the card comes
// on screen (an underline draws, a bad line is struck out and its fix types in, a warning slides in), and one
// hand-drawn note says the one thing to notice. Strings follow the product (Michael's 17 Oct 09:22 UTC email;
// src/lib/engine/pipeline.ts; src/app/api/activity/record.ts).

const EASE = [0.22, 1, 0.36, 1] as const;
const MONO = { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, var(--font-geist-mono), monospace' } as const;

const C = {
  text: "#e4e4e7",
  muted: "#a1a1aa",
  faint: "#71717a",
  locked: "#ff9592",
  lesson: "#f5c26b",
  add: "#a5e3b4",
  del: "#ff9592",
  key: "#91a7ff",
};

/** Counts beats 0..n once the element is half on screen; reduced motion jumps to the end. */
function useBeats(n: number, gap = 420, start = 250) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.55 });
  const reduce = useReducedMotion();
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const timers = Array.from({ length: n }, (_, i) => setTimeout(() => setBeat(i + 1), reduce ? 0 : start + i * gap));
    return () => timers.forEach(clearTimeout);
  }, [inView, n, gap, start, reduce]);
  return { ref, beat };
}

/** A line that fades up when its beat arrives. */
function Show({ on, children, className, style }: { on: boolean; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <motion.div
      initial={false}
      animate={on ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 4, filter: "blur(3px)" }}
      transition={{ duration: 0.4, ease: EASE }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

function Card({
  n,
  title,
  body,
  note,
  snippet,
  delay,
}: {
  n: number;
  title: string;
  body: ReactNode;
  note: ReactNode;
  snippet: ReactNode;
  delay: number;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      whileHover={{ y: -3 }}
      className="hm-card flex flex-col overflow-hidden"
    >
      <div className="p-6 pb-8">
        <div className="font-mono text-[11.5px] text-muted tabular-nums">0{n}</div>
        <h3 className="mt-1.5 font-brand text-[21px] leading-tight font-medium tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted lg:max-w-[36ch]">{body}</p>
      </div>
      <div className="relative mt-auto">
        {/* the one thing to notice, written over the seam between the text and the terminal */}
        <div className="absolute right-5 bottom-full z-10 hidden translate-y-[3px] lg:block">{note}</div>
        <div className="min-h-[150px] overflow-x-auto bg-[#1c1c1e] px-5 py-4 text-[12.5px] leading-[1.6] text-[#e4e4e7]" style={MONO}>
          {snippet}
        </div>
      </div>
    </motion.article>
  );
}

/** 1. watch flags the save: the line, then the ~~~~ draws under the exact expression, then the fix. */
function CatchSnippet() {
  const { ref, beat } = useBeats(4);
  return (
    <div ref={ref}>
      <Show on={beat >= 1} style={{ color: C.locked }}>
        BREAKS A LOCKED RULE · #org
      </Show>
      <Show on={beat >= 1}>Never log expert personal info</Show>
      <Show on={beat >= 1} className="mt-1 whitespace-pre">
        <span style={{ color: C.faint }}>{" 2 │ "}</span>console.log(&quot;sent&quot;, <span className="relative">expert.email</span>);
      </Show>
      <div className="flex whitespace-pre" style={{ color: C.locked }}>
        <span style={{ color: C.faint }}>{"   │ "}</span>
        <span>{" ".repeat(20)}</span>
        <motion.span
          initial={false}
          animate={{ clipPath: beat >= 2 ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
          transition={{ duration: 0.55, ease: [0.65, 0, 0.35, 1] }}
        >
          ~~~~~~~~~~~~
        </motion.span>
        <motion.span initial={false} animate={{ opacity: beat >= 3 ? 1 : 0 }} transition={{ duration: 0.3 }}>
          {" personal info"}
        </motion.span>
      </div>
      <Show on={beat >= 4}>
        <span style={{ color: C.key }}>f</span> <span style={{ color: C.faint }}>fix: log the expert id instead</span>
      </Show>
    </div>
  );
}

/** 2. a fix becomes a lesson: the bad line is struck out, the new one types in, then Hivemind's line. */
function FixSnippet() {
  const { ref, beat } = useBeats(3, 600);
  const typed = 'logger.info("sent", { expertId });';
  const [chars, setChars] = useState(0);
  useEffect(() => {
    if (beat < 2) return;
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setChars(Math.min(typed.length, i));
      if (i >= typed.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [beat, typed.length]);
  return (
    <div ref={ref}>
      <Show on={beat >= 1} style={{ color: C.del }}>
        <span className="relative">
          - console.log(user.email);
          <motion.span
            className="absolute top-1/2 left-0 h-px bg-current"
            initial={false}
            animate={{ width: beat >= 1 ? "100%" : "0%" }}
            transition={{ duration: 0.5, delay: 0.35, ease: [0.65, 0, 0.35, 1] }}
          />
        </span>
      </Show>
      <div className="min-h-[1.6em]" style={{ color: C.add }}>
        {beat >= 2 ? `+ ${typed.slice(0, chars)}` : ""}
      </div>
      <Show on={beat >= 3} className="mt-2" style={{ color: C.lesson }}>
        <Handles dark text={'Hivemind · Lesson captured from @kevin\'s fix in src/welcome.ts:2: "Log the expert id, not their email". Waiting on @ben.'} />
      </Show>
    </div>
  );
}

/** 4. the agent starts an edit; the heads-up slides in with a honey flash. */
function CollideSnippet() {
  const { ref, beat } = useBeats(2, 700);
  return (
    <div ref={ref}>
      <Show on={beat >= 1} style={{ color: C.faint }}>
        ● Update(src/export.ts)
      </Show>
      <motion.div
        initial={false}
        animate={
          beat >= 2
            ? { opacity: 1, x: 0, backgroundColor: ["rgba(245,165,36,0.22)", "rgba(245,165,36,0.06)"] }
            : { opacity: 0, x: -10 }
        }
        transition={{ duration: 0.9, ease: EASE }}
        className="-mx-1.5 mt-1.5 rounded px-1.5 py-0.5 shadow-[inset_2px_0_0_#f5a524]"
        style={{ color: C.lesson }}
      >
        <Handles dark text="Hivemind · Heads up: @kevin's Cursor agent edited src/export.ts 2 min ago." />
      </motion.div>
    </div>
  );
}

/**
 * `hivemind why`, as in Michael's real run (docs/pitch/img/terminal/why/08-claude-code-block-then-why.png): the request,
 * the 4-line block reply that ends on the cue, `/hivemind why`, and the rule's history unrolling under it. The
 * proposal's author is the site's cast (@emily) instead of prod's @omar.
 */
function WhySnippet() {
  const { ref, beat } = useBeats(13, 330, 300);
  const dim = { color: C.faint };
  const at = (n: number) => beat >= n;
  return (
    <div ref={ref} className="leading-[1.65]">
      <Show on={at(1)} style={dim}>
        &gt; Log the expert&apos;s email when a payout fails so I can debug it.
      </Show>
      <Show on={at(2)} className="mt-2">
        ● <span className="font-bold">Blocked by Hivemind</span> · LOCKED RULE &quot;Never log expert personal info&quot; · <Handles dark text="@greg" />
      </Show>
      <Show on={at(2)} className="pl-3.5">
        Expert emails live only in the <span style={{ color: C.key }}>pii</span> schema, so they can&apos;t be written to the payout handler&apos;s logs.
      </Show>
      <Show on={at(2)} className="pl-3.5">
        Instead: log the hashed expert id with the trace fields …{" "}
        <span style={{ color: C.key }}>{'logger.info("payout failed", { trace_id, tenant_id, job_id, expert: hmacExpertId(expertId) })'}</span>
      </Show>
      <Show on={at(3)} className="pl-3.5">
        Run <span style={{ color: C.lesson }}>/hivemind why</span> for the history.
      </Show>
      <Show on={at(4)} className="mt-2">
        <span style={dim}>&gt;</span> /hivemind why
      </Show>
      <div className="mt-1 pl-3.5">
        <Show on={at(5)}>
          <span style={dim}>⎿ </span>
          <span style={{ color: "#f5a524" }}>⬢</span> <span className="font-bold">Hivemind</span> <span style={dim}>· why</span>
        </Show>
        <div className="pl-5">
          <Show on={at(6)}>
            <span className="font-bold" style={{ color: C.locked }}>LOCKED RULE</span> · <Handles dark text="#org" />
          </Show>
          <Show on={at(7)} className="font-bold">
            Never log expert personal info
          </Show>
          <Show on={at(8)}>
            <span style={dim}>Set by</span> <Handles dark text="@greg" /> <span style={dim}>· Head of Security · 16 Sep ·</span>{" "}
            <span style={{ color: C.key }}>Incident INC-27</span>
          </Show>
          <Show on={at(9)} className="pl-3">
            &quot;A stack trace with an expert&apos;s email reached our error tracker. Never again.&quot;
          </Show>
          <Show on={at(10)}>
            <span style={dim}>In context</span> every agent in <Handles dark text="#repo/export-service" /> at session start{" "}
            <span style={dim}>· seen today: Claude Code</span>
          </Show>
          <Show on={at(11)}>
            <span style={dim}>Reinforced 23× · 1 evidence · always applies ·</span> <span style={{ color: C.locked }}>blocked 1 proposal</span>
          </Show>
          <Show on={at(12)} className="pl-3" style={dim}>
            ╰ latest: &quot;Log the expert&apos;s email when a payout fails&quot; from <Handles dark text="@emily" /> 1h ago
          </Show>
          <Show on={at(13)}>
            <span style={dim}>Only</span> <Handles dark text="@greg" /> <span style={dim}>can change this rule ·</span>{" "}
            <span style={{ color: C.key }}>open in Hivemind</span>
          </Show>
        </div>
      </div>
    </div>
  );
}

/** The wide card: the explanation on the left, the run on the right. */
function WhyCard() {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, ease: EASE }}
      className="hm-card overflow-hidden md:col-span-2 lg:grid lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)]"
    >
      <div className="relative p-6 lg:p-8">
        <div className="font-mono text-[11.5px] text-muted tabular-nums">03</div>
        <h3 className="mt-1.5 font-brand text-[24px] leading-tight font-medium tracking-[-0.02em]">Blocked? Ask why.</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          The agent says what it can&apos;t do and what to do instead. Then <code className="text-fg">/hivemind why</code> lays out the rule&apos;s
          history: who set it, the incident behind it, how often it&apos;s been reinforced, and what it has blocked.
        </p>
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          Also <code className="text-fg">hivemind why &lt;file&gt;:&lt;line&gt;</code> in any terminal, or <code className="text-fg">w</code> in{" "}
          <code className="text-fg">hivemind watch</code>.
        </p>
        <div className="mt-6 hidden lg:block">
          <Note dir="right" width={190} tone="honey" delay={1.2}>
            the reason, not just the rule
          </Note>
        </div>
      </div>
      <div className="overflow-x-auto bg-[#1c1c1e] px-5 py-5 text-[12.5px] text-[#e4e4e7] lg:px-6" style={MONO}>
        <WhySnippet />
      </div>
    </motion.article>
  );
}

/** Which agents it works with, and how to start: a small card instead of a loose strip. */
function AgentsCard() {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}
      whileHover={{ y: -3 }}
      className="hm-card flex flex-col p-6"
    >
      <div className="font-mono text-[11.5px] text-muted tabular-nums">05</div>
      <h3 className="mt-1.5 font-brand text-[21px] leading-tight font-medium tracking-[-0.02em]">It works with the agents you already use</h3>
      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        {["Claude Code", "Cursor", "Codex", "GitHub Copilot", "Gemini CLI", "Windsurf"].map((a, i) => (
          <motion.span
            key={a}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 + i * 0.07, type: "spring", stiffness: 420, damping: 22 }}
            className="rounded-full bg-bg px-3 py-1 shadow-[0_0_0_1px_var(--border)]"
          >
            {a}
          </motion.span>
        ))}
      </div>
      <p className="mt-auto pt-5 text-[14px] leading-relaxed text-muted">
        <code className="rounded bg-panel px-1 font-mono text-[13px] text-fg">hivemind init</code> connects a repo to all of them.{" "}
        <code className="rounded bg-panel px-1 font-mono text-[13px] text-fg">!hivemind</code> opens watch next to Claude Code.
      </p>
    </motion.article>
  );
}

export function UnderTheHood() {
  return (
    <div className="mx-auto max-w-[1120px]">
      <div className="grid gap-5 md:grid-cols-2">
        <Card
          n={1}
          delay={0}
          title="It catches a bad save in under a second"
          body={
            <>
              <code className="text-fg">hivemind watch</code> checks every file you or an agent saves, underlines the exact code and offers the fix.{" "}
              <code className="text-fg">hivemind check --staged</code> does the same before a commit.
            </>
          }
          note={
            <Note dir="down-left" width={120} tone="rose" delay={0.6}>
              ~0.6s after the save
            </Note>
          }
          snippet={<CatchSnippet />}
        />
        <Card
          n={2}
          delay={0.08}
          title="It learns from fixes, too"
          body="Not only when you correct an agent. When you fix what an agent wrote, Hivemind turns the diff into a lesson for your lead."
          note={
            <Note dir="down-left" width={130} tone="honey" delay={0.7}>
              your fix is the lesson
            </Note>
          }
          snippet={<FixSnippet />}
        />
        <WhyCard />
        <Card
          n={4}
          delay={0.24}
          title="It warns when two agents touch one file"
          body="Whatever tool the other person uses, your agent hears who edited the file in the last 10 minutes before it changes anything."
          note={
            <Note dir="down-left" width={130} tone="honey" delay={0.9}>
              Cursor, Codex, Claude: any of them
            </Note>
          }
          snippet={<CollideSnippet />}
        />
        <AgentsCard />
      </div>

    </div>
  );
}
