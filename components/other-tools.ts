import { FileText, Languages, Scissors, SplitSquareVertical } from "lucide-react";
import type { FeatureKey } from "@/lib/constants/features";

// Grouped under the sidebar's "Other" entry and shown as a grid on /other.
export const OTHER_TOOLS = [
  { href: "/transcript", label: "Transcript", description: "Upload a Burmese video and turn its speech into text.", icon: FileText, feature: "movie_recap" },
  { href: "/translate", label: "Translate", description: "Burn translated subtitles into a video and render an MP4.", icon: Languages, feature: "translate" },
  // A local helper for Movie Recap sources, so it shares that feature's access.
  { href: "/splitter", label: "Splitter", description: "Cut a long video into parts of N minutes, with a frame, text and part number.", icon: SplitSquareVertical, feature: "movie_recap" },
  { href: "/video-cutter", label: "Video Cutter", description: "Trim and export clips locally before using them as recap sources.", icon: Scissors, feature: "movie_recap" },
] as const satisfies readonly { href: string; label: string; description: string; icon: typeof FileText; feature: FeatureKey }[];
