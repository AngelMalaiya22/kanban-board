// Front end: fetches the board, draws it, and handles drag-and-drop.
const boardEl = document.getElementById("board");
const dialog = document.getElementById("dialog");
const form = document.getElementById("task-form");
const toast = document.getElementById("toast");
let state = { columns: [], tasks: [] };
let editingId = null;
let dragId = null;
let toastTimer;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Something went wrong.");
  return body;
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3500);
}

async function load() {
  state = await api("/api/board");
  render();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent keeps user input safe from XSS
  return node;
}

function render() {
  boardEl.replaceChildren();
  for (const col of state.columns) {
    const tasks = state.tasks.filter((t) => t.status === col.id);
    const section = el("section", "column");
    section.dataset.status = col.id;

    const head = el("div", "column-head");
    head.append(el("h2", "", col.title));
    const full = col.wip !== null && tasks.length >= col.wip;
    const count = col.wip !== null ? `${tasks.length} / ${col.wip}` : `${tasks.length}`;
    head.append(el("span", "count" + (full ? " full" : ""), count));
    section.append(head);

    const list = el("div", "list");
    list.dataset.status = col.id;
    if (tasks.length === 0) list.append(el("p", "empty", "Drop a task here"));
    tasks.forEach((t) => list.append(card(t)));
    wireDropZone(list);
    section.append(list);
    boardEl.append(section);
  }
  const done = state.tasks.filter((t) => t.status === "done").length;
  document.getElementById("summary").textContent =
    `${state.tasks.length} tasks, ${done} done`;
}

function card(task) {
  const c = el("article", `card p-${task.priority}`);
  c.draggable = true;
  c.dataset.id = task.id;
  c.tabIndex = 0;
  c.append(el("h3", "", task.title));
  if (task.description) c.append(el("p", "desc", task.description));
  const foot = el("div", "card-foot");
  foot.append(el("span", "badge", task.priority));
  const del = el("button", "icon-btn", "Delete");
  del.type = "button";
  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${task.title}"?`)) return;
    await api(`/api/tasks/${task.id}`, { method: "DELETE" });
    load();
  });
  foot.append(del);
  c.append(foot);

  c.addEventListener("click", () => openDialog(task));
  c.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openDialog(task);
  });
  c.addEventListener("dragstart", (e) => {
    dragId = task.id;
    c.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(task.id));
  });
  c.addEventListener("dragend", () => {
    c.classList.remove("dragging");
    document.querySelectorAll(".over").forEach((n) => n.classList.remove("over"));
  });
  return c;
}

// Works out where in the column the card is hovering, by comparing mouse Y to each card's midpoint.
function dropIndex(list, y) {
  const cards = [...list.querySelectorAll(".card:not(.dragging)")];
  let index = cards.length;
  for (let i = 0; i < cards.length; i++) {
    const box = cards[i].getBoundingClientRect();
    if (y < box.top + box.height / 2) { index = i; break; }
  }
  return index;
}

function wireDropZone(list) {
  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    list.classList.add("over");
  });
  list.addEventListener("dragleave", (e) => {
    if (!list.contains(e.relatedTarget)) list.classList.remove("over");
  });
  list.addEventListener("drop", async (e) => {
    e.preventDefault();
    list.classList.remove("over");
    if (dragId === null) return;
    try {
      await api(`/api/tasks/${dragId}/move`, {
        method: "POST",
        body: JSON.stringify({ status: list.dataset.status, index: dropIndex(list, e.clientY) }),
      });
    } catch (err) {
      showToast(err.message);
    }
    dragId = null;
    load();
  });
}

function openDialog(task = null) {
  editingId = task ? task.id : null;
  document.getElementById("dialog-title").textContent = task ? "Edit task" : "New task";
  document.getElementById("f-title").value = task ? task.title : "";
  document.getElementById("f-desc").value = task ? task.description : "";
  document.getElementById("f-priority").value = task ? task.priority : "medium";
  dialog.showModal();
  document.getElementById("f-title").focus();
}

document.getElementById("add-btn").addEventListener("click", () => openDialog());
document.getElementById("cancel").addEventListener("click", () => dialog.close());

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById("f-title").value,
    description: document.getElementById("f-desc").value,
    priority: document.getElementById("f-priority").value,
  };
  try {
    if (editingId) {
      await api(`/api/tasks/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      await api("/api/tasks", { method: "POST", body: JSON.stringify(payload) });
    }
    dialog.close();
    load();
  } catch (err) {
    showToast(err.message);
  }
});

load();
