const router = require("express").Router();
const ctrl   = require("../controllers/chatController");
const { optionalAuth } = require("../middleware/auth");
const rateLimit = require("express-rate-limit");

// Chat rate limiter — more generous than global
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 20,              // 20 messages per minute per IP
  message: { success: false, message: "Slow down — 20 messages per minute max." },
});

// All chat routes are publicly accessible (guests can use the chatbot too)
// optionalAuth attaches user context if signed in
router.get ("/config",   ctrl.getChatConfig);
router.post("/",         chatLimiter, optionalAuth, ctrl.chat);
router.post("/stream",   chatLimiter, optionalAuth, ctrl.chatStream);

module.exports = router;
