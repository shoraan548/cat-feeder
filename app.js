// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";

// фиксированная таймзона для всей семьи
const APP_TIMEZONE = "Europe/Podgorica";

// ================== LOGGER ==================
const LOG_PREFIX = "[CAT-FEEDER]";
const log = (...args) => console.log(LOG_PREFIX, ...args);
const logError = (...args) => console.error(LOG_PREFIX, ...args);

// ================== INIT ==================
log("init app");

const supa = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ================== DOM ==================
const authBlock = document.getElementById("auth");
const appBlock = document.getElementById("app");
const whoEl = document.getElementById("who");
const todayLineEl = document.getElementById("todayLine");
const catCardEl = document.getElementById("catCard");
const statusEl = document.getElementById("status");

// ================== LOCAL SESSION ==================
const LS_USER_ID = "cat_user_id";
const LS_NAME = "cat_user_name";

function setUser(u) {
  log("setUser()", u);
  localStorage.setItem(LS_USER_ID, u.id);
  localStorage.setItem(LS_NAME, u.full_name);
}

function getUser() {
  const id = localStorage.getItem(LS_USER_ID);
  const name = localStorage.getItem(LS_NAME);
  const user = id && name ? { id, full_name: name } : null;
  log("getUser()", user);
  return user;
}

function clearUser() {
  log("clearUser()");
  localStorage.removeItem(LS_USER_ID);
  localStorage.removeItem(LS_NAME);
}

// ================== DATE ==================
function todayISO() {
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

  log("todayISO()", d);
  return d;
}

// ================== RLS ==================
async function setCurrentUser(userId) {
  log("setCurrentUser(): call RPC", userId);

  const { error } = await supa.rpc("set_current_user", {
    user_uuid: userId
  });

  if (error) {
    logError("setCurrentUser(): RPC error", error);
    throw new Error(error.message);
  }

  log("setCurrentUser(): OK");
}

// ================== AUTH ==================
async function login() {
  try {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    log("login(): start", { username });

    if (!username || !password) {
      log("login(): missing credentials");
      alert("Введите логин и пароль");
      return;
    }

    log("login(): query users");

    const { data, error } = await supa
      .from("users")
      .select("id, full_name, password_hash")
      .eq("username", username)
      .limit(1);

    log("login(): users result", { data, error });

    if (error) {
      logError("login(): users query error", error);
      alert("Ошибка запроса пользователей");
      return;
    }

    if (!data || data.length === 0) {
      log("login(): user not found");
      alert("Неверный логин или пароль");
      return;
    }

    const user = data[0];
    log("login(): user found", user);

    log("login(): verify password");

    const { data: ok, error: vErr } = await supa.rpc("verify_password", {
      p_password: password,
      p_hash: user.password_hash
    });

    log("login(): verify result", { ok, vErr });

    if (vErr) {
      logError("login(): verify_password error", vErr);
      alert("Ошибка проверки пароля");
      return;
    }

    if (!ok) {
      log("login(): wrong password");
      alert("Неверный логин или пароль");
      return;
    }

    log("login(): password OK, set RLS");

    await setCurrentUser(user.id);

    setUser({ id: user.id, full_name: user.full_name });

    log("login(): success");

    showApp();

  } catch (e) {
    logError("login(): unexpected error", e);
    alert(e.message || e);
  }
}

function logout() {
  log("logout()");
  clearUser();
  showAuth();
}

// ================== UI ==================
function showApp() {
  const user = getUser();
  log("showApp()", user);

  authBlock.style.display = "none";
  appBlock.style.display = "block";

  whoEl.textContent = user.full_name;
  todayLineEl.textContent = `Сегодня: ${todayISO()} (${APP_TIMEZONE})`;

  initData();
}

function showAuth() {
  log("showAuth()");
  authBlock.style.display = "block";
  appBlock.style.display = "none";
}

// ================== DATA ==================
let currentCat = null;

