-- Visual styles moved fully into code (lib/constants/visual-styles.ts) —
-- internal-use project, no self-serve style editor. stories.visual_style_id
-- (plain text, no FK — see 20260905045512) now only ever holds a code-file
-- slug (e.g. '3d-animation').
drop table visual_styles;
