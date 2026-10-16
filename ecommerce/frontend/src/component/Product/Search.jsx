import { useState } from "react";
import { useNavigate } from "react-router";
import { Box, IconButton, InputAdornment, OutlinedInput } from '@mui/material';
import SearchOutlined from "@mui/icons-material/SearchOutlined";

export default function Search({ label = "Busca no cabeçalho" }) {
  const [keyword, setKeyword] = useState("");
  const navigate = useNavigate();
  return (
    <Box
      component="form"
      className="searchBox"
      role="search"
      aria-label={label}
      onSubmit={(event) => {
        event.preventDefault();
        navigate(
          keyword.trim()
            ? "/products?keyword=" + encodeURIComponent(keyword.trim())
            : "/products",
        );
      }}
    >
      <OutlinedInput
        fullWidth
        size="small"
        placeholder="Pesquisar Produtos..."
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        inputProps={{ "aria-label": "Pesquisar produtos" }}
        sx={{ bgcolor: "background.default" }}
        endAdornment={
              <InputAdornment position="end">
                <IconButton type="submit" aria-label="Pesquisar">
                  <SearchOutlined />
                </IconButton>
              </InputAdornment>
        }
      />
    </Box>
  );
}
