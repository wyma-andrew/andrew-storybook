"use client";

export function captureVideoCover(url: string, atSeconds = 0, remote = false) {
  return new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    const seek = remote || atSeconds > 0;
    video.preload = seek ? "metadata" : "auto";
    video.muted = true;
    if (remote) video.crossOrigin = "anonymous";
    const timer = window.setTimeout(() => finish(null), remote ? 30000 : 12000);
    function finish(image: string | null) {
      window.clearTimeout(timer);
      video.onloadeddata = null;
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(image);
    }
    const capture = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish(null);
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(640, video.videoWidth);
        canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
        const context = canvas.getContext("2d");
        if (!context) return finish(null);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.8).split(",")[1] ?? null);
      } catch {
        finish(null);
      }
    };
    video.onloadedmetadata = () => {
      if (seek) video.currentTime = Math.min(Math.max(atSeconds, 0.01), Math.max(video.duration - 0.01, video.duration / 2));
    };
    if (seek) video.onseeked = capture;
    else video.onloadeddata = capture;
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export async function captureFirstVideoCover(file: File) {
  const url = URL.createObjectURL(file);
  try {
    return await captureVideoCover(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
