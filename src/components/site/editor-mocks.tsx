"use client";

import { Check, Lightbulb, Lock, MessageSquare, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { Logo } from "@/components/hm/bits";
import { cn } from "@/components/hm/utils";
import { LESSON, LOCKED_RULE, SCENES } from "./demo-script";

// VS Code, boards 1–4 of the design canvas, drawn as dark windows on the light page.
// Every string follows public/brand/vscode/wording.md, which Michael's extension (vscode-extension/) reads too.

const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" } as const;

function WindowChrome({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] bg-window text-[12.5px] text-[var(--win-text)] shadow-[0_0_0_1px_rgba(0,0,0,.5),0_24px_60px_-16px_rgba(15,23,42,.4)]",
        className,
      )}
    >
      <div className="relative flex h-8 items-center bg-[#2a2a2c] px-3">
        <span className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="absolute inset-x-0 text-center text-[12px] text-[var(--win-muted)]">{title}</span>
      </div>
      {children}
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex h-6 items-center gap-3 bg-[#2a2a2c] px-3 text-[11px] text-[var(--win-muted)]">
      <span>main</span>
      <span className="ml-auto flex items-center gap-1.5 text-[var(--win-text)]">
        <Logo onDark className="size-3" /> Hivemind: {SCENES[0].rules} rules, 1 waiting
      </span>
      <span>TypeScript</span>
    </div>
  );
}

/** Boards 1–2: CodeLens, ghost text from Alex's lesson, and a locked-rule squiggle with its Quick Fix. */
export function EditorMock({ className }: { className?: string }) {
  const n = (i: number) => <span className="inline-block w-7 pr-3 text-right text-[#5a5a60] select-none">{i}</span>;
  return (
    <WindowChrome title="export.ts — export-service" className={className}>
      <div className="flex h-8 items-end gap-px bg-[#232325] px-2 text-[12px]">
        <span className="rounded-t-md bg-window px-3 py-1.5 text-[var(--win-text)]">export.ts</span>
        <span className="px-3 py-1.5 text-[var(--win-muted)]">fixtures.test.ts</span>
      </div>
      <div className="relative py-3 pl-2 leading-[1.75]" style={MONO}>
        <div>{n(12)}<span className="text-[#c586c0]">import</span> {"{ assertSingleCustomer }"} <span className="text-[#c586c0]">from</span> <span className="text-[#ce9178]">&quot;./tenancy&quot;</span>;</div>
        <div>{n(13)}</div>
        <div className="pl-7 font-sans text-[11px] text-[var(--win-muted)]">
          <span className="text-[var(--win-rose)]">1 locked rule</span> · <span className="text-[var(--win-honey)]">2 team lessons apply</span>
        </div>
        <div>{n(14)}<span className="text-[#c586c0]">export function</span> <span className="text-[#dcdcaa]">writeJsonExport</span>(rows: <span className="text-[#4ec9b0]">Row</span>[], path: <span className="text-[#4ec9b0]">string</span>) {"{"}</div>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="relative"
        >
          {n(15)}
          <span className="text-[#6b6b72] italic">  assertSingleCustomer(rows);</span>
          <span className="ml-3 rounded bg-[#f5a5241f] px-1.5 py-px font-sans text-[11px] text-[var(--win-honey)]">Hivemind · from Alex&apos;s lesson</span>
        </motion.div>
        <div>{n(16)}  fs.<span className="text-[#dcdcaa]">writeFileSync</span>(path, JSON.<span className="text-[#dcdcaa]">stringify</span>(rows));</div>
        <div>{n(17)}{"}"}</div>
        <div>{n(18)}</div>
        <div>
          {n(19)}<span className="text-[#c586c0]">const</span> fixtures = [...
          <span className="underline decoration-[var(--win-rose)] decoration-wavy decoration-from-font underline-offset-4">labA.rows, ...labB.rows</span>];
        </div>
        <div className="relative mt-2 mr-4 ml-10 max-w-[440px] rounded-md border border-white/10 bg-[#252527] p-3 font-sans text-[12px] shadow-xl">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-[var(--win-rose)]" />
            <span>
              Breaks a locked rule: {LOCKED_RULE}. <span className="text-[var(--win-muted)]">Locked by Maya, Head of Security.</span>
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-2 text-[var(--win-honey)]">
            <span className="flex items-center gap-1"><Lightbulb className="size-3.5" /> Fix: build Lab B fixtures from synthetic rows</span>
          </div>
        </div>
      </div>
      <StatusBar />
    </WindowChrome>
  );
}

