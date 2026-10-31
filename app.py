"""Kanban board: Flask + SQLAlchemy.
Uses SQLite locally and PostgreSQL on Render (via the DATABASE_URL env var)."""
import os
from datetime import datetime, timezone

from flask import Flask, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

db_url = os.environ.get("DATABASE_URL", "sqlite:///kanban.db")
if db_url.startswith("postgres://"):  # older URL style -> SQLAlchemy needs postgresql://
    db_url = db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

# Board layout lives on the server so the WIP rule cannot be bypassed from the browser.
COLUMNS = [
    {"id": "todo", "title": "To do", "wip": None},
    {"id": "doing", "title": "In progress", "wip": 3},
    {"id": "review", "title": "Review", "wip": None},
    {"id": "done", "title": "Done", "wip": None},
]
COLUMN_IDS = {c["id"] for c in COLUMNS}
WIP = {c["id"]: c["wip"] for c in COLUMNS}
PRIORITIES = {"low", "medium", "high"}


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(500), default="")
    priority = db.Column(db.String(10), default="medium")
    status = db.Column(db.String(10), default="todo", index=True)
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description or "",
            "priority": self.priority,
            "status": self.status,
            "position": self.position,
        }


with app.app_context():
    db.create_all()


def error(message, code=400):
    return jsonify({"error": message}), code


def column_tasks(status, exclude_id=None):
    q = Task.query.filter(Task.status == status)
    if exclude_id is not None:
        q = q.filter(Task.id != exclude_id)
    return q.order_by(Task.position, Task.id).all()


def renumber(tasks):
    for i, t in enumerate(tasks):
        t.position = i


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/board")
def get_board():
    tasks = Task.query.order_by(Task.position, Task.id).all()
    return jsonify({"columns": COLUMNS, "tasks": [t.to_dict() for t in tasks]})


@app.post("/api/tasks")
def create_task():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    priority = data.get("priority", "medium")
    if not title:
        return error("Title is required.")
    if len(title) > 120:
        return error("Title must be 120 characters or fewer.")
    if priority not in PRIORITIES:
        return error("Priority must be low, medium or high.")

    # New tasks go to the bottom of "To do".
    task = Task(
        title=title,
        description=(data.get("description") or "").strip()[:500],
        priority=priority,
        status="todo",
        position=len(column_tasks("todo")),
    )
    db.session.add(task)
    db.session.commit()
    return jsonify(task.to_dict()), 201


@app.put("/api/tasks/<int:task_id>")
def update_task(task_id):
    task = db.get_or_404(Task, task_id)
    data = request.get_json(silent=True) or {}
    if "title" in data:
        title = (data["title"] or "").strip()
        if not title or len(title) > 120:
            return error("Title must be 1-120 characters.")
        task.title = title
    if "description" in data:
        task.description = (data["description"] or "").strip()[:500]
    if "priority" in data:
        if data["priority"] not in PRIORITIES:
            return error("Priority must be low, medium or high.")
        task.priority = data["priority"]
    db.session.commit()
    return jsonify(task.to_dict())


@app.post("/api/tasks/<int:task_id>/move")
def move_task(task_id):
    task = db.get_or_404(Task, task_id)
    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    try:
        index = int(data.get("index", 0))
    except (TypeError, ValueError):
        return error("Index must be a number.")
    if new_status not in COLUMN_IDS:
        return error("Unknown column.")

    old_status = task.status
    target = column_tasks(new_status, exclude_id=task.id)

    limit = WIP[new_status]
    if limit is not None and new_status != old_status and len(target) >= limit:
        return error(f"WIP limit reached: '{new_status}' allows {limit} tasks.", 409)

    index = max(0, min(index, len(target)))
    task.status = new_status
    target.insert(index, task)
    renumber(target)
    if old_status != new_status:
        renumber(column_tasks(old_status, exclude_id=task.id))
    db.session.commit()
    return jsonify(task.to_dict())


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    task = db.get_or_404(Task, task_id)
    status = task.status
    db.session.delete(task)
    db.session.flush()
    renumber(column_tasks(status))
    db.session.commit()
    return "", 204


if __name__ == "__main__":
    app.run(debug=True)
