// Theme is a user choice, not the OS's: the app is a dark tool by identity and
// an OS-driven flip would hand existing users a light app they never asked for.
// See history/theming.md.
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "ai-storybook-theme";
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

// Inlined into <head> so the class is on <html> before first paint — without
// it a light-mode user gets a dark flash on every navigation that reloads.
// Kept as one small expression because it is stringified, not bundled.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark")t="${DEFAULT_THEME}";document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(t);}catch(e){}`;
