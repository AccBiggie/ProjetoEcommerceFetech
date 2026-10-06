import React from "react";
import { Routes, Route, Navigate } from "react-router";
import Home from "./component/Home/Home.jsx";
import ProductDetails from "./component/Product/ProductDetails.jsx";
import Products from "./component/Product/Products.jsx";
import  Search  from "./component/Product/Search.jsx";
import { LoginSignUp } from "./component/User/LoginSignUp.jsx";
import Profile from "./component/User/Profile.jsx";
import ProtectedRoute from "./component/Route/ProtectedRoute.jsx";
import UpdateProfile from "./component/User/UpdateProfile.jsx";
import UpdatePassword from "./component/User/UpdatePassword.jsx";
import ForgotPassword from "./component/User/ForgotPassword.jsx";
import ResetPassword from "./component/User/ResetPassword.jsx";
import Cart from "./component/Cart/Cart.jsx";
import Shipping from './component/Cart/Shipping';
import Orders from './component/Order/Orders';
import OrderDetails from './component/Order/OrderDetails';
import Dashboard from './component/Admin/Dashboard';
import Page, { NotFound } from './component/layout/Page';

export default function MainRoutes() {

    return (
        <Routes>
            <Route path="/" element={<Home/>} />
            <Route path="/sad" element={<Navigate to="/" replace />} />
            <Route path="/product/:id" element={<ProductDetails />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:keyword" element={<Products />} />
            <Route path="/search" element={<Page title="Pesquisar produtos"><Search /></Page>} />
            <Route element={<ProtectedRoute />}>
                <Route path="/account" element={<Profile />} />
                <Route path="/me/update" element={<UpdateProfile />} />
                <Route path="/password/update" element={<UpdatePassword />} />
                <Route path="/shipping" element={<Shipping />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/order/:id" element={<OrderDetails />} />
            </Route>
            <Route element={<ProtectedRoute admin />}><Route path="/dashboard" element={<Dashboard />} /></Route>
            <Route path="/password/forgot" element={<ForgotPassword />}/>
            <Route path="/password/reset/:token" element={<ResetPassword />}/>
            <Route path="/login" element={<LoginSignUp />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
}
