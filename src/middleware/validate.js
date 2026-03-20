const Joi      = require("joi");
const AppError = require("../utils/AppError");

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, {
    abortEarly:   false,
    allowUnknown: true,   // allow extra fields — client may send computed props
    stripUnknown: true,   // remove them before the controller sees the body
  });
  if (error) {
    const msg = error.details.map(d => d.message.replace(/['"]/g, "")).join("; ");
    return next(new AppError(msg, 400));
  }
  next();
};

// ── Auth schemas ──────────────────────────────────────────────────────────────
exports.validateRegister = validate(Joi.object({
  email:      Joi.string().email().required(),
  password:   Joi.string().min(8).required(),
  username:   Joi.string().pattern(/^[a-zA-Z0-9_]+$/).min(3).max(30).required()
                .messages({ "string.pattern.base": "Username may only contain letters, numbers and underscores." }),
  first_name: Joi.string().min(1).max(50).required(),
  last_name:  Joi.string().min(1).max(50).required(),
  bio:        Joi.string().max(160).allow("").optional(),
}));

exports.validateLogin = validate(Joi.object({
  email:    Joi.string().email().required(),
  password: Joi.string().required(),
}));

// ── Post schema ───────────────────────────────────────────────────────────────
exports.validatePost = validate(Joi.object({
  title:          Joi.string().min(3).max(200).required(),
  excerpt:        Joi.string().max(400).allow("").optional(),
  content:        Joi.string().min(1).required(),
  status:         Joi.string().valid("draft", "pending_review", "published", "rejected", "archived").optional(),
  featured:       Joi.boolean().optional(),
  featured_image: Joi.string().allow("").optional(),
  read_time:      Joi.number().integer().min(1).max(999).optional(),
  categories:     Joi.array().items(Joi.number().integer().positive()).optional(),
  tags:           Joi.array().items(Joi.string().max(50)).optional(),
  meta_title:     Joi.string().max(60).allow("").optional(),
  meta_desc:      Joi.string().max(160).allow("").optional(),
  scheduled_at:   Joi.alternatives().try(
    Joi.string().isoDate(),
    Joi.string().allow("", null),
    Joi.valid(null)
  ).optional(),
}));

// ── Comment schema ────────────────────────────────────────────────────────────
exports.validateComment = validate(Joi.object({
  content:   Joi.string().min(1).max(2000).required()
               .messages({ "string.empty": "Comment cannot be empty." }),
  parent_id: Joi.string().uuid().allow(null, "").optional(),
}));

// ── Profile schema ────────────────────────────────────────────────────────────
exports.validateProfile = validate(Joi.object({
  first_name: Joi.string().min(1).max(50).allow("").optional(),
  last_name:  Joi.string().min(1).max(50).allow("").optional(),
  bio:        Joi.string().max(160).allow("").optional(),
  website:    Joi.string().uri({ allowRelative: false }).allow("").optional(),
  twitter:    Joi.string().max(50).allow("").optional(),
}));
