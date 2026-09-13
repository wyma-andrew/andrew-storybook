"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, toast } from "@geckoui/geckoui";
import { ChevronLeft, ChevronRight, Download, Trash2, X } from "lucide-react";
import { Button, MiniButton } from "@/components/ui/Button";
import type { ChapterImage } from "@/lib/api/types";

export function formatBytes(bytes: number | null) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The <a download> attribute is ignored cross-origin, so a plain link to an R2
// URL opens the image instead of saving it. Fetching to a blob and saving that
// is what actually downloads — and it works because the bucket's CORS rule
// already allows GET from this origin, the same rule that lets thumbnails load.
async function downloadImage(url: string, fileName: string) {
  let blobUrl: string | null = null;
  try {
    // cache: "no-store" is load-bearing, not a precaution. An <img> is fetched
    // in no-cors mode with no Origin header, so what lands in the HTTP cache
    // carries no Access-Control-Allow-Origin. This fetch runs in CORS mode,
    // matches that cached entry, finds no ACAO and fails as "Failed to fetch"
    // without ever touching the network. Skipping the cache sidesteps it.
    //
    // crossOrigin="anonymous" on the <img> tags was tried instead and reverted:
    // it poisons the cache the other way round, so images already cached from a
    // no-cors load stop rendering entirely. A download that has to re-fetch is a
    // far smaller cost than a gallery that does not draw.
    const res = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    blobUrl = URL.createObjectURL(await res.blob());

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName;
    // The anchor has to be IN the document: a click on a detached element is
    // ignored in some browsers, and the download silently never starts.
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    // Surfaced to the console as well as the toast: the toast cannot say
    // whether this was the network, CORS, or the blob, and that is the only
    // thing worth knowing when it fails.
    console.error("[image download]", url, err);
    toast.error("Could not download that image.");
  } finally {
    // Revoked on a later tick, never straight after click(): revoking the
    // object URL synchronously can cancel the download it was created for.
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl!), 10_000);
  }
}

// One preview for every surface that shows an image: the chapter gallery, an
// asset card, a shot card. It takes the whole set and an opening index rather
// than a single image, so arrowing through them happens here at full size —
// which is the only place looking through renders is actually useful. A card
// slider is for picking one; this is for reading them.
//
// Delete lives HERE rather than on each thumbnail — a 44px tile has no room for
// a destructive control, and opening the image first means you are looking at
// what you are about to remove.
function PreviewBody({
  images,
  startIndex,
  dismiss,
  onDelete,
}: {
  images: ChapterImage[];
  startIndex: number;
  dismiss: () => void;
  onDelete?: (image: ChapterImage) => void;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(images.length - 1, 0)));
  const [confirming, setConfirming] = useState(false);
  const image = images[index];
  const many = images.length > 1;

  // Wraps, so the arrows never dead-end. Left/right keys do the same thing —
  // this is a lightbox, and reaching for the mouse to step one frame is wrong.
  const step = useCallback(
    (delta: number) => {
      // Arrowing away disarms the confirm — otherwise the bar stays up and now
      // points at whatever image you moved to.
      setConfirming(false);
      setIndex((prev) => (prev + delta + images.length) % images.length);
    },
    [images.length]
  );

  useEffect(() => {
    if (!many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [many, step]);

  if (!image) return null;
  const size = formatBytes(image.sizeBytes);

  return (
    <div className="flex max-h-[90vh] flex-col">
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          {/* Full name, wrapped rather than truncated — the card already shows
              the truncated version, so the only reason to open this is to read
              the whole thing. */}
          <p className="font-mono text-[12.5px] break-all text-fg">{image.fileName}</p>
          <p className="mt-0.5 text-[11.5px] text-fg-3">
            {[
              many ? `${index + 1} of ${images.length}` : null,
              size,
              image.contentType,
              image.linkedLabel ? `attached to ${image.linkedLabel}` : "unused",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <MiniButton ghost className="!h-7 !w-7 shrink-0 !p-0" onClick={dismiss} aria-label="Close preview">
          <X size={14} />
        </MiniButton>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto bg-sunken p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image.url} alt={image.fileName} className="mx-auto max-h-[70vh] w-auto object-contain" />
        {many && (
          <>
            {(
              [
                ["Previous", -1, "left-2", ChevronLeft],
                ["Next", 1, "right-2", ChevronRight],
              ] as const
            ).map(([label, delta, side, Icon]) => (
              <button
                key={label}
                type="button"
                onClick={() => step(delta)}
                aria-label={`${label} image`}
                // text-white, not a theme token: this sits over an arbitrary
                // render, not over a themed surface, so it has to read against
                // whatever the image happens to be.
                className={`absolute top-1/2 ${side} grid size-10 -translate-y-1/2 cursor-pointer place-items-center text-white drop-shadow-md hover:opacity-80`}
              >
                <Icon size={32} strokeWidth={2.25} />
              </button>
            ))}
          </>
        )}
      </div>

      {/* The confirm is a state of THIS dialog's footer, not a second dialog.
          GeckoUI's ConfirmDialog.show mounts into the same portal root this
          preview already occupies, and stacking the two fights over it. An
          inline bar also keeps the image on screen while the question is asked,
          which is the point of confirming from a preview at all. */}
      {confirming ? (
        <div className="flex items-center gap-2 border-t border-danger-border bg-danger-bg px-4 py-3">
          <span className="min-w-0 flex-1 text-[12.5px] text-danger">
            Delete this image? It is removed from the chapter and from storage. Cannot be undone.
          </span>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex items-center gap-1.5"
            onClick={() => {
              setConfirming(false);
              dismiss();
              onDelete?.(image);
            }}
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          {onDelete && (
            <Button variant="danger" className="flex items-center gap-1.5" onClick={() => setConfirming(true)}>
              <Trash2 size={14} /> Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={dismiss}>
            Close
          </Button>
          <Button
            variant="primary"
            className="flex items-center gap-1.5"
            onClick={() => void downloadImage(image.url, image.fileName)}
          >
            <Download size={14} /> Download
          </Button>
        </div>
      )}
    </div>
  );
}

export function showImagePreview(
  images: ChapterImage[],
  startIndex = 0,
  onDelete?: (image: ChapterImage) => void
) {
  if (!images.length) return;
  Dialog.show({
    className: "!max-w-[min(94vw,1100px)] !p-0",
    content: ({ dismiss }) => (
      <PreviewBody images={images} startIndex={startIndex} dismiss={dismiss} onDelete={onDelete} />
    ),
  });
}
