# Prasee Service and Solution - Full Stack

## Stack
- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js HTTP server (no external dependencies)
- Database: JSON file (`db.json`) with persistent storage

## Features
- User account registration
- User login/logout with token sessions
- Submit automation/service ideas (authenticated)
- View latest submitted ideas

## Run Locally
1. Open terminal in `C:\Users\ADMIN\Desktop\locallm\prasee-website`
2. Run:

```bash
node server.js
```

3. Open browser:

```text
http://127.0.0.1:8000
```

## API Endpoints
- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/ideas`
- `POST /api/ideas`
- `GET /api/health`

## Notes
- Passwords are hashed with PBKDF2.
- Sessions expire after 7 days.
- `db.json` is created automatically on first run.
