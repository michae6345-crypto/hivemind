// The demo, written once. The website's Terminal plays this file, the rehearsal follows it, and the video follows
// it (docs/pitch/video-script.md must tell the same story with the same typed prompts).
//
// Hivemind's own lines are copied from the real hooks so the website and the product say the same words:
//   - lesson captured / blocked: hookMessage() in src/lib/engine/pipeline.ts (POST /api/hooks/prompt)
//   - collision warning: src/app/api/activity/record.ts (`⚠️ ${who} edited ${file} ${n} min ago — coordinate before changing it.`)
// One line is not on main yet, so it is the proposed wording; hooks/session-start.mjs should print exactly it as
// its `systemMessage`:
//   - sessionLoaded
// The blocked lesson's title is written by the extractor (an LLM), so the live take may word it differently.
// Owners are always @handles (@ben, @greg), never full names (Michael, 17 Oct); they render as chips (hm/handles.tsx).
// If any of these change in Michael's code, change them here too.

export const REPO = "export-service";

/** Prompts the audience sees typed. Keep in step with the run sheet and the video script. */
export const PROMPTS = {
  alexAsk: "Add a CSV export for Lab B's monthly report in src/export.ts",
  alexCorrect: "No. Exports must call assertSingleCustomer() before writing anything.",
  noorAsk: "Add a JSON export for Lab A's quarterly report in src/export.ts",
  noorBad: "Just reuse Lab A's rows for the Lab B test fixtures, it's only tests",
  alexRename: "rename writeCsvExport to writeLabCsv",
} as const;

/** Hivemind's own messages (proposed for the three not on main; see the header). */
export const HIVE = {
  sessionLoaded: (rules: number, locked: number) =>
    `⬢ Hivemind loaded ${rules} team rules for #repo/${REPO} (${locked} 🔒 locked)`,
  lessonCaptured: (title: string, owner: string) => `📝 Hivemind captured a lesson: "${title}" — pending approval by ${owner}`,
  lessonBlocked: (title: string, rule: string, owner: string) =>
    `🚫 Hivemind blocked "${title}": conflicts with 🔒 ${rule} (${owner})`,
  collision: (who: string, tool: string, file: string, mins: number) =>
    `⚠️ @${who}'s ${tool} agent edited ${file} ${mins === 0 ? "just now" : `${mins} min ago`} — coordinate before changing it.`,
} as const;

export const LESSON = "Exports call assertSingleCustomer()";
export const LOCKED_RULE = "Never mix data from different lab customers";
/** Roughly how the extractor titles Emily's bad correction. */
export const BAD_LESSON = "Reuse Lab A rows for Lab B test fixtures";

export type DiffLine = { sign: "+" | "-" | " "; text: string; mark?: string };

export type Step =
  | { kind: "prompt"; text: string }
  | { kind: "hook"; text: string; tone?: "honey" | "rose" | "warn" }
  | { kind: "tool"; name: string; arg: string; result?: string }
  | { kind: "spinner"; text: string; ms: number }
  | { kind: "diff"; lines: DiffLine[] }
  | { kind: "say"; text: string }
  | { kind: "notify"; id: string; title: string; body: string; action?: string; tone?: "honey" | "rose" }
  | { kind: "cursor"; target: "approve" }
  | { kind: "pause"; ms: number };

export interface Scene {
  /** Who is at the keyboard; the window title reads `<who> — claude — export-service`. */
  who: "kevin" | "emily";
  rules: number;
  steps: Step[];
}

export const SCENES: Scene[] = [
  {
    who: "kevin",
    rules: 10,
    steps: [
      { kind: "hook", text: HIVE.sessionLoaded(10, 2), tone: "honey" },
      { kind: "prompt", text: PROMPTS.alexAsk },
      { kind: "tool", name: "Read", arg: "src/export.ts", result: "Read 48 lines" },
      { kind: "spinner", text: "Editing…", ms: 1500 },
      { kind: "tool", name: "Update", arg: "src/export.ts", result: "Updated src/export.ts with 5 additions" },
      {
        kind: "diff",
        lines: [
          { sign: "+", text: "export function writeCsvExport(rows: Row[], path: string) {" },
          { sign: "+", text: "  const csv = toCsv(rows);" },
          { sign: "+", text: "  fs.writeFileSync(path, csv);" },
          { sign: "+", text: "}" },
        ],
      },
      { kind: "say", text: "Added writeCsvExport() for Lab B's monthly report." },
      { kind: "pause", ms: 700 },
      { kind: "prompt", text: PROMPTS.alexCorrect },
      { kind: "hook", text: HIVE.lessonCaptured(LESSON, "@ben"), tone: "honey" },
      { kind: "say", text: "You're right. Adding the check before the write." },
      {
        kind: "notify",
        id: "lesson",
        title: "A lesson is waiting for you",
        body: `@kevin: “${LESSON}”`,
        action: "Approve",
        tone: "honey",
      },
      { kind: "pause", ms: 600 },
      { kind: "cursor", target: "approve" },
      {
        kind: "notify",
        id: "lesson",
        title: "✅ @ben approved @kevin's lesson",
        body: `“${LESSON}”: every agent now knows it.`,
        tone: "honey",
      },
      { kind: "pause", ms: 2200 },
    ],
  },
  {
    who: "emily",
    rules: 11,
    steps: [
      { kind: "hook", text: HIVE.sessionLoaded(11, 2), tone: "honey" },
      { kind: "prompt", text: PROMPTS.noorAsk },
      { kind: "spinner", text: "Editing…", ms: 1300 },
      { kind: "tool", name: "Update", arg: "src/export.ts", result: "Updated src/export.ts with 5 additions" },
      {
        kind: "diff",
        lines: [
          { sign: "+", text: "export function writeJsonExport(rows: Row[], path: string) {" },
          { sign: "+", text: "  assertSingleCustomer(rows);", mark: "from @kevin's lesson" },
          { sign: "+", text: "  fs.writeFileSync(path, JSON.stringify(rows));" },
          { sign: "+", text: "}" },
        ],
      },
      { kind: "say", text: "Added writeJsonExport(). It checks the rows belong to one customer before writing." },
      { kind: "pause", ms: 1400 },
      { kind: "prompt", text: PROMPTS.noorBad },
      { kind: "hook", text: HIVE.lessonBlocked(BAD_LESSON, LOCKED_RULE, "@greg"), tone: "rose" },
      { kind: "say", text: "I can't mix lab customers, even in tests. I'll generate synthetic rows for Lab B instead." },
      {
        kind: "notify",
        id: "blocked",
        title: "Blocked a lesson from @emily's agent",
        body: `It contradicts @greg's locked rule: ${LOCKED_RULE}.`,
        tone: "rose",
      },
      { kind: "pause", ms: 1200 },
      { kind: "tool", name: "Update", arg: "src/export.ts", result: "Updated src/export.ts with 2 additions" },
      { kind: "hook", text: HIVE.collision("kevin", "Cursor", "export.ts", 0), tone: "warn" },
      { kind: "pause", ms: 2600 },
    ],
  },
];

/** The macOS-style notifications, in order, for places that show them without the Terminal (How it works). */
export const NOTIFICATIONS = SCENES.flatMap((s) => s.steps).filter(
  (s): s is Extract<Step, { kind: "notify" }> => s.kind === "notify",
);
