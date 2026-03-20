const slugifyLib = require("slugify");

/**
 * Generate a URL-safe slug from a string.
 * Appends a short random suffix to prevent collisions.
 */
const makeSlug = (str, withSuffix = true) => {
  const base = slugifyLib(str, { lower: true, strict: true, trim: true });
  if (!withSuffix) return base;
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
};

module.exports = { makeSlug };
