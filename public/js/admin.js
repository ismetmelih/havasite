(function () {
  "use strict";

  let meId = null;

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("year") && (document.getElementById("year").textContent = new Date().getFullYear());

    document.addEventListener("havasite:auth-ready", (e) => {
      const user = e.detail.user;
      if (!user) return; // main.js zaten yonlendirir
      meId = user.id;
      document.getElementById("whoami").textContent = user.name || user.email;
      loadStats();
      loadUsers();
    });
  });

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
        window.showToast(data.message || "İstatistikler alınamadı.", { accent: "var(--status-critical)" });
        return;
      }
      const s = data.stats;
      document.getElementById("statTotalUsers").textContent = s.totalUsers;
      document.getElementById("statAdmins").textContent = s.adminUsers;
      document.getElementById("statToday").textContent = s.registeredToday;
      document.getElementById("statUptime").textContent = fmtUptime(s.uptimeSeconds);
      document.getElementById("statNode").textContent = s.nodeVersion;
      const firmsBadge = document.getElementById("statFirms");
      if (s.firmsKeyConfigured) {
        firmsBadge.textContent = "tanımlı ✓";
        firmsBadge.classList.add("badge-live");
      } else {
        firmsBadge.textContent = "tanımlı değil";
      }
    } catch {
      window.showToast("Sunucuya ulaşılamadı.", { accent: "var(--status-critical)" });
    }
  }

  async function loadUsers() {
    const tbody = document.getElementById("userTableBody");
    try {
      const r = await fetch("/api/admin/users", { credentials: "same-origin" });
      const data = await r.json();
      if (!data.ok) {
        tbody.innerHTML = `<tr><td colspan="5">Kullanıcılar alınamadı.</td></tr>`;
        return;
      }
      renderUsers(data.users);
    } catch {
      tbody.innerHTML = `<tr><td colspan="5">Bağlantı hatası.</td></tr>`;
    }
  }

  function renderUsers(users) {
    document.getElementById("userCount").innerHTML = `<span class="live-blip"></span> ${users.length}`;
    const tbody = document.getElementById("userTableBody");

    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="5">Henüz kayıtlı kullanıcı yok.</td></tr>`;
      return;
    }

    tbody.innerHTML = users
      .map((u) => {
        const isSelf = u.id === meId;
        return `
        <tr data-id="${u.id}" class="${isSelf ? "is-self" : ""}">
          <td>${window.escapeHtml(u.name || "—")}${isSelf ? " <span class=\"field-hint\">(sen)</span>" : ""}</td>
          <td>${window.escapeHtml(u.email)}</td>
          <td>${fmtDate(u.createdAt)}</td>
          <td><span class="role-chip ${u.isAdmin ? "is-admin" : ""}">${u.isAdmin ? "★ Admin" : "Kullanıcı"}</span></td>
          <td>
            <div class="admin-row-actions">
              <button type="button" data-action="toggle" ${isSelf && u.isAdmin ? "disabled title='Kendi yetkini kaldıramazsın'" : ""}>
                ${u.isAdmin ? "Adminliği al" : "Admin yap"}
              </button>
              <button type="button" class="danger" data-action="delete" ${isSelf ? "disabled title='Kendini silemezsin'" : ""}>Sil</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest("tr");
        const id = row.dataset.id;
        if (btn.dataset.action === "toggle") toggleAdmin(id, row);
        if (btn.dataset.action === "delete") deleteUser(id, row);
      });
    });
  }

  async function toggleAdmin(id, row) {
    const currentlyAdmin = row.querySelector(".role-chip").classList.contains("is-admin");
    try {
      const r = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ isAdmin: !currentlyAdmin }),
      });
      const data = await r.json();
      if (!data.ok) {
        window.showToast(data.message || "Güncellenemedi.", { accent: "var(--status-critical)" });
        return;
      }
      window.showToast(`${data.user.name || data.user.email} artık ${data.user.isAdmin ? "admin" : "normal kullanıcı"}.`, {
        accent: "var(--status-good)",
      });
      loadUsers();
      loadStats();
    } catch {
      window.showToast("Sunucuya ulaşılamadı.", { accent: "var(--status-critical)" });
    }
  }

  async function deleteUser(id, row) {
    const email = row.children[1].textContent;
    if (!confirm(`${email} hesabını kalıcı olarak silmek istediğine emin misin?`)) return;
    try {
      const r = await fetch(`/api/admin/users/${id}`, { method: "DELETE", credentials: "same-origin" });
      const data = await r.json();
      if (!data.ok) {
        window.showToast(data.message || "Silinemedi.", { accent: "var(--status-critical)" });
        return;
      }
      window.showToast("Kullanıcı silindi.", { accent: "var(--status-good)" });
      loadUsers();
      loadStats();
    } catch {
      window.showToast("Sunucuya ulaşılamadı.", { accent: "var(--status-critical)" });
    }
  }
})();
