const { supabaseAdmin } = require("../config/supabase");

const logAction = async (req, action, targetType, targetId, metadata = {}) => {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      action,
      user_id:     req.user?.id     || null,
      user_role:   req.user?.role   || null,
      target_type: targetType,
      target_id:   String(targetId),
      metadata,
      ip_address:  req.ip || req.headers["x-forwarded-for"] || null,
    });
  } catch (err) {
    // Never let audit failure crash a request
    console.error("Audit log error:", err.message);
  }
};

module.exports = { logAction };
