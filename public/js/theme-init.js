// Sayfa cizilmeden once kayitli temayi uygular (acik/koyu gecisinde "yanip sonme" olmasin).
// <head> icinde, CSS'ten once ve senkron yuklenir.
(function () {
  try {
    var u = new URLSearchParams(location.search).get("theme");
    var t = u === "light" || u === "dark" ? u : localStorage.getItem("havasite_theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