async function initData() {
  try {
    const user = getUser();
    if (!user) return;

    await setCurrentUser(user.id);

    log("initData(): load cats");

    const { data: cats, error } = await supa
      .from("cats")
      .select("*")
      .order("created_at");

    log("initData(): cats result", { cats, error });

    if (error) throw error;

    if (!cats || cats.length === 0) {
      currentCat = null;
      catCardEl.textContent = "Кот не добавлен";
      statusEl.textContent = "";
      return;
    }

    currentCat = cats[0];
    renderCat(currentCat);

    const today = todayISO();

    const { data: rows } = await supa
      .from("daily_feeding")
      .select("*")
      .eq("cat_id", currentCat.id)
      .eq("date", today)
      .limit(1);

    const usedDry = rows?.[0]?.dry_grams || 0;
    const usedWet = rows?.[0]?.wet_grams || 0;

    renderStatus(currentCat, usedDry, usedWet);

  } catch (e) {
    logError("initData(): error", e);
  }
}

function renderCat(cat) {
  log("renderCat()", cat);

  catCardEl.textContent =
`🐱 ${cat.name}

Норма в день:
🥣 ${cat.dry_limit} г
🥫 ${cat.wet_limit} г`;
}

function renderStatus(cat, dryUsed, wetUsed) {
  const dryLeft = cat.dry_limit - dryUsed;
  const wetLeft = cat.wet_limit - wetUsed;

  log("renderStatus()", { dryUsed, wetUsed, dryLeft, wetLeft });

  const warn =
    (dryLeft < 0 || wetLeft < 0)
      ? "\n⚠️ Осторожно, это путь к жирному коту 😼"
      : "";

  statusEl.textContent =
`Осталось на сегодня:
🥣 сухой: ${Math.max(dryLeft, 0)} г
🥫 влажный: ${Math.max(wetLeft, 0)} г${warn}`;
}

// ================== ACTIONS ==================
async function addFood(type) {
  try {
    log("addFood()", type);

    const grams = parseInt(prompt("Сколько грамм?"), 10);
    if (!grams || grams <= 0) return;

    const user = getUser();
    await setCurrentUser(user.id);

    const today = todayISO();

    const { data } = await supa
      .from("daily_feeding")
      .select("*")
      .eq("cat_id", currentCat.id)
      .eq("date", today)
      .limit(1);

    const dry = (data?.[0]?.dry_grams || 0) + (type === "dry" ? grams : 0);
    const wet = (data?.[0]?.wet_grams || 0) + (type === "wet" ? grams : 0);

    await supa.from("daily_feeding").upsert({
      cat_id: currentCat.id,
      date: today,
      dry_grams: dry,
      wet_grams: wet,
      created_by: user.id
    });

    renderStatus(currentCat, dry, wet);

  } catch (e) {
    logError("addFood(): error", e);
  }
}

async function addCat() {
  try {
    log("addCat()");

    const name = prompt("Имя кота:");
    const dry = parseInt(prompt("Сухой, г/день:"), 10);
    const wet = parseInt(prompt("Влажный, г/день:"), 10);

    if (!name || !dry || !wet) return;

    const user = getUser();
    await setCurrentUser(user.id);

    await supa.from("cats").insert({
      name,
      dry_limit: dry,
      wet_limit: wet
    });

    initData();

  } catch (e) {
    logError("addCat(): error", e);
  }
}

async function editCat() {
  try {
    log("editCat()", currentCat);

    if (!currentCat) return;

    const name = prompt("Имя:", currentCat.name);
    const dry = parseInt(prompt("Сухой:", currentCat.dry_limit), 10);
    const wet = parseInt(prompt("Влажный:", currentCat.wet_limit), 10);

    if (!name || !dry || !wet) return;

    const user = getUser();
    await setCurrentUser(user.id);

    await supa.from("cats").update({
      name,
      dry_limit: dry,
      wet_limit: wet
    }).eq("id", currentCat.id);

    initData();

  } catch (e) {
    logError("editCat(): error", e);
  }
}

// ================== EVENTS ==================
document.getElementById("loginBtn").onclick = login;
document.getElementById("logoutBtn").onclick = logout;
document.getElementById("addDryBtn").onclick = () => addFood("dry");
document.getElementById("addWetBtn").onclick = () => addFood("wet");
document.getElementById("addCatBtn").onclick = addCat;
document.getElementById("editCatBtn").onclick = editCat;

// ================== START ==================
log("app start");

const existing = getUser();
if (existing) {
  log("existing session found");
  showApp();
} else {
  log("no session, show auth");
  showAuth();
}
