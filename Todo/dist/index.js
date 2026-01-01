// index.js (Personal OS / POS plugin)
// This rewrites your "todo-ui" plugin into the POS plugin format that your working plugin uses.
//
// ✅ POS expects ESM exports: `export const manifest`, `export async function mount`, `export function unmount`.
// ❌ Your published todo-ui used backendhub (Express router) format: module.exports + register({router}).
//
// This plugin renders the UI directly into the provided `container` (no routes served).
// It calls your backend API routes via fetch.
//
// It will auto-detect API prefix by probing (in this order):
//   1) /todo-supa/health
//   2) /api/health
// You can override by setting `host.env.TODO_API_PREFIX` to "/todo-supa" or "/api" (if your host provides env).
//
// Requirements on backend:
// - Routes (mounted at prefix):
//   GET    {prefix}/todos
//   POST   {prefix}/todos
//   PATCH  {prefix}/todos/:id
//   DELETE {prefix}/todos/:id
//   DELETE {prefix}/todos/completed
// - Optional:
//   GET    {prefix}/health
//
// Notes:
// - Uses x-client-id stored in localStorage to partition todos.
// - If your backend requires x-api-key, set host.env.TODO_API_KEY or edit DEFAULT_API_KEY below.

export const manifest = {
  id: "todo-ui",
  name: "To-Do",
  version: "1.1.2",
  icon: "✅"
};

const STATE_KEY = Symbol("todo_ui_state");

// Optional: hardcode an API key here if your backend expects it.
// Prefer host.env.TODO_API_KEY if available.
const DEFAULT_API_KEY = "";

