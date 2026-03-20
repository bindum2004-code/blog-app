-- ════════════════════════════════════════════════════════════════════════════
--  Migration 004: Fix search_vector if GENERATED ALWAYS AS is not supported
--  Run this ONLY if you got errors running 001_schema.sql
--  This replaces the generated column with a trigger-updated one
-- ════════════════════════════════════════════════════════════════════════════

-- Drop the generated column if it exists
ALTER TABLE posts DROP COLUMN IF EXISTS search_vector;

-- Add as a regular column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

-- Update existing rows
UPDATE posts SET search_vector =
  setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
  setweight(to_tsvector('english', coalesce(excerpt,'')), 'B') ||
  setweight(to_tsvector('english', coalesce(content,'')), 'C');

-- Create trigger to keep it updated
CREATE OR REPLACE FUNCTION update_post_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.excerpt,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.content,'')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_search_vector_update ON posts;
CREATE TRIGGER post_search_vector_update
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION update_post_search_vector();

-- Recreate the GIN index
DROP INDEX IF EXISTS posts_search_idx;
CREATE INDEX posts_search_idx ON posts USING GIN(search_vector);
