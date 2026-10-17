-- Additive: 'fix' event type — Hivemind learns from code fixes (a human fixes what an agent/another person wrote),
-- not only typed corrections. Payload: { file, diff, before?, after?, previousAuthor, violationRuleId? }.
alter table events drop constraint if exists events_type_check;
alter table events add constraint events_type_check check (type in
  ('correction','review_comment','session_start','session_end','edit','approval','rejection','agent_proposal','fix'));
