"use client";

import { CssBaseline, ThemeProvider } from "@mui/material";
import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createAppTheme } from "./theme";
import { ThemeStore, type ThemeMode } from "./lib/theme-store";

type ThemeController = {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
};

const ThemeControllerContext = createContext<ThemeController | null>(null);

export const useThemeController = () => {
  const context = useContext(ThemeControllerContext);
  if (!context) {
    throw new Error("useThemeController must be used within Providers");
  }
  return context;
};

export default function Providers({ children }: PropsWithChildren) {
  const themeStoreRef = useRef<ThemeStore | null>(null);

  if (!themeStoreRef.current) {
    themeStoreRef.current = new ThemeStore();
  }

  const themeStore = themeStoreRef.current!;
  const [mode, setMode] = useState<ThemeMode>(() => themeStore.getMode());

  useEffect(() => {
    const unsubscribe = themeStore.subscribe((nextMode) => {
      setMode(nextMode);
    });

    themeStore.hydrate();
    return unsubscribe;
  }, [themeStore]);

  const handleToggle = useCallback(() => {
    themeStore.toggle();
  }, [themeStore]);

  const handleSetMode = useCallback((nextMode: ThemeMode) => {
    themeStore.setMode(nextMode);
  }, [themeStore]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const controller = useMemo(
    () => ({
      mode,
      toggle: handleToggle,
      setMode: handleSetMode,
    }),
    [handleSetMode, handleToggle, mode],
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.style.setProperty("--vc-color-scheme", mode);
    document.documentElement.style.colorScheme = mode;
    const background = theme.palette.background.default;
    document.body.style.setProperty("--vc-background", background);
    document.body.style.backgroundColor = background;
    document.documentElement.style.backgroundColor = background;
  }, [mode, theme]);

  return (
    <ThemeControllerContext.Provider value={controller}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeControllerContext.Provider>
  );
}
