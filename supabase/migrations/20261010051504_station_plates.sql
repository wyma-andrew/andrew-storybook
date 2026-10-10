-- A location render uploaded as the empty plate for one of the chapter's
-- site-map camera stations (chapters.site_map places[].stations[].key). A key,
-- not an FK: stations live in the site_map JSON and are rebuilt on every full
-- storyboard generation, so a plate whose station disappears simply stops
-- showing on the storyboard and stays on the location card.
alter table chapter_images add column station_key text;
