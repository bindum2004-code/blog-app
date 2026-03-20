const catchAsync = require("../utils/catchAsync");
const AppError   = require("../utils/AppError");

// ── Provider config (read from env at request time so hot-.env changes work) ──
const getProviderConfig = () => {
  const provider  = process.env.LLAMA_PROVIDER    || "groq";
  const apiKey    = process.env.LLAMA_API_KEY      || "";
  const ollamaUrl = process.env.OLLAMA_URL         || "http://localhost:11434";
  const customUrl = process.env.LLAMA_API_URL;
  const modelOvr  = process.env.LLAMA_MODEL;

  const DEFAULTS = {
    groq:   { url: "https://api.groq.com/openai/v1/chat/completions",             model: "llama-3.3-70b-versatile",                     format: "openai" },
    meta:   { url: "https://api.llama.com/v1/chat/completions",                   model: "Llama-3.3-70B-Instruct",                      format: "openai" },
    openai: { url: "https://api.together.xyz/v1/chat/completions",                model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",     format: "openai" },
    ollama: { url: `${ollamaUrl}/api/chat`,                                        model: "llama3.2",                                    format: "ollama" },
  };

  const base = DEFAULTS[provider] || DEFAULTS.groq;
  return {
    provider,
    apiKey,
    url:    customUrl || base.url,
    model:  modelOvr  || base.model,
    format: base.format,
    auth:   provider !== "ollama" ? `Bearer ${apiKey}` : null,
  };
};

// ── System prompt ─────────────────────────────────────────────────────────────
const buildSystemPrompt = (context = {}) => {
  const { posts = [], userInfo = "Guest (not signed in)" } = context;
  const postList = posts.slice(0, 10).map(p =>
    `• "${p.title}" by ${p.author || "Unknown"} — ${p.readTime || 1} min, ${p.likes || 0} likes, categories: ${p.categories || "none"}`
  ).join("\n") || "No published posts yet.";

  return `You are Inkwell Assistant — a warm, knowledgeable editorial AI embedded in the Inkwell blog platform.

PLATFORM: Independent publishing platform for long-form essays, criticism and original reporting.
ROLES: Viewer (read/comment), Editor (write posts), Administrator (full control).
CURRENT USER: ${userInfo}

PUBLISHED POSTS:
${postList}

INSTRUCTIONS:
- Respond warmly and concisely. 2-4 sentences for simple questions, 100 words max otherwise.
- Write in flowing prose, not bullet lists.
- Recommend posts from the list above when relevant. Never invent post titles.
- Help with writing craft, platform features, and content discovery.
- If you cannot help, say so gracefully and suggest an alternative.`;
};

// ── Body builders ─────────────────────────────────────────────────────────────
const buildBody = (cfg, systemPrompt, messages, stream) => {
  if (cfg.format === "ollama") {
    return { model: cfg.model, stream, messages: [{ role: "system", content: systemPrompt }, ...messages] };
  }
  return {
    model:       cfg.model,
    stream,
    max_tokens:  400,
    temperature: 0.72,
    messages:    [{ role: "system", content: systemPrompt }, ...messages],
  };
};

// ── Validate messages array ───────────────────────────────────────────────────
const validateMessages = (messages, next) => {
  if (!Array.isArray(messages) || messages.length === 0)
    return next(new AppError("messages array is required.", 400)), false;
  for (const m of messages) {
    if (!["user","assistant"].includes(m.role))
      return next(new AppError("Each message must have role 'user' or 'assistant'.", 400)), false;
    if (typeof m.content !== "string" || !m.content.trim())
      return next(new AppError("Each message must have non-empty string content.", 400)), false;
  }
  return true;
};

// ── GET /api/chat/config ──────────────────────────────────────────────────────
exports.getChatConfig = (_req, res) => {
  const cfg = getProviderConfig();
  res.json({
    success:  true,
    provider: cfg.provider,
    model:    cfg.model,
    ready:    cfg.provider === "ollama" ? true : !!cfg.apiKey,
  });
};

// ── POST /api/chat ────────────────────────────────────────────────────────────
exports.chat = catchAsync(async (req, res, next) => {
  const { messages, context = {} } = req.body;
  if (!validateMessages(messages, next)) return;

  const cfg = getProviderConfig();
  if (cfg.provider !== "ollama" && !cfg.apiKey) {
    return next(new AppError(
      "LLAMA_API_KEY is not set. Add it to your .env file and restart the server.", 500
    ));
  }

  const headers = { "Content-Type": "application/json" };
  if (cfg.auth) headers["Authorization"] = cfg.auth;

  const body = buildBody(cfg, buildSystemPrompt(context), messages, false);

  let response;
  try {
    response = await fetch(cfg.url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (err) {
    const hint = cfg.provider === "ollama"
      ? " Make sure Ollama is running: ollama serve"
      : "";
    return next(new AppError(`Cannot connect to ${cfg.provider} API.${hint}`, 502));
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[chat] ${cfg.provider} API ${response.status}:`, text.slice(0, 200));
    return next(new AppError(
      `${cfg.provider} API returned ${response.status}. Check your LLAMA_API_KEY.`, 502
    ));
  }

  const data = await response.json();
  const text = cfg.format === "ollama"
    ? (data.message?.content || data.response || "")
    : (data.choices?.[0]?.message?.content || "");

  if (!text) {
    console.error("[chat] Empty response:", JSON.stringify(data).slice(0, 300));
    return next(new AppError("The AI returned an empty response. Please try again.", 500));
  }

  res.json({ success: true, message: text, model: data.model || cfg.model, provider: cfg.provider });
});

// ── POST /api/chat/stream ─────────────────────────────────────────────────────
exports.chatStream = catchAsync(async (req, res, next) => {
  const { messages, context = {} } = req.body;
  if (!validateMessages(messages, next)) return;

  const cfg = getProviderConfig();
  if (cfg.provider !== "ollama" && !cfg.apiKey) {
    return next(new AppError("LLAMA_API_KEY is not configured on the server.", 500));
  }

  const headers = { "Content-Type": "application/json" };
  if (cfg.auth) headers["Authorization"] = cfg.auth;

  const body = buildBody(cfg, buildSystemPrompt(context), messages, true);

  let upstream;
  try {
    upstream = await fetch(cfg.url, { method: "POST", headers, body: JSON.stringify(body) });
  } catch (err) {
    const hint = cfg.provider === "ollama" ? " Is Ollama running? Try: ollama serve" : "";
    return next(new AppError(`Cannot connect to ${cfg.provider}.${hint}`, 502));
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    console.error(`[chat/stream] ${cfg.provider} ${upstream.status}:`, text.slice(0, 200));
    return next(new AppError(
      `${cfg.provider} API error ${upstream.status}. Check your LLAMA_API_KEY.`, 502
    ));
  }

  // Set Server-Sent Events headers
  res.setHeader("Content-Type",      "text/event-stream");
  res.setHeader("Cache-Control",     "no-cache, no-transform");
  res.setHeader("Connection",        "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (obj) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); };

  const reader  = upstream.body.getReader();
  const decoder = new TextDecoder();
  let   buf     = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";   // keep incomplete last line

      for (const line of lines) {
        const raw = line.trim();
        if (!raw) continue;

        if (cfg.format === "ollama") {
          // Ollama: one JSON object per line
          try {
            const obj = JSON.parse(raw);
            const token = obj.message?.content || "";
            if (token) send({ token });
            if (obj.done) { send({ done: true }); return; }
          } catch { /* partial line */ }
        } else {
          // OpenAI SSE format: "data: {...}" or "data: [DONE]"
          if (!raw.startsWith("data:")) continue;
          const payload = raw.slice(5).trim();
          if (payload === "[DONE]") { send({ done: true }); return; }
          try {
            const obj = JSON.parse(payload);
            const token = obj.choices?.[0]?.delta?.content || "";
            if (token) send({ token });
            if (obj.choices?.[0]?.finish_reason === "stop") { send({ done: true }); return; }
          } catch { /* partial JSON */ }
        }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("[chat/stream] error:", err.message);
      send({ error: "Stream interrupted. Please try again." });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
});
