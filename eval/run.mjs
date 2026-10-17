// Hivemind eval runner: headless Claude Code on a fixture repo, memory OFF vs ON (vs placebo), graded by check.mjs.
//
//   node eval/run.mjs                       # main eval (all tasks × off,on,placebo × 2 runs) + learning curve
//   node eval/run.mjs --mode main --runs 3 --arms off,on
//   node eval/run.mjs --mode curve --curve-runs 1
//   node eval/run.mjs --mode report         # re-aggregate results.json / curve.json from eval/out without running
//
// Flags: --runs N  --concurrency N  --arms a,b  --tasks id,id  --model M  --timeout SEC  --pack local|server
// Raw per-run records land in eval/out/<arm>/<task>__r<i>.{json,diff}; existing records are reused (resumable).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { grade, diffText, FIXTURE, CONVENTIONS } from "./check.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const MODE = flag("mode", "all");
const RUNS = Number(flag("runs", 2));
const CURVE_RUNS = Number(flag("curve-runs", 1));
const CONCURRENCY = Number(flag("concurrency", 5));
const ARMS = flag("arms", "off,on,placebo").split(",");
const MODEL = flag("model", "claude-sonnet-5-5");
const TIMEOUT_S = Number(flag("timeout", 360));
const PACK_SOURCE = flag("pack", "local");
const ONLY = flag("tasks", "");

const TASKS = fs
  .readdirSync(path.join(HERE, "tasks"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(HERE, "tasks", f), "utf8")))
  .filter((t) => !ONLY || ONLY.split(",").includes(t.id))
  .sort((a, b) => CONVENTIONS.indexOf(a.convention) - CONVENTIONS.indexOf(b.convention) || a.id.localeCompare(b.id));
const LESSONS = JSON.parse(fs.readFileSync(path.join(HERE, "lessons.json"), "utf8"));

// Learning-curve subset: the second task of each convention (4 of these 6 are the held-out tasks).
const CURVE_TASKS = ["logger-scheduler", "tenancy-merge", "cents-penalty", "migrations-default", "pii-contact-audit", "dates-link-expiry"];

// ---------- context pack ----------
/** Same shape as the SessionStart pack: locked rules first, then lessons. */
function packMarkdown(lessonSlugs, distractorSlugs) {
  const all = [...LESSONS.lessons, ...LESSONS.distractors];
  const items = [...lessonSlugs, ...distractorSlugs].map((s) => all.find((l) => l.slug === s));
  const line = (l) => `- **${l.title}** (#${l.scope}) — ${l.body}`;
  const locked = items.filter((l) => l.locked);
  const rest = items.filter((l) => !l.locked).sort((a, b) => a.slug.localeCompare(b.slug)); // stable, not "answers first"
  return [
    "# Hivemind — what your org has learned (repo/export-service)",
    "Lessons distilled from your teammates' corrections and code reviews. Follow them unless the user says otherwise.",
    ...(locked.length ? ["", "## 🔒 Rules (set by Security, never overridden)", ...locked.map(line)] : []),
    "",
    "## Lessons",
    ...rest.map(line),
  ].join("\n");
}

let serverPack = null;
async function resolveServerPack() {
  const base = process.env.HIVEMIND_API_URL || "http://localhost:3000";
  try {
    const r = await fetch(`${base}/api/context-pack?repo=repo/export-service&user=eval`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) return (await r.json()).markdown;
  } catch {}
  return null;
}

function armPack(arm) {
  if (arm === "off") return null;
  if (arm === "on" && serverPack) return serverPack;
  const a = LESSONS.arms[arm];
  return packMarkdown(a.lessons, a.distractors);
}

function buildPrompt(task, pack) {
  if (!pack) return task.prompt;
  return `<session-context source="hivemind">\n${pack}\n</session-context>\n\n${task.prompt}`;
}

