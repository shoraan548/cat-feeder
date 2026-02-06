const SUPABASE_URL = "PASTE_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PASTE_PUBLIC_ANON_KEY";

const supabase = supabaseJs.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

async function login() {
  const email = document.getElementById("email").value;
  if (!email) {
    alert("Введите email");
    return;
  }

  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) {
    alert(error.message);
  } else {
    alert("Проверь почту ✉️");
  }
}

supabase.auth.onAuthStateChange((event, session) => {
  if (session) {
    document.getElementById("auth").style.display = "none";
    document.getElementById("app").style.display = "block";
  }
});

async function loadCats() {
  const { data, error } = await supabase
    .from("cats")
    .select("*");

  if (error) {
    document.getElementById("output").textContent = error.message;
  } else {
    document.getElementById("output").textContent =
      JSON.stringify(data, null, 2);
  }
}
