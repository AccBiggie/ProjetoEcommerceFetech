import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Link as MuiLink,
  Rating,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddShoppingCart from "@mui/icons-material/AddShoppingCart";
import QuantityControl from "../layout/QuantityControl";
import { money } from "../../utils/format";
import { useEffect, useState } from "react";
import Carousel from "./ProductCarousel";
import { useSelector, useDispatch } from "react-redux";
import { getProductDetails } from "../../actions/productAction";
import { useParams, Link } from "react-router";
import axios from "axios";
import Page from "../layout/Page";
import { getErrorMessage } from "../../utils/api";
import ReviewCard from "./ReviewCard";
import Loader from "../layout/Loader/Loader.jsx";
import { useAlert } from "../../utils/alerts.js";
import { addItemsToCart } from "../../actions/cartAction";

const ProductDetails = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const alert = useAlert();

  const { product, loading, error } = useSelector(
    (state) => state.productDetails,
  );
  const { user, isAuthenticated } = useSelector((state) => state.user);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [pending, setPending] = useState(false);

  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const increaseQuantity = () => {
    if (product.Stock <= quantity) {
      return;
    }
    const qty = quantity + 1;
    setQuantity(qty);
  };

  const decreaseQuantity = () => {
    if (quantity <= 1) return;
    const qty = quantity - 1;
    setQuantity(qty);
  };

  const addToCartHandler = async () => {
    setAdding(true);
    try {
      await dispatch(addItemsToCart(product._id, quantity));
      alert.success("Produto adicionado ao carrinho.");
    } catch (error) {
      alert.error(getErrorMessage(error));
    } finally {
      setAdding(false);
    }
  };
  const submitReview = async (event) => {
    event.preventDefault();
    setPending(true);
    setReviewError("");
    try {
      await axios.put("/api/v1/review", {
        productId: id,
        rating: Number(rating),
        comment,
      });
      setComment("");
      dispatch(getProductDetails(id));
      alert.success("Avaliação salva.");
    } catch (error) {
      setReviewError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const removeReview = async (reviewId) => {
    setPending(true);
    setReviewError("");
    try {
      await axios.delete("/api/v1/reviews", {
        params: { productId: id, id: reviewId },
      });
      dispatch(getProductDetails(id));
    } catch (error) {
      setReviewError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    setQuantity(1);
    setReviewError("");
    dispatch(getProductDetails(id));
  }, [dispatch, id]);

  if (error)
    return (
      <Page title="Produto indisponível">
        <p role="alert">{error}</p>
        <Link to="/products">Ver produtos</Link>
      </Page>
    );
  if (loading || !product?._id || product._id !== id) return <Loader />;

  return (
    <Page title={product.name} subtitle={product.category}>
      <Breadcrumbs sx={{ mb: 3 }}>
        <MuiLink component={Link} to="/products" underline="hover">
          Produtos
        </MuiLink>
        <Typography>{product.category}</Typography>
      </Breadcrumbs>
      <Card
        className="ProductDetails"
        sx={{
          p: { xs: 2.5, md: 4 },
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: { xs: 3, md: 5 },
        }}
      >
        <Box
          sx={{
            bgcolor: "background.default",
            borderRadius: 3,
            p: 2,
            minWidth: 0,
          }}
        >
          <Carousel>
            {product.images?.map((item, i) => (
              <Box
                component="img"
                key={item.url}
                src={item.url}
                alt={"Imagem " + (i + 1) + " de " + product.name}
                sx={{
                  width: "100%",
                  height: { xs: 250, md: 350 },
                  objectFit: "contain",
                }}
              />
            ))}
          </Carousel>
        </Box>
        <Stack sx={{ justifyContent: "center" }} spacing={2.5}>
          <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}>
            <Rating
              readOnly
              precision={0.5}
              value={Number(product.ratings) || 0}
            />
            <Typography variant="body2" color="textSecondary">
              {product.numOfReviews} avaliações
            </Typography>
          </Stack>
          <Box>
            <Typography
              color="textSecondary"
              sx={{ textDecoration: "line-through" }}
            >
              {Number(product.oldPrice) > Number(product.price)
                ? money(product.oldPrice)
                : ""}
            </Typography>
            <Typography sx={{ fontSize: 36, fontWeight: 750 }}>
              {money(product.price)}
            </Typography>
            <Typography color="textSecondary">
              à vista · 12x de {money(product.installmmentPrice)}
            </Typography>
          </Box>
          <Chip
            color={product.Stock > 0 ? "success" : "default"}
            variant="outlined"
            size="small"
            label={product.Stock > 0 ? "Em estoque" : "Sem estoque"}
            sx={{ alignSelf: "flex-start" }}
          />
          <QuantityControl
            value={quantity}
            stock={product.Stock}
            onDecrease={decreaseQuantity}
            onIncrease={increaseQuantity}
            disabled={adding}
          />
          <Button
            variant="contained"
            size="large"
            startIcon={<AddShoppingCart />}
            disabled={adding || product.Stock < quantity}
            onClick={addToCartHandler}
          >
            {adding ? "Adicionando..." : "Adicionar ao Carrinho"}
          </Button>
        </Stack>
      </Card>
      <Card sx={{ mt: 3, p: 3 }}>
        <Typography variant="h2" sx={{ mb: 2 }}>
          Sobre o produto
        </Typography>
        <Typography
          color="textSecondary"
          sx={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}
        >
          {product.description}
        </Typography>
      </Card>
      <Typography variant="h2" sx={{ mt: 5, mb: 3 }}>
        Avaliações de clientes
      </Typography>
      {reviewError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {reviewError}
        </Alert>
      )}
      {isAuthenticated ? (
        <Card component="form" onSubmit={submitReview} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h3" sx={{ mb: 2 }}>
            Compartilhe sua experiência
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Nota"
              select
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              slotProps={{ select: { native: true } }}
              sx={{ maxWidth: 200 }}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} estrelas
                </option>
              ))}
            </TextField>
            <TextField
              label="Comentário"
              multiline
              minRows={3}
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={pending}
              sx={{ alignSelf: "flex-start" }}
            >
              Enviar comentário
            </Button>
          </Stack>
        </Card>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>
          <MuiLink
            component={Link}
            to="/login"
            state={{ returnTo: "/product/" + id }}
          >
            Entre para avaliar este produto
          </MuiLink>
        </Alert>
      )}
      {product.reviews?.length ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" },
            gap: 2,
          }}
        >
          {product.reviews.map((review) => (
            <Box key={review._id}>
              <ReviewCard review={review} />
              {user && (user.role === "admin" || user._id === review.user) && (
                <Button
                  color="error"
                  disabled={pending}
                  onClick={() => removeReview(review._id)}
                >
                  Remover avaliação
                </Button>
              )}
            </Box>
          ))}
        </Box>
      ) : (
        <Typography color="textSecondary">
          Sem avaliações. Seja o primeiro a avaliar.
        </Typography>
      )}
    </Page>
  );
};
export default ProductDetails;
