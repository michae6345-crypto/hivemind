// The "lesson approved" seal (owner: H). celebration(lesson, { now, reduced, me }) → { duration, done(now), lines(ctx, now) }.
// STUB: three hex cells fill honey 90ms apart, then the headline. H adds the tool badges + the 0 → 6 counter.
import { HEX, HEX_OPEN, P, bold, ease, faded, fg, plain, t } from "./theme.mjs";

export function celebration(lesson, { now, reduced = false, me } = {}) {
  const start = now;
  const duration = 6000;
  return {
    duration,
    done: (n) => n - start > duration,
    lines(_ctx, n) {
      const e = reduced ? 1e9 : n - start;
      const cells = [0, 1, 2].map((i) => (e >= i * 90 ? faded(ease((e - i * 90) / 160), () => fg(P.lesson)(HEX)) : t.faint(HEX_OPEN))).join(" ");
      const who = lesson?.author === me ? "Your lesson is live" : `@${lesson?.author ?? "a teammate"}'s lesson is live`;
      const head = e >= 350 ? faded(ease((e - 350) / 250), () => bold(t.lessonText(who))) : "";
      const title = e >= 450 ? faded(ease((e - 450) / 250), () => t.text(`"${plain(lesson?.title ?? "")}"`)) : "";
      return ["", `   ${cells}   ${head}`, `           ${title}`];
    },
  };
}
