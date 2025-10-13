import { createTheme } from "@mui/material/styles";
import type { ThemeMode } from "./lib/theme-store";

const backgroundByMode: Record<ThemeMode, { default: string; paper: string }> = {
  light: {
    default: "#f5f7fa",
    paper: "#ffffff",
  },
  dark: {
    default: "#050b19",
    paper: "#0d1628",
  },
};

export const createAppTheme = (mode: ThemeMode = "light") => {
  const paletteBackground = backgroundByMode[mode] ?? backgroundByMode.light;

  return createTheme({
    palette: {
      mode,
      background: paletteBackground,
    },
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily: "Roboto, Helvetica, Arial, sans-serif",
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: paletteBackground.default,
            transition: "background-color 240ms ease, color 240ms ease",
          },
          "*": {
            transition: "background-color 240ms ease, color 240ms ease",
          },
        },
      },
    },
  });
};

export default createAppTheme();
