"use client";

import { Approvals } from "./approvals";
import { Lessons } from "./lessons";
import { useRoute } from "./nav";
import { Results } from "./results";

/** Hosted preview only: one static page that shows the view named in the URL hash. */
export function PreviewRoot() {
  const route = useRoute();
  if (route === "/app/approvals") return <Approvals />;
  if (route === "/app/results") return <Results />;
  return <Lessons />;
}
