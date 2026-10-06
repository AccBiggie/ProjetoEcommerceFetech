import { useState } from "react";
import { useNavigate } from "react-router";
import { Box, IconButton, InputAdornment, TextField } from "@mui/material";
import SearchOutlined from "@mui/icons-material/SearchOutlined";

export default function Search() {
  const [keyword, setKeyword] = useState("");
  const navigate = useNavigate();
  return (
    <Box
      component="form"
      className="searchBox"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        navigate(
          keyword.trim()
            ? "/products?keyword=" + encodeURIComponent(keyword.trim())
            : "/products",
        );
      }}
    >
      <TextField
        size="small"
        placeholder="Pesquisar Produtos..."
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        slotProps={{
          htmlInput: { "aria-label": "Pesquisar produtos" },
          input: {
            sx: { bgcolor: "background.default" },
            endAdornment: (
              <InputAdornment position="end">
                <IconButton type="submit" aria-label="Pesquisar">
                  <SearchOutlined />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
    </Box>
  );
}
