alter table if exists dax_history
  add column if not exists project_id text,
  add column if not exists conversation_id text,
  add column if not exists conversation_title text;

create index if not exists dax_history_project_conversation_idx
  on dax_history (project_id, conversation_id, created_at desc);

create index if not exists dax_history_project_created_idx
  on dax_history (project_id, created_at desc);
