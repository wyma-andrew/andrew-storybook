"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Input, useFilePicker } from "@geckoui/geckoui";
import { Button, LoadingButton } from "@/components/ui/Button";

type LogoTemplateDialogValues = {
  name: string;
  file: File | null;
  watermarkText: string;
};

export function LogoTemplateDialogContent({
  title,
  description,
  initialName = "",
  initialFile = null,
  currentFileName = "",
  initialWatermarkText = "",
  submitLabel,
  submittingLabel,
  dismiss,
  onSubmit,
}: {
  title: string;
  description: string;
  initialName?: string;
  initialFile?: File | null;
  currentFileName?: string;
  initialWatermarkText?: string;
  submitLabel: string;
  submittingLabel: string;
  dismiss: () => void;
  onSubmit: (values: LogoTemplateDialogValues) => Promise<boolean>;
}) {
  const [name, setName] = useState(initialName);
  const [file, setFile] = useState<File | null>(initialFile);
  const [watermarkText, setWatermarkText] = useState(initialWatermarkText);
  const [submitting, setSubmitting] = useState(false);
  const { openFilePicker } = useFilePicker<HTMLDivElement>({
    accept: "image/png,image/jpeg,image/webp",
    onChange: (_files, newFiles) => {
      if (newFiles[0]) setFile(newFiles[0]);
    },
  });

  async function submit() {
    setSubmitting(true);
    try {
      if (await onSubmit({ name, file, watermarkText })) dismiss();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div><h3 className="text-base font-semibold">{title}</h3><p className="mt-1 text-sm text-fg-2">{description}</p></div>
      <Input autoFocus value={name} placeholder="Template name" onChange={(event) => setName(event.target.value)} />
      <div>
        <div className="mb-2 text-xs font-medium text-fg-2">Logo file</div>
        <Button disabled={submitting} onClick={() => openFilePicker({ multiple: false })}><Upload size={14} /> {file || currentFileName ? "Replace image" : "Choose image"}</Button>
        <p className="mt-2 truncate text-xs text-fg-3">{file?.name || currentFileName || "PNG, JPEG, or WebP"}</p>
      </div>
      <div><div className="mb-2 text-xs font-medium text-fg-2">Watermark text <span className="font-normal text-fg-3">(optional)</span></div><Input value={watermarkText} placeholder="Text over the logo" onChange={(event) => setWatermarkText(event.target.value)} /></div>
      <div className="flex justify-end gap-2">
        <Button disabled={submitting} variant="secondary" onClick={dismiss}>Cancel</Button>
        <LoadingButton loading={submitting} loadingText={submittingLabel} onClick={() => void submit()}>{submitLabel}</LoadingButton>
      </div>
    </div>
  );
}
