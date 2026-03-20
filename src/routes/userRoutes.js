const router = require("express").Router();
const ctrl   = require("../controllers/userController");
const { protect, optionalAuth, adminOnly } = require("../middleware/auth");
const { validateProfile }       = require("../middleware/validate");
const { uploadSingle }          = require("../middleware/upload");
const { uploadLimiter }         = require("../middleware/rateLimiter");

// Authenticated self routes (must come before /:id to avoid conflict)
router.get  ("/me/bookmarks",    protect,                              ctrl.getBookmarks);
router.patch("/me",              protect, validateProfile,             ctrl.updateMe);
router.post ("/me/avatar",       protect, uploadLimiter, uploadSingle, ctrl.uploadAvatar);

// Admin: list all users
router.get  ("/",                protect, adminOnly,  ctrl.getUsers);

// Public / optional auth
router.get  ("/:id",             optionalAuth, ctrl.getUserById);
router.get  ("/:id/posts",       ctrl.getUserPosts);
router.post ("/:id/follow",      protect,      ctrl.toggleFollow);

module.exports = router;