export async function mount(container, host) {
  // Defensive: clean old content if remounted
  container.innerHTML = "";

  const state = {
    host,
    abort: new AbortController(),
    apiPrefix: null,
    todos: [],
    filter: "all"
  };
  container[STATE_KEY] = state;

  const apiKey = (host?.env?.TODO_API_KEY ?? DEFAULT_API_KEY ?? "").trim();
  const configuredPrefix = (host?.env?.TODO_API_PREFIX ?? "").trim(); // e.g. "/todo-supa" or "/api"

  // Root wrapper so our CSS is scoped and won't affect the whole POS UI
  const root = document.createElement("div");
  root.className = "todo-plugin";
  root.innerHTML = `
    <style>
      /* Scoped styles (based on your styles.css, but container-scoped) */
      .todo-plugin {
        --bg: #0b1220;
        --card: #101b33;
        --text: #e9eefc;
        --muted: #a8b3d6;
        --border: rgba(255,255,255,.10);
        --shadow: 0 10px 30px rgba(0,0,0,.35);

        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        color: var(--text);
        background: radial-gradient(1200px 800px at 20% 10%, #162858 0%, var(--bg) 60%);
        border-radius: 14px;
        padding: 18px;
      }
      .todo-plugin * { box-sizing: border-box; }

      .todo-plugin .app {
        max-width: 820px;
        margin: 0 auto;
        padding: 18px 8px 24px;
      }

      .todo-plugin .header { margin-bottom: 16px; }
      .todo-plugin .title { margin: 0; font-size: 34px; letter-spacing: -0.02em; }
      .todo-plugin .subtitle { margin: 8px 0 0; color: var(--muted); }

      .todo-plugin .card {
        /* Override host styles that make .card a row — keep plugin card stacked vertically */
        display: block;
        background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
        border: 1px solid var(--border);
        border-radius: 14px;
        box-shadow: var(--shadow);
        padding: 14px;
      }

      .todo-plugin .new-todo {
        display: flex;
        gap: 10px;
        margin-bottom: 12px;
        align-items: center;
        flex-wrap: wrap; /* keep form controls on a single row but wrap if very narrow */
      }

      .todo-plugin .new-todo__input {
        flex: 1 1 220px;
        padding: 12px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: rgba(255,255,255,.04);
        color: var(--text);
        outline: none;
      }

      .todo-plugin .todo-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 12px;
        padding: 0;
      }

      .todo-plugin .todo {
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 10px 10px;
        border: 1px solid var(--border);
        border-radius: 12px;
        margin: 0; /* spacing handled by parent gap */
        background: rgba(255,255,255,.03);
      }

      .todo-plugin .todo__check { width: 18px; height: 18px; cursor: pointer; }
      .todo-plugin .new-todo__input:focus { border-color: rgba(255,255,255,.24); }

      .todo-plugin .btn {
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
        background: rgba(255,255,255,.04);
        color: var(--text);
        cursor: pointer;
      }
      .todo-plugin .btn:hover { background: rgba(255,255,255,.07); }
      .todo-plugin .btn--primary {
        background: rgba(100, 160, 255, .25);
        border-color: rgba(100, 160, 255, .35);
      }
      .todo-plugin .btn--ghost { background: transparent; }

      .todo-plugin .banner {
        margin: 10px 0;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
      }
      .todo-plugin .banner--error {
        background: rgba(255, 80, 80, .13);
        border-color: rgba(255, 80, 80, .28);
      }

      .todo-plugin .todo-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .todo-plugin .todo {
        display: grid;
        grid-template-columns: 26px 1fr auto;
        gap: 10px;
        align-items: center;
        padding: 10px 10px;
        border: 1px solid var(--border);
        border-radius: 12px;
        margin: 8px 0;
        background: rgba(255,255,255,.03);
      }

      .todo-plugin .todo__check { width: 18px; height: 18px; cursor: pointer; }

      .todo-plugin .todo__text {
        padding: 6px 8px;
        border-radius: 10px;
        border: 1px solid transparent;
        word-break: break-word;
      }
      .todo-plugin .todo.is-done .todo__text {
        color: rgba(233, 238, 252, .55);
        text-decoration: line-through;
      }

      .todo-plugin .todo__actions { display: flex; gap: 8px; }
      .todo-plugin .icon-btn {
        border: 1px solid var(--border);
        background: rgba(255,255,255,.03);
        border-radius: 10px;
        padding: 8px 10px;
        cursor: pointer;
        color: var(--text);
      }
      .todo-plugin .icon-btn:hover { background: rgba(255,255,255,.08); }

      .todo-plugin .footer {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: space-between;
        align-items: center;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
      }
      .todo-plugin .footer__filters { display: flex; gap: 8px; }

      .todo-plugin .chip {
        border: 1px solid var(--border);
        background: rgba(255,255,255,.03);
        color: var(--text);
        border-radius: 999px;
        padding: 8px 10px;
        cursor: pointer;
      }
      .todo-plugin .chip.is-active {
        background: rgba(100, 160, 255, .25);
        border-color: rgba(100, 160, 255, .35);
      }

      .todo-plugin .hint {
        color: var(--muted);
        margin-top: 12px;
        font-size: 14px;
      }
      .todo-plugin kbd {
        padding: 2px 6px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(255,255,255,.04);
      }
    </style>

    <main class="app">
      <header class="header">
        <h1 class="title">To-Do</h1>
        <p class="subtitle">POS plugin • vanilla UI • backend routes only</p>
      </header>

      <section class="card">
        <form class="new-todo" autocomplete="off">
          <input
            class="new-todo__input"
            type="text"
            placeholder="Add a task…"
            maxlength="180"
            aria-label="New to-do"
            required
          />
          <button class="btn btn--primary" type="submit">Add</button>
        </form>

        <div class="banner banner--error" hidden></div>

        <ul class="todo-list" aria-label="To-do items"></ul>

        <footer class="footer">
          <div class="footer__left">
            <span class="items-left">0 items left</span>
          </div>

          <div class="footer__filters" role="group" aria-label="Filters">
            <button class="chip is-active" data-filter="all" type="button">All</button>
            <button class="chip" data-filter="active" type="button">Active</button>
            <button class="chip" data-filter="completed" type="button">Completed</button>
          </div>

          <div class="footer__right">
            <button class="btn btn--ghost clear-completed" type="button">Clear completed</button>
          </div>
        </footer>
      </section>

      <p class="hint">
        Tip: Double-click a task to edit. Press <kbd>Enter</kbd> to save, <kbd>Esc</kbd> to cancel.
      </p>
    </main>
  `;

  container.appendChild(root);

  // ---- DOM refs (scoped) ----
  const form = root.querySelector("form.new-todo");
  const input = root.querySelector("input.new-todo__input");
  const listEl = root.querySelector("ul.todo-list");
  const itemsLeftEl = root.querySelector(".items-left");
  const clearCompletedBtn = root.querySelector("button.clear-completed");
  const errorBanner = root.querySelector(".banner--error");
  const filterButtons = Array.from(root.querySelectorAll(".chip[data-filter]"));

  // ---- helpers ----
  const toast = (msg) => {
    if (host?.ui?.toast) host.ui.toast(msg);
  };

  const setError = (msg) => {
    if (!msg) {
      errorBanner.hidden = true;
      errorBanner.textContent = "";
      return;
    }
    errorBanner.hidden = false;
    errorBanner.textContent = msg;
  };

  const clientId = getOrCreateClientId();

  const buildHeaders = (extra = {}) => {
    const h = { ...extra, "x-client-id": clientId };
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  };

  const api = async (path, { method = "GET", body } = {}) => {

    const url = `${state.apiPrefix}${path}`;
    const init = {
      method,
      headers: buildHeaders({ "Content-Type": "application/json" }),
      signal: state.abort.signal
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(url, init);
    const isJson = (res.headers.get("content-type") || "").includes("application/json");
    const data = isJson ? await res.json().catch(() => null) : null;
    if (res.ok && data == null) throw new Error('Unexpected empty JSON response from API');

    if (!res.ok) {
      const msg = data?.error || `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  // Choose API prefix
  state.apiPrefix = await pickApiPrefix(configuredPrefix);

  // API calls
  const apiList = () => api(`/todos`);
  const apiCreate = (text) => api(`/todos`, { method: "POST", body: { text } });
  const apiPatch = (id, patch) => api(`/todos/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
  const apiDelete = (id) => api(`/todos/${encodeURIComponent(id)}`, { method: "DELETE" });
  const apiClearCompleted = () => api(`/todos/completed`, { method: "DELETE" });

  // ---- render ----
  const visibleTodos = () => {
    if (state.filter === "active") return state.todos.filter(t => !t.done);
    if (state.filter === "completed") return state.todos.filter(t => t.done);
    return state.todos.slice();
  };

  const updateItemsLeft = () => {
    const left = state.todos.filter(t => !t.done).length;
    itemsLeftEl.textContent = `${left} item${left === 1 ? "" : "s"} left`;
  };

  const replaceTodo = (updated) => {
    const idx = state.todos.findIndex(t => t.id === updated.id);
    if (idx >= 0) state.todos[idx] = updated;
  };

  const startEdit = (li, todo) => {
    const textEl = li.querySelector(".todo__text");
    const original = todo.text;

    const edit = document.createElement("input");
    edit.type = "text";
    edit.value = original;
    edit.maxLength = 180;
    edit.className = "new-todo__input";
    edit.style.padding = "8px 10px";

    textEl.replaceWith(edit);
    edit.focus();
    edit.setSelectionRange(original.length, original.length);

    let cancelled = false;
    let finished = false; // prevents duplicate cleanup/replaceWith calls

    const cleanup = () => {
      if (finished) return;
      finished = true;
      // If edit already detached, nothing to do
      if (!edit.isConnected) return;
      const restored = document.createElement("div");
      restored.className = "todo__text";
      restored.textContent = todo.text;
      restored.addEventListener("dblclick", () => startEdit(li, todo));
      try { edit.replaceWith(restored); } catch (e) { /* ignore if already removed */ }
    };

    edit.addEventListener("keydown", async (ev) => {
      if (ev.key === "Escape") {
        cancelled = true;
        todo.text = original;
        cleanup();
        render();
      }
      if (ev.key === "Enter") {
        const next = edit.value.trim();
        if (!next) {
          setError("Text cannot be empty.");
          return;
        }
        try {
          const { todo: updated } = await apiPatch(todo.id, { text: next });
          replaceTodo(updated);
          cleanup();
          render();
        } catch (e) {
          setError(e.message);
        }
      }
    });

    edit.addEventListener("blur", () => {
      if (cancelled || finished) return;
      // Don't auto-save on blur to avoid accidental edits
      todo.text = original;
      cleanup();
      render();
    });
  };

  const render = () => {
    setError(null);
    updateItemsLeft();

    // filter button states
    filterButtons.forEach(btn => {
      const isActive = btn.dataset.filter === state.filter;
      btn.classList.toggle("is-active", isActive);
    });

    listEl.innerHTML = "";
    const vt = visibleTodos();

    if (vt.length === 0) {
      const empty = document.createElement("li");
      empty.className = "hint";
      empty.textContent = state.filter === "all"
        ? "No tasks yet. Add one above."
        : "No tasks in this filter.";
      listEl.appendChild(empty);
      return;
    }

    vt.forEach(todo => {
      const li = document.createElement("li");
      li.className = "todo" + (todo.done ? " is-done" : "");
      li.dataset.id = todo.id;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "todo__check";
      cb.checked = !!todo.done;
      cb.addEventListener("change", async () => {
        try {
          const { todo: updated } = await apiPatch(todo.id, { done: cb.checked });
          replaceTodo(updated);
          render();
        } catch (e) {
          cb.checked = !cb.checked;
          setError(e.message);
        }
      });

      const text = document.createElement("div");
      text.className = "todo__text";
      text.textContent = todo.text;
      text.addEventListener("dblclick", () => startEdit(li, todo));

      const actions = document.createElement("div");
      actions.className = "todo__actions";

      const del = document.createElement("button");
      del.className = "icon-btn";
      del.type = "button";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        try {
          await apiDelete(todo.id);
          state.todos = state.todos.filter(t => t.id !== todo.id);
          render();
        } catch (e) {
          setError(e.message);
        }
      });

      actions.appendChild(del);
      li.appendChild(cb);
      li.appendChild(text);
      li.appendChild(actions);
      listEl.appendChild(li);
    });
  };

  // ---- events ----
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try {
      const data = await apiCreate(text);
      if (!data || !data.todo) throw new Error('Invalid API response: missing todo');
      const { todo } = data;
      state.todos.unshift(todo);
      render();
    } catch (e) {
      setError(e.message);
      toast(e.message);
    }
  });

  clearCompletedBtn.addEventListener("click", async () => {
    try {
      await apiClearCompleted();
      state.todos = state.todos.filter(t => !t.done);
      render();
    } catch (e) {
      setError(e.message);
      toast(e.message);
    }
  });

  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter || "all";
      render();
    });
  });

  // ---- init ----
  try {
    let data;
    try {
      data = await apiList();
    } catch (e) {
      if (e.message === 'Unexpected empty JSON response from API') {
        data = { todos: [] };
      } else {
        throw e;
      }
    }
    state.todos = data?.todos || [];
    render();
  } catch (e) {
    setError(e.message);
    toast(e.message);
  }

  // ---------------------- internal functions ----------------------

  async function pickApiPrefix(forcePrefix) {
    // If host provided an explicit prefix (e.g. "/todo-supa" or "/api"), use it.
    if (forcePrefix) {
      return normalizePrefix(forcePrefix);
    }

    // Try common prefixes. This makes the plugin work whether your API plugin is mounted at /todo-supa or /api.
    const candidates = ["/todo-supa", "/api"];

    for (const p of candidates) {
      const prefix = normalizePrefix(p);
      try {
        const res = await fetch(`${prefix}/health`, { method: "GET", signal: state.abort.signal });
        if (res.ok) return prefix;
      } catch (_) {
        // ignore and try next
      }
    }

    // Fallback: first candidate
    return normalizePrefix(candidates[0]);
  }

  function normalizePrefix(p) {
    // Ensure it starts with / and has no trailing /
    let s = String(p || "");
    if (!s.startsWith("/")) s = "/" + s;
    s = s.replace(/\/+$/, "");
    return s;
  }

  function getOrCreateClientId() {
    const key = "todo_client_id_v1";
    try {
      const existing = localStorage.getItem(key);
      if (existing) return existing;

      const id =
        (crypto && crypto.randomUUID && crypto.randomUUID()) ||
        ("c_" + Math.random().toString(16).slice(2) + Date.now().toString(16));

      localStorage.setItem(key, id);
      return id;
    } catch {
      // If localStorage is blocked, fall back to an in-memory id
      return ("c_" + Math.random().toString(16).slice(2) + Date.now().toString(16));
    }
  }
}

export function unmount(container) {
  const state = container?.[STATE_KEY];
  if (state?.abort) {
    try { state.abort.abort(); } catch {}
  }
  try { delete container[STATE_KEY]; } catch {}
  container.innerHTML = "";
}
