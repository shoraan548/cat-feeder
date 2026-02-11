// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";

// фиксированная таймзона для всей семьи
const APP_TIMEZONE = "Europe/Podgorica";

const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentCat = null;
let editingCatId = null;
let foodMode = null;

/* ================= HELPERS ================= */

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

async function getUser() {
  const { data } = await supa.auth.getUser();
  return data.user;
}

async function getProfile() {
  const user = await getUser();
  if (!user) return null;

  const { data } = await supa
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return data;
}

/* ================= AUTH ================= */

async function login() {
  const loginInput = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  if (!loginInput || !password) {
    alert("Введите логин и пароль");
    return;
  }

  let email = null;

  // если похоже на email
  if (loginInput.includes("@")) {
    email = loginInput;
  } else {
    // это username → получаем email через RPC
    const { data, error } = await supa.rpc(
      "get_email_by_username",
      { p_username: loginInput }
    );

    if (error || !data) {
      alert("Пользователь не найден");
      return;
    }

    email = data;
  }

  const { error: signError } =
    await supa.auth.signInWithPassword({
      email,
      password
    });

  if (signError) {
    alert("Неверный пароль");
    return;
  }

  showApp();
}

async function logout() {
  await supa.auth.signOut();
  showAuth();
}

async function sendReset() {
  const username = document.getElementById("username").value.trim();
  if (!username) return alert("Введите логин");

  await supa.auth.resetPasswordForEmail(
    `${username}@local`,
    { redirectTo: window.location.href }
  );

  alert("Письмо отправлено");
}

/* ================= PASSWORD RESET ================= */

function showPasswordResetUI() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "none";
  document.getElementById("resetModal").style.display = "flex";
}

async function saveNewPassword() {
  const pass1 = document.getElementById("newPasswordInput").value;
  const pass2 = document.getElementById("confirmPasswordInput").value;

  if (pass1.length < 6) return alert("Минимум 6 символов");
  if (pass1 !== pass2) return alert("Пароли не совпадают");

  const { error } = await supa.auth.updateUser({
    password: pass1
  });

  if (error) return alert("Ошибка обновления");

  alert("Пароль обновлён");
  await supa.auth.signOut();
}

/* ================= UI ================= */

async function showApp() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "block";

  const profile = await getProfile();
  document.getElementById("who").textContent =
    profile?.full_name || "Пользователь";

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
  const user = await getUser();
  if (!user) return;

  const { data } = await supa
    .from("cats")
    .select("*")
    .eq("created_by", user.id)
    .limit(1);

  if (!data?.length) {
    currentCat = null;
    document.getElementById("catTable").innerHTML =
      `<tr><td class="label">Кот</td><td>Не добавлен</td></tr>`;
    return;
  }

  currentCat = data[0];

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
    <tr><td class="label">Сухой</td><td>${Math.max(dryLeft,0)} г осталось</td></tr>
    <tr><td class="label">Влажный</td><td>${Math.max(wetLeft,0)} г осталось</td></tr>
    <tr><td class="label">Последняя кормёжка</td>
    <td>${lastTime ? new Date(lastTime).toLocaleTimeString() : "—"}</td></tr>
  `;
}

/* ================= EVENTS ================= */

document.getElementById("loginBtn").onclick = login;
document.getElementById("logoutBtn").onclick = logout;
document.getElementById("forgotBtn").onclick = sendReset;
document.getElementById("savePasswordBtn").onclick = saveNewPassword;

/* ================= AUTH LISTENER ================= */

async function checkRecoveryFromUrl() {
  const hash = window.location.hash;

  if (hash.includes("type=recovery")) {
    showPasswordResetUI();
    return true;
  }

  return false;
}

supa.auth.onAuthStateChange(async (event, session) => {

  if (event === "PASSWORD_RECOVERY") {
    showPasswordResetUI();
    return;
  }

  if (event === "SIGNED_IN") {
    const isRecovery = await checkRecoveryFromUrl();

    if (!isRecovery) {
      showApp();
    }
  }

  if (event === "SIGNED_OUT") {
    showAuth();
  }
});

(async () => {
  const recoveryHandled = await checkRecoveryFromUrl();

  if (recoveryHandled) return;

  const user = await getUser();
  user ? showApp() : showAuth();
})();
