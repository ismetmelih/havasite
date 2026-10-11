(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    // kota duvarindan gelindiyse aciklayici not goster
    const params = new URLSearchParams(location.search);
    if (params.get("reason") === "quota") {
      const notice = document.getElementById("quotaNotice");
      if (notice) notice.hidden = false;
      const reg = document.querySelector('.auth-tab[data-tab="register"]');
      if (reg) reg.click();
    }

    // zaten girisliyse hedef sayfaya yonlendir
    window.HavaAuth.ready.then((user) => {
      if (user) location.replace(redirectTarget());
    });

    setupTabs();
    setupForms();

    setupForgot();
  });

  // ---- sifremi unuttum: e-posta ile sifirlama baglantisi iste ----
  function setupForgot() {
    const link = document.getElementById("forgotLink");
    const loginForm = document.getElementById("loginForm");
    const form = document.getElementById("forgotForm");
    const result = document.getElementById("forgotResult");
    const tabs = document.querySelector(".auth-tabs");
    if (!link || !form) return;

    const show = (forgot) => {
      loginForm.hidden = forgot;
      form.hidden = !forgot;
      if (tabs) tabs.hidden = forgot;
      result.hidden = true;
      if (forgot) {
        form.email.value = loginForm.email.value;
        form.email.focus();
      }
    };
    link.addEventListener("click", (e) => { e.preventDefault(); show(true); });
    document.getElementById("forgotBack").addEventListener("click", () => show(false));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      if (!isEmail(email)) return setFieldError(form.email, "Geçerli bir e-posta gir.");
      setFieldError(form.email, "");
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        const r = await fetch("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await r.json();
        result.textContent = data.message || "İstek alındı.";
        result.classList.toggle("is-error", !data.ok);
        result.hidden = false;
      } catch {
        result.textContent = "Bağlantı hatası. Lütfen tekrar dene.";
        result.classList.add("is-error");
        result.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".auth-tab");
    const indicator = document.getElementById("tabIndicator");
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const isRegister = tab.dataset.tab === "register";
        indicator.classList.toggle("to-register", isRegister);
        loginForm.hidden = isRegister;
        registerForm.hidden = !isRegister;
      });
    });
  }

  function setFieldError(input, message) {
    const small = input.closest(".field").querySelector(".field-error");
    input.classList.toggle("invalid", !!message);
    small.textContent = message || "";
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  function redirectTarget() {
    const params = new URLSearchParams(location.search);
    const target = params.get("redirect");
    // acik yonlendirme (open redirect) engeli: sadece bu sitedeki .html sayfalarina izin ver
    if (target && /^[a-zA-Z0-9_-]+\.html$/.test(target)) return target;
    return "index.html";
  }

  function setupForms() {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const email = loginForm.email;
      const password = loginForm.password;
      let ok = true;

      if (!isEmail(email.value.trim())) {
        setFieldError(email, "Geçerli bir e-posta gir.");
        ok = false;
      } else setFieldError(email, "");

      if (!password.value) {
        setFieldError(password, "Şifreni gir.");
        ok = false;
      } else setFieldError(password, "");

      if (!ok) return;

      submitAuth(loginForm, "/api/auth/login", {
        email: email.value.trim(),
        password: password.value,
        remember: !!(loginForm.remember && loginForm.remember.checked),
      });
    });

    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = registerForm.name;
      const email = registerForm.email;
      const password = registerForm.password;
      const password2 = registerForm.password2;
      let ok = true;

      if (name.value.trim().length < 2) {
        setFieldError(name, "Adını yazar mısın?");
        ok = false;
      } else setFieldError(name, "");

      if (!isEmail(email.value.trim())) {
        setFieldError(email, "Geçerli bir e-posta gir.");
        ok = false;
      } else setFieldError(email, "");

      if (password.value.length < 8) {
        setFieldError(password, "Şifre en az 8 karakter olmalı.");
        ok = false;
      } else setFieldError(password, "");

      if (password2.value !== password.value) {
        setFieldError(password2, "Şifreler eşleşmiyor.");
        ok = false;
      } else setFieldError(password2, "");

      if (!ok) return;

      submitAuth(registerForm, "/api/auth/register", {
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
      });
    });
  }

  async function submitAuth(form, endpoint, payload) {
    const btn = form.querySelector("button[type=submit]");
    const label = btn.querySelector(".btn-label");
    const spin = btn.querySelector(".btn-spin");
    btn.disabled = true;
    label.style.opacity = "0.4";
    spin.hidden = false;

    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = await r.json();

      if (!data.ok) {
        window.showToast(data.message || "Bir şeyler ters gitti, tekrar dener misin?", { accent: "var(--status-critical)" });
        if (data.reason === "email_taken") setFieldError(form.email, "Bu e-posta zaten kayıtlı.");
        if (data.reason === "invalid_credentials") {
          setFieldError(form.email, " ");
          setFieldError(form.password, "Hatalı e-posta veya şifre.");
        }
        return;
      }

      await window.HavaAuth.refresh();
      form.hidden = true;
      document.querySelectorAll(".auth-tabs")[0].style.display = "none";
      const success = document.getElementById("authSuccess");
      document.getElementById("successName").textContent = ", " + (data.user.name || data.user.email);
      success.hidden = false;

      setTimeout(() => {
        location.href = redirectTarget();
      }, 1300);
    } catch (err) {
      console.warn("Giriş/kayıt sırasında beklenmeyen hata:", err);
      window.showToast("Sunucuya ulaşılamadı, bağlantını kontrol edip tekrar dene.", { accent: "var(--status-critical)" });
    } finally {
      btn.disabled = false;
      label.style.opacity = "1";
      spin.hidden = true;
    }
  }
})();
