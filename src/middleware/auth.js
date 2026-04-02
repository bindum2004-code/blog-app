const { supabaseAdmin, supabaseAs } = require("../config/supabase");
const AppError = require("../utils/AppError");

// ── Extract and verify Supabase JWT ──────────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || req.headers.Authorization || req.get("authorization");
    if (!header?.toString().startsWith("Bearer ")) {
      return next(new AppError("Not authenticated. Please sign in and try again.", 401));
    }

    const token = header.toString().split(" ")[1];

    // Verify token with Supabase (uses the service key to validate)
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return next(new AppError("Invalid or expired token. Please sign in again.", 401));
    }

    // Fetch profile (role etc.)
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (pErr || !profile) return next(new AppError("Profile not found.", 401));
    if (profile.account_status === "suspended")
      return next(new AppError("Your account has been suspended.", 403));

    const normalizedRole = profile.role || "viewer";
    req.user = {
      ...user,
      ...profile,
      role:           normalizedRole,
      account_status: profile.account_status || "active",
    };
    req.accessToken = token;               // forwarded to supabaseAs() calls
    next();
  } catch (err) {
    next(new AppError("Authentication error.", 401));
  }
};

// ── Optional auth (attaches user if token present, does not fail) ─────────────
exports.optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || req.headers.Authorization || req.get("authorization");
    if (!header?.toString().startsWith("Bearer ")) return next();

    const token = header.toString().split(" ")[1];
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) return next();

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("*").eq("id", user.id).single();

    if (profile) {
      const normalizedRole = profile.role || "viewer";
      req.user = {
        ...user,
        ...profile,
        role:           normalizedRole,
        account_status: profile.account_status || "active",
      };
      req.accessToken = token;
    }
  } catch {}
  next();
};

// ── Role guard ────────────────────────────────────────────────────────────────
exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user)               return next(new AppError("Not authenticated.", 401));
  if (!roles.includes(req.user.role)) return next(new AppError("Insufficient permissions.", 403));
  next();
};

// Shorthand guards
exports.adminOnly   = exports.requireRole("administrator");
exports.editorPlus  = exports.requireRole("editor", "administrator");
