-- Story-wide motion style + the per-shot motion mode it constrains.
--
-- motion_style_id is deliberately unconstrained, like visual_style_id: styles
-- are code-defined (lib/constants/motion-styles.ts) and a dangling id already
-- resolves to DEFAULT_MOTION_STYLE_ID in app code, so a check constraint here
-- would only mean a migration per new style.
alter table stories
  add column motion_style_id text not null default 'natural';

-- motion_mode IS constrained: it is a closed four-value enum owned by code,
-- and every write already passes through resolveMotionMode(). Null means the
-- shot predates this feature and copies with the style's default text.
alter table shots
  add column motion_mode text,
  add constraint shots_motion_mode_check
    check (motion_mode is null or motion_mode in ('micro', 'dialogue', 'normal', 'emotional'));
