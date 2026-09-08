-- Per-shot beat note: which script line(s) this shot covers and what it adds
-- that the previous shot did not. Forces every shot to justify its own
-- generation — dialogue scenes were producing runs of shots that shared one
-- frozen state and differed only by camera angle, each still costing a full
-- image + video generation.
-- Nullable so rows predating this column still read fine. Generation metadata,
-- not copyable prompt text, so no _override counterpart.
alter table shots
  add column beat text;
