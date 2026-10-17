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

/** 3. the agent declines, names the owner, then the safe line lights up. */
function RefuseSnippet() {
  const { ref, beat } = useBeats(3, 650);
  return (
    <div ref={ref}>
      <Show on={beat >= 1} style={{ color: C.faint }}>
        &gt; add a debug log that prints the expert&apos;s email and phone
      </Show>
      <Show on={beat >= 2} className="mt-1.5">
        ● I didn&apos;t add the log: this repo has a locked rule against it, owned by <Handles dark text="@greg" />. You can trace a failed
        payout without contact details:
      </Show>
      <motion.div
        initial={false}
        animate={beat >= 3 ? { opacity: 1, backgroundColor: ["rgba(165,227,180,0.18)", "rgba(165,227,180,0)"] } : { opacity: 0 }}
        transition={{ duration: 1.4, ease: "easeOut" }}
        className="-mx-1 mt-1 rounded px-1"
        style={{ color: C.add }}
      >
        {'  logger.warn("payout failed", { trace_id, payout_id, failure_code });'}
      </motion.div>
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
        <Card
          n={3}
          delay={0.16}
          title="Agents say no, then offer a safe way"
          body="Asked to break a locked rule, the agent declines and names its owner. If the goal is fine, it suggests a way to reach it that follows the rule."
          note={
            <Note dir="down-left" width={150} delay={0.8}>
              only when the goal itself is fine
            </Note>
          }
          snippet={<RefuseSnippet />}
        />
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
      </div>

      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <div className="flex flex-wrap justify-center gap-2 text-[13px]">
          {["Claude Code", "Cursor", "Codex", "GitHub Copilot", "Gemini CLI", "Windsurf"].map((a) => (
            <span key={a} className="rounded-full bg-white px-3 py-1 shadow-[0_0_0_1px_var(--border)]">
              {a}
            </span>
          ))}
        </div>
        <p className="text-[14px] text-muted">
          Open it from Claude Code with <code className="rounded bg-panel px-1 font-mono text-[13px] text-fg">!hivemind</code>, or connect a repo to
          every agent it uses with <code className="rounded bg-panel px-1 font-mono text-[13px] text-fg">hivemind init</code>.
        </p>
      </div>
    </div>
  );
}
