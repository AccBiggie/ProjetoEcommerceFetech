const express = require("express");
const { newOrder, getSingleOrder, myOrders, getAllOrders, updateOrder, deleteOrder, archiveOrder, unarchiveOrder } = require("../controllers/orderController");
const { isAuthenticatedUser, authorizeRoles } = require("../middleware/auth");
const router = express.Router();
router.param("id", require("../middleware/validateId"));
//Routes of Order Api
router.route("/order/new").post(isAuthenticatedUser, newOrder);
router.route("/order/:id").get(isAuthenticatedUser, getSingleOrder);
router.route("/orders/me").get(isAuthenticatedUser, myOrders);
router
  .route("/admin/orders")
  .get(isAuthenticatedUser, authorizeRoles("admin"), getAllOrders);

router
  .route("/admin/order/:id")
  .put(isAuthenticatedUser, authorizeRoles("admin"), updateOrder)
  .delete(isAuthenticatedUser, authorizeRoles("admin"), deleteOrder);

router.patch('/admin/order/:id/archive', isAuthenticatedUser, authorizeRoles('admin'), archiveOrder);
router.patch('/admin/order/:id/unarchive', isAuthenticatedUser, authorizeRoles('admin'), unarchiveOrder);
module.exports = router;
