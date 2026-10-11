(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());
    checkSession();
    setupLoginForm();
    document.getElementById("adminLogoutBtn").addEventListener("click", logout);
  });

  function showDashboard() {
    document.getElementById("adminLoginShell").hidden = true;
    document.getElementById("adminDashboard").hidden = false;
    document.getElementById("adminLogoutWrap").hidden = false;
    loadStats();
  }

  function showLogin() {
    document.getElementById("adminLoginShell").hidden = false;
    document.getElementById("adminDashboard").hidden = true;
    document.getElementById("adminLogoutWrap").hidden = true;
  }

  async function checkSession() {
    try {
      const r = await fetch("/api/admin/session", { credentials: "same-origin" });
      const data = await r.json();
      if (data.ok && data.isAdmin) {
        showDashboard();
      } else {
        showLogin();
      }
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
    const form = document.getElementById("adminLoginForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById("adminEmail");
      const passInput = document.getElementById("adminPassword");
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
          if (data.reason === "not_configured") {
            document.getElementById("adminConfigHint").textContent = data.message;
          } else {
            setFieldError(passInput, data.message || "Giriş başarısız.");
          }
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

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return "—";
    }
  }

  function fmtUptime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h < 1) return `${m} dk`;
    return `${h} sa ${m} dk`;
  }

  async function loadStats() {
    try {
      const r = await fetch("/api/admin/stats", { credentials: "same-origin" });
      const data = await r.json();
      if (!data.ok) {
        if (data.reason === "unauthorized") return showLogin();
        window.showToast(data.message || "İstatistikler alınamadı.", { accent: "var(--status-critical)" });
        return;
      }
      const s = data.stats;
      document.getElementById("statPush").textContent = s.pushSubscribers;
      document.getElementById("statUptime").textContent = fmtUptime(s.uptimeSeconds);
      document.getElementById("statNode").textContent = s.nodeVersion;
      const firmsBadge = document.getElementById("statFirms");
      if (s.firmsKeyConfigured) {
        firmsBadge.textContent = "tanımlı";
        firmsBadge.classList.add("badge-live");
      } else {
        firmsBadge.textContent = "tanımlı değil";
      }
    } catch {
      window.showToast("Sunucuya ulaşılamadı.", { accent: "var(--status-critical)" });
    }
  }

})();
