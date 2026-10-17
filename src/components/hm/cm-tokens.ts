import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  hoverTooltip,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { autocompletion, type CompletionContext, type Completion } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { Entity } from "@/mocks/types";
import { tokenKindForScope } from "./utils";

export interface TokenEnv {
  entities: Entity[]; // people, scopes, memories (link)
  onChipClick: (kind: Entity["kind"] | "lock", id: string) => void;
}

const RE =
  /\[\[([a-z0-9][\w-]*)\]\]|#(org(?:\/[\w.-]+)?|(?:team|repo|personal)\/[\w.-]+)|@([a-z][\w-]*)|(🔒)/g;

function chipDecorator(env: TokenEnv) {
  const people = new Set(env.entities.filter((e) => e.kind === "person").map((e) => e.id));
  return new MatchDecorator({
    regexp: RE,
    decoration: (m) => {
      const [, slug, scope, person, lock] = m;
      let kind: string | null = null;
      let id = "";
      if (slug) {
        kind = "link";
        id = slug;
      } else if (scope) {
        kind = tokenKindForScope(scope);
        id = scope;
      } else if (person && people.has(person)) {
        kind = "person";
        id = person;
      } else if (lock) {
        kind = "lock";
        id = "lock";
      }
      if (!kind) return null;
      return Decoration.mark({
        class: "hm-chip",
        attributes: { "data-kind": kind, "data-id": id },
      });
    },
  });
}

function chipPlugin(env: TokenEnv) {
  const decorator = chipDecorator(env);
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(u: ViewUpdate) {
        this.decorations = decorator.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

function chipClicks(env: TokenEnv) {
  return EditorView.domEventHandlers({
    click(e) {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-kind]");
      if (!el) return false;
      const kind = el.dataset.kind as Entity["kind"] | "lock";
      const id = el.dataset.id ?? "";
      env.onChipClick(kind, id);
      return false;
    },
  });
}

function chipHover(env: TokenEnv) {
  const byKey = new Map(env.entities.map((e) => [`${e.kind}:${e.id}`, e]));
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE.exec(line.text))) {
      const from = line.from + m.index;
      const to = from + m[0].length;
      if (pos < from || pos > to) continue;
      const [, slug, scope, person] = m;
      const key = slug
        ? `link:${slug}`
        : scope
          ? `${tokenKindForScope(scope)}:${scope}`
          : person
            ? `person:${person}`
            : null;
      const ent = key ? byKey.get(key) : undefined;
      if (!ent) return null;
      return {
        pos: from,
        end: to,
        above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "hm-hovercard";
          const title = document.createElement("div");
          title.className = "hm-hovercard-title";
          title.textContent = ent.label;
          const detail = document.createElement("div");
          detail.className = "hm-hovercard-detail";
          detail.textContent = ent.detail;
          dom.append(title, detail);
          return { dom };
        },
      };
    }
    return null;
  });
}

function tokenCompletions(env: TokenEnv) {
  return (ctx: CompletionContext) => {
    const word = ctx.matchBefore(/(\[\[[\w-]*|#[\w/.-]*|@[\w-]*)$/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    const text = word.text;
    let options: Completion[] = [];
    if (text.startsWith("[[")) {
      options = env.entities
        .filter((e) => e.kind === "link")
        .map((e) => ({ label: `[[${e.id}]]`, detail: e.label, type: "text" }));
    } else if (text.startsWith("#")) {
      options = env.entities
        .filter((e) => e.kind === "team" || e.kind === "repo" || e.kind === "org")
        .map((e) => ({ label: `#${e.id}`, detail: e.detail, type: "namespace" }));
    } else if (text.startsWith("@")) {
      options = env.entities
        .filter((e) => e.kind === "person")
        .map((e) => ({ label: `@${e.id}`, detail: e.label, type: "variable" }));
    }
    return { from: word.from, options, validFor: /^(\[\[[\w-]*|#[\w/.-]*|@[\w-]*)$/ };
  };
}

// Light markdown styling: keep the source visible (like Obsidian's source mode), but
// bold reads bold and inline code reads as code; the ** and ` markers go quiet.
function markdownMarks() {
  const deco = new MatchDecorator({
    regexp: /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g,
    decoration: (m) => Decoration.mark({ class: m[1] ? "hm-md-bold" : "hm-md-code" }),
  });
  const markers = new MatchDecorator({
    regexp: /\*\*|`/g,
    decoration: () => Decoration.mark({ class: "hm-md-marker" }),
  });
  const plugin = (d: MatchDecorator) =>
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = d.createDeco(view);
        }
        update(u: ViewUpdate) {
          this.decorations = d.updateDeco(u, this.decorations);
        }
      },
      { decorations: (v) => v.decorations },
    );
  return [plugin(deco), plugin(markers)];
}

export const hmEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "transparent",
      color: "var(--text)",
      fontSize: "14px",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      lineHeight: "1.7",
    },
    ".cm-content": { padding: "16px 0", caretColor: "var(--accent)" },
    ".cm-line": { padding: "0 20px" },
    "&.cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)", borderLeftWidth: "2px" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent) !important",
    },
    ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--text) 3%, transparent)" },
    ".cm-gutters": { display: "none" },
    ".cm-tooltip": {
      backgroundColor: "var(--elevated)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      color: "var(--text)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px", fontFamily: "var(--font-geist-sans)" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
      color: "var(--text)",
    },
    ".cm-completionDetail": { color: "var(--muted)", marginLeft: "8px", fontStyle: "normal" },
    ".hm-md-bold": { fontWeight: "600", color: "var(--text)" },
    ".hm-md-code": { color: "var(--chip-repo)" },
    ".hm-md-marker": { color: "var(--muted)", opacity: "0.6" },
    ".hm-hovercard": { padding: "8px 10px", maxWidth: "280px", fontFamily: "var(--font-geist-sans)" },
    ".hm-hovercard-title": { fontWeight: "600", fontSize: "13px" },
    ".hm-hovercard-detail": { color: "var(--muted)", fontSize: "12px", marginTop: "2px" },
  },
  { dark: true },
);

export function hmTokens(env: TokenEnv): Extension[] {
  return [
    ...markdownMarks(),
    chipPlugin(env),
    chipClicks(env),
    chipHover(env),
    autocompletion({ override: [tokenCompletions(env)], icons: false }),
    EditorView.lineWrapping,
    hmEditorTheme,
  ];
}
