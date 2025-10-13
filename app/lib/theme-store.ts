export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "vc-theme-mode";

const isBrowser = () => typeof window !== "undefined";

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark";

const readPersistedMode = (): ThemeMode | null => {
  if (!isBrowser()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
};

const writePersistedMode = (mode: ThemeMode) => {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Ignore write failures (e.g., private mode, storage disabled)
  }
};

const getPreferredMode = (): ThemeMode => {
  if (!isBrowser()) {
    return "light";
  }

  try {
    if (typeof window.matchMedia === "function") {
      const query = window.matchMedia("(prefers-color-scheme: dark)");
      return query.matches ? "dark" : "light";
    }
  } catch {
    // Ignore media query failures
  }

  return "light";
};

export class ThemeStore {
  private mode: ThemeMode;
  private listeners = new Set<(mode: ThemeMode) => void>();
  private hydrated = false;

  constructor(initialMode: ThemeMode = "light") {
    this.mode = initialMode;
  }

  getMode(): ThemeMode {
    return this.mode;
  }

  setMode(mode: ThemeMode, options?: { persist?: boolean }) {
    if (!isThemeMode(mode)) {
      return;
    }

    if (this.mode === mode) {
      return;
    }

    this.mode = mode;
    if (options?.persist !== false) {
      writePersistedMode(mode);
    }
    this.notify();
  }

  toggle() {
    this.setMode(this.mode === "dark" ? "light" : "dark");
  }

  hydrate(): ThemeMode {
    if (this.hydrated) {
      return this.mode;
    }

    this.hydrated = true;
    const persisted = readPersistedMode();
    if (persisted) {
      if (persisted !== this.mode) {
        this.mode = persisted;
        this.notify();
      }
      return this.mode;
    }

    const preferred = getPreferredMode();
    if (preferred !== this.mode) {
      this.mode = preferred;
      this.notify();
    }
    return this.mode;
  }

  subscribe(listener: (mode: ThemeMode) => void) {
    this.listeners.add(listener);
    listener(this.mode);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => {
      listener(this.mode);
    });
  }
}

export const __storage = {
  key: STORAGE_KEY,
  read: readPersistedMode,
  write: writePersistedMode,
};
