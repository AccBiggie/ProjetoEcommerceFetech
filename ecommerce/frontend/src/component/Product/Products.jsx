import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, useSearchParams } from "react-router";
import { Alert, Box, Chip, Pagination, Stack, Typography } from '@mui/material';
import TextField from '../layout/AccessibleTextField';
import { getProduct } from "../../actions/productAction";
import { useCategories } from "../../context/CategoriesContext";
import ProductCard from "../Home/ProductCard";
import { productGrid, ProductSkeletons } from "../Home/Home";
import Page from "../layout/Page";

export default function Products() {
  const { ordered: categories, error: categoryError } = useCategories();
  const dispatch = useDispatch();
  const { keyword: legacyKeyword } = useParams();
  const [params, setParams] = useSearchParams();
  const keyword = legacyKeyword || params.get("keyword") || "";
  const category = params.get("category") || "";
  const currentPage = Math.max(1, Number(params.get("page")) || 1);
  const {
    products,
    loading,
    error,
    filteredProductsCount: count,
    resultPerPage,
  } = useSelector((state) => state.products);
  useEffect(() => {
    dispatch(getProduct(keyword, currentPage, category));
  }, [dispatch, keyword, currentPage, category]);
  return (
    <Page
      title={categories.find(item => item._id === category)?.name || category || "Todos os produtos"}
      subtitle="Escolha o que combina com o seu setup."
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ mb: 3, alignItems: { sm: "center" } }}
      >
        <TextField
          select
          label="Categoria"
          value={categories.find(item => item._id === category)?.name || category}
          size="small"
          sx={{ maxWidth: { sm: 280 } }}
          slotProps={{
            inputLabel: { shrink: true },
            select: { native: true },
            htmlInput: { "aria-label": "Categoria" },
          }}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set("category", event.target.value);
            else next.delete("category");
            next.delete("page");
            setParams(next);
          }}
        >
          <option value="">Todas as categorias</option>
          {category && !categories.some(item => item.name === category || item._id === category) && <option value={category}>{category}</option>}
          {categories.map((item) => (
            <option key={item._id} value={item.name}>{item.label}</option>
          ))}
        </TextField>
        {keyword && (
          <Chip
            label={"Busca: " + keyword}
            onDelete={() => {
              const next = new URLSearchParams(params);
              next.delete("keyword");
              next.delete("page");
              setParams(next);
            }}
          />
        )}
        <Typography
          role="status"
          variant="body2"
          color="textSecondary"
          sx={{ ml: { sm: "auto !important" } }}
        >
          {loading
            ? "Buscando produtos..."
            : (count || 0) + " produtos encontrados"}
        </Typography>
      </Stack>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {categoryError && <Alert severity="warning" sx={{ mb: 3 }}>{categoryError}</Alert>}
      {!loading && !error && !products?.length && (
        <Alert severity="info">Nenhum produto encontrado.</Alert>
      )}
      {loading ? (
        <ProductSkeletons />
      ) : (
        <Box className="products" sx={productGrid}>
          {products?.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </Box>
      )}
      {resultPerPage < count && (
        <Stack className="paginationBox" sx={{ mt: 5, alignItems: "center" }}>
          <Pagination
            aria-label="Paginação de produtos"
            color="primary"
            count={Math.ceil(count / resultPerPage)}
            page={currentPage}
            onChange={(_, page) => {
              const next = new URLSearchParams(params);
              next.set("page", page);
              setParams(next);
            }}
          />
        </Stack>
      )}
    </Page>
  );
}
