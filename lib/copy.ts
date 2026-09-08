import { toast } from "@geckoui/geckoui";

// Every "Copy …" button in the app goes through here.
//
// Two reasons this isn't a bare navigator.clipboard.writeText call:
//   1. Feedback. The copied text is long and lands in another app entirely, so
//      without a toast there is no way to tell a successful copy from a dead
//      button.
//   2. navigator.clipboard only exists in a secure context — https or
//      localhost. Reaching the dev server over a LAN IP (192.168.x.x) leaves
//      it undefined and the promise rejects, so we fall back to the old
//      execCommand path rather than failing silently.
export async function copyText(text: string, label = "Prompt") {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if (!ok) throw new Error("execCommand copy failed");
    }
    toast.info(`${label} copied`);
  } catch {
    toast.error(`Couldn't copy ${label.toLowerCase()} — copy it manually from the card.`);
  }
}
