alter table movie_recap_projects
  add column max_step smallint not null default 1
  check (max_step between 1 and 5);

update movie_recap_projects
set max_step = greatest(
  current_step,
  case when render_script is not null then 5 else 1 end
);