/**
 * Boards 3–4: the agent checks the hive in VS Code chat, and the lead approves in chat.
 * DRAFT UI for the MCP App card (VS Code layer B). Michael wires the real one (src/app/api/mcp, MCP Apps): this is the
 * design to match, and the strings are final unless wording.md changes.
 */
export function ChatMock({ className }: { className?: string }) {
  return (
    <WindowChrome title="Chat — export-service" className={className}>
      <div className="space-y-3 p-4">
        <div className="ml-auto max-w-[85%] rounded-xl bg-[#2f2f33] px-3 py-2">
          Add a JSON export for Lab A&apos;s quarterly report in src/export.ts
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--win-muted)]" style={MONO}>
          <Check className="size-3.5 text-[var(--win-teal)]" />
          Ran <span className="text-[var(--win-text)]">search_memory</span> · hivemind (MCP)
        </div>
        <McpCheckCard />
        <div className="text-[12.5px] leading-relaxed">
          I&apos;ll call <code className="rounded bg-white/10 px-1" style={MONO}>assertSingleCustomer(rows)</code> before writing, as
          Alex&apos;s lesson says.
        </div>
        <McpApproveCard />
      </div>
      <div className="mx-4 mb-4 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-[var(--win-muted)]">
        <MessageSquare className="size-3.5" /> Ask the agent…
      </div>
    </WindowChrome>
  );
}

/** MCP App card 1: what the hive says about this task. */
export function McpCheckCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#202022]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[12px]">
        <Logo onDark className="size-3.5" />
        <span className="font-semibold">Hivemind</span>
        <span className="text-[var(--win-muted)]">· 1 locked rule, 2 team lessons apply</span>
        <Search className="ml-auto size-3.5 text-[var(--win-muted)]" />
      </div>
      <ul className="divide-y divide-white/[0.06] text-[12.5px]">
        <li className="flex items-start gap-2.5 px-3 py-2">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-[var(--win-rose)]" />
          <span>
            {LOCKED_RULE}
            <span className="block text-[11.5px] text-[var(--win-muted)]">Locked by Maya · #org</span>
          </span>
        </li>
        <li className="flex items-start gap-2.5 px-3 py-2">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-[var(--win-honey)]" />
          <span>
            {LESSON}
            <span className="block text-[11.5px] text-[var(--win-muted)]">From Alex&apos;s lesson · approved by Jordan · #repo/export-service</span>
          </span>
        </li>
        <li className="flex items-start gap-2.5 px-3 py-2">
          <span className="mt-1 size-2 shrink-0 rounded-full bg-[var(--win-honey)]" />
          <span>
            Tag every row with lab_customer_id
            <span className="block text-[11.5px] text-[var(--win-muted)]">From Jordan&apos;s review · #team/data-pipelines</span>
          </span>
        </li>
      </ul>
    </div>
  );
}

/** MCP App card 2: a lead approves a proposed lesson without leaving the editor. */
export function McpApproveCard() {
  return (
    <div className="rounded-xl border border-[#f5a52440] bg-[#f5a5240d] p-3">
      <div className="flex items-center gap-2 text-[12px] text-[var(--win-honey)]">
        <Logo onDark className="size-3.5" /> Teach Hivemind: lesson proposed for #repo/export-service
      </div>
      <p className="mt-1.5 text-[13px]">“Build test fixtures from synthetic rows, one lab at a time.”</p>
      <p className="mt-1 text-[11.5px] text-[var(--win-muted)]">Waiting on @jordan.</p>
      <div className="mt-2.5 flex gap-1.5">
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--win-text)] px-3 text-[12px] font-medium text-window">
          <Check className="size-3.5" /> Approve
        </span>
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-white/10 px-3 text-[12px]">
          <X className="size-3.5" /> Reject
        </span>
      </div>
    </div>
  );
}
