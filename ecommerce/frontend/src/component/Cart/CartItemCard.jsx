import { Link } from "react-router";
import { Box, Button, Stack, Typography } from "@mui/material";
import { money } from "../../utils/format";

export default function CartItemCard({ item, deleteCartItems, disabled }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ flex: 1, minWidth: 0, alignItems: "center" }}
    >
      <Box
        component="img"
        src={item.image || "/Profile.png"}
        alt={item.name}
        sx={{
          width: 76,
          height: 76,
          objectFit: "contain",
          bgcolor: "background.default",
          borderRadius: 2,
          p: 1,
        }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component={Link}
          to={"/product/" + item.product}
          sx={{ textDecoration: "none", display: "block", fontWeight: 650 }}
        >
          {item.name}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {money(item.price)} / unidade
        </Typography>
        <Button
          color="error"
          size="small"
          disabled={disabled}
          onClick={() => deleteCartItems(item.product)}
          sx={{ px: 0, minWidth: 0 }}
        >
          Remover
        </Button>
      </Box>
    </Stack>
  );
}
