import { useState } from "react";
import { Link, useLocation } from "react-router";
import { useSelector } from "react-redux";
import {
  AppBar,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import Logo from "../../../images/ProjetoLogoFetech2.svg";
import categories from "../../../data/categories.json";
import Search from "../../Product/Search";
import UserOptions from "./UserOptions";

export default function Header() {
  const [anchor, setAnchor] = useState(null);
  const { isAuthenticated, user } = useSelector((state) => state.user);
  const count = useSelector((state) =>
    state.cart.cartItems.reduce((sum, item) => sum + item.quantity, 0),
  );
  const location = useLocation();
  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ borderBottom: 1, borderColor: "divider" }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr auto", md: "180px 1fr auto" },
            gap: 2,
            alignItems: "center",
            py: 2,
          }}
        >
          <Box
            component={Link}
            to="/"
            aria-label="Fetech, página inicial"
            sx={{
              display: "flex",
              alignItems: "center",
              gridColumn: 1,
              gridRow: 1,
            }}
          >
            <Box component="img" src={Logo} alt="Fetech" sx={{ width: 150 }} />
          </Box>
          <Box
            sx={{
              gridColumn: { xs: "1 / -1", md: 2 },
              gridRow: { xs: 2, md: 1 },
            }}
          >
            <Search />
          </Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              gridColumn: { xs: 2, md: 3 },
              gridRow: 1,
              alignItems: "center",
            }}
          >
            <IconButton
              component={Link}
              to="/cart"
              aria-label="Carrinho"
              color="inherit"
            >
              <Badge badgeContent={count} color="primary">
                <ShoppingBagOutlined />
              </Badge>
            </IconButton>
            {isAuthenticated && user ? (
              <UserOptions user={user} />
            ) : (
              <Button
                component={Link}
                to="/login"
                variant="outlined"
                size="small"
              >
                Entrar
              </Button>
            )}
          </Stack>
        </Box>
        <Stack
          direction="row"
          spacing={{ xs: 1, sm: 3 }}
          sx={{ pb: 1, alignItems: "center" }}
        >
          <Button
            startIcon={<MenuIcon />}
            onClick={(event) => setAnchor(event.currentTarget)}
            aria-label="Compre por departamento"
            aria-expanded={Boolean(anchor)}
            aria-controls={anchor ? "department-menu" : undefined}
            aria-haspopup="true"
          >
            Compre por departamento
          </Button>
          <Button
            component={Link}
            to="/products"
            color="inherit"
            aria-current={
              location.pathname === "/products" ? "page" : undefined
            }
          >
            Produtos
          </Button>
          <Typography
            variant="caption"
            color="textSecondary"
            sx={{ ml: "auto !important", display: { xs: "none", md: "block" } }}
          >
            Hardware & tecnologia para o seu próximo nível
          </Typography>
        </Stack>
        <Menu
          id="department-menu"
          anchorEl={anchor}
          open={Boolean(anchor)}
          onClose={() => setAnchor(null)}
          slotProps={{
            paper: { sx: { minWidth: 260, maxHeight: "70vh" } },
            list: { "aria-label": "Departamentos" },
          }}
        >
          {categories.map((category) => (
            <MenuItem
              component={Link}
              role="link"
              key={category}
              to={"/products?category=" + encodeURIComponent(category)}
              onClick={() => setAnchor(null)}
            >
              {category}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem
            component={Link}
            role="link"
            to="/products"
            onClick={() => setAnchor(null)}
          >
            Todos os produtos
          </MenuItem>
        </Menu>
      </Container>
    </AppBar>
  );
}
