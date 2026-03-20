const { supabaseAdmin } = require("../config/supabase");
const AppError   = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");

// ── GET /api/categories ───────────────────────────────────────────────────────
exports.getCategories = catchAsync(async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("id, name, slug, color, description, post_count")
    .order("post_count", { ascending: false });

  if (error) throw error;
  res.json({ success: true, data: data || [] });
});

// ── POST /api/categories ──────────────────────────────────────────────────────
exports.createCategory = catchAsync(async (req, res, next) => {
  const { name, color = "#c8b89a", description = "" } = req.body;
  if (!name?.trim()) return next(new AppError("Name is required.", 400));

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const { data, error } = await supabaseAdmin
    .from("categories")
    .insert({ name: name.trim(), slug, color, description })
    .select().single();

  if (error) {
    if (error.code === "23505") return next(new AppError("Category already exists.", 409));
    throw error;
  }

  res.status(201).json({ success: true, data });
});

// ── PATCH /api/categories/:id ─────────────────────────────────────────────────
exports.updateCategory = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { name, color, description } = req.body;

  const updates = {};
  if (name        != null) { updates.name = name.trim(); updates.slug = name.trim().toLowerCase().replace(/\s+/g, "-"); }
  if (color       != null)   updates.color = color;
  if (description != null)   updates.description = description;

  const { data, error } = await supabaseAdmin
    .from("categories").update(updates).eq("id", id).select().single();

  if (error) throw error;
  res.json({ success: true, data });
});

// ── DELETE /api/categories/:id ────────────────────────────────────────────────
exports.deleteCategory = catchAsync(async (req, res) => {
  await supabaseAdmin.from("categories").delete().eq("id", req.params.id);
  res.json({ success: true, message: "Category deleted." });
});

// ── GET /api/tags ─────────────────────────────────────────────────────────────
exports.getTags = catchAsync(async (req, res) => {
  const { search } = req.query;

  let q = supabaseAdmin
    .from("tags")
    .select("id, name, slug, post_count")
    .order("post_count", { ascending: false })
    .limit(50);

  if (search) q = q.ilike("name", `%${search}%`);

  const { data, error } = await q;
  if (error) throw error;
  res.json({ success: true, data: data || [] });
});

// ── POST /api/tags ────────────────────────────────────────────────────────────
exports.createTag = catchAsync(async (req, res, next) => {
  const { name } = req.body;
  if (!name?.trim()) return next(new AppError("Name is required.", 400));

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  const { data, error } = await supabaseAdmin
    .from("tags").upsert({ name: name.trim(), slug }, { onConflict: "slug" }).select().single();

  if (error) throw error;
  res.status(201).json({ success: true, data });
});
