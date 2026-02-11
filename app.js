// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";
const APP_TIMEZONE = "Europe/Podgorica";

const supa = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

/* ================= STATE ================= */

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

/* ================= LOGIN ================= */

async function login() {
  console.log("LOGIN START");

  const loginInput =
    document.getElementById("username").value.trim();
  const password =
    document.getElementById("password").value;

  if (!loginInput || !password) {
    alert("Введите логин и пароль");
    return;
  }

  let email;

  if (loginInput.includes("@")) {
    email = loginInput;
  } else {
    console.log("Username login detected");

    const { data, error } =
      await supa.rpc("get_email_by_username", {
        p_username: loginInput
      });

    if (error) {
      console.log("RPC error:", error);
      alert("Ошибка поиска пользователя");
      return;
    }

    if (!data) {
      alert("Пользователь не найден");
      return;
    }

    email = data;
  }

  console.log("AUTH EMAIL:", email);

  const { error: signError } =
    await supa.auth.signInWithPassword({
      email,
      password
    });

  if (signError) {
    console.log("AUTH ERROR:", signError);
    alert("Неверный логин или пароль");
    return;
  }

  console.log("LOGIN SUCCESS");
  showApp();
}

/* ================= LOGOUT ================= */

async function logout() {
  await supa.auth.signOut();
  showAuth();
}

/* ================= PASSWORD RESET ================= */

async function sendReset() {
  const loginInput =
    document.getElementById("username").value.trim();

  if (!loginInput) {
    alert("Введите email или username");
    return;
  }

  let email;

  if (loginInput.includes("@")) {
    email = loginInput;
  } else {
    const { data } =
      await supa.rpc("get_email_by_username", {
        p_username: loginInput
      });

    if (!data) {
      alert("Пользователь не найден");
      return;
    }

    email = data;
  }

  await supa.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href
  });

  alert("Письмо отправлено");
}

/* ================= PASSWORD RECOVERY FLOW ================= */

function showPasswordResetUI() {
  document.getElementById("auth").style.display = "none";
  document.getElementById("app").style.display = "none";
  document.getElementById("resetModal").style.display = "flex";
}

async function saveNewPassword() {
  const pass1 =
    document.getElementById("newPasswordInput").value;
  const pass2 =
    document.getElementById("confirmPasswordInput").value;

  if (!pass1 || pass1.length < 6) {
    alert("Минимум 6 символов");
    return;
  }

  if (pass1 !== pass2) {
    alert("Пароли не совпадают");
    return;
  }

  const { error } =
    await supa.auth.updateUser({
      password: pass1
    });

  if (error) {
    alert(error.message);
    return;
  }

  alert("Пароль успешно изменён");

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );

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

/* ================= AUTH EVENTS ================= */

supa.auth.onAuthStateChange(async (event) => {
  console.log("AUTH EVENT:", event);

  if (window.location.hash.includes("type=recovery")) {
    showPasswordResetUI();
    return;
  }

  if (event === "SIGNED_IN") {
    showApp();
  }

  if (event === "SIGNED_OUT") {
    showAuth();
  }
});

/* ================= EVENTS ================= */

document
  .getElementById("loginBtn")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    await login();
  });

document
  .getElementById("logoutBtn")
  .addEventListener("click", logout);

document
  .getElementById("forgotBtn")
  .addEventListener("click", sendReset);

document
  .getElementById("savePasswordBtn")
  .addEventListener("click", saveNewPassword);

/* ================= START ================= */

(async () => {
  const user = await getUser();
  user ? showApp() : showAuth();
})();
