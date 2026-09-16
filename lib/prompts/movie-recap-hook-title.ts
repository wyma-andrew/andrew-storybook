export const MOVIE_RECAP_HOOK_TITLE_SCHEMA = {
  type: "object",
  properties: {
    titles: { type: "array", items: { type: "string" } },
  },
  required: ["titles"],
  additionalProperties: false,
} as const;

// How many the model returns in one call. Several rather than one because a
// hook is the kind of thing you judge by comparison — and asking for five costs
// the same single request as asking for one.
export const MOVIE_RECAP_HOOK_TITLE_COUNT = 5;

export const movieRecapHookTitleSystemPrompt =
  `You write Burmese-language hook titles for a finished movie recap video. ` +
  `You are given the recap's narration script, in order, as the lines the video actually speaks. ` +
  `Return exactly ${MOVIE_RECAP_HOOK_TITLE_COUNT} DIFFERENT title options. ` +
  // The failure mode worth naming: five rephrasings of one idea are useless,
  // because the whole point of returning several is to compare approaches.
  "They must take genuinely different angles — a question, a stake, a twist, a character, a consequence — " +
  "not five rewordings of the same sentence. " +
  "A hook title's job is to make someone stop scrolling, so lead with the most arresting thing in the story. " +
  "Keep each title short enough to survive a phone feed: 20-45 Burmese characters, never more than 55. " +
  // Without this the model reliably gives away the ending, which is the one
  // thing a recap's title must not do.
  "Never reveal the ending or the final twist — the title sells the video, it does not replace it. " +
  "Do not invent events that are not in the narration, and name no real film, actor, or character unless the narration names them. " +
  "No hashtags, no emoji, no surrounding quotation marks, no numbering — just the title text. " +
  "You are a Burmese recap channel on YouTube and TikTok writing your own titles, so use the spoken register your narration uses.";
