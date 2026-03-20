const { supabaseAdmin } = require("../config/supabase");
const catchAsync = require("../utils/catchAsync");

// ── GET /api/analytics/overview ───────────────────────────────────────────────
exports.getOverview = catchAsync(async (req, res) => {
  const [
    { count: totalPosts },
    { count: publishedPosts },
    { count: totalUsers },
    { count: totalComments },
    viewsResult,
    likesResult,
  ] = await Promise.all([
    supabaseAdmin.from("posts").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("posts").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("comments").select("*", { count: "exact", head: true }).eq("status", "approved"),
    supabaseAdmin.from("posts").select("views").eq("status", "published"),
    supabaseAdmin.from("post_likes").select("post_id", { count: "exact", head: true }),
  ]);

  const totalViews = (viewsResult.data || []).reduce((s, p) => s + (p.views || 0), 0);

  res.json({
    success: true,
    data: {
      total_posts:     totalPosts     || 0,
      published_posts: publishedPosts || 0,
      total_users:     totalUsers     || 0,
      total_comments:  totalComments  || 0,
      total_views:     totalViews,
      total_likes:     likesResult.count || 0,
    },
  });
});

// ── GET /api/analytics/top-posts ──────────────────────────────────────────────
exports.getTopPosts = catchAsync(async (req, res) => {
  const { metric = "views", limit = 10 } = req.query;
  const validMetrics = { views: "views", likes: "like_count", comments: "comment_count" };
  const col = validMetrics[metric] || "views";

  const { data, error } = await supabaseAdmin
    .from("posts")
    .select(`
      id, title, slug, ${col}, views, like_count, comment_count, published_at,
      author:profiles!posts_author_id_fkey (id, username, first_name, last_name)
    `)
    .eq("status", "published")
    .order(col, { ascending: false })
    .limit(Number(limit));

  if (error) throw error;
  res.json({ success: true, data: data || [] });
});

// ── GET /api/analytics/posts-by-status ────────────────────────────────────────
exports.getPostsByStatus = catchAsync(async (req, res) => {
  const statuses = ["published", "draft", "pending_review", "rejected", "archived"];
  const results = await Promise.all(
    statuses.map(s =>
      supabaseAdmin.from("posts").select("*", { count: "exact", head: true }).eq("status", s)
    )
  );

  const data = Object.fromEntries(statuses.map((s, i) => [s, results[i].count || 0]));
  res.json({ success: true, data });
});

// ── GET /api/analytics/users-by-role ──────────────────────────────────────────
exports.getUsersByRole = catchAsync(async (req, res) => {
  const roles = ["viewer", "editor", "administrator"];
  const results = await Promise.all(
    roles.map(r =>
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("role", r)
    )
  );

  const data = Object.fromEntries(roles.map((r, i) => [r, results[i].count || 0]));
  res.json({ success: true, data });
});

// ── GET /api/analytics/posts-over-time ────────────────────────────────────────
exports.getPostsOverTime = catchAsync(async (req, res) => {
  const { days = 30 } = req.query;
  const since = new Date(Date.now() - Number(days) * 86400000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("posts")
    .select("published_at, status")
    .eq("status", "published")
    .gte("published_at", since)
    .order("published_at", { ascending: true });

  if (error) throw error;

  // Group by date
  const byDate = {};
  for (const p of data || []) {
    const d = p.published_at?.slice(0, 10);
    if (d) byDate[d] = (byDate[d] || 0) + 1;
  }

  res.json({ success: true, data: byDate });
});

// ── GET /api/analytics/top-categories ─────────────────────────────────────────
exports.getTopCategories = catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, color, post_count")
    .order("post_count", { ascending: false })
    .limit(10);

  if (error) throw error;
  res.json({ success: true, data: data || [] });
});
