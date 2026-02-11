
/* ================== CONFIG ================== */
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";
const APP_TIMEZONE = "Europe/Podgorica";

const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================= STATE ================= */

let cats = [];
let currentCatId = null;   // выбранный кот
let foodMode = null;       // 'dry' | 'wet'
let editingCatId = null;   // кот в модалке редактирования

/* ================= HELPERS ================= */

function $(id) { return document.getElementById(id); }

function show(id) { $(id).style.display = "block"; }
function hide(id) { $(id).style.display = "none"; }

function showModal(id) { $(id).classList.add("show"); }
function hideModal(id) { $(id).classList.remove("show"); }

function clampInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function todayStartISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString();
}

function formatLeft(v) {
  if (v >= 0) return `${v} г осталось`;
  return `<span class="red">${Math.abs(v)} г перебор</span>`;
}

async function getUser() {
  const { data } = await supa.auth.getUser();
  return data.user;
}

async function getDisplayName() {
  const user = await getUser();
  if (!user) return "";

  // профайл: public.profiles(id uuid pk -> auth.users.id, full_name text)
  const { data } = await supa
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (data?.full_name && data.full_name.trim()) ? data.full_name.trim() : user.email;
}

/* ================= AUTH ================= */

async function login() {
  console.log("[login] click");

  const loginInput = $("username").value.trim();
  const password = $("password").value;

  if (!loginInput || !password) {
    alert("Введите логин и пароль");
    return;
  }

  let email = loginInput;

  // username → получить email через RPC
  if (!loginInput.includes("@")) {
    console.log("[login] username flow:", loginInput);
    const { data, error } = await supa.rpc("get_email_by_username", { p_username: loginInput });

    if (error) {
      console.log("[login] rpc error:", error);
      alert("Ошибка поиска пользователя");
      return;
    }
    if (!data) {
      alert("Пользователь не найден");
      return;
    }
    email = data;
  }

  console.log("[login] signInWithPassword email:", email);

  const { error } = await supa.auth.signInWithPassword({ email, password });

  if (error) {
    console.log("[login] auth error:", error);
    alert("Неверный логин или пароль");
    return;
  }

  await showApp();
}

async function logout() {
  await supa.auth.signOut();
  showAuth();
}

async function sendReset() {
  const loginInput = $("username").value.trim();
  if (!loginInput) {
    alert("Введите email или username");
    return;
  }

  let email = loginInput;

  if (!loginInput.includes("@")) {
    const { data, error } = await supa.rpc("get_email_by_username", { p_username: loginInput });
    if (error || !data) {
      alert("Пользователь не найден");
      return;
    }
    email = data;
  }

  const { error } = await supa.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href
  });

  if (error) {
    console.log("[reset] error:", error);
    alert("Не получилось отправить письмо");
    return;
  }

  alert("Письмо отправлено");
}

function showAuth() {
  show("auth");
  hide("app");
}

async function showApp() {
  hide("auth");
  show("app");

  $("who").textContent = await getDisplayName();

  await loadCats();
  await render();
}

/* ================= RESET PASSWORD FLOW ================= */

function isRecoveryUrl() {
  return window.location.hash.includes("type=recovery");
}

async function saveNewPassword() {
  const p1 = $("newPasswordInput").value;
  const p2 = $("confirmPasswordInput").value;

  if (!p1 || p1.length < 6) { alert("Минимум 6 символов"); return; }
  if (p1 !== p2) { alert("Пароли не совпадают"); return; }

  const { error } = await supa.auth.updateUser({ password: p1 });

  if (error) {
    console.log("[updatePassword] error:", error);
    alert(error.message);
    return;
  }

  alert("Пароль обновлён");
  // убрать hash, чтобы при следующем открытии не показывать reset
  window.history.replaceState({}, document.title, window.location.pathname);
  await supa.auth.signOut();
  hideModal("resetModal");
  showAuth();
}

/* ================= DATA: CATS + FEEDING ================= */

async function loadCats() {
  const user = await getUser();
  if (!user) return;

  const { data, error } = await supa
    .from("cats")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.log("[cats] load error:", error);
    cats = [];
    currentCatId = null;
    return;
  }

  cats = data || [];

  if (!cats.length) {
    currentCatId = null;
    return;
  }

  // если ещё не выбран или выбранный удалили — ставим первого
  if (!currentCatId || !cats.find(c => c.id === currentCatId)) {
    currentCatId = cats[0].id;
  }
}

function getCurrentCat() {
  return cats.find(c => c.id === currentCatId) || null;
}

