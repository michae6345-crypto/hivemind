"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "motion/react";
import { cn } from "@/components/hm/utils";
import { HIVE, LOCKED_RULE, REPO } from "./demo-script";
import { Note } from "./notes";

const EASE = [0.22, 1, 0.36, 1] as const;
const MONO = { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" } as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plays `steps` once when the element is half on screen; returns how many have played. */
function useBeats(steps: number, gap: number, start = 300) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let alive = true;
    (async () => {
      await sleep(start);
      for (let i = 1; i <= steps && alive; i++) {
        setN(i);
        await sleep(gap);
      }
    })();
    return () => {
      alive = false;
    };
  }, [inView, steps, gap, start]);
  return { ref, n };
}

function Win({ title, who, children, className }: { title: string; who: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-2 flex items-center gap-2 text-[13px] text-muted">{who}</div>
      <div className="flex-1 overflow-hidden rounded-[14px] bg-window text-[12.5px] leading-[1.7] text-[var(--win-text)] shadow-[0_0_0_1px_rgba(0,0,0,.5),0_24px_60px_-18px_rgba(15,23,42,.4)]">
        <div className="relative flex h-8 items-center bg-[#2a2a2c] px-3">
          <span className="flex gap-1.5">
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </span>
          <span className="absolute inset-x-0 text-center text-[12px] text-[var(--win-muted)]">{title}</span>
        </div>
        <div className="p-4" style={MONO}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Line({ show, children, className }: { show: boolean; children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={false}
      animate={show ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 4, filter: "blur(4px)" }}
      transition={{ duration: 0.45, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Who({ name, tool }: { name: string; tool: string }) {
  return (
    <>
      <span className="flex size-6 items-center justify-center rounded-full bg-fg text-[11px] font-semibold text-white">{name[0].toUpperCase()}</span>
      <span className="font-medium text-fg">@{name}</span>
      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] shadow-[0_0_0_1px_var(--border)]">{tool}</span>
    </>
  );
}

/** Two engineers' agents in one file: Kevin's Cursor agent edits it, Emily's Claude Code is told before it edits too. */
export function WhileWorking() {
  const { ref, n } = useBeats(5, 650);
  return (
    <div ref={ref} className="relative mx-auto grid max-w-[1120px] gap-6 lg:grid-cols-[1fr_1.15fr]">
      <Win title={`export.ts — ${REPO}`} who={<Who name="kevin" tool="Cursor" />}>
        <div className="text-[var(--win-muted)]">12 import {"{ assertSingleCustomer }"} from &quot;./tenancy&quot;;</div>
        <motion.div
          initial={false}
          animate={{ backgroundColor: n >= 1 ? "rgba(94,234,212,.12)" : "rgba(94,234,212,0)" }}
          transition={{ duration: 0.5 }}
          className="-mx-1 rounded px-1"
        >
          <span className="text-[var(--win-muted)]">14 </span>
          export function <span className="text-[var(--win-teal)]">{n >= 1 ? "writeLabCsv" : "writeCsvExport"}</span>(rows: Row[], path: string) {"{"}
        </motion.div>
        <div className="text-[var(--win-muted)]">15 &nbsp; assertSingleCustomer(rows);</div>
        <div className="text-[var(--win-muted)]">16 &nbsp; fs.writeFileSync(path, toCsv(rows));</div>
        <div className="text-[var(--win-muted)]">17 {"}"}</div>
        <Line show={n >= 1} className="mt-3 rounded-[8px] bg-white/[0.05] px-3 py-1.5 text-[var(--win-muted)]">
          Agent: renamed writeCsvExport to writeLabCsv
        </Line>
      </Win>

      <Win title={`emily — claude — ${REPO}`} who={<Who name="emily" tool="Claude Code" />}>
        <div className="rounded-[8px] bg-white/[0.04] px-3 py-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]">
          <span className="text-[var(--win-muted)]">&gt; </span>add a header row to the lab CSV export
        </div>
        <Line show={n >= 2} className="mt-2">
          <span className="text-[var(--win-teal)]">●</span> <span className="font-semibold">Update</span>(src/export.ts)
        </Line>
        <Line show={n >= 3} className="mt-2">
          <motion.div
            initial={false}
            animate={n >= 3 ? { x: [0, -4, 4, -2, 0] } : {}}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="rounded-[8px] bg-[#f5a5241a] px-3 py-1.5 text-[var(--win-honey)] shadow-[inset_2px_0_0_var(--win-honey)]"
          >
            {HIVE.collision("kevin", "Cursor", "export.ts", 0)}
          </motion.div>
        </Line>
        <Line show={n >= 4} className="mt-1.5 rounded-[8px] bg-[#fb71851a] px-3 py-1.5 text-[var(--win-rose)] shadow-[inset_2px_0_0_var(--win-rose)]">
          🔒 Hivemind rule for export.ts: {LOCKED_RULE} (#org).
        </Line>
        <Line show={n >= 5} className="mt-2 text-[var(--win-text)]">
          @kevin just renamed the export function, so I&apos;ll add the header in writeLabCsv() and keep the customer check.
        </Line>
      </Win>

      <Note dir="down-left" className="absolute -top-12 left-[130px] hidden lg:flex" width={170} delay={0.2}>
        whichever tool it ran in
      </Note>
      <Note dir="up-left" className="absolute -bottom-14 left-[52%] hidden lg:flex" width={250} delay={1.6} tone="honey">
        anyone else&apos;s agent in this file in the last 10 minutes
      </Note>
      <Note dir="up" className="absolute right-[2%] -bottom-[86px] hidden lg:flex" width={200} delay={2.2} tone="rose">
        first touch of a file: the 🔒 rules that mention it
      </Note>
    </div>
  );
}

const INIT_ROWS = [
  ["Claude Code", ".claude", ".mcp.json", "SessionStart hook"],
  ["Cursor", ".cursor", ".cursor/mcp.json", ".cursor/rules/hivemind.mdc"],
  ["Gemini CLI", "GEMINI.md", ".gemini/settings.json", "GEMINI.md"],
  ["Codex CLI", "AGENTS.md", ".codex/config.toml", "AGENTS.md"],
  ["GitHub Copilot", ".vscode", ".vscode/mcp.json", ".github/copilot-instructions.md"],
  ["Windsurf", ".windsurf", ".windsurf/mcp_config.hivemind.example.json", ".windsurf/rules/hivemind.md"],
];

/** `hivemind init` in a repo, mirroring cli/hivemind.mjs's table (agents found by their files in the repo). */
export function InitMock() {
  const { ref, n } = useBeats(INIT_ROWS.length + 2, 230, 200);
  return (
    <div ref={ref} className="overflow-hidden rounded-[14px] bg-window text-[12.5px] leading-[1.75] text-[var(--win-text)] shadow-[0_0_0_1px_rgba(0,0,0,.5),0_24px_60px_-18px_rgba(15,23,42,.4)]">
      <div className="relative flex h-8 items-center bg-[#2a2a2c] px-3">
        <span className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="absolute inset-x-0 text-center text-[12px] text-[var(--win-muted)]">~/{REPO} — zsh</span>
      </div>
      <div className="overflow-x-auto p-4" style={MONO}>
        <div>
          <span className="text-[var(--win-teal)]">~/{REPO}</span> $ hivemind init
        </div>
        <Line show={n >= 1}>
          <span className="text-[var(--win-honey)]">⬢</span> <span className="font-semibold">hivemind</span>{" "}
          <span className="text-[var(--win-muted)]">init</span>
        </Line>
        <table className="mt-1 w-full min-w-[720px] text-left">
          <thead className="text-[var(--win-muted)]">
            <tr>
              <th className="pr-6 font-normal">Agent</th>
              <th className="pr-6 font-normal">Detected via</th>
              <th className="pr-6 font-normal">MCP / hooks config</th>
              <th className="font-normal">Rules file</th>
            </tr>
          </thead>
          <tbody>
            {INIT_ROWS.map(([a, via, cfg, rules], i) => (
              <motion.tr
                key={a}
                initial={false}
                animate={n >= i + 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <td className="pr-6 whitespace-nowrap">
                  <span className="text-[#4ade80]">✓</span> <span className="font-semibold">{a}</span>
                </td>
                <td className="pr-6 text-[var(--win-muted)]">{via}</td>
                <td className="pr-6">
                  <span className="text-[#4ade80]">created</span> {cfg}
                </td>
                <td>{rules}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
        <Line show={n >= INIT_ROWS.length + 2} className="mt-1">
          <span className="text-[var(--win-muted)]">·</span> <span className="text-[#4ade80]">created</span> .hivemind.json
        </Line>
      </div>
    </div>
  );
}

/** `hivemind check`, as in cli/README.md: a 🔒 violation as a code frame, with its owner and the quick fix. */
export function CheckMock() {
  const { ref, n } = useBeats(4, 420, 200);
  const g = "text-[var(--win-muted)]";
  return (
    <div ref={ref} className="overflow-hidden rounded-[14px] bg-window text-[12.5px] leading-[1.7] text-[var(--win-text)] shadow-[0_0_0_1px_rgba(0,0,0,.5),0_24px_60px_-18px_rgba(15,23,42,.4)]">
      <div className="relative flex h-8 items-center bg-[#2a2a2c] px-3">
        <span className="flex gap-1.5">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="absolute inset-x-0 text-center text-[12px] text-[var(--win-muted)]">~/{REPO} — pre-commit</span>
      </div>
      <div className="overflow-x-auto p-4 whitespace-pre" style={MONO}>
        <div>
          <span className="text-[var(--win-teal)]">~/{REPO}</span> $ hivemind check demo/violations.ts
        </div>
        <Line show={n >= 1} className="text-[var(--win-rose)]">🔒 locked rule: {LOCKED_RULE}</Line>
        <Line show={n >= 2}>
          <div className={g}>{"   ╭─[demo/violations.ts:8:23]"}</div>
          <div className={g}>{"   │"}</div>
          <div>
            <span className={g}>{" 7 │ "}</span>
            {"/** Quarterly payout report across our two biggest lab customers. */"}
          </div>
          <div>
            <span className={g}>{" 8 │ "}</span>export async function exportQuarterlyReport(quarter: string): Promise&lt;string&gt; {"{"}
          </div>
          <div>
            <span className={g}>{"   │ "}</span>
            <span className="text-[var(--win-rose)]">{"                      ~~~~~~~~~~~~~~~~~~~~~ breaks a 🔒 locked rule"}</span>
          </div>
          <div>
            <span className={g}>{" 9 │ "}</span>
            {'  const labA = await rowsForCustomer("lab-a");'}
          </div>
          <div className={g}>{"   │"}</div>
          <div>
            <span className={g}>{"   ├─ owner  "}</span>@greg · Head of Security
          </div>
          <div>
            <span className={g}>{"   ╰─ fix    "}</span>add assertSingleCustomer(rows)
          </div>
          <div className="text-[#4ade80]">{"12 │ +   assertSingleCustomer(rows);"}</div>
        </Line>
        <Line show={n >= 3} className={g}>
          …
        </Line>
        <Line show={n >= 4}>
          <span className="text-[var(--win-honey)]">⬢</span> Hivemind: 1 🔒 locked rule broken · 2 lessons · run with --fix to apply 2 quick fixes
        </Line>
      </div>
    </div>
  );
}
