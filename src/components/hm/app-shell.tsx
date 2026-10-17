"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Toaster } from "sonner";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { HivemindProvider, ROLE_USERS, useHivemind } from "./store";
import { Logo, Wordmark } from "./bits";
import { Palette } from "./palette";
import { NavLink, useRoute, type Route } from "./nav";
import { canApprove, cn } from "./utils";

const Composer = dynamic(() => import("./composer").then((m) => m.Composer), { ssr: false });

const subscribe = () => () => {};

/** Seed timestamps are computed in the browser, so render client-side only to avoid hydration drift. */
function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function AppShell({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 420, damping: 36 }}>
    <HivemindProvider>
      <div className="flex h-full flex-col">
        <Header />
        <main className="min-h-0 flex-1">{mounted ? children : null}</main>
        <Footer />
      </div>
      {mounted ? (
        <>
          <Composer />
          <Palette />
          <GlobalKeys />
        </>
      ) : null}
      <Toaster
        theme="light"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-card)",
            color: "var(--text)",
            fontSize: 13,
          },
        }}
      />
    </HivemindProvider>
    </MotionConfig>
  );
}

function GlobalKeys() {
  const { setPaletteOpen, paletteOpen } = useHivemind();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);
  return null;
}

function Header() {
  const route = useRoute();
  const { memories, scopes, user } = useHivemind();
  const queue = memories.filter((m) => m.status === "pending" && canApprove(user, m, scopes)).length;

  const nav: { href: Route; label: string; badge?: number }[] = [
    { href: "/", label: "Lessons" },
    { href: "/approvals", label: "Approvals", badge: queue },
    { href: "/learning", label: "Results" },
  ];

  return (
    <header className="flex h-14 shrink-0 items-center gap-8 border-b border-line bg-panel px-5">
      <NavLink href="/" className="flex items-center gap-2.5">
        <Logo className="size-[22px]" intro />
        <Wordmark className="text-[19px]/none" />
      </NavLink>

      <nav className="flex h-full items-center gap-1">
        {nav.map(({ href, label, badge }) => {
          const active = route === href;
          return (
            <NavLink
              key={href}
              href={href}
              className={cn(
                "relative flex h-full items-center gap-1.5 px-3 text-[14px] transition-colors duration-150",
                active ? "font-medium text-fg" : "text-muted hover:text-fg",
              )}
            >
              {label}
              {badge ? (
                <motion.span
                  key={badge}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 700, damping: 18 }}
                  className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-fg px-1 text-[10.5px] font-semibold text-white tabular-nums"
                >
                  {badge}
                </motion.span>
              ) : null}
              {active ? (
                <motion.span
                  layoutId="hm-nav-underline"
                  className="absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                />
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="ml-auto">
        <ViewingAs />
      </div>
    </header>
  );
}

/** "Viewing as: Jordan (Lead) ▾": the three demo roles, so the chain of command can be shown live. */
function ViewingAs() {
  const { people, role, setRole, user } = useHivemind();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const first = (id: string) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? id;
  const current = ROLE_USERS.find((r) => r.role === role);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="hm-pill hm-glass hm-pill-glass h-9 px-3.5 text-[13px]"
      >
        <span className="text-muted">Viewing as:</span>
        <span>
          {user ? first(user.id) : ""} ({current?.label})
        </span>
        <ChevronDown className={cn("size-3.5 text-muted transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="hm-card absolute right-0 z-40 mt-2 w-64 origin-top-right p-1.5"
          >
            {ROLE_USERS.map((r) => {
              const p = people.find((x) => x.id === r.userId);
              return (
                <button
                  key={r.role}
                  type="button"
                  role="menuitemradio"
                  aria-checked={role === r.role}
                  onClick={() => {
                    setRole(r.role);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors duration-150 hover:bg-elevated"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">
                      {first(r.userId)} ({r.label})
                    </span>
                    <span className="block truncate text-[12px] text-muted">{p?.title}</span>
                  </span>
                  {role === r.role ? <Check className="size-4 text-accent" /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** The tiny status line: where the data comes from. */
function Footer() {
  const { live } = useHivemind();
  const on = [live.core, live.activity, live.metrics].filter(Boolean).length;
  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-panel px-5 text-[11.5px] text-muted">
      <span
        className="flex items-center gap-1.5"
        title={`Lessons: ${live.core ? "live" : "seed"} · Activity: ${live.activity ? "live" : "seed"} · Metrics: ${live.metrics ? "live" : "seed"}`}
      >
        <span className={cn("size-1.5 rounded-full", on === 3 ? "bg-ok" : on > 0 ? "bg-ok/60" : "bg-muted/50")} />
        {on === 3 ? "Live" : on > 0 ? `Live ${on}/3` : "Seed data"}
      </span>
    </footer>
  );
}
