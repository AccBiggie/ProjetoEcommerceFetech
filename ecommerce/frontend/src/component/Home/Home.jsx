import { useEffect } from "react";
import { Link } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import ArrowForward from "@mui/icons-material/ArrowForward";
import { getProduct } from "../../actions/productAction";
import ProductCard from "./ProductCard";
import MetaData from "../layout/MetaData";
import hero from "../../images/wallpaperLoja2.png";
import categories from "../../data/categories.json";

export const productGrid = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, 1fr)",
    md: "repeat(3, 1fr)",
    lg: "repeat(4, 1fr)",
  },
  gap: 3,
};
export function ProductSkeletons() {
  return (
    <Box sx={productGrid}>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={390} />
      ))}
    </Box>
  );
}

export default function Home() {
  const dispatch = useDispatch();
  const { loading, error, products } = useSelector((state) => state.products);
  useEffect(() => {
    dispatch(getProduct());
  }, [dispatch]);
  return (
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 4 } }}>
      <MetaData title="Loja Fetech | Entre já para o mundo gamer" />
      <Box
        sx={{
          bgcolor: "#182230",
          color: "white",
          borderRadius: 4,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.1fr 1fr" },
          mb: 4,
        }}
      >
        <Box sx={{ p: { xs: 3, md: 5 }, alignSelf: "center" }}>
          <Chip
            label="HARDWARE & TECNOLOGIA"
            size="small"
            sx={{
              mb: 2,
              color: "#f9bacb",
              bgcolor: "#ffffff12",
              fontWeight: 700,
            }}
          />
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: 34, md: 46 },
              lineHeight: 1.12,
              fontWeight: 750,
              letterSpacing: "-.04em",
              maxWidth: 480,
            }}
          >
            Seu próximo setup começa aqui.
          </Typography>
          <Typography sx={{ mt: 2, mb: 3, color: "#ccd4df", maxWidth: 420 }}>
            Do primeiro upgrade à sua próxima conquista. Explore hardware,
            periféricos e muito mais.
          </Typography>
          <Button
            component={Link}
            to="/products"
            variant="contained"
            size="large"
            endIcon={<ArrowForward />}
          >
            Explorar produtos
          </Button>
        </Box>
        <Box
          component="img"
          src={hero}
          alt="Hardware e equipamentos Fetech"
          sx={{
            width: "100%",
            height: { xs: 200, md: "100%" },
            maxHeight: 380,
            objectFit: "cover",
          }}
        />
      </Box>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ flexWrap: "wrap", mb: 5 }}
      >
        {categories.slice(2, 8).map((category) => (
          <Chip
            key={category}
            label={category}
            component={Link}
            clickable
            to={"/products?category=" + encodeURIComponent(category)}
            variant="outlined"
          />
        ))}
      </Stack>
      <Stack
        direction="row"
        sx={{ mb: 3, justifyContent: "space-between", alignItems: "center" }}
      >
        <Box>
          <Typography variant="h2">Destaques para o seu setup</Typography>
          <Typography color="textSecondary" sx={{ mt: 0.5 }}>
            Encontre seu próximo upgrade.
          </Typography>
        </Box>
        <Button
          component={Link}
          to="/products"
          endIcon={<ArrowForward />}
          sx={{ display: { xs: "none", sm: "flex" } }}
        >
          Ver todos
        </Button>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {loading ? (
        <ProductSkeletons />
      ) : (
        <Box sx={productGrid}>
          {products?.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </Box>
      )}
    </Container>
  );
}
