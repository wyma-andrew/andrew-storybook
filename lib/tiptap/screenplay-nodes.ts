// Screenplay block nodes for the script editor: Title, Scene heading, Action
// (default paragraph), Character, Parenthetical, Dialog, Voice Over, Transition.
import { Node, mergeAttributes } from "@tiptap/core";

function screenplayNode(opts: {
  name: string;
  tag: string;
  dataType: string;
  nextOnEnter?: string;
}) {
  return Node.create({
    name: opts.name,
    group: "block",
    content: "inline*",
    parseHTML() {
      return [{ tag: `${opts.tag}[data-type="${opts.dataType}"]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        opts.tag,
        mergeAttributes(HTMLAttributes, { "data-type": opts.dataType }),
        0,
      ];
    },
    addKeyboardShortcuts() {
      const next = opts.nextOnEnter;
      return {
        Enter: () =>
          next && this.editor.isActive(opts.name)
            ? this.editor.chain().focus().splitBlock().setNode(next).run()
            : false,
      };
    },
  });
}

export const Title = screenplayNode({
  name: "title",
  tag: "h1",
  dataType: "title",
  nextOnEnter: "paragraph",
});

export const SceneHeading = screenplayNode({
  name: "sceneHeading",
  tag: "div",
  dataType: "scene-heading",
  nextOnEnter: "paragraph",
});

export const Character = screenplayNode({
  name: "character",
  tag: "div",
  dataType: "character",
  nextOnEnter: "dialog",
});

export const Parenthetical = screenplayNode({
  name: "parenthetical",
  tag: "div",
  dataType: "parenthetical",
  nextOnEnter: "dialog",
});

export const Dialog = screenplayNode({
  name: "dialog",
  tag: "div",
  dataType: "dialog",
});

export const VoiceOver = screenplayNode({
  name: "voiceOver",
  tag: "div",
  dataType: "voice-over",
  nextOnEnter: "paragraph",
});

export const Transition = screenplayNode({
  name: "transition",
  tag: "div",
  dataType: "transition",
  nextOnEnter: "sceneHeading",
});

export const screenplayNodes = [
  Title,
  SceneHeading,
  Character,
  Parenthetical,
  Dialog,
  VoiceOver,
  Transition,
];
