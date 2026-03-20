require("dotenv").config();

const express     = require("express");
const helmet      = require("helmet");
const cors        = require("cors");
const compression = require("compression");
const morgan      = require("morgan");

const errorHandler      = require("./middleware/errorHandler");
const { globalLimiter } = require("./middleware/rateLimiter");

const authRoutes      = require("./routes/authRoutes");
const postRoutes      = require("./routes/postRoutes");
const commentRoutes   = require("./routes/commentRoutes");
const userRoutes      = require("./routes/userRoutes");
const adminRoutes     = require("./routes/adminRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const categoryRoutes  = require("./routes/categoryRoutes");
const uploadRoutes    = require("./routes/uploadRoutes");
const chatRoutes      = require("./routes/chatRoutes");

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin:         process.env.FRONTEND_URL || "http://localhost:3000",
  credentials:    true,
  methods:        ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.set("trust proxy", 1);
app.use(globalLimiter);

// ── Parsing + utilities ───────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
if (process.env.NODE_ENV !== "test") app.use(morgan("dev"));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ status: "ok", env: process.env.NODE_ENV, timestamp: new Date().toISOString() })
);

// ── Debug endpoints (development only) ───────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.get("/debug/db", async (_req, res) => {
    try {
      const { supabaseAdmin } = require("./config/supabase");
      const { data, error } = await supabaseAdmin
        .from("posts").select("id, title, status").limit(5);
      if (error) return res.json({ ok: false, error: error.message, code: error.code });
      res.json({ ok: true, count: data?.length, sample: data });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  app.get("/debug/categories", async (_req, res) => {
    try {
      const { supabaseAdmin } = require("./config/supabase");
      const { data, error } = await supabaseAdmin.from("categories").select("*");
      if (error) return res.json({ ok: false, error: error.message });
      res.json({ ok: true, data });
    } catch (err) {
      res.json({ ok: false, error: err.message });
    }
  });

  app.get("/debug/config", (_req, res) => {
    res.json({
      ok:           true,
      supabase_url: process.env.SUPABASE_URL ? "set" : "MISSING",
      anon_key:     process.env.SUPABASE_ANON_KEY ? "set" : "MISSING",
      service_key:  process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING",
      llama_provider: process.env.LLAMA_PROVIDER || "groq (default)",
      llama_key:    process.env.LLAMA_API_KEY ? "set" : "NOT SET",
      frontend_url: process.env.FRONTEND_URL || "http://localhost:3000 (default)",
    });
  });
}

// ── API routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",       authRoutes);
app.use("/api/posts",      postRoutes);
app.use("/api/comments",   commentRoutes);
app.use("/api/users",      userRoutes);
app.use("/api/admin",      adminRoutes);
app.use("/api/analytics",  analyticsRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/upload",     uploadRoutes);
app.use("/api/chat",       chatRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.all("*", (req, res) =>
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found.` })
);

// ── Error handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;

const server = app.listen(PORT, () => {
  console.log(`\n🖋  Inkwell API running on port ${PORT}`);
  console.log(`   Environment  : ${process.env.NODE_ENV || "development"}`);
  console.log(`   Supabase URL : ${process.env.SUPABASE_URL ? process.env.SUPABASE_URL.slice(0, 40) + "…" : "NOT SET ⚠"}`);
  console.log(`   LLaMA        : ${process.env.LLAMA_PROVIDER || "groq"} / ${process.env.LLAMA_API_KEY ? "key set" : "no key"}\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌  Port ${PORT} is already in use.`);
    console.error(`   Another server instance is still running.\n`);
    console.error(`   TO FIX ON WINDOWS — run this in PowerShell as Administrator:`);
    console.error(`   netstat -ano | findstr :${PORT}`);
    console.error(`   taskkill /PID <the_number_shown> /F\n`);
    console.error(`   OR kill all node processes at once:`);
    console.error(`   taskkill /IM node.exe /F\n`);
    console.error(`   OR use a different port:`);
    console.error(`   set PORT=4001 && npm start\n`);
    process.exit(1);
  } else {
    throw err;
  }
});

module.exports = app;
