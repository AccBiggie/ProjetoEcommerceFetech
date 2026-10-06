import { createTheme } from "@mui/material/styles";
import { ptBR } from "@mui/material/locale";

const options = {
  palette: {
    primary: { main: "#a3123c", dark: "#790b2a" },
    secondary: { main: "#087f8c" },
    background: { default: "#f5f7fa", paper: "#ffffff" },
    text: { primary: "#182230", secondary: "#667085" },
    divider: "#e6eaf0",
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
    MuiPaper: { styleOverrides: { outlined: { borderColor: "#e6eaf0" } } },
    MuiTextField: { defaultProps: { fullWidth: true, variant: "outlined" } },
    MuiTableCell: {
      styleOverrides: {
        head: { backgroundColor: "#f8fafc", fontWeight: 700 },
        root: { borderColor: "#e6eaf0" },
      },
    },
    MuiTab: {
      styleOverrides: { root: { textTransform: "none", fontWeight: 650 } },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: { WebkitFontSmoothing: "antialiased" },
        a: { color: "inherit" },
      },
    },
  },
};

export default createTheme({
  ...options,
  components: { ...ptBR.components, ...options.components },
});
