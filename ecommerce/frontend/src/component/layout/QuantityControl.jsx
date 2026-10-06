import { Box, IconButton } from "@mui/material";
import Add from "@mui/icons-material/Add";
import Remove from "@mui/icons-material/Remove";

export default function QuantityControl({
  value,
  onDecrease,
  onIncrease,
  stock,
  disabled = false,
}) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        bgcolor: "background.paper",
      }}
    >
      <IconButton
        aria-label="Diminuir quantidade"
        disabled={disabled || value <= 1}
        onClick={onDecrease}
      >
        <Remove sx={{ fontSize: "small" }} />
      </IconButton>
      <Box
        component="input"
        type="number"
        readOnly
        aria-label="Quantidade"
        value={value}
        sx={{
          width: 42,
          border: 0,
          bgcolor: "transparent",
          textAlign: "center",
          font: "inherit",
          appearance: "textfield",
          "&::-webkit-inner-spin-button": { appearance: "none" },
        }}
      />
      <IconButton
        aria-label="Aumentar quantidade"
        disabled={disabled || value >= stock}
        onClick={onIncrease}
      >
        <Add sx={{ fontSize: "small" }} />
      </IconButton>
    </Box>
  );
}
