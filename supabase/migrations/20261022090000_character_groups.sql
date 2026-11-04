-- A character row can be a nameless collective (hell beings, devas, an assembly
-- of monks). The flag only selects the group reference-sheet preset at copy
-- time; the row is otherwise an ordinary character.
alter table chapter_assets add column is_group boolean not null default false;
alter table bible_entries add column is_group boolean not null default false;
