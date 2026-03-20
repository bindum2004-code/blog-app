-- ════════════════════════════════════════════════════════════════════════════
--  Inkwell — Seed Data
--  NOTE: Run AFTER 001_schema.sql
--  NOTE: After creating auth users, replace the UUIDs below with real ones
--        from: Supabase Dashboard → Authentication → Users
-- ════════════════════════════════════════════════════════════════════════════

-- ── Seed categories ───────────────────────────────────────────────────────────

INSERT INTO categories (name, slug, color, description, post_count) VALUES
  ('Technology', 'technology', '#3b82f6', 'Software, hardware, and the digital world',  12),
  ('Design',     'design',     '#ec4899', 'Visual communication and UX thinking',         8),
  ('Business',   'business',   '#10b981', 'Strategy, startups, and the economy',         15),
  ('Science',    'science',    '#f59e0b', 'Research, discovery, and the natural world',   6),
  ('Culture',    'culture',    '#8b5cf6', 'Art, society, and the human experience',       9),
  ('Health',     'health',     '#06b6d4', 'Wellbeing, medicine, and mental health',       7)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed tags ─────────────────────────────────────────────────────────────────

INSERT INTO tags (name, slug) VALUES
  ('React',           'react'),
  ('Node.js',         'nodejs'),
  ('TypeScript',      'typescript'),
  ('UI/UX',           'ui-ux'),
  ('Machine Learning','machine-learning'),
  ('Startup',         'startup'),
  ('Productivity',    'productivity'),
  ('Minimalism',      'minimalism'),
  ('Architecture',    'architecture'),
  ('Open Source',     'open-source')
ON CONFLICT (slug) DO NOTHING;

-- ── Default site settings ─────────────────────────────────────────────────────

INSERT INTO site_settings (key, value) VALUES
  ('site_name',       'Inkwell'),
  ('tagline',         'Ideas worth reading.'),
  ('posts_per_page',  '10'),
  ('meta_description','A publication for people who care about ideas.'),
  ('allow_comments',  'true'),
  ('require_approval','false')
ON CONFLICT (key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
--  HOW TO CREATE TEST ACCOUNTS
-- ════════════════════════════════════════════════════════════════════════════
--
--  1. Go to Supabase Dashboard → Authentication → Users
--  2. Click "Add user" → create these 3 accounts:
--       admin@inkwell.com  / Admin@123
--       editor@inkwell.com / Editor@123
--       viewer@inkwell.com / Viewer@123
--
--  3. Copy each user's UUID, then run these UPDATE statements:
--
--  UPDATE profiles SET
--    username = 'elena',
--    first_name = 'Elena',
--    last_name = 'Voss',
--    bio = 'Platform editor-in-chief.',
--    role = 'administrator',
--    verified = true
--  WHERE id = '<ADMIN_UUID_HERE>';
--
--  UPDATE profiles SET
--    username = 'morgan',
--    first_name = 'Morgan',
--    last_name = 'Wells',
--    bio = 'Senior writer covering tech and design.',
--    role = 'editor',
--    verified = true
--  WHERE id = '<EDITOR_UUID_HERE>';
--
--  UPDATE profiles SET
--    username = 'sam',
--    first_name = 'Sam',
--    last_name = 'Park',
--    bio = 'Avid reader.',
--    role = 'viewer'
--  WHERE id = '<VIEWER_UUID_HERE>';
--
-- ════════════════════════════════════════════════════════════════════════════
