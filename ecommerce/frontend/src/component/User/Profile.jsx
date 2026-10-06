import { useSelector } from "react-redux";
import { Link } from "react-router";
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import Page from "../layout/Page";
import Loader from "../layout/Loader/Loader";

export default function Profile() {
  const { user, loading } = useSelector((state) => state.user);
  if (loading || !user) return <Loader />;
  return (
    <Page
      title="Meu perfil"
      subtitle="Gerencie suas informações e acompanhe suas compras."
    >
      <Card sx={{ p: { xs: 3, md: 4 }, maxWidth: 780 }}>
        <Stack sx={{ alignItems: "center" }} direction="row" spacing={2.5}>
          <Avatar
            src={user.avatar?.url}
            alt={user.name}
            sx={{ width: 80, height: 80 }}
          />
          <Box>
            <Typography variant="h2">{user.name}</Typography>
            <Chip
              size="small"
              variant="outlined"
              label={user.role === "admin" ? "Administrador" : "Cliente"}
              sx={{ mt: 1 }}
            />
          </Box>
        </Stack>
        <Divider sx={{ my: 3 }} />
        <Stack spacing={2}>
          <Box>
            <Typography variant="body2" color="textSecondary">
              E-mail
            </Typography>
            <Typography sx={{ overflowWrap: "anywhere" }}>
              {user.email}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="textSecondary">
              Cliente desde
            </Typography>
            <Typography>
              {new Date(user.createdAt).toLocaleDateString("pt-BR")}
            </Typography>
          </Box>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ mt: 4 }}
        >
          <Button component={Link} to="/me/update" variant="contained">
            Editar perfil
          </Button>
          <Button component={Link} to="/password/update" variant="outlined">
            Alterar senha
          </Button>
          <Button component={Link} to="/orders">
            Meus pedidos
          </Button>
        </Stack>
      </Card>
    </Page>
  );
}
