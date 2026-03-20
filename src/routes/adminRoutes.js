const router   = require("express").Router();
const ctrl     = require("../controllers/adminController");
const userCtrl = require("../controllers/userController");
const { protect, adminOnly } = require("../middleware/auth");

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

router.get   ("/users",                  userCtrl.getUsers);
router.patch ("/users/:id/role",         ctrl.updateUserRole);
router.patch ("/users/:id/status",       ctrl.updateUserStatus);
router.get   ("/audit-logs",             ctrl.getAuditLogs);
router.get   ("/pending-posts",          ctrl.getPendingPosts);
router.get   ("/comments/pending",       ctrl.getPendingComments);
router.get   ("/settings",               ctrl.getSettings);
router.patch ("/settings",               ctrl.updateSettings);

module.exports = router;
