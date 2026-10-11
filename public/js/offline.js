// Cevrimdisi sayfasi: "Tekrar dene" ve baglanti gelince otomatik yenileme.
document.getElementById("retryBtn").addEventListener("click", () => location.reload());
window.addEventListener("online", () => location.reload());
