// `hivemind setup-shortcut [--dry-run] [--settings <path>]`: a Windows Terminal profile "Hivemind + Claude" that opens
// Claude Code on the left and `hivemind watch` on the right in one click (the profile runs `hivemind claude`, which
// splits its own window).
// Never overwrites: the profile is inserted as text into profiles.list (your comments and formatting stay), only when no
// profile with our guid or name exists yet, after a timestamped backup, and only if the result still parses.
// --settings (or HIVEMIND_WT_SETTINGS) targets one file instead of the installed Windows Terminal(s).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { locateRepo } from "./locate.mjs";
import { brand } from "./style.mjs";
import { c, onPath } from "./util.mjs";

const GUID = "{5b1f0c4e-7d1a-4e8b-9c2e-48e5f1a7c0de}";
const NAME = "Hivemind + Claude";
const CLI = fileURLToPath(new URL("../hivemind.mjs", import.meta.url)).replace(/\\/g, "/");

/** Windows Terminal stable, preview and unpackaged (scoop/winget zip) settings.json locations that exist. */
function settingsFiles() {
  const local = process.env.LOCALAPPDATA ?? "";
  return [
    join(local, "Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json"),
    join(local, "Packages", "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe", "LocalState", "settings.json"),
    join(local, "Microsoft", "Windows Terminal", "settings.json"),
  ].filter((p) => existsSync(p));
}

/**
 * Minimal JSONC parser (comments, trailing commas) that also records where each array opens, by path:
 * arrays.get("profiles.list") = offset of its "[". Throws on anything malformed.
 */
export function parseJsonc(text) {
  let i = 0;
  const arrays = new Map();
  const ws = () => {
    for (;;) {
      if (/\s/.test(text[i] ?? "")) i++;
      else if (text.startsWith("//", i)) i = text.indexOf("\n", i) === -1 ? text.length : text.indexOf("\n", i);
      else if (text.startsWith("/*", i)) {
        const end = text.indexOf("*/", i + 2);
        if (end === -1) throw new Error("unterminated comment");
        i = end + 2;
      } else return;
    }
  };
  const str = () => {
    const start = i++;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    if (text[i++] !== '"') throw new Error("unterminated string");
    return JSON.parse(text.slice(start, i));
  };
  const value = (path) => {
    ws();
    const ch = text[i];
    if (ch === "{") {
      i++;
      const o = {};
      for (;;) {
        ws();
        if (text[i] === "}") return i++, o;
        if (text[i] !== '"') throw new Error(`expected a key at ${i}`);
        const k = str();
        ws();
        if (text[i++] !== ":") throw new Error(`expected : at ${i - 1}`);
        o[k] = value(path ? `${path}.${k}` : k);
        ws();
        if (text[i] === ",") i++;
        else if (text[i] !== "}") throw new Error(`expected , or } at ${i}`);
      }
    }
    if (ch === "[") {
      arrays.set(path, i);
      i++;
      const a = [];
      for (;;) {
        ws();
        if (text[i] === "]") return i++, a;
        a.push(value(`${path}[]`));
        ws();
        if (text[i] === ",") i++;
        else if (text[i] !== "]") throw new Error(`expected , or ] at ${i}`);
      }
    }
    if (ch === '"') return str();
    const m = text.slice(i).match(/^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!m) throw new Error(`unexpected ${JSON.stringify(ch)} at ${i}`);
    i += m[0].length;
    return JSON.parse(m[0]);
  };
  const v = value("");
  ws();
  if (i < text.length) throw new Error(`trailing text at ${i}`);
  return { value: v, arrays };
}

const listOf = (v) => (Array.isArray(v?.profiles) ? v.profiles : Array.isArray(v?.profiles?.list) ? v.profiles.list : null);

/** The profile: `hivemind claude` (the shim when it's on PATH, else node + this CLI), in the repo you ran this from. */
export function profileFor(root) {
  const run = onPath("hivemind") ? "hivemind claude" : `node "${CLI}" claude`;
  return {
    guid: GUID,
    name: NAME,
    commandline: `cmd.exe /k ${run}`, // /k: a shell stays in the repo after Claude Code exits
    ...(root ? { startingDirectory: root } : {}),
    tabTitle: "Hivemind + Claude",
    hidden: false,
  };
}

