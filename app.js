// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";

// фиксированная таймзона для всей семьи
const APP_TIMEZONE = "Europe/Podgorica";

// ================== INIT ==================
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
  localStorage.setItem(LS_USER_ID, u.id);
  localStorage.setItem(LS_NAME, u.full_name);
}
function getUser() {
  const id = localStorage.getItem(LS_USER_ID);
  const name = localStorage.getItem(LS_NAME);
  return id && name ? { id, full_name: name } : null;
}
function clearUser() {
  localStorage.removeItem(LS_USER_ID);
  localStorage.removeItem(LS_NAME);
}

// ================== DATE ==================
function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

// ================== RLS ==================
async function setCurrentUser(userId) {
  const { error } = await supa.rpc("set_current_user", { user_uuid: userId });
  if (error) throw new Error(error.message);
}

// ================== AUTH ==================
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  if (!username || !password) return alert("Введите логин и пароль");

  const { data, error } = await supa
    .from("users")
    .select("id, full_name, password_hash")
    .eq("username", username)
    .limit(1);

  if (error || !data.length) return alert("Неверный логин или пароль");

  const user = data[0];
  const { data: ok } = await supa.rpc("verify_password", {
    p_password: password,
    p_hash: user.password_hash
  });
  if (!ok) return alert("Неверный логин или пароль");

  await setCurrentUser(user.id);
  setUser({ id: user.id, full_name: user.full_name });
  showApp();
}

// ================== UI ==================
function showApp() {
  const user = getUser();
  authBlock.style.display = "none";
  appBlock.style.display = "block";
  whoEl.textContent = user.full_name;
  todayLineEl.textContent = `Сегодня: ${todayISO()} (${APP_TIMEZONE})`;
  initData();
}
function showAuth() {
  authBlock.style.display = "block";
  appBlock.style.display = "none";
}

// ================== DATA ==================
let currentCat = null;

async function initData() {
  const user = getUser();
  if (!user) return;

  await setCurrentUser(user.id);

  const { data: cats } = await supa
    .from("cats")
    .select("*")
    .order("created_at");

  if (!cats.length) {
    catCardEl.textContent = "Кот не добавлен";
    statusEl.textContent = "";
    currentCat = null;
    return;
  }

  currentCat = cats[0];
  renderCat(currentCat);

  const { data } = await supa
    .from("daily_feeding")
    .select("*")
    .eq("cat_id", currentCat.id)
    .eq("date", todayISO())
    .limit(1);

  const usedDry = data?.[0]?.dry_grams || 0;
  const usedWet = data?.[0]?.wet_grams || 0;
  renderStatus(currentCat, usedDry, usedWet);
}

function renderCat(cat) {
  catCardEl.textContent =
`🐱 ${cat.name}

Норма в день:
🥣 ${cat.dry_limit} г
🥫 ${cat.wet_limit} г`;
}

function renderStatus(cat, dryUsed, wetUsed) {
  const dryLeft = cat.dry_limit - dryUsed;
  const wetLeft = cat.wet_limit - wetUsed;
  const warn = (dryLeft < 0 || wetLeft < 0)
    ? "\n⚠️ Осторожно, это путь к жирному коту 😼"
    : "";

  statusEl.textContent =
`Осталось на сегодня:
🥣 сухой: ${Math.max(dryLeft, 0)} г
🥫 влажный: ${Math.max(wetLeft, 0)} г${warn}`;
}

// ================== ACTIONS ==================
async function addFood(type) {
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
}

async function addCat() {
  const name = prompt("Имя кота:");
  const dry = parseInt(prompt("Сухой, г/день:"), 10);
  const wet = parseInt(prompt("Влажный, г/день:"), 10);
  if (!name || !dry || !wet) return;

  const user = getUser();
  await setCurrentUser(user.id);
  await supa.from("cats").insert({ name, dry_limit: dry, wet_limit: wet });
  initData();
}

async function editCat() {
  if (!currentCat) return;
  const name = prompt("Имя:", currentCat.name);
  const dry = parseInt(prompt("Сухой:", currentCat.dry_limit), 10);
  const wet = parseInt(prompt("Влажный:", currentCat.wet_limit), 10);
  if (!name || !dry || !wet) return;

  const user = getUser();
  await setCurrentUser(user.id);
  await supa.from("cats").update({
    name, dry_limit: dry, wet_limit: wet
  }).eq("id", currentCat.id);

  initData();
}

// ================== EVENTS ==================
document.getElementById("loginBtn").onclick = login;
document.getElementById("logoutBtn").onclick = () => { clearUser(); showAuth(); };
document.getElementById("addDryBtn").onclick = () => addFood("dry");
document.getElementById("addWetBtn").onclick = () => addFood("wet");
document.getElementById("addCatBtn").onclick = addCat;
document.getElementById("editCatBtn").onclick = editCat;

// ================== START ==================
const existing = getUser();
if (existing) showApp();
else showAuth();
