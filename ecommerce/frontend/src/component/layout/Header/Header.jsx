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
  Tooltip,
  Typography,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ShoppingBagOutlined from "@mui/icons-material/ShoppingBagOutlined";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import Logo from "../../../images/ProjetoLogoFetech2.svg";
import { useCategories } from "../../../context/CategoriesContext";
import { useColorMode } from "../../../context/ColorModeContext";
import Search from "../../Product/Search";
import UserOptions from "./UserOptions";

export default function Header() {
  const { mode, toggleMode } = useColorMode();
  const themeLabel = mode === "dark" ? "Ativar modo claro" : "Ativar modo escuro";
  const { ordered: categories, loading, error } = useCategories();
  const [anchor, setAnchor] = useState(null);
  const { isAuthenticated, user } = useSelector((state) => state.user);
  const count = useSelector((state) =>
    state.cart.cartItems.reduce((sum, item) => sum + item.quantity, 0),
  );
  const location = useLocation();
  return (
    <AppBar
      component="header"
      position="sticky"
      color="inherit"
      elevation={0}
      sx={{ bgcolor: "background.paper", color: "text.primary", borderBottom: 1, borderColor: "divider" }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "minmax(0, 1fr) auto", md: "180px 1fr auto" },
            gap: { xs: 1, sm: 2 },
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
            <Box
              component="img"
              className="fetech-logo"
              src={Logo}
              alt="Fetech"
              sx={{ width: { xs: 110, sm: 150 } }}
            />
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
            spacing={{ xs: 0.25, sm: 1 }}
            sx={{
              gridColumn: { xs: 2, md: 3 },
              gridRow: 1,
              alignItems: "center",
            }}
          >
            <Tooltip title={themeLabel} slotProps={{ popper: { container: () => document.querySelector('header') } }}>
              <IconButton aria-label={themeLabel} onClick={toggleMode} color="inherit">
                {mode === "dark" ? <LightModeOutlined /> : <DarkModeOutlined />}
              </IconButton>
            </Tooltip>
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
          component="nav"
          aria-label="Navegação principal"
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
            paper: { component: 'nav', 'aria-label': 'Departamentos', sx: { minWidth: 260, maxHeight: "70vh" } },
            list: { "aria-label": "Departamentos" },
          }}
        >
          {categories.map((category) => (
            <MenuItem
              component={Link}
              key={category._id}
              to={"/products?category=" + encodeURIComponent(category.name)}
              onClick={() => setAnchor(null)}
              sx={{ pl: 2 + Math.min(category.depth, 4) * 2 }}
            >
              {category.name}
            </MenuItem>
          ))}
          {loading && <MenuItem disabled>Carregando categorias...</MenuItem>}
          {error && <MenuItem disabled>Categorias indisponíveis</MenuItem>}
          <Divider />
          <MenuItem
            component={Link}
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
