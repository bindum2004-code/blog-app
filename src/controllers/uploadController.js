const { uploadFile }  = require("../config/storage");
const AppError        = require("../utils/AppError");
const catchAsync      = require("../utils/catchAsync");

// ── POST /api/upload ──────────────────────────────────────────────────────────
exports.uploadImage = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError("No image file received.", 400));

  const url = await uploadFile(
    req.user.id,
    req.file.originalname,
    req.file.buffer,
    req.file.mimetype
  );

  res.status(201).json({ success: true, url });
});
