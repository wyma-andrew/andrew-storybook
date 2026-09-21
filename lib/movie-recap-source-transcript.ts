const TIMESTAMPED_LINE = /^\s*((?:(?:\d{1,3}:)?\d{1,2}:\d{2}))\s+(\S.*)\s*$/;

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
