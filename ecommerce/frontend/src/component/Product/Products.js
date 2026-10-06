import React, { Fragment, useEffect } from 'react';
import "./Products.css";
import { useSelector, useDispatch } from 'react-redux';
import { getProduct } from '../../actions/productAction';
import Loader from '../layout/Loader/Loader';
import ProductCard from '../Home/ProductCard';
import { useParams, useSearchParams } from 'react-router-dom';
import categories from '../../data/categories.json';
import Header from '../layout/Header/Header';
import Pagination from "react-js-pagination";
import MetaData from "../layout/MetaData.js"

const Products = ({ match }) => {

    const dispatch = useDispatch();
    const { keyword: legacyKeyword } = useParams();
    const [params, setParams] = useSearchParams();
    const keyword = legacyKeyword || params.get("keyword") || "";
    const category = params.get("category") || "";
    const currentPage = Math.max(1, Number(params.get("page")) || 1);

    const setCurrentPageNo = (e) => {
        const next = new URLSearchParams(params);
        next.set("page", String(e));
        setParams(next);
    }

    const { products, loading, error, filteredProductsCount: productsCount, resultPerPage } = useSelector((state) => state.products);
    useEffect(() => {
        dispatch(getProduct(keyword, currentPage, category));
    }, [dispatch, keyword, currentPage, category]);


    return (
        <Fragment>
            {loading ? (
                <Loader />
            ) : (
                <Fragment>
                    <MetaData title="Produtos -- Ecommerce"/>
                    <Header />
                    <h2 className="productsHeading">Produtos</h2>
                    <label>Categoria <select aria-label="Categoria" value={category} onChange={e => {
                        const next = new URLSearchParams(params);
                        if (e.target.value) next.set("category", e.target.value); else next.delete("category");
                        next.delete("page"); setParams(next);
                    }}><option value="">Todas as categorias</option>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
                    {error && <p role="alert">{error}</p>}
                    {!error && products?.length === 0 && <p>Nenhum produto encontrado.</p>}

                    <div className="products">
                        {products &&
                            products.map((product) => (
                                <ProductCard key={product._id} product={product} />
                            ))}
                    </div>

                    {resultPerPage < productsCount && (
                        <div className="paginationBox">
                            <Pagination
                                activePage={currentPage}
                                itemsCountPerPage={resultPerPage}
                                totalItemsCount={productsCount}
                                onChange={setCurrentPageNo}
                                nextPageText="Proximo"
                                prevPageText="Anterior"
                                firstPageText="1st"
                                lastPageText="Ultimo"
                                itemClass="page-item"
                                linkClass="page-link"
                                activeClass="pageItemActive"
                                activeLinkClass="pageLinkActive"
                            />
                        </div>
                    )}
                </Fragment>
            )}
        </Fragment>
    );
};

export default Products
