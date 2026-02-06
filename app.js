// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "PASTE_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PASTE_PUBLIC_ANON_KEY";
const REDIRECT_URL = "https://shoraan548.github.io/cat-feeder/";

// ================== ПРОВЕРКИ ==================
if (!window.supabase) {
  alert("Supabase CDN не загрузился");
  throw new Error("Supabase CDN not loaded");
}

// ⚠️ ВАЖНО: НЕ называем переменную supabase
const supa = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ================== UI ==================
const authBlock = document.getElementById("auth");
const appBlock = document.getElementById("app");
const logEl = document.getElementById("log");
const outputEl = document.getElementById("output");

function log(msg) {
  logEl.textContent += msg + "\n";
}

// ================== AUTH ==================
async function login() {
  const email = document.getElementById("email").value.trim();
  if (!email) {
    alert("Введите email");
    return;
  }

  log("Отправляю magic link…");

  const { error } = await supa.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: REDIRECT_URL
    }
  });

  if (error) {
    log("Ошибка: " + error.message);
    alert(error.message);
  } else {
    log("Готово. Проверь почту ✉️");
    alert("Проверь почту ✉️");
  }
}

// ================== STATE ==================
async function checkSession() {
  const { data } = await supa.auth.getSession();
  if (data.session) {
    authBlock.style.display = "none";
    appBlock.style.display = "block";
    log("Сессия активна ✅");
  } else {
    log("Сессии нет (ок)");
  }
}

supa.auth.onAuthStateChange((event, session) => {
  log("Auth event: " + event);
  if (session) {
    authBlock.style.display = "none";
    appBlock.style.display = "block";
  }
});

// ================== DATA ==================
async function loadCats() {
  const { data, error } = await supa.from("cats").select("*");
  if (error) {
    outputEl.textContent = "Ошибка: " + error.message;
  } else {
    outputEl.textContent = JSON.stringify(data, null, 2);
  }
}

// ================== EVENTS ==================
document.getElementById("loginBtn").addEventListener("click", login);
document.getElementById("loadCatsBtn").addEventListener("click", loadCats);

// ================== START ==================
checkSession();
