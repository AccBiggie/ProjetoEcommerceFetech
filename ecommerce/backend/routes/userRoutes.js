const express = require("express");
const { registerUser, loginUser, logout, forgotPassword, resetPassword, getUserDetails, updatePassword, updateProfile, getAllUser, getSingleUser, updateUserRole, deleteUser } = require("../controllers/userController");
const { isAuthenticatedUser, authorizeRoles } = require("../middleware/auth");
const authRateLimit = require("../middleware/authRateLimit");
const router = express.Router();
// Authentication/recovery failures and limiter responses are private too.
router.use(['/register', '/login', '/password/forgot', '/password/reset'], (req, res, next) => {
    require('../utils/privateResponse')(res); next();
});
router.param("id", require("../middleware/validateId"));
//Route For Api Register User e User Details
router.route("/register").post(authRateLimit("register"), registerUser);
router.route("/login").post(authRateLimit("login"), loginUser);
router.route("/password/forgot").post(authRateLimit("forgot"), forgotPassword);
router.route("/password/reset/:token").put(authRateLimit("reset"), resetPassword);
router.route("/logout").post(logout).get((req, res) => {
    require('../utils/privateResponse')(res);
    res.set('Allow', 'POST').status(405).json({ success: false, message: 'Método não permitido.' });
});
router.route("/me").get(isAuthenticatedUser, getUserDetails);
router.route("/password/update").put(isAuthenticatedUser, updatePassword);
router.route("/me/update").put(isAuthenticatedUser, updateProfile); 
router.route("/admin/users").get(isAuthenticatedUser,authorizeRoles("admin"), getAllUser);
router
.route("/admin/user/:id")
.get(isAuthenticatedUser, authorizeRoles("admin"), getSingleUser)
.put(isAuthenticatedUser, authorizeRoles("admin"), updateUserRole)
.delete(isAuthenticatedUser, authorizeRoles("admin"), deleteUser);
for (const action of ['deactivate', 'reactivate']) router.patch('/admin/user/:id/' + action,
    isAuthenticatedUser, authorizeRoles('admin'), require('../controllers/userController')[action + 'User']);
module.exports = router;
