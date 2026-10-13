import { Box, CircularProgress, Typography } from "@mui/material";
export default function Loader() {
  return (
    <Box
      role="status"
      sx={{
        minHeight: 260,
        display: "grid",
        placeContent: "center",
        justifyItems: "center",
        gap: 2,
      }}
    >
      <CircularProgress size={32} aria-hidden="true" />
      <Typography color="textSecondary">Carregando...</Typography>
    </Box>
  );
}
