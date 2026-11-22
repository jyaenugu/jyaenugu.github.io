// Anonymous message board API for the blog's Ask page.
//
// Every message gets a random code that only the sender sees. Messages stay
// hidden until answered; then public ones are listed in full, private ones
// only as a lock, openable with the code. The admin (ADMIN_TOKEN secret)
// reads everything and answers from the same page (/ask/#admin).

const MAX_BODY = 2000;
const MAX_ANSWER = 5000;
const SEND_LIMIT_PER_HOUR = 5;
const ADMIN_FAIL_LIMIT_PER_HOUR = 10;
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    try {
      const res = await route(request, env, ctx);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, err.status, cors);
      }
      console.error(err);
      return json({ error: "server error" }, 500, cors);
    }
  },
};

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;

  if (path === "/api/posts" && method === "GET") return listAnswered(env);
  if (path === "/api/posts" && method === "POST") return createPost(request, env, ctx);
  if (path === "/api/lookup" && method === "POST") return lookup(request, env);

  if (path.startsWith("/api/admin/")) {
    await requireAdmin(request, env);
    if (path === "/api/admin/posts" && method === "GET") return adminList(env);
    const m = path.match(/^\/api\/admin\/posts\/(\d+)$/);
    if (m && method === "PUT") return adminAnswer(request, env, Number(m[1]));
    if (m && method === "DELETE") return adminDelete(env, Number(m[1]));
  }

  throw new HttpError(404, "not found");
}

// ---- public ----

async function listAnswered(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, visibility, body, answer, created_at, answered_at
       FROM messages WHERE answer IS NOT NULL
      ORDER BY answered_at DESC LIMIT 300`
  ).all();
  const posts = results.map((r) =>
    r.visibility === "public"
      ? r
      : { id: r.id, visibility: "private", created_at: r.created_at, answered_at: r.answered_at }
  );
  return json({ posts });
}

async function createPost(request, env, ctx) {
  const data = await readJson(request);
  // Honeypot: real visitors never see or fill this field.
  if (data.website) return json({ code: makeCode() }, 201);

  const body = String(data.body ?? "").trim();
  const visibility = data.visibility === "private" ? "private" : "public";
  if (!body) throw new HttpError(400, "empty message");
  if (body.length > MAX_BODY) throw new HttpError(400, "message too long");

  await rateLimit(request, env, "send", SEND_LIMIT_PER_HOUR);

  const code = makeCode();
  await env.DB.prepare(
    `INSERT INTO messages (body, visibility, code_hash, created_at) VALUES (?, ?, ?, ?)`
  )
    .bind(body, visibility, await sha256(normalizeCode(code)), nowIso())
    .run();
  ctx.waitUntil(notifyNewMessage(env, body, visibility));
  return json({ code }, 201);
}

async function lookup(request, env) {
  const data = await readJson(request);
  const code = normalizeCode(String(data.code ?? ""));
  if (code.length < 8) throw new HttpError(404, "no message with that code");
  const row = await env.DB.prepare(
    `SELECT id, visibility, body, answer, created_at, answered_at
       FROM messages WHERE code_hash = ?`
  )
    .bind(await sha256(code))
    .first();
  if (!row) throw new HttpError(404, "no message with that code");
  return json({ post: row });
}

// Emails the owner about a new message via Resend. Needs the RESEND_API_KEY
// and NOTIFY_EMAIL secrets; without them it quietly does nothing. Failures
// are logged only, so sending a message never breaks because of email.
async function notifyNewMessage(env, body, visibility) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return;
  const preview = body.length > 500 ? body.slice(0, 500) + '…' : body;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ask board <onboarding@resend.dev>',
        to: [env.NOTIFY_EMAIL],
        subject: 'New ' + visibility + ' message on Ask',
        text: preview + "\n\n— Answer it at " + (env.ADMIN_URL || "https://jyaenugu.github.io/ask/#admin"),
      }),
    });
    if (!res.ok) console.error('resend failed', res.status, await res.text());
  } catch (err) {
    console.error('resend error', err);
  }
}

// ---- admin ----

async function requireAdmin(request, env) {
  const given = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const ok =
    env.ADMIN_TOKEN &&
    given &&
    crypto.subtle.timingSafeEqual(
      new Uint8Array(await sha256Bytes(given)),
      new Uint8Array(await sha256Bytes(env.ADMIN_TOKEN))
    );
  if (!ok) {
    await rateLimit(request, env, "admin-fail", ADMIN_FAIL_LIMIT_PER_HOUR);
    throw new HttpError(401, "wrong password");
  }
}

async function adminList(env) {
  const { results } = await env.DB.prepare(
    `SELECT id, visibility, body, answer, created_at, answered_at
       FROM messages ORDER BY (answer IS NOT NULL), created_at DESC LIMIT 500`
  ).all();
  return json({ posts: results });
}

async function adminAnswer(request, env, id) {
  const data = await readJson(request);
  const answer = String(data.answer ?? "").trim();
  if (answer.length > MAX_ANSWER) throw new HttpError(400, "answer too long");
  const res = await env.DB.prepare(
    `UPDATE messages SET answer = ?, answered_at = ? WHERE id = ?`
  )
    .bind(answer || null, answer ? nowIso() : null, id)
    .run();
  if (!res.meta.changes) throw new HttpError(404, "not found");
  return json({ ok: true });
}

async function adminDelete(env, id) {
  const res = await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(id).run();
  if (!res.meta.changes) throw new HttpError(404, "not found");
  return json({ ok: true });
}

// ---- helpers ----

// Counts events per visitor per hour. The visitor key is a salted hash of the
// IP and the day, so raw IPs are never stored and rows are purged after a day.
async function rateLimit(request, env, kind, limit) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const key = await sha256(`${kind}|${day}|${ip}|${env.ADMIN_TOKEN || ""}`);
  const now = Date.now();
  await env.DB.prepare(`DELETE FROM rate_limits WHERE ts < ?`).bind(now - 86400000).run();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND ts > ?`
  )
    .bind(key, now - 3600000)
    .first();
  if (row.n >= limit) throw new HttpError(429, "too many tries, please wait a bit");
  await env.DB.prepare(`INSERT INTO rate_limits (key, ts) VALUES (?, ?)`).bind(key, now).run();
}

function makeCode() {
  // 12 chars from a 31-letter alphabet ≈ 59 bits, shown as xxxx-xxxx-xxxx.
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = "";
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

function normalizeCode(code) {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function sha256Bytes(text) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

async function sha256(text) {
  return [...new Uint8Array(await sha256Bytes(text))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function nowIso() {
  return new Date().toISOString();
}

async function readJson(request) {
  try {
    return (await request.json()) ?? {};
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
  return allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
