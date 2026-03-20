-- ════════════════════════════════════════════════════════════════════════════
--  Inkwell Blog Platform — Supabase PostgreSQL Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ════════════════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- for full-text search

-- ── Enum types ───────────────────────────────────────────────────────────────

CREATE TYPE user_role    AS ENUM ('viewer', 'editor', 'administrator');
CREATE TYPE user_status  AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE post_status  AS ENUM ('draft', 'pending_review', 'published', 'rejected', 'archived');
CREATE TYPE comment_status AS ENUM ('approved', 'pending', 'rejected');

-- ── profiles (extends auth.users) ────────────────────────────────────────────

CREATE TABLE profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT        NOT NULL UNIQUE,
  first_name    TEXT        NOT NULL DEFAULT '',
  last_name     TEXT        NOT NULL DEFAULT '',
  bio           TEXT        NOT NULL DEFAULT '',
  avatar_url    TEXT,
  website       TEXT,
  twitter       TEXT,
  role          user_role   NOT NULL DEFAULT 'viewer',
  account_status user_status NOT NULL DEFAULT 'active',
  verified      BOOLEAN     NOT NULL DEFAULT FALSE,
  follower_count INT        NOT NULL DEFAULT 0,
  following_count INT       NOT NULL DEFAULT 0,
  post_count    INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 30),
  CONSTRAINT username_chars  CHECK (username ~ '^[a-zA-Z0-9_]+$')
);

-- ── categories ───────────────────────────────────────────────────────────────

CREATE TABLE categories (
  id         SERIAL      PRIMARY KEY,
  name       TEXT        NOT NULL UNIQUE,
  slug       TEXT        NOT NULL UNIQUE,
  color      TEXT        NOT NULL DEFAULT '#c8b89a',
  description TEXT,
  post_count INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── tags ─────────────────────────────────────────────────────────────────────

CREATE TABLE tags (
  id         SERIAL PRIMARY KEY,
  name       TEXT   NOT NULL UNIQUE,
  slug       TEXT   NOT NULL UNIQUE,
  post_count INT    NOT NULL DEFAULT 0
);

-- ── posts ────────────────────────────────────────────────────────────────────

CREATE TABLE posts (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           TEXT        NOT NULL,
  slug            TEXT        NOT NULL UNIQUE,
  excerpt         TEXT,
  content         TEXT        NOT NULL DEFAULT '',
  author_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          post_status NOT NULL DEFAULT 'draft',
  featured        BOOLEAN     NOT NULL DEFAULT FALSE,
  featured_image  TEXT        NOT NULL DEFAULT 'default',
  read_time       INT         NOT NULL DEFAULT 1,
  views           INT         NOT NULL DEFAULT 0,
  like_count      INT         NOT NULL DEFAULT 0,
  comment_count   INT         NOT NULL DEFAULT 0,
  meta_title      TEXT,
  meta_desc       TEXT,
  scheduled_at    TIMESTAMPTZ,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- full-text search vector (auto-updated by trigger)
  search_vector   TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(content,'')), 'C')
  ) STORED
);

CREATE INDEX posts_search_idx   ON posts USING GIN(search_vector);
CREATE INDEX posts_status_idx   ON posts(status);
CREATE INDEX posts_author_idx   ON posts(author_id);
CREATE INDEX posts_published_idx ON posts(published_at DESC NULLS LAST) WHERE status = 'published';

-- ── post_categories (junction) ───────────────────────────────────────────────

