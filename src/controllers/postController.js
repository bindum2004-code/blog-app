const { supabaseAdmin } = require("../config/supabase");
const AppError   = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const { makeSlug } = require("../utils/slug");
const { logAction } = require("../middleware/auditLogger");

// Shared select string - explicit columns, no wildcards
const POST_SELECT = `
  id, title, slug, excerpt, content, status, featured,
  featured_image, read_time, views, like_count, comment_count,
  meta_title, meta_desc, scheduled_at, published_at, created_at, updated_at, author_id,
  author:profiles!posts_author_id_fkey (
    id, username, first_name, last_name, bio, avatar_url, role, verified, follower_count
  ),
  post_categories!left ( category:categories(id,name,slug,color) ),
  post_tags!left       ( tag:tags(id,name,slug) )
`;

// ── GET /api/posts ────────────────────────────────────────────────────────────
exports.getPosts = catchAsync(async (req, res) => {
  const {
    page = 1, limit = 10, status, category, tag,
    author, featured, search, sort = "published_at:desc",
  } = req.query;

  const pageNum  = Math.max(1, Number(page));
  const limitNum = Math.min(100, Math.max(1, Number(limit)));
  const offset   = (pageNum - 1) * limitNum;

  const [sortCol, sortDir] = (sort || "published_at:desc").split(":");
  const validSorts = ["published_at","created_at","views","like_count","comment_count","title"];
  const col = validSorts.includes(sortCol) ? sortCol : "published_at";
  const asc = sortDir === "asc";

  const userRole = req.user?.role;
  const userId   = req.user?.id;

  // Resolve category/tag to post ID lists (junction table lookups)
  let idFilter = null;
  if (category || tag) {
    const sets = [];
    if (category) {
      const { data: cp } = await supabaseAdmin
        .from("post_categories").select("post_id").eq("category_id", Number(category));
      sets.push(new Set((cp || []).map(r => r.post_id)));
    }
    if (tag) {
      const { data: tp } = await supabaseAdmin
        .from("post_tags").select("post_id").eq("tag_id", Number(tag));
      sets.push(new Set((tp || []).map(r => r.post_id)));
    }
    // Intersect all sets
    idFilter = [...sets.reduce((a, b) => new Set([...a].filter(x => b.has(x))))];
    if (idFilter.length === 0) {
      return res.json({ success: true, data: [], count: 0, page: pageNum, limit: limitNum });
    }
  }

  // Build query
  let q = supabaseAdmin.from("posts").select(POST_SELECT);

  // Visibility filter
  if (userRole === "administrator") {
    if (status) q = q.eq("status", status);
    // else: admin sees all
  } else if (userRole === "editor" && userId) {
    if (status) {
      q = q.eq("status", status);
    } else {
      // Editor sees published posts OR their own posts
      q = q.or(`status.eq.published,and(author_id.eq.${userId})`);
    }
  } else {
    // Viewer / unauthenticated — published only
    q = q.eq("status", "published");
  }

  if (idFilter)             q = q.in("id", idFilter);
  if (featured === "true")  q = q.eq("featured", true);
  if (author)               q = q.eq("author_id", author);
  if (search?.trim())       q = q.ilike("title", `%${search.trim()}%`);

  // Data fetch
  const { data, error } = await q
    .order(col,     { ascending: asc })
    .order("id",    { ascending: false })   // stable secondary sort
    .range(offset, offset + limitNum - 1);

  if (error) {
    console.error("[getPosts] Supabase error:", error);
    throw new AppError(`Database error: ${error.message}`, 500);
  }

  // Count (separate simple query)
  let cq = supabaseAdmin.from("posts").select("id", { count: "exact", head: true });
  if (userRole === "administrator") {
    if (status) cq = cq.eq("status", status);
  } else if (userRole === "editor" && userId) {
    if (status) { cq = cq.eq("status", status); }
    else        { cq = cq.or(`status.eq.published,and(author_id.eq.${userId})`); }
  } else {
    cq = cq.eq("status", "published");
  }
  if (idFilter) cq = cq.in("id", idFilter);
  if (author)   cq = cq.eq("author_id", author);

  const { count, error: cErr } = await cq;
  if (cErr) console.warn("[getPosts] count error:", cErr.message);

  res.json({
    success: true,
    data:    (data || []).map(normalizePost),
    count:   count ?? (data?.length ?? 0),
    page:    pageNum,
    limit:   limitNum,
  });
});

