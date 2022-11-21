import React, { useState, Fragment } from 'react';
import { useNavigate } from "react-router-dom";
import "./Search.css";
import SearchIcon from '@mui/icons-material/Search';

const Search = () => {
    const [keyword, setKeyword] = useState("");
    const navigate = useNavigate();
    const searchSubmitHandler = (e) => {
        e.preventDefault();
        if (keyword.trim()) {
            navigate(`/products/${keyword}`);
        } else {
            navigate("/products");
        }
    };
  return (
    <Fragment>
        <form className="searchBox" onSubmit={searchSubmitHandler}>
            <input
                type="text"
                placeholder="Pesquisar Produtos..."
                title="Pesquisar Produtos"
                alt="Search OR Pesquisar Produtos"
                onChange={(e) => setKeyword(e.target.value)} 
            />
            <input type="submit" value="Pesquisar" />
        </form>
    </Fragment>
  )
}

export default Search;