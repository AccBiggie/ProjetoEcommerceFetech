import {
    ADD_TO_CART,
    REMOVE_CART_ITEM,
    SAVE_SHIPPING_INFO,
} from "../constants/cartConstants";
import axios from "axios";
import { writeStoredValue } from '../storage/safeStorage.mjs';
import { storageRegistry } from '../storage/storageRegistry.mjs';

// Add to Cart
export const addItemsToCart = (id, quantity) => async (dispatch, getState) => {
    const { data } = await axios.get(`/api/v1/product/${id}`);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > data.product.Stock) {
        throw new Error("Quantidade indisponível em estoque.");
    }

    dispatch({
        type: ADD_TO_CART,
        payload: {
            product: data.product._id,
            name: data.product.name,
            priceCents: data.product.priceCents,
            price: data.product.price,
            image: data.product.images[0]?.url || "/Profile.png",
            stock: data.product.Stock,
            quantity,
        },
    });

    writeStoredValue(storageRegistry.cart, getState().cart.cartItems);
};

// REMOVE FROM CART
export const removeItemsFromCart = (id) => async (dispatch, getState) => {
    dispatch({
        type: REMOVE_CART_ITEM,
        payload: id,
    });

    writeStoredValue(storageRegistry.cart, getState().cart.cartItems);
};

// SAVE SHIPPING INFO
export const saveShippingInfo = (data) => async (dispatch) => {
    dispatch({
        type: SAVE_SHIPPING_INFO,
        payload: data,
    });

    writeStoredValue(storageRegistry.shipping, data);
};