// ── GET /api/posts/:slug ──────────────────────────────────────────────────────
exports.getPostBySlug = catchAsync(async (req, res, next) => {
  const { slug } = req.params;

  const { data: post, error } = await supabaseAdmin
    .from("posts").select(POST_SELECT).eq("slug", slug).maybeSingle();

  if (error) {
    console.error("[getPostBySlug] error:", error);
    throw new AppError(error.message, 500);
  }
  if (!post) return next(new AppError("Post not found.", 404));

  const isOwner = req.user?.id === post.author_id;
  const isAdmin = req.user?.role === "administrator";
  if (post.status !== "published" && !isOwner && !isAdmin)
    return next(new AppError("Post not found.", 404));

  // Increment views (fire and forget — ignore errors)
  supabaseAdmin.from("posts")
    .update({ views: (post.views || 0) + 1 }).eq("id", post.id)
    .then(() => {}).catch(() => {});

  let likedByMe = false, bookmarkedByMe = false;
  if (req.user?.id) {
    const [{ data: like }, { data: bm }] = await Promise.all([
      supabaseAdmin.from("post_likes").select("post_id")
        .eq("post_id", post.id).eq("user_id", req.user.id).maybeSingle(),
      supabaseAdmin.from("bookmarks").select("post_id")
        .eq("post_id", post.id).eq("user_id", req.user.id).maybeSingle(),
    ]);
    likedByMe      = !!like;
    bookmarkedByMe = !!bm;
  }

  res.json({
    success: true,
    data: { ...normalizePost(post), liked_by_me: likedByMe, bookmarked_by_me: bookmarkedByMe },
  });
});

// ── POST /api/posts ───────────────────────────────────────────────────────────
exports.createPost = catchAsync(async (req, res) => {
  const {
    title, excerpt = "", content, status = "draft", featured = false,
    featured_image = "default", read_time = 1, categories = [], tags = [],
    meta_title = "", meta_desc = "", scheduled_at = null,
  } = req.body;

  const slug = makeSlug(title);
  const resolvedStatus =
    status === "published" && req.user.role !== "administrator"
      ? "pending_review"
      : status;

  const { data: post, error } = await supabaseAdmin.from("posts").insert({
    title, slug, excerpt, content,
    author_id:     req.user.id,
    status:        resolvedStatus,
    featured,
    featured_image,
    read_time:     Number(read_time) || 1,
    meta_title,
    meta_desc,
    scheduled_at:  scheduled_at || null,
    published_at:  resolvedStatus === "published" ? new Date().toISOString() : null,
  }).select("id, title, slug, status, created_at").single();

  if (error) {
    console.error("[createPost] insert error:", error);
    throw new AppError(error.message, 400);
  }

  // Categories
  if (Array.isArray(categories) && categories.length) {
    const catRows = categories
      .map(cid => ({ post_id: post.id, category_id: Number(cid) }))
      .filter(r => !isNaN(r.category_id));
    if (catRows.length) {
      const { error: catErr } = await supabaseAdmin.from("post_categories").insert(catRows);
      if (catErr) console.warn("[createPost] categories:", catErr.message);
    }
  }

  // Tags
  if (Array.isArray(tags)) {
    for (const tagName of tags) {
      if (!tagName) continue;
      const slug_t = String(tagName).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const { data: tag, error: tagErr } = await supabaseAdmin
        .from("tags").upsert({ name: String(tagName), slug: slug_t }, { onConflict: "slug" })
        .select("id").single();
      if (tagErr) { console.warn("[createPost] tag upsert:", tagErr.message); continue; }
      if (tag) {
        await supabaseAdmin.from("post_tags")
          .upsert({ post_id: post.id, tag_id: tag.id }, { onConflict: "post_id,tag_id" });
      }
    }
  }

  await logAction(req, "create:post", "post", post.id, { title, status: resolvedStatus });

  const { data: full, error: fullErr } = await supabaseAdmin
    .from("posts").select(POST_SELECT).eq("id", post.id).single();
  if (fullErr) throw new AppError(fullErr.message, 500);

  res.status(201).json({ success: true, data: normalizePost(full) });
});

