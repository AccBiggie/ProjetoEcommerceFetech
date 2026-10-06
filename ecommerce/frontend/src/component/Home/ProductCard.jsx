import { useState } from "react";
import { Link } from "react-router";
import { useDispatch } from "react-redux";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  Chip,
  Rating,
  Stack,
  Typography,
} from "@mui/material";
import AddShoppingCart from "@mui/icons-material/AddShoppingCart";
import { addItemsToCart } from "../../actions/cartAction";
import { useAlert } from "../../utils/alerts";
import { getErrorMessage } from "../../utils/api";
import { money } from "../../utils/format";

export default function ProductCard({ product }) {
  const dispatch = useDispatch();
  const alert = useAlert();
  const [adding, setAdding] = useState(false);
  const add = async () => {
    setAdding(true);
    try {
      await dispatch(addItemsToCart(product._id, 1));
      alert.success("Produto adicionado ao carrinho.");
    } catch (error) {
      alert.error(getErrorMessage(error));
    } finally {
      setAdding(false);
    }
  };
  return (
    <Card
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 180ms, border-color 180ms",
        "&:hover": {
          boxShadow: "0 8px 24px rgba(24,34,48,.08)",
          borderColor: "primary.light",
        },
      }}
    >
      <CardActionArea
        component={Link}
        className="productCard"
        to={"/product/" + product._id}
        sx={{ flex: 1 }}
      >
        <Box
          sx={{
            position: "relative",
            bgcolor: "#f8fafc",
            p: 3,
            height: 200,
            display: "grid",
            placeItems: "center",
          }}
        >
          {!!product.off && (
            <Chip
              size="small"
              label={product.off + "% OFF"}
              color="primary"
              sx={{ position: "absolute", top: 12, left: 12 }}
            />
          )}
          <Box
            component="img"
            src={product.images?.[0]?.url || "/Profile.png"}
            alt={product.name}
            loading="lazy"
            sx={{ maxHeight: 150, objectFit: "contain" }}
          />
        </Box>
        <CardContent>
          <Typography variant="caption" color="textSecondary">
            {product.category}
          </Typography>
          <Typography
            className="productName"
            sx={{
              mt: 0.5,
              minHeight: 48,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              fontWeight: 650,
            }}
          >
            {product.name}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ my: 1, alignItems: "center" }}
          >
            <Rating
              readOnly
              size="small"
              precision={0.5}
              value={Number(product.ratings) || 0}
            />
            <Typography variant="caption" color="textSecondary">
              ({product.numOfReviews})
            </Typography>
          </Stack>
          <Typography
            variant="body2"
            color="textSecondary"
            sx={{ textDecoration: "line-through", minHeight: 20 }}
          >
            {Number(product.oldPrice) > Number(product.price)
              ? money(product.oldPrice)
              : " "}
          </Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 750 }}>
            {money(product.price)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            à vista · 12x de {money(product.installmmentPrice)}
          </Typography>
        </CardContent>
      </CardActionArea>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button
          className="buttomCard"
          fullWidth
          variant="contained"
          startIcon={<AddShoppingCart />}
          disabled={adding || product.Stock < 1}
          onClick={add}
        >
          {product.Stock < 1
            ? "Sem estoque"
            : adding
              ? "Adicionando..."
              : "Adicionar ao Carrinho"}
        </Button>
      </CardActions>
    </Card>
  );
}
