# Story regions

Covers: `lib/constants/regions.ts`, `lib/prompts/shared.ts`
(`regionAdaptationBlock`), the region branches in `lib/prompts/extract-assets.ts`,
`lib/prompts/regenerate-asset.ts`, and `lib/prompts/storyboard.ts`, story region
API/types, region selectors, and the `stories.region` database constraint.

## 2026-09-11 — Canonically named Buddha-era sites keep their historic scale

The Buddha block's restraint default was flattening named, historically fixed
places. A generated Jetavana came back as "modest overall scale", earthen
plaster, woven reed panels and a straw roof, with `SPATIAL RULES` asserting
"keep the compound modest, functional" — a village hut cluster, not
Anathapindika's donated monastic complex. The restraint wording was never in the
location's own prompt; the region block's preference for restrained material
culture produced it.

`buddhaAdaptationBlock()` now carries a KNOWN PLACE SCALE clause, scoped the same
way the KNOWN IDENTITY rule is: when the script names a canonically identifiable
site (Jetavana, Veluvana, a named great hall, a royal palace, a capital city),
its scale, patronage, and build quality follow the historical record — a walled
complex of many dwellings and an assembly hall across planted grounds, with
gateways, prepared paths, wells and grove trees. It also names the two exact
phrases the model kept emitting ("modest scale", "keep the compound modest") and
forbids them for such places.

The restraint default is unchanged for unnamed, ordinary, and rural locations,
and this does NOT reopen the 2026-09-10 rejection of decorative grandeur:
"grander" is defined as larger footprint, more buildings, better carpentry and
masonry, and more orderly planning, in the same period materials. Later-era
Asian temple aesthetics, gilding, multi-tiered pagoda roofs, upturned eaves,
stupas, and towering devotional statues stay rejected.

Rejected the broader external suggestion that prompted this — rewriting the
shell toward "multi-tiered wooden structure, grand central hall" as a default
look. That is later-era and pan-Asian, and it would have undone the region's
core purpose rather than fixing the scale error. Rejected fixing it per-story by
hand-editing the location's realPrompt: the flattening is systematic, so every
Buddha-region story would hit it again.

## 2026-09-11 — Named sites use canonical recorded features, not generic equivalents

KNOWN PLACE SCALE fixed size but not substance: a regenerated Jetavana came back
as a correctly large but anonymous ancient-Indian compound — "assembly hall",
"prepared packed-earth paths", "mature grove" — with none of the features the
early Buddhist record actually names. The cause was the same shape as the scale
bug: the block asked for restrained, plausible material culture and never asked
the model to use what it knows about the specific named place, so the safe
generic answer won.

`buddhaAdaptationBlock()` now carries a CANONICAL SITE DETAIL clause stating
that restraint governs ornament and later-era styling, never historical
specificity, and requiring recorded features to be named with their Pali term
plus a short gloss on first use (Gandhakuti, cankama, mandalamala /
upatthanasala, jantaghara, vihara, kuti). Jetavana's recorded inventory is
spelled out inline: Anathapindika's purchase from Prince Jeta, Jeta keeping and
building the gateway, the Gandhakuti and the Kosambakuti / Karerikuti /
Salalaghara dwellings, the Kareri mandalamala, refectory and storerooms,
jantaghara, wells and lotus ponds, cankama paths, and the Ananda Bodhi tree at
the entrance.

The clause states explicitly that the Gandhakuti is the Buddha's own single
dwelling hut and NOT the assembly building. External feedback had proposed
mapping "assembly hall" onto Gandhakuti; that is wrong, and encoding it would
have produced a great hall under the Buddha's dwelling name. The community
gathers in the mandalamala / upatthanasala.

It also forbids inventing canonical names, or coining Pali-sounding labels, for
sites the tradition does not record them for — plain English where the record is
silent. This is the hallucination guard: the app has no reference retrieval, so
a confident invented Pali name would be indistinguishable from a real one.

Rejected building a curated per-site facts table in `lib/constants/` as the
first move. The model's recall for well-documented sites is adequate once the
suppression is lifted, and a table is per-site maintenance for every script.
It stays available as a fallback for sites where recall proves thin or wrong.

## 2026-09-11 — Style context governs look, never scale

Follow-up to the entry above, after a regenerated Jetavana still came back
"compact single-storey" and "modest, well-maintained". The KNOWN PLACE SCALE
clause had worked in SPATIAL RULES but was being overridden in STRUCTURE SHELL
by the *visual style* text, not by the region block: Buddha Era 3D's base said
"Keep environments modest, functional", and that string is fed into the
generation system prompt through `styleContextBlock`. Two constants were giving
opposite scale guidance with no stated precedence.

`styleContextBlock` now states the precedence explicitly: style context governs
look only — mood, lighting feel, materials, finish, level of detail — and never
a place's scale, footprint, building count, or social status, which come from
the script and the region adaptation block. Restraint in style wording applies
to finish and ornament, not size. This is a general rule, not Buddha-specific;
any style whose wording reads as small/humble had the same failure available.

KNOWN PLACE SCALE also now recognizes canonical sites under any script language,
spelling, or transliteration (Burmese ဇေတဝန်, Pali/Sanskrit Jetavana or
Jetavanarama, "Anathapindika's monastery"). The trigger previously listed only
romanized names while the extracted asset name keeps the script's own spelling —
see the OUTPUT LANGUAGE exemption for names — so the clause depended on the
model transliterating before it could fire.

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
and modern objects. (Scale for canonically named sites is carved out of that
restraint by the 2026-09-11 entry above; the ornament rejections stand.) Sacred symbols are conditional on the scene rather than
decorative defaults. The original rejection of canonical Buddha marks and all
halos is superseded by the decision above. Historical content otherwise remains
separate from visual style, which is selected independently.

Rejected treating `buddha` as an alias of Myanmar or encoding it only inside
Mythic Fantasy Painting. Region affects content under every visual style, and
each style still supplies an explicit Buddha entry under the no-fallback rule.