// ── PATCH /api/posts/:id ──────────────────────────────────────────────────────
exports.updatePost = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("posts").select("id, author_id, status").eq("id", id).maybeSingle();
  if (fetchErr) throw new AppError(fetchErr.message, 500);
  if (!existing) return next(new AppError("Post not found.", 404));

  const isOwner = existing.author_id === req.user.id;
  const isAdmin = req.user.role === "administrator";
  if (!isOwner && !isAdmin) return next(new AppError("Not authorized.", 403));

  const {
    title, excerpt, content, status, featured, featured_image,
    read_time, categories, tags, meta_title, meta_desc, scheduled_at,
  } = req.body;

  const updates = {};
  if (title          != null) { updates.title = title; updates.slug = makeSlug(title); }
  if (excerpt        != null) updates.excerpt        = excerpt;
  if (content        != null) updates.content        = content;
  if (featured       != null) updates.featured       = featured;
  if (featured_image != null) updates.featured_image = featured_image;
  if (read_time      != null) updates.read_time      = Number(read_time) || 1;
  if (meta_title     != null) updates.meta_title     = meta_title;
  if (meta_desc      != null) updates.meta_desc      = meta_desc;
  if (scheduled_at   != null) updates.scheduled_at   = scheduled_at || null;
  if (status != null) {
    updates.status = (status === "published" && !isAdmin) ? "pending_review" : status;
    if (updates.status === "published" && existing.status !== "published")
      updates.published_at = new Date().toISOString();
  }

  if (Object.keys(updates).length) {
    const { error: updErr } = await supabaseAdmin.from("posts").update(updates).eq("id", id);
    if (updErr) throw new AppError(updErr.message, 500);
  }

  if (Array.isArray(categories)) {
    await supabaseAdmin.from("post_categories").delete().eq("post_id", id);
    const catRows = categories
      .map(cid => ({ post_id: id, category_id: Number(cid) }))
      .filter(r => !isNaN(r.category_id));
    if (catRows.length) await supabaseAdmin.from("post_categories").insert(catRows);
  }

  if (Array.isArray(tags)) {
    await supabaseAdmin.from("post_tags").delete().eq("post_id", id);
    for (const tagName of tags) {
      if (!tagName) continue;
      const slug_t = String(tagName).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const { data: tag } = await supabaseAdmin
        .from("tags").upsert({ name: String(tagName), slug: slug_t }, { onConflict: "slug" })
        .select("id").single();
      if (tag) {
        await supabaseAdmin.from("post_tags")
          .upsert({ post_id: id, tag_id: tag.id }, { onConflict: "post_id,tag_id" });
      }
    }
  }

  await logAction(req, "edit:post", "post", id, updates);

  const { data: full } = await supabaseAdmin.from("posts").select(POST_SELECT).eq("id", id).single();
  res.json({ success: true, data: normalizePost(full) });
});

// ── DELETE /api/posts/:id ─────────────────────────────────────────────────────
exports.deletePost = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { data: post } = await supabaseAdmin
    .from("posts").select("author_id").eq("id", id).maybeSingle();
  if (!post) return next(new AppError("Post not found.", 404));

  const isOwner = post.author_id === req.user.id;
  const isAdmin = req.user.role === "administrator";
  if (!isOwner && !isAdmin) return next(new AppError("Not authorized.", 403));

  await supabaseAdmin.from("posts").delete().eq("id", id);
  await logAction(req, "delete:post", "post", id);
  res.json({ success: true, message: "Post deleted." });
});

// ── POST /api/posts/:id/publish ───────────────────────────────────────────────
exports.publishPost = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { error } = await supabaseAdmin.from("posts")
    .update({ status: "published", published_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new AppError(error.message, 500);
  await logAction(req, "publish:post", "post", id);
  res.json({ success: true, message: "Post published." });
});

// ── POST /api/posts/:id/reject ────────────────────────────────────────────────
exports.rejectPost = catchAsync(async (req, res) => {
  const { reason = "" } = req.body || {};
  await supabaseAdmin.from("posts").update({ status: "rejected" }).eq("id", req.params.id);
  await logAction(req, "reject:post", "post", req.params.id, { reason });
  res.json({ success: true, message: "Post rejected." });
});

// ── POST /api/posts/:id/like ──────────────────────────────────────────────────
exports.toggleLike = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabaseAdmin.from("post_likes").select("post_id")
    .eq("post_id", id).eq("user_id", req.user.id).maybeSingle();

  if (existing) {
    await supabaseAdmin.from("post_likes").delete().eq("post_id", id).eq("user_id", req.user.id);
  } else {
    await supabaseAdmin.from("post_likes").insert({ post_id: id, user_id: req.user.id });
  }

  const { data: post } = await supabaseAdmin.from("posts").select("like_count").eq("id", id).single();
  res.json({ success: true, liked: !existing, like_count: post?.like_count ?? 0 });
});

// ── POST /api/posts/:id/bookmark ──────────────────────────────────────────────
exports.toggleBookmark = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabaseAdmin.from("bookmarks").select("post_id")
    .eq("post_id", id).eq("user_id", req.user.id).maybeSingle();

  if (existing) {
    await supabaseAdmin.from("bookmarks").delete().eq("post_id", id).eq("user_id", req.user.id);
  } else {
    await supabaseAdmin.from("bookmarks").insert({ post_id: id, user_id: req.user.id });
  }
  res.json({ success: true, bookmarked: !existing });
});

// ── Normalize join response → flat post object ────────────────────────────────
const normalizePost = (p) => {
  if (!p) return null;
  return {
    ...p,
    categories: (p.post_categories || []).map(pc => pc.category).filter(Boolean),
    tags:       (p.post_tags       || []).map(pt => pt.tag).filter(Boolean),
    post_categories: undefined,
    post_tags:       undefined,
  };
};
