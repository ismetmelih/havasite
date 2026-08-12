(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    if (window.initHeroBG) {
      window.initHeroBG("heroCanvas", { colors: ["#2a78d6", "#6da7ec", "#eb6834"], count: 500, radius: 6.4 });
    }

    // zaten girisliyse ana sayfaya yonlendir
    if (window.HavaAuth.getUser()) {
      window.showToast && window.showToast("Zaten giriş yapılmış görünüyor.");
    }

    setupTabs();
    setupTilt();
    setupForms();

    const forgot = document.getElementById("forgotLink");
    if (forgot) {
      forgot.addEventListener("click", (e) => {
        e.preventDefault();
        window.showToast && window.showToast("Demo modunda şifre sıfırlama devre dışı.");
      });
    }
  });

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

  function setupTilt() {
    const card = document.getElementById("authCard");
    const wrap = card.closest(".auth-card-wrap");
    if (!card || !wrap) return;
    const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    if (isCoarse) return;

    wrap.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `rotateY(${px * 8}deg) rotateX(${-py * 8}deg) translateZ(6px)`;
    });
    wrap.addEventListener("mouseleave", () => {
      card.style.transform = "rotateY(0deg) rotateX(0deg) translateZ(0)";
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

      if (password.value.length < 6) {
        setFieldError(password, "Şifre en az 6 karakter olmalı.");
        ok = false;
      } else setFieldError(password, "");

      if (!ok) return;

      const name = email.value.split("@")[0];
      submitWithLoading(loginForm, { name, email: email.value.trim() });
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

      if (password.value.length < 6) {
        setFieldError(password, "Şifre en az 6 karakter olmalı.");
        ok = false;
      } else setFieldError(password, "");

      if (password2.value !== password.value) {
        setFieldError(password2, "Şifreler eşleşmiyor.");
        ok = false;
      } else setFieldError(password2, "");

      if (!ok) return;

      submitWithLoading(registerForm, { name: name.value.trim(), email: email.value.trim() });
    });
  }

  function submitWithLoading(form, user) {
    const btn = form.querySelector("button[type=submit]");
    const label = btn.querySelector(".btn-label");
    const spin = btn.querySelector(".btn-spin");
    btn.disabled = true;
    label.style.opacity = "0.4";
    spin.hidden = false;

    setTimeout(() => {
      try {
        window.HavaAuth.login(user);
      } catch (err) {
        // HavaAuth.login kendi icinde de yakaliyor ama son bir guvenlik agi olarak
        // burada da yutuyoruz ki kullanici hicbir sekilde "takili" kalmasin.
        console.warn("Giriş sırasında beklenmeyen hata:", err);
      }
      form.hidden = true;
      document.querySelectorAll(".auth-tabs")[0].style.display = "none";
      const success = document.getElementById("authSuccess");
      document.getElementById("successName").textContent = ", " + (user.name || user.email);
      success.hidden = false;

      setTimeout(() => {
        location.href = "index.html";
      }, 1300);
    }, 900);
  }
})();