async function loadTodayTotals(catId) {
  const { data, error } = await supa
    .from("feeding_events")
    .select("food_type, grams, created_at")
    .eq("cat_id", catId)
    .gte("created_at", todayStartISO())
    .order("created_at", { ascending: true });

  if (error) {
    console.log("[events] load error:", error);
    return { usedDry: 0, usedWet: 0, lastAt: null };
  }

  const usedDry = (data || [])
    .filter(e => e.food_type === "dry")
    .reduce((s, e) => s + e.grams, 0);

  const usedWet = (data || [])
    .filter(e => e.food_type === "wet")
    .reduce((s, e) => s + e.grams, 0);

  const lastAt = (data && data.length) ? data[data.length - 1].created_at : null;

  return { usedDry, usedWet, lastAt };
}

/* ================= RENDER ================= */

async function render() {
  const cat = getCurrentCat();
  if (!cat) {
    $("catTable").innerHTML =
      `<tr><td class="label">Кот</td><td class="value">Не добавлен</td></tr>`;
    hide("fatWarning");
    return;
  }

  const { usedDry, usedWet, lastAt } = await loadTodayTotals(cat.id);

  const dryLeft = cat.dry_limit - usedDry;
  const wetLeft = cat.wet_limit - usedWet;

  $("fatWarning").style.display = (dryLeft < 0 || wetLeft < 0) ? "block" : "none";

  const lastTime = lastAt ? new Date(lastAt).toLocaleTimeString() : "—";

  $("catTable").innerHTML = `
    <tr>
      <td class="label">Имя</td>
      <td class="value">
        <span class="select-wrap">
          <select id="catSelect" class="cat-select" aria-label="Выбор кота">
            ${cats.map(c => `
              <option value="${c.id}" ${c.id === cat.id ? "selected" : ""}>${escapeHtml(c.name)}</option>
            `).join("")}
          </select>
        </span>
      </td>
    </tr>
    <tr>
      <td class="label">Сухой</td>
      <td class="value">${formatLeft(dryLeft)}</td>
    </tr>
    <tr>
      <td class="label">Влажный</td>
      <td class="value">${formatLeft(wetLeft)}</td>
    </tr>
    <tr>
      <td class="label">Последняя кормёжка</td>
      <td class="value">${lastTime}</td>
    </tr>
  `;

  // навешиваем handler на select каждый рендер (таблица перерисована)
  $("catSelect").addEventListener("change", async (e) => {
    currentCatId = e.target.value;
    await render();
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ================= FEEDING ================= */

function openFoodModal(mode) {
  const cat = getCurrentCat();
  if (!cat) { alert("Сначала добавьте кота"); return; }

  foodMode = mode;
  $("foodModalTitle").textContent = mode === "dry" ? "Добавить сухой корм" : "Добавить влажный корм";
  $("foodGramsInput").value = "";
  showModal("foodModal");
  // фокус — удобно на телефоне
  setTimeout(() => $("foodGramsInput").focus(), 50);
}

async function saveFood() {
  const grams = clampInt($("foodGramsInput").value);
  if (!grams || grams <= 0) { alert("Введите граммы"); return; }

  const user = await getUser();
  const cat = getCurrentCat();
  if (!user || !cat) return;

  const { error } = await supa.from("feeding_events").insert({
    cat_id: cat.id,
    food_type: foodMode,
    grams: grams,
    created_by: user.id
  });

  if (error) {
    console.log("[feeding] insert error:", error);
    alert("Не получилось добавить корм");
    return;
  }

  hideModal("foodModal");
  await render();
}

/* ================= CATS CRUD ================= */

function openCatModalForCreate() {
  editingCatId = null;
  $("catModalTitle").textContent = "Добавить кота";
  $("catNameInput").value = "";
  $("catDryInput").value = "";
  $("catWetInput").value = "";
  $("deleteCatBtn").style.display = "none";
  showModal("catModal");
  setTimeout(() => $("catNameInput").focus(), 50);
}

function openCatModalForEdit() {
  const cat = getCurrentCat();
  if (!cat) { alert("Сначала добавьте кота"); return; }

  editingCatId = cat.id;
  $("catModalTitle").textContent = "Редактировать кота";
  $("catNameInput").value = cat.name;
  $("catDryInput").value = cat.dry_limit;
  $("catWetInput").value = cat.wet_limit;
  $("deleteCatBtn").style.display = "block";
  showModal("catModal");
}

async function saveCat() {
  const name = $("catNameInput").value.trim();
  const dry = clampInt($("catDryInput").value);
  const wet = clampInt($("catWetInput").value);

  if (!name || !dry || !wet) {
    alert("Заполните имя и обе нормы");
    return;
  }

  const user = await getUser();
  if (!user) return;

  if (editingCatId) {
    const { error } = await supa
      .from("cats")
      .update({ name, dry_limit: dry, wet_limit: wet })
      .eq("id", editingCatId);

    if (error) {
      console.log("[cats] update error:", error);
      alert("Не получилось сохранить");
      return;
    }
  } else {
    const { error } = await supa
      .from("cats")
      .insert({ name, dry_limit: dry, wet_limit: wet, created_by: user.id });

    if (error) {
      console.log("[cats] insert error:", error);
      alert("Не получилось добавить кота");
      return;
    }
  }

  hideModal("catModal");
  await loadCats();
  await render();
}

async function deleteCat() {
  const cat = getCurrentCat();
  if (!cat) return;

  if (!confirm(`Удалить кота "${cat.name}"?`)) return;

  const { error } = await supa
    .from("cats")
    .delete()
    .eq("id", cat.id);

  if (error) {
    console.log("[cats] delete error:", error);
    alert("Не получилось удалить");
    return;
  }

  hideModal("catModal");
  // после удаления — обновляем список и текущего кота
  currentCatId = null;
  await loadCats();
  await render();
}

/* ================= HISTORY (avg/day by month) ================= */

async function openHistory() {
  const cat = getCurrentCat();
  if (!cat) { alert("Сначала добавьте кота"); return; }

  $("historyContent").textContent = "Загрузка…";
  showModal("historyModal");

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data, error } = await supa
    .from("feeding_events")
    .select("food_type, grams, created_at")
    .eq("cat_id", cat.id)
    .gte("created_at", sixMonthsAgo.toISOString());

  if (error) {
    console.log("[history] error:", error);
    $("historyContent").textContent = "Ошибка загрузки";
    return;
  }

  if (!data || !data.length) {
    $("historyContent").textContent = "Нет данных";
    return;
  }

  // key: YYYY-MM
  const monthly = new Map();

  for (const e of data) {
    const d = new Date(e.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const dayKey = d.toDateString();

    if (!monthly.has(key)) {
      monthly.set(key, { days: new Set(), dry: 0, wet: 0 });
    }
    const m = monthly.get(key);
    m.days.add(dayKey);
    if (e.food_type === "dry") m.dry += e.grams;
    else if (e.food_type === "wet") m.wet += e.grams;
  }

  const keys = Array.from(monthly.keys()).sort();

  let html = `<table class="history-table" style="width:100%;border-collapse:collapse;margin-top:6px;">`;
  for (const key of keys) {
    const m = monthly.get(key);
    const days = Math.max(1, m.days.size);
    const avgDry = Math.round(m.dry / days);
    const avgWet = Math.round(m.wet / days);

    html += `
      <tr>
        <td style="width:28%;"><b>${key}</b></td>
        <td>${avgDry} г сухого</td>
        <td>${avgWet} г влажного</td>
      </tr>
    `;
  }
  html += `</table>`;

  $("historyContent").innerHTML = html;
}

/* ================= WIRE EVENTS ================= */

function wireEvents() {
  $("loginBtn").addEventListener("click", login);
  $("logoutBtn").addEventListener("click", logout);
  $("forgotBtn").addEventListener("click", sendReset);

  $("addDryBtn").addEventListener("click", () => openFoodModal("dry"));
  $("addWetBtn").addEventListener("click", () => openFoodModal("wet"));
  $("saveFoodBtn").addEventListener("click", saveFood);
  $("cancelFoodBtn").addEventListener("click", () => hideModal("foodModal"));

  $("historyBtn").addEventListener("click", openHistory);
  $("closeHistoryBtn").addEventListener("click", () => hideModal("historyModal"));

  $("addCatBtn").addEventListener("click", openCatModalForCreate);
  $("editCatBtn").addEventListener("click", openCatModalForEdit);
  $("saveCatBtn").addEventListener("click", saveCat);
  $("deleteCatBtn").addEventListener("click", deleteCat);
  $("cancelCatBtn").addEventListener("click", () => hideModal("catModal"));

  $("savePasswordBtn").addEventListener("click", saveNewPassword);

  // закрытие по клику на фон
  ["catModal", "foodModal", "historyModal", "resetModal"].forEach(id => {
    $(id).addEventListener("click", (e) => {
      if (e.target === $(id)) hideModal(id);
    });
  });
}

/* ================= START ================= */

(async function start() {
  wireEvents();

  // recovery flow
  if (isRecoveryUrl()) {
    showModal("resetModal");
    hide("auth");
    hide("app");
    return;
  }

  const user = await getUser();
  if (user) await showApp();
  else showAuth();
})();
