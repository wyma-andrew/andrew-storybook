-- Styled, burned-in subtitles are the only mode now: the "No Subtitles" and
-- "SRT file only" choices are gone, so subtitle_mode can never vary. The
-- render no longer writes a WebVTT sidecar either (subtitles are pixels in the
-- output), so its columns go with it. Same reasoning as the copyright_free
-- removal — see history/movie-recap.md.
alter table movie_recap_projects
  drop column subtitle_mode,
  drop column render_subtitle_url,
  drop column render_subtitle_object_key;
