const TIMESTAMPED_LINE = /^\s*((?:(?:\d{1,3}:)?\d{1,2}:\d{2}))\s+(\S.*)\s*$/;

export const MOVIE_RECAP_SCENE_TAG = "[Scene]";

/** Keep only source lines that carry both a timestamp and source text. */
export function formatMovieRecapSourceTranscript(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])[\t ]+(?=(?:(?:\d{1,3}:)?\d{1,2}:\d{2})\b)/g, "$1\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .flatMap((line) => {
      const match = line.match(TIMESTAMPED_LINE);
      return match ? [`${match[1]} ${match[2]}`] : [];
    })
    .join("\n");
}

// The script parser reads at most two minute digits, so a film past the hour
// needs the H:MM:SS form rather than "75:10".
export function formatTranscriptStamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${String(minutes).padStart(2, "0")}:${secs}`;
}

/**
 * Dialogue and scene descriptions as one timestamped source transcript, in the
 * same `MM:SS text` shape a pasted transcript has. A scene line sorts before
 * dialogue at the same second: the picture is on screen before anyone speaks
 * over it.
 */
export function buildAutoSourceTranscript(
  dialogue: { start: number; text: string }[],
  scenes: { start: number; visual: string }[]
) {
  const lines = [
    ...scenes.map((scene) => ({ start: scene.start, order: 0, text: `${MOVIE_RECAP_SCENE_TAG} ${scene.visual}` })),
    ...dialogue.map((segment) => ({ start: segment.start, order: 1, text: segment.text })),
  ]
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text && line.text !== MOVIE_RECAP_SCENE_TAG);
  lines.sort((a, b) => Math.floor(a.start) - Math.floor(b.start) || a.order - b.order || a.start - b.start);
  return lines.map((line) => `${formatTranscriptStamp(line.start)} ${line.text}`).join("\n");
}

const DIALOGUE_CONTEXT_CHARS = 400;

/** What is said while a scene is on screen, clipped to a context-sized string. */
export function dialogueDuring(segments: { start: number; end: number; text: string }[], startS: number, endS: number) {
  const text = segments
    .filter((segment) => segment.start < endS && segment.end > startS)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");
  return text.length > DIALOGUE_CONTEXT_CHARS ? `${text.slice(0, DIALOGUE_CONTEXT_CHARS)}…` : text;
}

export type AsrSegment = {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
};

// Whisper-style confidence fields, which Whisper's own decoder uses to reject a
// repetition loop or a low-confidence no-speech stretch ("Thank you for
// watching." over music). FunASR sends none of them, so its segments all pass.
const MAX_COMPRESSION_RATIO = 2.4;
const NO_SPEECH_PROB = 0.6;
const LOW_LOGPROB = -1;

export function dropUnreliableSegments(segments: AsrSegment[]) {
  return segments.filter((segment) => {
    if ((segment.compression_ratio ?? 0) > MAX_COMPRESSION_RATIO) return false;
    return !((segment.no_speech_prob ?? 0) > NO_SPEECH_PROB && (segment.avg_logprob ?? 0) < LOW_LOGPROB);
  });
}
