const { supabaseAdmin } = require("../config/supabase");
const AppError   = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { logAction } = require("../middleware/auditLogger");

// ── GET /api/posts/:postId/comments ──────────────────────────────────────────
exports.getComments = catchAsync(async (req, res) => {
  const { postId } = req.params;
  const { page = 1, limit = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { data, error, count } = await supabaseAdmin
    .from("comments")
    .select(`
      id, post_id, content, parent_id, status, like_count, created_at, updated_at,
      author:profiles!comments_author_id_fkey (
        id, username, first_name, last_name, avatar_url, role, verified
      )
    `, { count: "exact" })
    .eq("post_id", postId)
    .eq("status", "approved")
    .is("parent_id", null)           // top-level only; replies fetched separately
    .order("created_at", { ascending: true })
    .range(offset, offset + Number(limit) - 1);

  if (error) throw error;

  // Fetch replies for all top-level comments in one query
  const topIds = (data || []).map(c => c.id);
  let replies = [];
  if (topIds.length) {
    const { data: replyData } = await supabaseAdmin
      .from("comments")
      .select(`
        id, post_id, content, parent_id, status, like_count, created_at,
        author:profiles!comments_author_id_fkey (
          id, username, first_name, last_name, avatar_url, role, verified
        )
      `)
      .in("parent_id", topIds)
      .eq("status", "approved")
      .order("created_at", { ascending: true });
    replies = replyData || [];
  }

  // Attach liked_by_me if authenticated
  let likedSet = new Set();
  if (req.user && data?.length) {
    const allIds = [...topIds, ...replies.map(r => r.id)];
    const { data: likes } = await supabaseAdmin
      .from("comment_likes")
      .select("comment_id")
      .eq("user_id", req.user.id)
      .in("comment_id", allIds);
    likedSet = new Set((likes || []).map(l => l.comment_id));
  }

  const nest = (c) => ({
    ...c,
    liked_by_me: likedSet.has(c.id),
    replies: replies
      .filter(r => r.parent_id === c.id)
      .map(r => ({ ...r, liked_by_me: likedSet.has(r.id) })),
  });

  res.json({
    success: true,
    data:    (data || []).map(nest),
    count,
    page:    Number(page),
    limit:   Number(limit),
  });
});

// ── POST /api/posts/:postId/comments ─────────────────────────────────────────
exports.createComment = catchAsync(async (req, res) => {
  const { postId }             = req.params;
  const { content, parent_id } = req.body;

  // Verify parent exists and belongs to same post
  if (parent_id) {
    const { data: parent } = await supabaseAdmin
      .from("comments").select("id, post_id").eq("id", parent_id).maybeSingle();
    if (!parent || parent.post_id !== postId)
      throw new AppError("Parent comment not found.", 404);
  }

  const { data: comment, error } = await supabaseAdmin
    .from("comments")
    .insert({
      post_id:   postId,
      author_id: req.user.id,
      content,
      parent_id: parent_id || null,
      status:    "approved",
    })
    .select(`
      id, post_id, content, parent_id, status, like_count, created_at,
      author:profiles!comments_author_id_fkey (
        id, username, first_name, last_name, avatar_url, role, verified
      )
    `)
    .single();

  if (error) throw error;

  res.status(201).json({ success: true, data: { ...comment, liked_by_me: false, replies: [] } });
});

// ── PATCH /api/comments/:id ───────────────────────────────────────────────────
exports.updateComment = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content?.trim()) return next(new AppError("Content is required.", 400));

  const { data: existing } = await supabaseAdmin
    .from("comments").select("author_id").eq("id", id).maybeSingle();
  if (!existing) return next(new AppError("Comment not found.", 404));

  const isOwner = existing.author_id === req.user.id;
  const isAdmin = req.user.role === "administrator";
  if (!isOwner && !isAdmin) return next(new AppError("Not authorized.", 403));

  const { data, error } = await supabaseAdmin
    .from("comments").update({ content }).eq("id", id)
    .select("id, content, updated_at").single();
  if (error) throw error;

  res.json({ success: true, data });
});

// ── DELETE /api/comments/:id ──────────────────────────────────────────────────
exports.deleteComment = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from("comments").select("author_id, post_id").eq("id", id).maybeSingle();
  if (!existing) return next(new AppError("Comment not found.", 404));

  const isOwner = existing.author_id === req.user.id;
  const isAdmin = req.user.role === "administrator";
  if (!isOwner && !isAdmin) return next(new AppError("Not authorized.", 403));

  await supabaseAdmin.from("comments").delete().eq("id", id);
  await logAction(req, "delete:comment", "comment", id);

  res.json({ success: true, message: "Comment deleted." });
});

// ── POST /api/comments/:id/like ───────────────────────────────────────────────
exports.toggleCommentLike = catchAsync(async (req, res) => {
  const { id } = req.params;

  const { data: existing } = await supabaseAdmin
    .from("comment_likes").select("comment_id")
    .eq("comment_id", id).eq("user_id", req.user.id).maybeSingle();

  let liked;
  if (existing) {
    await supabaseAdmin.from("comment_likes").delete()
      .eq("comment_id", id).eq("user_id", req.user.id);
    liked = false;
  } else {
    await supabaseAdmin.from("comment_likes").insert({ comment_id: id, user_id: req.user.id });
    liked = true;
  }

  const { data: c } = await supabaseAdmin
    .from("comments").select("like_count").eq("id", id).single();

  res.json({ success: true, liked, like_count: c?.like_count ?? 0 });
});

// ── PATCH /api/comments/:id/moderate (admin only) ─────────────────────────────
exports.moderateComment = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!["approved","pending","rejected"].includes(status))
    return next(new AppError("Invalid status.", 400));

  await supabaseAdmin.from("comments").update({ status }).eq("id", id);
  await logAction(req, `moderate:comment`, "comment", id, { status });

  res.json({ success: true, message: `Comment ${status}.` });
});
