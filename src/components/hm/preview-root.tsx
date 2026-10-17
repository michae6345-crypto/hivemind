"use client";

import { Approvals } from "./approvals";
import { Lessons } from "./lessons";
import { useRoute } from "./nav";
import { Results } from "./results";

/** Hosted preview only: one static page that shows the view named in the URL hash. */
export function PreviewRoot() {
  const route = useRoute();
  if (route === "/approvals") return <Approvals />;
  if (route === "/learning") return <Results />;
  return <Lessons />;
}
