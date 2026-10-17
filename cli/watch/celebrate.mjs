// The "lesson approved" moment (owner: H). Adrian's terminal-spec.md §6 + shots/celebrate.png, after editor-spec §2g:
//
//      ⬢ ⬢    Your lesson is live                       the 7 cells flip hairline → honey, 90 ms apart (0–630 ms)
//    ⬢ ⬢ ⬢    ● @jordan  approved it                    then the three lines (700 ms)
//      ⬢ ⬢    every agent on #team/data-pipelines, next session
//
//    Every export calls assertSingleCustomer()          bold; code tokens underlined in honey
//    Team rules 11                                      ticks 10 → 11 at ~1.1 s, honey once it has
//
// 1.6 s of motion, then held (the shell drops it on the next key or after HOLD_MS). No ring, no confetti, no sound.
// NO_COLOR / HIVEMIND_REDUCED_MOTION / --no-motion: the final frame at once.
//
// celebration(lesson, { now, reduced, me, rules }) → { duration, done(now), lines(ctx, now) }
//   lesson: Memory (+ optional `approver`: "jordan" — whoever approved it, from the feed card's actor)
//   rules:  the team rule count before the approval (state.rules.length), for the tick; omitted → no counter line.
import { HEX, P, bold, fg, handleChip, plain, t, COLOR } from "./theme.mjs";

const CELLS = [[1, 0], [3, 0], [0, 1], [2, 1], [4, 1], [1, 2], [3, 2]]; // fill order (x on a 5-wide grid, y)
const STEP_MS = 90;
const TEXT_AT = CELLS.length * STEP_MS + 70; // 700 ms
const TICK_AT = 1100;
const MOTION_MS = 1600;
const HOLD_MS = 8000;

const underline = (s) => (COLOR ? `\x1b[4m${s}\x1b[24m` : s);
/** The title with code tokens (`foo()` or `backticked`) underlined in honey, the rest bold. */
function titleLine(title) {
  return String(title)
    .split(/(`[^`]+`|\b[A-Za-z_$][\w$]*\(\))/g)
    .map((part, i) => (i % 2 ? underline(t.lessonText(part.replace(/`/g, ""))) : part ? bold(t.text(part)) : ""))
    .join("");
}

export function celebration(lesson, { now = Date.now(), reduced = false, me, rules } = {}) {
  const start = now;
  const mine = !me || lesson?.author === me;
  const approver = lesson?.approver ? String(lesson.approver).replace(/^@/, "") : null;
  const scope = lesson?.scopeId ? (lesson.scopeId === "org" ? "#org" : `#${lesson.scopeId}`) : null;
  const title = plain(lesson?.title ?? "");

  return {
    duration: HOLD_MS,
    done: (n) => n - start > HOLD_MS,
    lines(_ctx, n) {
      const e = reduced ? Infinity : n - start;
      const lit = Math.min(CELLS.length, Math.floor(e / STEP_MS) + 1);
      const grid = [0, 1, 2].map((y) => {
        let row = "";
        for (let x = 0; x < 5; x++) {
          const idx = CELLS.findIndex(([cx, cy]) => cx === x && cy === y);
          row += idx < 0 ? "  " : `${fg(idx < lit ? P.lesson : P.hair)(HEX)} `;
        }
        return `   ${row}`;
      });
      const shown = e >= TEXT_AT;
      const head = shown ? `  ${bold(t.text(mine ? "Your lesson is live" : `@${lesson?.author ?? "a teammate"}'s lesson is live`))}` : "";
      // the chip carries a space of padding each side in colour; without colour, pad by hand so the lines align
      const chip = approver ? (COLOR ? ` ${handleChip(approver)}` : `  ${handleChip(approver)}`) : "";
      const who = shown ? (approver ? `${chip} ${t.ok("approved it")}` : `  ${t.ok("approved")}`) : "";
      const reach = shown ? `  ${t.muted(`every agent on ${scope ?? "the team"}, next session`)}` : "";
      const out = ["", grid[0] + head, grid[1] + who, grid[2] + reach, ""];
      out.push(shown ? `   ${titleLine(title)}` : "");
      if (Number.isFinite(rules)) {
        const ticked = e >= TICK_AT;
        const count = ticked ? rules + 1 : rules;
        out.push(`   ${t.faint("Team rules ")}${bold(ticked ? fg(P.lesson)(String(count)) : t.text(String(count)))}`);
      }
      return out;
    },
    /** True while frames still change (the shell can stop redrawing after this). */
    moving: (n) => !reduced && n - start < MOTION_MS,
  };
}
