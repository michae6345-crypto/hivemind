// Hivemind side panel webview, built to public/brand/vscode/editor-spec.md §2d (strings: wording.md "Editor, 17 Oct").
// Plain JS, no remote code. Every API call goes through postMessage to the extension host (src/sidebar/index.ts),
// which holds the token. The skeleton (header, tabs, body, detail, teach box) is built once; regions re-render
// separately so the detail slide, the celebration and the teach box survive data refreshes.
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const saved = vscode.getState() || {};

  const S = {
    ctx: null, // { me, repo, workspaceName, dashboardUrl, apiUrl }
    tab: saved.tab || "here", // here | all | approvals
    collapsed: saved.collapsed || { you: true },
    feedOpen: !!saved.feedOpen,
    scopes: [],
    people: [],
    chain: null,
    all: [],
    transfer: [],
    loaded: false,
    loadErr: null,
    online: null,
    here: null, // { file, line, ok, org, repo, approver, rules: HereRule[] }
    live: null,
    liveSig: "",
    detail: null, // memory id or slug
    detailFrom: "here",
    notes: {}, // memory id → { tone, html }
    busy: {},
    flash: { id: null, until: 0 },
    celebrated: {},
    teach: { busy: false, scope: null, note: null },
    lock: { scopeId: "org", title: "", body: "", busy: false, note: null },
  };
  const persist = () => vscode.setState({ tab: S.tab, collapsed: S.collapsed, feedOpen: S.feedOpen });

  // ---------- rpc ----------
  let seq = 0;
  const pending = new Map();
  function rpc(op, args) {
    const id = ++seq;
    vscode.postMessage({ type: "rpc", id, op, args: args || {} });
    return new Promise((resolve) => pending.set(id, resolve));
  }

  // ---------- text ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const EMOJI = /(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{231A}-\u{23FF}]️?)\s?/gu;
  const noEmoji = (s) => String(s == null ? "" : s).replace(EMOJI, "");

  function ago(iso, short) {
    const t = new Date(iso).getTime();
    if (!t) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return short ? "now" : "just now";
    const u = s < 3600 ? [Math.round(s / 60), "m"] : s < 86400 ? [Math.round(s / 3600), "h"] : s < 86400 * 7 ? [Math.round(s / 86400), "d"] : null;
    if (u) return short ? u[0] + u[1] : `${u[0]}${u[1]} ago`;
    const w = Math.round(s / (86400 * 7));
    return short ? `${w}w` : w < 5 ? `${w}w ago` : day(iso);
  }
  const day = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const stamp = (iso) => `${day(iso)}, ${new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`;
  const base = (p) => String(p || "").split("/").pop();

  const TOOLS = { "claude-code": "Claude Code", cursor: "Cursor", "gemini-cli": "Gemini CLI", copilot: "Copilot", codex: "Codex", "claude-ai": "Claude", windsurf: "Windsurf", vscode: "VS Code" };
  const REACH = ["Claude Code", "Cursor", "Copilot", "Codex", "Gemini CLI"];
  const ROLE = { security: "Security", lead: "Lead", engineer: "Engineer" };
  const LAYER = { security: "org", lead: "team", engineer: "repo" };

  // ---------- org model ----------
  const scopeById = (id) => S.scopes.find((s) => s.id === id);
  const person = (id) => S.people.find((p) => p.id === id);
  const me = () => (S.ctx && S.ctx.me) || "";
  const myRole = () => (person(me()) || {}).role || "engineer";
  const security = () => (S.people.find((p) => p.role === "security") || {}).id || "maya";
  function chainOf(id) {
    const out = [];
    for (let s = scopeById(id), n = 0; s && n < 8; s = scopeById(s.parentId), n++) out.unshift(s.id);
    return out;
  }
  function approverOf(scopeId) {
    for (const id of chainOf(scopeId).reverse()) {
      const s = scopeById(id);
      if (s && s.owner && !(s.level === "personal" && id !== scopeId)) return s.owner;
    }
    return null;
  }
  /** Mirrors the server's canWrite (src/lib/auth.ts): who may approve/reject here. */
  function canDecide(m) {
    const role = myRole();
    if (role === "security") return true;
    if (m.locked || m.status === "blocked") return false;
    if (role === "lead") {
      const home = (person(me()) || {}).scopeId;
      return !!home && chainOf(m.scopeId).includes(home);
    }
    return m.scopeId === `personal/${me()}`;
  }
  const findMem = (key) =>
    S.all.find((m) => m.id === key || m.slug === key) || (S.chain || []).find((m) => m.id === key || m.slug === key) || null;
  const approvedBy = (m) => {
    const e = [...(m.evidence || [])].reverse().find((x) => x.type === "manual" && /^Approved by /.test(x.quote));
    return e ? { actor: e.actor, at: e.at } : null;
  };
  const origin = (m) => (m.evidence || []).find((x) => !(x.type === "manual" && /^Approved by /.test(x.quote))) || null;
  const handleOf = (actor) => String(actor || "").replace(/^@/, "");
  const isAgent = (actor) => /^agent(:|$)|^an agent$/i.test(actor || "");

  // ---------- chips ----------
  function scopeChip(id, cls) {
    const k = id === "org" ? "org" : id.startsWith("personal/") ? "you" : id.split("/")[0];
    const label = id === `personal/${me()}` ? "#you" : `#${id}`;
    return `<span class="chip ${k}${cls ? " " + cls : ""}"><i></i>${esc(label)}</span>`;
  }
  function handleChip(actor) {
    const id = handleOf(actor);
    if (!id || isAgent(id)) return `<span>an agent</span>`;
    const p = person(id);
    const layer = p ? LAYER[p.role] : "repo";
    const owns = S.scopes.filter((s) => s.owner === id && s.level !== "personal").map((s) => "#" + s.id);
    const tip = p ? `${p.name} · ${p.title}${owns.length ? ` · Approves ${owns.slice(0, 2).join(", ")}` : ""}` : `@${id}`;
    return `<span class="chip h ${layer}" title="${esc(tip)}"><i>${esc(id[0].toUpperCase())}</i>@${esc(id)}</span>`;
  }
  const whose = (actor) => (isAgent(actor) ? "an agent’s" : `${handleChip(actor)}’s`);
  const toolPill = (agent) => (TOOLS[agent] ? `<span class="pill">${TOOLS[agent]}</span>` : "");
  function linkChip(slug) {
    const m = findMem(slug);
    const k = m ? (m.scopeId === "org" ? "org" : m.scopeId.split("/")[0]) : "org";
    return `<a class="chip ${k} wrap" data-act="detail" data-id="${esc(slug)}"><i></i>${esc(m ? noEmoji(m.title) : slug)}</a>`;
  }

  // code-looking words in titles: ident(), a.b, snake_case, camelCase
  const CODE = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+(?:\(\))?|\b[a-z][a-z0-9]*[A-Z][\w$]*(?:\(\))?|\b[A-Za-z_$][\w$]*\(\)|\b[a-z0-9]+(?:_[a-z0-9]+)+\b)/g;
  const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** Identifiers a rule names: VsRule.symbols, else the `backticked` words of its body. */
  const symbolsOf = (m) =>
    (m.symbols && m.symbols.length ? m.symbols : (String(m.body || "").match(/`([^`]+)`/g) || []).map((x) => x.slice(1, -1)))
      .map((x) => x.replace(/\(.*$/, ""))
      .filter((x) => /^[\w$.]{3,}$/.test(x));
  function titleHtml(title, m) {
    const syms = m ? symbolsOf(m) : [];
    const re = syms.length ? new RegExp(`(?<![\\w$.])(?:${syms.map(reEsc).join("|")})(?:\\(\\))?(?![\\w$])|${CODE.source}`, "g") : CODE;
    return esc(noEmoji(title))
      .replace(re, (w) => `<span class="tok">${w}</span>`)
      .replace(/(^|[\s(])@([a-z][\w-]*)/gi, (_, p, id) => p + handleChip(id.toLowerCase()));
  }
  /** Rule body / quotes / feed text → HTML: `code` tokens, **bold**, #scope / @handle / [[slug]] chips. Escaped first. */
  function rich(s) {
    let t = esc(noEmoji(s));
    const codes = [];
    t = t.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    t = t.replace(/\[\[([a-z0-9][\w-]*)\]\]/gi, (_, slug) => `\u0001${codes.push("\u0002" + slug) - 1}\u0001`);
    t = t.replace(/(^|[\s(,])#((?:team|repo|personal)\/[\w-]+|org)\b/g, (_, p, id) => p + scopeChip(id));
    t = t.replace(/(^|[\s(,])@([a-z][\w-]*)/gi, (_, p, id) => p + handleChip(id.toLowerCase()));
    t = t.replace(/\u0001(\d+)\u0001/g, (_, i) => linkChip(codes[+i].slice(1)));
    t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<span class="tok">${codes[+i]}</span>`);
    return t;
  }

  // ---------- icons (inline, no emoji) ----------
  const MARK = `<svg viewBox="0 0 120 120" aria-hidden="true"><path d="M60 13L84.25 27L84.25 55L60 69L35.75 55L35.75 27Z" fill="#FB7185"/><path d="M38 51.1L62.25 65.1L62.25 93.1L38 107.1L13.75 93.1L13.75 65.1Z" fill="#F5A524"/><path d="M82 52.7L104.86 65.9L104.86 92.3L82 105.5L59.14 92.3L59.14 65.9Z" fill="none" stroke="#F5A524" stroke-width="7" stroke-dasharray="10 6.5" stroke-linejoin="round"/></svg>`;
  const CHEV = `<svg class="chev" viewBox="0 0 10 10"><path d="M3 2l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
  const SEND = `<svg width="14" height="14" viewBox="0 0 16 16"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const LOCK = `<svg class="hm-lock" width="13" height="13" viewBox="0 0 16 16"><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
  const HEX = "M50 6L88 28L88 72L50 94L12 72L12 28Z";

  // ---------- skeleton ----------
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="hm-head">
      <div class="hm-brand">${MARK}Hivemind<span class="hm-dot-on off" id="dot" title="Connecting…"></span></div>
      <div class="hm-where" id="where"></div>
    </div>
    <div class="hm-tabs" role="tablist" id="tabs"></div>
    <div class="hm-wrap">
      <div class="hm-body" id="body"><div id="cele"></div><div id="content"></div></div>
      <div class="hm-detail" id="detail" aria-hidden="true"></div>
    </div>
    <div class="hm-teach">
      <form class="box" id="teachForm">
        <textarea rows="1" id="teachIn" placeholder="Teach Hivemind a rule…" maxlength="400"></textarea>
        <div class="foot"><span id="teachScope"></span><button class="send" id="teachSend" type="submit" aria-label="Send">${SEND}</button></div>
      </form>
      <div class="sent" id="teachSent" hidden></div>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const bodyEl = $("body");
  const detailEl = $("detail");
  const teachIn = $("teachIn");

  // ---------- header + tabs ----------
  function renderHead() {
    const c = S.ctx || {};
    const repo = (S.here && S.here.repo) || c.repo || "";
    const ws = c.workspaceName || (S.here && S.here.org) || (scopeById("org") || {}).name || "test workspace";
    const proj = repo ? repo.replace(/^repo\//, "") : "test project";
    const opts = S.people.length
      ? ["security", "lead", "engineer"]
          .map((r) => `<optgroup label="${ROLE[r]}">${S.people.filter((p) => p.role === r).map((p) => `<option value="${esc(p.id)}" ${p.id === me() ? "selected" : ""}>@${esc(p.id)}</option>`).join("")}</optgroup>`)
          .join("")
      : `<option>@${esc(me())}</option>`;
    $("where").innerHTML = `<b>${esc(ws)}</b>&nbsp;/&nbsp;<span class="proj">${esc(proj)}</span>&nbsp;·&nbsp;<select class="hm-as" data-act="viewAs" title="Viewing as @${esc(me())} (${ROLE[myRole()]}). Your role decides Approvals.">${opts}</select>`;
    const dot = $("dot");
    const host = (c.apiUrl || "").replace(/^https?:\/\//, "");
    dot.classList.toggle("off", S.online !== true);
    dot.title = S.online === true ? `Connected to ${host}` : S.online === false ? `Offline: can't reach ${host}` : "Connecting…";
  }

  function approvalsCount() {
    if (!S.loaded) return 0;
    const q = queue();
    return q.mine.length + q.blocked.length + (myRole() === "engineer" ? q.waiting.length : 0);
  }
  function renderTabs() {
    const n = approvalsCount();
    const t = (id, label, count) =>
      `<button class="hm-tab" role="tab" data-act="tab" data-tab="${id}" aria-selected="${S.tab === id}">${label}${count ? `<span class="hm-count">${count}</span>` : ""}</button>`;
    $("tabs").innerHTML = t("here", "Here") + t("all", "All rules") + t("approvals", "Approvals", n);
  }

  // ---------- rows ----------
  const flashing = (m) => S.flash.until > Date.now() && (S.flash.id === m.id || S.flash.id === m.slug);
  function row(m, meta, extra) {
    const cls = m.status === "pending" ? "pending" : m.locked ? "locked" : m.kind === "lesson" || m.kind === "directive" ? "lesson" : "";
    const sel = S.detail && (S.detail === m.id || S.detail === m.slug);
    return `<button class="hm-row ${cls}${sel || (extra && extra.sel) ? " sel" : ""}${flashing(m) ? " flash" : ""}" data-act="${(extra && extra.act) || "detail"}" data-id="${esc(m.id)}">
      <span class="hm-title">${titleHtml(m.title, m)}</span><span class="hm-meta">${meta}</span></button>`;
  }
  const emptyBlock = (b, s) => `<div class="hm-empty"><b>${b}</b>${s ? `<span>${s}</span>` : ""}</div>`;

  // ---------- Here ----------
  function renderHere() {
    const h = S.here;
    if (!h || !h.file) return emptyBlock("Open a file to see its rules.", "Rules that mention this file or its code show up here.");
    let out = `<div class="hm-cap">In <code>${esc(base(h.file))}</code>, line ${h.line}</div>`;
    if (!h.ok) return out + emptyBlock("Hivemind can't reach the server.", `<a class="hm-link" data-act="settings">Check settings</a>`);
    if (!h.rules.length) return out + emptyBlock("No team rules apply here.", "Rules that mention this file or its code show up here.");
    out += h.rules
      .map((r) => {
        const when = r.locked ? "locked" : ago((r.learnedVia && r.learnedVia.at) || r.taughtAt);
        return row({ ...r, status: "active" }, `${scopeChip(r.scopeId)}${handleChip(r.handle || r.ownerId)}${esc(when)}`, { act: "here", sel: r.atCursor });
      })
      .join("");
    return out;
  }

  // ---------- All rules ----------
  function section(key, label, list, renderRow) {
    const open = !S.collapsed[key];
    return `<div class="hm-sec tg${open ? " open" : ""}" data-act="toggle" data-key="${key}">${CHEV}${label}<span class="n">· ${list.length}</span></div>${
      open ? (list.length ? list.map(renderRow).join("") : `<div class="hm-cap" style="padding:2px 12px 6px 30px;color:var(--hm-faint)">Nothing here yet.</div>`) : ""
    }`;
  }
  function renderAll() {
    if (!S.loaded) return loadingOr();
    const repo = (S.ctx && S.ctx.repo) || "";
    const ids = repo ? chainOf(repo) : ["org"];
    const mine = `personal/${me()}`;
    const src = (S.chain || S.all.filter((m) => m.scopeId === "org")).concat(S.all.filter((m) => m.scopeId === mine));
    const seen = new Set();
    const live = src.filter((m) => (m.status === "active" || m.status === "pending") && !seen.has(m.id) && seen.add(m.id));
    const order = (a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1) || String(b.updatedAt).localeCompare(String(a.updatedAt));
    const metaOf = (m, withScope) => {
      if (m.kind === "owner") return `owner · ${esc(ago(m.createdAt))}`;
      const o = origin(m);
      const who = handleChip(o && !isAgent(o.actor) ? o.actor : m.author);
      if (m.status === "pending") {
        const a = approverOf(m.scopeId);
        return `${withScope ? scopeChip(m.scopeId) : ""}${who}<span class="wait">waiting on @${esc(a || "a lead")}</span>`;
      }
      return `${withScope ? scopeChip(m.scopeId) : ""}${who}${m.locked ? "" : esc(ago(o ? o.at : m.createdAt))}`;
    };
    const locked = live.filter((m) => m.locked);
    let out = section("locked", "Locked", locked, (m) => row(m, metaOf(m, true)));
    for (const id of ids) {
      const s = scopeById(id);
      const lvl = s ? s.level : id === "org" ? "org" : id.split("/")[0];
      const list = live.filter((m) => m.scopeId === id && !m.locked).sort(order);
      const label = lvl === "org" ? "Org" : `${lvl === "team" ? "Team" : "Repo"}<span class="n">· #${esc(id)}</span>`;
      out += section(id, label, list, (m) => row(m, metaOf(m)));
    }
    out += section("you", "You", live.filter((m) => m.scopeId === mine && !m.locked).sort(order), (m) => row(m, metaOf(m)));
    return out;
  }

  // ---------- Approvals ----------
  function queue() {
    const repo = (S.ctx && S.ctx.repo) || "";
    const myChain = new Set(repo ? chainOf(repo) : []);
    const pendingAll = S.all.filter((m) => m.status === "pending");
    const mine = pendingAll.filter(canDecide);
    const isMine = (m) => m.author === me() || (origin(m) || {}).actor === me();
    const waiting = pendingAll.filter((m) => !canDecide(m) && (isMine(m) || myChain.has(m.scopeId) || m.scopeId === `personal/${me()}`));
    const role = myRole();
    const home = (person(me()) || {}).scopeId;
    const blocked = S.all.filter(
      (m) => m.status === "blocked" && (role === "security" || isMine(m) || (home && chainOf(m.scopeId).includes(home)) || myChain.has(m.scopeId)),
    );
    return { mine, waiting, blocked };
  }
  function proposer(m) {
    const o = origin(m);
    const actor = o ? o.actor : m.author;
    const when = ago(o ? o.at : m.createdAt);
    if (handleOf(actor) === me()) return `<span>Proposed by you · ${esc(when)}</span>`;
    if (isAgent(actor)) return `<span>Proposed by an agent · ${esc(when)}</span>`;
    return `<span>Proposed by ${whose(actor)} agent · ${esc(when)}</span>`;
  }
  const quoteOf = (m) => {
    const o = origin(m);
    return o && o.quote && !/^(Written|Proposed) by /.test(o.quote) ? o.quote : null;
  };
  function card(m, acts) {
    const q = quoteOf(m);
    const n = S.notes[m.id];
    if (m.status === "blocked") {
      const slug = ((m.blockedReason || "").match(/\[\[([\w-]+)\]\]/) || [])[1];
      const rule = slug ? linkChip(slug) : `<span class="chip org wrap"><i></i>${rich(m.blockedReason || "a locked rule")}</span>`;
      return `<div class="hm-card blocked">
        <div class="hm-blk">Blocked by a locked rule</div>
        <div class="tt" data-act="detail" data-id="${esc(m.id)}">${titleHtml(m.title, m)}</div>
        <div class="by">${rule}</div>
        <div class="by">${proposer(m).replace(/^<span>Proposed by/, "<span>From")}${acts ? "" : ` · only Security can dismiss`}</div>
        ${acts ? `<div class="acts">${acts}</div>` : ""}
        ${n ? `<div class="hm-note ${n.tone}">${n.html}</div>` : ""}
      </div>`;
    }
    return `<div class="hm-card pending">
      <div class="tt" data-act="detail" data-id="${esc(m.id)}">${titleHtml(m.title, m)}</div>
      ${q ? `<div class="q">“${rich(q)}”</div>` : ""}
      <div class="by">${scopeChip(m.scopeId)}${proposer(m)}</div>
      ${acts || `<div class="wait">${LOCK}Waiting on ${handleChip(approverOf(m.scopeId) || "jordan")}</div>`}
      ${n ? `<div class="hm-note ${n.tone}">${n.html}</div>` : ""}
    </div>`;
  }
  const decideBtns = (m) =>
    S.busy[m.id]
      ? `<div class="acts"><span class="hm-status ok">Saving…</span></div>`
      : `<div class="acts"><button class="btn primary" data-act="approve" data-id="${esc(m.id)}">Approve</button><button class="btn ghost" data-act="reject" data-id="${esc(m.id)}">Reject</button></div>`;
  const dismissBtn = (m) => (S.busy[m.id] ? `<span class="hm-status ok">Saving…</span>` : `<button class="btn ghost" data-act="reject" data-id="${esc(m.id)}">Dismiss</button>`);

  function renderApprovals() {
    if (!S.loaded) return loadingOr();
    const q = queue();
    const role = myRole();
    let out = "";
    const sec = (label, n) => `<div class="hm-sec">${label}<span class="n">· ${n}</span></div>`;
    if (q.mine.length) out += sec("For you", q.mine.length) + q.mine.map((m) => card(m, decideBtns(m))).join("");
    if (q.waiting.length) out += sec("Waiting on someone else", q.waiting.length) + q.waiting.map((m) => card(m)).join("");
    if (q.blocked.length)
      out += sec("Stopped by a locked rule", q.blocked.length) + q.blocked.map((m) => card(m, role === "security" ? dismissBtn(m) : "")).join("");
    if (!out) out = emptyBlock("Nothing waiting.", "Every lesson has an owner’s sign-off.");
    if (role === "security") out += lockForm();
    return out;
  }

  function lockForm() {
    const L = S.lock;
    const opts = S.scopes
      .filter((s) => s.level !== "personal")
      .map((s) => `<option value="${esc(s.id)}" ${s.id === L.scopeId ? "selected" : ""}>#${esc(s.id)}</option>`)
      .join("");
    return `<div class="hm-sec">Lock a rule</div>
      <form class="hm-form" data-form="lock">
        <input name="title" placeholder="Never send lab data to third-party APIs" value="${esc(L.title)}" maxlength="140">
        <textarea name="body" rows="2" placeholder="Why, and what to do instead (optional)">${esc(L.body)}</textarea>
        <div class="row2"><select name="scopeId">${opts}</select><button class="btn rose" type="submit" ${L.busy ? "disabled" : ""}>${L.busy ? "Locking…" : "Lock rule"}</button></div>
        ${L.note ? `<div class="hm-note ${L.note.tone}">${L.note.html}</div>` : ""}
      </form>`;
  }

  // ---------- activity ----------
  function feedRows() {
    if (!S.live) return [];
    const rows = [];
    for (const it of S.live.items || [])
      rows.push({ at: it.createdAt, hot: !!it.warning, actor: it.actor, agent: it.agent, what: `edited ${base(it.file)}`, warn: it.warning });
    const WHAT = { correction: "taught a lesson", review_comment: "left a review", approval: "approved a lesson", rejection: "rejected a lesson", blocked: "was blocked", session_start: "started a session" };
    for (const f of S.live.feed || []) {
      if (f.type === "collision" || !WHAT[f.type]) continue;
      const what = f.type === "correction" && /^corrected/.test(f.text) ? "corrected an agent" : WHAT[f.type];
      rows.push({ at: f.at, actor: f.actor, agent: f.agent, what, blocked: f.type === "blocked" });
    }
    return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  function renderFeed() {
    const rows = feedRows();
    const hot = rows.filter((r) => r.hot);
    const shown = S.feedOpen ? rows.slice(0, 5) : hot.slice(0, 2);
    const line = (r) =>
      `<div class="row${r.hot ? " hot" : ""}" ${r.warn ? `title="${esc(r.warn)}"` : ""}>${handleChip(r.actor)}${toolPill(r.agent)}<span class="what">${esc(r.what)}</span><span class="t">${esc(ago(r.at, true))}</span></div>${
        r.hot && r.warn ? `<div class="warn">${rich(r.warn)}</div>` : ""
      }`;
    let out = `<div class="hm-sec tg${S.feedOpen ? " open" : ""}" data-act="feed">${CHEV}Activity${hot.length ? `<span class="n" style="color:var(--hm-rose)">· ${hot.length} collision${hot.length > 1 ? "s" : ""}</span>` : ""}</div>`;
    if (S.feedOpen && !rows.length) return out + `<div class="hm-empty" style="padding-top:8px"><span>No agents working right now.</span></div>`;
    return out + `<div class="hm-feed">${shown.map(line).join("")}</div>`;
  }

  // ---------- detail ----------
  function renderDetail() {
    const back = `<button class="hm-back" data-act="back">‹ ${{ here: "Here", all: "All rules", approvals: "Approvals" }[S.detailFrom] || "All rules"}</button>`;
    let m = findMem(S.detail);
    const hr = S.here && S.here.rules ? S.here.rules.find((r) => r.id === S.detail || r.slug === S.detail) : null;
    if (!m && hr) m = { id: hr.id, slug: hr.slug, title: hr.title, scopeId: hr.scopeId, kind: hr.kind, locked: hr.locked, status: "active", author: handleOf(hr.handle), body: "", evidence: [], createdAt: hr.taughtAt };
    if (!m) return back + `<div class="hm-d">${S.loaded ? emptyBlock("This rule isn’t in Hivemind anymore.") : loadingOr()}</div>`;

    const o = origin(m);
    const author = o && !isAgent(o.actor) ? o.actor : m.author;
    const p = person(handleOf(author));
    let kind, kcls;
    if (m.status === "blocked") (kind = "Blocked lesson"), (kcls = "locked");
    else if (m.locked) (kind = "Locked rule"), (kcls = "locked");
    else if (m.status === "pending") (kind = "Proposed lesson"), (kcls = "lesson");
    else if (m.kind === "owner") (kind = "Owner"), (kcls = "");
    else if (m.kind === "fact") (kind = "Fact"), (kcls = "");
    else (kind = m.scopeId === "org" ? "Org lesson" : m.scopeId.startsWith("personal/") ? "Your lesson" : m.scopeId.startsWith("repo/") ? "Repo lesson" : "Team lesson"), (kcls = "lesson");

    let prov;
    if (m.locked) prov = `Set by ${handleChip(author)}${p ? ` · ${esc(p.title)}` : ""} · locked ${esc(day(o ? o.at : m.createdAt))}`;
    else if (o && o.type === "correction") prov = `Learned from ${whose(o.actor)} correction · ${esc(ago(o.at))}`;
    else if (o && o.type === "review_comment") prov = `Learned from ${whose(o.actor)} review · ${esc(ago(o.at))}`;
    else if (o && o.type === "agent") prov = `Proposed by an agent · ${esc(ago(o.at))}`;
    else prov = `Written by ${handleChip(author)} · ${esc(ago(o ? o.at : m.createdAt))}`;

    const q = quoteOf(m);
    const quote = q
      ? `<div class="hm-quote">“${rich(q)}”<small>${isAgent(o.actor) ? "an agent" : "@" + esc(handleOf(o.actor))}${o.ref ? ` · ${esc(o.ref)}` : ""} · ${esc(stamp(o.at))}</small></div>`
      : m.body
        ? `<div class="hm-quote">${rich(m.body)}</div>`
        : "";

    const facts = [`<dt>Scope</dt><dd>${scopeChip(m.scopeId)}</dd>`];
    const ap = approvedBy(m);
    if (m.status === "pending") facts.push(`<dt>Approval</dt><dd>Waiting on ${handleChip(approverOf(m.scopeId) || "jordan")}</dd>`);
    else if (m.status === "blocked") {
      const slug = ((m.blockedReason || "").match(/\[\[([\w-]+)\]\]/) || [])[1];
      facts.push(`<dt>Blocked by</dt><dd>${slug ? linkChip(slug) : rich(m.blockedReason || "a locked rule")}</dd>`);
    } else if (m.status === "rejected") facts.push(`<dt>Approval</dt><dd class="muted">Rejected</dd>`);
    else if (ap) facts.push(`<dt>Approved by</dt><dd>${handleChip(ap.actor)}· ${esc(day(ap.at))}</dd>`);
    if (m.status === "active") {
      const got = S.transfer.filter((t) => t.lesson === m.slug);
      facts.push(`<dt>Reaches</dt><dd>${REACH.map((t) => `<span class="pill">${t}</span>`).join("")}</dd>`);
      if (got.length) facts.push(`<dt>Used by</dt><dd>${[...new Set(got.map((t) => t.to))].map((h) => handleChip(h)).join("")}</dd>`);
    }
    const lines = hr ? hr.lines : [];
    if (lines.length)
      facts.push(`<dt>Applies here</dt><dd>${lines.slice(0, 6).map((l) => `<a class="hm-link" data-act="reveal" data-id="${esc(hr.id)}" data-line="${l}">line ${l}</a>`).join("")}</dd>`);

    const n = S.notes[m.id];
    let btns = "";
    if (m.status === "pending" && canDecide(m))
      btns += S.busy[m.id] ? `<span class="hm-status ok">Saving…</span>` : `<button class="btn primary" data-act="approve" data-id="${esc(m.id)}">Approve</button><button class="btn ghost" data-act="reject" data-id="${esc(m.id)}">Reject</button>`;
    else if (m.status === "blocked" && myRole() === "security") btns += `<button class="btn ghost" data-act="reject" data-id="${esc(m.id)}">Dismiss</button>`;
    if (lines.length) btns += `<button class="btn ghost" data-act="reveal" data-id="${esc(hr.id)}">Show in file</button>`;
    btns += `<a class="hm-link" data-act="dashboard" data-path="${m.status === "pending" || m.status === "blocked" ? "/app/approvals" : "/app"}">Open in Hivemind</a>`;

    return `${back}<div class="hm-d">
      <div class="hm-kind ${kcls}">${esc(kind)}</div>
      <h3>${titleHtml(m.title, m)}</h3>
      <div class="hm-prov">${prov}</div>
      ${quote}
      <dl class="hm-facts">${facts.join("")}</dl>
      ${q && m.body ? `<div class="body">${rich(m.body)}</div>` : ""}
      <div class="hm-btns">${btns}</div>
      ${n ? `<div class="hm-note ${n.tone}">${n.html}</div>` : ""}
    </div>`;
  }

  function loadingOr() {
    if (S.loadErr) return emptyBlock(esc(S.loadErr), `<a class="hm-link" data-act="settings">Open settings</a> · <a class="hm-link" data-act="reload">Retry</a>`);
    return emptyBlock("Loading…");
  }

  // ---------- teach box ----------
  function teachScopes() {
    const repo = (S.ctx && S.ctx.repo) || "";
    if (!repo) return [`personal/${me()}`];
    const team = (scopeById(repo) || {}).parentId;
    return team && team !== "org" ? [repo, team] : [repo];
  }
  function renderTeach() {
    const list = teachScopes();
    if (!list.includes(S.teach.scope)) S.teach.scope = list[0];
    const id = S.teach.scope;
    const k = id.startsWith("personal/") ? "you" : id.split("/")[0];
    $("teachScope").innerHTML = `<button type="button" class="chip ${k}" data-act="teachScope" title="Scope: click to change"><i></i>#${esc(id.startsWith("personal/") ? "you" : id)}</button>`;
    $("teachSend").classList.toggle("on", teachIn.value.trim().length > 0 && !S.teach.busy);
    teachIn.disabled = S.teach.busy;
    const sent = $("teachSent");
    const n = S.teach.note;
    sent.hidden = !n;
    if (n) {
      sent.className = `sent ${n.tone || ""}`;
      sent.innerHTML = n.html;
    }
  }
  function growTeach() {
    teachIn.style.height = "auto";
    teachIn.style.height = Math.min(teachIn.scrollHeight, 76) + "px";
  }
  let teachTimer;
  function teachNote(note, ms) {
    clearTimeout(teachTimer);
    S.teach.note = note;
    renderTeach();
    if (ms) teachTimer = setTimeout(() => ((S.teach.note = null), renderTeach()), ms);
  }

  // ---------- render ----------
  function renderContent() {
    const html = { here: renderHere, all: renderAll, approvals: renderApprovals }[S.tab]();
    $("content").innerHTML = html + renderFeed();
  }
  let detailKey = null;
  function renderDetailPane() {
    const open = !!S.detail;
    if (open) detailEl.innerHTML = renderDetail();
    if (open && detailKey !== S.detail) {
      detailEl.classList.remove("open");
      void detailEl.offsetWidth; // restart the 180ms slide
      const d = detailEl.querySelector(".hm-d");
      if (d) d.scrollTop = 0;
    }
    detailEl.classList.toggle("open", open);
    detailEl.setAttribute("aria-hidden", String(!open));
    detailKey = S.detail;
  }
  function render() {
    renderHead();
    renderTabs();
    renderContent();
    renderDetailPane();
    renderTeach();
  }

  // ---------- data ----------
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    const r = await rpc("load");
    loading = false;
    if (r.ok) {
      const before = S.loaded ? new Map(S.all.map((m) => [m.id, m.status])) : null;
      Object.assign(S, { scopes: r.data.scopes, people: r.data.people, chain: r.data.chain, all: r.data.all, transfer: r.data.transfer, loaded: true, loadErr: null, online: true });
      // my lesson went pending → active since the last load: play the seal (deduped with hivemind.sidebar.celebrate)
      if (before)
        for (const m of S.all) {
          const mineM = m.author === me() || (origin(m) || {}).actor === me();
          if (mineM && m.status === "active" && before.get(m.id) === "pending") celebrate({ ruleId: m.id });
        }
    } else {
      if (!S.loaded) S.loadErr = r.error || "Couldn't load rules.";
      if (r.status === 0) S.online = false;
    }
    render();
  }

  function pretty403(err, m) {
    const role = ROLE[myRole()];
    const a = m ? approverOf(m.scopeId) : null;
    const hit = String(err).match(/cannot (approve|reject) memories in (\S+)/);
    if (hit) return `As @${esc(me())} (${role}) you can’t ${hit[1]} lessons in #${esc(hit[2])}. Waiting on ${handleChip(a || "jordan")}.`;
    if (/locked memories/.test(err)) return `Locked rules can only be changed by Security (${handleChip(security())}).`;
    if (/^blocked:/.test(err)) return `This lesson breaks a locked rule. Only Security (${handleChip(security())}) can dismiss it.`;
    return rich(err);
  }

  async function decide(id, op) {
    const m = findMem(id);
    S.busy[id] = true;
    delete S.notes[id];
    render();
    const r = await rpc(op, { id: m ? m.id : id });
    delete S.busy[id];
    if (r.ok) {
      const scope = (r.data && r.data.scopeId) || (m && m.scopeId) || "";
      S.notes[id] =
        op === "approve"
          ? { tone: "ok", html: `Approved. Every agent on #${esc(scope)} gets it next session.` }
          : { tone: "", html: m && m.status === "blocked" ? "Dismissed." : "Rejected. Agents won’t get it." };
      await load();
    } else {
      S.notes[id] = { tone: "err", html: r.status === 403 ? pretty403(r.error || "", m) : `Couldn’t save: ${esc(r.error)}` };
    }
    render();
  }

  async function teach() {
    const text = teachIn.value.trim();
    if (!text || S.teach.busy) return;
    if (text.length < 6) return teachNote({ tone: "muted", html: "Write the rule as one short sentence." }, 3000);
    S.teach.busy = true;
    teachNote({ tone: "muted", html: "Capturing…" });
    const r = await rpc("teach", { text, scope: S.teach.scope.startsWith("personal/") ? "" : S.teach.scope });
    S.teach.busy = false;
    if (!r.ok) return teachNote({ tone: "err", html: `Couldn’t save: ${esc(r.error)}` }, 6000);
    teachIn.value = "";
    growTeach();
    const l = (r.data.lessons || [])[0];
    if (!l) teachNote({ tone: "muted", html: "Saved. The team already has this lesson." }, 3000);
    else if (l.status === "blocked") {
      const slug = ((l.blockedReason || "").match(/\[\[([\w-]+)\]\]/) || [])[1];
      teachNote({ tone: "blocked", html: `Blocked by a locked rule${slug ? `: ${esc(noEmoji((findMem(slug) || { title: slug }).title))}` : ""}.` }, 6000);
    } else if (l.status === "active") teachNote({ tone: "", html: "Lesson added." }, 3000);
    else teachNote({ tone: "", html: `Lesson proposed. Waiting on @${esc(approverOf(l.scopeId) || "jordan")}.` }, 3000);
    await load();
  }

  async function lockRule(form) {
    const L = S.lock;
    L.scopeId = form.scopeId.value;
    L.title = form.title.value.trim();
    L.body = form.body.value.trim();
    if (L.title.length < 6) {
      L.note = { tone: "err", html: "Write the rule as one short sentence." };
      return render();
    }
    L.busy = true;
    L.note = null;
    render();
    const r = await rpc("lock", { scopeId: L.scopeId, title: L.title, body: L.body });
    L.busy = false;
    if (r.ok) {
      L.note = { tone: "ok", html: `Locked. Every agent on #${esc(r.data.scopeId)} gets it next session.` };
      L.title = L.body = "";
      await load();
    } else L.note = { tone: "err", html: r.status === 403 ? `Only Security can lock rules. You’re @${esc(me())} (${ROLE[myRole()]}).` : `Couldn’t lock: ${esc(r.error)}` };
    render();
  }

  // ---------- celebration (§2g) ----------
  function celebrate(c) {
    const key = c.ruleId || c.title;
    if (!key || (S.celebrated[key] && Date.now() - S.celebrated[key] < 60000)) return;
    S.celebrated[key] = Date.now();
    const m = c.ruleId ? findMem(c.ruleId) : null;
    const title = c.title || (m && m.title) || "";
    const scope = String(c.scope || (m && m.scopeId) || "").replace(/^#/, "");
    const ap = handleOf(c.approver || (m && approvedBy(m) && approvedBy(m).actor) || (scope && approverOf(scope)) || "jordan");
    const slot = $("cele");
    slot.innerHTML = `<div class="hm-cele" role="status">
      <svg viewBox="0 0 100 100"><path class="cell" d="${HEX}"/><path class="ring" d="${HEX}"/></svg>
      <div><div class="a">${handleChip(ap)}approved your lesson</div><div class="b">${titleHtml(title, m)}</div>${
        scope ? `<div class="c">Every agent on #${esc(scope)} gets it next session.</div>` : ""
      }</div></div>`;
    bodyEl.scrollTop = 0;
    S.flash = { id: c.ruleId || (m && m.id) || null, until: Date.now() + 1200 };
    renderContent();
    setTimeout(() => {
      const card = slot.firstElementChild;
      if (!card) return;
      card.classList.add("out");
      setTimeout(() => card.parentNode === slot && slot.removeChild(card), 260);
    }, 6000);
    if (!m || m.status !== "active") load();
  }

  // ---------- events ----------
  function openDetail(id) {
    if (!S.detail) S.detailFrom = S.tab;
    S.detail = id;
    render();
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.tagName === "SELECT") return;
    const act = el.getAttribute("data-act");
    const id = el.getAttribute("data-id");
    if (act === "tab") {
      S.tab = el.getAttribute("data-tab");
      S.detail = null;
      persist();
      if (S.tab === "here") rpc("here");
      bodyEl.scrollTop = 0;
      return render();
    }
    if (act === "toggle") {
      const k = el.getAttribute("data-key");
      S.collapsed[k] = !S.collapsed[k];
      persist();
      return renderContent();
    }
    if (act === "feed") {
      S.feedOpen = !S.feedOpen;
      persist();
      return renderContent();
    }
    if (act === "detail") return openDetail(id);
    if (act === "here") {
      rpc("reveal", { id });
      return openDetail(id);
    }
    if (act === "reveal") return void rpc("reveal", { id, line: el.getAttribute("data-line") || "" });
    if (act === "back") {
      S.detail = null;
      return render();
    }
    if (act === "approve" || act === "reject") return void decide(id, act);
    if (act === "teachScope") {
      const list = teachScopes();
      S.teach.scope = list[(list.indexOf(S.teach.scope) + 1) % list.length];
      return renderTeach();
    }
    if (act === "open") return vscode.postMessage({ type: "open", url: el.getAttribute("data-url") });
    if (act === "dashboard") return vscode.postMessage({ type: "dashboard", path: el.getAttribute("data-path") });
    if (act === "settings") return vscode.postMessage({ type: "settings" });
    if (act === "reload") return void load();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.detail) {
      S.detail = null;
      render();
    }
    if (e.target === teachIn && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      teach();
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.getAttribute("data-act") === "viewAs") {
      S.notes = {};
      S.lock.note = null;
      rpc("viewAs", { id: e.target.value });
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target === teachIn) {
      growTeach();
      $("teachSend").classList.toggle("on", teachIn.value.trim().length > 0);
    }
    const f = e.target.closest && e.target.closest("[data-form=lock]");
    if (f && e.target.name) S.lock[e.target.name] = e.target.value;
  });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "teachForm") teach();
    if (e.target.getAttribute("data-form") === "lock") lockRule(e.target);
  });

  window.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "rpc") {
      const fn = pending.get(m.id);
      pending.delete(m.id);
      return fn && fn(m);
    }
    if (m.type === "ctx") {
      const changed = !S.ctx || S.ctx.repo !== m.repo || S.ctx.me !== m.me;
      S.ctx = m;
      render();
      if (changed || !S.loaded) load();
    } else if (m.type === "here") {
      S.here = m;
      renderHead();
      if (S.tab === "here") renderContent();
      if (S.detail) renderDetailPane();
    } else if (m.type === "live") {
      const wasOnline = S.online;
      S.online = !!m.ok;
      if (m.ok) {
        S.live = m.data;
        const f = (m.data.feed || [])[0];
        const sig = `${f ? f.id + f.at : ""}|${(m.data.items || []).map((i) => i.id).join(",")}`;
        const changed = sig !== S.liveSig;
        if (S.liveSig && changed) load(); // approvals / new lessons elsewhere: refresh the lists
        S.liveSig = sig;
        if (changed) renderContent();
      }
      if (wasOnline !== S.online) renderHead();
    } else if (m.type === "reload") load();
    else if (m.type === "detail") openDetail(m.id);
    else if (m.type === "celebrate") celebrate(m);
    else if (m.type === "tab") {
      S.tab = m.tab;
      S.detail = null;
      persist();
      render();
    }
  });

  render();
  vscode.postMessage({ type: "ready" });
})();
