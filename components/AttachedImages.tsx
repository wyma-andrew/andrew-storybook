"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "@geckoui/geckoui";
import { MiniButton } from "@/components/ui/Button";
import { useChapterImageUpload, useImagePickers, type UploadLink } from "@/components/ChapterImageUpload";
import { showImagePreview } from "@/components/ImagePreviewDialog";
import { useWrite } from "@/lib/spoosh";
import type { ChapterImage } from "@/lib/api/types";

// The upload strip shown on an asset card and on a shot card: whatever is
// already attached, plus a way to attach more. Both surfaces get the same
// component because the only thing that differs between them is the link.
//
// Thumbnails open the shared preview, which is where Download and Delete live.
// The tile carries nothing but the image: a destructive control on a small tile
// makes a mis-click cheap, and renaming belongs on the chapter gallery.
//
// The tile fills its slot and crops: a fixed box with object-cover, so a 16:9
// and a 9:16 render occupy exactly the same space and the column stays an even
// stack. Letting the width follow the aspect ratio instead left a ragged edge
// and a dead gap beside every portrait render. The full frame is one click away
// in the preview, which is where it can be shown uncropped.
export function AttachedImages({
  chapterId,
  link,
  images,
  onUploaded,
  label,
  max = Infinity,
}: {
  chapterId: string;
  link: UploadLink;
  images: ChapterImage[];
  onUploaded: () => void;
  label: string;
  /** How many images this target may hold. A shot takes one — it is one frame,
   *  and a second render of it is a replacement, not an addition. */
  max?: number;
}) {
  const remaining = Math.max(max - images.length, 0);

  const { upload, uploading, progress } = useChapterImageUpload(chapterId, onUploaded);
  // Sliced as well as capped in the picker: a drag-and-drop or a multi-select
  // from an older picker can still hand over more than the target may hold.
  const { inputs, openFiles } = useImagePickers(
    (files) => void upload(Array.from(files ?? []).slice(0, remaining), link),
    max !== 1
  );
  const { trigger: removeImage } = useWrite((api) => api("chapter-images/:id").DELETE());

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      {inputs}
      {images.map((image, i) => (
        <button
          key={image.id}
          type="button"
          title={image.fileName}
          aria-label={`Preview ${image.fileName}`}
          onClick={() =>
            showImagePreview(images, i, async (picked) => {
              const { error } = await removeImage({ params: { id: picked.id } });
              if (error) toast.error(error.error);
              else onUploaded();
            })
          }
          className="block h-20 w-full cursor-pointer overflow-hidden rounded-md border border-line-2 bg-sunken transition-opacity hover:opacity-85 md:h-28"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.fileName} className="size-full object-cover" loading="lazy" />
        </button>
      ))}
      {/* Gone once the target is full. For a shot that means the button only
          reappears after the image is deleted from the preview — replacing a
          frame is a deliberate act, not a second upload that silently wins. */}
      {remaining > 0 && (
      <MiniButton
        ghost
        // Full width of its column, not a fixed 80px: in a narrow side column a
        // small square button leaves a wide dead gap beside it, and the empty
        // state should look like the slot the image will fill. Dashed, so it
        // reads as a placeholder rather than as a button that does something to
        // the shot.
        className="!h-20 !w-full !min-w-0 justify-center border border-dashed border-line-2 !p-0 md:!h-28"
        onClick={openFiles}
        disabled={uploading}
        aria-label={`Upload images for ${label}`}
        title={`Upload images for ${label}`}
      >
        {uploading ? (
          <span className="flex flex-col items-center gap-0.5">
            <Loader2 size={13} className="animate-spin" />
            <span className="text-[9px] text-fg-3">
              {progress.done}/{progress.total}
            </span>
          </span>
        ) : (
          <ImagePlus size={18} />
        )}
      </MiniButton>
      )}
    </div>
  );
}
