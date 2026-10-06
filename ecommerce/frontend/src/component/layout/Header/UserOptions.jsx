import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDispatch } from "react-redux";
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import PersonOutline from "@mui/icons-material/PersonOutlined";
import ReceiptLongOutlined from "@mui/icons-material/ReceiptLongOutlined";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import Logout from "@mui/icons-material/Logout";
import { logout } from "../../../actions/userAction";
import { useAlert } from "../../../utils/alerts";

export default function UserOptions({ user }) {
  const [anchor, setAnchor] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const alert = useAlert();
  const close = () => setAnchor(null);
  const signOut = async () => {
    close();
    if (await dispatch(logout())) {
      navigate("/");
      alert.success("Você saiu da conta.");
    } else alert.error("Não foi possível sair. Tente novamente.");
  };
  return (
    <>
      <IconButton
        aria-label="Minha conta"
        aria-haspopup="true"
        aria-expanded={Boolean(anchor)}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Avatar
          src={user.avatar?.url}
          alt={user.name}
          sx={{ width: 36, height: 36 }}
        >
          {user.name?.[0]}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        slotProps={{ paper: { sx: { minWidth: 240 } } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>{user.name}</Typography>
          <Typography variant="caption" color="textSecondary">
            {user.email}
          </Typography>
        </Box>
        <Divider />
        {user.role === "admin" && (
          <MenuItem component={Link} to="/dashboard" onClick={close}>
            <ListItemIcon>
              <DashboardOutlined sx={{ fontSize: "small" }} />
            </ListItemIcon>
            Painel administrativo
          </MenuItem>
        )}
        <MenuItem component={Link} to="/account" onClick={close}>
          <ListItemIcon>
            <PersonOutline sx={{ fontSize: "small" }} />
          </ListItemIcon>
          Meu perfil
        </MenuItem>
        <MenuItem component={Link} to="/orders" onClick={close}>
          <ListItemIcon>
            <ReceiptLongOutlined sx={{ fontSize: "small" }} />
          </ListItemIcon>
          Meus pedidos
        </MenuItem>
        <Divider />
        <MenuItem onClick={signOut}>
          <ListItemIcon>
            <Logout sx={{ fontSize: "small" }} />
          </ListItemIcon>
          Sair
        </MenuItem>
      </Menu>
    </>
  );
}
