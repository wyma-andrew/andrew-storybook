import OpenAI from "openai";

let client: OpenAI | null = null;
export function openai() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return client;
}

// Style is passed to the model as context only — never as a literal tag to
// echo back. The app injects the actual style tag client-side at copy time,
// so a stored prompt stays reusable if the story's style is later changed.
function styleContextBlock(styleContext?: string | null) {
  if (!styleContext) return "";
  return (
    `\n\nVisual Style Context: "${styleContext}"\n` +
    "(Note: Do NOT include explicit style keywords, camera technical terms, or rendering engine names in the generated text. " +
    "Use this style context ONLY to guide the mood, atmosphere, and descriptive detail choices — the literal style tag is injected separately by the app.)"
  );
}

export type ExtractedAsset = { name: string; meta: string; realPrompt: string };
export type ExtractedAssets = { characters: ExtractedAsset[]; locations: ExtractedAsset[] };

const ASSET_SCHEMA = {
  type: "object",
  properties: {
    characters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          meta: { type: "string", description: "short tag, e.g. 'Keeper · 34'" },
          realPrompt: {
            type: "string",
            description:
              "entity-specific visual description ONLY: hair, face, wardrobe, build, expression. No camera, lighting, or style wording — that is injected separately.",
          },
        },
        required: ["name", "meta", "realPrompt"],
        additionalProperties: false,
      },
    },
    locations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          meta: { type: "string", description: "short tag, e.g. 'Interior · scene 1'" },
          realPrompt: {
            type: "string",
            description:
              "entity-specific visual description ONLY: structure, materials, props, layout. No camera, lighting, or style wording.",
          },
        },
        required: ["name", "meta", "realPrompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["characters", "locations"],
  additionalProperties: false,
} as const;

export async function extractAssets(scriptText: string, styleContext?: string | null): Promise<ExtractedAssets> {
  const res = await openai().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You extract characters and locations from a story script for a storyboard tool. Only describe visual identity facts, never camera/lighting/art-style — those are injected by the app separately. " +
          "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...), [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [TRANSITION]. Use these tags as ground truth for structure." +
          styleContextBlock(styleContext),
      },
      { role: "user", content: scriptText },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "extracted_assets", schema: ASSET_SCHEMA, strict: true },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(raw) as ExtractedAssets;
}

export type GeneratedShotAsset = { name: string; kind: "character" | "location" };
export type GeneratedShot = {
  label: string;
  durationS: number;
  aspect: string;
  camera: string;
  prompt: string;
  frameMode: "start_frame_only" | "start_and_end_frame";
  endFramePrompt: string | null;
  videoPrompt: string;
  assetsUsed: GeneratedShotAsset[];
};
export type GeneratedScene = { title: string; slug: string; shots: GeneratedShot[] };

