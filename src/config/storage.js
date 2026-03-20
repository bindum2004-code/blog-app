const { supabaseAdmin } = require("./supabase");

const BUCKET = "inkwell-media";

/**
 * Upload a file buffer to Supabase Storage.
 * Returns the public URL on success.
 */
const uploadFile = async (userId, filename, buffer, mimetype) => {
  const ext   = filename.split(".").pop();
  const path  = `${userId}/${Date.now()}.${ext}`;

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimetype, upsert: false });

  if (error) throw error;

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
};

/**
 * Delete a file from Supabase Storage by its public URL.
 */
const deleteFile = async (publicUrl) => {
  const url  = new URL(publicUrl);
  const path = url.pathname.split(`/object/public/${BUCKET}/`)[1];
  if (!path) return;

  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([path]);
  if (error) throw error;
};

module.exports = { uploadFile, deleteFile, BUCKET };
