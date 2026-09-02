// Ortak site davranislari: nav, mobil menu, reveal-on-scroll, oturum durumu, toast.
(function () {
  "use strict";

  // ---------------- ortak harita zemini ----------------
  // CARTO'nun ucretsiz dark_all zemini artik anahtar istiyor ("API KEY REQUIRED"
  // filigrani). Esri'nin "Dark Gray Canvas" servisi anahtarsiz, ucretsiz ve koyu;
  // navy temaya yaklastirmak icin hafif bir CSS filtresiyle karartiliyor
  // (bkz. base.css .hava-basemap).
  window.HavaMap = {
    addBaseLayer: function (map) {
      if (typeof L === "undefined" || !map) return;
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap", maxZoom: 16, className: "hava-basemap" }
      ).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, className: "hava-basemap-ref" }
      ).addTo(map);
    },
  };

  // ---------------- kurumsal ikon seti (inline SVG, Lucide tarzi) ----------------
  // Kullanim: HTML'de <span class="ic" data-icon="map-pin"></span> ya da
  // JS'te window.HavaIcon("map-pin", { size: 16, cls: "..." })
  const ICON_PATHS = {
    "map-pin": '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    navigation: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
    globe: '<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5c3 3.2 3 15.8 0 19-3-3.2-3-15.8 0-19Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    "trending-up": '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/>',
    compass: '<circle cx="12" cy="12" r="9"/><polygon points="15.6 8.4 10.6 10.6 8.4 15.6 13.4 13.4"/>',
    "bar-chart": '<line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/>',
    layers: '<polygon points="12 3 21 8 12 13 3 8 12 3"/><polyline points="3 13 12 18 21 13"/>',
    play: '<polygon points="7 4 20 12 7 20 7 4"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    flame: '<path d="M12 3c1.6 3.6-1 5.2-1 8 0 2 1.7 3.2 3.2 3.2 2.2 0 3.4-1.9 3.4-4C21 13.5 21 16.5 21 18.5A9 9 0 0 1 3 18.5C3 15 5 12.5 6.4 10.7c.3 2 1.6 3 2.9 3 1.1 0-1.3-1.7 2.7-10.7Z"/>',
    thermometer: '<path d="M14 14.5V5a2.5 2.5 0 0 0-5 0v9.5a5 5 0 1 0 5 0Z"/>',
    "moon-star": '<path d="M20 14a8 8 0 1 1-9.9-9.9A6.5 6.5 0 0 0 20 14Z"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8"/>',
    "alert-triangle": '<path d="M12 3.2 2.3 20a1 1 0 0 0 .9 1.5h17.6a1 1 0 0 0 .9-1.5L12 3.2Z"/><line x1="12" y1="9.5" x2="12" y2="14"/><circle cx="12" cy="17.3" r="0.4" fill="currentColor" stroke="none"/>',
    x: '<line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/><line x1="18.5" y1="5.5" x2="5.5" y2="18.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M16 5a3.5 3.5 0 0 1 0 7M21.5 20.5c0-2.7-1.6-5-4-6.1"/>',
    "user-plus": '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20.5c0-3.6 2.9-6.5 6.5-6.5c1.5 0 2.9.5 4 1.4"/><line x1="18" y1="12.5" x2="18" y2="18.5"/><line x1="15" y1="15.5" x2="21" y2="15.5"/>',
    key: '<circle cx="8" cy="15" r="4.2"/><path d="m11 12 9-9M17.5 5.5l2.5 2.5M14.5 8.5l2 2"/>',
    database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v13c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-13M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c0-4 3.4-7 7.5-7s7.5 3 7.5 7"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.6 0 2-1.3 1-2.3-.9-1-.4-2.7 1-2.7h1.8a4.7 4.7 0 0 0 4.7-4.7c0-4-3.8-7.3-9.5-7.3Z"/><circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1.1" fill="currentColor" stroke="none"/>',
    "shield-check": '<path d="M12 3.2 5 6v6c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6l-7-2.8Z"/><path d="m9.2 12 2 2 3.6-4.2"/>',
    check: '<polyline points="4.5 12.5 9.5 17.5 19.5 6.5"/>',
    droplet: '<path d="M12 3.3s5.8 6.3 5.8 10.7a5.8 5.8 0 0 1-11.6 0C6.2 9.6 12 3.3 12 3.3Z"/>',
    wind: '<path d="M3 9h10a3 3 0 1 0-3-4"/><path d="M3 14.5h15a3 3 0 1 1-3 4"/>',
    "arrow-right": '<line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
    sunrise: '<path d="M4 18.5h16M12 4v6M8.5 8 12 4.2 15.5 8M3 14.5h1.8M19.2 14.5H21M5.8 10.8 4.5 9.5M18.2 10.8l1.3-1.3"/><path d="M8.2 18.5a3.8 3.8 0 0 1 7.6 0"/>',
    sunset: '<path d="M4 18.5h16M12 10V4M8.5 6.5 12 10.3 15.5 6.5M3 14.5h1.8M19.2 14.5H21M5.8 10.8 4.5 9.5M18.2 10.8l1.3-1.3"/><path d="M8.2 18.5a3.8 3.8 0 0 1 7.6 0"/>',
    satellite: '<path d="m4 10 6-6 4 4-6 6-4-4Z"/><path d="m9.5 14.5 5-5"/><path d="M13.5 19a6 6 0 0 0 6-6M16 21.5a9 9 0 0 0 5.5-5.5"/>',
    map: '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
    radio: '<circle cx="12" cy="12" r="2"/><path d="M8 8a5.5 5.5 0 0 0 0 8M16 16a5.5 5.5 0 0 0 0-8M5.2 5.2a9.5 9.5 0 0 0 0 13.6M18.8 18.8a9.5 9.5 0 0 0 0-13.6"/>',
    backpack: '<path d="M6 9a6 6 0 0 1 12 0v9.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 18.5Z"/><path d="M9 9V6.5a3 3 0 0 1 6 0V9M8.5 14h7"/>',
    phone: '<path d="M6.5 3.5 9 4l1 4-2 1.5a10 10 0 0 0 5 5L15.5 17l4 1 .5 2.5a2 2 0 0 1-2 2.3A17 17 0 0 1 2 6.5a2 2 0 0 1 2.3-2Z"/>',
    "refresh-cw": '<path d="M20 8a8 8 0 0 0-14-3L4 7M4 4v3h3"/><path d="M4 16a8 8 0 0 0 14 3l2-2M20 20v-3h-3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.5" fill="currentColor" stroke="none"/>',
    gauge: '<path d="M4 19a8 8 0 1 1 16 0"/><path d="M12 15 15 10"/>',
    "log-out": '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  };

  window.HavaIcon = function HavaIcon(name, opts = {}) {
    const p = ICON_PATHS[name];
    if (!p) return "";
    const size = opts.size || 20;
    const cls = opts.cls ? ` ${opts.cls}` : "";
    const sw = opts.strokeWidth || 1.75;
    return `<svg class="ic${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  };

  function hydrateIcons(root) {
    (root || document).querySelectorAll("[data-icon]:not([data-icon-done])").forEach((el) => {
      const svg = window.HavaIcon(el.dataset.icon, {
        size: parseInt(el.dataset.iconSize, 10) || 18,
        strokeWidth: el.dataset.iconStroke ? parseFloat(el.dataset.iconStroke) : undefined,
      });
      if (svg) {
        el.innerHTML = svg;
        el.setAttribute("data-icon-done", "");
      }
    });
  }
  window.hydrateIcons = hydrateIcons;

  document.addEventListener("DOMContentLoaded", () => {
    hydrateIcons();
    setupNav();
    setupReveal();
    setupThemeToggle();
    setupEmergencyMode();
    markActiveLink();

    window.HavaAuth.ready.then((user) => {
      const page = location.pathname.split("/").pop() || "index.html";

      if (!user) {
        // Misafir kotasi: giris yapmadan gunde birkac sayfa serbest, sonra giris duvari.
        if (document.body.hasAttribute("data-guest-quota")) {
          if (!window.HavaQuota.pageAlreadyCounted(page) && !window.HavaQuota.canView()) {
            location.replace(`login.html?redirect=${encodeURIComponent(page)}&reason=quota`);
            return;
          }
          window.HavaQuota.countPage(page);
        } else if (document.body.hasAttribute("data-require-auth")) {
          location.replace(`login.html?redirect=${encodeURIComponent(page)}`);
          return;
        }
      }

      setupUserState(user);
      document.documentElement.classList.remove("auth-pending");
      document.dispatchEvent(new CustomEvent("havasite:auth-ready", { detail: { user } }));

      if (!user && window.HavaQuota.remaining() <= 1 && document.body.hasAttribute("data-guest-quota")) {
        const left = window.HavaQuota.remaining();
        window.showToast(
          left === 0
            ? "Bu, bugünkü son ücretsiz görüntülemendi. Sonraki ziyarette giriş yapman gerekecek."
            : "Bugün 1 ücretsiz görüntüleme hakkın kaldı — ücretsiz hesapla sınırsız devam edebilirsin.",
          { accent: "var(--accent)", duration: 6000 }
        );
      }
    });
  });

  // ---------------- misafir goruntuleme kotasi ----------------
  // Tamamen istemci tarafinda (localStorage). Amac: giris olmadan tadına bakılabilsin,
  // sonra kayit/giris'e yonlendirilsin. Gunluk sifirlanir; ayni sekmede sayfa
  // yenilemek kotadan dusmesin diye sessionStorage ile isaretlenir.
  const QUOTA_KEY = "havasite_guest_quota";
  const QUOTA_LIMIT = 5;
  const todayStr = () => new Date().toISOString().slice(0, 10);

  function readQuota() {
    try {
      const raw = JSON.parse(localStorage.getItem(QUOTA_KEY) || "{}");
      if (raw.date !== todayStr()) return { date: todayStr(), count: 0 };
      return { date: raw.date, count: Math.max(0, raw.count | 0) };
    } catch {
      return { date: todayStr(), count: 0 };
    }
  }
  function writeQuota(q) {
    try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch {}
  }

  window.HavaQuota = {
    limit: QUOTA_LIMIT,
    used: () => Math.min(QUOTA_LIMIT, readQuota().count),
    remaining: () => Math.max(0, QUOTA_LIMIT - readQuota().count),
    canView: () => readQuota().count < QUOTA_LIMIT,
    pageAlreadyCounted(page) {
      try { return sessionStorage.getItem("havasite_view_" + page) === "1"; } catch { return false; }
    },
    countPage(page) {
      if (this.pageAlreadyCounted(page)) return this.remaining();
      const q = readQuota();
      if (q.count < QUOTA_LIMIT) { q.count += 1; writeQuota(q); }
      try { sessionStorage.setItem("havasite_view_" + page, "1"); } catch {}
      return this.remaining();
    },
  };

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
          <h2>${window.HavaIcon("alert-triangle", { size: 22 })} Acil Durum Modu</h2>
          <button class="emergency-close" id="emergencyClose" type="button" aria-label="Kapat">${window.HavaIcon("x", { size: 18 })}</button>
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
    const urlTheme = new URLSearchParams(location.search).get("theme");
    if (urlTheme === "light" || urlTheme === "dark") applyTheme(urlTheme, true);
    else applyTheme(getTheme(), false);
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

  // ---------------- oturum (sunucu tarafli, imzali cerez) ----------------
  // Sayfa acilir acilmaz oturumu sunucuya sorar (window.HavaAuth.ready). Senkron
  // erisim gerektiren kod HavaAuth.ready.then(...) ile beklemeli; DOMContentLoaded'da
  // bu beklendikten sonra nav ve sayfa koruma (data-require-auth/-admin) uygulanir.
  let sessionUser = null;

  function fetchSession() {
    return fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        sessionUser = data.ok ? data.user : null;
        return sessionUser;
      })
      .catch(() => {
        sessionUser = null;
        return null;
      });
  }

  window.HavaAuth = {
    ready: fetchSession(),
    getUser: () => sessionUser,
    async refresh() {
      window.HavaAuth.ready = fetchSession();
      return window.HavaAuth.ready;
    },
    async logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      } catch (err) {
        console.warn("Cikis sirasinda hata:", err);
      }
      sessionUser = null;
      location.href = "index.html";
    },
  };

  function setupUserState(user) {
    const slot = document.getElementById("navUser");
    if (!slot) return;
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
      const onLoginPage = /login\.html$/.test(location.pathname);
      const onQuotaPage = document.body.hasAttribute("data-guest-quota");
      if (onLoginPage || !onQuotaPage) {
        slot.innerHTML = `<a class="btn btn-primary btn-sm" href="login.html"><span class="label">Giriş Yap</span>${window.HavaIcon("arrow-right", { size: 15 })}</a>`;
        return;
      }
      const used = window.HavaQuota.used();
      const limit = window.HavaQuota.limit;
      const remaining = window.HavaQuota.remaining();
      const dots = Array.from({ length: limit }, (_, i) =>
        `<span class="gq-dot${i < used ? " spent" : ""}"></span>`
      ).join("");
      slot.innerHTML = `
        <span class="guest-quota${remaining <= 1 ? " low" : ""}" title="Misafir olarak bugün ${remaining}/${limit} ücretsiz görüntüleme hakkın kaldı">
          <span class="gq-text">Misafir</span>
          <span class="gq-dots" aria-hidden="true">${dots}</span>
          <a class="gq-login" href="login.html?redirect=${encodeURIComponent(location.pathname.split("/").pop() || "index.html")}">Giriş</a>
        </span>`;
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

  // ---------------- animasyonlu range slider dolgusu ----------------
  // filter-bar / field icindeki <input type="range"> elemanlarini CSS'te
  // tanimli --fill degiskenine baglar, boylece topuzun soluna dogru renkli
  // bir "dolgu" izlenimi olusur ve deger degistikce yumusakca guncellenir.
  window.bindRangeFill = function bindRangeFill(input) {
    if (!input) return;
    const update = () => {
      const min = parseFloat(input.min || "0");
      const max = parseFloat(input.max || "100");
      const val = parseFloat(input.value);
      const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
      input.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct))}%`);
    };
    input.addEventListener("input", update);
    update();
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
