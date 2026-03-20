const router = require("express").Router();
const ctrl   = require("../controllers/analyticsController");
const { protect, editorPlus, adminOnly } = require("../middleware/auth");

// Basic stats — any authenticated user (viewers see their own dashboard stats)
router.get("/overview",          protect,             ctrl.getOverview);
router.get("/top-posts",         protect,             ctrl.getTopPosts);
router.get("/top-categories",    protect,             ctrl.getTopCategories);

// Detailed breakdowns — editors and admins only
router.get("/posts-by-status",   protect, editorPlus, ctrl.getPostsByStatus);
router.get("/users-by-role",     protect, editorPlus, ctrl.getUsersByRole);
router.get("/posts-over-time",   protect, editorPlus, ctrl.getPostsOverTime);

module.exports = router;
