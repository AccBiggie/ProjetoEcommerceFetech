import { getErrorMessage } from "../utils/api";
import axios from "axios";
import {
    ALL_PRODUCT_FAIL,
    ALL_PRODUCT_REQUEST,
    ALL_PRODUCT_SUCCESS,
    PRODUCT_DETAILS_FAIL,
    PRODUCT_DETAILS_REQUEST,
    PRODUCT_DETAILS_SUCCESS,
    CLEAR_ERRORS,
}from "../constants/productConstants";

let productRequest = 0;
let productController;
export const getProduct = (keyword = "", currentPage = 1, category) => async (dispatch) => {
    const request = ++productRequest;
    productController?.abort();
    const controller = productController = new AbortController();
    try {
        dispatch({ type: ALL_PRODUCT_REQUEST });
        
        const params = new URLSearchParams({ keyword, page: String(currentPage) });
        if (category) params.set("category", category);
        const link = `/api/v1/products?${params}`;

        const { data } = await axios.get(link, { signal: controller.signal });
        if (request !== productRequest || controller.signal.aborted) return;

        dispatch({
            type: ALL_PRODUCT_SUCCESS,
            payload:data,
        });
    } catch (error) {
        if (request !== productRequest || axios.isCancel(error)) return;
        dispatch ({
            type: ALL_PRODUCT_FAIL,
            payload: getErrorMessage(error),
        });
    }
};

export const getProductDetails = (id) => async (dispatch) => {
    try {
        dispatch({ type: PRODUCT_DETAILS_REQUEST });
        
        const { data } = await axios.get(`/api/v1/product/${id}`);

        dispatch({
            type: PRODUCT_DETAILS_SUCCESS,
            payload: data.product,
        });
    } catch (error) {
        dispatch ({
            type: PRODUCT_DETAILS_FAIL,
            payload: getErrorMessage(error),
        });
    }
};
//Clearing Errors
export const clearErrors = () => async (dispatch) => {
    dispatch({ type: CLEAR_ERRORS});
};
