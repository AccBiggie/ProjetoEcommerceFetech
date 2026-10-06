const express = require("express");
const { getAllProducts, getAdminProducts, createProduct, updateProduct, deleteProduct, getProductDetails, createProductReview, getProductReviews, deleteReview} = require("../controllers/productController");
const { isAuthenticatedUser, authorizeRoles } = require("../middleware/auth");
const router = express.Router();
router.param("id", require("../middleware/validateId"));
router.route("/admin/products").get(isAuthenticatedUser, authorizeRoles("admin"), getAdminProducts);
//Routes Product for Request API
router.route("/products").get(getAllProducts);
router.route("/product/new").post(isAuthenticatedUser, authorizeRoles("admin"), createProduct);
router.route("/product/:id").put(isAuthenticatedUser, authorizeRoles("admin"), updateProduct).delete(isAuthenticatedUser, authorizeRoles("admin"), deleteProduct);
router.route("/product/:id").get(getProductDetails);
router.route("/review").put(isAuthenticatedUser, createProductReview);
router.route("/reviews").get(getProductReviews).delete(isAuthenticatedUser, deleteReview);
module.exports = router;
