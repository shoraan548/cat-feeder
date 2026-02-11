// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";

// фиксированная таймзона для всей семьи
const APP_TIMEZONE = "Europe/Podgorica";

const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const LS_USER_ID = "cat_user_id";
const LS_NAME = "cat_user_name";

let currentCat = null;
let foodMode = null;
let editingCatId = null;

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

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

async function setCurrentUser(userId) {
  await supa.rpc("set_current_user", { user_uuid: userId });
}

/* ================= AUTH ================= */

async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  const { data } = await supa
    .from("users")
    .select("id, full_name, password_hash")
    .eq("username", username)
    .limit(1);

  if (!data?.length) return alert("Неверный логин или пароль");

  const ok = (await supa.rpc("verify_password", {
    p_password: password,
    p_hash: data[0].password_hash
  })).data;

  if (!ok) return alert("Неверный логин или пароль");

  await setCurrentUser(data[0].id);
  setUser(data[0]);
  showApp();
}

function showApp() {
  const u = getUser();
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("who").textContent = u.full_name;
  document.getElementById("todayLine").textContent =
    `Сегодня: ${todayISO()} (${APP_TIMEZONE})`;
  loadCat();
}

function showAuth() {
  document.getElementById("auth").style.display = "block";
  document.getElementById("app").style.display = "none";
}

/* ================= CAT ================= */

async function loadCat() {
  const u = getUser();
  await setCurrentUser(u.id);

  const { data: cats } = await supa.from("cats").select("*").limit(1);

  if (!cats?.length) {
    currentCat = null;
    document.getElementById("catTable").innerHTML =
      `<tr><td class="label">Кот</td><td>Не добавлен</td></tr>`;
    document.getElementById("fatWarning").style.display = "none";
    return;
  }

  currentCat = cats[0];

  const { data: feed } = await supa
    .from("daily_feeding")
    .select("*")
    .eq("cat_id", currentCat.id)
    .eq("date", todayISO())
    .limit(1);

  const usedDry = feed?.[0]?.dry_grams || 0;
  const usedWet = feed?.[0]?.wet_grams || 0;
  const lastTime = feed?.[0]?.updated_at;

  const dryLeft = currentCat.dry_limit - usedDry;
  const wetLeft = currentCat.wet_limit - usedWet;

  document.getElementById("fatWarning").style.display =
    (dryLeft < 0 || wetLeft < 0) ? "block" : "none";

  document.getElementById("catTable").innerHTML = `
    <tr><td class="label">Имя</td><td>${currentCat.name}</td></tr>
    <tr><td class="label">Сухой корм</td><td>Осталось: ${Math.max(dryLeft,0)} г</td></tr>
    <tr><td class="label">Влажный корм</td><td>Осталось: ${Math.max(wetLeft,0)} г</td></tr>
    <tr><td class="label">Последняя кормёжка</td><td>${lastTime ? new Date(lastTime).toLocaleTimeString() : "—"}</td></tr>
  `;
}

/* ================= CAT MODAL ================= */

function openCatModal(cat = null) {
  document.getElementById("catModal").style.display = "flex";
  document.getElementById("catModalTitle").textContent =
    cat ? "Редактировать кота" : "Добавить кота";

  document.getElementById("catNameInput").value = cat?.name || "";
  document.getElementById("catDryInput").value = cat?.dry_limit || "";
  document.getElementById("catWetInput").value = cat?.wet_limit || "";

  editingCatId = cat?.id || null;

  document.getElementById("deleteCatBtn").style.display =
    cat ? "block" : "none";
}

function closeCatModal() {
  document.getElementById("catModal").style.display = "none";
  editingCatId = null;
}

async function saveCat() {
  const name = document.getElementById("catNameInput").value.trim();
  const dry = parseInt(document.getElementById("catDryInput").value, 10);
  const wet = parseInt(document.getElementById("catWetInput").value, 10);

  if (!name || !dry || !wet) return alert("Заполни все поля");

  const u = getUser();
  await setCurrentUser(u.id);

  if (editingCatId) {
    await supa.from("cats")
      .update({ name, dry_limit: dry, wet_limit: wet })
      .eq("id", editingCatId);
  } else {
    await supa.from("cats")
      .insert({ name, dry_limit: dry, wet_limit: wet });
  }

  closeCatModal();
  loadCat();
}

async function deleteCat() {
  if (!editingCatId) return;
  if (!confirm("Удалить кота?")) return;

  const u = getUser();
  await setCurrentUser(u.id);

  await supa.from("cats").delete().eq("id", editingCatId);

  closeCatModal();
  loadCat();
}

/* ================= FOOD MODAL ================= */

function openFoodModal(mode) {
  if (!currentCat) return alert("Сначала добавь кота");
  foodMode = mode;
  document.getElementById("foodModalTitle").textContent =
    mode === "dry" ? "Добавить сухой корм" : "Добавить влажный корм";
  document.getElementById("foodGramsInput").value = "";
  document.getElementById("foodModal").style.display = "flex";
}

function closeFoodModal() {
  document.getElementById("foodModal").style.display = "none";
}

async function saveFood() {
  const grams = parseInt(document.getElementById("foodGramsInput").value, 10);
  if (!grams || grams <= 0) return;

  const u = getUser();
  await setCurrentUser(u.id);

  const today = todayISO();

  const { data } = await supa
    .from("daily_feeding")
    .select("*")
    .eq("cat_id", currentCat.id)
    .eq("date", today)
    .limit(1);

  const dry = (data?.[0]?.dry_grams || 0) + (foodMode === "dry" ? grams : 0);
  const wet = (data?.[0]?.wet_grams || 0) + (foodMode === "wet" ? grams : 0);

  await supa.from("daily_feeding").upsert({
    cat_id: currentCat.id,
    date: today,
    dry_grams: dry,
    wet_grams: wet,
    created_by: u.id,
    updated_at: new Date().toISOString()
  });

  closeFoodModal();
  loadCat();
}

/* ================= EVENTS ================= */

document.getElementById("loginBtn").onclick = login;
document.getElementById("logoutBtn").onclick = () => { clearUser(); showAuth(); };

document.getElementById("addCatBtn").onclick = () => openCatModal();
document.getElementById("editCatBtn").onclick = () => openCatModal(currentCat);
document.getElementById("saveCatBtn").onclick = saveCat;
document.getElementById("cancelCatBtn").onclick = closeCatModal;
document.getElementById("deleteCatBtn").onclick = deleteCat;

document.getElementById("addDryBtn").onclick = () => openFoodModal("dry");
document.getElementById("addWetBtn").onclick = () => openFoodModal("wet");
document.getElementById("saveFoodBtn").onclick = saveFood;
document.getElementById("cancelFoodBtn").onclick = closeFoodModal;

/* ================= START ================= */

getUser() ? showApp() : showAuth();
