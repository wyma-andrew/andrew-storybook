// recap-en-to-mm's frame layout (core.frame_layout), shared by Recap V2 and
// Splitter: the output size follows Ratio and Quality, and Fill decides what
// covers the rest of the frame.

export type FrameRatio = "16:9" | "9:16" | "1:1" | "original";
export type FrameFill = "blur" | "bars" | "cover";
export type FrameQuality = "1080" | "720" | "480";

// The long side is 1920 at 1080p and shrinks with the quality; "original"
// keeps the source's shape.
export function outputFrameSize({ ratio, quality, sourceWidth, sourceHeight }: { ratio: FrameRatio; quality: FrameQuality; sourceWidth: number; sourceHeight: number }): [number, number] {
  const short = Number(quality);
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  if (ratio === "16:9") return [even(short * 16 / 9), short];
  if (ratio === "9:16") return [short, even(short * 16 / 9)];
  if (ratio === "1:1") return [short, short];
  const scale = Math.min(1, (short * 16 / 9) / Math.max(sourceWidth, sourceHeight));
  return [even(sourceWidth * scale), even(sourceHeight * scale)];
}

// Blur background keeps the picture whole and fills the frame with a blurred
// copy; Black bars pads; Crop to fill crops. Zoom then Flip. The chain ends on
// one unlabelled filter so a caller can append to it.
export function framingFilter({ width: w, height: h, fill, zoom = 1, flip = false }: { width: number; height: number; fill: FrameFill; zoom?: number; flip?: boolean }) {
  const zoomSteps = zoom > 1 ? [`scale=trunc(iw*${zoom}/2)*2:trunc(ih*${zoom}/2)*2`, `crop=min(iw\\,${w}):min(ih\\,${h})`] : [];
  const flipStep = flip ? ["hflip"] : [];
  if (fill === "cover") {
    return [`scale=${w}:${h}:force_original_aspect_ratio=increase`, `crop=${w}:${h}`, ...zoomSteps, ...flipStep, "setsar=1"].join(",");
  }
  const fitted = [`scale=${w}:${h}:force_original_aspect_ratio=decrease`, ...zoomSteps].join(",");
  if (fill === "bars") {
    return [fitted, `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`, ...flipStep, "setsar=1"].join(",");
  }
  const radius = Math.max(8, Math.round(w / 48));
  return [
    "split[bg][fg]",
    `[bg]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=${radius}:2[bgb]`,
    `[fg]${fitted}[fgs]`,
    `[bgb][fgs]overlay=(W-w)/2:(H-h)/2${flip ? ",hflip" : ""},setsar=1`,
  ].join(";");
}
