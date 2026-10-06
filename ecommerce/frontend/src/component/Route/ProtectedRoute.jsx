import { useSelector } from "react-redux";
import { Outlet, Navigate, useLocation } from "react-router";
import Loader from "../layout/Loader/Loader";

const ProtectedRoute = ({ admin = false }) => {
  const { loading, isAuthenticated, user } = useSelector((state) => state.user);

  const location = useLocation();
  if (loading) return <Loader />;
  if (!isAuthenticated || !user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo: location.pathname + location.search }}
      />
    );
  if (admin && user.role !== "admin") return <Navigate to="/account" replace />;
  return <Outlet />;
};

export default ProtectedRoute;
