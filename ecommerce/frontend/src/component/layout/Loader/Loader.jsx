import { Box, CircularProgress, Typography } from "@mui/material";
export default function Loader({ pageHeading = false }) {
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
      <Typography component={pageHeading ? 'h1' : 'p'} data-loading-heading={pageHeading ? '' : undefined} color="textSecondary">Carregando...</Typography>
    </Box>
  );
}
