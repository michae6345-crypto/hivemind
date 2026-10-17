"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useSyncExternalStore, type ComponentProps } from "react";

/**
 * Navigation that also works in the hosted preview build (NEXT_PUBLIC_HM_PREVIEW=1): there the app is one static page
 * served from an unknown path, so the three views switch by URL hash (#/approvals) instead of by route.
 * Everywhere else these are plain Next.js routes.
 */
export const PREVIEW = process.env.NEXT_PUBLIC_HM_PREVIEW === "1";

/** The app lives under /app; the website is /. */
export type Route = "/app" | "/app/approvals" | "/app/results";

const toRoute = (path: string): Route =>
  path.includes("/approvals") ? "/app/approvals" : path.includes("/results") ? "/app/results" : "/app";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

function useHash() {
  return useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
}

export function useRoute(): Route {
  const pathname = usePathname();
  const hash = useHash();
  return PREVIEW ? toRoute(hash.replace(/^#/, "")) : toRoute(pathname);
}

export function useGo() {
  const router = useRouter();
  return useCallback(
    (to: Route) => {
      if (PREVIEW) window.location.hash = to === "/app" ? "" : to;
      else router.push(to);
    },
    [router],
  );
}

export function NavLink({ href, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: Route }) {
  if (PREVIEW) return <a href={href === "/app" ? "#" : `#${href}`} {...(rest as ComponentProps<"a">)} />;
  return <Link href={href} {...rest} />;
}
