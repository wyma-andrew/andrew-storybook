import OpenAI from "openai";

let client: OpenAI | null = null;
export function openai() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return client;
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

export async function extractAssets(scriptText: string): Promise<ExtractedAssets> {
  const res = await openai().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You extract characters and locations from a story script for a storyboard tool. Only describe visual identity facts, never camera/lighting/art-style — those are injected by the app separately.",
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

export type GeneratedShot = {
  label: string;
  durationS: number;
  aspect: string;
  camera: string;
  prompt: string;
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
                durationS: { type: "integer" },
                aspect: { type: "string", description: "e.g. '16:9'" },
                camera: { type: "string", description: "e.g. 'static', 'slow push-in'" },
                prompt: {
                  type: "string",
                  description: "full self-contained image generation prompt for this shot",
                },
              },
              required: ["label", "durationS", "aspect", "camera", "prompt"],
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
  assetContext: string
): Promise<GeneratedScene[]> {
  const res = await openai().chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content:
          "You break a script into scenes and numbered shots for a storyboard tool. Each shot needs a full, self-contained, copyable image generation prompt that folds in the given character/location identity descriptions.",
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
