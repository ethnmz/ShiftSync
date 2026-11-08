export type Theme = "light" | "dark";
const KEY = "shiftsync-theme";

// Light by default: the team chose the light, neutral reference look. Dark
// stays one tap away for night shift. Per-viewer convenience only.
export function readTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode: just won't persist */
  }
}
