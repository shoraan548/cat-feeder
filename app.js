// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";

// ================== INIT ==================
if (!window.supabase) {
  alert("Supabase CDN не загрузился");
  throw new Error("Supabase CDN not loaded");
}

const supa = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ================== DOM ==================
const authBlock = document.getElementById("auth");
const appBlock = document.getElementById("app");

const logEl = document.getElementById("log");
const outputEl = document.getElementById("output");
const catsListEl = document.getElementById("catsList");

function log(msg) {
  logEl.textContent += msg + "\n";
}

// ================== AUTH ==================

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Введите email и пароль");
    return;
  }

  log("Вход…");

  const { error } = await supa.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    log("Ошибка входа: " + error.message);
    alert(error.message);
  } else {
    log("Вход успешен ✅");
  }
}

async function register() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Введите email и пароль");
    return;
  }

  log("Регистрация…");

  const { data, error } = await supa.auth.signUp({
    email,
    password
  });

  if (error) {
    log("Ошибка регистрации: " + error.message);
    alert(error.message);
    return;
  }

  const userId = data.user.id;

  // добавляем пользователя в members
  const { error: memberError } = await supa
    .from("members")
    .insert({ user_id: userId });

  if (memberError) {
    log("Ошибка добавления в members: " + memberError.message);
    alert(memberError.message);
    return;
  }

  log("Регистрация завершена ✅");
}

// ================== SESSION ==================

async function checkExistingSession() {
  const { data, error } = await supa.auth.getSession();

  if (error) {
    log("Ошибка получения сессии: " + error.message);
    return;
  }

  if (data.session) {
    log("Сессия найдена, входим автоматически ✅");
    authBlock.style.display = "none";
    appBlock.style.display = "block";
    loadCats();
  } else {
    log("Сессии нет, нужен вход");
  }
}

supa.auth.onAuthStateChange((event, session) => {
  log("Auth event: " + event);

  if (session) {
    authBlock.style.display = "none";
    appBlock.style.display = "block";
    loadCats();
  }
});

// ================== CATS ==================

async function loadCats() {
  const { data, error } = await supa
    .from("cats")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    catsListEl.textContent = "Ошибка: " + error.message;
    return;
  }

  if (!data.length) {
    catsListEl.textContent = "Котов пока нет";
    return;
  }

  catsListEl.textContent = data
    .map(c => `🐱 ${c.name}\n  🥣 ${c.dry_limit} г  🥫 ${c.wet_limit} г`)
    .join("\n\n");
}

async function addCat() {
  const name = document.getElementById("catName").value.trim();
  const dry = parseInt(document.getElementById("dryLimit").value, 10);
  const wet = parseInt(document.getElementById("wetLimit").value, 10);

  if (!name || isNaN(dry) || isNaN(wet)) {
    alert("Заполни имя и нормы");
    return;
  }

  const { error } = await supa.from("cats").insert({
    name,
    dry_limit: dry,
    wet_limit: wet
  });

  if (error) {
    alert(error.message);
    return;
  }

  document.getElementById("catName").value = "";
  document.getElementById("dryLimit").value = "";
  document.getElementById("wetLimit").value = "";

  loadCats();
}

// ================== EVENTS ==================
document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("registerBtn").addEventListener("click", register);
document.getElementById("addCatBtn").addEventListener("click", addCat);

// ================== START ==================
log("JS загружен ✅");
checkExistingSession();
