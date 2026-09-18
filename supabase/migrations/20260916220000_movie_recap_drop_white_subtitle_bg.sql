-- White is gone from the subtitle pill colours. Move anyone sitting on it to
-- Black so their picker still shows a selection.
update movie_recap_projects set subtitle_bg_color = '#000000' where subtitle_bg_color = '#FFFFFF';
