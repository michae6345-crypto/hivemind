create table export_files (
  job_id text references exports(job_id),
  path text not null,
  bytes bigint not null
);
