const router  = require("express").Router();
const ctrl    = require("../controllers/commentController");
const { protect, adminOnly } = require("../middleware/auth");

router.patch ("/:id",           protect, ctrl.updateComment);
router.delete("/:id",           protect, ctrl.deleteComment);
router.post  ("/:id/like",      protect, ctrl.toggleCommentLike);
router.patch ("/:id/moderate",  protect, adminOnly, ctrl.moderateComment);

module.exports = router;
