// Ortak site davranislari: nav, mobil menu, reveal-on-scroll, oturum durumu, toast.
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    setupNav();
    setupReveal();
    setupUserState();
    markActiveLink();
  });

  function setupNav() {
    const nav = document.querySelector(".site-nav");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const burger = document.querySelector(".hamburger");
    const links = document.querySelector(".nav-links");
    if (burger && links) {
      burger.addEventListener("click", () => links.classList.toggle("open"));
      links.querySelectorAll("a").forEach((a) =>
        a.addEventListener("click", () => links.classList.remove("open"))
      );
    }
  }

  function markActiveLink() {
    const path = location.pathname.replace(/\/$/, "").split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a[data-page]").forEach((a) => {
      if (a.dataset.page === path) a.classList.add("active");
    });
  }

  function setupReveal() {
    const targets = document.querySelectorAll(".reveal, .reveal-scale");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("in-view"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    targets.forEach((t) => io.observe(t));
  }

  // ---------------- oturum (demo, sadece localStorage) ----------------
  function getUser() {
    try {
      return JSON.parse(localStorage.getItem("havasite_user") || "null");
    } catch {
      return null;
    }
  }
  window.HavaAuth = {
    getUser,
    login(user) {
      localStorage.setItem("havasite_user", JSON.stringify(user));
    },
    logout() {
      localStorage.removeItem("havasite_user");
      location.href = "index.html";
    },
  };

  function setupUserState() {
    const slot = document.getElementById("navUser");
    if (!slot) return;
    const user = getUser();
    if (user) {
      slot.innerHTML = `
        <span class="user-chip">
          <span class="user-avatar">${escapeHtml((user.name || "?").slice(0, 1).toUpperCase())}</span>
          <span class="label">${escapeHtml(user.name || user.email || "Kullanıcı")}</span>
        </span>
        <button class="btn btn-ghost btn-sm" id="logoutBtn" type="button">Çıkış</button>
      `;
      document.getElementById("logoutBtn").addEventListener("click", () => window.HavaAuth.logout());
    } else {
      slot.innerHTML = `<a class="btn btn-primary btn-sm" href="login.html"><span class="label">Giriş Yap</span> →</a>`;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  window.escapeHtml = escapeHtml;

  // ---------------- toast ----------------
  function ensureToastStack() {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }
  window.showToast = function showToast(message, opts = {}) {
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    if (opts.accent) el.style.borderColor = opts.accent;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .35s ease, transform .35s ease";
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      setTimeout(() => el.remove(), 350);
    }, opts.duration || 4200);
  };

  // ---------------- zaman bicimleme ----------------
  window.timeAgoTR = function timeAgoTR(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(String(dateInput).replace(" ", "T"));
    const diffMs = Date.now() - d.getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 5) return "az önce";
    if (s < 60) return `${s} sn önce`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} dk önce`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} sa önce`;
    const dd = Math.floor(h / 24);
    return `${dd} gün önce`;
  };

  window.formatClock = function formatClock(date) {
    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
})();
