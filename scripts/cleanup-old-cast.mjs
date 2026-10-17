#!/usr/bin/env node
// Remove the first demo cast (maya, jordan, alex, noor, priya, sam, riley) where it is safe. Dry run by default.
//   node scripts/cleanup-old-cast.mjs           # print the plan, change nothing
//   node scripts/cleanup-old-cast.mjs --apply   # do it
// A person is deleted only if nothing references them: memories (author, evidence actor), events (actor), pack_log,
// activity, scopes.owner (other than their own personal scope being removed), people.scope_id, and no non-comment
// line in scripts/, cli/ or docs/demo-terminal.md mentions the id. Safe to re-run: once scripts/seed-history.mjs moves
// to the new cast, the people it still blocks today become removable.
// personal/<old> scopes are deleted if no memory, person or child scope hangs off them; memories found there are first
// moved to the new cast's personal scope (alex → kevin, noor → emily).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const OLD = ["maya", "jordan", "alex", "noor", "priya", "sam", "riley"];
const MOVE_TO = { alex: "personal/kevin", noor: "personal/emily" }; // personal-scope memories go here
const APPLY = process.argv.includes("--apply");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(path.join(root, ".env.local"))) process.loadEnvFile(path.join(root, ".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
const sb = createClient(url, key, { auth: { persistSession: false } });
const must = (label, r) => {
  if (r.error) {
    console.error(`✗ ${label}:`, r.error.message);
    process.exit(1);
  }
  return r.data;
};

// ---- code references (skip comment lines; this script itself excluded) ----
const self = fileURLToPath(import.meta.url);
function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (n === "node_modules" || n.startsWith(".")) return [];
    return statSync(p).isDirectory() ? files(p) : /\.(m?js|ts|json|md)$/.test(n) && p !== self ? [p] : [];
  });
}
const codeFiles = [...files(path.join(root, "scripts")), ...files(path.join(root, "cli")), path.join(root, "docs/demo-terminal.md")].filter(existsSync);
const isComment = (l) => /^\s*(\/\/|\/?\*|#)/.test(l);
const codeRefs = Object.fromEntries(OLD.map((id) => [id, []]));
for (const f of codeFiles) {
  readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
    if (isComment(line)) return;
    for (const id of OLD) if (new RegExp(`\\b${id}\\b`).test(line)) codeRefs[id].push(`${path.relative(root, f)}:${i + 1}`);
  });
}

// ---- DB references ----
const [people, scopes, mems, events, packs, acts] = await Promise.all([
  sb.from("people").select("id,scope_id"),
  sb.from("scopes").select("id,parent_id,owner"),
  sb.from("memories").select("id,slug,scope_id,author,evidence"),
  sb.from("events").select("id,actor").in("actor", OLD).limit(10000),
  sb.from("pack_log").select("id,actor").in("actor", OLD).limit(10000),
  sb.from("activity").select("id,actor").in("actor", OLD).limit(10000),
]).then((rs) => rs.map((r, i) => must(["people", "scopes", "memories", "events", "pack_log", "activity"][i], r)));

const count = (rows, id) => rows.filter((r) => r.actor === id).length;

// ---- personal scopes ----
const scopePlan = [];
for (const id of OLD) {
  const sid = `personal/${id}`;
  if (!scopes.some((s) => s.id === sid)) continue;
  const memHere = mems.filter((m) => m.scope_id === sid);
  const peopleHere = people.filter((p) => p.scope_id === sid).map((p) => p.id);
  const children = scopes.filter((s) => s.parent_id === sid).map((s) => s.id);
  const target = MOVE_TO[id];
  const blockers = [...peopleHere.map((p) => `person ${p} lives there`), ...children.map((c) => `child scope ${c}`)];
  if (memHere.length && !(target && scopes.some((s) => s.id === target))) blockers.push(`${memHere.length} memories, no target scope`);
  scopePlan.push({ sid, memHere, target, blockers });
}
const removedScopes = new Set(scopePlan.filter((p) => !p.blockers.length).map((p) => p.sid));

// ---- people ----
const peoplePlan = OLD.filter((id) => people.some((p) => p.id === id)).map((id) => {
  const reasons = [];
  const authored = mems.filter((m) => m.author === id).map((m) => m.slug);
  const evid = mems.filter((m) => (m.evidence ?? []).some((e) => e.actor === id)).map((m) => m.slug);
  if (authored.length) reasons.push(`author of ${authored.join(", ")}`);
  if (evid.length) reasons.push(`evidence actor on ${evid.join(", ")}`);
  if (count(events, id)) reasons.push(`${count(events, id)} events`);
  if (count(packs, id)) reasons.push(`${count(packs, id)} pack_log`);
  if (count(acts, id)) reasons.push(`${count(acts, id)} activity`);
  const owns = scopes.filter((s) => s.owner === id && !removedScopes.has(s.id)).map((s) => s.id);
  if (owns.length) reasons.push(`owns ${owns.join(", ")}`);
  if (codeRefs[id].length) reasons.push(`code: ${codeRefs[id].slice(0, 3).join(", ")}${codeRefs[id].length > 3 ? ` +${codeRefs[id].length - 3}` : ""}`);
  return { id, reasons };
});

// ---- report ----
console.log(APPLY ? "APPLY" : "DRY RUN (pass --apply to change the DB)");
console.log("\nscopes:");
for (const p of scopePlan) {
  if (p.blockers.length) console.log(`  keep   ${p.sid}  (${p.blockers.join("; ")})`);
  else console.log(`  delete ${p.sid}${p.memHere.length ? `  after moving ${p.memHere.length} memories → ${p.target}` : ""}`);
}
console.log("\npeople:");
for (const p of peoplePlan) console.log(p.reasons.length ? `  keep   ${p.id}  (${p.reasons.join("; ")})` : `  delete ${p.id}`);

// ---- apply ---- (no process.exit on the dry-run path: it trips a libuv assertion on Windows with fetch handles open)
if (APPLY) {
  for (const p of scopePlan.filter((p) => !p.blockers.length)) {
    if (p.memHere.length) must(`move ${p.sid}`, await sb.from("memories").update({ scope_id: p.target }).eq("scope_id", p.sid));
    must(`delete ${p.sid}`, await sb.from("scopes").delete().eq("id", p.sid));
  }
  const del = peoplePlan.filter((p) => !p.reasons.length).map((p) => p.id);
  if (del.length) must("delete people", await sb.from("people").delete().in("id", del));
  console.log(`\n✓ removed ${removedScopes.size} scopes, ${del.length} people`);
}
