"use client";

import { useRef, useState } from "react";
import { toast } from "@geckoui/geckoui";
import { useWrite } from "@/lib/spoosh";

// One upload implementation for all three surfaces — the chapter gallery, an
// asset card, and a shot card. The only difference between them is the link sent
// at commit time, so the flow itself lives here rather than being written out
// three times and drifting.
//
// The three steps are deliberately separate: presign (our API) -> PUT (straight
// to R2) -> commit (our API). The bytes never pass through the app, which is
// what removes any upload size limit, and a failed PUT leaves an orphaned object
// rather than a row pointing at nothing.
export type UploadLink = { chapterAssetId?: string | null; shotId?: string | null };

export function useChapterImageUpload(chapterId: string, onUploaded?: () => void) {
  const { trigger: presign } = useWrite((api) => api("chapters/:id/images/presign").POST());
  const { trigger: commit } = useWrite((api) => api("chapters/:id/images").POST());

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  async function upload(fileList: FileList | File[] | null, link: UploadLink = {}) {
    const all = Array.from(fileList ?? []);
    if (!all.length) return;

    // A dropped folder carries .DS_Store and whatever else — filtering here
    // keeps one stray file from failing the whole batch. The server enforces the
    // same rule when it mints the presigned URLs, which is where it counts.
    const files = all.filter((f) => f.type.startsWith("image/"));
    const skipped = all.length - files.length;
    if (!files.length) {
      toast.error(skipped ? "No image files in that selection." : "Nothing to upload.");
      return;
    }

    setUploading(true);
    setProgress({ done: 0, total: files.length });
    try {
      const { data: slots, error } = await presign({
        params: { id: chapterId },
        body: { files: files.map((f) => ({ fileName: f.name, contentType: f.type })) },
      });
      if (error || !slots) {
        toast.error(error?.error ?? "Could not start the upload.");
        return;
      }

      // The one place the app does not go through the Spoosh client: the target
      // is Cloudflare on a presigned URL, not our own API. Sequential rather
      // than Promise.all, so a folder of large renders does not open fifty
      // connections at once and progress means something.
      const uploaded: { slot: (typeof slots)[number]; file: File }[] = [];
      const failed: string[] = [];
      for (const [i, slot] of slots.entries()) {
        const file = files[i];
        try {
          const res = await fetch(slot.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": slot.contentType },
          });
          if (!res.ok) throw new Error(String(res.status));
          uploaded.push({ slot, file });
        } catch {
          failed.push(file.name);
        }
        setProgress({ done: i + 1, total: files.length });
      }

      if (uploaded.length) {
        // Only what actually landed gets a row, so the gallery never lists an
        // image that is not in the bucket.
        const { error: commitErr } = await commit({
          params: { id: chapterId },
          body: {
            images: uploaded.map(({ slot, file }) => ({
              fileName: slot.fileName,
              objectKey: slot.objectKey,
              url: slot.url,
              contentType: slot.contentType,
              sizeBytes: file.size,
            })),
            ...link,
          },
        });
        if (commitErr) toast.error(commitErr.error);
        else onUploaded?.();
      }

      const notes = [
        uploaded.length ? `${uploaded.length} uploaded` : null,
        failed.length ? `${failed.length} failed` : null,
        skipped ? `${skipped} skipped (not images)` : null,
      ].filter(Boolean);
      if (failed.length) toast.error(notes.join(", "));
      else toast.success(notes.join(", "));
    } finally {
      setUploading(false);
      setProgress({ done: 0, total: 0 });
    }
  }

  return { upload, uploading, progress };
}

// Hidden native inputs plus the ref that opens them. GeckoUI ships no non-RHF
// file picker, so this is the one control it does not cover; keeping the markup
// here means nothing unstyled is ever written into a page.
//
// Two inputs because a folder picker needs `webkitdirectory`, which cannot be
// toggled per click without React remounting the element, and a directory-mode
// input refuses to pick loose files.
export function useImagePickers(onPick: (files: FileList | null) => void, multiple = true) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    onPick(e.target.files);
    e.target.value = "";
  }

  const inputs = (
    <>
      <input ref={fileInput} type="file" multiple={multiple} accept="image/*" hidden onChange={handle} />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        // Not in React's typings; a directory picker has no other way in.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={handle}
      />
    </>
  );

  return { inputs, openFiles: () => fileInput.current?.click(), openFolder: () => folderInput.current?.click() };
}
