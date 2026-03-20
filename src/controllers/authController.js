const { supabase, supabaseAdmin } = require("../config/supabase");
const AppError   = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { logAction } = require("../middleware/auditLogger");

// ── POST /api/auth/register ───────────────────────────────────────────────────
exports.register = catchAsync(async (req, res, next) => {
  const { email, password, username, first_name, last_name, bio = "" } = req.body;

  const cleanEmail    = email.trim().toLowerCase();
  const cleanUsername = username.trim().toLowerCase();

  // Check username uniqueness
  const { data: usernameTaken } = await supabaseAdmin
    .from("profiles").select("id").eq("username", cleanUsername).maybeSingle();
  if (usernameTaken) return next(new AppError("Username already taken. Please choose another.", 409));

  // Create Supabase Auth user
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email:         cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { username: cleanUsername, first_name: first_name.trim(), last_name: last_name.trim() },
  });

  if (error) {
    if (
      error.message.includes("already registered") ||
      error.message.includes("already been registered") ||
      error.message.includes("User already registered") ||
      error.status === 422
    ) return next(new AppError("That email is already registered. Try signing in instead.", 409));
    if (error.message.includes("unique") || error.message.includes("duplicate"))
      return next(new AppError("Username already taken. Please choose another.", 409));
    return next(new AppError(error.message, 400));
  }

  // Wait briefly for the DB trigger to create the profile row
  await new Promise(r => setTimeout(r, 300));

  // Patch the profile with bio etc.
  const { error: patchErr } = await supabaseAdmin.from("profiles").update({
    username:   cleanUsername,
    first_name: first_name.trim(),
    last_name:  last_name.trim(),
    bio:        bio.slice(0, 160),
  }).eq("id", data.user.id);

  if (patchErr) {
    // Trigger may not have run — insert instead
    await supabaseAdmin.from("profiles").insert({
      id:         data.user.id,
      username:   cleanUsername,
      first_name: first_name.trim(),
      last_name:  last_name.trim(),
      bio:        bio.slice(0, 160),
    }).catch(() => {});
  }

  // Auto sign-in to get session
  const { data: sessionData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: cleanEmail, password,
  });

  if (signInErr) {
    return res.status(201).json({ success: true, message: "Account created. Please sign in.", needsLogin: true });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("*").eq("id", data.user.id).single();

  await logAction({ user: profile, ip: req.ip }, "register", "user", data.user.id);

  res.status(201).json({
    success:       true,
    access_token:  sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    user:          sanitizeProfile(profile),
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(), password,
  });

  if (error) {
    const msg = error.message?.toLowerCase() || "";
    if (msg.includes("invalid") || msg.includes("credentials") || msg.includes("not found"))
      return next(new AppError("Incorrect email or password.", 401));
    if (msg.includes("email not confirmed"))
      return next(new AppError("Please confirm your email before signing in.", 401));
    if (msg.includes("too many"))
      return next(new AppError("Too many login attempts. Please wait and try again.", 429));
    return next(new AppError("Sign in failed. Please try again.", 401));
  }

  if (!data.session) return next(new AppError("Could not create session.", 500));

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles").select("*").eq("id", data.user.id).single();

  if (profileErr || !profile) {
    // Profile missing — create it (handles accounts created directly in Supabase dashboard)
    const fallback = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");
    await supabaseAdmin.from("profiles").upsert({
      id:         data.user.id,
      username:   fallback,
      first_name: data.user.user_metadata?.first_name || "",
      last_name:  data.user.user_metadata?.last_name  || "",
    }, { onConflict: "id" });
    const { data: newProfile } = await supabaseAdmin
      .from("profiles").select("*").eq("id", data.user.id).single();
    return res.json({
      success:       true,
      access_token:  data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in:    data.session.expires_in,
      user:          sanitizeProfile(newProfile),
    });
  }

  if (profile.account_status === "suspended")
    return next(new AppError("Your account has been suspended. Contact an admin.", 403));

  await logAction({ user: profile, ip: req.ip }, "login", "user", data.user.id);

  res.json({
    success:       true,
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in:    data.session.expires_in,
    user:          sanitizeProfile(profile),
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
exports.logout = catchAsync(async (_req, res) => {
  res.json({ success: true, message: "Logged out." });
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
exports.refresh = catchAsync(async (req, res, next) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return next(new AppError("Refresh token required.", 400));

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) return next(new AppError("Session expired. Please sign in again.", 401));

  res.json({
    success:       true,
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in:    data.session.expires_in,
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
exports.getMe = catchAsync(async (req, res, next) => {
  const { data: profile, error } = await supabaseAdmin
    .from("profiles").select("*").eq("id", req.user.id).single();
  if (error || !profile) return next(new AppError("Profile not found.", 404));
  res.json({ success: true, user: sanitizeProfile(profile) });
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  if (!email) return next(new AppError("Email address is required.", 400));

  const FRONTEND = process.env.FRONTEND_URL || "http://localhost:3000";

  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${FRONTEND}/reset-password`,
  });

  // Always return 200 — never leak whether the email exists
  res.json({
    success: true,
    message: "If an account with that email exists, a password reset link has been sent.",
  });
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
// This endpoint receives the NEW session tokens AFTER the frontend has already
// updated the password directly via the Supabase Auth REST API.
// It uses those tokens to fetch + return the full profile so the frontend
// can immediately restore the session without a separate /me call.
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { access_token, refresh_token } = req.body;

  if (!access_token) return next(new AppError("access_token is required.", 400));

  // Verify the token is valid and get the user
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(access_token);
  if (error || !user) return next(new AppError("Invalid or expired session token.", 401));

  // Fetch the full profile
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("*").eq("id", user.id).single();

  if (!profile) return next(new AppError("User profile not found.", 404));

  await logAction({ user: profile, ip: req.ip }, "reset:password", "user", user.id);

  res.json({
    success:       true,
    access_token,
    refresh_token: refresh_token || null,
    user:          sanitizeProfile(profile),
  });
});

// ── Helper ────────────────────────────────────────────────────────────────────
const sanitizeProfile = (p) => {
  if (!p) return null;
  return { ...p }; // profiles table has no password — all fields safe
};
