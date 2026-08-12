(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
    setupTabs();
    setupThemeOptions();
    fillCitySelects();
    setupProfile();
  });

  function setupTabs() {
    const tabs = document.querySelectorAll(".settings-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        document.querySelectorAll(".settings-panel").forEach((p) => p.classList.remove("active"));
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
      });
    });
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
})();
