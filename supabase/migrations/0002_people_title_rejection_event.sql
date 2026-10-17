-- Additive: person job title (contract Person.title; toPerson already reads r.title),
-- and a 'rejection' event type so the feed can distinguish approve vs reject.
alter table people add column if not exists title text;

alter table events drop constraint if exists events_type_check;
alter table events add constraint events_type_check check (type in
  ('correction','review_comment','session_start','session_end','edit','approval','rejection','agent_proposal'));
