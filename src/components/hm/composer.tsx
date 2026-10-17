"use client";

import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { Lock, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import type { Memory } from "@/mocks/types";
import { useHivemind } from "./store";
import { hmTokens } from "./cm-tokens";
import { useEntities } from "./use-entities";
import { Label } from "./bits";
import { canLock, cn, reachFor, scopeChain, scopeLabel } from "./utils";

const KINDS: { kind: Memory["kind"]; label: string; hint: string }[] = [
  { kind: "directive", label: "Rule", hint: "Something every agent must do" },
  { kind: "lesson", label: "Lesson", hint: "A pattern the team learned" },
  { kind: "fact", label: "Fact", hint: "Context agents should know" },
];

/** Slide-over for writing a rule by hand: scope, lock and expiry. Lives in the vault's chain of command. */
export function Composer() {
  const { composerOpen, setComposerOpen, user, scopes, people, createMemory, openMemory } = useHivemind();
  const entities = useEntities();
  const extensions = useMemo(() => hmTokens({ entities, onChipClick: () => {} }), [entities]);

  const writable = useMemo(() => {
    if (!user) return [];
    return scopes.filter((s) => {
      if (user.role === "security") return s.level !== "personal" || s.id === `personal/${user.id}`;
      if (user.role === "lead") return s.level !== "org" && scopeChain(s.id, scopes).some((c) => c.id === user.scopeId) && s.level !== "personal";
      return s.id === `personal/${user.id}`;
    });
  }, [user, scopes]);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [kind, setKind] = useState<Memory["kind"]>("directive");
  const [locked, setLocked] = useState(false);
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);

  const chosenScope = writable.some((s) => s.id === scopeId) ? scopeId : (writable[0]?.id ?? "");
  const lockAllowed = canLock(user);

  useEffect(() => {
    if (!composerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComposerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composerOpen, setComposerOpen]);

  const reach = chosenScope ? reachFor(chosenScope, scopes, people) : 0;
  const canSave = title.trim().length > 2 && body.trim().length > 2 && !!chosenScope && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const r = await createMemory({
      scopeId: chosenScope,
      kind,
      title: title.trim(),
      body: body.trim(),
      locked: lockAllowed && locked,
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
    });
    setSaving(false);
    if (!r.ok) {
      toast.error(r.forbidden ? "Not your call" : "Couldn't save the rule", { description: r.error, className: "hm-toast-forbidden" });
      return;
    }
    toast.success(locked && lockAllowed ? "Locked rule saved" : "Rule saved", {
      description: `${reach} ${reach === 1 ? "person's agent loads" : "people's agents load"} it from their next session in ${scopeLabel(chosenScope)}.`,
    });
    if (r.memory) openMemory(r.memory.id);
    setTitle("");
    setBody("");
    setLocked(false);
    setExpires("");
    setComposerOpen(false);
  };

  return (
    <AnimatePresence>
    {composerOpen ? (
    <div key="composer" className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Write a rule">
      <motion.button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-fg/30 backdrop-blur-[1px]"
        onClick={() => setComposerOpen(false)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />
      <motion.div
        className="relative flex h-full w-[min(520px,100vw)] flex-col border-l border-line bg-panel"
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%", transition: { type: "spring", stiffness: 520, damping: 48 } }}
        transition={{ type: "spring", stiffness: 420, damping: 40 }}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="font-semibold">Write a rule</span>
          <button
            type="button"
            onClick={() => setComposerOpen(false)}
            className="rounded p-1 text-muted hover:bg-elevated hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div>
            <Label>What should every agent do?</Label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Exports call assertSingleCustomer() before writing"
              className="h-9 w-full rounded-md border border-line bg-bg px-3 text-[14px] outline-none placeholder:text-muted/70 focus:border-accent/60"
            />
          </div>

          <div>
            <Label>Details</Label>
            <div className="overflow-hidden rounded-md border border-line bg-bg focus-within:border-accent/60">
              <CodeMirror
                value={body}
                onChange={setBody}
                minHeight="140px"
                theme="none"
                placeholder="Why it matters and where it applies. Type # for a team or repo, @ for a person, [[ to link a lesson."
                basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLineGutter: false, autocompletion: false, highlightActiveLine: false }}
                extensions={extensions}
              />
            </div>
          </div>

          <div>
            <Label>Kind</Label>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.kind}
                  onClick={() => setKind(k.kind)}
                  className={cn(
                    "rounded-md border px-2.5 py-2 text-left transition-colors duration-150",
                    kind === k.kind ? "border-accent/60 bg-accent/10" : "border-line hover:border-fg/20",
                  )}
                >
                  <div className="text-[13px] font-medium">{k.label}</div>
                  <div className="text-[11px] text-muted">{k.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Applies to</Label>
              <select
                value={chosenScope}
                onChange={(e) => setScopeId(e.target.value)}
                className="h-9 w-full rounded-md border border-line bg-bg px-2 text-[13px] outline-none focus:border-accent/60"
              >
                {writable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.level === "personal" ? `Only me (@${s.name})` : scopeLabel(s.id)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-[12px] text-muted">
                {reach} {reach === 1 ? "person's agent" : "people's agents"} will load it.
              </p>
            </div>
            <div>
              <Label>Stops applying on</Label>
              <input
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                className="h-9 w-full rounded-md border border-line bg-bg px-2 text-[13px] text-fg outline-none [color-scheme:light] focus:border-accent/60"
              />
              <p className="mt-1.5 text-[12px] text-muted">Leave empty to keep it until someone changes it.</p>
            </div>
          </div>

          <label
            className={cn(
              "flex items-start gap-3 rounded-md border px-3 py-2.5",
              locked && lockAllowed ? "border-lock/50 bg-lock/[0.07]" : "border-line",
              !lockAllowed && "opacity-60",
            )}
          >
            <input
              type="checkbox"
              checked={locked && lockAllowed}
              disabled={!lockAllowed}
              onChange={(e) => setLocked(e.target.checked)}
              className="mt-0.5 accent-[var(--chip-lock)]"
            />
            <span>
              <span className="flex items-center gap-1.5 text-[13px] font-medium">
                <Lock className="size-3.5 text-lock" /> Lock this rule
              </span>
              <span className="block text-[12px] text-muted">
                {lockAllowed
                  ? "Nobody below Security can override it, and any lesson that contradicts it is blocked before an agent sees it."
                  : "Only Security can lock a rule."}
              </span>
            </span>
          </label>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setComposerOpen(false)}
            className="h-8 rounded-md px-3 text-[13px] text-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="hm-pill hm-pill-primary h-9 px-4 text-[13px] disabled:opacity-40"
          >
            {saving ? "Saving…" : locked && lockAllowed ? "Save locked rule" : "Save rule"}
          </button>
        </div>
      </motion.div>
    </div>
    ) : null}
    </AnimatePresence>
  );
}
