const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = 8000;
const BASE_DIR = __dirname;
const DATA_FILE = path.join(BASE_DIR, "db.json");
const SESSION_DAYS = 7;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function nowIso() {
  return new Date().toISOString();
}

function plusDaysIso(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function ensureDb() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      users: [],
      sessions: [],
      ideas: [],
      counters: { userId: 0, ideaId: 0 }
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function parseJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2 * 1024 * 1024) {
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  return crypto.pbkdf2Sync(password, salt, 150000, 32, "sha256").toString("hex");
}

function createPasswordRecord(password) {
  const saltHex = crypto.randomBytes(16).toString("hex");
  const hashHex = hashPassword(password, saltHex);
  return { saltHex, hashHex };
}

function safeCompare(a, b) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

function authenticatedUser(req, db) {
  const token = getBearerToken(req);
  if (!token) return null;

  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    db.sessions = db.sessions.filter((s) => s.token !== token);
    writeDb(db);
    return null;
  }

  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return null;

  return { user, token };
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const session = {
    token,
    userId,
    createdAt: nowIso(),
    expiresAt: plusDaysIso(SESSION_DAYS)
  };
  db.sessions.push(session);
  return session;
}

function serveStatic(req, res, pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(target).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(BASE_DIR, normalized);

  if (!filePath.startsWith(BASE_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = CONTENT_TYPES[ext] || "application/octet-stream";
  const body = fs.readFileSync(filePath);

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Length": body.length
  });
  res.end(body);
}

async function handleApi(req, res, pathname) {
  const db = readDb();

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "Prasee API" });
    return;
  }

  if (req.method === "POST" && pathname === "/api/register") {
    const body = await parseJson(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (name.length < 2 || !email.includes("@") || password.length < 6) {
      sendJson(res, 400, { error: "Invalid input values" });
      return;
    }

    if (db.users.some((u) => u.email === email)) {
      sendJson(res, 409, { error: "Email already registered" });
      return;
    }

    const { saltHex, hashHex } = createPasswordRecord(password);
    db.counters.userId += 1;

    const user = {
      id: db.counters.userId,
      name,
      email,
      passwordHash: hashHex,
      passwordSalt: saltHex,
      createdAt: nowIso()
    };

    db.users.push(user);
    const session = createSession(db, user.id);
    writeDb(db);

    sendJson(res, 201, {
      message: "Account created",
      token: session.token,
      expires_at: session.expiresAt,
      user: { id: user.id, name: user.name, email: user.email }
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await parseJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");

    const user = db.users.find((u) => u.email === email);
    if (!user) {
      sendJson(res, 401, { error: "Invalid email or password" });
      return;
    }

    const actualHash = hashPassword(password, user.passwordSalt);
    if (!safeCompare(actualHash, user.passwordHash)) {
      sendJson(res, 401, { error: "Invalid email or password" });
      return;
    }

    const session = createSession(db, user.id);
    writeDb(db);

    sendJson(res, 200, {
      message: "Login successful",
      token: session.token,
      expires_at: session.expiresAt,
      user: { id: user.id, name: user.name, email: user.email }
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    const token = getBearerToken(req);
    if (!token) {
      sendJson(res, 400, { error: "Missing token" });
      return;
    }

    db.sessions = db.sessions.filter((s) => s.token !== token);
    writeDb(db);
    sendJson(res, 200, { message: "Logged out" });
    return;
  }

  if (req.method === "GET" && pathname === "/api/me") {
    const auth = authenticatedUser(req, db);
    if (!auth) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    sendJson(res, 200, {
      user: { id: auth.user.id, name: auth.user.name, email: auth.user.email }
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/ideas") {
    const ideas = [...db.ideas]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50)
      .map((idea) => ({
        id: idea.id,
        title: idea.title,
        detail: idea.detail,
        author: idea.author,
        created_at: idea.createdAt
      }));

    sendJson(res, 200, { ideas });
    return;
  }

  if (req.method === "POST" && pathname === "/api/ideas") {
    const auth = authenticatedUser(req, db);
    if (!auth) {
      sendJson(res, 401, { error: "Unauthorized" });
      return;
    }

    const body = await parseJson(req);
    const title = String(body.title || "").trim();
    const detail = String(body.detail || "").trim();

    if (title.length < 3 || detail.length < 10) {
      sendJson(res, 400, { error: "Please provide more detail" });
      return;
    }

    db.counters.ideaId += 1;
    const idea = {
      id: db.counters.ideaId,
      userId: auth.user.id,
      author: auth.user.name,
      title,
      detail,
      createdAt: nowIso()
    };

    db.ideas.push(idea);
    writeDb(db);

    sendJson(res, 201, {
      message: "Idea submitted",
      idea: {
        id: idea.id,
        title: idea.title,
        detail: idea.detail,
        author: idea.author,
        created_at: idea.createdAt
      }
    });
    return;
  }

  sendJson(res, 404, { error: "Route not found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    res.end();
    return;
  }

  if (pathname.startsWith("/api/")) {
    try {
      await handleApi(req, res, pathname);
    } catch (error) {
      sendJson(res, 500, { error: "Internal server error" });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

ensureDb();
server.listen(PORT, HOST, () => {
  console.log(`Prasee Service and Solution running at http://${HOST}:${PORT}`);
});