/** New settings text with the profile first in the list, or { already } / { error }. Pure: for tests. */
export function insertProfile(text, profile) {
  const raw = text.replace(/^﻿/, "");
  const bom = raw.length !== text.length ? "﻿" : "";
  let parsed;
  try {
    parsed = parseJsonc(raw);
  } catch (e) {
    return { error: `couldn't parse it (${e.message})` };
  }
  const list = listOf(parsed.value);
  if (!list) return { error: "no profiles list in it" };
  const mine = list.find((p) => p?.guid?.toLowerCase() === profile.guid.toLowerCase() || p?.name === profile.name);
  if (mine) return { already: mine };
  const at = parsed.arrays.get(Array.isArray(parsed.value.profiles) ? "profiles" : "profiles.list");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  // Indent like the list's first element (Windows Terminal writes 12 spaces), else one level past the "[" line.
  const after = raw.slice(at + 1);
  const firstIndent = after.match(/^[ \t]*\r?\n([ \t]*)\S/)?.[1];
  const lineStart = raw.lastIndexOf("\n", at) + 1;
  const indent = firstIndent ?? raw.slice(lineStart, at).match(/^[ \t]*/)[0] + "    ";
  const body = JSON.stringify(profile, null, 4).split("\n").map((l) => indent + l).join(eol);
  const next = bom + raw.slice(0, at + 1) + eol + body + (list.length ? "," : "") + after;
  // Belt and braces: the result must parse and hold exactly one more profile, ours.
  try {
    const check = listOf(parseJsonc(next.replace(/^﻿/, "")).value);
    if (check?.length !== list.length + 1 || check[0]?.guid !== profile.guid) return { error: "the merged file didn't check out" };
  } catch (e) {
    return { error: `the merged file didn't parse (${e.message})` };
  }
  return { text: next };
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");

export async function cmdSetupShortcut(cfg, fail) {
  const head = `${brand()} ${c.gray("· setup-shortcut")}`;
  const explicit = typeof cfg.flags.settings === "string" ? cfg.flags.settings : process.env.HIVEMIND_WT_SETTINGS;
  if (process.platform !== "win32" && !explicit) {
    console.log(`${head}  Windows Terminal only. On macOS/Linux, ${c.cyan("hm c")} already splits iTerm2 or tmux in one command.`);
    return;
  }
  const files = explicit ? [explicit] : settingsFiles();
  const found = await locateRepo({ dir: typeof cfg.flags.dir === "string" ? cfg.flags.dir : undefined, interactive: false });
  const profile = profileFor(found?.root);
  const dry = cfg.dryRun;
  console.log(`${head}${dry ? c.gray("  (dry run)") : ""}`);
  if (!files.length || (explicit && !existsSync(explicit))) {
    console.log(`  ${c.yellow("!")} Windows Terminal settings not found. Open Windows Terminal once, or add this profile by hand:`);
    console.log(JSON.stringify(profile, null, 2).replace(/^/gm, "    "));
    return;
  }
  let failed = 0;
  for (const file of files) {
    const res = insertProfile(readFileSync(file, "utf8"), profile);
    if (res.already) {
      console.log(`  ${c.green("✓")} already there ${c.gray(`(${res.already.name}) in ${file}`)}; left as is`);
      continue;
    }
    if (res.error) {
      failed++;
      console.log(`  ${c.red("✗")} ${file}: ${res.error}. Left untouched; add this profile by hand:`);
      console.log(JSON.stringify(profile, null, 2).replace(/^/gm, "    "));
      continue;
    }
    if (dry) {
      console.log(`  would add ${c.bold(NAME)} to ${c.cyan(file)} ${c.gray("(after a backup)")}`);
      console.log(JSON.stringify(profile, null, 2).replace(/^/gm, "    "));
      continue;
    }
    const backup = `${file}.hivemind-backup-${stamp()}`;
    copyFileSync(file, backup);
    writeFileSync(file, res.text);
    console.log(`  ${c.green("✓")} added ${c.bold(NAME)} to ${c.cyan(file)}`);
    console.log(`    ${c.gray(`backup: ${backup}`)}`);
  }
  if (!dry && files.length > failed)
    console.log(`  ${c.gray("Open it from the")} ${c.cyan("∨")} ${c.gray("menu in Windows Terminal: Claude Code on the left, Hivemind on the right")}${found ? c.gray(`, in ${found.root}`) : ""}.`);
  if (failed === files.length) fail("couldn't add the profile");
}
