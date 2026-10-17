-- Cross-vendor attribution: which coding agent (claude-code | cursor | gemini-cli | copilot | codex | claude-ai | vscode | other)
alter table activity add column if not exists agent text;
alter table events   add column if not exists agent text;
alter table pack_log add column if not exists agent text;
