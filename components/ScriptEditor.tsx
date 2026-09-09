"use client";

import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, FileInput, Copy, Check } from "lucide-react";
import { Dialog, Textarea } from "@geckoui/geckoui";
import { Body, Wrap } from "@/components/ui/Layout";
import { Button, MiniButton } from "@/components/ui/Button";
import { screenplayNodes } from "@/lib/tiptap/screenplay-nodes";
import { parseScreenplayText, SCREENPLAY_FORMAT_GUIDE } from "@/lib/tiptap/screenplay-parser";

const inactiveState = {
  focused: false,
  title: false,
  sceneHeading: false,
  action: false,
  character: false,
  parenthetical: false,
  dialog: false,
  voiceOver: false,
  transition: false,
  canUndo: false,
  canRedo: false,
};

function ImportScreenplayDialog({
  dismiss,
  onInsert,
}: {
  dismiss: () => void;
  onInsert: (blocks: ReturnType<typeof parseScreenplayText>) => void;
}) {
  const [text, setText] = useState("");
  const [copiedGuide, setCopiedGuide] = useState(false);

  function copyGuide() {
    navigator.clipboard.writeText(SCREENPLAY_FORMAT_GUIDE);
    setCopiedGuide(true);
    setTimeout(() => setCopiedGuide(false), 1500);
  }

  function insert() {
    const blocks = parseScreenplayText(text);
    if (blocks.length === 0) return;
    onInsert(blocks);
    dismiss();
  }

  return (
    <div className="flex w-[560px] max-w-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-fg">Import script</h3>
        <MiniButton ghost onClick={copyGuide} className="flex items-center gap-1.5">
          {copiedGuide ? <Check size={13} /> : <Copy size={13} />}
          {copiedGuide ? "Copied" : "Copy Format Guide"}
        </MiniButton>
      </div>

      <p className="text-[12.5px] text-fg-3">
        Paste screenplay text below. Prefix each line with its block label —{" "}
        <code className="text-fg-2">Title:</code>, <code className="text-fg-2">Scene:</code>,{" "}
        <code className="text-fg-2">Action:</code>, <code className="text-fg-2">Character:</code>,{" "}
        <code className="text-fg-2">Dialog:</code>, <code className="text-fg-2">Voice Over:</code>,{" "}
        <code className="text-fg-2">Transition:</code> — so it works in any language. Copy the format guide for an
        example. Plain screenplay text is imported too, best-effort.
      </p>

      <Textarea
        autoResize
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your script here..."
        className="max-h-[360px] min-h-[220px] overflow-y-auto text-[13px]"
      />

      <div className="mt-1 flex justify-end gap-2">
        <Button variant="ghost" onClick={dismiss}>
          Cancel
        </Button>
        <Button variant="primary" onClick={insert} disabled={!text.trim()}>
          Insert
        </Button>
      </div>
    </div>
  );
}

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ScriptEditor({
  content,
  onChange,
}: {
  content: unknown;
  onChange: (json: unknown) => void;
}) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, ...screenplayNodes],
    content: (content as object) ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "tiptap-doc" },
    },
    onUpdate: ({ editor }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(editor.getJSON()), 800);
    },
  });

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor) return inactiveState;
      return {
        focused: editor.isFocused,
        title: editor.isActive("title"),
        sceneHeading: editor.isActive("sceneHeading"),
        action: editor.isActive("paragraph"),
        character: editor.isActive("character"),
        parenthetical: editor.isActive("parenthetical"),
        dialog: editor.isActive("dialog"),
        voiceOver: editor.isActive("voiceOver"),
        transition: editor.isActive("transition"),
        canUndo: editor.can().undo(),
        canRedo: editor.can().redo(),
      };
    },
  });

  if (!editor) {
    return (
      <Body>
        <Wrap>
          <div className="tiptap-doc text-fg-3">Preparing editor...</div>
        </Wrap>
      </Body>
    );
  }

  const toolbarState = state ?? inactiveState;
  const toolBtn = (active?: boolean) =>
    `rounded-md px-3 py-1.5 font-semibold hover:bg-[#191919] ${active ? "bg-[#191919] text-fg" : "text-fg"}`;
  const iconBtn = (active?: boolean) =>
    `rounded-md px-3 py-1.5 font-normal hover:bg-[#191919] ${active ? "bg-[#191919] text-fg" : "text-fg-2"}`;
  const sep = "mx-2.5 h-5.5 w-px bg-line-2";

  const setNode = (name: string) => editor.chain().focus().setNode(name).run();
  const insertDialogTemplate = () =>
    editor
      .chain()
      .focus()
      .insertContent([
        { type: "character", content: [{ type: "text", text: "NAME" }] },
        { type: "dialog", content: [{ type: "text", text: "Dialog goes here..." }] },
      ])
      .run();

  function openImportDialog() {
    const activeEditor = editor;
    Dialog.show({
      content: ({ dismiss }) => (
        <ImportScreenplayDialog
          dismiss={dismiss}
          onInsert={(blocks) => activeEditor!.chain().focus().insertContent(blocks).run()}
        />
      ),
      className: "max-w-[600px]",
    });
  }

  return (
    <>
      <div
        className={`flex flex-wrap items-center justify-center gap-2 border-b px-5 py-3 text-fg-2 ${
          toolbarState.focused ? "border-line-2" : "border-line"
        }`}
      >
        <Button variant="ghost" className={toolBtn(toolbarState.title)} onClick={() => setNode("title")}>
          Title
        </Button>
        <Button variant="ghost" className={toolBtn(toolbarState.sceneHeading)} onClick={() => setNode("sceneHeading")}>
          Scene
        </Button>
        <Button
          variant="ghost"
          className={toolBtn(toolbarState.action)}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          Action
        </Button>
        <Button variant="ghost" className={toolBtn(toolbarState.dialog)} onClick={insertDialogTemplate}>
          Dialog
        </Button>
        <Button variant="ghost" className={toolBtn(toolbarState.voiceOver)} onClick={() => setNode("voiceOver")}>
          Voice Over
        </Button>
        <Button variant="ghost" className={toolBtn(toolbarState.transition)} onClick={() => setNode("transition")}>
          Transition
        </Button>
        <span className={sep}></span>
        <Button variant="ghost" className={iconBtn()} onClick={openImportDialog} title="Import script">
          <FileInput size={15} />
        </Button>
        <span className={sep}></span>
        <Button
          variant="ghost"
          className={iconBtn()}
          disabled={!toolbarState.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={15} />
        </Button>
        <Button
          variant="ghost"
          className={iconBtn()}
          disabled={!toolbarState.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={15} />
        </Button>
      </div>
      <Body>
        <Wrap>
          <EditorContent editor={editor} />
        </Wrap>
      </Body>
    </>
  );
}
