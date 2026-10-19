create table api_cache (
  key text primary key not null,
  data text not null,
  fetched_at integer not null
);
