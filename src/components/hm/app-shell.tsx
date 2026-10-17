"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { BookOpen, Inbox, LineChart } from "lucide-react";
import { Toaster } from "sonner";
import { ORG_NAME } from "@/mocks/data";
import { HivemindProvider, ROLE_USERS, useHivemind } from "./store";
import { Avatar, Logo } from "./bits";
import { canApprove, cn } from "./utils";

const subscribe = () => () => {};

/** Mock timestamps are computed at load, so render client-side only to avoid hydration drift. */
function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export function AppShell({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  return (
    <HivemindProvider>
      <div className="flex h-full flex-col">
        <Header />
        <main className="min-h-0 flex-1">{mounted ? children : null}</main>
      </div>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--elevated)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontSize: 13,
          },
        }}
      />
    </HivemindProvider>
  );
}

function Header() {
  const pathname = usePathname();
  const { memories, scopes, user, role, setRole, mode } = useHivemind();
  const queue = memories.filter(
    (m) => (m.status === "pending" || m.status === "blocked") && canApprove(user, m, scopes),
  ).length;

  const nav = [
    { href: "/", label: "Vault", icon: BookOpen },
    { href: "/approvals", label: "Approvals", icon: Inbox, badge: queue },
    { href: "/learning", label: "Learning", icon: LineChart },
  ];

  return (
    <header className="flex h-11 shrink-0 items-center gap-4 border-b border-line bg-panel px-3">
      <Link href="/" className="flex items-center gap-2">
        <Logo />
        <span className="text-[14px] font-semibold tracking-tight">Hivemind</span>
        <span className="text-muted">/</span>
        <span className="text-muted">{ORG_NAME}</span>
      </Link>

      <nav className="flex items-center gap-1">
        {nav.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
                active ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              <Icon className="size-3.5" />
              {label}
              {badge ? (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-black">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span
          className="flex items-center gap-1.5 text-[11px] text-muted"
          title={mode === "live" ? "Reading the Hivemind API" : "API not reachable; showing seed data"}
        >
          <span className={cn("size-1.5 rounded-full", mode === "live" ? "bg-ok" : "bg-accent")} />
          {mode === "live" ? "Live" : "Seed data"}
        </span>

        <div className="flex h-7 items-center rounded-md border border-line bg-bg p-0.5" role="radiogroup" aria-label="Role">
          {ROLE_USERS.map((r) => (
            <button
              key={r.role}
              type="button"
              role="radio"
              aria-checked={role === r.role}
              onClick={() => setRole(r.role)}
              className={cn(
                "h-6 rounded px-2 text-[12px] transition-colors duration-150",
                role === r.role ? "bg-elevated text-fg" : "text-muted hover:text-fg",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {user ? (
          <span className="flex items-center gap-2 text-[12px]">
            <Avatar person={user} id={user.id} />
            <span className="hidden text-muted xl:inline">{user.name}</span>
          </span>
        ) : null}
      </div>
    </header>
  );
}
