# Kanban Board

A drag-and-drop Kanban board built with Flask, SQLAlchemy and vanilla JavaScript.

## Features
- Four columns: To do, In progress, Review, Done
- Drag and drop cards between and within columns (order is saved)
- WIP limit: "In progress" holds at most 3 tasks, enforced by the server
- Add, edit and delete tasks with a priority (low, medium, high)
- SQLite locally, PostgreSQL in production (via `DATABASE_URL`)

## Run locally
```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```
Open http://127.0.0.1:5000

## API
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/board` | Columns and all tasks |
| POST | `/api/tasks` | Create a task (goes to "To do") |
| PUT | `/api/tasks/<id>` | Edit title, description, priority |
| POST | `/api/tasks/<id>/move` | Move to `{status, index}` |
| DELETE | `/api/tasks/<id>` | Delete a task |
| GET | `/health` | Health check for Render |

## Deploy on Render
1. Push this repo to GitHub.
2. In Render: New > Blueprint, select the repo. `render.yaml` creates the web service and a Postgres database.
3. Wait for the build to finish, then open the URL Render gives you.

## Project structure
```
app.py             Flask app, database model, API routes
templates/         index.html
static/            app.js, style.css
render.yaml        Render deployment blueprint
requirements.txt   Python dependencies
```
