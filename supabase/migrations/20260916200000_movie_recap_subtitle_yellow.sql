-- The "Yellow" swatch changed value (#FFE066 -> #D9E824). Move projects sitting
-- on the old hex so their picker still shows a selected swatch.
update movie_recap_projects set subtitle_color = '#D9E824' where subtitle_color = '#FFE066';
