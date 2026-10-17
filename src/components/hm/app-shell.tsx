"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { BookOpen, Inbox, LineChart, PenLine, Search } from "lucide-react";
import { Toaster } from "sonner";
import { MotionConfig, motion } from "motion/react";
import { ORG_NAME } from "@/mocks/data";
import { HivemindProvider, ROLE_USERS, useHivemind } from "./store";
import { Avatar, Kbd, Logo, Wordmark } from "./bits";
import { Palette } from "./palette";
import { NavLink, useRoute, type Route } from "./nav";
import { useNow } from "./use-now";
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
  const { memories, scopes, user, role, setRole, live, activity, people, setComposerOpen, setPaletteOpen } = useHivemind();
  const queue = memories.filter(
    (m) => (m.status === "pending" || m.status === "blocked") && canApprove(user, m, scopes),
  ).length;

  // Agents active in the last 10 minutes, from the live activity feed.
  const now = useNow();
  const working = useMemo(() => {
    const cutoff = now - 10 * 60_000;
    const seen = new Map<string, string>();
    for (const a of activity) {
      if (new Date(a.createdAt).getTime() >= cutoff && !seen.has(a.actor)) seen.set(a.actor, `${a.repo}/${a.file}`);
    }
    return Array.from(seen.entries());
  }, [activity, now]);

  const nav: { href: Route; label: string; icon: typeof BookOpen; badge?: number }[] = [
    { href: "/", label: "Vault", icon: BookOpen },
    { href: "/approvals", label: "Approvals", icon: Inbox, badge: queue },
    { href: "/learning", label: "Learning", icon: LineChart },
  ];

  const sources = [
    { name: "Lessons", on: live.core },
    { name: "Activity", on: live.activity },
    { name: "Metrics", on: live.metrics },
  ];
  const liveCount = sources.filter((s) => s.on).length;

  return (
    <header className="flex h-12 shrink-0 items-center gap-5 border-b border-line bg-panel px-4">
      <NavLink href="/" className="flex items-center gap-2.5">
        <Logo className="size-[22px]" intro />
        <Wordmark className="text-[17px]/none" />
        <span className="hidden text-[13px] text-muted lg:inline">{ORG_NAME}</span>
      </NavLink>

      <nav className="flex items-center gap-0.5">
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = route === href;
          return (
            <NavLink
              key={href}
              href={href}
              className={cn(
                "relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
                active ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              <Icon className="size-3.5" />
              {label}
              {badge ? (
                <motion.span
                  key={badge}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 700, damping: 18 }}
                  className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-fg px-1 text-[10px] font-semibold text-white"
                >
                  {badge}
                </motion.span>
              ) : null}
              {active ? (
                <motion.span
                  layoutId="hm-nav-underline"
                  className="absolute inset-x-2.5 -bottom-[9px] h-[2px] rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 520, damping: 40 }}
                />
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {working.length ? (
          <div
            className="hidden items-center gap-2 md:flex"
            title={working.map(([who, file]) => `${people.find((p) => p.id === who)?.name ?? who}: ${file}`).join("\n")}
          >
            <div className="flex -space-x-1">
              {working.slice(0, 4).map(([who]) => (
                <Avatar
                  key={who}
                  id={who}
                  person={people.find((p) => p.id === who)}
                  className="relative size-6 bg-elevated text-[9.5px] ring-2 ring-panel"
                />
              ))}
            </div>
            <span className="text-[12px] text-muted">
              {working.length} {working.length === 1 ? "agent" : "agents"} working
            </span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-8 items-center gap-2 rounded-md border border-line bg-bg px-2.5 text-[12px] text-muted transition-colors duration-150 hover:text-fg"
        >
          <Search className="size-3.5" />
          <span className="hidden lg:inline">Search</span>
          <Kbd>⌘K</Kbd>
        </button>

        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-bg px-2.5 text-[12px] text-fg transition-colors duration-150 hover:border-accent/50"
        >
          <PenLine className="size-3.5 text-accent" />
          <span className="hidden lg:inline">Write a rule</span>
        </button>

        <span
          className="flex items-center gap-1.5 text-[12px] text-muted"
          title={sources.map((s) => `${s.name}: ${s.on ? "live from the API" : "seed data"}`).join("\n")}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              liveCount === 3 ? "bg-ok" : liveCount > 0 ? "bg-ok/70" : "bg-accent",
            )}
          />
          {liveCount === 3 ? "Live" : liveCount > 0 ? `Live ${liveCount}/3` : "Seed data"}
        </span>

        <div className="flex h-8 items-center rounded-md border border-line bg-bg p-0.5" role="radiogroup" aria-label="View as">
          {ROLE_USERS.map((r) => (
            <button
              key={r.role}
              type="button"
              role="radio"
              aria-checked={role === r.role}
              onClick={() => setRole(r.role)}
              className={cn(
                "h-7 rounded px-2.5 text-[12px] transition-colors duration-150",
                role === r.role ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {user ? <Avatar person={user} id={user.id} className="size-7 text-[11px]" /> : null}
      </div>
    </header>
  );
}
