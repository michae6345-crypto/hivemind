import type { VsRule } from "./types";

// Display wording for the editor. No emoji anywhere (Michael, Oct 17): plain tokens like #org, #repo/export-service,
// @maya, and words like "locked" / "lesson".

/** Strip emoji/pictographs (rule bodies can contain a lock glyph) and squeeze spaces. */
export const plain = (s: string) => s.replace(/\p{Extended_Pictographic}️?/gu, "").replace(/[ \t]{2,}/g, " ").trim();

/** "@alex" from a handle, a person id, or an old-style display name. */
export const at = (who: string) => (!who ? "someone" : who.startsWith("@") || /^an? /i.test(who) ? who : `@${who.toLowerCase()}`);

/** "just now" · "5 min ago" · "3h ago" · "2d ago". */
export function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** "Set by @maya · locked rule" · "Learned from @alex's correction · 3h ago" · "Learned from @jordan's code review · 2d ago". */
export function provenance(r: VsRule): string {
  const who = at(r.handle ?? r.ownerId);
  if (r.locked) return `Set by ${who} · locked rule`;
  const v = r.learnedVia;
  const when = v ? ago(v.at) : "";
  const tail = when ? ` · ${when}` : "";
  if (v?.kind === "correction") return `Learned from ${at(v.by)}'s correction${tail}`;
  if (v?.kind === "review") return `Learned from ${at(v.by)}'s code review${tail}`;
  if (v?.kind === "agent") return `Proposed by an agent, approved by the team${tail}`;
  return `Set by ${who} · lesson`;
}

/** "locked rule · #org" / "lesson · #repo/export-service". */
export const kindLine = (r: VsRule) => `${r.locked ? "locked rule" : "lesson"} · #${r.scopeId}`;
