-- ════════════════════════════════════════════════════════════════════════════
--  Migration 005: Verify tables exist and fix any issues
--  Run this in SQL Editor to diagnose + fix common problems
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Check that all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2. If you see 0 posts after seeding, check auth users exist:
-- SELECT id, email FROM auth.users;

-- 3. Fix: ensure profiles has the correct role enum
-- If you get "invalid input value for enum user_role":
-- ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'administrator';

-- 4. Quick test insert (replace UUID with a real user UUID from auth.users):
-- INSERT INTO posts (title, slug, excerpt, content, author_id, status, featured_image, read_time)
-- VALUES (
--   'Test Post', 'test-post-' || gen_random_uuid()::text,
--   'A test excerpt.', 'Full content here.',
--   'YOUR-USER-UUID-HERE', 'published', 'tech', 2
-- );

-- 5. Check RLS is not blocking the service role:
-- (The service role bypasses RLS by default — if posts still fail, check your SUPABASE_SERVICE_ROLE_KEY)

-- 6. Verify post_categories and post_tags have proper FK constraints:
SELECT conname, contype FROM pg_constraint
WHERE conrelid = 'post_categories'::regclass
   OR conrelid = 'post_tags'::regclass;

-- 7. Check if posts have categories linked:
SELECT p.title, count(pc.category_id) as cat_count
FROM posts p
LEFT JOIN post_categories pc ON pc.post_id = p.id
GROUP BY p.id, p.title
LIMIT 5;
