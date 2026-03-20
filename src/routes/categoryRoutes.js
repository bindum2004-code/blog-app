const router = require("express").Router();
const ctrl   = require("../controllers/categoryController");
const { protect, adminOnly, editorPlus } = require("../middleware/auth");

// Categories
router.get  ("/",     ctrl.getCategories);
router.post ("/",     protect, adminOnly,  ctrl.createCategory);
router.patch("/:id",  protect, adminOnly,  ctrl.updateCategory);
router.delete("/:id", protect, adminOnly,  ctrl.deleteCategory);

// Tags (sub-path handled in app.js, but we add them here for convenience)
router.get  ("/tags",     ctrl.getTags);
router.post ("/tags",     protect, editorPlus, ctrl.createTag);

module.exports = router;
