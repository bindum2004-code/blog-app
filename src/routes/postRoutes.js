const router = require("express").Router();
const ctrl   = require("../controllers/postController");
const cmtCtrl = require("../controllers/commentController");
const { protect, optionalAuth, adminOnly } = require("../middleware/auth");
const { validatePost, validateComment } = require("../middleware/validate");
const { commentLimiter } = require("../middleware/rateLimiter");

// Public / optional-auth
router.get  ("/",                      optionalAuth, ctrl.getPosts);
router.get  ("/:slug",                 optionalAuth, ctrl.getPostBySlug);

// Authenticated
router.post ("/",                      protect, validatePost,             ctrl.createPost);
router.patch("/:id",                   protect, validatePost,             ctrl.updatePost);
router.delete("/:id",                  protect,                           ctrl.deletePost);
router.post ("/:id/like",              protect,                           ctrl.toggleLike);
router.post ("/:id/bookmark",          protect,                           ctrl.toggleBookmark);

// Admin actions
router.post ("/:id/publish",           protect, adminOnly, ctrl.publishPost);
router.post ("/:id/reject",            protect, adminOnly, ctrl.rejectPost);

// Comments (nested under posts)
router.get  ("/:postId/comments",      optionalAuth,                          cmtCtrl.getComments);
router.post ("/:postId/comments",      protect, commentLimiter, validateComment, cmtCtrl.createComment);

module.exports = router;
