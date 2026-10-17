// MCP Apps (io.modelcontextprotocol/ui, spec 2026-01-26) view for get_team_rules and propose_memory.
// Hand-written, no SDK: JSON-RPC over postMessage. Renders from the tool result's structuredContent:
//   { kind: "rules", header, rules: [{ title, sub, locked }] }                      → McpCheckCard
//   { kind: "proposal", scopeId, title, lead, status, reason?, approveUrl }          → McpApproveCard
// Design + strings: src/components/site/editor-mocks.tsx (McpCheckCard, McpApproveCard), public/brand/vscode/wording.md.
// Approve/Reject open the role-checked Hivemind approvals page: agents (and their UIs) never approve via MCP.

export const CARD_URI = "ui://hivemind/card.html";
export const CARD_MIME = "text/html;profile=mcp-app";

export const CARD_HTML = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { --honey:#F5A524; --rose:#FB7185; }
  [data-theme="dark"] { --bg:#202022; --line:rgba(255,255,255,.10); --div:rgba(255,255,255,.06); --text:#EDEDEF; --muted:#A1A1AA; --btn:#EDEDEF; --btnText:#111114; --btn2:rgba(255,255,255,.10); }
  [data-theme="light"] { --bg:#FFFFFF; --line:rgba(0,0,0,.10); --div:rgba(0,0,0,.06); --text:#18181B; --muted:#71717A; --btn:#18181B; --btnText:#FFFFFF; --btn2:rgba(0,0,0,.06); }
  * { box-sizing:border-box; }
  html,body { margin:0; background:transparent; color:var(--text); font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .card { overflow:hidden; border:1px solid var(--line); border-radius:12px; background:var(--bg); }
  .head { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid var(--line); font-size:12px; }
  .head b { font-weight:600; } .muted { color:var(--muted); }
  .head .search { margin-left:auto; color:var(--muted); }
  ul { list-style:none; margin:0; padding:0; font-size:12.5px; }
  li { display:flex; align-items:flex-start; gap:10px; padding:8px 12px; }
  li + li { border-top:1px solid var(--div); }
  .sub { display:block; font-size:11.5px; color:var(--muted); }
  .dot { margin:5px 3px 0; width:8px; height:8px; border-radius:999px; background:var(--honey); flex:none; }
  .lock { margin-top:2px; color:var(--rose); flex:none; }
  .prop { border:1px solid #f5a52440; background:#f5a5240d; border-radius:12px; padding:12px; }
  .prop.blocked { border-color:#fb718540; background:#fb71850d; }
  .prop .t { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--honey); }
  .prop.blocked .t { color:var(--rose); }
  .prop .q { margin:6px 0 0; font-size:13px; }
  .prop .w { margin:4px 0 0; font-size:11.5px; color:var(--muted); }
  .btns { display:flex; gap:6px; margin-top:10px; }
  button { display:inline-flex; align-items:center; gap:4px; height:28px; padding:0 12px; border:0; border-radius:999px; font-family:inherit; font-size:12px; font-weight:500; line-height:1; cursor:pointer; }
  .ok { background:var(--btn); color:var(--btnText); } .no { background:var(--btn2); color:var(--text); }
  .empty { padding:10px 12px; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<div id="root"><div class="card"><div class="head"><span class="hex"></span><b>Hivemind</b><span class="muted">· checking the hive…</span></div></div></div>
<script>
(function () {
  var HEX = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F5A524" d="M12 2 21 7v10l-9 5-9-5V7z"/></svg>';
  var LOCK = '<svg class="lock" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var SEARCH = '<svg class="search" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  var X = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var root = document.getElementById("root");
  var nextId = 1, pending = {};
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function send(msg) { msg.jsonrpc = "2.0"; window.parent.postMessage(msg, "*"); }
  function request(method, params) { var id = nextId++; send({ id: id, method: method, params: params || {} }); return new Promise(function (r) { pending[id] = r; }); }
  function notify(method, params) { send({ method: method, params: params || {} }); }
  function theme(ctx) { if (ctx && (ctx.theme === "light" || ctx.theme === "dark")) document.documentElement.setAttribute("data-theme", ctx.theme); }

  function rulesCard(d) {
    var items = (d.rules || []).map(function (r) {
      return "<li>" + (r.locked ? LOCK : '<span class="dot"></span>') + "<span>" + esc(r.title) +
        '<span class="sub">' + esc(r.sub) + "</span></span></li>";
    }).join("");
    return '<div class="card"><div class="head">' + HEX + "<b>Hivemind</b>" + '<span class="muted">· ' + esc(d.header) + "</span>" + SEARCH + "</div>" +
      (items ? "<ul>" + items + "</ul>" : '<div class="empty">No team rules mention this file yet.</div>') + "</div>";
  }
  function proposalCard(d) {
    if (d.status === "blocked") {
      return '<div class="prop blocked"><div class="t">' + HEX + " Blocked: conflicts with a 🔒 locked rule</div>" +
        '<p class="q">“' + esc(d.title) + "”</p>" + (d.reason ? '<p class="w">' + esc(d.reason) + "</p>" : "") + "</div>";
    }
    return '<div class="prop"><div class="t">' + HEX + " Teach Hivemind: lesson proposed for #" + esc(d.scopeId) + "</div>" +
      '<p class="q">“' + esc(d.title) + "”</p>" + '<p class="w">Waiting on @' + esc(d.lead) + ".</p>" +
      '<div class="btns"><button class="ok" data-act="approve">' + CHECK + " Approve</button>" +
      '<button class="no" data-act="reject">' + X + " Reject</button></div></div>";
  }
  function render(result) {
    var d = (result && result.structuredContent) || {};
    root.innerHTML = d.kind === "proposal" ? proposalCard(d) : rulesCard(d);
    var btns = root.querySelectorAll("button[data-act]");
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", function () {
      if (d.approveUrl) request("ui/open-link", { url: d.approveUrl });
    });
    size();
  }
  function size() { var r = document.documentElement.getBoundingClientRect(); notify("ui/notifications/size-changed", { width: Math.ceil(r.width), height: Math.ceil(r.height) }); }

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.id != null && !m.method) { var cb = pending[m.id]; if (cb) { delete pending[m.id]; cb(m.result || m.error); } return; }
    if (m.method === "ui/notifications/tool-result") render(m.params);
    else if (m.method === "ui/notifications/host-context-changed") theme(m.params);
    else if (m.id != null) send({ id: m.id, result: {} }); // e.g. ui/resource-teardown
  });
  if (window.ResizeObserver) new ResizeObserver(size).observe(document.body);
  request("ui/initialize", { protocolVersion: "2026-01-26", appInfo: { name: "hivemind-card", version: "0.1.0" }, appCapabilities: {} })
    .then(function (res) { theme(res && res.hostContext); notify("ui/notifications/initialized", {}); });
})();
</script>
</body>
</html>`;
