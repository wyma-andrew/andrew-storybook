"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Images, Trash2, Upload, FolderUp, Loader2, Pencil } from "lucide-react";
import { ConfirmDialog, Dialog, Input, Select, SelectOption, toast } from "@geckoui/geckoui";
import { Frame } from "@/components/Frame";
import { ChapterHeader } from "@/components/ChapterHeader";
import { Button, LoadingButton, MiniButton } from "@/components/ui/Button";
import { EmptyCta } from "@/components/ui/EmptyCta";
import { Tag, AccentTag } from "@/components/ui/Tag";
import { Toolbar, ToolbarButton, toolbarSep } from "@/components/ui/Toolbar";
import { Body, Wrap, Foot } from "@/components/ui/Layout";
import { SkeletonCards } from "@/components/ui/Skeleton";
import { useRead, useWrite } from "@/lib/spoosh";
import { useChapterImageUpload, useImagePickers } from "@/components/ChapterImageUpload";
import { showImagePreview, formatBytes } from "@/components/ImagePreviewDialog";
import type { ChapterImage } from "@/lib/api/types";

// Renames the gallery name only. The R2 key is untouched, so a rename cannot
// break the image's URL — see the PATCH handler.
function RenameImageForm({
  currentName,
  onSave,
  dismiss,
}: {
  currentName: string;
  onSave: (next: string) => Promise<void>;
  dismiss: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) return dismiss();
    setSaving(true);
    try {
      await onSave(trimmed);
      dismiss();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="mb-1 text-[16px] font-semibold">Rename image</h2>
      <p className="mb-4 text-[12.5px] text-fg-3">
        The gallery is ordered by this name, so renaming moves the image. The file in storage is unchanged.
      </p>
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="1.2.png"
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
      <div className="mt-4 flex justify-end gap-2.5">
        <Button variant="secondary" onClick={dismiss}>
          Cancel
        </Button>
        <LoadingButton variant="primary" loading={saving} disabled={!name.trim()} onClick={() => void submit()}>
          Save
        </LoadingButton>
      </div>
    </div>
  );
}

