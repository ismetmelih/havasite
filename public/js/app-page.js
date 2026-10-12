// Mobil uygulama tanıtım sayfası: web uygulamasını yükleme düğmesi
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-install]").forEach((b) => b.addEventListener("click", () => window.HavaInstall && window.HavaInstall.prompt()));
});