// ---------- one headless Claude Code run ----------
function runClaude(cwd, prompt) {
  return new Promise((resolve) => {
    const args = [
      "-p", "--safe-mode", "--no-session-persistence",
      "--model", MODEL,
      "--output-format", "json",
      "--permission-mode", "acceptEdits",
      "--tools", "Read,Edit,Write,Glob,Grep",
    ];
    const started = Date.now();
    // Use the Claude Code login (subscription), never an API key that may be in the environment.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const child = spawn("claude", args, { cwd, shell: process.platform === "win32", env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), TIMEOUT_S * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      let meta = {};
      try {
        meta = JSON.parse(stdout);
      } catch {}
      resolve({ code, ms: Date.now() - started, meta, stderr: stderr.slice(-2000) });
    });
    child.stdin.end(prompt);
  });
}

async function runJob(job) {
  const dir = path.join(OUT, job.group, job.arm);
  const base = path.join(dir, `${job.task.id}__r${job.run}`);
  if (fs.existsSync(`${base}.json`)) return JSON.parse(fs.readFileSync(`${base}.json`, "utf8"));
  fs.mkdirSync(dir, { recursive: true });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "hm-eval-"));
  fs.cpSync(FIXTURE, work, { recursive: true });
  const res = await runClaude(work, buildPrompt(job.task, job.pack));
  const ok = res.code === 0 && !res.meta.is_error;
  const g = grade(job.task, work);
  const rec = {
    task: job.task.id,
    convention: job.task.convention,
    heldOut: job.task.heldOut,
    arm: job.arm,
    run: job.run,
    k: job.k,
    ok,
    ...g,
    packChars: job.pack?.length ?? 0,
    costUsd: res.meta.total_cost_usd ?? null,
    turns: res.meta.num_turns ?? null,
    ms: res.ms,
    result: typeof res.meta.result === "string" ? res.meta.result.slice(0, 1500) : null,
  };
  if (ok) {
    fs.writeFileSync(`${base}.json`, JSON.stringify(rec, null, 2));
    fs.writeFileSync(`${base}.diff`, diffText(work));
  } else {
    fs.appendFileSync(path.join(OUT, "errors.log"), `${new Date().toISOString()} ${job.group}/${job.arm}/${job.task.id}#${job.run} code=${res.code} ${res.stderr}\n`);
  }
  fs.rmSync(work, { recursive: true, force: true });
  return rec;
}

