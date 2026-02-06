// ================== НАСТРОЙКИ ==================
const SUPABASE_URL = "https://kuixkqezshxqposjchpa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aXhrcWV6c2h4cXBvc2pjaHBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzODA1NDAsImV4cCI6MjA4NTk1NjU0MH0.T7u-MqEkjj5Yohwd3Ys8IIgtr13ISxJEF43nrM1nRZg";
const REDIRECT_URL = "https://shoraan548.github.io/cat-feeder/";

// ================== ПРОВЕРКА CDN ==================
if (!window.supabase) {
  alert("Supabase CDN не загрузился");
  throw new Error("Supabase CDN not loaded");
}

// ⚠️ не называем переменную supabase
const supa = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// ================== DOM ==================
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
    options: { emailRedirectTo: REDIRECT_URL }
  });

  if (error) {
    log("Ошибка: " + error.message);
    alert(error.message);
  } else {
    log("Проверь почту ✉️");
    alert("Проверь почту ✉️");
  }
}

// ================== STATE ==================
function initAuthListener() {
  supa.auth.onAuthStateChange((event, session) => {
    log("Auth event: " + event);
    if (session) {
      authBlock.style.display = "none";
      appBlock.style.display = "block";
    }
  });
}

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
initAuthListener();
log("Страница загружена");
