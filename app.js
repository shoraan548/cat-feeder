// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";

// фиксированная таймзона для всей семьи
const APP_TIMEZONE = "Europe/Podgorica";

// ================== INIT ==================
if (!window.supabase) {
  alert("Supabase CDN не загрузился");
  throw new Error("Supabase CDN not loaded");
}
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================== DOM ==================
const authBlock = document.getElementById("auth");
const appBlock = document.getElementById("app");

const logEl = document.getElementById("log");
const whoEl = document.getElementById("who");
const todayLineEl = document.getElementById("todayLine");

const catCardEl = document.getElementById("catCard");
const statusEl = document.getElementById("status");
const catsListEl = document.getElementById("catsList");

function log(msg) {
  logEl.textContent += msg + "\n";
}

// ================== ЛОКАЛЬНАЯ СЕССИЯ (домашний режим) ==================
// Мы не используем Supabase Auth. Храним user_id + имя в localStorage.
const LS_USER_ID = "catapp_user_id";
const LS_FULL_NAME = "catapp_full_name";

function setLocalUser(user) {
  localStorage.setItem(LS_USER_ID, user.id);
  localStorage.setItem(LS_FULL_NAME, user.full_name);
}
function clearLocalUser() {
  localStorage.removeItem(LS_USER_ID);
  localStorage.removeItem(LS_FULL_NAME);
}
function getLocalUser() {
  const id = localStorage.getItem(LS_USER_ID);
  const full_name = localStorage.getItem(LS_FULL_NAME);
  if (!id || !full_name) return null;
  return { id, full_name };
}

// ================== ДАТА С УЧЁТОМ TZ ==================
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ================== ТЕКУЩИЙ КОТ ==================
let currentCat = null;

// ================== API HELPERS ==================
async function setCurrentUserForRLS(userId) {
  // Вызываем SQL-функцию set_current_user(user_uuid)
  const { error } = await supa.rpc("set_current_user", { user_uuid: userId });
  if (error) throw new Error("set_current_user failed: " + error.message);
}

async function ensureMemberAccess(userId) {
  // Проверка, что пользователь в members (если нет — запретим вход)
  await setCurrentUserForRLS(userId);
  const { data, error } = await supa.from("members").select("user_id").limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Пользователь не добавлен в members");
}