export default function ChapterImagesPage() {
  const { id, chapterId } = useParams<{ id: string; chapterId: string }>();

  const { data: story } = useRead((api) => api("stories/:id").GET({ params: { id } }));
  const { data: chapter } = useRead((api) => api("chapters/:id").GET({ params: { id: chapterId } }));
  const { data: images, trigger: refetchImages } = useRead((api) =>
    api("chapters/:id/images").GET({ params: { id: chapterId } })
  );

  const { trigger: removeImage } = useWrite((api) => api("chapter-images/:id").DELETE());
  const { trigger: renameImage } = useWrite((api) => api("chapter-images/:id").PATCH());

  // No link passed: images uploaded straight to the gallery start unused, which
  // is the honest state — nothing in the chapter generated them.
  const { upload, uploading, progress } = useChapterImageUpload(chapterId, refetchImages);
  const { inputs, openFiles, openFolder } = useImagePickers((files) => void upload(files));

  const [dragging, setDragging] = useState(false);

  // Used = still attached to a live asset or shot. Both links are ON DELETE SET
  // NULL, so deleting an asset or regenerating a scene drops its images to
  // unused on their own — this filter reads real state, never a stored flag.
  const [filter, setFilter] = useState<"all" | "used" | "unused">("all");
  const usedCount = (images ?? []).filter((image) => !!image.linkedLabel).length;
  const shown = (images ?? []).filter((image) =>
    filter === "all" ? true : filter === "used" ? !!image.linkedLabel : !image.linkedLabel
  );

  function openRename(image: ChapterImage) {
    Dialog.show({
      content: ({ dismiss }) => (
        <RenameImageForm
          currentName={image.fileName}
          dismiss={dismiss}
          onSave={async (fileName) => {
            const { error } = await renameImage({ params: { id: image.id }, body: { fileName } });
            if (error) toast.error(error.error);
            else refetchImages();
          }}
        />
      ),
    });
  }

  // The preview dialog runs its own confirm before calling this; the card's
  // trash button asks here. One delete path either way.
  async function deleteImage(imageId: string) {
    const { error } = await removeImage({ params: { id: imageId } });
    if (error) toast.error(error.error);
    else refetchImages();
  }

  function confirmRemove(imageId: string, fileName: string) {
    ConfirmDialog.show({
      title: "Delete image?",
      content: `${fileName} is removed from this chapter and deleted from storage. Cannot be undone.`,
      confirmButtonLabel: "Delete",
      cancelButtonLabel: "Cancel",
      onConfirm: ({ dismiss }) => {
        dismiss();
        void deleteImage(imageId);
      },
    });
  }

  if (!story || !chapter) {
    return (
      <Frame>
        <Body>
          <Wrap wide>
            <div className="pt-6">
              <SkeletonCards count={6} label="Loading images" columns="grid-cols-3" />
            </div>
          </Wrap>
        </Body>
      </Frame>
    );
  }

  return (
    <Frame>
      <ChapterHeader
        storyId={id}
        storyTitle={story.title}
        chapterId={chapterId}
        chapterTitle={chapter.title}
        active="images"
        styleName={story.visualStyleName ?? "None"}
        storyAspectRatio={story.aspectRatio}
        chapterAspectRatio={chapter.aspectRatio}
      />

      <Toolbar>
        <ToolbarButton onClick={openFiles} disabled={uploading}>
          <Upload size={13} /> Upload images
        </ToolbarButton>
        <ToolbarButton onClick={openFolder} disabled={uploading}>
          <FolderUp size={13} /> Upload folder
        </ToolbarButton>
        {uploading && (
          <>
            <div className={toolbarSep} />
            <span className="flex items-center gap-1.5">
              <Loader2 size={13} className="animate-spin" />
              {progress.done} / {progress.total}
            </span>
          </>
        )}
        {!!images?.length && !uploading && (
          <>
            <div className={toolbarSep} />
            {/* The counts are what make this worth a select rather than three
                buttons: the option itself says how many are in it, so the answer
                to "do I have orphans" needs no click. */}
            <Select
              value={filter}
              onChange={(value) => setFilter(value as typeof filter)}
              wrapperClassName="w-[150px] shrink-0"
            >
              <SelectOption value="all" label={`All (${images.length})`} />
              <SelectOption value="used" label={`Used (${usedCount})`} />
              <SelectOption value="unused" label={`Unused (${images.length - usedCount})`} />
            </Select>
          </>
        )}
      </Toolbar>

      {inputs}

      <Body>
        {/* min-h-full on both: the drop target is the whole visible page, not
            just the rows that happen to exist. With a short gallery the area
            below the last thumbnail is the most natural place to aim a dropped
            folder, and a content-height target silently ignores it. */}
        <Wrap
          wide
          className={`min-h-full ${dragging ? "rounded-xl outline-2 outline-offset-4 outline-dashed outline-accent" : ""}`}
        >
          <div
            className="min-h-full"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void upload(e.dataTransfer.files);
            }}
          >
            {!images?.length ? (
              <EmptyCta
                dotted
                title="No images yet"
                icon={<Images size={19} />}
                action={
                  <MiniButton onClick={openFiles} disabled={uploading}>
                    <Upload size={12} /> Upload images
                  </MiniButton>
                }
              >
                Upload the renders you generated from this chapter&apos;s prompts. Drop files or a folder anywhere on
                this page. They are listed by file name, so names like 1.2.png keep shot order.
              </EmptyCta>
            ) : !shown.length ? (
              <EmptyCta title={filter === "used" ? "Nothing attached yet" : "Everything is in use"} icon={<Images size={19} />}>
                {filter === "used"
                  ? "Images uploaded from an asset card or a shot card show up here."
                  : "No image has lost its asset or shot."}
              </EmptyCta>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((image, i) => (
                  <figure
                    key={image.id}
                    className="overflow-hidden rounded-[10px] border border-line bg-panel-3 shadow-sm"
                  >
                    <button
                      type="button"
                      // The filtered list, not every image: arrowing through the
                      // preview should stay inside what the page is showing.
                      onClick={() => showImagePreview(shown, i, (picked) => void deleteImage(picked.id))}
                      className="block w-full cursor-pointer bg-sunken"
                      aria-label={`Preview ${image.fileName}`}
                    >
                      {/* Plain <img>: these are arbitrary R2 URLs at unknown
                          dimensions, which next/image would need configured
                          remote patterns and a size for. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={image.fileName} className="h-40 w-full object-contain" loading="lazy" />
                    </button>
                    <figcaption className="border-t border-line px-2.5 py-2">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span
                          className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg-2"
                          title={image.fileName}
                        >
                          {image.fileName}
                        </span>
                        {formatBytes(image.sizeBytes) && (
                          <span className="shrink-0 text-[11px] text-fg-3">{formatBytes(image.sizeBytes)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {/* The label IS the used state — it is non-null only
                            while the asset or shot it points at still exists. */}
                        {image.linkedLabel ? (
                          <AccentTag
                            className="min-w-0 max-w-full truncate bg-matched-bg text-matched"
                            title={image.linkedLabel}
                          >
                            {image.linkedLabel}
                          </AccentTag>
                        ) : (
                          <Tag>Unused</Tag>
                        )}
                        <div className="flex-1" />
                        <MiniButton
                          ghost
                          className="!h-6 !w-6 shrink-0 !p-0"
                          onClick={() => openRename(image)}
                          aria-label={`Rename ${image.fileName}`}
                          title="Rename"
                        >
                          <Pencil size={12} />
                        </MiniButton>
                        <MiniButton
                          ghost
                          className="!h-6 !w-6 shrink-0 !p-0"
                          onClick={() => confirmRemove(image.id, image.fileName)}
                          aria-label={`Delete ${image.fileName}`}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </MiniButton>
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
