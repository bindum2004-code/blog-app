-- ════════════════════════════════════════════════════════════════════════════
--  Inkwell — Supabase Storage Setup
--  Run this AFTER creating the storage bucket named 'inkwell-media'
--  in: Supabase Dashboard → Storage → New bucket (set to public)
-- ════════════════════════════════════════════════════════════════════════════

-- Allow public read of all media
CREATE POLICY "Public can view media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'inkwell-media');

-- Authenticated editors/admins can upload
CREATE POLICY "Editors can upload media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'inkwell-media' AND
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('editor', 'administrator')
    )
  );

-- Users can delete only their own files (file path starts with their user id)
CREATE POLICY "Users can delete own media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'inkwell-media' AND
    (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'administrator')
    )
  );
