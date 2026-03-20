const router = require("express").Router();
const ctrl   = require("../controllers/authController");
const { protect }                = require("../middleware/auth");
const { validateRegister, validateLogin } = require("../middleware/validate");
const { authLimiter, forgotPasswordLimiter } = require("../middleware/rateLimiter");

router.post("/register",        authLimiter,            validateRegister, ctrl.register);
router.post("/login",           authLimiter,            validateLogin,    ctrl.login);
router.post("/logout",          protect,                                  ctrl.logout);
router.post("/refresh",                                                   ctrl.refresh);
router.get ("/me",              protect,                                  ctrl.getMe);
router.post("/forgot-password", forgotPasswordLimiter,                   ctrl.forgotPassword);
router.post("/reset-password",                                            ctrl.resetPassword);

module.exports = router;
