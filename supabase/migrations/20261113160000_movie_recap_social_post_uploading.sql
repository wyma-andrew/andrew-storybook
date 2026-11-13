-- A post row is written before the upload starts, so it exists with no
-- Facebook video id while the upload runs in the background.
alter table movie_recap_social_posts alter column external_id drop not null;

alter table movie_recap_social_posts drop constraint movie_recap_social_posts_status_check;
alter table movie_recap_social_posts add constraint movie_recap_social_posts_status_check
  check (status in ('uploading', 'scheduled', 'published', 'cancelled', 'failed'));
