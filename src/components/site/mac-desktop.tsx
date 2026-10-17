"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShieldX } from "lucide-react";
import { Logo } from "@/components/hm/bits";
import { cn } from "@/components/hm/utils";
import { Terminal } from "./terminal";
import { SCENES, type Step } from "./demo-script";
import { Handles } from "@/components/hm/handles";

type Note = Extract<Step, { kind: "notify" }>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The money shot: a rounded macOS "desktop" (soft gradient wallpaper, translucent menu bar) with a dark Terminal
 * running Claude Code + Hivemind, notifications sliding in on the right, and a fake cursor that clicks Approve.
 */
export function MacDesktop({ className }: { className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const approveRef = useRef<HTMLButtonElement | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [rules, setRules] = useState(SCENES[0].rules);
  const [cursor, setCursor] = useState({ x: 0, y: 0, show: false, click: false });
  const [pressed, setPressed] = useState(false);

  const onNotify = useCallback((n: Note) => {
    setNotes((ns) => {
      const rest = ns.filter((x) => x.id !== n.id);
      return [n, ...rest].slice(0, 3);
    });
    if (n.id === "lesson" && !n.action) setRules((r) => r + 1);
  }, []);

  const onCursor = useCallback(async (): Promise<void> => {
    const b = box.current?.getBoundingClientRect();
    const t = approveRef.current?.getBoundingClientRect();
    if (!b || !t) {
      await sleep(600);
      return;
    }
    // Enter from the lower middle of the screen, glide to the button, click.
    setCursor({ x: b.width * 0.55, y: b.height * 0.78, show: true, click: false });
    await sleep(80);
    setCursor({ x: t.left - b.left + t.width * 0.45, y: t.top - b.top + t.height * 0.55, show: true, click: false });
    await sleep(1150);
    setCursor((c) => ({ ...c, click: true }));
    setPressed(true);
    await sleep(260);
    setCursor((c) => ({ ...c, click: false }));
    setPressed(false);
    await sleep(150);
    setTimeout(() => setCursor((c) => ({ ...c, show: false })), 900);
  }, []);

  const onScene = useCallback((_: unknown, i: number) => {
    if (i === 0) {
      setNotes([]);
      setRules(SCENES[0].rules);
    }
  }, []);

  return (
    <div
      ref={box}
      className={cn("relative overflow-hidden rounded-[22px] select-none", className)}
      style={{
        background:
          "radial-gradient(120% 90% at 0% 0%, #c9d8f5 0%, rgba(201,216,245,0) 55%), radial-gradient(110% 90% at 100% 100%, #f8d9c4 0%, rgba(248,217,196,0) 60%), linear-gradient(135deg, #dbe5f7 0%, #ece7f1 50%, #f7e3d6 100%)",
      }}
    >
      {/* Menu bar */}
      <div className="flex h-7 items-center gap-4 bg-white/45 px-4 text-[12px] text-fg/85 backdrop-blur-md">
        <Logo className="size-3.5" />
        <span className="font-semibold">Terminal</span>
        <span className="hidden gap-4 sm:flex">
          <span>Shell</span>
          <span>Edit</span>
          <span>View</span>
          <span>Window</span>
          <span>Help</span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 tabular-nums">
          <svg viewBox="-8 -8 16 16" className="size-3" aria-hidden>
            <path d="M0-6.5L5.63-3.25L5.63 3.25L0 6.5L-5.63 3.25L-5.63-3.25Z" fill="var(--honey)" />
          </svg>
          <motion.span key={rules} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            {rules} rules
          </motion.span>
        </span>
        <span className="hidden tabular-nums sm:inline">Sat 9:41 AM</span>
      </div>

      <div className="relative px-4 pt-6 pb-8 sm:px-10 sm:pt-10 sm:pb-12">
        <Terminal
          className="relative z-10 max-w-[760px]"
          onNotify={onNotify}
          onCursor={onCursor}
          onScene={onScene}
          height={400}
        />
      </div>

      {/* Notifications, top right */}
      <div className="pointer-events-none absolute top-10 right-4 z-20 flex w-[min(340px,70%)] flex-col gap-2 sm:right-5">
        <AnimatePresence initial={false}>
          {notes.map((n) => (
            <motion.div
              key={n.id + (n.action ? "-ask" : "")}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="pointer-events-auto rounded-[16px] bg-white/80 p-3 shadow-[0_0_0_1px_rgba(14,15,18,.06),0_12px_30px_-8px_rgba(15,23,42,.25)] backdrop-blur-xl"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-fg",
                    n.tone === "rose" && "bg-[#2b1416]",
                  )}
                >
                  {n.tone === "rose" ? <ShieldX className="size-4 text-[var(--win-rose)]" /> : <Logo onDark className="size-4.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[12.5px] font-semibold"><Handles text={n.title} /></span>
                    <span className="shrink-0 text-[11px] text-muted">now</span>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-fg/75"><Handles text={n.body} /></p>
                  {n.action ? (
                    <div className="mt-2 flex gap-1.5">
                      <button
                        ref={approveRef}
                        type="button"
                        tabIndex={-1}
                        className={cn(
                          "hm-pill hm-pill-primary h-7 px-3 text-[12px] transition-transform duration-150",
                          pressed && "scale-95",
                        )}
                      >
                        {n.action}
                      </button>
                      <button type="button" tabIndex={-1} className="hm-pill hm-glass hm-pill-glass h-7 px-3 text-[12px]">
                        Reject
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* The simulated mouse cursor */}
      <motion.svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-0 left-0 z-30 size-6 drop-shadow-[0_2px_3px_rgba(0,0,0,.3)]"
        initial={false}
        animate={{ x: cursor.x, y: cursor.y, opacity: cursor.show ? 1 : 0, scale: cursor.click ? 0.82 : 1 }}
        transition={{
          x: { duration: 1.05, ease: [0.22, 1, 0.36, 1] },
          y: { duration: 1.05, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: 0.25 },
          scale: { duration: 0.12 },
        }}
        aria-hidden
      >
        <path d="M4 2.5v17.2l4.6-4.4 2.9 6.6 2.7-1.2-2.9-6.5h6.4L4 2.5Z" fill="#0e0f12" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </motion.svg>
    </div>
  );
}
