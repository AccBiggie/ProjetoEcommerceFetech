import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CssBaseline, ThemeProvider, useMediaQuery } from "@mui/material";
import { Toaster } from "react-hot-toast";
import createAppTheme from "../theme";
import { readStoredValue, writeStoredValue } from '../storage/safeStorage.mjs';
import { storageRegistry } from '../storage/storageRegistry.mjs';

const ColorModeContext = createContext(null);
const themeSpec = storageRegistry.theme;

function savedMode() {
  return readStoredValue(themeSpec).value;
}

export function ColorModeProvider({ children }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [preference, setPreference] = useState(savedMode);
  const mode = preference || (prefersDark ? "dark" : "light");
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const toggleMode = () => {
    const next = mode === "light" ? "dark" : "light";
    setPreference(next);
    writeStoredValue(themeSpec, next);
  };

  useEffect(() => {
    const syncPreference = event => {
      if (event.key === themeSpec.key || event.key === null) setPreference(savedMode());
    };
    window.addEventListener("storage", syncPreference);
    return () => window.removeEventListener("storage", syncPreference);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.colorMode = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.palette.background.default);
  }, [mode, theme]);

  return (
    <ColorModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
        <Toaster position="bottom-center" toastOptions={{
          duration: 5000,
          style: {
            background: theme.palette.background.paper,
            color: theme.palette.text.primary,
            border: `1px solid ${theme.palette.divider}`,
          },
        }} />
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export const useColorMode = () => useContext(ColorModeContext);
