const { supabaseAdmin } = require("../config/supabase");
const AppError   = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { logAction } = require("../middleware/auditLogger");

// ── PATCH /api/admin/users/:id/role ──────────────────────────────────────────
exports.updateUserRole = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!["viewer","editor","administrator"].includes(role))
    return next(new AppError("Invalid role.", 400));
  if (id === req.user.id)
    return next(new AppError("You cannot change your own role.", 400));

  const { data, error } = await supabaseAdmin
    .from("profiles").update({ role }).eq("id", id)
    .select("id,username,role").single();

  if (error) throw error;
  await logAction(req, "manage:roles", "user", id, { role });

  res.json({ success: true, data });
});

// ── PATCH /api/admin/users/:id/status ────────────────────────────────────────
exports.updateUserStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["active","suspended"].includes(status))
    return next(new AppError("Status must be active or suspended.", 400));
  if (id === req.user.id)
    return next(new AppError("You cannot suspend yourself.", 400));

  const { data, error } = await supabaseAdmin
    .from("profiles").update({ account_status: status }).eq("id", id)
    .select("id,username,account_status").single();

  if (error) throw error;
  await logAction(req, status === "suspended" ? "suspend:user" : "activate:user", "user", id);

  res.json({ success: true, data });
});

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────
exports.getAuditLogs = catchAsync(async (req, res) => {
  const { page = 1, limit = 50, action, user_id } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let q = supabaseAdmin
    .from("audit_logs")
    .select(`
      id, action, user_role, target_type, target_id, metadata, ip_address, created_at,
      user:profiles!audit_logs_user_id_fkey (id, username, first_name, last_name, role)
    `, { count: "exact" });

  if (action)  q = q.eq("action", action);
  if (user_id) q = q.eq("user_id", user_id);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (error) throw error;
  res.json({ success: true, data: data || [], count, page: Number(page), limit: Number(limit) });
});

// ── GET /api/admin/pending-posts ──────────────────────────────────────────────
exports.getPendingPosts = catchAsync(async (req, res) => {
  const { data, error, count } = await supabaseAdmin
    .from("posts")
    .select(`
      id, title, slug, excerpt, created_at,
      author:profiles!posts_author_id_fkey (id, username, first_name, last_name)
    `, { count: "exact" })
    .eq("status", "pending_review")
    .order("created_at", { ascending: true });

  if (error) throw error;
  res.json({ success: true, data: data || [], count });
});

// ── GET /api/admin/settings ───────────────────────────────────────────────────
exports.getSettings = catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin.from("site_settings").select("key,value");
  if (error) throw error;

  const settings = Object.fromEntries((data || []).map(r => [r.key, r.value]));
  res.json({ success: true, data: settings });
});

// ── PATCH /api/admin/settings ─────────────────────────────────────────────────
exports.updateSettings = catchAsync(async (req, res) => {
  const updates = Object.entries(req.body).map(([key, value]) => ({
    key, value: String(value), updated_at: new Date().toISOString(),
  }));

  for (const u of updates) {
    await supabaseAdmin
      .from("site_settings")
      .upsert(u, { onConflict: "key" });
  }

  await logAction(req, "update:settings", "settings", "site", req.body);
  res.json({ success: true, message: "Settings updated." });
});

// ── GET /api/admin/comments/pending ──────────────────────────────────────────
exports.getPendingComments = catchAsync(async (req, res) => {
  const { data, error, count } = await supabaseAdmin
    .from("comments")
    .select(`
      id, content, created_at,
      author:profiles!comments_author_id_fkey (id, username, first_name, last_name),
      post:posts!comments_post_id_fkey (id, title, slug)
    `, { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  res.json({ success: true, data: data || [], count });
});
