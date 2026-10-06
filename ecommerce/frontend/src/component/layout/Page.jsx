import { Link } from "react-router";
import {
  Alert,
  Box,
  Button,
  Container,
  Stack,
  Typography,
} from "@mui/material";
import MetaData from "./MetaData";

export default function Page({
  title,
  subtitle,
  actions,
  children,
  maxWidth = "lg",
}) {
  return (
    <Container
      component="main"
      maxWidth={maxWidth}
      className="contentPage"
      sx={{ py: { xs: 3, md: 5 } }}
    >
      <MetaData title={title + " | Fetech"} />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{
          mb: 3,
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
        }}
      >
        <Box>
          <Typography variant="h1" sx={{ fontSize: { xs: 26, md: 32 } }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography color="textSecondary" sx={{ mt: 1 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions}
      </Stack>
      {children}
    </Container>
  );
}
export function NotFound({
  message = "A página que você procura não existe.",
}) {
  return (
    <Page title="Página não encontrada">
      <Alert severity="info" sx={{ mb: 3 }}>
        {message}
      </Alert>
      <Button component={Link} to="/products" variant="contained">
        Ver produtos
      </Button>
    </Page>
  );
}
