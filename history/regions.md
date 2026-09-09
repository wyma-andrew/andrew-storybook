# Story regions

Covers: `lib/constants/regions.ts`, `lib/prompts/shared.ts`
(`regionAdaptationBlock`), the region branches in `lib/prompts/extract-assets.ts`,
`lib/prompts/regenerate-asset.ts`, and `lib/prompts/storyboard.ts`, story region
API/types, region selectors, and the `stories.region` database constraint.

## 2026-09-10 — Buddha prompts name Siddhartha Gautama explicitly

When the Buddha region identifies the Buddha under a script-language name or
title, the character prompt keeps that exact value in `CHARACTER` and adds
`KNOWN IDENTITY: Siddhartha Gautama (Gautama Buddha)`. This gives the image
model direct canonical-name context while preserving chapter asset matching.
It applies only when the identity is unambiguous; it does not rename the asset
or label ordinary monks and disciples as the Buddha.

## 2026-09-10 — Buddha is historically grounded but iconographically recognizable

This supersedes the earlier rule below that treated Gautama Buddha only as an
ordinary historical human and rejected his later canonical identity marks. A
real generated reference sheet showed why that rule failed: the explicit
close-cropped hair, receding hairline, precise middle age, and prohibition on a
halo produced an indistinguishable contemporary monk rather than the Buddha.

When the script names Gautama Buddha, the Blessed One, or an equivalent title,
his identity lock now requires the standard visual markers that make him
recognizable: ushnisha, urna, compact curls, elongated earlobes, serene
symmetrical features, dignified idealized proportions, and refined unadorned
monastic robes. A restrained halo or soft radiance is permitted but not
required. These marks apply only to the Buddha, never automatically to ordinary
monks or disciples. An explicit pre-renunciation Prince Siddhartha scene still
uses the script-appropriate princely appearance.

This is a deliberate compromise: environments, material culture, and secondary
characters remain grounded in the ancient South Asian setting, while the Buddha
uses a controlled canonical visual language so audiences can identify him.

## 2026-09-10 — Added a historical Buddha-era region

`buddha` is a third story-wide region alongside `english` and `myanmar`. It is
the historical world of Gautama Buddha in the northern Indian subcontinent,
centered on the middle Gangetic regions represented in Buddha-life stories. It
is not a generic pan-Asian Buddhist aesthetic and does not make the story
Myanmar, Tibetan, Chinese, Japanese, or Thai by default.

One shared `regionAdaptationBlock(region)` selects the cultural/historical
instructions for asset extraction, single-asset regeneration, and storyboard
generation. This replaces repeated Myanmar-only conditionals so a generation
path cannot silently omit Buddha mode. English remains the empty adaptation and
the database default; existing stories therefore retain their behavior.

The Buddha block prefers restrained, plausible ancient South Asian material
culture and script-specific context. It rejects automatic temples, pagodas,
giant statues, gold ornament, supernatural effects, later regional iconography,
and modern objects. Sacred symbols are conditional on the scene rather than
decorative defaults. The original rejection of canonical Buddha marks and all
halos is superseded by the decision above. Historical content otherwise remains
separate from visual style, which is selected independently.

Rejected treating `buddha` as an alias of Myanmar or encoding it only inside
Mythic Fantasy Painting. Region affects content under every visual style, and
each style still supplies an explicit Buddha entry under the no-fallback rule.
