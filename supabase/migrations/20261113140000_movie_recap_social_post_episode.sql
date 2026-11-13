-- Null: the post is of the project's default render.
alter table movie_recap_social_posts
  add column episode_id uuid references movie_recap_episodes(id) on delete cascade;

create index movie_recap_social_posts_episode_idx
  on movie_recap_social_posts(episode_id, publish_at desc) where episode_id is not null;
