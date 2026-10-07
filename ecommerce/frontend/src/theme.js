import { createTheme } from "@mui/material/styles";
import { ptBR } from "@mui/material/locale";

export default function createAppTheme(mode = "light") {
  const dark = mode === "dark";
  const options = {
    palette: {
      mode,
      primary: dark
        ? { main: "#f06b91", dark: "#d6416c", contrastText: "#1a1015" }
        : { main: "#a3123c", dark: "#790b2a" },
      secondary: { main: dark ? "#53c3cd" : "#087f8c" },
      background: { default: dark ? "#101722" : "#f5f7fa", paper: dark ? "#182230" : "#ffffff" },
      text: { primary: dark ? "#eef2f6" : "#182230", secondary: dark ? "#acb8c8" : "#667085" },
      divider: dark ? "#334155" : "#e6eaf0",
      success: { main: dark ? "#75d6a5" : "#16794b" },
      error: { main: dark ? "#ff958a" : "#b42318" },
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Roboto, Arial, sans-serif',
      h1: { fontSize: "2rem", fontWeight: 750, letterSpacing: "-0.04em" },
      h2: { fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.025em" },
      h3: { fontSize: "1.15rem", fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 650 },
    },
    shape: { borderRadius: 12 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { minHeight: 42 } },
      },
      MuiCard: { defaultProps: { variant: "outlined" } },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: "none" },
          outlined: ({ theme }) => ({ borderColor: theme.palette.divider }),
        },
      },
      MuiTextField: { defaultProps: { fullWidth: true, variant: "outlined" } },
      MuiTableCell: {
        styleOverrides: {
          head: { backgroundColor: dark ? "#202b3d" : "#f8fafc", fontWeight: 700 },
          root: ({ theme }) => ({ borderColor: theme.palette.divider }),
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: "none", fontWeight: 650 } },
      },
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            WebkitFontSmoothing: "antialiased",
            "--fetech-focus": dark ? "#53c3cd" : "#087f8c",
            "--fetech-success": dark ? "#75d6a5" : "#16794b",
            "--fetech-error": dark ? "#ff958a" : "#b42318",
          },
          a: { color: "inherit" },
          'img.fetech-logo, img[src$="/ProjetoLogoFetech2.svg"]': {
            filter: dark ? "invert(1)" : "none",
          },
        },
      },
    },
  };

  return createTheme({
    ...options,
    components: { ...ptBR.components, ...options.components },
  });
}
