// Ortak site davranislari: nav, mobil menu, reveal-on-scroll, oturum durumu, toast.
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    setupNav();
    setupReveal();
    setupUserState();
    setupThemeToggle();
    setupEmergencyMode();
    markActiveLink();
  });

  // ---------------- acil durum modu ----------------
  function setupEmergencyMode() {
    const fab = document.createElement("button");
    fab.className = "emergency-fab";
    fab.type = "button";
    fab.id = "emergencyFab";
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.6 17.2a1.7 1.7 0 0 0 1.5 2.6h15.8a1.7 1.7 0 0 0 1.5-2.6L13.7 3.9a1.7 1.7 0 0 0-3.4 0Z"/></svg>
      ACİL`;
    document.body.appendChild(fab);

    const overlay = document.createElement("div");
    overlay.className = "emergency-overlay";
    overlay.id = "emergencyOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="emergency-panel" role="dialog" aria-modal="true">
        <div class="emergency-head">
          <h2>🚨 Acil Durum Modu</h2>
          <button class="emergency-close" id="emergencyClose" type="button" aria-label="Kapat">✕</button>
        </div>
        <div class="em-grid">
          <div class="em-card">
            <span class="em-label">Son Deprem</span>
            <div class="em-value" id="emQuake">Yükleniyor…</div>
            <div class="em-sub" id="emQuakeSub"></div>
          </div>
          <div class="em-card">
            <span class="em-label">Aktif Yangın Tespiti</span>
            <div class="em-value" id="emFire">Yükleniyor…</div>
            <div class="em-sub" id="emFireSub">son 24 saat</div>
          </div>
        </div>
        <div class="em-numbers">
          <div class="em-number"><div class="num">112</div><div class="lbl">Acil Çağrı Merkezi</div></div>
          <div class="em-number"><div class="num">122</div><div class="lbl">AFAD İhbar Hattı</div></div>
        </div>
        <p class="em-note">
          Bu ekran gayriresmî bir özet sunar; kendi verilerimizi doğrudan aramadan kontrol etmene yardımcı olur.
          Resmî ve güncel yönlendirmeler için AFAD Deprem uygulamasını, 112'yi ve yetkili kurum duyurularını esas al.
          Deprem sırasında/sonrasında "Çök-Kapan-Tutun" kuralını uygula; bina hasarlıysa dışarı çık ve toplanma alanına git.
        </p>
      </div>`;
    document.body.appendChild(overlay);

    function open() {
      overlay.hidden = false;
      loadEmergencyData();
    }
    function close() {
      overlay.hidden = true;
    }

    fab.addEventListener("click", open);
    document.getElementById("emergencyClose").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });

    async function loadEmergencyData() {
      try {
        const r = await fetch("/api/quakes?limit=1");
        const data = await r.json();
        if (data.ok && data.data.length) {
          const q = data.data[0];
          document.getElementById("emQuake").textContent = `M${q.mag.toFixed(1)} — ${q.closestCity || q.title}`;
          document.getElementById("emQuakeSub").textContent = window.timeAgoTR(q.date.replace(" ", "T"));
        } else {
          document.getElementById("emQuake").textContent = "veri yok";
        }
      } catch {
        document.getElementById("emQuake").textContent = "bağlantı hatası";
      }
      try {
        const r2 = await fetch("/api/fires?days=1");
        const data2 = await r2.json();
        if (data2.ok) {
          document.getElementById("emFire").textContent = `${data2.count} nokta`;
        } else if (data2.reason === "no_key") {
          document.getElementById("emFire").textContent = "—";
          document.getElementById("emFireSub").textContent = "anahtar tanımlı değil";
        } else {
          document.getElementById("emFire").textContent = "veri yok";
        }
      } catch {
        document.getElementById("emFire").textContent = "bağlantı hatası";
      }
    }
  }

  // ---------------- tema (acik/koyu) ----------------
  const THEME_KEY = "havasite_theme";
  const SUN_ICON = '<svg class="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>';
  const MOON_ICON = '<svg class="theme-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20.4 14.7A8.9 8.9 0 0 1 9.3 3.6a.6.6 0 0 0-.7-.8A9.9 9.9 0 1 0 21.2 15.4a.6.6 0 0 0-.8-.7Z"/></svg>';

  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }

  function applyTheme(theme, persist = true) {
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch {}
    }
    document.querySelectorAll("[data-theme-icon]").forEach((el) => {
      el.innerHTML = theme === "light" ? SUN_ICON : MOON_ICON;
    });
    document.querySelectorAll("[data-theme-radio]").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.themeRadio === theme);
    });
  }

  window.HavaTheme = {
    get: getTheme,
    set: (t) => applyTheme(t === "light" ? "light" : "dark"),
  };

  function setupThemeToggle() {
    applyTheme(getTheme(), false);
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        applyTheme(getTheme() === "light" ? "dark" : "light");
      });
    }
  }

  // ---------------- kullanici tercihleri (profil ozellestirme) ----------------
  const PREFS_KEY = "havasite_prefs";
  const DEFAULT_PREFS = { favoriteCity: "", quakeAlertMag: 3.5 };

  function getPrefs() {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }
  function setPrefs(p) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (err) {
      console.warn("Tercihler kaydedilemedi:", err);
    }
  }
  window.HavaPrefs = { get: getPrefs, set: setPrefs };

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
      // localStorage bazi gizlilik modlarinda/kisitli baglamlarda hata firlatabilir;
      // bu durumda bile giris akisinin tikanmamasi icin hatayi yutuyoruz.
      try {
        localStorage.setItem("havasite_user", JSON.stringify(user));
      } catch (err) {
        console.warn("Oturum bilgisi kaydedilemedi (localStorage engellenmiş olabilir):", err);
      }
    },
    logout() {
      try {
        localStorage.removeItem("havasite_user");
      } catch (err) {
        console.warn("Oturum bilgisi silinemedi:", err);
      }
      location.href = "index.html";
    },
  };

  function setupUserState() {
    const slot = document.getElementById("navUser");
    if (!slot) return;
    const user = getUser();
    if (user) {
      slot.innerHTML = `
        <a class="user-chip" href="ayarlar.html" title="Profil ve ayarlar">
          <span class="user-avatar">${escapeHtml((user.name || "?").slice(0, 1).toUpperCase())}</span>
          <span class="label">${escapeHtml(user.name || user.email || "Kullanıcı")}</span>
        </a>
        <button class="logout-btn" id="logoutBtn" type="button" title="Çıkış yap">
          <span class="label">Çıkış</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>
        </button>
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

  // ---------------- deger guncellemesinde kisa "flash" animasyonu ----------------
  window.flashUpdate = function flashUpdate(el) {
    if (!el) return;
    el.classList.remove("value-flash");
    // reflow tetikleyerek animasyonun her seferinde yeniden oynamasini sagla
    void el.offsetWidth;
    el.classList.add("value-flash");
  };

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
