-- Black is gone from the subtitle text colours (it is unreadable against the
-- dark pill, which is the default background). Move anyone sitting on it to
-- White so their picker still shows a selection.
update movie_recap_projects set subtitle_color = '#FFFFFF' where subtitle_color = '#111111';
