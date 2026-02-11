
/* ================== CONFIG ================== */
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";
const APP_TIMEZONE = "Europe/Podgorica";

const supa = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let currentCat = null;
let foodMode = null;
let editingCatId = null;

/* ===== Helpers ===== */

function showModal(id) {
  const m = document.getElementById(id);
  m.classList.add("show");
}

function hideModal(id) {
  const m = document.getElementById(id);
  m.classList.remove("show");
}

function todayStartISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString();
}

async function getUser() {
  const { data } = await supa.auth.getUser();
  return data.user;
}

/* ===== AUTH ===== */

async function login() {
  const loginInput =
    document.getElementById("username").value.trim();
  const password =
    document.getElementById("password").value;

  if (!loginInput || !password) return;

  let email = loginInput;

  if (!loginInput.includes("@")) {
    const { data } =
      await supa.rpc("get_email_by_username", {
        p_username: loginInput
      });
    if (!data) return alert("Пользователь не найден");
    email = data;
  }

  const { error } =
    await supa.auth.signInWithPassword({ email, password });

  if (error) return alert("Неверный логин или пароль");

  showApp();
}

async function logout() {
  await supa.auth.signOut();
  showAuth();
}

function showAuth() {
  document.getElementById("auth").style.display = "block";
  document.getElementById("app").style.display = "none";
}

async function showApp() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "block";

  const user = await getUser();
  document.getElementById("who").textContent = user.email;

  loadCats();
}

/* ===== CATS ===== */

async function loadCats() {
  const user = await getUser();
  const { data } = await supa
    .from("cats")
    .select("*")
    .eq("created_by", user.id);

  if (!data?.length) return;

  currentCat = data[0];
  renderCatDropdown(data);
  loadCat();
}

function renderCatDropdown(cats) {
  const table = document.getElementById("catTable");

  table.innerHTML = `
    <tr>
      <td class="label">Имя</td>
      <td>
        <div class="select-wrapper">
          <select id="catSelect">
            ${cats.map(c =>
              `<option value="${c.id}">${c.name}</option>`
            ).join("")}
          </select>
        </div>
      </td>
    </tr>
  `;

  document.getElementById("catSelect")
    .addEventListener("change", async (e)=>{
      const { data } = await supa
        .from("cats")
        .select("*")
        .eq("id", e.target.value)
        .single();
      currentCat = data;
      loadCat();
    });
}

async function loadCat() {
  const { data: events } = await supa
    .from("feeding_events")
    .select("*")
    .eq("cat_id", currentCat.id)
    .gte("created_at", todayStartISO());

  const usedDry = events
    ?.filter(e=>e.food_type==="dry")
    .reduce((s,e)=>s+e.grams,0) || 0;

  const usedWet = events
    ?.filter(e=>e.food_type==="wet")
    .reduce((s,e)=>s+e.grams,0) || 0;

  const dryLeft = currentCat.dry_limit - usedDry;
  const wetLeft = currentCat.wet_limit - usedWet;

  function format(v) {
    if (v >= 0) return `${v} г осталось`;
    return `<span class="red">${Math.abs(v)} г перебор</span>`;
  }

  document.getElementById("catTable").innerHTML += `
    <tr><td class="label">Сухой</td><td>${format(dryLeft)}</td></tr>
    <tr><td class="label">Влажный</td><td>${format(wetLeft)}</td></tr>
  `;

  document.getElementById("fatWarning").style.display =
    (dryLeft < 0 || wetLeft < 0)
      ? "block" : "none";
}

/* ===== Feeding ===== */

function openFoodModal(mode) {
  foodMode = mode;
  document.getElementById("foodModalTitle").textContent =
    mode === "dry"
      ? "Добавить сухой корм"
      : "Добавить влажный корм";
  showModal("foodModal");
}

async function saveFood() {
  const grams =
    parseInt(document.getElementById("foodGramsInput").value,10);
  if (!grams || grams <= 0) return;

  const user = await getUser();

  await supa.from("feeding_events").insert({
    cat_id: currentCat.id,
    food_type: foodMode,
    grams,
    created_by: user.id
  });

  hideModal("foodModal");
  loadCat();
}

/* ===== History ===== */

async function openHistory() {

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data } = await supa
    .from("feeding_events")
    .select("*")
    .eq("cat_id", currentCat.id)
    .gte("created_at", sixMonthsAgo.toISOString());

  if (!data?.length) {
    document.getElementById("historyContent")
      .innerHTML = "Нет данных";
  } else {

    const monthly = {};

    data.forEach(e => {
      const d = new Date(e.created_at);
      const key = `${d.getFullYear()}-${d.getMonth()+1}`;

      if (!monthly[key])
        monthly[key] = {days:new Set(),dry:0,wet:0};

      monthly[key].days.add(d.toDateString());

      if (e.food_type==="dry")
        monthly[key].dry += e.grams;
      else
        monthly[key].wet += e.grams;
    });

    let html = "<table>";

    Object.keys(monthly).sort().forEach(key=>{
      const days = monthly[key].days.size;
      const avgDry =
        Math.round(monthly[key].dry / days);
      const avgWet =
        Math.round(monthly[key].wet / days);

      html += `
        <tr>
          <td>${key}</td>
          <td>${avgDry} г сухого</td>
          <td>${avgWet} г влажного</td>
        </tr>
      `;
    });

    html += "</table>";
    document.getElementById("historyContent")
      .innerHTML = html;
  }

  showModal("historyModal");
}

/* ===== Events ===== */

document.getElementById("loginBtn")
  .addEventListener("click", login);

document.getElementById("logoutBtn")
  .addEventListener("click", logout);

document.getElementById("forgotBtn")
  .addEventListener("click", ()=>alert("Сброс через Supabase"));

document.getElementById("addDryBtn")
  .addEventListener("click", ()=>openFoodModal("dry"));

document.getElementById("addWetBtn")
  .addEventListener("click", ()=>openFoodModal("wet"));

document.getElementById("saveFoodBtn")
  .addEventListener("click", saveFood);

document.getElementById("cancelFoodBtn")
  .addEventListener("click", ()=>hideModal("foodModal"));

document.getElementById("historyBtn")
  .addEventListener("click", openHistory);

document.getElementById("closeHistoryBtn")
  .addEventListener("click", ()=>hideModal("historyModal"));

/* ===== START ===== */

(async ()=>{
  const user = await getUser();
  user ? showApp() : showAuth();
})();
