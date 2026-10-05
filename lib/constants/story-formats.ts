// Story-wide storyboard format (stories.format). Unlike visual and motion
// style, which only change copied text, a format changes what the storyboard
// pass is asked to produce — so switching it applies only after regeneration.
// See history/story-formats.md.

export type StoryFormat = "cinematic" | "cozy-asmr";

export interface StoryFormatOption {
  value: StoryFormat;
  label: string;
  hint: string;
}

export const STORY_FORMATS: StoryFormatOption[] = [
  { value: "cinematic", label: "Cinematic", hint: "Character-driven scenes, dialogue coverage" },
  { value: "cozy-asmr", label: "Cozy POV ASMR", hint: "First-person hands, daily routine, sound-led" },
];

export const DEFAULT_STORY_FORMAT: StoryFormat = "cinematic";

export function isStoryFormat(value: unknown): value is StoryFormat {
  return STORY_FORMATS.some((f) => f.value === value);
}

export function resolveStoryFormat(value: unknown): StoryFormat {
  return isStoryFormat(value) ? value : DEFAULT_STORY_FORMAT;
}
