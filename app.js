// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";

// фиксированная таймзона для всей семьи
const APP_TIMEZONE = "Europe/Podgorica";

// ================== LOGGER ==================
const log = (...a) => console.log("[CAT-FEEDER]", ...a);
const logError = (...a) => console.error("[CAT-FEEDER]", ...a);

// ================== INIT ==================
const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ================== DOM ==================
const authBlock = document.getElementById("auth");
const appBlock = document.getElementById("app");
const whoEl = document.getElementById("who");
const todayLineEl = document.getElementById("todayLine");
const catTableEl = document.getElementById("catTable");
const fatWarningEl = document.getElementById("fatWarning");

// ================== SESSION ==================
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
  if (error) throw error;
}

// ================== AUTH ==================
async function login() {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value;

  const { data } = await supa
    .from("users")
    .select("id, full_name, password_hash")
    .eq("username", u)
    .limit(1);

  if (!data?.length) return alert("Неверный логин или пароль");

  const ok = (await supa.rpc("verify_password", {
    p_password: p,
    p_hash: data[0].password_hash
  })).data;

  if (!ok) return alert("Неверный логин или пароль");

  await setCurrentUser(data[0].id);
  setUser(data[0]);
  showApp();
}

// ================== UI ==================
function showApp() {
  const u = getUser();
  authBlock.style.display = "none";
  appBlock.style.display = "block";
  whoEl.textContent = u.full_name;
  todayLineEl.textContent = `Сегодня: ${todayISO()} (${APP_TIMEZONE})`;
  loadCat();
}
function showAuth() {
  authBlock.style.display = "block";
  appBlock.style.display = "none";
}

// ================== CAT LOGIC ==================
async function loadCat() {
  const u = getUser();
  await setCurrentUser(u.id);

  const { data: cats } = await supa.from("cats").select("*").limit(1);
  if (!cats?.length) {
    catTableEl.innerHTML = "<tr><td>Кот не добавлен</td></tr>";
    return;
  }

  const cat = cats[0];

  const { data: feed } = await supa
    .from("daily_feeding")
    .select("*")
    .eq("cat_id", cat.id)
    .eq("date", todayISO())
    .limit(1);

  const usedDry = feed?.[0]?.dry_grams || 0;
  const usedWet = feed?.[0]?.wet_grams || 0;

  const dryLeft = cat.dry_limit - usedDry;
  const wetLeft = cat.wet_limit - usedWet;

  fatWarningEl.style.display =
    (dryLeft < 0 || wetLeft < 0) ? "block" : "none";

  catTableEl.innerHTML = `
    <tr><td class="label">Имя</td><td>${cat.name}</td></tr>
    <tr><td class="label">Сухой корм</td><td>Осталось: ${Math.max(dryLeft,0)} г</td></tr>
    <tr><td class="label">Влажный корм</td><td>Осталось: ${Math.max(wetLeft,0)} г</td></tr>
  `;
}

// ================== FOOD ==================
async function addFood(type) {
  const grams = parseInt(prompt("Сколько грамм?"), 10);
  if (!grams) return;

  const u = getUser();
  await setCurrentUser(u.id);

  const { data: cat } = await supa.from("cats").select("*").limit(1);
  const today = todayISO();

  const { data } = await supa
    .from("daily_feeding")
    .select("*")
    .eq("cat_id", cat[0].id)
    .eq("date", today)
    .limit(1);

  const dry = (data?.[0]?.dry_grams || 0) + (type === "dry" ? grams : 0);
  const wet = (data?.[0]?.wet_grams || 0) + (type === "wet" ? grams : 0);

  await supa.from("daily_feeding").upsert({
    cat_id: cat[0].id,
    date: today,
    dry_grams: dry,
    wet_grams: wet,
    created_by: u.id
  });

  loadCat();
}

// ================== EVENTS ==================
document.getElementById("loginBtn").onclick = login;
document.getElementById("logoutBtn").onclick = () => { clearUser(); showAuth(); };
document.getElementById("addDryBtn").onclick = () => addFood("dry");
document.getElementById("addWetBtn").onclick = () => addFood("wet");

// ================== START ==================
getUser() ? showApp() : showAuth();
