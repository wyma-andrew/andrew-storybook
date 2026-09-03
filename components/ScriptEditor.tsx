"use client";

import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { Undo2, Redo2 } from "lucide-react";
import { Body, Wrap } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { screenplayNodes } from "@/lib/tiptap/screenplay-nodes";

const inactiveState = {
  focused: false,
  title: false,
  sceneHeading: false,
  action: false,
  character: false,
  parenthetical: false,
  dialog: false,
  transition: false,
  canUndo: false,
  canRedo: false,
};

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

  return (
    <>
      <div
        className={`flex items-center justify-center gap-2 border-b px-5 py-3 text-fg-2 ${
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
        <Button variant="ghost" className={toolBtn(toolbarState.transition)} onClick={() => setNode("transition")}>
          Transition
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