const STORYBOARD_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          slug: { type: "string", description: "e.g. 'INT. LIGHTHOUSE — NIGHT'" },
          shots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "e.g. 'Establishing · Wide'" },
                durationS: {
                  type: "integer",
                  minimum: 1,
                  maximum: 10,
                  description:
                    "Recommended clip duration in seconds for AI video generation (Google Flow etc). Hard cap at 10 — most AI video tools cannot export clips longer than 10s.",
                },
                aspect: { type: "string", description: "e.g. '16:9'" },
                camera: { type: "string", description: "e.g. 'static', 'slow push-in'" },
                prompt: {
                  type: "string",
                  description:
                    "Start Frame: full self-contained image generation prompt for this shot's opening state, content and composition only. No camera movement, lighting rig, art-style, or render-engine keywords — camera goes in the `camera` field, and style is injected separately by the app.",
                },
                frameMode: {
                  type: "string",
                  enum: ["start_frame_only", "start_and_end_frame"],
                  description:
                    "'start_and_end_frame' when this shot's motion flows seamlessly into the next shot (same scene/angle, continuous action) — 'start_frame_only' when the next shot is a hard cut, angle change, or new location.",
                },
                endFramePrompt: {
                  type: ["string", "null"],
                  description:
                    "Required (non-null) when frameMode is 'start_and_end_frame': a full self-contained image prompt matching this shot's closing state, which equals the NEXT shot's Start Frame. Null when frameMode is 'start_frame_only'.",
                },
                videoPrompt: {
                  type: "string",
                  description:
                    "Google Flow (image-to-video) motion prompt. For 'start_and_end_frame', describe the camera/subject motion bridging Start Frame to End Frame. For 'start_frame_only', describe the isolated action/movement originating from the Start Frame. " +
                    "If this shot depicts a character speaking, include the line verbatim, language-tagged: `in English Dialog: \"...\"` or `in Burmese Dialog: \"...\"` (detect the language from the script) — matching the actual language the dialog is written in.",
                },
                assetsUsed: {
                  type: "array",
                  description:
                    "Which of the Known Assets (given below) actually appear in this shot and should be attached as reference images/prompts when generating it. Use the exact name from Known Assets. Empty array if none apply.",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "exact name from Known Assets" },
                      kind: { type: "string", enum: ["character", "location"] },
                    },
                    required: ["name", "kind"],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                "label",
                "durationS",
                "aspect",
                "camera",
                "prompt",
                "frameMode",
                "endFramePrompt",
                "videoPrompt",
                "assetsUsed",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "slug", "shots"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

export async function generateStoryboard(
  scriptText: string,
  assetContext: string,
  styleContext?: string | null
): Promise<GeneratedScene[]> {
  const res = await openai().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You break a script into scenes and numbered shots for a storyboard tool. Each shot needs a full, self-contained, copyable image generation prompt that folds in the given character/location identity descriptions, plus a Google Flow (image-to-video) prompt. " +
          "The script is given as tagged lines from the screenplay editor: [TITLE], [SCENE] (a scene heading, e.g. INT./EXT. ...) — start a new scene at each one, [ACTION] (description), [CHARACTER] (a character cue — the speaker's name), [PARENTHETICAL], [DIALOG] (that character's line), [TRANSITION]. Use these tags as ground truth for structure.\n\n" +
          "Video Generation Strategy (Start & End Frame Interpolation): for every shot, decide frameMode by checking continuity with the NEXT shot.\n" +
          "1. Continuous motion (same scene/angle flowing into the next shot): frameMode = 'start_and_end_frame'. Set endFramePrompt to an image prompt matching the opening state of the NEXT shot (i.e. this shot's End Frame IS the next shot's Start Frame — repeat that next shot's Start Frame prompt here verbatim so this shot stays self-contained). videoPrompt should focus on the camera motion, subject movement, and transition bridging Start Frame to End Frame.\n" +
          "2. Hard cuts / dramatic angle change / new location for the next shot: frameMode = 'start_frame_only', endFramePrompt = null. videoPrompt should focus purely on the isolated action/movement originating from the Start Frame — do not force an End Frame.\n" +
          "If a shot depicts a character speaking (has an adjacent [CHARACTER]/[DIALOG] pair in the script), the videoPrompt must quote that line verbatim with a language tag matching the language it's actually written in, e.g. `in English Dialog: \"...\"` or `in Burmese Dialog: \"...\"`.\n\n" +
          "durationS is the recommended clip length for AI video generation — NEVER exceed 10 seconds, most AI video tools cannot export longer clips. Pick a realistic shorter duration (e.g. 2-6s) unless the action genuinely needs the full 10s.\n\n" +
          "For every shot, also set assetsUsed: the exact-named Known Assets (characters and/or locations, given below) that actually appear in that shot — this tells the user which reference images/prompts to attach when generating. Only include assets truly present in the shot's content, not every asset in the scene." +
          styleContextBlock(styleContext),
      },
      { role: "user", content: `Known assets:\n${assetContext}\n\nScript:\n${scriptText}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "storyboard", schema: STORYBOARD_SCHEMA, strict: true },
    },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { scenes: GeneratedScene[] }).scenes;
}
