alter table movie_recap_projects
  add column logo_watermark_text text
    check (logo_watermark_text is null or char_length(logo_watermark_text) <= 120);

alter table movie_recap_logo_templates
  add column logo_watermark_text text
    check (logo_watermark_text is null or char_length(logo_watermark_text) <= 120);
