const router = require("express").Router();
const { isAuthenticatedUser } = require("../middleware/auth");
const { getAddresses, getAddress, createAddress, updateAddress, deleteAddress, favoriteAddress } = require("../controllers/addressController");

router.param("id", require("../middleware/validateId"));
router.get("/addresses", isAuthenticatedUser, getAddresses);
router.post("/address/new", isAuthenticatedUser, createAddress);
router.route("/address/:id")
    .get(isAuthenticatedUser, getAddress)
    .put(isAuthenticatedUser, updateAddress)
    .delete(isAuthenticatedUser, deleteAddress);
router.put("/address/:id/favorite", isAuthenticatedUser, favoriteAddress);

module.exports = router;
