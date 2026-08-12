(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
    setupTabs();
    setupThemeOptions();
    fillCitySelects();
    setupProfile();
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

    // ilk konum + pencere yeniden boyutlaninca hizala
    requestAnimationFrame(() => moveIndicator(document.querySelector(".settings-tab.active")));
    window.addEventListener("resize", () => moveIndicator(document.querySelector(".settings-tab.active")));
  }

  function setupThemeOptions() {
    document.querySelectorAll(".theme-option").forEach((el) => {
      el.addEventListener("click", () => {
        window.HavaTheme.set(el.dataset.themeRadio);
        window.showToast(`Tema: ${el.dataset.themeRadio === "light" ? "Açık ☀️" : "Koyu 🌙"}`);
      });
    });
  }

  function fillCitySelects() {
    const cities = window.TR_CITIES || [];
    ["fCity", "fCityGuest"].forEach((id) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      cities.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = c.name;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
    });
  }

  function setupProfile() {
    const user = window.HavaAuth.getUser();
    const prefs = window.HavaPrefs.get();

    if (user) {
      document.getElementById("profileLoggedIn").hidden = false;
      document.getElementById("profileGuest").hidden = true;

      document.getElementById("profileAvatar").textContent = (user.name || "?").slice(0, 1).toUpperCase();
      document.getElementById("profileNameDisplay").textContent = user.name || user.email;
      document.getElementById("profileEmailDisplay").textContent = user.email || "";

      document.getElementById("fName").value = user.name || "";
      document.getElementById("fEmail").value = user.email || "";
      document.getElementById("fCity").value = prefs.favoriteCity || "";
      document.getElementById("fMag").value = prefs.quakeAlertMag;
      document.getElementById("fMagVal").textContent = Number(prefs.quakeAlertMag).toFixed(1);

      document.getElementById("fMag").addEventListener("input", (e) => {
        document.getElementById("fMagVal").textContent = Number(e.target.value).toFixed(1);
      });

      document.getElementById("profileForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("fName").value.trim();
        if (name.length < 2) {
          window.showToast("Görünen ad en az 2 karakter olmalı.");
          return;
        }
        window.HavaAuth.login({ ...user, name });
        window.HavaPrefs.set({
          favoriteCity: document.getElementById("fCity").value,
          quakeAlertMag: parseFloat(document.getElementById("fMag").value),
        });
        document.getElementById("profileAvatar").textContent = name.slice(0, 1).toUpperCase();
        document.getElementById("profileNameDisplay").textContent = name;
        window.showToast("Profil kaydedildi ✓", { accent: "var(--status-good)" });
      });
    } else {
      document.getElementById("profileLoggedIn").hidden = true;
      document.getElementById("profileGuest").hidden = false;

      document.getElementById("fCityGuest").value = prefs.favoriteCity || "";
      document.getElementById("fMagGuest").value = prefs.quakeAlertMag;
      document.getElementById("fMagValGuest").textContent = Number(prefs.quakeAlertMag).toFixed(1);

      document.getElementById("fMagGuest").addEventListener("input", (e) => {
        document.getElementById("fMagValGuest").textContent = Number(e.target.value).toFixed(1);
      });

      document.getElementById("guestPrefsForm").addEventListener("submit", (e) => {
        e.preventDefault();
        window.HavaPrefs.set({
          favoriteCity: document.getElementById("fCityGuest").value,
          quakeAlertMag: parseFloat(document.getElementById("fMagGuest").value),
        });
        window.showToast("Tercihler kaydedildi ✓", { accent: "var(--status-good)" });
      });
    }
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
      const emojiEl = document.getElementById("cbEmoji");
      const textEl = document.getElementById("cbText");
      let emoji = "🎒", text = "Başlamadın", complete = false;
      if (pct === 100) { emoji = "🏆"; text = "Hazırım!"; complete = true; }
      else if (pct >= 67) { emoji = "🥇"; text = "Neredeyse hazır"; }
      else if (pct >= 34) { emoji = "🥈"; text = "Yarı yolda"; }
      else if (pct >= 1) { emoji = "🥉"; text = "İlk adım"; }
      emojiEl.textContent = emoji;
      textEl.textContent = text;
      badge.classList.toggle("cb-complete", complete);
    }

    updateProgress();
  }
})();
