"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "@geckoui/geckoui";
import { LoadingButton } from "@/components/ui/Button";
import { useRead, useWrite } from "@/lib/spoosh";
import { storyBundleFileName, type StoryBundle } from "@/lib/story-transfer";

// Moving a story between accounts: export writes a JSON bundle to the user's
// disk, import posts one back as a brand-new story owned by whoever is signed
// in. Both halves go through Spoosh like every other call — the file itself
// never touches the network as a file, only as the JSON body/response.
// See history/story-transfer.md.

export function ExportStoryMenuItem({ storyId, onDone }: { storyId: string; onDone?: () => void }) {
  // enabled:false — this read only ever runs from the click, never on render.
  const { trigger: fetchBundle, fetching } = useRead((api) => api("stories/:id/export").GET({ params: { id: storyId } }), {
    enabled: false,
  });

  async function handleExport() {
    const { data, error } = await fetchBundle({ force: true });
    if (error || !data) {
      toast.error(error?.error ?? "Could not export this story.");
      return;
    }
    downloadBundle(data);
    toast.success("Story exported.");
    onDone?.();
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={fetching}
      className="block w-full px-3.5 py-2.5 text-left text-[13px] text-fg hover:bg-hover disabled:opacity-60"
    >
      {fetching ? "Exporting…" : "Export story"}
    </button>
  );
}

function downloadBundle(bundle: StoryBundle) {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = storyBundleFileName(bundle.story.title, bundle.exportedAt);
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportStoryButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const { trigger: importStory, loading } = useWrite((api) => api("stories/import").POST());

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset first: picking the same file twice must fire change again.
    e.target.value = "";
    if (!file) return;

    setReading(true);
    let bundle: StoryBundle;
    try {
      bundle = JSON.parse(await file.text()) as StoryBundle;
    } catch {
      setReading(false);
      toast.error("That file is not valid JSON.");
      return;
    }
    setReading(false);

    const { data, error } = await importStory({ body: { bundle }, invalidate: ["stories"] });
    if (error || !data) {
      toast.error(error?.error ?? "Could not import that story.");
      return;
    }
    toast.success(`Imported "${data.title}".`);
    router.push(`/stories/${data.id}`);
  }

  const busy = reading || loading;

  return (
    <>
      {/* GeckoUI ships no non-RHF file picker, so the native input is hidden
          here and opened by the styled button — same approach as
          components/ChapterImageUpload.tsx. */}
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={handlePick} />
      <LoadingButton
        variant="secondary"
        loading={busy}
        onClick={() => input.current?.click()}
        className="!h-9 !w-9 !p-0 flex items-center justify-center"
        title="Import a story export"
        aria-label="Import a story export"
      >
        {/* Spinner only while importing — LoadingButton keeps rendering its
            children next to the spinner, so the icon has to come out. */}
        {busy ? null : <Upload size={16} />}
      </LoadingButton>
    </>
  );
}
