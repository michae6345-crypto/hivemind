# QA: `hivemind watch` (QA1, Sat Oct 17)

Headless only: `watch --snapshot` sweeps (4 personas × 4 views × 50/64/80/120 cols × 20/30/45 rows × playground +
demo/export-service, colour and NO_COLOR), plus watch in a pseudo-terminal from Node for keys, resize and network.
Each frame is checked for: line width ≤ cols, row count = rows, stray control chars, unbalanced OSC 8 links,
ESC under NO_COLOR, `undefined`/`NaN`/`[object`, "view crashed".

| # | Bug | Status |
|---|-----|--------|
| 1 | `e2e-terminal` step 6 failed on main (4/5): `watch --snapshot --wait` awaited the first poll (5 prod calls, ~2s) before starting the watcher, so the e2e's write at 1.5s was missed | fixed: the watcher starts before the first poll |
