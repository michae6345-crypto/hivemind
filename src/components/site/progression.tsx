"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { cn } from "@/components/hm/utils";
import { AgentsCard, CatchSnippet, CollideSnippet, FixSnippet, WhySnippet } from "./under-the-hood";

// "What happens while you work", as one afternoon in order. The moments alternate left and right along a honey line
// that draws itself down the page as you scroll; each moment lights its node and plays its terminal when the line
// reaches it. The terminals are the same ones the cards used (under-the-hood.tsx), with the same product strings.

const EASE = [0.22, 1, 0.36, 1] as const;
const MONO = { fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, var(--font-geist-mono), monospace' } as const;

type Moment = { time: string; who: string; title: string; body: ReactNode; snippet: ReactNode; wide?: boolean };

const MOMENTS: Moment[] = [
  {
    time: "2:04 pm",
    who: "Kevin's agent saves src/payouts.ts",
    title: "It catches a bad save in under a second",
    body: (
      <>
        <code className="text-fg">hivemind watch</code>, in the pane next to the agent, underlines the exact code that breaks a rule and
        offers the fix. <code className="text-fg">hivemind check --staged</code> does the same before a commit.
      </>
    ),
    snippet: <CatchSnippet />,
  },
  {
    time: "2:06 pm",
    who: "Kevin fixes it by hand",
    title: "His fix becomes a lesson",
    body: "Hivemind reads the diff, writes the lesson and sends it to Ben, his lead. Once Ben approves, every agent on the team follows it.",
    snippet: <FixSnippet />,
  },
  {
    time: "3:40 pm",
    who: "Emily asks her agent for something risky",
    title: "The agent says no, and she asks why",
    body: (
      <>
        It names the locked rule and offers a safe way to do it. <code className="text-fg">/hivemind why</code> lays out the rule&apos;s history:
        who set it, the incident behind it, and what it has blocked.
      </>
    ),
    snippet: <WhySnippet />,
    wide: true,
  },
  {
    time: "4:15 pm",
    who: "Two agents reach the same file",
    title: "It warns before the second one edits",
    body: "Whatever tool the other person uses, your agent hears who changed the file in the last 10 minutes.",
    snippet: <CollideSnippet />,
  },
];

export function Progression() {
  const box = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Where each moment's node sits, measured after layout and on resize, so the line passes through all of them.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      setSize({ w: b.width, h: b.height });
      setPts(
        nodeRefs.current.filter(Boolean).map((n) => {
          const r = n!.getBoundingClientRect();
          return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The line draws with scroll (eased by a spring, like the How it works scene).
  const { scrollYProgress } = useScroll({ target: box, offset: ["start 75%", "end 60%"] });
  const raw = useMotionValue(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => raw.set(v));
  const drawn = useSpring(raw, { stiffness: 120, damping: 30, mass: 0.6 });
  const [reached, setReached] = useState(-1);
  useMotionValueEvent(drawn, "change", (v) => {
    if (!pts.length || !size.h) return;
    const y = v * size.h;
    let n = -1;
    pts.forEach((p, i) => {
      if (y >= p.y - 8) n = i;
    });
    setReached((prev) => (prev === n ? prev : n));
  });

  // A smooth S between consecutive nodes.
  const d = pts.length
    ? pts.reduce((acc, p, i) => {
        if (i === 0) return `M${p.x} ${Math.max(0, p.y - 60)} L${p.x} ${p.y}`;
        const a = pts[i - 1];
        const my = (a.y + p.y) / 2;
        return `${acc} C${a.x} ${my}, ${p.x} ${my}, ${p.x} ${p.y}`;
      }, "")
    : "";

  return (
    <div ref={box} className="relative mx-auto max-w-[1120px]">
      {/* the line: a faint track, and the honey line that draws over it */}
      {d ? (
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={size.w} height={size.h} aria-hidden>
          <path d={d} fill="none" stroke="var(--border)" strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
          <motion.path d={d} fill="none" stroke="var(--honey)" strokeWidth={2.5} strokeLinecap="round" style={{ pathLength: drawn }} />
        </svg>
      ) : null}

      <ol className="relative flex flex-col gap-14 lg:gap-20">
        {MOMENTS.map((m, i) => (
          <MomentRow key={m.title} m={m} i={i} lit={reached >= i} nodeRef={(el) => (nodeRefs.current[i] = el)} />
        ))}
        <li className="relative flex flex-col pl-12 lg:items-center lg:pl-0">
          <Node lit={reached >= MOMENTS.length} nodeRef={(el) => (nodeRefs.current[MOMENTS.length] = el)} className="absolute top-6 left-0 lg:relative lg:top-0" />
          <div className="w-full max-w-[560px] lg:mt-6">
            <AgentsCard />
          </div>
        </li>
      </ol>
    </div>
  );
}

function Node({ lit, nodeRef, className }: { lit: boolean; nodeRef: (el: HTMLSpanElement | null) => void; className?: string }) {
  return (
    <span ref={nodeRef} className={cn("relative z-10 flex size-7 items-center justify-center", className)}>
      <svg viewBox="-14 -14 28 28" className="size-7 overflow-visible" aria-hidden>
        <motion.path
          d="M0-11L9.53-5.5L9.53 5.5L0 11L-9.53 5.5L-9.53-5.5Z"
          initial={false}
          animate={{ fill: lit ? "#e09a2b" : "#ffffff", stroke: lit ? "#e09a2b" : "#d4d7dd", scale: lit ? [1, 1.3, 1] : 1 }}
          transition={{ duration: 0.5, ease: EASE }}
          strokeWidth={1.6}
        />
        {lit ? (
          <motion.path
            d="M0-11L9.53-5.5L9.53 5.5L0 11L-9.53 5.5L-9.53-5.5Z"
            fill="none"
            stroke="#e09a2b"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
          />
        ) : null}
      </svg>
    </span>
  );
}

function MomentRow({ m, i, lit, nodeRef }: { m: Moment; i: number; lit: boolean; nodeRef: (el: HTMLSpanElement | null) => void }) {
  const right = i % 2 === 1;
  if (m.wide) {
    return (
      <li className="relative flex flex-col pl-12 lg:items-center lg:pl-0">
        <Node lit={lit} nodeRef={nodeRef} className="absolute top-6 left-0 lg:relative lg:top-0" />
        <motion.article
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="hm-card w-full overflow-hidden lg:mt-6 lg:grid lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)]"
        >
          <Copy m={m} className="p-6 lg:p-8" />
          <Snip wide>{m.snippet}</Snip>
        </motion.article>
      </li>
    );
  }
  return (
    <li className="relative grid items-start gap-4 pl-12 lg:grid-cols-2 lg:gap-16 lg:pl-0">
      {/* the node: at the left edge on phones, on the card's inner edge on wide screens */}
      <Node
        lit={lit}
        nodeRef={nodeRef}
        className={cn("absolute top-6 left-0", right ? "lg:left-[calc(50%+16px)]" : "lg:left-[calc(50%-44px)]")}
      />
      <motion.article
        initial={{ opacity: 0, x: right ? 32 : -32 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.75, ease: EASE }}
        whileHover={{ y: -3 }}
        className={cn("hm-card flex flex-col overflow-hidden", right && "lg:col-start-2")}
      >
        <Copy m={m} className="p-6 pb-5" />
        <Snip>{m.snippet}</Snip>
      </motion.article>
    </li>
  );
}

function Copy({ m, className }: { m: Moment; className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-[12px]" style={MONO}>
        <span className="rounded-full bg-honey/15 px-2 py-0.5 font-medium text-[#9a6413] tabular-nums">{m.time}</span>
        <span className="text-muted">{m.who}</span>
      </div>
      <h3 className="mt-3 font-brand text-[22px] leading-tight font-medium tracking-[-0.02em]">{m.title}</h3>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{m.body}</p>
    </div>
  );
}

function Snip({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={cn("mt-auto overflow-x-auto bg-[#1c1c1e] text-[12.5px] leading-[1.6] text-[#e4e4e7]", wide ? "px-5 py-5 lg:px-6" : "min-h-[140px] px-5 py-4")}
      style={MONO}
    >
      {children}
    </div>
  );
}
