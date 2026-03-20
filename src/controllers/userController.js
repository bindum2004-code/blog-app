const { supabaseAdmin } = require("../config/supabase");
const AppError   = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { uploadFile } = require("../config/storage");
const { logAction }  = require("../middleware/auditLogger");

// ── GET /api/users ────────────────────────────────────────────────────────────
exports.getUsers = catchAsync(async (req, res) => {
  const { search, role, status, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let q = supabaseAdmin
    .from("profiles")
    .select("id,username,first_name,last_name,bio,avatar_url,role,account_status,verified,follower_count,post_count,created_at", { count: "exact" });

  if (role)   q = q.eq("role", role);
  if (status) q = q.eq("account_status", status);
  if (search) q = q.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);

  const { data, error, count } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (error) throw error;
  res.json({ success: true, data: data || [], count, page: Number(page), limit: Number(limit) });
});

// ── GET /api/users/:id ────────────────────────────────────────────────────────
exports.getUserById = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id,username,first_name,last_name,bio,avatar_url,role,account_status,verified,follower_count,following_count,post_count,created_at,website,twitter")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!profile) return next(new AppError("User not found.", 404));

  let isFollowing = false;
  if (req.user) {
    const { data: f } = await supabaseAdmin
      .from("follows").select("follower_id")
      .eq("follower_id", req.user.id).eq("following_id", id).maybeSingle();
    isFollowing = !!f;
  }

  res.json({ success: true, data: { ...profile, is_following: isFollowing } });
});

// ── PATCH /api/users/me ───────────────────────────────────────────────────────
exports.updateMe = catchAsync(async (req, res) => {
  const { first_name, last_name, bio, website, twitter } = req.body;

  const updates = {};
  if (first_name != null) updates.first_name = first_name.trim();
  if (last_name  != null) updates.last_name  = last_name.trim();
  if (bio        != null) updates.bio        = bio.slice(0, 160);
  if (website    != null) updates.website    = website;
  if (twitter    != null) updates.twitter    = twitter;

  const { data, error } = await supabaseAdmin
    .from("profiles").update(updates).eq("id", req.user.id)
    .select("id,username,first_name,last_name,bio,avatar_url,role,verified,follower_count,following_count,post_count,website,twitter")
    .single();

  if (error) throw error;
  res.json({ success: true, data });
});

// ── POST /api/users/me/avatar ─────────────────────────────────────────────────
exports.uploadAvatar = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError("Image file is required.", 400));

  const url = await uploadFile(req.user.id, req.file.originalname, req.file.buffer, req.file.mimetype);

  await supabaseAdmin.from("profiles").update({ avatar_url: url }).eq("id", req.user.id);

  res.json({ success: true, avatar_url: url });
});

// ── POST /api/users/:id/follow ────────────────────────────────────────────────
exports.toggleFollow = catchAsync(async (req, res, next) => {
  const { id: targetId } = req.params;
  if (targetId === req.user.id) return next(new AppError("You cannot follow yourself.", 400));

  const { data: target } = await supabaseAdmin
    .from("profiles").select("id").eq("id", targetId).maybeSingle();
  if (!target) return next(new AppError("User not found.", 404));

  const { data: existing } = await supabaseAdmin
    .from("follows").select("follower_id")
    .eq("follower_id", req.user.id).eq("following_id", targetId).maybeSingle();

  let following;
  if (existing) {
    await supabaseAdmin.from("follows").delete()
      .eq("follower_id", req.user.id).eq("following_id", targetId);
    following = false;
  } else {
    await supabaseAdmin.from("follows").insert({ follower_id: req.user.id, following_id: targetId });
    following = true;
  }

  const { data: updated } = await supabaseAdmin
    .from("profiles").select("follower_count").eq("id", targetId).single();

  res.json({ success: true, following, follower_count: updated?.follower_count ?? 0 });
});

// ── GET /api/users/me/bookmarks ───────────────────────────────────────────────
exports.getBookmarks = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { data, error, count } = await supabaseAdmin
    .from("bookmarks")
    .select(`
      created_at,
      post:posts!bookmarks_post_id_fkey (
        id, title, slug, excerpt, featured_image, read_time, like_count, published_at,
        author:profiles!posts_author_id_fkey (id, username, first_name, last_name, avatar_url)
      )
    `, { count: "exact" })
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (error) throw error;

  res.json({
    success: true,
    data:    (data || []).map(b => ({ ...b.post, bookmarked_at: b.created_at })),
    count,
    page:    Number(page),
    limit:   Number(limit),
  });
});

// ── GET /api/users/:id/posts ──────────────────────────────────────────────────
exports.getUserPosts = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { data, error, count } = await supabaseAdmin
    .from("posts")
    .select("id,title,slug,excerpt,featured_image,read_time,like_count,comment_count,views,status,published_at,created_at", { count: "exact" })
    .eq("author_id", id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (error) throw error;
  res.json({ success: true, data: data || [], count, page: Number(page), limit: Number(limit) });
});
