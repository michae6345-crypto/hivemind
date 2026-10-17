"use client";

import { Approvals } from "./approvals";
import { Learning } from "./learning";
import { useRoute } from "./nav";
import { Vault } from "./vault";

/** Hosted preview only: one static page that shows the view named in the URL hash. */
export function PreviewRoot() {
  const route = useRoute();
  if (route === "/approvals") return <Approvals />;
  if (route === "/learning") return <Learning />;
  return <Vault />;
}
