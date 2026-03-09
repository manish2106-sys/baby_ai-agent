const API_BASE = "/api";
const TOKEN_KEY = "prasee_auth_token";

const signupForm = document.getElementById("signupForm");
const loginForm = document.getElementById("loginForm");
const ideaForm = document.getElementById("ideaForm");
const authStatus = document.getElementById("authStatus");
const ideaStatus = document.getElementById("ideaStatus");
const ideasList = document.getElementById("ideasList");
const logoutBtn = document.getElementById("logoutBtn");

const tabButtons = document.querySelectorAll(".tab-btn");
const authForms = document.querySelectorAll(".auth-form");

let currentUser = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error || "Request failed";
    throw new Error(message);
  }

  return body;
}

function updateAuthUI() {
  if (currentUser) {
    authStatus.textContent = `Logged in as ${currentUser.name}`;
    logoutBtn.classList.remove("hidden");
    return;
  }

  authStatus.textContent = "Not logged in yet.";
  logoutBtn.classList.add("hidden");
}

function renderIdeas(ideas) {
  if (!ideas.length) {
    ideasList.innerHTML = "<p class='muted'>No ideas submitted yet.</p>";
    return;
  }

  ideasList.innerHTML = ideas
    .map((idea) => {
      const at = new Date(idea.created_at).toLocaleString();
      return `
        <article class="idea-item">
          <h4>${escapeHTML(idea.title)}</h4>
          <p>${escapeHTML(idea.detail)}</p>
          <p class="muted">By: ${escapeHTML(idea.author)} | ${at}</p>
        </article>
      `;
    })
    .join("");
}

async function refreshIdeas() {
  try {
    const data = await apiRequest("/ideas", { method: "GET", headers: {} });
    renderIdeas(data.ideas || []);
  } catch {
    ideasList.innerHTML = "<p class='muted'>Unable to load ideas right now.</p>";
  }
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

for (const button of tabButtons) {
  button.addEventListener("click", () => {
    const target = button.dataset.target;

    for (const tab of tabButtons) tab.classList.remove("active");
    button.classList.add("active");

    for (const form of authForms) {
      form.classList.toggle("active", form.id === target);
    }

    authStatus.textContent = "";
  });
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim().toLowerCase();
  const password = document.getElementById("signupPassword").value;

  try {
    const data = await apiRequest("/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    });

    setToken(data.token);
    currentUser = data.user;
    signupForm.reset();
    authStatus.textContent = "Account created and logged in.";
    updateAuthUI();
  } catch (error) {
    authStatus.textContent = error.message;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("loginEmail").value.trim().toLowerCase();
  const password = document.getElementById("loginPassword").value;

  try {
    const data = await apiRequest("/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    setToken(data.token);
    currentUser = data.user;
    loginForm.reset();
    authStatus.textContent = "Login successful.";
    updateAuthUI();
  } catch (error) {
    authStatus.textContent = error.message;
  }
});

ideaForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = document.getElementById("ideaTitle").value.trim();
  const detail = document.getElementById("ideaDetail").value.trim();

  if (!getToken()) {
    ideaStatus.textContent = "Please login first to submit your idea.";
    return;
  }

  try {
    await apiRequest("/ideas", {
      method: "POST",
      body: JSON.stringify({ title, detail })
    });

    ideaForm.reset();
    ideaStatus.textContent = "Idea submitted successfully.";
    await refreshIdeas();
  } catch (error) {
    ideaStatus.textContent = error.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  const token = getToken();
  if (!token) return;

  try {
    await apiRequest("/logout", { method: "POST", body: "{}" });
  } catch {
  }

  clearToken();
  currentUser = null;
  updateAuthUI();
  authStatus.textContent = "Logged out.";
});

async function loadSession() {
  const token = getToken();
  if (!token) {
    currentUser = null;
    updateAuthUI();
    return;
  }

  try {
    const data = await apiRequest("/me", { method: "GET", headers: {} });
    currentUser = data.user;
  } catch {
    clearToken();
    currentUser = null;
  }

  updateAuthUI();
}

(async function init() {
  await loadSession();
  await refreshIdeas();
})();
