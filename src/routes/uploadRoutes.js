const router = require("express").Router();
const ctrl   = require("../controllers/uploadController");
const { protect } = require("../middleware/auth");
const { uploadSingle }        = require("../middleware/upload");
const { uploadLimiter }       = require("../middleware/rateLimiter");

router.post("/", protect, uploadLimiter, uploadSingle, ctrl.uploadImage);

module.exports = router;
