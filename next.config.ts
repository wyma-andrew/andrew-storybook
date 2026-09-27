import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both packages locate their binary from __dirname, which bundling would break.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
  outputFileTracingIncludes: {
    "/api/movie-recaps/[id]/script/beat/preview": [
      "./node_modules/ffmpeg-static/ffmpeg",
      "./node_modules/ffprobe-static/bin/linux/x64/ffprobe",
    ],
  },
  // ffprobe-static ships every platform's binary (~340 MB); only linux x64 runs on Vercel.
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/ffprobe-static/bin/darwin/**",
      "./node_modules/ffprobe-static/bin/win32/**",
      "./node_modules/ffprobe-static/bin/linux/ia32/**",
    ],
  },
};

export default nextConfig;
