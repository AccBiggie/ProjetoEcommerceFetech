import { Link } from "react-router";
import {
  Box,
  Container,
  Divider,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import Logo from "../../../images/ProjetoLogoFetech2.svg";

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        bgcolor: "background.paper",
        borderTop: 1,
        borderColor: "divider",
        mt: 5,
      }}
    >
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "2fr 1fr 1fr" },
            gap: 4,
          }}
        >
          <Box>
            <Box component="img" src={Logo} alt="Fetech" width={140} />
            <Typography
              variant="body2"
              color="textSecondary"
              sx={{ mt: 2, maxWidth: 360 }}
            >
              Unindo hardware e tecnologia. Encontre os componentes para o seu
              setup.
            </Typography>
          </Box>
          <Stack spacing={1}>
            <Typography sx={{ fontWeight: 700 }}>Explore</Typography>
            <MuiLink component={Link} to="/products" underline="hover">
              Todos os produtos
            </MuiLink>
            <MuiLink component={Link} to="/account" underline="hover">
              Minha conta
            </MuiLink>
            <MuiLink component={Link} to="/orders" underline="hover">
              Meus pedidos
            </MuiLink>
          </Stack>
          <Stack spacing={1}>
            <Typography sx={{ fontWeight: 700 }}>Fetech Informática</Typography>
            <Typography variant="body2" color="textSecondary">
              Maringá, Paraná
            </Typography>
            <MuiLink
              href="https://www.instagram.com/fetech.informatica/"
              target="_blank"
              rel="noreferrer"
              underline="hover"
            >
              Instagram
            </MuiLink>
            <MuiLink
              href="https://www.youtube.com/channel/UCkCI3DxLklu2IJxjN7PixwA"
              target="_blank"
              rel="noreferrer"
              underline="hover"
            >
              YouTube
            </MuiLink>
          </Stack>
        </Box>
        <Divider sx={{ my: 3 }} />
        <Typography variant="caption" color="textSecondary">
          © {new Date().getFullYear()} Fetech Informática. Todos os direitos
          reservados.
        </Typography>
      </Container>
    </Box>
  );
}
