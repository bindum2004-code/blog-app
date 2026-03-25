/**
 * Inkwell Seeder — populates sample posts, comments and audit logs
 * Usage: npm run seed
 *
 * PREREQUISITES:
 *   1. Run 001_schema.sql + 002_seed.sql in Supabase SQL editor
 *   2. Create 3 auth users manually (see 002_seed.sql comments)
 *   3. Fill in ADMIN_ID, EDITOR_ID, VIEWER_ID below with real UUIDs
 *   4. npm run seed
 */

require("dotenv").config();
const { supabaseAdmin } = require("../config/supabase");

// ── PASTE YOUR USER UUIDS HERE ────────────────────────────────────────────────
const ADMIN_ID  = "3ddc58a3-4974-40d8-8cd4-2d2e920722e9";
const EDITOR_ID = "63a3cf22-009a-4086-8629-6c583e41c821";
const VIEWER_ID = "70539b7d-653b-4fdd-a8e2-0f40139c987c";
// ─────────────────────────────────────────────────────────────────────────────

const run = async () => {
  if ([ADMIN_ID, EDITOR_ID, VIEWER_ID].some(id => id.startsWith("REPLACE"))) {
    console.error("❌  Replace the placeholder UUIDs in seeder.js before running.");
    process.exit(1);
  }

  console.log("🌱  Seeding Inkwell…\n");

  // ── Fetch category IDs ───────────────────────────────────────────────────────
  const { data: cats } = await supabaseAdmin.from("categories").select("id, slug");
  const catId = Object.fromEntries(cats.map(c => [c.slug, c.id]));

  // ── Posts ────────────────────────────────────────────────────────────────────
  const posts = [
    {
      title:          "The Quiet Revolution of Ambient Computing",
      slug:           "quiet-revolution-ambient-computing",
      excerpt:        "As devices fade into the background of our lives, a new paradigm of interaction emerges.",
      content:        `The history of computing is, in many ways, a history of disappearance.\n\nThe mainframe gave way to the desktop, the desktop to the laptop, the laptop to the phone we carry everywhere. Each transition moved computation closer to our bodies.\n\nNow we stand at another threshold. Ambient computing — the idea that technology should recede into the environment itself — promises to complete this journey.\n\nBut this disappearance raises profound questions. When technology becomes invisible, does it also become unaccountable?\n\nPerhaps the most important design challenge of ambient computing is not making technology invisible, but making its values legible.`,
      author_id:      EDITOR_ID,
      status:         "published",
      featured:       true,
      featured_image: "tech",
      read_time:      5,
      views:          3847,
      published_at:   "2025-02-28T09:00:00Z",
      categories:     [catId.technology, catId.design],
    },
    {
      title:          "On Making Things: A Letter to Young Designers",
      slug:           "on-making-things-letter-young-designers",
      excerpt:        "Design is not decoration. It is the act of making decisions about how the world works.",
      content:        `There is a moment in every designer's education when they realise that their work is not about aesthetics.\n\nYou entered design because you loved beautiful things. And then someone showed you that a button's placement could determine whether someone found help in a crisis.\n\nDesign is the practice of making consequential decisions under the guise of aesthetic ones.\n\nLearn to read the ethics in every interface you encounter. Notice who is centred and who is marginalised. Then make things differently.`,
      author_id:      EDITOR_ID,
      status:         "published",
      featured:       false,
      featured_image: "design",
      read_time:      4,
      views:          2156,
      published_at:   "2025-03-05T09:00:00Z",
      categories:     [catId.design, catId.culture],
    },
    {
      title:          "Why Most Startup Advice is Wrong for You",
      slug:           "why-most-startup-advice-wrong",
      excerpt:        "The canonical startup playbook was written for a very specific type of founder.",
      content:        `Every week, thousands of aspiring founders read the same articles, absorb the same mantras. Move fast. Default to action.\n\nMuch of this advice is good. Some of it is actively harmful. Almost none of it acknowledges the context in which it was generated.\n\nThe canonical startup playbook emerged from a specific moment with abundant cheap capital and a technology landscape that rewarded winner-take-all strategies.\n\nThe most important startup advice: figure out who wrote the advice you're reading and whether you're trying to build the same thing.`,
      author_id:      ADMIN_ID,
      status:         "published",
      featured:       false,
      featured_image: "business",
      read_time:      6,
      views:          4201,
      published_at:   "2025-03-10T09:00:00Z",
      categories:     [catId.business],
    },
    {
      title:          "The New Science of Longevity",
      slug:           "new-science-longevity",
      excerpt:        "What the latest research on ageing actually tells us — and what it doesn't.",
      content:        `The science of longevity has moved from the fringes to the front pages in the past decade.\n\nBillionaires fund labs dedicated to reversing ageing. Startups promise interventions that extend health-span. And serious scientists who spent careers studying age-related diseases now speak openly about eliminating ageing altogether.\n\nThe honest answer is that we understand ageing far better than we did 20 years ago. We understand the molecular pathways. We have compounds that extend healthy life in model organisms.\n\nWe do not yet have a reliable roadmap for humans.`,
      author_id:      EDITOR_ID,
      status:         "published",
      featured:       false,
      featured_image: "science",
      read_time:      7,
      views:          1892,
      published_at:   "2025-03-12T09:00:00Z",
      categories:     [catId.science, catId.health],
    },
    {
      title:          "Draft: The Future of Open Source",
      slug:           "draft-future-open-source",
      excerpt:        "Exploring where open source goes after the licence wars.",
      content:        "Draft content — not yet ready for publication.",
      author_id:      EDITOR_ID,
      status:         "draft",
      featured:       false,
      featured_image: "tech",
      read_time:      3,
      views:          0,
      categories:     [catId.technology],
    },
  ];

  const insertedPosts = [];
  for (const { categories, ...p } of posts) {
    const { data, error } = await supabaseAdmin.from("posts").insert(p).select().single();
    if (error) { console.error("Post insert error:", error.message, p.title); continue; }

    if (categories?.length) {
      await supabaseAdmin.from("post_categories").insert(
        categories.filter(Boolean).map(cid => ({ post_id: data.id, category_id: cid }))
      );
    }
    insertedPosts.push(data);
    console.log(`  ✔ Post: "${data.title}"`);
  }

  // ── Likes ────────────────────────────────────────────────────────────────────
  if (insertedPosts[0]) {
    await supabaseAdmin.from("post_likes").insert([
      { post_id: insertedPosts[0].id, user_id: ADMIN_ID },
      { post_id: insertedPosts[0].id, user_id: VIEWER_ID },
    ]).onConflict().ignore();
  }
  if (insertedPosts[1]) {
    await supabaseAdmin.from("post_likes").insert([
      { post_id: insertedPosts[1].id, user_id: ADMIN_ID },
    ]).onConflict().ignore();
  }

  // ── Comments ─────────────────────────────────────────────────────────────────
  if (insertedPosts[0]) {
    const { data: c1 } = await supabaseAdmin.from("comments").insert({
      post_id:   insertedPosts[0].id,
      author_id: VIEWER_ID,
      content:   "Fascinating piece. The values legibility point is crucial — we need ambient systems that can explain themselves.",
      status:    "approved",
    }).select().single();

    if (c1) {
      await supabaseAdmin.from("comments").insert({
        post_id:   insertedPosts[0].id,
        author_id: ADMIN_ID,
        content:   "Agreed. Transparency has to be a design constraint, not an afterthought.",
        parent_id: c1.id,
        status:    "approved",
      });
    }
  }

  if (insertedPosts[1]) {
    await supabaseAdmin.from("comments").insert({
      post_id:   insertedPosts[1].id,
      author_id: VIEWER_ID,
      content:   "'Design is the practice of making consequential decisions under the guise of aesthetic ones.' I've been trying to articulate this for years.",
      status:    "approved",
    });
  }

  // ── Audit logs ────────────────────────────────────────────────────────────────
  const auditEntries = insertedPosts
    .filter(p => p.status === "published")
    .map(p => ({
      action:      "publish:post",
      user_id:     ADMIN_ID,
      user_role:   "administrator",
      target_type: "post",
      target_id:   p.id,
    }));

  if (auditEntries.length) {
    await supabaseAdmin.from("audit_logs").insert(auditEntries);
  }

  console.log("\n✅  Seed complete!\n");
  process.exit(0);
};

run().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
