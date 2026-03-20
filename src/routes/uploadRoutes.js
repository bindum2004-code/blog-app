const router = require("express").Router();
const ctrl   = require("../controllers/uploadController");
const { protect, editorPlus } = require("../middleware/auth");
const { uploadSingle }        = require("../middleware/upload");
const { uploadLimiter }       = require("../middleware/rateLimiter");

router.post("/", protect, editorPlus, uploadLimiter, uploadSingle, ctrl.uploadImage);

module.exports = router;
