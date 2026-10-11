// Ayarlar > Bildirimler: deprem bildirimlerine abone olma (Web Push).
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
    const mag = $("nfMag"), magVal = $("nfMagVal"), radius = $("nfRadius");
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

    const pref = savedPref();
    if (pref.minMag) mag.value = pref.minMag;
    if (pref.radiusKm) radius.value = String(pref.radiusKm);
    magVal.textContent = Number(mag.value).toFixed(1);
    window.bindRangeFill && window.bindRangeFill(mag);
    mag.addEventListener("input", () => { magVal.textContent = Number(mag.value).toFixed(1); });

    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      if (isIOS && !standalone) {
        status("iPhone'da bildirimler yalnızca ana ekrana eklenen uygulamada çalışır.", "warn");
        $("nfIos").hidden = false;
      } else {
        status("Bu tarayıcı bildirimleri desteklemiyor.", "warn");
      }
      form.querySelector("#nfSave").disabled = true;
      return;
    }

    let key;
    try { key = await fetch("/api/push/key").then((r) => r.json()); } catch { key = null; }
    if (!key || !key.enabled) {
      status("Bildirim sistemi şu an etkin değil.", "warn");
      form.querySelector("#nfSave").disabled = true;
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    function render() {
      if (Notification.permission === "denied") {
        status("Bildirim izni engellenmiş. Tarayıcı/telefon ayarlarından bu site için bildirimlere izin ver.", "warn");
      } else if (sub) {
        const p = savedPref();
        status(`Açık — M${Number(p.minMag || mag.value).toFixed(1)}+ depremler, ${p.radiusKm ? `konumuna ${p.radiusKm} km içinde` : "tüm Türkiye"}.`, "ok");
      } else {
        status("Kapalı.", "");
      }
      $("nfSave").textContent = sub ? "Ayarları kaydet" : "Bildirimleri aç";
      $("nfActions").hidden = !sub;
    }
    render();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = $("nfSave");
      btn.disabled = true;
      status("Bildirimler açılıyor…", "");
      try {
        if (Notification.permission !== "granted") {
          const perm = await Notification.requestPermission();
          if (perm !== "granted") { render(); return; }
        }
        if (!sub) {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key.publicKey) });
        }
        const body = { subscription: sub.toJSON(), minMag: Number(mag.value) };
        if (radius.value) {
          status("Konumun alınıyor…", "");
          try {
            const c = await getPosition();
            body.lat = c.latitude; body.lon = c.longitude; body.radiusKm = Number(radius.value);
          } catch {
            window.showToast("Konum alınamadı; bildirimler tüm Türkiye için açıldı.", { accent: "var(--status-warning)" });
            radius.value = "";
          }
        }
        const data = await post("/api/push/subscribe", body);
        if (!data.ok) throw new Error(data.message || "Kaydedilemedi");
        savePref({ minMag: data.minMag, radiusKm: data.radiusKm || null });
        window.showToast("Deprem bildirimleri açık", { accent: "var(--status-good)" });
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
      window.showToast("Deprem bildirimleri kapatıldı.");
      render();
    });
  });
})();
