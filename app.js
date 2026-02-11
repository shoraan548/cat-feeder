
/* ================== CONFIG ================== */
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";
const APP_TIMEZONE = "Europe/Podgorica";

const supa = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let cats = [];
let currentCat = null;

/* ========= AUTH ========= */

async function login() {
  const email =
    document.getElementById("username").value.trim();
  const password =
    document.getElementById("password").value;

  const { error } =
    await supa.auth.signInWithPassword({ email, password });

  if (error) return alert("Ошибка входа");

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

  const { data } = await supa.auth.getUser();
  document.getElementById("who").textContent =
    data.user.email;

  loadCats();
}

/* ========= CATS ========= */

async function loadCats() {
  const { data } = await supa
    .from("cats")
    .select("*");

  cats = data || [];
  currentCat = cats[0] || null;

  render();
}

function render() {
  if (!currentCat) return;

  const table = document.getElementById("catTable");

  table.innerHTML = `
    <tr>
      <td class="label">Имя</td>
      <td>
        <select id="catSelect">
          ${cats.map(c =>
            `<option value="${c.id}" ${
              c.id === currentCat.id ? "selected" : ""
            }>${c.name}</option>`
          ).join("")}
        </select>
      </td>
    </tr>
  `;

  renderStats();
}

async function renderStats() {
  const { data } = await supa
    .from("feeding_events")
    .select("*")
    .eq("cat_id", currentCat.id);

  const usedDry = data
    ?.filter(e=>e.food_type==="dry")
    .reduce((s,e)=>s+e.grams,0) || 0;

  const usedWet = data
    ?.filter(e=>e.food_type==="wet")
    .reduce((s,e)=>s+e.grams,0) || 0;

  const dryLeft = currentCat.dry_limit - usedDry;
  const wetLeft = currentCat.wet_limit - usedWet;

  const table = document.getElementById("catTable");

  table.innerHTML += `
    <tr>
      <td class="label">Сухой</td>
      <td>${formatValue(dryLeft)}</td>
    </tr>
    <tr>
      <td class="label">Влажный</td>
      <td>${formatValue(wetLeft)}</td>
    </tr>
  `;

  document.getElementById("catSelect")
    .addEventListener("change", (e)=>{
      currentCat = cats.find(c=>c.id===e.target.value);
      render();
    });
}

function formatValue(v) {
  if (v >= 0) return `${v} г осталось`;
  return `<span class="red">${Math.abs(v)} г перебор</span>`;
}

/* ========= EVENTS ========= */

document.getElementById("loginBtn")
  .addEventListener("click", login);

document.getElementById("logoutBtn")
  .addEventListener("click", logout);

(async ()=>{
  const { data } = await supa.auth.getUser();
  data.user ? showApp() : showAuth();
})();