async function loadCats() {
  const { data, error } = await supa.from("cats").select("*").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

async function loadTodayFeeding(catId) {
  const date = todayISO();
  const { data, error } = await supa
    .from("daily_feeding")
    .select("*")
    .eq("cat_id", catId)
    .eq("date", date)
    .limit(1);

  if (error) throw new Error(error.message);
  return (data && data[0]) ? data[0] : null;
}

async function upsertTodayFeeding(cat, addDry, addWet, userId) {
  const date = todayISO();

  // 1) читаем текущую запись (если есть)
  const existing = await loadTodayFeeding(cat.id);

  const dry = (existing ? existing.dry_grams : 0) + addDry;
  const wet = (existing ? existing.wet_grams : 0) + addWet;

  // 2) upsert по PK(cat_id, date)
  const payload = {
    cat_id: cat.id,
    date,
    dry_grams: dry,
    wet_grams: wet,
    updated_at: new Date().toISOString(),
    created_by: userId
  };

  const { error } = await supa.from("daily_feeding").upsert(payload, { onConflict: "cat_id,date" });
  if (error) throw new Error(error.message);

  return { dry, wet };
}

// ================== UI RENDER ==================
function showApp(user) {
  authBlock.style.display = "none";
  appBlock.style.display = "block";
  whoEl.textContent = user.full_name;
  todayLineEl.textContent = `День считается по таймзоне: ${APP_TIMEZONE}. Сегодня: ${todayISO()}`;
}

function showAuth() {
  authBlock.style.display = "block";
  appBlock.style.display = "none";
}

function renderCatCard(cat) {
  catCardEl.textContent =
`🐱 ${cat.name}
🥣 Норма сухого: ${cat.dry_limit} г/день
🥫 Норма влажного: ${cat.wet_limit} г/день`;
}

function renderStatus(cat, dryUsed, wetUsed) {
  const dryLeft = cat.dry_limit - dryUsed;
  const wetLeft = cat.wet_limit - wetUsed;

  let warn = "";
  if (dryUsed > cat.dry_limit || wetUsed > cat.wet_limit) {
    warn = "\n⚠️ Осторожно, это путь к жирному коту 😼";
  }

  statusEl.textContent =
`Сегодня уже:
🥣 сухой: ${dryUsed} г (осталось ${dryLeft} г)
🥫 влажный: ${wetUsed} г (осталось ${wetLeft} г)${warn}`;
}

// ================== AUTH FLOW (username+password) ==================
async function login() {
  try {
    logEl.textContent = ""; // clear log
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    if (!username || !password) {
      alert("Введите логин и пароль");
      return;
    }

    log("Проверяю логин…");

    // ВНИМАНИЕ: этот вариант читает password_hash в клиент.
    // Для домашнего проекта ок. Если захочешь безопаснее — сделаем RPC verify_login().
    const { data, error } = await supa
      .from("users")
      .select("id, username, full_name, password_hash")
      .eq("username", username)
      .limit(1);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error("Неверный логин или пароль");

    const user = data[0];

    // Проверяем пароль через Postgres crypt:
    // Мы НЕ можем вычислить crypt() на клиенте, поэтому делаем проверку запросом через RPC.
    // Чтобы не ломать безопасность, используем RPC verify_password (создадим ниже, если ещё нет).
    log("Проверяю пароль…");
    const { data: ok, error: vErr } = await supa.rpc("verify_password", {
      p_password: password,
      p_hash: user.password_hash
    });
    if (vErr) throw new Error(vErr.message);
    if (!ok) throw new Error("Неверный логин или пароль");

    // ставим текущего пользователя для RLS + проверяем, что он member
    await ensureMemberAccess(user.id);

    setLocalUser({ id: user.id, full_name: user.full_name });
    showApp({ id: user.id, full_name: user.full_name });

    await initData();

  } catch (e) {
    log("Ошибка: " + (e?.message || e));
    alert(e?.message || e);
  }
}

async function logout() {
  clearLocalUser();
  showAuth();
  alert("Вы вышли");
}

// ================== DATA INIT ==================
async function initData() {
  const user = getLocalUser();
  if (!user) return;

  // обязательно "проставить" текущего пользователя в БД (для RLS)
  await setCurrentUserForRLS(user.id);

  const cats = await loadCats();
  catsListEl.textContent = cats.length
    ? cats.map(c => `🐱 ${c.name} (🥣 ${c.dry_limit} / 🥫 ${c.wet_limit})`).join("\n")
    : "Котов пока нет";

  if (!cats.length) {
    currentCat = null;
    catCardEl.textContent = "Кот не найден. Добавь кота в таблицу cats.";
    statusEl.textContent = "";
    return;
  }

  // 1 кот = берём первого
  currentCat = cats[0];
  renderCatCard(currentCat);

  const todayRow = await loadTodayFeeding(currentCat.id);
  const dryUsed = todayRow ? todayRow.dry_grams : 0;
  const wetUsed = todayRow ? todayRow.wet_grams : 0;
  renderStatus(currentCat, dryUsed, wetUsed);
}

// ================== ADD FOOD ==================
async function addFood(type) {
  try {
    const user = getLocalUser();
    if (!user) {
      alert("Сначала войди");
      return;
    }
    if (!currentCat) {
      alert("Кот не найден");
      return;
    }

    const raw = prompt("Сколько грамм добавить?");
    if (raw === null) return;

    const grams = parseInt(raw, 10);
    if (!Number.isFinite(grams) || grams <= 0) {
      alert("Введи число больше 0");
      return;
    }

    await setCurrentUserForRLS(user.id);

    const addDry = (type === "dry") ? grams : 0;
    const addWet = (type === "wet") ? grams : 0;

    const totals = await upsertTodayFeeding(currentCat, addDry, addWet, user.id);
    renderStatus(currentCat, totals.dry, totals.wet);

  } catch (e) {
    alert(e?.message || e);
  }
}

// ================== EVENTS ==================
document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("addDryBtn").addEventListener("click", () => addFood("dry"));
document.getElementById("addWetBtn").addEventListener("click", () => addFood("wet"));

// ================== START ==================
logEl.textContent = "";
log("JS загружен ✅");

(async () => {
  const user = getLocalUser();
  if (!user) {
    showAuth();
    return;
  }

  try {
    await ensureMemberAccess(user.id);
    showApp(user);
    await initData();
  } catch (e) {
    // если localStorage устарел или пользователя удалили
    clearLocalUser();
    showAuth();
    log("Сессия сброшена: " + (e?.message || e));
  }
})();
