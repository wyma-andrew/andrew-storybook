-- Locations are rendered from one of two reference presets: an interior view
-- (camera inside a room, floor plan attached) or an exterior view (camera in
-- the compound, site plan attached). The preset was hardcoded to interior, so
-- an exterior location — a house seen from its front and rear — rendered as a
-- room. space_kind is what the copy buttons pick the preset from.
--
-- Nullable, and only meaningful for kind='location'; characters leave it null.
-- Existing location rows are backfilled to 'interior' (the behaviour they were
-- generated under) and re-classified on the next analyze/regenerate.

alter table chapter_assets add column space_kind text
  check (space_kind is null or space_kind in ('interior', 'exterior'));
alter table bible_entries add column space_kind text
  check (space_kind is null or space_kind in ('interior', 'exterior'));

update chapter_assets set space_kind = 'interior' where kind = 'location';
update bible_entries set space_kind = 'interior' where kind = 'location';
