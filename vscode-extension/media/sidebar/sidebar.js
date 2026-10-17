// Hivemind side panel webview. Plain JS (no bundler, no remote code). Every API call goes through postMessage to
// the extension host (src/sidebar/index.ts), which holds the token. Render = rebuild #app from state `S`.
(function () {
  "use strict";
  const vscode = acquireVsCodeApi();
  const saved = vscode.getState() || {};

  const S = {
    ctx: null, // { me, settingsUser, repo, workspaceName, apiUrl, dashboardUrl, hasToken }
    tab: saved.tab || "rules", // rules | here | queue | live
    collapsed: saved.collapsed || {},
    scopes: [],
    people: [],
    chain: null,
    all: [],
    transfer: [],
    loaded: false,
    loadErr: null,
    here: null, // { file, data: RulesResponse | null }
    live: null,
    liveErr: null,
    liveTop: "",
    detail: null, // memory id or slug
    notes: {}, // memory id → { tone: ok|warn|err, html }
    busy: {}, // memory id → true while approving/rejecting
    teach: { busy: false, text: "", note: null },
    lock: { scopeId: "org", title: "", body: "", busy: false, note: null },
  };
  const persist = () => vscode.setState({ tab: S.tab, collapsed: S.collapsed });

  // ---------- rpc ----------
  let seq = 0;
  const pending = new Map();
  function rpc(op, args) {
    const id = ++seq;
    vscode.postMessage({ type: "rpc", id, op, args: args || {} });
    return new Promise((resolve) => pending.set(id, resolve));
  }

  // ---------- text helpers ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const EMOJI = /(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{231A}-\u{23FF}]️?)\s?/gu;
  const noEmoji = (s) => String(s == null ? "" : s).replace(EMOJI, "");

  const scopeKind = (id) => (id === "org" ? "org" : id.split("/")[0]);
  const chipScope = (id) => `<span class="chip ${scopeKind(id)}"><i></i>#${esc(id)}</span>`;
  const chipPerson = (id) => `<span class="chip person"><i></i>@${esc(id)}</span>`;
  const chipLink = (slug) => `<a class="chip link" data-act="slug" data-slug="${esc(slug)}"><i></i>${esc(slug)}</a>`;

  /** Markdown-ish rule text → HTML with #scope / @person / [[slug]] chips and `code`. Input is escaped first. */
  function rich(s) {
    let t = esc(noEmoji(s));
    const codes = [];
    t = t.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    t = t.replace(/\[\[([a-z0-9][\w-]*)\]\]/gi, (_, slug) => chipLink(slug));
    t = t.replace(/(^|[\s(,])#((?:team|repo|personal)\/[\w-]+|org)\b/g, (_, p, id) => p + chipScope(id));
    t = t.replace(/(^|[\s(,])@([a-z][\w-]*)/gi, (_, p, id) => p + chipPerson(id.toLowerCase()));
    t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
    return t;
  }

  const isAgent = (actor) => /^agent(:|$)/.test(actor || "");
  const who = (actor) => (isAgent(actor) ? `<span class="muted">an agent</span>` : chipPerson(actor || "someone"));
  const whose = (actor) => (isAgent(actor) ? `an agent's` : `${chipPerson(actor)}'s`);

  function ago(iso) {
    const t = new Date(iso).getTime();
    if (!t) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 86400 * 14) return `${Math.round(s / 86400)}d ago`;
    return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const TOOLS = {
    "claude-code": "Claude Code",
    cursor: "Cursor",
    "gemini-cli": "Gemini CLI",
    copilot: "Copilot",
    codex: "Codex",
    "claude-ai": "Claude",
    windsurf: "Windsurf",
    vscode: "VS Code",
  };
  const toolBadge = (agent) => (TOOLS[agent] ? `<span class="tool">${TOOLS[agent]}</span>` : "");
  const ROLE = { security: "Security", lead: "Lead", engineer: "Engineer" };

  // ---------- org model ----------
  const scopeById = (id) => S.scopes.find((s) => s.id === id);
  const person = (id) => S.people.find((p) => p.id === id);
  const me = () => (S.ctx && S.ctx.me) || "";
  const myRole = () => (person(me()) || {}).role || "engineer";
  const security = () => (S.people.find((p) => p.role === "security") || {}).id || "security";
  function chainOf(id) {
    const out = [];
    for (let s = scopeById(id), n = 0; s && n < 8; s = scopeById(s.parentId), n++) out.unshift(s.id);
    return out;
  }
  /** Who approves lessons in a scope: its owner, else the nearest owned ancestor. */
  function approverOf(scopeId) {
    const ch = chainOf(scopeId).reverse();
    for (const id of ch) {
      const s = scopeById(id);
      if (s && s.owner && !(s.level === "personal" && id !== scopeId)) return s.owner;
    }
    return null;
  }
  const findMem = (key) => S.all.find((m) => m.id === key || m.slug === key) || (S.chain || []).find((m) => m.id === key || m.slug === key);
  const conf = (m) => (m.locked ? 1 : m.alpha / Math.max(0.0001, m.alpha + m.beta));
  const approvedBy = (m) => {
    const e = [...(m.evidence || [])].reverse().find((x) => x.type === "manual" && /^Approved by /.test(x.quote));
    return e ? { actor: e.actor, at: e.at } : null;
  };
  const origin = (m) => (m.evidence || []).find((x) => !(x.type === "manual" && /^Approved by /.test(x.quote))) || null;
  const firstName = () => S.ctx && S.ctx.workspaceName;

  // ---------- pieces ----------
  function confBar(m) {
    const c = conf(m);
    return `<span class="bar" title="confidence ${Math.round(c * 100)}%"><span data-w="${Math.round(c * 100)}"></span></span>`;
  }

  function statusLine(m) {
    if (m.status === "blocked") return `<span class="tag lock">blocked</span><span class="reason">${rich(m.blockedReason || "conflicts with a locked rule")}</span>`;
    if (m.status === "pending") {
      const a = approverOf(m.scopeId);
      return `<span class="tag wait">waiting</span><span class="muted">on ${a ? chipPerson(a) : "a lead"}</span>`;
    }
    if (m.status === "rejected") return `<span class="tag">rejected</span>`;
    if (m.locked) return `<span class="tag lock">locked</span><span class="muted">${who(m.author)}${roleOf(m.author)}</span>`;
    if (m.kind === "owner") return `<span class="tag">owner</span>`;
    return `${confBar(m)}<span class="muted">${whose(m.author)} lesson</span>`;
  }
  const roleOf = (id) => (person(id) ? `<span class="dim">, ${ROLE[person(id).role]}</span>` : "");

  function ruleRow(m) {
    const cls = m.status === "blocked" ? "blocked" : m.status === "pending" ? "pending" : m.locked ? "locked" : m.kind === "owner" ? "owner" : "lesson";
    return `<div class="row ${cls}" data-act="detail" data-id="${esc(m.id)}" tabindex="0">
      <span class="mark"></span>
      <div class="main"><div class="title">${esc(noEmoji(m.title))}</div><div class="meta">${statusLine(m)}</div></div>
    </div>`;
  }

  function rank(m) {
    if (m.locked) return 0;
    if (m.status === "active" && m.kind !== "owner") return 1;
    if (m.status === "pending") return 2;
    if (m.status === "blocked") return 3;
    return 4;
  }
  const sortRules = (list) => list.slice().sort((a, b) => rank(a) - rank(b) || conf(b) - conf(a) || a.title.localeCompare(b.title));

  // ---------- tabs ----------
  function renderRules() {
    if (!S.loaded) return loadingOr();
    const repo = (S.ctx && S.ctx.repo) || "";
    const ids = repo ? chainOf(repo) : ["org"];
    const layers = ids.map((id) => ({ id, label: scopeKind(id) }));
    layers.push({ id: `personal/${me()}`, label: "personal" });
    const src = (S.chain || S.all).concat(S.all.filter((m) => m.scopeId === `personal/${me()}`));
    const seen = new Set();
    const live = src.filter((m) => m.status !== "rejected" && m.status !== "invalid" && !seen.has(m.id) && seen.add(m.id));
    return layers
      .map(({ id, label }) => {
        const list = sortRules(live.filter((m) => m.scopeId === id));
        const closed = !!S.collapsed[id];
        const locked = list.filter((m) => m.locked).length;
        const wait = list.filter((m) => m.status === "pending").length;
        const counts = [
          locked ? `<span class="n lock">${locked} locked</span>` : "",
          `<span class="n">${list.length - locked - wait} active</span>`,
          wait ? `<span class="n wait">${wait} waiting</span>` : "",
        ].join("");
        const name = label === "personal" ? chipPerson(me()) : chipScope(id);
        return `<section class="layer ${closed ? "closed" : ""}">
          <header data-act="toggle" data-id="${esc(id)}" tabindex="0"><span class="caret"></span><span class="lvl">${label}</span>${name}<span class="counts">${counts}</span></header>
          <div class="rows">${list.length ? list.map(ruleRow).join("") : `<div class="empty">No rules at this layer yet.</div>`}</div>
        </section>`;
      })
      .join("");
  }

  function renderHere() {
    const h = S.here;
    if (!h || !h.file) return `<div class="empty pad">Open a file to see the rules that apply to it.</div>`;
    const d = h.data;
    const head = `<div class="filehead"><span class="file">${esc(h.file)}</span>${d ? chipScope(d.repo) : ""}</div>`;
    if (!d) return head + `<div class="empty pad">Hivemind can't load rules for this file. <a data-act="settings">Check settings</a></div>`;
    const rules = d.rules.filter((r) => r.kind !== "owner");
    const rows = rules
      .map((r) => {
        const m = findMem(r.id);
        const prov = r.locked
          ? `<span class="tag lock">locked</span><span class="muted">${chipPerson(r.ownerId)}<span class="dim">, ${esc(r.ownerRole)}</span></span>`
          : `${m ? confBar(m) : ""}<span class="muted">${isAgent(r.ownerId) ? "an agent's" : chipPerson(r.ownerId) + "'s"} lesson</span>`;
        const extra = [
          r.mentionsFile ? `<span class="tag accent">names this file</span>` : "",
          ...(r.symbols || []).slice(0, 3).map((s) => `<code>${esc(s)}</code>`),
        ].join("");
        return `<div class="row ${r.locked ? "locked" : "lesson"}" data-act="detail" data-id="${esc(r.id)}" tabindex="0">
          <span class="mark"></span>
          <div class="main"><div class="title">${esc(noEmoji(r.title))}</div><div class="meta">${prov}</div>${extra ? `<div class="meta">${extra}</div>` : ""}</div>
        </div>`;
      })
      .join("");
    const wait = d.pending && d.pending.count
      ? `<div class="foot">${d.pending.count} ${d.pending.count === 1 ? "lesson" : "lessons"} waiting on ${d.approver ? chipPerson(d.approver.id) : "a lead"}</div>`
      : "";
    return head + (rows || `<div class="empty pad">No team rules apply to this file.</div>`) + wait;
  }

  function queueItems() {
    const role = myRole();
    const home = (person(me()) || {}).scopeId;
    if (role === "lead") return S.all.filter((m) => m.status === "pending" && home && chainOf(m.scopeId).includes(home));
    if (role === "security") return S.all.filter((m) => m.status === "blocked");
    return S.all.filter((m) => m.author === me() || (origin(m) || {}).actor === me());
  }

  function card(m, actions) {
    const o = origin(m);
    const n = S.notes[m.id];
    return `<div class="card ${m.status}">
      <div class="title" data-act="detail" data-id="${esc(m.id)}">${esc(noEmoji(m.title))}</div>
      <div class="meta">${chipScope(m.scopeId)}<span class="muted">${o ? `${who(o.actor)} · ${ago(o.at)}` : ago(m.createdAt)}</span></div>
      ${o && o.quote ? `<blockquote>${rich(o.quote)}</blockquote>` : ""}
      <div class="meta">${statusLine(m)}</div>
      ${actions ? `<div class="actions">${actions}</div>` : ""}
      ${n ? `<div class="note ${n.tone}">${n.html}</div>` : ""}
    </div>`;
  }
  const decideBtns = (m, approveLabel) =>
    S.busy[m.id]
      ? `<span class="muted">Saving…</span>`
      : `<button class="primary" data-act="approve" data-id="${esc(m.id)}">${approveLabel || "Approve"}</button><button data-act="reject" data-id="${esc(m.id)}">Reject</button>`;

  function renderQueue() {
    if (!S.loaded) return loadingOr();
    const role = myRole();
    const items = queueItems().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    let out = "";
    if (role === "lead") {
      const team = (person(me()) || {}).scopeId;
      out += `<div class="sub">Lessons waiting on you in ${team ? chipScope(team) : "your team"}</div>`;
      out += items.length ? items.map((m) => card(m, decideBtns(m))).join("") : `<div class="empty pad">Nothing waiting. Agents will propose lessons as people correct them.</div>`;
      const blocked = S.all.filter((m) => m.status === "blocked" && team && chainOf(m.scopeId).includes(team));
      if (blocked.length)
        out += `<div class="sub">Stopped by a locked rule <span class="dim">· only ${chipPerson(security())} can unblock</span></div>` + blocked.map((m) => card(m)).join("");
    } else if (role === "security") {
      out += `<div class="sub">Stopped by a locked rule</div>`;
      out += items.length ? items.map((m) => card(m, decideBtns(m, "Unblock"))).join("") : `<div class="empty pad">No blocked lessons.</div>`;
      out += lockForm();
    } else {
      out += `<div class="sub">Your proposals</div>`;
      out += items.length
        ? items.map((m) => card(m)).join("")
        : `<div class="empty pad">You haven't taught Hivemind anything yet. Correct an agent, or use the box below.</div>`;
    }
    return out;
  }

  function lockForm() {
    const L = S.lock;
    const opts = S.scopes
      .filter((s) => s.level !== "personal")
      .map((s) => `<option value="${esc(s.id)}" ${s.id === L.scopeId ? "selected" : ""}>#${esc(s.id)}</option>`)
      .join("");
    return `<form class="lockform" data-form="lock">
      <div class="sub">Lock a rule <span class="dim">· agents can never override it</span></div>
      <label>Applies to<select name="scopeId">${opts}</select></label>
      <input name="title" placeholder="Rule, e.g. Never send lab data to third-party APIs" value="${esc(L.title)}" maxlength="140">
      <textarea name="body" rows="2" placeholder="Why, and what to do instead (optional)">${esc(L.body)}</textarea>
      <div class="actions"><button class="primary lockbtn" type="submit" ${L.busy ? "disabled" : ""}>${L.busy ? "Locking…" : "Lock rule"}</button></div>
      ${L.note ? `<div class="note ${L.note.tone}">${L.note.html}</div>` : ""}
    </form>`;
  }

  function renderLive() {
    if (!S.live) return S.liveErr ? `<div class="empty pad">${esc(S.liveErr)}</div>` : `<div class="empty pad">Connecting…</div>`;
    const rows = [];
    for (const it of S.live.items || [])
      rows.push({
        at: it.createdAt,
        hot: !!it.warning,
        html: `${who(it.actor)} ${toolBadge(it.agent)}<span class="txt">edited <span class="file">${esc(it.repo ? it.repo + "/" : "")}${esc(it.file)}</span></span>${
          it.warning ? `<div class="warn">${rich(it.warning)}. Check before you both change the same lines.</div>` : ""
        }`,
      });
    for (const f of S.live.feed || []) {
      if (f.type === "collision") continue; // shown on the activity row itself
      rows.push({ at: f.at, type: f.type, html: `${who(f.actor)} ${toolBadge(f.agent)}<span class="txt">${rich(f.text)}</span>` });
    }
    rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (!rows.length) return `<div class="empty pad">Quiet. Agent sessions, corrections and edits show up here.</div>`;
    return rows
      .slice(0, 40)
      .map((r) => `<div class="ev ${r.hot ? "hot" : ""} ${r.type || "edit"}"><span class="dot"></span><div class="main">${r.html}</div><span class="when">${ago(r.at)}</span></div>`)
      .join("");
  }

  function renderDetail() {
    const m = findMem(S.detail);
    const back = `<div class="back"><a data-act="back">‹ Back</a></div>`;
    if (!m) return back + (S.loaded ? `<div class="empty pad">This rule isn't in Hivemind anymore.</div>` : loadingOr());
    const o = origin(m);
    const ap = approvedBy(m);
    const kindWord = { correction: "correction", review_comment: "review comment", agent: "proposal", manual: "note" };

    // provenance first: where the rule came from
    let prov;
    if (m.locked) prov = `Set by ${who(m.author)} · locked rule${o ? ` · ${ago(o.at)}` : ""}`;
    else if (o && (o.type === "correction" || o.type === "review_comment")) prov = `Learned from ${whose(o.actor)} ${kindWord[o.type]} · ${ago(o.at)}`;
    else if (o && o.type === "agent") prov = `Proposed by an agent${o.ref ? ` <span class="dim">(${esc(o.ref)})</span>` : ""} · ${ago(o.at)}`;
    else prov = `Written by ${who(m.author)} · ${ago(o ? o.at : m.createdAt)}`;

    let decision = "";
    if (m.status === "pending") {
      const a = approverOf(m.scopeId);
      decision = `<div class="kv"><span class="k">Approval</span><span>Waiting on ${a ? chipPerson(a) : "a lead"}</span></div>`;
    } else if (m.status === "blocked") {
      decision = `<div class="kv"><span class="k">Blocked</span><span class="reason">${rich(m.blockedReason || "Conflicts with a locked rule")}</span></div>`;
    } else if (m.status === "rejected") {
      decision = `<div class="kv"><span class="k">Approval</span><span>Rejected</span></div>`;
    } else if (ap) {
      decision = `<div class="kv"><span class="k">Approved</span><span>by ${chipPerson(ap.actor)} · ${ago(ap.at)}</span></div>`;
    } else if (m.locked) {
      const p = person(m.author);
      decision = `<div class="kv"><span class="k">Owner</span><span>${chipPerson(m.author)}${p ? ` <span class="dim">${esc(p.title)}</span>` : ""}</span></div>`;
    }

    const got = S.transfer.filter((t) => t.lesson === m.slug);
    let reach;
    if (m.status !== "active") reach = `<span class="muted">${m.status === "pending" ? "No agent gets it until it's approved." : "Never sent to agents."}</span>`;
    else if (got.length)
      reach = got
        .map((t) => `<span class="reach">${chipPerson(t.to)}<span class="dim">'s agent · ${ago(t.at)}</span></span>`)
        .join("");
    else reach = `<span class="muted">Every agent session under ${chipScope(m.scopeId)} loads it at start: Claude Code, Cursor, Gemini CLI, Copilot, Codex.</span>`;

    const ev = (m.evidence || [])
      .map(
        (e) => `<li><div class="meta">${who(e.actor)}<span class="dim">${esc(kindWord[e.type] || e.type)} · ${ago(e.at)}${e.ref ? ` · ${esc(e.ref)}` : ""}</span>${
          e.url ? `<a data-act="open" data-url="${esc(e.url)}">source</a>` : ""
        }</div><div class="q">${rich(e.quote)}</div></li>`,
      )
      .join("");

    const canDecide = m.status === "pending" || m.status === "blocked";
    const n = S.notes[m.id];
    return `${back}<article class="detail ${m.locked ? "locked" : m.status}">
      <div class="dtitle">${esc(noEmoji(m.title))}</div>
      <div class="meta">${m.locked ? `<span class="tag lock">locked rule</span>` : m.kind === "owner" ? `<span class="tag">owner</span>` : `<span class="tag lesson">lesson</span>`}${chipScope(m.scopeId)}${
        m.status !== "active" ? `<span class="tag ${m.status === "blocked" ? "lock" : "wait"}">${esc(m.status)}</span>` : ""
      }</div>
      <div class="prov">${prov}</div>
      ${o && o.quote && !/^(Written|Proposed) by /.test(o.quote) ? `<blockquote>${rich(o.quote)}</blockquote>` : ""}
      ${decision}
      <div class="kv"><span class="k">Received by</span><span class="reachlist">${reach}</span></div>
      <div class="kv"><span class="k">Confidence</span><span>${confBar(m)} <span class="dim">${Math.round(conf(m) * 100)}% · ${(m.evidence || []).length} evidence</span></span></div>
      <h4>Rule</h4>
      <div class="body">${rich(m.body)}</div>
      ${ev ? `<h4>Evidence</h4><ul class="evidence">${ev}</ul>` : ""}
      ${canDecide ? `<div class="actions">${decideBtns(m, m.status === "blocked" ? "Unblock" : "Approve")}</div>` : ""}
      ${n ? `<div class="note ${n.tone}">${n.html}</div>` : ""}
      <div class="links"><a data-act="dashboard" data-path="${m.status === "pending" || m.status === "blocked" ? "/app/approvals" : "/app"}">Open in Hivemind</a></div>
    </article>`;
  }

  function loadingOr() {
    if (S.loadErr)
      return `<div class="empty pad">${esc(S.loadErr)}<br><a data-act="settings">Open settings</a> · <a data-act="reload">Retry</a></div>`;
    return `<div class="empty pad">Loading…</div>`;
  }

  // ---------- frame ----------
  function render() {
    const app = document.getElementById("app");
    const focusName = document.activeElement && document.activeElement.getAttribute("name");
    const focusPos = document.activeElement && document.activeElement.selectionStart;
    const c = S.ctx || {};
    const project = (c.repo || "").replace(/^repo\//, "");
    const ws = c.workspaceName || (scopeById("org") || {}).name || "Hivemind";
    const peopleOpts = S.people
      .map((p) => `<option value="${esc(p.id)}" ${p.id === me() ? "selected" : ""}>@${esc(p.id)} · ${ROLE[p.role]}</option>`)
      .join("");
    const qn = S.loaded ? queueItems().filter((m) => m.status === "pending" || m.status === "blocked").length : 0;
    const tab = (id, label, n) => `<button class="tab ${S.tab === id ? "on" : ""}" data-act="tab" data-tab="${id}">${label}${n ? `<span class="badge">${n}</span>` : ""}</button>`;
    const body = S.detail ? renderDetail() : { rules: renderRules, here: renderHere, queue: renderQueue, live: renderLive }[S.tab]();
    const T = S.teach;
    app.innerHTML = `
      <div class="top">
        <div class="ws"><span class="logo"></span><span class="wsname">${esc(ws)}</span>${project ? `<span class="sep">·</span><span class="proj">${esc(project)}</span>` : ""}</div>
      </div>
      <nav class="tabs">${tab("rules", "Rules")}${tab("here", "Here")}${tab("queue", "Queue", qn)}${tab("live", "Live")}
        <label class="as" title="View the panel as someone else (role decides your queue)"><select data-act="viewAs" name="viewAs">${peopleOpts || `<option>@${esc(me())}</option>`}</select></label></nav>
      <main class="scroll">${body}</main>
      <form class="teach" data-form="teach">
        <input name="teach" placeholder="Teach Hivemind: e.g. Exports must call assertSingleCustomer()" value="${esc(T.text)}" ${T.busy ? "disabled" : ""} maxlength="400" autocomplete="off">
        <button class="primary" type="submit" ${T.busy ? "disabled" : ""}>${T.busy ? "…" : "Teach"}</button>
        ${T.note ? `<div class="note ${T.note.tone}">${T.note.html}</div>` : `<div class="hint">A correction for ${c.repo ? chipScope(c.repo) : "your team"}. Your lead approves it before agents use it.</div>`}
      </form>`;
    for (const el of app.querySelectorAll("[data-w]")) el.style.width = el.getAttribute("data-w") + "%";
    if (focusName) {
      const el = app.querySelector(`[name="${focusName}"]`);
      if (el && el.focus) {
        el.focus();
        if (focusPos != null && el.setSelectionRange) el.setSelectionRange(focusPos, focusPos);
      }
    }
  }

  // ---------- data ----------
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    const r = await rpc("load");
    loading = false;
    if (r.ok) {
      Object.assign(S, { scopes: r.data.scopes, people: r.data.people, chain: r.data.chain, all: r.data.all, transfer: r.data.transfer, loaded: true, loadErr: null });
      if (!S.people.some((p) => p.role === "security" && p.scopeId === "org") && S.lock.scopeId === "org" && !scopeById("org")) S.lock.scopeId = (S.scopes[0] || {}).id;
    } else if (!S.loaded) S.loadErr = r.error || "Couldn't load rules.";
    render();
  }

  function pretty403(err, m) {
    const role = ROLE[myRole()];
    const a = m ? approverOf(m.scopeId) : null;
    if (/cannot (approve|reject) memories in (\S+)/.test(err)) {
      const [, verb, scope] = err.match(/cannot (approve|reject) memories in (\S+)/);
      return `As ${chipPerson(me())} (${role}) you can't ${verb} lessons in ${chipScope(scope)}. Ask ${a ? chipPerson(a) : "the team lead"} or ${chipPerson(security())}.`;
    }
    if (/locked memories/.test(err)) return `Locked rules can only be changed by security (${chipPerson(security())}).`;
    if (/^blocked:/.test(err)) return `This lesson contradicts a locked rule. Only security (${chipPerson(security())}) can unblock it.`;
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
      S.notes[id] = op === "approve"
        ? { tone: "ok", html: `Approved. Agents under ${chipScope(r.data.scopeId)} get it next session.` }
        : { tone: "ok", html: "Rejected. Agents won't get it." };
      await load();
    } else {
      S.notes[id] = { tone: r.status === 403 ? "warn" : "err", html: r.status === 403 ? pretty403(r.error || "", m) : r.status === 409 ? esc(r.error) : `Couldn't save: ${esc(r.error)}` };
    }
    render();
  }

  async function teach(text) {
    const T = S.teach;
    if (text.trim().length < 6) {
      T.note = { tone: "warn", html: "Write the lesson as one short sentence." };
      return render();
    }
    T.busy = true;
    T.text = text;
    T.note = { tone: "", html: "Capturing…" };
    render();
    const r = await rpc("teach", { text: text.trim() });
    T.busy = false;
    if (!r.ok) {
      T.note = { tone: "err", html: `Couldn't save: ${esc(r.error)}` };
      return render();
    }
    T.text = "";
    const l = (r.data.lessons || [])[0];
    if (!l) T.note = { tone: "", html: "Saved your correction. It matches a lesson the team already has." };
    else if (l.status === "blocked")
      T.note = { tone: "err", html: `<b>Blocked by a locked rule.</b> <a data-act="detail" data-id="${esc(l.id)}">${esc(noEmoji(l.title))}</a>${l.blockedReason ? `<div>${rich(l.blockedReason)}</div>` : ""}` };
    else if (l.status === "active") T.note = { tone: "ok", html: `Lesson added: <a data-act="detail" data-id="${esc(l.id)}">${esc(noEmoji(l.title))}</a>` };
    else {
      const a = approverOf(l.scopeId);
      T.note = { tone: "ok", html: `Lesson proposed: <a data-act="detail" data-id="${esc(l.id)}">${esc(noEmoji(l.title))}</a>. Waiting on ${a ? chipPerson(a) : "your lead"}.` };
    }
    render();
    await load();
  }

  async function lockRule(form) {
    const L = S.lock;
    L.scopeId = form.scopeId.value;
    L.title = form.title.value.trim();
    L.body = form.body.value.trim();
    if (L.title.length < 6) {
      L.note = { tone: "warn", html: "Write the rule as one short sentence." };
      return render();
    }
    L.busy = true;
    L.note = null;
    render();
    const r = await rpc("lock", { scopeId: L.scopeId, title: L.title, body: L.body });
    L.busy = false;
    if (r.ok) {
      L.note = { tone: "ok", html: `Locked: <a data-act="detail" data-id="${esc(r.data.id)}">${esc(r.data.title)}</a>. Every agent under ${chipScope(r.data.scopeId)} gets it.` };
      L.title = L.body = "";
      await load();
    } else L.note = { tone: r.status === 403 ? "warn" : "err", html: r.status === 403 ? `Only security can lock rules. You're ${chipPerson(me())} (${ROLE[myRole()]}).` : `Couldn't lock: ${esc(r.error)}` };
    render();
  }

  // ---------- events ----------
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
    } else if (act === "toggle") {
      S.collapsed[id] = !S.collapsed[id];
      persist();
    } else if (act === "detail") S.detail = id;
    else if (act === "slug") S.detail = el.getAttribute("data-slug");
    else if (act === "back") S.detail = null;
    else if (act === "approve" || act === "reject") return void decide(id, act);
    else if (act === "open") return vscode.postMessage({ type: "open", url: el.getAttribute("data-url") });
    else if (act === "dashboard") return vscode.postMessage({ type: "dashboard", path: el.getAttribute("data-path") });
    else if (act === "settings") return vscode.postMessage({ type: "settings" });
    else if (act === "reload") return void load();
    else return;
    render();
    if (act === "detail" || act === "slug") document.querySelector(".scroll").scrollTop = 0;
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".row,[data-act=toggle]")) {
      e.preventDefault();
      e.target.click();
    }
    if (e.key === "Escape" && S.detail) {
      S.detail = null;
      render();
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
    if (e.target.name === "teach") S.teach.text = e.target.value;
    if (e.target.closest("[data-form=lock]")) S.lock[e.target.name] = e.target.value;
  });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.getAttribute("data-form");
    if (f === "teach") teach(e.target.teach.value);
    if (f === "lock") lockRule(e.target);
  });

  window.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "rpc") {
      const fn = pending.get(m.id);
      pending.delete(m.id);
      return fn && fn(m);
    }
    if (m.type === "ctx") {
      const userChanged = S.ctx && S.ctx.me !== m.me;
      const repoChanged = !S.ctx || S.ctx.repo !== m.repo;
      S.ctx = m;
      render();
      if (repoChanged || userChanged || !S.loaded) load();
    } else if (m.type === "here") {
      S.here = m;
      if (S.tab === "here" && !S.detail) render();
    } else if (m.type === "live") {
      if (m.ok) {
        S.live = m.data;
        S.liveErr = null;
        const f = (m.data.feed || [])[0];
        const top = f ? f.id + f.at : "";
        if (S.liveTop && top !== S.liveTop) load(); // something changed (approval, new lesson): refresh the rules
        S.liveTop = top;
      } else S.liveErr = m.error;
      const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if (S.tab === "live" && !S.detail && !typing) render();
    } else if (m.type === "reload") load();
    else if (m.type === "detail") {
      S.detail = m.id;
      render();
      const sc = document.querySelector(".scroll");
      if (sc) sc.scrollTop = 0;
    } else if (m.type === "tab") {
      S.tab = m.tab;
      S.detail = null;
      persist();
      render();
    }
  });

  render();
  vscode.postMessage({ type: "ready" });
})();
