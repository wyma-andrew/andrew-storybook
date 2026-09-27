alter table profiles add column can_use_translate boolean not null default false;

create or replace function has_feature(feature text) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case feature
       when 'stories' then can_use_stories
       when 'movie_recap' then can_use_movie_recap
       when 'translate' then can_use_translate
       when 'voice_lab' then can_use_voice_lab
       else false
     end
     from profiles where id = auth.uid()),
    false);
$$;

drop policy translate_projects_feature_gate on translate_projects;
create policy translate_projects_feature_gate on translate_projects as restrictive for all
  using (has_feature('translate')) with check (has_feature('translate'));
