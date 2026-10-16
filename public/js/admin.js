(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => window.escapeHtml(String(s == null ? "" : s));

  document.addEventListener("DOMContentLoaded", () => {
    $("year") && ($("year").textContent = new Date().getFullYear());
    checkSession();
    setupLoginForm();
    $("adminLogoutBtn").addEventListener("click", logout);
    $("adRefresh").addEventListener("click", loadAll);
    $("adTestPush").addEventListener("click", testPush);
  });

  function showDashboard() {
    $("adminLoginShell").hidden = true;
    $("adminDashboard").hidden = false;
    $("adminLogoutWrap").hidden = false;
    loadAll();
  }

  function showLogin() {
    $("adminLoginShell").hidden = false;
    $("adminDashboard").hidden = true;
    $("adminLogoutWrap").hidden = true;
  }

  async function checkSession() {
    try {
      const r = await fetch("/api/admin/session", { credentials: "same-origin" });
      const data = await r.json();
      if (data.ok && data.isAdmin) showDashboard();
      else showLogin();
    } catch {
      showLogin();
    }
  }

  function setFieldError(input, message) {
    const small = input.closest(".field").querySelector(".field-error");
    input.classList.toggle("invalid", !!message);
    small.textContent = message || "";
  }

  function setupLoginForm() {
    const form = $("adminLoginForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = $("adminEmail");
      const passInput = $("adminPassword");
      setFieldError(emailInput, "");
      setFieldError(passInput, "");

      const btn = form.querySelector("button[type=submit]");
      const label = btn.querySelector(".btn-label");
      const spin = btn.querySelector(".btn-spin");
      btn.disabled = true;
      label.style.opacity = "0.4";
      spin.hidden = false;

      try {
        const r = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ email: emailInput.value.trim(), password: passInput.value }),
        });
        const data = await r.json();
        if (!data.ok) {
          if (data.reason === "not_configured") $("adminConfigHint").textContent = data.message;
          else setFieldError(passInput, data.message || "Giriş başarısız.");
          return;
        }
        form.reset();
        showDashboard();
      } catch {
        window.showToast("Sunucuya ulaşılamadı.", { accent: "var(--status-critical)" });
      } finally {
        btn.disabled = false;
        label.style.opacity = "1";
        spin.hidden = true;
      }
    });
  }

  async function logout() {
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* onemli degil, formu yine de gosteriyoruz */
    }
    showLogin();
  }

  // ---------------- bicimlendirme ----------------
  const nf = new Intl.NumberFormat("tr-TR");
  const n = (v) => nf.format(v || 0);
  function ago(ms) {
    if (!Number.isFinite(ms)) return "—";
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return "az önce";
    if (s < 3600) return `${Math.round(s / 60)} dk önce`;
    if (s < 86400) return `${Math.round(s / 3600)} sa önce`;
    return `${Math.round(s / 86400)} gün önce`;
  }
  const trTime = (iso) => new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" });
  const trDay = (ymd) => new Date(`${ymd}T12:00:00+03:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "Europe/Istanbul" });
  const afadTime = (s) => Date.parse(String(s || "").replace(" ", "T") + "+03:00");
  function fmtUptime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h < 1 ? `${m} dk` : `${h} sa ${m} dk`;
  }
  function istanbulYmd(d) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
  }

  const PAGE_NAMES = { "/": "Ana sayfa", "/hava.html": "Hava durumu", "/deprem.html": "Depremler", "/yangin.html": "Yangınlar", "/uygulama.html": "Uygulama", "/gizlilik.html": "Gizlilik", "/ayarlar.html": "Ayarlar" };
  const pageName = (p) => PAGE_NAMES[p] || p;
  const REF_NAMES = [
    [/(^|\.)google\./, "Google"], [/(^|\.)bing\.com$/, "Bing"], [/(^|\.)yandex\./, "Yandex"], [/duckduckgo\.com$/, "DuckDuckGo"],
    [/linkedin|lnkd\.in/, "LinkedIn"], [/^t\.co$|(^|\.)x\.com$|twitter\.com$/, "X (Twitter)"], [/facebook|^fb\.me$/, "Facebook"],
    [/instagram/, "Instagram"], [/whatsapp/, "WhatsApp"], [/telegram|^t\.me$/, "Telegram"], [/(^|\.)reddit\.com$/, "Reddit"],
  ];
  const refName = (r) => (!r ? "Doğrudan / bilinmiyor" : (REF_NAMES.find(([re]) => re.test(r)) || [null, r])[1]);
  let regionNames = null;
  try { regionNames = new Intl.DisplayNames(["tr"], { type: "region" }); } catch { /* eski tarayici */ }
  const countryName = (c) => (!c ? "Bilinmiyor" : (regionNames && regionNames.of(c)) || c);

  // ---------------- grafik ve listeler ----------------
  // tek seri sutun grafigi: tek renk, ustune gelince deger; en yuksek ve son sutun etiketli
  function barChart(el, items) {
    const max = Math.max(1, ...items.map((i) => i.v));
    const peak = items.reduce((b, i, k) => (i.v > items[b].v ? k : b), 0);
    el.innerHTML = `<div class="ad-bars">${items
      .map((i, k) => {
        const h = Math.round((i.v / max) * 100);
        const label = (k === peak && i.v) || k === items.length - 1 ? `<span class="ad-bar-val">${n(i.v)}</span>` : "";
        return `<div class="ad-bar-col" tabindex="0" data-tip="${esc(i.tip)}">${label}<span class="ad-bar" style="height:${i.v ? Math.max(h, 3) : 0}%"></span></div>`;
      })
      .join("")}</div><div class="ad-axis">${items.map((i) => `<span>${esc(i.label)}</span>`).join("")}</div>`;
  }

  function list(el, rows, nameOf) {
    if (!rows.length) { el.innerHTML = '<p class="ad-empty">Henüz veri yok.</p>'; return; }
    const total = rows.reduce((s, r) => s + r.n, 0) || 1;
    const max = Math.max(...rows.map((r) => r.n));
    el.innerHTML = rows
      .map((r) => `<div class="ad-row"><span class="ad-row-name">${esc(nameOf(r))}</span><span class="ad-row-num">${n(r.n)} <small>%${Math.round((r.n / total) * 100)}</small></span><span class="ad-row-bar"><i style="width:${Math.round((r.n / max) * 100)}%"></i></span></div>`)
      .join("");
  }

  function renderVisits(v) {
    const t = v.totals || {};
    $("vV1").textContent = n(t.v1);
    $("vP1").textContent = `ziyaret · ${n(t.p1)} sayfa`;
    $("vV7").textContent = n(t.v7);
    $("vP7").textContent = `ziyaret · ${n(t.p7)} sayfa`;
    $("vV30").textContent = n(t.v30);
    $("vP30").textContent = `ziyaret · ${n(t.p30)} sayfa`;
    $("vPer").textContent = t.v7 ? (t.p7 / t.v7).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) : "—";

    // eksik gunler sifir olarak doldurulur
    const byDay = new Map(v.daily.map((d) => [d.d, d]));
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const ymd = istanbulYmd(new Date(Date.now() - i * 864e5));
      const d = byDay.get(ymd) || { v: 0, p: 0 };
      days.push({ v: d.v, label: i % 2 === 1 ? "" : trDay(ymd).replace(/\s.*/, ""), tip: `${trDay(ymd)} · ${n(d.v)} ziyaret · ${n(d.p)} sayfa` });
    }
    barChart($("vDaily"), days);

    const byHour = new Map(v.hourly.map((h) => [h.h, h.v]));
    const nowHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(new Date())) % 24;
    const hours = [];
    for (let h = 0; h <= nowHour; h++) hours.push({ v: byHour.get(h) || 0, label: h % 3 === 0 ? String(h).padStart(2, "0") : "", tip: `${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59 · ${n(byHour.get(h) || 0)} ziyaret` });
    barChart($("vHourly"), hours);

    list($("vPages"), v.pages.map((r) => ({ ...r, key: r.path })), (r) => pageName(r.path));
    // ayni siteye ait farkli alan adlarini (google.com, google.com.tr) tek satirda topla
    const refs = new Map();
    v.refs.forEach((r) => refs.set(refName(r.ref), (refs.get(refName(r.ref)) || 0) + r.n));
    list($("vRefs"), [...refs].map(([name, cnt]) => ({ name, n: cnt })).sort((a, b) => b.n - a.n), (r) => r.name);
    list($("vDevices"), v.devices, (r) => r.device.charAt(0).toLocaleUpperCase("tr") + r.device.slice(1));
    list($("vCountries"), v.countries, (r) => countryName(r.country));

    $("vRecent").innerHTML = v.recent.length
      ? v.recent
          .map((r, i) => `<tr style="--i:${i}"><td><b>${esc(trTime(r.at))}</b> <small class="ad-muted">${esc(ago(Date.parse(r.at)))}</small></td><td>${esc(pageName(r.path))}</td><td>${r.entry ? esc(refName(r.ref)) : '<span class="ad-muted">site içinden</span>'}</td><td>${esc(r.device)}${r.app ? ' <small class="ad-muted">· ana ekran</small>' : ""}</td><td>${esc(countryName(r.country))}</td></tr>`)
          .join("")
      : '<tr><td colspan="5" class="ad-empty">Henüz ziyaret kaydı yok.</td></tr>';
  }

  function renderPush(p) {
    $("pTotal").textContent = n(p.total);
    $("pNew").textContent = `son 7 günde +${n(p.new7)} · ${n(p.located)} konumlu`;
    $("pQuake").textContent = n(p.quake);
    $("pWx").textContent = n(Math.max(p.wx_daily, p.wx_alerts));
    $("pWxSub").textContent = `sabah özeti ${n(p.wx_daily)} · uyarı ${n(p.wx_alerts)}`;
    $("pFire").textContent = n(p.fire);

    const log = p.log || {};
    const days = log.days || {};
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const ymd = istanbulYmd(new Date(Date.now() - i * 864e5));
      const d = days[ymd] || { sent: 0, failed: 0, removed: 0 };
      rows.push(`<tr><td>${esc(i === 0 ? "Bugün" : trDay(ymd))}</td><td>${n(d.sent)}</td><td>${d.failed ? `<span class="ad-bad">${n(d.failed)}</span>` : 0}</td><td>${n(d.removed)}</td></tr>`);
    }
    $("pDays").innerHTML = rows.join("");
    const errs = (log.lastErrors || []).length ? ` · <span class="ad-bad">son çalışmada sorun: ${esc(log.lastErrors.join(", "))}</span>` : "";
    $("pLast").innerHTML = log.lastRunAt
      ? `Son tarama ${esc(ago(Date.parse(log.lastRunAt)))} · son gönderim ${log.lastSendAt ? esc(ago(Date.parse(log.lastSendAt))) : "henüz yok"}${errs}`
      : "Tarama kaydı henüz yok (her 2 dakikada bir çalışır).";
  }

  // durum: ok | warn | bad -> renk + yazi (renk tek basina anlam tasimaz)
  const BADGE = { ok: ["Çalışıyor", "ad-st-ok"], warn: ["Dikkat", "ad-st-warn"], bad: ["Sorun var", "ad-st-bad"], off: ["Kapalı", "ad-st-off"] };
  const healthRow = (icon, name, state, detail) =>
    `<div class="admin-status-row"><span><span class="ic" data-icon="${icon}" data-icon-size="15"></span> ${esc(name)}</span><span class="ad-health-detail">${detail}</span><span class="ad-st ${BADGE[state][1]}">${BADGE[state][0]}</span></div>`;

  function renderHealth(h, stats) {
    const s = h.sources;
    const rows = [];
    const qT = afadTime(s.afad.newest);
    rows.push(healthRow("wave", "AFAD deprem verisi", !s.afad.ok ? "bad" : s.afad.source === "afad" ? "ok" : "warn",
      s.afad.ok ? `${s.afad.source === "afad" ? "resmî API" : s.afad.source === "afad-live" ? "yedek: AFAD canlı tablo" : "yedek: EMSC"} · son deprem ${esc(ago(qT))} · ${s.afad.ms} ms` : esc(s.afad.error || "alınamadı")));
    rows.push(healthRow("satellite", "NASA FIRMS yangın verisi", !s.firms.ok ? (s.firms.error === "no_key" ? "off" : "bad") : "ok",
      s.firms.ok ? `son 24 saatte ${n(s.firms.count)} ısı noktası${s.firms.newest ? ` · son tespit ${esc(ago(Date.parse(s.firms.newest)))}` : ""}` : esc(s.firms.error === "no_key" ? "anahtar tanımlı değil" : s.firms.error || "alınamadı")));
    const wxAge = s.openMeteo.updated ? Date.now() - Date.parse(s.openMeteo.updated) : Infinity;
    rows.push(healthRow("cloud-sun", "Open-Meteo hava verisi", !s.openMeteo.ok ? "bad" : wxAge > 30 * 60000 ? "warn" : "ok",
      s.openMeteo.ok ? `${n(s.openMeteo.count)} il · güncellendi ${esc(ago(Date.parse(s.openMeteo.updated)))}` : esc(s.openMeteo.error || "alınamadı")));
    rows.push(healthRow("database", "Veritabanı", s.db.ok ? "ok" : "bad", s.db.ok ? `${s.db.ms} ms` : esc(s.db.error || "bağlantı yok")));
    const lastRun = stats && stats.push.log && stats.push.log.lastRunAt ? Date.parse(stats.push.log.lastRunAt) : NaN;
    const runAge = Date.now() - lastRun;
    rows.push(healthRow("bell", "Bildirim zamanlayıcısı", !s.push.ok ? "off" : !Number.isFinite(lastRun) || runAge > 15 * 60000 ? "bad" : runAge > 6 * 60000 ? "warn" : "ok",
      !s.push.ok ? "bildirim anahtarları tanımlı değil" : Number.isFinite(lastRun) ? `son tarama ${esc(ago(lastRun))} · 2 dakikada bir` : "henüz tarama kaydı yok"));
    if (stats) rows.push(healthRow("cpu", "Sunucu", "ok", `çalışma süresi ${esc(fmtUptime(stats.uptimeSeconds))} · Node ${esc(stats.nodeVersion)}`));
    $("hRows").innerHTML = rows.join("");
    window.hydrateIcons($("hRows"));
  }

  let lastStats = null;
  async function loadAll() {
    $("adUpdated").textContent = "Yükleniyor…";
    const [stats, health] = await Promise.all([
      fetch("/api/admin/stats", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
      fetch("/api/admin/health", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
    ]);
    if (stats && stats.reason === "unauthorized") return showLogin();
    if (stats && stats.ok) {
      lastStats = stats.stats;
      renderVisits(lastStats.visits);
      renderPush(lastStats.push);
    } else {
      window.showToast((stats && stats.message) || "İstatistikler alınamadı.", { accent: "var(--status-critical)" });
    }
    if (health && health.ok) renderHealth(health, lastStats);
    else $("hRows").innerHTML = '<p class="ad-empty">Durum alınamadı.</p>';
    $("adUpdated").textContent = `Güncellendi: ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  }

  // bu tarayicinin bildirim aboneligine deneme bildirimi (mevcut /api/push/test ucu)
  async function testPush() {
    try {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
      const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
      if (!sub) {
        window.showToast("Bu cihazda bildirim açık değil. Önce Ayarlar → Bildirimler'den aç.", { duration: 5000 });
        return;
      }
      const r = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      const data = await r.json().catch(() => ({}));
      window.showToast(data.ok ? "Test bildirimi gönderildi." : data.message || "Gönderilemedi.", { accent: data.ok ? "var(--status-good)" : "var(--status-critical)" });
    } catch {
      window.showToast("Test bildirimi gönderilemedi.", { accent: "var(--status-critical)" });
    }
  }
})();
