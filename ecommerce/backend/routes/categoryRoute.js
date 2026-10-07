const router = require("express").Router();
const { getCategories, getCategory, createCategory, updateCategory, deleteCategory } = require("../controllers/categoryController");
const { isAuthenticatedUser, authorizeRoles } = require("../middleware/auth");
router.param("id", require("../middleware/validateId"));
router.get("/categories", getCategories);
router.get("/category/:id", getCategory);
router.get("/admin/categories", isAuthenticatedUser, authorizeRoles("admin"), getCategories);
router.post("/admin/category", isAuthenticatedUser, authorizeRoles("admin"), createCategory);
router.route("/admin/category/:id")
    .get(isAuthenticatedUser, authorizeRoles("admin"), getCategory)
    .put(isAuthenticatedUser, authorizeRoles("admin"), updateCategory)
    .delete(isAuthenticatedUser, authorizeRoles("admin"), deleteCategory);
module.exports = router;
