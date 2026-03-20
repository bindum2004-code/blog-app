const multer = require("multer");
const AppError = require("../utils/AppError");

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE      = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
  else cb(new AppError("Only JPEG, PNG, WebP and GIF images are allowed.", 400), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE } });

exports.uploadSingle = upload.single("image");
exports.uploadFields  = upload.fields([
  { name: "avatar",        maxCount: 1 },
  { name: "featuredImage", maxCount: 1 },
]);
