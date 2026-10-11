(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
    setupTabs();
    setupThemeOptions();
    fillCitySelects();
    setupPrefs();
    setupContacts();
    setupAppPanel();
    setupChecklist();
  });

  function setupTabs() {
    const tabsWrap = document.querySelector(".settings-tabs");
    const tabs = document.querySelectorAll(".settings-tab");
    const indicator = document.createElement("span");
    indicator.className = "settings-tab-indicator";
    tabsWrap.appendChild(indicator);

    function moveIndicator(tab) {
      indicator.style.width = `${tab.offsetWidth}px`;
      indicator.style.transform = `translateX(${tab.offsetLeft}px)`;
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".settings-panel").forEach((p) => p.classList.remove("active"));
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
        moveIndicator(tab);
      });
    });

    // giristeki kisayol dugmeleri
    document.querySelectorAll("[data-settings-tab]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.querySelector(`.settings-tab[data-tab="${a.dataset.settingsTab}"]`);
      if (t) { t.click(); tabsWrap.scrollIntoView({ behavior: "smooth", block: "start" }); history.replaceState(null, "", `#${a.dataset.settingsTab}`); }
    }));

    // adresle dogrudan sekme acma (orn. ayarlar.html#bildirimler)
    const fromHash = document.querySelector(`.settings-tab[data-tab="${location.hash.slice(1)}"]`);
    if (fromHash) fromHash.click();

    // ilk konum + pencere yeniden boyutlaninca hizala
    requestAnimationFrame(() => moveIndicator(document.querySelector(".settings-tab.active")));
    window.addEventListener("resize", () => moveIndicator(document.querySelector(".settings-tab.active")));
  }

  function setupThemeOptions() {
    document.querySelectorAll(".theme-option").forEach((el) => {
      el.addEventListener("click", () => {
        window.HavaTheme.set(el.dataset.themeRadio);
        window.showToast(`Tema: ${el.dataset.themeRadio === "light" ? "Açık" : "Koyu"}`);
      });
    });
  }

  function fillCitySelects() {
    const sel = document.getElementById("fCity");
    if (!sel) return;
    (window.TR_CITIES || []).forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      sel.appendChild(opt);
    });
  }

  function setupPrefs() {
    const prefs = window.HavaPrefs.get();
    const city = document.getElementById("fCity"), start = document.getElementById("fStart");
    const mag = document.getElementById("fMag"), magVal = document.getElementById("fMagVal");
    city.value = prefs.favoriteCity || "";
    start.value = prefs.startPage || "";
    mag.value = prefs.quakeAlertMag;
    magVal.textContent = Number(prefs.quakeAlertMag).toFixed(1);
    window.bindRangeFill && window.bindRangeFill(mag);
    mag.addEventListener("input", () => { magVal.textContent = Number(mag.value).toFixed(1); });
    document.getElementById("prefsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      window.HavaPrefs.set({ favoriteCity: city.value, startPage: start.value, quakeAlertMag: parseFloat(mag.value) });
      window.showToast("Tercihler kaydedildi", { accent: "var(--status-good)" });
    });
  }

  // ---------------- acil durum kisileri (Guvendeyim mesaji bunlara gider) ----------------
  function setupContacts() {
    const form = document.getElementById("contactsForm");
    if (!form) return;
    const data = window.HavaContacts.get();
    const rows = document.getElementById("contactRows");
    rows.innerHTML = [0, 1, 2].map((i) => {
      const c = data.list[i] || {};
      return `<div class="contact-row">
        <label class="field"><span>Kişi ${i + 1}</span><input type="text" name="n${i}" maxlength="30" placeholder="Ad (ör. Annem)" value="${window.escapeHtml(c.name || "")}" /></label>
        <label class="field"><span class="sr-only">Kişi ${i + 1} telefon</span><input type="tel" name="p${i}" maxlength="20" inputmode="tel" placeholder="05xx xxx xx xx" value="${window.escapeHtml(c.phone || "")}" /></label>
      </div>`;
    }).join("");
    document.getElementById("safeMsg").value = data.msg || "";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const list = [];
      for (let i = 0; i < 3; i++) {
        const name = form[`n${i}`].value.trim(), phone = form[`p${i}`].value.replace(/[^\d+]/g, "");
        if (phone && phone.replace(/\D/g, "").length < 10) { window.showToast(`Kişi ${i + 1}: telefon numarası eksik görünüyor.`, { accent: "var(--status-warning)" }); return; }
        if (phone) list.push({ name, phone });
      }
      window.HavaContacts.set({ list, msg: document.getElementById("safeMsg").value.trim() });
      window.showToast(list.length ? `${list.length} acil durum kişisi kaydedildi` : "Acil durum kişileri temizlendi", { accent: "var(--status-good)" });
    });
  }

  // ---------------- uygulama: onbellek, sifirlama, surum ----------------
  async function setupAppPanel() {
    document.querySelectorAll("[data-install]").forEach((b) => b.addEventListener("click", () => window.HavaInstall && window.HavaInstall.prompt()));
    const info = document.getElementById("cacheInfo");
    async function cacheSize() {
      if (!("caches" in window)) { info.textContent = "Bu tarayıcı çevrimdışı kopyayı desteklemiyor."; return; }
      try {
        let files = 0;
        for (const k of await caches.keys()) files += (await (await caches.open(k)).keys()).length;
        let mb = "";
        if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); mb = ` · yaklaşık ${(e.usage / 1048576).toFixed(1)} MB`; }
        info.textContent = files ? `${files} dosya cihazında saklı${mb}. İnternet kesilince bunlar açılır.` : "Henüz çevrimdışı kopya yok.";
      } catch { info.textContent = "Hesaplanamadı."; }
    }
    cacheSize();
    document.getElementById("cacheClear").addEventListener("click", async () => {
      try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
      try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch {}
      window.showToast("Çevrimdışı kopya temizlendi; sayfa yenileniyor…");
      setTimeout(() => location.reload(), 900);
    });
    document.getElementById("prefsReset").addEventListener("click", () => {
      if (!confirm("Bu cihazdaki tüm TürkiyeCanlı ayarları silinsin mi?")) return;
      try { Object.keys(localStorage).filter((k) => k.startsWith("havasite_")).forEach((k) => localStorage.removeItem(k)); } catch {}
      window.showToast("Ayarlar sıfırlandı");
      setTimeout(() => location.reload(), 700);
    });
    try {
      const sw = await fetch("/sw.js", { cache: "no-store" }).then((r) => r.text());
      const v = (sw.match(/VERSION = "([^"]+)"/) || [])[1];
      document.getElementById("appVersion").textContent = v ? `TürkiyeCanlı ${v}` : "—";
    } catch {}
  }

  // ---------------- deprem cantasi checklist + rozet ----------------
  const CHECKLIST_KEY = "havasite_checklist";
  const CHECKLIST_DATA = [
    {
      group: "Su & Gıda",
      items: [
        { id: "su", label: "Su (kişi başı en az 3 litre)" },
        { id: "kuru-gida", label: "Kuru gıda / enerji bar" },
        { id: "konserve", label: "Konserve açacaklı gıda" },
      ],
    },
    {
      group: "Sağlık",
      items: [
        { id: "ilk-yardim", label: "İlk yardım çantası" },
        { id: "ilaclar", label: "Sürekli kullanılan ilaçlar" },
        { id: "maske", label: "Toz maskesi" },
        { id: "islak-mendil", label: "Islak mendil / hijyen malzemesi" },
      ],
    },
    {
      group: "Aydınlatma & İletişim",
      items: [
        { id: "fener", label: "El feneri + yedek pil" },
        { id: "powerbank", label: "Powerbank / şarj kablosu" },
        { id: "duduk", label: "Düdük" },
        { id: "pilli-radyo", label: "Pilli radyo" },
      ],
    },
    {
      group: "Belgeler & Nakit",
      items: [
        { id: "kimlik-fotokopi", label: "Kimlik / tapu fotokopileri" },
        { id: "nakit", label: "Nakit para" },
        { id: "bulusma-noktasi", label: "Aile buluşma noktası notu" },
      ],
    },
    {
      group: "Giyim & Barınma",
      items: [
        { id: "yedek-kiyafet", label: "Yedek kıyafet" },
        { id: "battaniye", label: "Battaniye / ısı örtüsü" },
        { id: "cakmak", label: "Çakmak / kibrit" },
      ],
    },
  ];

  function getChecklistState() {
    try {
      return JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function setChecklistState(state) {
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("Kontrol listesi kaydedilemedi:", err);
    }
  }

  function setupChecklist() {
    const wrap = document.getElementById("checklistGroups");
    if (!wrap) return;
    let state = getChecklistState();

    const totalItems = CHECKLIST_DATA.reduce((s, g) => s + g.items.length, 0);
    document.getElementById("checklistTotal").textContent = totalItems;

    wrap.innerHTML = CHECKLIST_DATA.map(
      (g) => `
      <div class="checklist-group">
        <h4>${window.escapeHtml(g.group)}</h4>
        <div class="checklist-items">
          ${g.items
            .map(
              (it) => `
            <label class="checklist-item ${state[it.id] ? "checked" : ""}" data-id="${it.id}">
              <input type="checkbox" ${state[it.id] ? "checked" : ""} />
              <span>${window.escapeHtml(it.label)}</span>
            </label>`
            )
            .join("")}
        </div>
      </div>`
    ).join("");

    wrap.querySelectorAll(".checklist-item input").forEach((input) => {
      input.addEventListener("change", () => {
        const row = input.closest(".checklist-item");
        const id = row.dataset.id;
        state[id] = input.checked;
        setChecklistState(state);
        row.classList.toggle("checked", input.checked);
        if (input.checked) {
          row.classList.remove("just-checked");
          void row.offsetWidth;
          row.classList.add("just-checked");
          setTimeout(() => row.classList.remove("just-checked"), 450);
        }
        updateProgress();
      });
    });

    document.getElementById("checklistReset").addEventListener("click", () => {
      state = {};
      setChecklistState(state);
      wrap.querySelectorAll(".checklist-item").forEach((row) => {
        row.classList.remove("checked");
        row.querySelector("input").checked = false;
      });
      updateProgress();
      window.showToast("Liste sıfırlandı.");
    });

    function updateProgress() {
      const done = CHECKLIST_DATA.reduce(
        (s, g) => s + g.items.filter((it) => state[it.id]).length,
        0
      );
      const pct = totalItems ? Math.round((done / totalItems) * 100) : 0;
      document.getElementById("checklistDone").textContent = done;
      document.getElementById("checklistPct").textContent = pct;
      document.getElementById("checklistProgressBar").style.width = `${pct}%`;

      const badge = document.getElementById("checklistBadge");
      const iconEl = document.getElementById("cbEmoji");
      const textEl = document.getElementById("cbText");
      let icon = "backpack", text = "Başlamadın", complete = false;
      if (pct === 100) { icon = "shield-check"; text = "Hazırım"; complete = true; }
      else if (pct >= 67) { icon = "shield-check"; text = "Neredeyse hazır"; }
      else if (pct >= 34) { icon = "backpack"; text = "Yarı yolda"; }
      else if (pct >= 1) { icon = "backpack"; text = "İlk adım"; }
      iconEl.innerHTML = window.HavaIcon(icon, { size: 15 });
      textEl.textContent = text;
      badge.classList.toggle("cb-complete", complete);
    }

    updateProgress();
  }
})();