CREATE TABLE post_categories (
  post_id     UUID    NOT NULL REFERENCES posts(id)      ON DELETE CASCADE,
  category_id INT     NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

-- ── post_tags (junction) ─────────────────────────────────────────────────────

CREATE TABLE post_tags (
  post_id UUID    NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INT     NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- ── post_likes ────────────────────────────────────────────────────────────────

CREATE TABLE post_likes (
  post_id    UUID NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- ── bookmarks ────────────────────────────────────────────────────────────────

CREATE TABLE bookmarks (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id    UUID NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- ── follows ───────────────────────────────────────────────────────────────────

CREATE TABLE follows (
  follower_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

-- ── comments ─────────────────────────────────────────────────────────────────

CREATE TABLE comments (
  id         UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id    UUID           NOT NULL REFERENCES posts(id)    ON DELETE CASCADE,
  author_id  UUID           NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT           NOT NULL,
  parent_id  UUID           REFERENCES comments(id) ON DELETE CASCADE,
  status     comment_status NOT NULL DEFAULT 'approved',
  like_count INT            NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX comments_post_idx    ON comments(post_id);
CREATE INDEX comments_author_idx  ON comments(author_id);
CREATE INDEX comments_parent_idx  ON comments(parent_id);

-- ── comment_likes ─────────────────────────────────────────────────────────────

CREATE TABLE comment_likes (
  comment_id UUID NOT NULL REFERENCES comments(id)  ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

-- ── audit_logs ────────────────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  action      TEXT        NOT NULL,
  user_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  user_role   user_role,
  target_type TEXT,
  target_id   TEXT,
  metadata    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_user_idx   ON audit_logs(user_id);
CREATE INDEX audit_logs_action_idx ON audit_logs(action);
CREATE INDEX audit_logs_time_idx   ON audit_logs(created_at DESC);

-- ── site_settings ─────────────────────────────────────────────────────────────

CREATE TABLE site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════════════
--  TRIGGERS
-- ════════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at columns
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at  BEFORE UPDATE ON profiles  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER posts_updated_at     BEFORE UPDATE ON posts     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER comments_updated_at  BEFORE UPDATE ON comments  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Create profile automatically when a Supabase Auth user registers
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, username, first_name, last_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- Maintain like_count on posts
CREATE OR REPLACE FUNCTION sync_post_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER post_likes_sync AFTER INSERT OR DELETE ON post_likes
  FOR EACH ROW EXECUTE FUNCTION sync_post_like_count();

-- Maintain comment_count on posts
CREATE OR REPLACE FUNCTION sync_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER comments_sync AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION sync_post_comment_count();

-- Maintain like_count on comments
CREATE OR REPLACE FUNCTION sync_comment_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET like_count = like_count + 1 WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER comment_likes_sync AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW EXECUTE FUNCTION sync_comment_like_count();

-- Maintain follower/following counts
CREATE OR REPLACE FUNCTION sync_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE profiles SET follower_count  = follower_count  + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE profiles SET follower_count  = GREATEST(follower_count  - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER follows_sync AFTER INSERT OR DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION sync_follow_counts();

-- Maintain post_count on profiles
CREATE OR REPLACE FUNCTION sync_profile_post_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'published' THEN
    UPDATE profiles SET post_count = post_count + 1 WHERE id = NEW.author_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'published' AND NEW.status = 'published' THEN
      UPDATE profiles SET post_count = post_count + 1 WHERE id = NEW.author_id;
    ELSIF OLD.status = 'published' AND NEW.status != 'published' THEN
      UPDATE profiles SET post_count = GREATEST(post_count - 1, 0) WHERE id = NEW.author_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
    UPDATE profiles SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.author_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER posts_profile_count AFTER INSERT OR UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION sync_profile_post_count();

-- ════════════════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_tags      ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings  ENABLE ROW LEVEL SECURITY;

-- Helper: check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'administrator'
  );
$$;

-- Helper: check if current user is editor or admin
CREATE OR REPLACE FUNCTION is_editor_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('editor','administrator')
  );
$$;

-- profiles
CREATE POLICY "Profiles are publicly readable"        ON profiles FOR SELECT USING (TRUE);
CREATE POLICY "Users can update own profile"          ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile"         ON profiles FOR UPDATE USING (is_admin());

-- posts
CREATE POLICY "Published posts are public"            ON posts FOR SELECT USING (status = 'published' OR auth.uid() = author_id OR is_admin());
CREATE POLICY "Editors can insert posts"              ON posts FOR INSERT WITH CHECK (is_editor_or_admin() AND auth.uid() = author_id);
CREATE POLICY "Authors can update own posts"          ON posts FOR UPDATE USING (auth.uid() = author_id OR is_admin());
CREATE POLICY "Authors can delete own posts"          ON posts FOR DELETE USING (auth.uid() = author_id OR is_admin());

-- comments
CREATE POLICY "Approved comments are public"          ON comments FOR SELECT USING (status = 'approved' OR auth.uid() = author_id OR is_admin());
CREATE POLICY "Authenticated users can comment"       ON comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = author_id);
CREATE POLICY "Authors can update own comments"       ON comments FOR UPDATE USING (auth.uid() = author_id OR is_admin());
CREATE POLICY "Authors can delete own comments"       ON comments FOR DELETE USING (auth.uid() = author_id OR is_admin());

-- post_likes
CREATE POLICY "Likes are public"                      ON post_likes FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated users can like"          ON post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike own likes"            ON post_likes FOR DELETE USING (auth.uid() = user_id);

-- bookmarks
CREATE POLICY "Users see own bookmarks"               ON bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can bookmark"                    ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove bookmark"             ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- follows
CREATE POLICY "Follows are public"                    ON follows FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated users can follow"        ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow"                    ON follows FOR DELETE USING (auth.uid() = follower_id);

-- comment_likes
CREATE POLICY "Comment likes are public"              ON comment_likes FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated users can like comments" ON comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike comments"             ON comment_likes FOR DELETE USING (auth.uid() = user_id);

-- post_categories / post_tags (public read, editors can write)
CREATE POLICY "Post categories are public"            ON post_categories FOR SELECT USING (TRUE);
CREATE POLICY "Editors manage post categories"        ON post_categories FOR ALL USING (is_editor_or_admin());

CREATE POLICY "Post tags are public"                  ON post_tags FOR SELECT USING (TRUE);
CREATE POLICY "Editors manage post tags"              ON post_tags FOR ALL USING (is_editor_or_admin());

-- categories / tags (public read, admin write)
CREATE POLICY "Categories are public"                 ON categories FOR SELECT USING (TRUE);
CREATE POLICY "Admins manage categories"              ON categories FOR ALL USING (is_admin());

CREATE POLICY "Tags are public"                       ON tags FOR SELECT USING (TRUE);
CREATE POLICY "Editors manage tags"                   ON tags FOR ALL USING (is_editor_or_admin());

-- audit_logs
CREATE POLICY "Admins can read audit logs"            ON audit_logs FOR SELECT USING (is_admin());
CREATE POLICY "System can insert audit logs"          ON audit_logs FOR INSERT WITH CHECK (TRUE);

-- site_settings
CREATE POLICY "Settings are public readable"          ON site_settings FOR SELECT USING (TRUE);
CREATE POLICY "Admins can manage settings"            ON site_settings FOR ALL USING (is_admin());
