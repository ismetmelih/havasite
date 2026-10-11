// Ayarlar > Bildirimler: deprem, hava (sabah ozeti + uyarilar) ve yakindaki yangin bildirimleri (Web Push).
(function () {
  const $ = (id) => document.getElementById(id);
  const PREF_KEY = "havasite_notify";

  function b64ToUint8(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  function savedPref() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || "{}"); } catch { return {}; }
  }
  function savePref(p) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
  }
  async function post(url, body) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify(body) });
    return r.json();
  }
  function status(msg, kind) {
    const el = $("nfStatus");
    el.textContent = msg;
    el.className = `notify-status ${kind || ""}`;
  }
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no-geo"));
      navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const form = $("nfForm");
    if (!form) return;
    const el = {
      place: $("nfPlace"), quakeOn: $("nfQuakeOn"), mag: $("nfMag"), magVal: $("nfMagVal"), radius: $("nfRadius"),
      wxDaily: $("nfWxDaily"), wxHour: $("nfWxHour"), wxAlerts: $("nfWxAlerts"), fireOn: $("nfFireOn"), fireRadius: $("nfFireRadius"),
    };
    // il listesi (konum secimi)
    (window.TR_CITIES || []).forEach((c) => {
      const o = document.createElement("option");
      o.value = `il:${c.name}`;
      o.textContent = c.name;
      el.place.appendChild(o);
    });

    // kayitli tercihleri forma yukle
    const pref = savedPref();
    if (pref.place) el.place.value = pref.place;
    el.quakeOn.checked = pref.quakeOn !== false;
    if (pref.minMag) el.mag.value = pref.minMag;
    if (pref.radiusKm) el.radius.value = String(pref.radiusKm);
    el.wxDaily.checked = !!pref.wxDaily;
    if (pref.wxHour) el.wxHour.value = String(pref.wxHour);
    el.wxAlerts.checked = !!pref.wxAlerts;
    el.fireOn.checked = !!pref.fireOn;
    if (pref.fireRadiusKm) el.fireRadius.value = String(pref.fireRadiusKm);
    el.magVal.textContent = Number(el.mag.value).toFixed(1);
    window.bindRangeFill && window.bindRangeFill(el.mag);
    el.mag.addEventListener("input", () => { el.magVal.textContent = Number(el.mag.value).toFixed(1); });

    // acik olmayan grubun ayarlari gizlensin
    function syncGroups() {
      $("nfQuakeOpts").hidden = !el.quakeOn.checked;
      $("nfWxDailyOpts").hidden = !el.wxDaily.checked;
      $("nfFireOpts").hidden = !el.fireOn.checked;
    }
    [el.quakeOn, el.wxDaily, el.fireOn].forEach((c) => c.addEventListener("change", syncGroups));
    syncGroups();

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      if (isIOS && !standalone) {
        status("iPhone'da bildirimler yalnızca ana ekrana eklenen uygulamada çalışır.", "warn");
        $("nfIos").hidden = false;
      } else {
        status("Bu tarayıcı bildirimleri desteklemiyor.", "warn");
      }
      $("nfSave").disabled = true;
      return;
    }

    let key;
    try { key = await fetch("/api/push/key").then((r) => r.json()); } catch { key = null; }
    if (!key || !key.enabled) {
      status("Bildirim sistemi şu an etkin değil.", "warn");
      $("nfSave").disabled = true;
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    function summary(p) {
      const parts = [];
      if (p.quakeOn !== false) parts.push(`M${Number(p.minMag || 4).toFixed(1)}+ deprem${p.radiusKm ? ` (${p.radiusKm} km)` : ""}`);
      if (p.wxDaily) parts.push(`${String(p.wxHour || 7).padStart(2, "0")}:00 hava özeti`);
      if (p.wxAlerts) parts.push("hava uyarıları");
      if (p.fireOn) parts.push(`${p.fireRadiusKm} km içinde yangın`);
      return parts.join(" · ") + (p.placeName ? ` — ${p.placeName}` : "");
    }
    function render() {
      if (Notification.permission === "denied") {
        status("Bildirim izni engellenmiş. Tarayıcı/telefon ayarlarından bu site için bildirimlere izin ver.", "warn");
      } else if (sub) {
        status(`Açık: ${summary(savedPref())}.`, "ok");
      } else {
        status("Kapalı.", "");
      }
      $("nfSave").textContent = sub ? "Ayarları kaydet" : "Bildirimleri aç";
      $("nfActions").hidden = !sub;
    }
    render();

    // secilen konumu koordinata cevir
    async function resolvePlace() {
      const v = el.place.value;
      if (!v) return null;
      if (v === "gps") {
        status("Konumun alınıyor…", "");
        const c = await getPosition();
        return { lat: c.latitude, lon: c.longitude, placeName: "Konumun" };
      }
      const name = v.slice(3);
      const c = (window.TR_CITIES || []).find((x) => x.name === name);
      return c ? { lat: c.lat, lon: c.lon, placeName: c.name } : null;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const wantsLoc = el.wxDaily.checked || el.wxAlerts.checked || el.fireOn.checked || (el.quakeOn.checked && el.radius.value);
      if (!el.quakeOn.checked && !el.wxDaily.checked && !el.wxAlerts.checked && !el.fireOn.checked) {
        window.showToast("En az bir bildirim türü seç.", { accent: "var(--status-warning)" });
        return;
      }
      if (wantsLoc && !el.place.value) {
        window.showToast("Hava, yangın ve yakınlık bildirimleri için önce bir bildirim konumu seç.", { accent: "var(--status-warning)" });
        el.place.focus();
        return;
      }
      const btn = $("nfSave");
      btn.disabled = true;
      status("Kaydediliyor…", "");
      try {
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") { render(); return; }
        }
        let loc = null;
        try { loc = await resolvePlace(); } catch {
          window.showToast("Konum alınamadı. Listeden bir il seçebilirsin.", { accent: "var(--status-warning)" });
          return;
        }
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key.publicKey) });
        const body = {
          subscription: sub.toJSON(),
          quakeOn: el.quakeOn.checked, minMag: Number(el.mag.value), radiusKm: el.radius.value ? Number(el.radius.value) : null,
          wxDaily: el.wxDaily.checked, wxHour: Number(el.wxHour.value), wxAlerts: el.wxAlerts.checked,
          fireOn: el.fireOn.checked, fireRadiusKm: Number(el.fireRadius.value),
          ...(loc || {}),
        };
        const data = await post("/api/push/subscribe", body);
        if (!data.ok) throw new Error(data.message || "Kaydedilemedi");
        savePref({
          place: el.place.value, placeName: data.placeName || "", quakeOn: data.quakeOn, minMag: data.minMag, radiusKm: data.radiusKm || null,
          wxDaily: data.wxDaily, wxHour: data.wxHour, wxAlerts: data.wxAlerts, fireOn: data.fireOn, fireRadiusKm: data.fireRadiusKm,
        });
        window.showToast("Bildirim ayarların kaydedildi", { accent: "var(--status-good)" });
      } catch (err) {
        window.showToast(err.message || "Bildirimler açılamadı.", { accent: "var(--status-critical)" });
      } finally {
        btn.disabled = false;
        render();
      }
    });

    $("nfTest").addEventListener("click", async () => {
      if (!sub) return;
      const data = await post("/api/push/test", { endpoint: sub.endpoint }).catch(() => ({ ok: false }));
      window.showToast(data.ok ? "Test bildirimi gönderildi." : data.message || "Gönderilemedi.", { accent: data.ok ? "var(--status-good)" : "var(--status-critical)" });
    });

    $("nfOff").addEventListener("click", async () => {
      if (!sub) return;
      await post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
      sub = null;
      savePref({});
      window.showToast("Tüm bildirimler kapatıldı.");
      render();
    });
  });
})();
