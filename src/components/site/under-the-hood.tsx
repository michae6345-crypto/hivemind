"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Handles } from "@/components/hm/handles";

// "Under the hood": four still cards, one idea each, a few terminal lines with the one that matters lit.
// Strings follow the product (Michael's 17 Oct 09:22 UTC email; src/lib/engine/pipeline.ts; record.ts).

const EASE = [0.22, 1, 0.36, 1] as const;
const MONO = { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, var(--font-geist-mono), monospace' } as const;

const C = {
  text: "#e4e4e7",
  muted: "#a1a1aa",
  faint: "#71717a",
  locked: "#ff9592",
  lesson: "#f5c26b",
  ok: "#3dd68c",
  add: "#a5e3b4",
  del: "#ff9592",
};

function Card({ n, title, body, children, delay }: { n: number; title: string; body: ReactNode; children: ReactNode; delay: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className="hm-card flex flex-col overflow-hidden"
    >
      <div className="p-6 pb-5">
        <div className="font-mono text-[11.5px] text-muted tabular-nums">0{n}</div>
        <h3 className="mt-1.5 font-brand text-[21px] leading-tight font-medium tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{body}</p>
      </div>
      <div className="mt-auto bg-[#1c1c1e] px-5 py-4 text-[12.5px] leading-[1.55] text-[#e4e4e7]" style={MONO}>
        {children}
      </div>
    </motion.article>
  );
}

/** A dim line, or a lit one: only the line that makes the point is at full strength. */
const L = ({ children, lit, color }: { children: ReactNode; lit?: boolean; color?: string }) => (
  <div className="break-words whitespace-pre-wrap" style={{ color: color ?? (lit ? C.text : C.faint) }}>
    {children}
  </div>
);

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
        >
          <L color={C.locked}>BREAKS A LOCKED RULE · #org</L>
          <L lit>Never log expert personal info</L>
          <L>{" 2 │ "}<span style={{ color: C.text }}>console.log(&quot;sent&quot;, expert.email);</span></L>
          <L color={C.locked}>{"   │                     ~~~~~~~~~~~~ personal info"}</L>
          <L>
            <span style={{ color: "#91a7ff" }}>f</span> fix: log the expert id instead
          </L>
        </Card>

        <Card
          n={2}
          delay={0.08}
          title="It learns from fixes, too"
          body="Not only when you correct an agent. When you fix what an agent wrote, Hivemind turns the diff into a lesson for your lead."
        >
          <L color={C.del}>- console.log(user.email);</L>
          <L color={C.add}>+ logger.info(&quot;sent&quot;, {"{ expertId }"});</L>
          <div className="mt-2" style={{ color: C.lesson }}>
            <Handles dark text={'Hivemind · Lesson captured from @kevin\'s fix in src/welcome.ts:2: "Log the expert id, not their email". Waiting on @ben.'} />
          </div>
        </Card>

        <Card
          n={3}
          delay={0.16}
          title="Agents say no, then offer a safe way"
          body="Asked to break a locked rule, the agent declines and names its owner. If the goal is fine, it suggests a way to reach it that follows the rule."
        >
          <L>&gt; add a debug log that prints the expert&apos;s email and phone</L>
          <div className="mt-1.5" style={{ color: C.text }}>
            ● I didn&apos;t add the log: this repo has a locked rule against it, owned by <Handles dark text="@greg" />. You can trace a failed
            payout without contact details:
          </div>
          <L color={C.add}>{'  logger.warn("payout failed", { trace_id, payout_id, failure_code });'}</L>
        </Card>

        <Card
          n={4}
          delay={0.24}
          title="It warns when two agents touch one file"
          body="Whatever tool the other person uses, your agent hears who edited the file in the last 10 minutes before it changes anything."
        >
          <L>● Update(src/export.ts)</L>
          <div className="mt-1" style={{ color: C.lesson }}>
            <Handles dark text="Hivemind · Heads up: @kevin's Cursor agent edited src/export.ts 2 min ago." />
          </div>
        </Card>
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