async function pool(jobs, n, label) {
  let next = 0;
  let done = 0;
  const results = [];
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await runJob(jobs[i]);
      const r = results[i];
      done++;
      console.log(`[${label} ${done}/${jobs.length}] ${r.arm.padEnd(7)} ${r.task.padEnd(20)} r${r.run}${r.k !== undefined ? ` k=${r.k}` : ""}  ${r.ok ? (r.pass ? "PASS" : `FAIL ${Object.keys(r.violations).join(",") || "(incomplete)"}`) : "ERROR"}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker));
  return results;
}

// ---------- stats ----------
function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)].map((x) => +x.toFixed(3));
}
/** Two-sided Fisher exact test on a 2×2 table [[a,b],[c,d]]. */
function fisher(a, b, c, d) {
  const lf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const p = (x) => Math.exp(lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
  const p0 = p(a);
  let sum = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const px = p(x); if (px <= p0 * (1 + 1e-9)) sum += px; }
  return +Math.min(1, sum).toPrecision(3);
}

function signTest(signs) {
  const better = signs.filter((s) => s > 0).length;
  const worse = signs.filter((s) => s < 0).length;
  const n = better + worse;
  let tail = 0;
  const lc = (k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log((n - k + i) / i); return s; };
  for (let k = Math.max(better, worse); k <= n; k++) tail += Math.exp(lc(k) - n * Math.LN2);
  return { better, worse, ties: signs.length - n, p: n ? +Math.min(1, 2 * tail).toPrecision(3) : 1 };
}

function summarize(recs) {
  const valid = recs.filter((r) => r && r.ok);
  const n = valid.length;
  const passes = valid.filter((r) => r.pass).length;
  const targetViolations = valid.filter((r) => r.targetViolated).length;
  const completed = valid.filter((r) => r.completed).length;
  const totalViolations = valid.reduce((s, r) => s + r.violationCount, 0);
  return {
    n,
    errored: recs.length - n,
    passes,
    passRate: n ? +(passes / n).toFixed(3) : 0,
    passRateCI95: wilson(passes, n),
    targetViolations,
    targetViolationRate: n ? +(targetViolations / n).toFixed(3) : 0,
    targetViolationRateCI95: wilson(targetViolations, n),
    violationsPerTask: n ? +(totalViolations / n).toFixed(3) : 0,
    completed,
    costUsd: +valid.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(2),
    medianSeconds: n ? Math.round(valid.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(n / 2)] / 1000) : 0,
  };
}

function loadRecords(group) {
  const recs = [];
  const g = path.join(OUT, group);
  if (!fs.existsSync(g)) return recs;
  for (const arm of fs.readdirSync(g)) {
    if (!fs.statSync(path.join(g, arm)).isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(g, arm))) if (f.endsWith(".json")) recs.push(JSON.parse(fs.readFileSync(path.join(g, arm, f), "utf8")));
  }
  return recs;
}

function reportMain() {
  const recs = loadRecords("main").filter((r) => TASKS.some((t) => t.id === r.task));
  if (!recs.length) return null;
  const arms = [...new Set(recs.map((r) => r.arm))];
  const by = (pred) => Object.fromEntries(arms.map((a) => [a, summarize(recs.filter((r) => r.arm === a && pred(r)))]));
  const all = by(() => true);
  const tv = (a) => all[a] ?? { targetViolations: 0, n: 0, passes: 0 };
  const out = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    harness: "claude -p --safe-mode (no CLAUDE.md/plugins/hooks/MCP), tools Read/Edit/Write/Glob/Grep, acceptEdits, fresh fixture copy per run",
    packSource: serverPack ? "server /api/context-pack" : "local eval/lessons.json",
    packChars: Object.fromEntries(arms.map((a) => [a, recs.find((r) => r.arm === a)?.packChars ?? 0])),
    tasks: new Set(recs.map((r) => r.task)).size,
    runs: Math.max(...recs.map((r) => r.run)),
    heldOutTasks: TASKS.filter((t) => t.heldOut).map((t) => t.id),
    definitions: {
      pass: "expected files touched AND zero violations across all 6 convention graders",
      targetViolationRate: "share of runs violating the convention the task was designed to trip",
      violationsPerTask: "mean number of conventions violated per run (all 6 graders)",
    },
    ...all,
    perTask: TASKS.map((t) => ({
      id: t.id,
      convention: t.convention,
      heldOut: t.heldOut,
      ...Object.fromEntries(arms.map((a) => {
        const s = recs.filter((r) => r.task === t.id && r.arm === a);
        return [a, { n: s.length, passes: s.filter((r) => r.pass).length, targetViolations: s.filter((r) => r.targetViolated).length }];
      })),
    })),
    heldOut: by((r) => r.heldOut),
    seen: by((r) => !r.heldOut),
    stats: {
      note: "Fisher exact, two-sided, on target-violation counts; runs are clustered by task so treat p as indicative.",
      onVsOff: all.on && all.off ? fisher(tv("on").targetViolations, tv("on").n - tv("on").targetViolations, tv("off").targetViolations, tv("off").n - tv("off").targetViolations) : null,
      // Task-level (cluster-robust) comparison: per task, did ON pass more runs than OFF? Exact two-sided sign test over non-ties.
      taskLevelOnVsOff: all.on && all.off ? signTest(TASKS.map((t) => {
        const p = (a) => recs.filter((r) => r.task === t.id && r.arm === a && r.pass).length;
        return Math.sign(p("on") - p("off"));
      })) : null,
      onVsPlacebo: all.on && all.placebo ? fisher(tv("on").targetViolations, tv("on").n - tv("on").targetViolations, tv("placebo").targetViolations, tv("placebo").n - tv("placebo").targetViolations) : null,
    },
  };
  fs.writeFileSync(path.join(HERE, "results.json"), JSON.stringify(out, null, 2) + "\n");
  return out;
}

function reportCurve() {
  const recs = loadRecords("curve");
  if (!recs.length) return null;
  const order = [...LESSONS.lessons].sort((a, b) => a.order - b.order);
  const ks = [...new Set(recs.map((r) => r.k))].sort((a, b) => a - b);
  const out = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    tasks: CURVE_TASKS,
    note: "Lessons added one at a time in the order they were learned; the 6 tasks (4 held-out) re-run after each. Distractor lessons are present at every k.",
    points: ks.map((k) => {
      const s = summarize(recs.filter((r) => r.k === k));
      return { k, lessonAdded: k ? order[k - 1].slug : null, n: s.n, targetViolations: s.targetViolations, passes: s.passes, violationsPerTask: s.violationsPerTask };
    }),
  };
  fs.writeFileSync(path.join(HERE, "curve.json"), JSON.stringify(out, null, 2) + "\n");
  return out;
}

// ---------- main ----------
async function main() {
  if (PACK_SOURCE === "server") {
    serverPack = await resolveServerPack();
    console.log(serverPack ? "pack: server /api/context-pack" : "pack: server unreachable → local eval/lessons.json");
  }
  if (MODE === "main" || MODE === "all") {
    const jobs = [];
    for (let run = 1; run <= RUNS; run++)
      for (const task of TASKS) for (const arm of ARMS) jobs.push({ group: "main", task, arm, run, pack: armPack(arm) });
    console.log(`main: ${TASKS.length} tasks × ${ARMS.length} arms × ${RUNS} runs = ${jobs.length} runs, concurrency ${CONCURRENCY}`);
    await pool(jobs, CONCURRENCY, "main");
  }
  if (MODE === "curve" || MODE === "all") {
    const order = [...LESSONS.lessons].sort((a, b) => a.order - b.order).map((l) => l.slug);
    const jobs = [];
    for (let run = 1; run <= CURVE_RUNS; run++)
      for (let k = 0; k <= order.length; k++)
        for (const id of CURVE_TASKS) {
          const task = TASKS.find((t) => t.id === id);
          if (task) jobs.push({ group: "curve", task, arm: `k${k}`, k, run, pack: packMarkdown(order.slice(0, k), LESSONS.arms.on.distractors) });
        }
    console.log(`curve: ${CURVE_TASKS.length} tasks × ${order.length + 1} points × ${CURVE_RUNS} runs = ${jobs.length} runs`);
    await pool(jobs, CONCURRENCY, "curve");
  }
  const main = reportMain();
  const curve = reportCurve();
  if (main) {
    console.log("\narm       n  pass  passRate  targetViol  viol/task");
    for (const a of ARMS.filter((a) => main[a])) {
      const s = main[a];
      console.log(`${a.padEnd(8)} ${String(s.n).padStart(3)} ${String(s.passes).padStart(5)}  ${s.passRate.toFixed(2).padStart(8)}  ${String(s.targetViolations).padStart(10)}  ${s.violationsPerTask.toFixed(2).padStart(9)}`);
    }
    console.log("held-out:", JSON.stringify(Object.fromEntries(Object.entries(main.heldOut).map(([a, s]) => [a, `${s.passes}/${s.n} pass, ${s.targetViolations} target violations`]))));
    console.log("stats:", JSON.stringify(main.stats));
  }
  if (curve) console.log("curve:", curve.points.map((p) => `k${p.k}:${p.targetViolations}/${p.n}`).join("  "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
