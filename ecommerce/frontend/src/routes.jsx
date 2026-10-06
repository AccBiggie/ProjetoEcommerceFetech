import React, { lazy, Suspense } from "react";
import Loader from "./component/layout/Loader/Loader";
import { Routes, Route, Navigate } from "react-router";
import Home from "./component/Home/Home.jsx";
const ProductDetails = lazy(
  () => import("./component/Product/ProductDetails.jsx"),
);
const Products = lazy(() => import("./component/Product/Products.jsx"));
import Search from "./component/Product/Search.jsx";
const LoginSignUp = lazy(() =>
  import("./component/User/LoginSignUp.jsx").then((module) => ({
    default: module.LoginSignUp,
  })),
);
const Profile = lazy(() => import("./component/User/Profile.jsx"));
import ProtectedRoute from "./component/Route/ProtectedRoute.jsx";
const UpdateProfile = lazy(() => import("./component/User/UpdateProfile.jsx"));
const UpdatePassword = lazy(
  () => import("./component/User/UpdatePassword.jsx"),
);
const ForgotPassword = lazy(
  () => import("./component/User/ForgotPassword.jsx"),
);
const ResetPassword = lazy(() => import("./component/User/ResetPassword.jsx"));
const Cart = lazy(() => import("./component/Cart/Cart.jsx"));
const Shipping = lazy(() => import("./component/Cart/Shipping"));
const Orders = lazy(() => import("./component/Order/Orders"));
const OrderDetails = lazy(() => import("./component/Order/OrderDetails"));
const Dashboard = lazy(() => import("./component/Admin/Dashboard"));
import Page, { NotFound } from "./component/layout/Page";

export default function MainRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sad" element={<Navigate to="/" replace />} />
        <Route path="/product/:id" element={<ProductDetails />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:keyword" element={<Products />} />
        <Route
          path="/search"
          element={
            <Page title="Pesquisar produtos">
              <Search />
            </Page>
          }
        />
        <Route element={<ProtectedRoute />}>
          <Route path="/account" element={<Profile />} />
          <Route path="/me/update" element={<UpdateProfile />} />
          <Route path="/password/update" element={<UpdatePassword />} />
          <Route path="/shipping" element={<Shipping />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/order/:id" element={<OrderDetails />} />
        </Route>
        <Route element={<ProtectedRoute admin />}>
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
        <Route path="/password/forgot" element={<ForgotPassword />} />
        <Route path="/password/reset/:token" element={<ResetPassword />} />
        <Route path="/login" element={<LoginSignUp />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
