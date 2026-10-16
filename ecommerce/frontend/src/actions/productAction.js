import { getErrorMessage } from "../utils/api";
import axios from "axios";
import { latestRead } from '../utils/latestRead.mjs';
import {
    ALL_PRODUCT_FAIL,
    ALL_PRODUCT_REQUEST,
    ALL_PRODUCT_SUCCESS,
    PRODUCT_DETAILS_FAIL,
    PRODUCT_DETAILS_REQUEST,
    PRODUCT_DETAILS_SUCCESS,
    CLEAR_ERRORS,
}from "../constants/productConstants";

const listRead = latestRead();
const detailRead = latestRead();
export const getProduct = (keyword = "", currentPage = 1, category) => (dispatch) => {
    const params = new URLSearchParams({ keyword, page: String(currentPage) });
    if (category) params.set('category', category);
    const link = `/api/v1/products?${params}`;
    return listRead(link, dispatch, async (signal, isCurrent) => {
    if (!isCurrent()) return;
    try {
        dispatch({ type: ALL_PRODUCT_REQUEST });

        const { data } = await axios.get(link, { signal });
        if (!isCurrent()) return;

        dispatch({
            type: ALL_PRODUCT_SUCCESS,
            payload:data,
        });
    } catch (error) {
        if (!isCurrent() || axios.isCancel(error)) return;
        dispatch ({
            type: ALL_PRODUCT_FAIL,
            payload: getErrorMessage(error),
        });
    }
    });
};

export const getProductDetails = (id) => (dispatch) => detailRead(id, dispatch, async (signal, isCurrent) => {
    if (!isCurrent()) return;
    try {
        dispatch({ type: PRODUCT_DETAILS_REQUEST });

        const { data } = await axios.get(`/api/v1/product/${id}`, { signal });
        if (!isCurrent()) return;

        dispatch({
            type: PRODUCT_DETAILS_SUCCESS,
            payload: data.product,
        });
    } catch (error) {
        if (!isCurrent() || axios.isCancel(error)) return;
        dispatch ({
            type: PRODUCT_DETAILS_FAIL,
            payload: getErrorMessage(error),
        });
    }
});
//Clearing Errors
export const clearErrors = () => async (dispatch) => {
    dispatch({ type: CLEAR_ERRORS});
};
