// Sifre sifirlama sayfasi: baglantidaki #t=... token'i ile yeni sifre belirler.
(function () {
  const form = document.getElementById("resetForm");
  const result = document.getElementById("resetResult");
  const token = new URLSearchParams(location.hash.slice(1)).get("t") || "";
  // token adres cubugunda/gecmiste kalmasin
  if (location.hash) history.replaceState(null, "", location.pathname);

  function show(msg, isError) {
    result.textContent = msg;
    result.classList.toggle("is-error", !!isError);
    result.hidden = false;
  }
  function fieldError(input, msg) {
    const small = input.closest(".field").querySelector(".field-error");
    input.classList.toggle("invalid", !!msg);
    small.textContent = msg || "";
  }

  if (!/^[0-9a-f]{64}$/.test(token)) {
    form.hidden = true;
    show("Bu bağlantı eksik ya da hatalı. Giriş sayfasındaki \"Şifremi unuttum\" ile yeni bir bağlantı isteyebilirsin.", true);
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = form.password, p2 = form.password2;
    let ok = true;
    if (p1.value.length < 8) { fieldError(p1, "Şifre en az 8 karakter olmalı."); ok = false; } else fieldError(p1, "");
    if (p2.value !== p1.value) { fieldError(p2, "Şifreler eşleşmiyor."); ok = false; } else fieldError(p2, "");
    if (!ok) return;

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const r = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, password: p1.value }),
      });
      const data = await r.json();
      if (!data.ok) { show(data.message || "Şifre güncellenemedi.", true); btn.disabled = false; return; }
      form.hidden = true;
      show(data.message + " Ana sayfaya yönlendiriliyorsun…");
      setTimeout(() => { location.href = "index.html"; }, 1800);
    } catch {
      show("Bağlantı hatası. Lütfen tekrar dene.", true);
      btn.disabled = false;
    }
  });
})();
