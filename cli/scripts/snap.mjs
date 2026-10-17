// Render CLI output to PNG for design review: run each command with truecolor forced, ANSI → HTML (a dark terminal
// window, Adrian's palette), then a headless Chrome screenshot. No real terminal windows are opened.
//   node cli/scripts/snap.mjs <outDir> <prefix> [--only name,name]
// Commands run from playground/ as @kevin. Without --mock they read prod (and `rules` logs a pack session); with --mock
// nothing leaves this machine except `update`'s git fetch from GitHub.
import { execFileSync, spawn, spawnSync } from "node:child_process";

/** spawn → { stdout, stderr } without blocking the event loop (120s cap). */
function run(cmd, args, opts) {
  return new Promise((resolveP) => {
    const p = spawn(cmd, args, opts);
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => p.kill(), 120000);
    p.on("close", () => {
      clearTimeout(timer);
      resolveP({ stdout, stderr });
    });
  });
}
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(REPO, "cli", "hivemind.mjs");
const PLAY = join(REPO, "playground");
const [outDir = join(REPO, "..", "mockups"), prefix = "cli", ...rest] = process.argv.slice(2);
const only = rest.includes("--only") ? rest[rest.indexOf("--only") + 1].split(",") : null;
// --mock: point every command at a local canned API (cli/scripts/mock-api.mjs), e.g. while prod is frozen for a recording.
const mock = rest.includes("--mock") ? await (await import("./mock-api.mjs")).startMock() : null;
const apiEnv = mock ? { HIVEMIND_API_URL: mock.url, HIVEMIND_TOKEN: "mock-token" } : {};

// A throwaway git repo for `init --dry-run`.
const initDir = mkdtempSync(join(tmpdir(), "hm-snap-init-"));
spawnSync("git", ["init", "-q", initDir]);
mkdirSync(join(initDir, ".cursor"), { recursive: true });

const SHOTS = [
  { name: "help", args: ["help"] },
  { name: "status", args: ["status"] },
  { name: "check", args: ["check", "scratch/legacy-report.ts"] },
  { name: "why", args: ["why", "sec-lab-isolation"] },
  { name: "teach", args: ["teach", "Payout emails go through mailer.send(), never a raw SMTP client", "--dry-run"] },
  { name: "rules", args: ["rules", "--file", "src/payouts.ts"] },
  { name: "init", args: ["init", "--agents", "cursor,claude-code", "--dry-run", "--no-sync"], cwd: initDir },
  { name: "use", args: ["use"] },
  { name: "update", args: ["update"] },
  { name: "open", args: ["open", "--dry-run"], env: { WT_SESSION: "snap" } },
];

// ---------- ANSI → HTML ----------
const BASIC = ["#1C1C1E", "#E5484D", "#3DD68C", "#F5A524", "#4C6EF5", "#8B93FF", "#2DD4BF", "#E4E4E7"];
const BRIGHT = ["#71717A", "#FF9592", "#3DD68C", "#F5C26B", "#91A7FF", "#8B93FF", "#2DD4BF", "#FFFFFF"];
function xterm(n) {
  if (n < 8) return BASIC[n];
  if (n < 16) return BRIGHT[n - 8];
  if (n < 232) {
    const v = n - 16;
    const c = (x) => (x ? 55 + x * 40 : 0);
    return `rgb(${c(Math.floor(v / 36))},${c(Math.floor(v / 6) % 6)},${c(v % 6)})`;
  }
  const g = 8 + (n - 232) * 10;
  return `rgb(${g},${g},${g})`;
}
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ansiToHtml(text) {
  let st = { fg: null, bg: null, bold: false, dim: false, ital: false, ul: false };
  let html = "";
  const span = (t) => {
    if (!t) return;
    const css = [];
    if (st.fg) css.push(`color:${st.fg}`);
    if (st.bg) css.push(`background:${st.bg}`);
    if (st.bold) css.push("font-weight:700");
    if (st.dim) css.push("opacity:.55");
    if (st.ital) css.push("font-style:italic");
    if (st.ul) css.push("text-decoration:underline");
    html += css.length ? `<span style="${css.join(";")}">${esc(t)}</span>` : esc(t);
  };
  const s = text.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, ""); // OSC 8 hyperlinks: keep the text
  const re = /\x1b\[([0-9;:]*)([A-Za-z])/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    span(s.slice(last, m.index));
    last = re.lastIndex;
    if (m[2] !== "m") continue;
    const p = (m[1] || "0").split(/[;:]/).map(Number);
    for (let i = 0; i < p.length; i++) {
      const v = p[i];
      if (v === 0) st = { fg: null, bg: null, bold: false, dim: false, ital: false, ul: false };
      else if (v === 1) st.bold = true;
      else if (v === 2) st.dim = true;
      else if (v === 3) st.ital = true;
      else if (v === 4) st.ul = true;
      else if (v === 22) st.bold = st.dim = false;
      else if (v === 23) st.ital = false;
      else if (v === 24 || v === 59) st.ul = false;
      else if (v === 39) st.fg = null;
      else if (v === 49) st.bg = null;
      else if (v === 38 || v === 48 || v === 58) {
        const key = v === 38 ? "fg" : v === 48 ? "bg" : null;
        let col = null;
        if (p[i + 1] === 2) {
          col = `rgb(${p[i + 2]},${p[i + 3]},${p[i + 4]})`;
          i += 4;
        } else if (p[i + 1] === 5) {
          col = xterm(p[i + 2]);
          i += 2;
        }
        if (key) st[key] = col;
      } else if (v >= 30 && v <= 37) st.fg = BASIC[v - 30];
      else if (v >= 90 && v <= 97) st.fg = BRIGHT[v - 90];
      else if (v >= 40 && v <= 47) st.bg = BASIC[v - 40];
    }
  }
  span(s.slice(last));
  return html;
}

