// Ask page: anonymous messages with public/private answers.
// All user text is inserted with textContent, never as HTML.
(function () {
  const root = document.getElementById("ask");
  if (!root) return;
  const API = root.dataset.api.replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);
  const ADMIN_KEY = "ask-admin-token";

  // ---- tiny helpers ----
  async function api(path, { method = "GET", body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = "Bearer " + token;
    const res = await fetch(API + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Something went wrong (" + res.status + ")");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  function storage(fn) {
    try { return fn(window.sessionStorage); } catch (e) { return null; }
  }

  // A Q&A card. opts.locked shows only the lock line.
  function card(post, opts) {
    opts = opts || {};
    const c = el("article", "ask-card" + (post.visibility === "private" ? " is-private" : ""));
    const meta = el("div", "ask-meta");
    meta.append(el("span", "ask-badge", post.visibility === "private" ? "🔒 Private" : "Public"));
    meta.append(el("span", null, fmtDate(post.created_at)));
    c.append(meta);

    if (opts.locked) {
      c.append(el("p", "ask-muted", "A private message. Open it with its code above."));
      return c;
    }
    c.append(el("p", "ask-q", post.body));
    if (post.answer) {
      const a = el("div", "ask-a");
      a.append(el("span", "ask-a-label", "Answer · " + fmtDate(post.answered_at)));
      a.append(el("p", null, post.answer));
      c.append(a);
    } else if (!opts.admin) {
      c.append(el("p", "ask-muted ask-pending", "Not answered yet. Check back later."));
    }
    return c;
  }

  // ---- send ----
  const form = $("ask-form");
  const bodyInput = $("ask-body");
  bodyInput.addEventListener("input", () => {
    $("ask-count").textContent = bodyInput.value.length + " / 2000";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = $("ask-status");
    const body = bodyInput.value.trim();
    if (!body) { status.textContent = "Write something first."; return; }
    const btn = $("ask-send");
    btn.disabled = true;
    status.textContent = "Sending…";
    try {
      const data = await api("/api/posts", {
        method: "POST",
        body: {
          body: body,
          visibility: form.elements.visibility.value,
          website: form.elements.website.value,
        },
      });
      form.reset();
      $("ask-count").textContent = "0 / 2000";
      status.textContent = "";
      $("ask-code").textContent = data.code;
      $("ask-code-box").hidden = false;
      $("ask-code-box").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (err) {
      status.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $("ask-copy").addEventListener("click", async () => {
    const code = $("ask-code").textContent;
    try {
      await navigator.clipboard.writeText(code);
      $("ask-copy").textContent = "Copied";
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents($("ask-code"));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  // ---- lookup by code ----
  $("ask-lookup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("ask-lookup-result");
    out.replaceChildren(el("p", "ask-muted", "Looking…"));
    try {
      const data = await api("/api/lookup", { method: "POST", body: { code: $("ask-lookup-code").value } });
      out.replaceChildren(card(data.post));
    } catch (err) {
      out.replaceChildren(el("p", "ask-muted", err.status === 404 ? "No message with that code." : err.message));
    }
  });

  // ---- board ----
  async function loadBoard() {
    const board = $("ask-board");
    try {
      const data = await api("/api/posts");
      if (!data.posts.length) {
        board.replaceChildren(el("p", "ask-muted", "Nothing here yet. Be the first to ask."));
        return;
      }
      board.replaceChildren(...data.posts.map((p) => card(p, { locked: p.visibility === "private" })));
    } catch (err) {
      board.replaceChildren(el("p", "ask-muted", "Couldn't load the board right now."));
    }
  }
  loadBoard();

  // ---- admin (/ask/#admin) ----
  function adminCard(post, token) {
    const c = card(post, { admin: true });
    c.classList.add("is-admin");
    if (!post.answer) c.classList.add("is-pending");

    const ta = el("textarea", "ask-answer-input");
    ta.rows = 3;
    ta.maxLength = 5000;
    ta.placeholder = "Write an answer… (empty = unpublish)";
    ta.value = post.answer || "";

    const row = el("div", "ask-row");
    const save = el("button", "ask-btn", post.answer ? "Update" : "Answer");
    save.type = "button";
    const del = el("button", "ask-btn ask-btn-quiet", "Delete");
    del.type = "button";
    const msg = el("span", "ask-muted");
    row.append(save, del, msg);

    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await api("/api/admin/posts/" + post.id, { method: "PUT", body: { answer: ta.value }, token: token });
        await loadInbox(token);
        loadBoard();
      } catch (err) {
        msg.textContent = err.message;
        save.disabled = false;
      }
    });
    del.addEventListener("click", async () => {
      if (!confirm("Delete this message for good?")) return;
      try {
        await api("/api/admin/posts/" + post.id, { method: "DELETE", token: token });
        await loadInbox(token);
        loadBoard();
      } catch (err) {
        msg.textContent = err.message;
      }
    });

    c.append(ta, row);
    return c;
  }

  async function loadInbox(token) {
    const status = $("ask-admin-status");
    const data = await api("/api/admin/posts", { token: token });
    const pending = data.posts.filter((p) => !p.answer).length;
    status.textContent = data.posts.length + " messages · " + pending + " waiting";
    $("ask-inbox").replaceChildren(...data.posts.map((p) => adminCard(p, token)));
  }

  async function adminLogin(token) {
    const status = $("ask-admin-status");
    try {
      await loadInbox(token);
      storage((s) => s.setItem(ADMIN_KEY, token));
      $("ask-admin-login").hidden = true;
    } catch (err) {
      storage((s) => s.removeItem(ADMIN_KEY));
      $("ask-admin-login").hidden = false;
      status.textContent = err.message;
    }
  }

  function maybeShowAdmin() {
    if (location.hash !== "#admin") return;
    $("ask-admin").hidden = false;
    const saved = storage((s) => s.getItem(ADMIN_KEY));
    if (saved) adminLogin(saved);
    $("ask-admin").scrollIntoView({ block: "start" });
  }

  $("ask-admin-login").addEventListener("submit", (e) => {
    e.preventDefault();
    adminLogin($("ask-admin-pw").value);
    $("ask-admin-pw").value = "";
  });

  window.addEventListener("hashchange", maybeShowAdmin);
  maybeShowAdmin();
})();