function page(title, body, lines) {
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#0E0F12}
  .win{margin:28px;border-radius:12px;background:#1C1C1E;box-shadow:0 30px 80px -20px rgba(0,0,0,.6),0 0 0 1px #2E2E32;overflow:hidden;width:max-content;min-width:860px}
  .bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#232326;border-bottom:1px solid #2E2E32;font:12px -apple-system,Segoe UI,sans-serif;color:#A1A1AA}
  .d{width:12px;height:12px;border-radius:50%}
  .t{flex:1;text-align:center;margin-right:52px}
  pre{margin:0;padding:18px 22px 22px;font:13.5px/1.55 "Cascadia Mono","JetBrains Mono",Menlo,Consolas,monospace;color:#E4E4E7;white-space:pre}
  </style><div class="win"><div class="bar"><span class="d" style="background:#FF5F57"></span><span class="d" style="background:#FEBC2E"></span><span class="d" style="background:#28C840"></span><span class="t">${esc(title)}</span></div><pre>${body}</pre></div><!-- ${lines} -->`;
}

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find(existsSync);
if (!CHROME) throw new Error("no Chrome found for headless screenshots");
mkdirSync(outDir, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "hm-snap-"));

for (const shot of SHOTS) {
  if (only && !only.includes(shot.name)) continue;
  // Async: the --mock API lives in this process, so a blocking spawnSync would starve it.
  if (process.env.SNAP_DEBUG) console.error("run", shot.name);
  const r = await run(process.execPath, [CLI, ...shot.args], {
    cwd: shot.cwd ?? PLAY,
    env: { ...process.env, FORCE_COLOR: "3", COLUMNS: "110", HIVEMIND_USER: "kevin", HIVEMIND_NO_UPDATE: "1", ...apiEnv, ...(shot.env ?? {}) },
  });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\r/g, "").replace(/\n+$/, "");
  const lines = text.split("\n").length;
  const prompt = `<span style="color:#71717A">~/playground</span> <span style="color:#3DD68C">❯</span> hivemind ${esc(shot.args.join(" "))}\n`;
  const html = page(`hivemind ${shot.name}`, prompt + ansiToHtml(text), lines);
  const file = join(work, `${shot.name}.html`);
  writeFileSync(file, html);
  const longest = Math.max(80, ...text.replace(/\x1b\[[0-9;:]*[A-Za-z]|\x1b\]8;;[^\x07]*\x07/g, "").split("\n").map((l) => l.length));
  const w = Math.max(940, Math.ceil(longest * 8.2) + 110);
  const h = Math.ceil((lines + 1) * 21 + 130);
  const png = join(outDir, `${prefix}-${shot.name}.png`);
  if (process.env.SNAP_DEBUG) console.error("chrome", shot.name, (r.stdout + r.stderr).length);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--window-size=${w},${h}`, `--screenshot=${png}`, `file:///${file.replace(/\\/g, "/")}`], { stdio: "ignore" });
  console.log(`${png}  (${lines} lines)`);
}
mock?.close();
