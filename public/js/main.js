// Ortak site davranislari: nav, mobil menu, reveal-on-scroll, oturum durumu, toast.
(function () {
  "use strict";

  // ---------------- ortak harita zemini ----------------
  // CARTO'nun ucretsiz dark_all zemini artik anahtar istiyor ("API KEY REQUIRED"
  // filigrani). Esri'nin "Dark Gray Canvas" servisi anahtarsiz, ucretsiz ve koyu;
  // navy temaya yaklastirmak icin hafif bir CSS filtresiyle karartiliyor
  // (bkz. base.css .hava-basemap).
  window.HavaMap = {
    addBaseLayer: function (map) {
      if (typeof L === "undefined" || !map) return;
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap", maxZoom: 16, className: "hava-basemap" }
      ).addTo(map);
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, className: "hava-basemap-ref" }
      ).addTo(map);
    },
    // Dar ekranlarda sabit yakinlik Turkiye'nin batisini disarida birakiyor;
    // tum ulkeyi kutuya sigdir.
    fitTurkey: function (map) {
      if (!map || window.innerWidth > 700) return;
      map.fitBounds([[35.8, 25.7], [42.1, 44.8]], { padding: [4, 4] });
    },
  };

  // ---------------- kurumsal ikon seti: Phosphor Icons (MIT, phosphoricons.com) ----------------
  // Kullanim: HTML'de <span class="ic" data-icon="map-pin"></span> ya da
  // JS'te window.HavaIcon("map-pin", { size: 16, cls: "..." })
  const ICON_PATHS = {
    "map-pin": '<path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"/>',
    navigation: '<path d="M248,121.58a15.76,15.76,0,0,1-11.29,15l-.2.06-78,21.84-21.84,78-.06.2a15.77,15.77,0,0,1-15,11.29h-.3a15.77,15.77,0,0,1-15.07-10.67L41,61.41a1,1,0,0,1-.05-.16A16,16,0,0,1,61.25,40.9l.16.05,175.92,65.26A15.78,15.78,0,0,1,248,121.58Z"/>',
    globe: '<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24ZM62.29,186.47l2.52-1.65A16,16,0,0,0,72,171.53l.21-36.23L93.17,104a3.62,3.62,0,0,0,.32.22l19.67,12.87a15.94,15.94,0,0,0,11.35,2.77L156,115.59a16,16,0,0,0,10-5.41l22.17-25.76A16,16,0,0,0,192,74V67.67A87.87,87.87,0,0,1,211.77,155l-16.14-14.76a16,16,0,0,0-16.93-3l-30.46,12.65a16.08,16.08,0,0,0-9.68,12.45l-2.39,16.19a16,16,0,0,0,11.77,17.81L169.4,202l2.36,2.37A87.88,87.88,0,0,1,62.29,186.47Z"/>',
    clock: '<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm56,112H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48a8,8,0,0,1,0,16Z"/>',
    activity: '<path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm-8,96H188.64L159,188a8,8,0,0,1-6.95,4h-.46a8,8,0,0,1-6.89-4.84L103,89.92,79,132a8,8,0,0,1-7,4H48a8,8,0,0,1,0-16H67.36L97.05,68a8,8,0,0,1,14.3.82L153,166.08l24-42.05a8,8,0,0,1,6.95-4h24a8,8,0,0,1,0,16Z"/>',
    "trending-up": '<path d="M240,56v64a8,8,0,0,1-13.66,5.66L200,99.31l-58.34,58.35a8,8,0,0,1-11.32,0L96,123.31,29.66,189.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0L136,140.69,188.69,88,162.34,61.66A8,8,0,0,1,168,48h64A8,8,0,0,1,240,56Z"/>',
    compass: '<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm51.58,57.79-32,64a4.08,4.08,0,0,1-1.79,1.79l-64,32a4,4,0,0,1-5.37-5.37l32-64a4.08,4.08,0,0,1,1.79-1.79l64-32A4,4,0,0,1,179.58,81.79Z"/>',
    "bar-chart": '<path d="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1,0-16h8V136a8,8,0,0,1,8-8H72a8,8,0,0,1,8,8v64H96V88a8,8,0,0,1,8-8h32a8,8,0,0,1,8,8V200h16V40a8,8,0,0,1,8-8h40a8,8,0,0,1,8,8V200h8A8,8,0,0,1,232,208Z"/>',
    layers: '<path d="M220,169.09l-92,53.65L36,169.09A8,8,0,0,0,28,182.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,169.09Z"/><path d="M220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09Z"/><path d="M28,86.91l96,56a8,8,0,0,0,8.06,0l96-56a8,8,0,0,0,0-13.82l-96-56a8,8,0,0,0-8.06,0l-96,56a8,8,0,0,0,0,13.82Z"/>',
    play: '<path d="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z"/>',
    pause: '<path d="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z"/>',
    flame: '<path d="M173.79,51.48a221.25,221.25,0,0,0-41.67-34.34,8,8,0,0,0-8.24,0A221.25,221.25,0,0,0,82.21,51.48C54.59,80.48,40,112.47,40,144a88,88,0,0,0,176,0C216,112.47,201.41,80.48,173.79,51.48ZM96,184c0-27.67,22.53-47.28,32-54.3,9.48,7,32,26.63,32,54.3a32,32,0,0,1-64,0Z"/>',
    thermometer: '<path d="M212,56a28,28,0,1,0,28,28A28,28,0,0,0,212,56Zm0,40a12,12,0,1,1,12-12A12,12,0,0,1,212,96Zm-60,50.08V40a32,32,0,0,0-64,0V146.08a56,56,0,1,0,64,0ZM136,104H104V40a16,16,0,0,1,32,0Z"/>',
    "moon-star": '<path d="M240,96a8,8,0,0,1-8,8H216v16a8,8,0,0,1-16,0V104H184a8,8,0,0,1,0-16h16V72a8,8,0,0,1,16,0V88h16A8,8,0,0,1,240,96ZM144,56h8v8a8,8,0,0,0,16,0V56h8a8,8,0,0,0,0-16h-8V32a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16Zm65.14,94.33A88.07,88.07,0,0,1,105.67,46.86a8,8,0,0,0-10.6-9.06A96,96,0,1,0,218.2,160.93a8,8,0,0,0-9.06-10.6Z"/>',
    sun: '<path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm8,24a64,64,0,1,0,64,64A64.07,64.07,0,0,0,128,64ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z"/>',
    "alert-triangle": '<path d="M236.8,188.09,149.35,36.22h0a24.76,24.76,0,0,0-42.7,0L19.2,188.09a23.51,23.51,0,0,0,0,23.72A24.35,24.35,0,0,0,40.55,224h174.9a24.35,24.35,0,0,0,21.33-12.19A23.51,23.51,0,0,0,236.8,188.09ZM120,104a8,8,0,0,1,16,0v40a8,8,0,0,1-16,0Zm8,88a12,12,0,1,1,12-12A12,12,0,0,1,128,192Z"/>',
    x: '<path d="M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z"/>',
    users: '<path d="M164.47,195.63a8,8,0,0,1-6.7,12.37H10.23a8,8,0,0,1-6.7-12.37,95.83,95.83,0,0,1,47.22-37.71,60,60,0,1,1,66.5,0A95.83,95.83,0,0,1,164.47,195.63Zm87.91-.15a95.87,95.87,0,0,0-47.13-37.56A60,60,0,0,0,144.7,54.59a4,4,0,0,0-1.33,6A75.83,75.83,0,0,1,147,150.53a4,4,0,0,0,1.07,5.53,112.32,112.32,0,0,1,29.85,30.83,23.92,23.92,0,0,1,3.65,16.47,4,4,0,0,0,3.95,4.64h60.3a8,8,0,0,0,7.73-5.93A8.22,8.22,0,0,0,252.38,195.48Z"/>',
    "user-plus": '<path d="M256,136a8,8,0,0,1-8,8H232v16a8,8,0,0,1-16,0V144H200a8,8,0,0,1,0-16h16V112a8,8,0,0,1,16,0v16h16A8,8,0,0,1,256,136ZM144,157.68a68,68,0,1,0-71.9,0c-20.65,6.76-39.23,19.39-54.17,37.17A8,8,0,0,0,24,208H192a8,8,0,0,0,6.13-13.15C183.18,177.07,164.6,164.44,144,157.68Z"/>',
    key: '<path d="M216.57,39.43A80,80,0,0,0,83.91,120.78L28.69,176A15.86,15.86,0,0,0,24,187.31V216a16,16,0,0,0,16,16H72a8,8,0,0,0,8-8V208H96a8,8,0,0,0,8-8V184h16a8,8,0,0,0,5.66-2.34l9.56-9.57A79.73,79.73,0,0,0,160,176h.1A80,80,0,0,0,216.57,39.43ZM180,92a16,16,0,1,1,16-16A16,16,0,0,1,180,92Z"/>',
    database: '<path d="M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64Zm-21.61,74.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z"/>',
    lock: '<path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80Zm-80,84a12,12,0,1,1,12-12A12,12,0,0,1,128,164Zm32-84H96V56a32,32,0,0,1,64,0Z"/>',
    user: '<path d="M230.93,220a8,8,0,0,1-6.93,4H32a8,8,0,0,1-6.92-12c15.23-26.33,38.7-45.21,66.09-54.16a72,72,0,1,1,73.66,0c27.39,8.95,50.86,27.83,66.09,54.16A8,8,0,0,1,230.93,220Z"/>',
    palette: '<path d="M200.77,53.89A103.27,103.27,0,0,0,128,24h-1.07A104,104,0,0,0,24,128c0,43,26.58,79.06,69.36,94.17A32,32,0,0,0,136,192a16,16,0,0,1,16-16h46.21a31.81,31.81,0,0,0,31.2-24.88,104.43,104.43,0,0,0,2.59-24A103.28,103.28,0,0,0,200.77,53.89ZM84,168a12,12,0,1,1,12-12A12,12,0,0,1,84,168Zm0-56a12,12,0,1,1,12-12A12,12,0,0,1,84,112Zm44-24a12,12,0,1,1,12-12A12,12,0,0,1,128,88Zm44,24a12,12,0,1,1,12-12A12,12,0,0,1,172,112Z"/>',
    "shield-check": '<path d="M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm-34.32,69.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z"/>',
    check: '<path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/>',
    droplet: '<path d="M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75Zm9.85,105.59a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68Z"/>',
    wind: '<path d="M24,104a12,12,0,0,1,0-24h96a12,12,0,0,0,0-24,15.07,15.07,0,0,0-10.26,4.45,12,12,0,0,1-17-16.9A39.34,39.34,0,0,1,120,32a36,36,0,0,1,0,72ZM208,68a39.34,39.34,0,0,0-27.3,11.55,12,12,0,0,0,17,16.9A15.07,15.07,0,0,1,208,92a12,12,0,0,1,0,24H32a12,12,0,0,0,0,24H208a36,36,0,0,0,0-72Zm-56,84H40a12,12,0,0,0,0,24H152a12,12,0,0,1,0,24,15.11,15.11,0,0,1-10.27-4.45,12,12,0,1,0-17,16.9A39.34,39.34,0,0,0,152,224a36,36,0,0,0,0-72Z"/>',
    "arrow-right": '<path d="M224.49,136.49l-72,72a12,12,0,0,1-17-17L187,140H40a12,12,0,0,1,0-24H187L135.51,64.48a12,12,0,0,1,17-17l72,72A12,12,0,0,1,224.49,136.49Z"/>',
    sunrise: '<path d="M248,160a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16H56.45a73.54,73.54,0,0,1-.45-8,72,72,0,0,1,144,0,73.54,73.54,0,0,1-.45,8H240A8,8,0,0,1,248,160Zm-40,32H48a8,8,0,0,0,0,16H208a8,8,0,0,0,0-16ZM80.84,59.58a8,8,0,0,0,14.32-7.16l-8-16a8,8,0,0,0-14.32,7.16ZM20.42,103.16l16,8a8,8,0,1,0,7.16-14.31l-16-8a8,8,0,1,0-7.16,14.31ZM216,112a8,8,0,0,0,3.57-.84l16-8a8,8,0,1,0-7.16-14.31l-16,8A8,8,0,0,0,216,112ZM164.42,63.16a8,8,0,0,0,10.74-3.58l8-16a8,8,0,0,0-14.32-7.16l-8,16A8,8,0,0,0,164.42,63.16Z"/>',
    sunset: '<path d="M248,160a8,8,0,0,1-8,8H16a8,8,0,0,1,0-16H56.45a73.54,73.54,0,0,1-.45-8,72,72,0,0,1,144,0,73.54,73.54,0,0,1-.45,8H240A8,8,0,0,1,248,160Zm-40,32H48a8,8,0,0,0,0,16H208a8,8,0,0,0,0-16ZM80.84,59.58a8,8,0,0,0,14.32-7.16l-8-16a8,8,0,0,0-14.32,7.16ZM20.42,103.16l16,8a8,8,0,1,0,7.16-14.31l-16-8a8,8,0,1,0-7.16,14.31ZM216,112a8,8,0,0,0,3.57-.84l16-8a8,8,0,1,0-7.16-14.31l-16,8A8,8,0,0,0,216,112ZM164.42,63.16a8,8,0,0,0,10.74-3.58l8-16a8,8,0,0,0-14.32-7.16l-8,16A8,8,0,0,0,164.42,63.16Z"/>',
    satellite: '<path d="M128,84a44,44,0,1,0,44,44A44.05,44.05,0,0,0,128,84Zm0,64a20,20,0,1,1,20-20A20,20,0,0,1,128,148Zm77.39,12.7A83.94,83.94,0,0,1,190.61,184a12,12,0,0,1-17.89-16,59.92,59.92,0,0,0,0-80,12,12,0,0,1,17.89-16,84.07,84.07,0,0,1,14.78,88.7ZM83.28,168a12,12,0,0,1-17.89,16,83.94,83.94,0,0,1,0-112A12,12,0,0,1,83.28,88a59.92,59.92,0,0,0,0,80ZM252,128a123.63,123.63,0,0,1-35.43,86.78A12,12,0,1,1,199.43,198a99.88,99.88,0,0,0,0-140,12,12,0,0,1,17.14-16.8A123.63,123.63,0,0,1,252,128ZM56.57,198a12,12,0,0,1-17.14,16.8,123.89,123.89,0,0,1,0-173.56A12,12,0,0,1,56.57,58a99.88,99.88,0,0,0,0,140Z"/>',
    map: '<path d="M228.92,49.69a8,8,0,0,0-6.86-1.45L160.93,63.52,99.58,32.84a8,8,0,0,0-5.52-.6l-64,16A8,8,0,0,0,24,56V200a8,8,0,0,0,9.94,7.76l61.13-15.28,61.35,30.68A8.15,8.15,0,0,0,160,224a8,8,0,0,0,1.94-.24l64-16A8,8,0,0,0,232,200V56A8,8,0,0,0,228.92,49.69ZM96,176a8,8,0,0,0-1.94.24L40,189.75V62.25L95.07,48.48l.93.46Zm120,17.75-55.07,13.77-.93-.46V80a8,8,0,0,0,1.94-.23L216,66.25Z"/>',
    radio: '<path d="M216,64H86.51L194.3,31.67a8,8,0,0,0-4.6-15.33l-160,48h0A8,8,0,0,0,24,72V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V80A16,16,0,0,0,216,64ZM104,176H64a8,8,0,0,1,0-16h40a8,8,0,0,1,0,16Zm0-32H64a8,8,0,0,1,0-16h40a8,8,0,0,1,0,16Zm0-32H64a8,8,0,0,1,0-16h40a8,8,0,0,1,0,16Zm64,56a32,32,0,1,1,32-32A32,32,0,0,1,168,168Z"/>',
    backpack: '<path d="M168,40.58V32A24,24,0,0,0,144,8H112A24,24,0,0,0,88,32v8.58A56.09,56.09,0,0,0,40,96V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V96A56.09,56.09,0,0,0,168,40.58ZM104,32a8,8,0,0,1,8-8h32a8,8,0,0,1,8,8v8H104Zm8,40h32a8,8,0,0,1,0,16H112a8,8,0,0,1,0-16Zm64,144H80V176h56v8a8,8,0,0,0,16,0v-8h24Zm0-56H80v-8a16,16,0,0,1,16-16h64a16,16,0,0,1,16,16Z"/>',
    phone: '<path d="M231.88,175.08A56.26,56.26,0,0,1,176,224C96.6,224,32,159.4,32,80A56.26,56.26,0,0,1,80.92,24.12a16,16,0,0,1,16.62,9.52l21.12,47.15,0,.12A16,16,0,0,1,117.39,96c-.18.27-.37.52-.57.77L96,121.45c7.49,15.22,23.41,31,38.83,38.51l24.34-20.71a8.12,8.12,0,0,1,.75-.56,16,16,0,0,1,15.17-1.4l.13.06,47.11,21.11A16,16,0,0,1,231.88,175.08Z"/>',
    "refresh-cw": '<path d="M244,56v48a12,12,0,0,1-12,12H184a12,12,0,1,1,0-24H201.1l-19-17.38c-.13-.12-.26-.24-.38-.37A76,76,0,1,0,127,204h1a75.53,75.53,0,0,0,52.15-20.72,12,12,0,0,1,16.49,17.45A99.45,99.45,0,0,1,128,228h-1.37A100,100,0,1,1,198.51,57.06L220,76.72V56a12,12,0,0,1,24,0Z"/>',
    info: '<path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm-4,48a12,12,0,1,1-12,12A12,12,0,0,1,124,72Zm12,112a16,16,0,0,1-16-16V128a8,8,0,0,1,0-16,16,16,0,0,1,16,16v40a8,8,0,0,1,0,16Z"/>',
    gauge: '<path d="M240,152v24a16,16,0,0,1-16,16H115.93a4,4,0,0,1-3.24-6.35L174.27,101a8.21,8.21,0,0,0-1.37-11.3,8,8,0,0,0-11.37,1.61l-72,99.06A4,4,0,0,1,86.25,192H32a16,16,0,0,1-16-16V153.13c0-1.79,0-3.57.13-5.33a4,4,0,0,1,4-3.8H48a8,8,0,0,0,8-8.53A8.17,8.17,0,0,0,47.73,128H23.92a4,4,0,0,1-3.87-5c12-43.84,49.66-77.13,95.52-82.28a4,4,0,0,1,4.43,4V72a8,8,0,0,0,8.53,8A8.17,8.17,0,0,0,136,71.73V44.67a4,4,0,0,1,4.43-4A112.18,112.18,0,0,1,236.23,123a4,4,0,0,1-3.88,5H208.27a8.17,8.17,0,0,0-8.25,7.47,8,8,0,0,0,8,8.53h27.92a4,4,0,0,1,4,3.86C240,149.23,240,150.61,240,152Z"/>',
    "log-out": '<path d="M124,216a12,12,0,0,1-12,12H48a12,12,0,0,1-12-12V40A12,12,0,0,1,48,28h64a12,12,0,0,1,0,24H60V204h52A12,12,0,0,1,124,216Zm108.49-96.49-40-40a12,12,0,0,0-17,17L195,116H112a12,12,0,0,0,0,24h83l-19.52,19.51a12,12,0,0,0,17,17l40-40A12,12,0,0,0,232.49,119.51Z"/>',
    settings: '<path d="M237.94,107.21a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A111.92,111.92,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.63a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/>',
    moon: '<path d="M235.54,150.21a104.84,104.84,0,0,1-37,52.91A104,104,0,0,1,32,120,103.09,103.09,0,0,1,52.88,57.48a104.84,104.84,0,0,1,52.91-37,8,8,0,0,1,10,10,88.08,88.08,0,0,0,109.8,109.8,8,8,0,0,1,10,10Z"/>',
    siren: '<path d="M120,16V8a8,8,0,0,1,16,0v8a8,8,0,0,1-16,0Zm80,32a8,8,0,0,0,5.66-2.34l8-8a8,8,0,0,0-11.32-11.32l-8,8A8,8,0,0,0,200,48ZM50.34,45.66A8,8,0,0,0,61.66,34.34l-8-8A8,8,0,0,0,42.34,37.66ZM232,176v24a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V176a16,16,0,0,1,16-16V128a88,88,0,0,1,88.67-88c48.15.36,87.33,40.29,87.33,89v31A16,16,0,0,1,232,176ZM134.68,87.89C153.67,91.08,168,108.32,168,128a8,8,0,0,0,16,0c0-27.4-20.07-51.43-46.68-55.89a8,8,0,1,0-2.64,15.78ZM216,200V176H40v24H216Z"/>',
    download: '<path d="M228,144v64a12,12,0,0,1-12,12H40a12,12,0,0,1-12-12V144a12,12,0,0,1,24,0v52H204V144a12,12,0,0,1,24,0Zm-108.49,8.49a12,12,0,0,0,17,0l40-40a12,12,0,0,0-17-17L140,115V32a12,12,0,0,0-24,0v83L96.49,95.51a12,12,0,0,0-17,17Z"/>',
    smartphone: '<path d="M176,16H80A24,24,0,0,0,56,40V216a24,24,0,0,0,24,24h96a24,24,0,0,0,24-24V40A24,24,0,0,0,176,16ZM80,32h96a8,8,0,0,1,8,8v8H72V40A8,8,0,0,1,80,32Zm96,192H80a8,8,0,0,1-8-8v-8H184v8A8,8,0,0,1,176,224Z"/>',
    share: '<path d="M220,112v96a20,20,0,0,1-20,20H56a20,20,0,0,1-20-20V112A20,20,0,0,1,56,92H76a12,12,0,0,1,0,24H60v88H196V116H180a12,12,0,0,1,0-24h20A20,20,0,0,1,220,112ZM96.49,72.49,116,53v83a12,12,0,0,0,24,0V53l19.51,19.52a12,12,0,1,0,17-17l-40-40a12,12,0,0,0-17,0l-40,40a12,12,0,1,0,17,17Z"/>',
    bell: '<path d="M221.8,175.94C216.25,166.38,208,139.33,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216Z"/>',
    "plus-square": '<path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM168,136H136v32a8,8,0,0,1-16,0V136H88a8,8,0,0,1,0-16h32V88a8,8,0,0,1,16,0v32h32a8,8,0,0,1,0,16Z"/>',
  };

  window.HavaIcon = function HavaIcon(name, opts = {}) {
    const p = ICON_PATHS[name];
    if (!p) return "";
    const size = opts.size || 20;
    const cls = opts.cls ? ` ${opts.cls}` : "";
    return `<svg class="ic${cls}" width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${p}</svg>`;
  };


  function hydrateIcons(root) {
    (root || document).querySelectorAll("[data-icon]:not([data-icon-done])").forEach((el) => {
      const svg = window.HavaIcon(el.dataset.icon, {
        size: parseInt(el.dataset.iconSize, 10) || 18,
      });
      if (svg) {
        el.innerHTML = svg;
        el.setAttribute("data-icon-done", "");
      }
    });
  }
  window.hydrateIcons = hydrateIcons;


  // ---------------- uygulama (PWA): service worker + "ana ekrana ekle" karti ----------------
  const INSTALL_DISMISS_KEY = "havasite_install_dismissed";
  const INSTALL_SNOOZE_MS = 14 * 24 * 3600 * 1000;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  function installSnoozed() {
    try {
      return Date.now() - Number(localStorage.getItem(INSTALL_DISMISS_KEY) || 0) < INSTALL_SNOOZE_MS;
    } catch {
      return false;
    }
  }

  function showInstallCard({ ios, onInstall }) {
    if (document.getElementById("installCard")) return;
    const card = document.createElement("div");
    card.className = "install-card";
    card.id = "installCard";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Uygulamayı yükle");
    card.innerHTML = `
      <img class="install-card-icon" src="/img/app/icon-192.png" alt="" />
      <div class="install-card-text">
        <strong>TürkiyeCanlı'yı ana ekrana ekle</strong>
        <span>${
          ios
            ? `Alttaki ${window.HavaIcon("share", { size: 15, cls: "install-inline-ic" })} <b>Paylaş</b> simgesine, sonra <b>Ana Ekrana Ekle</b>'ye dokun.`
            : "Uygulama gibi tam ekran açılır, tek dokunuşla ulaşırsın."
        }</span>
      </div>
      ${ios ? "" : '<button class="btn btn-primary btn-sm install-card-btn" type="button">Yükle</button>'}
      <button class="install-card-close" type="button" aria-label="Kapat">${window.HavaIcon("x", { size: 16 })}</button>`;
    document.body.appendChild(card);
    document.body.classList.add("has-install-card");
    requestAnimationFrame(() => card.classList.add("show"));

    const close = (snooze) => {
      if (snooze) {
        try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch {}
      }
      card.classList.remove("show");
      document.body.classList.remove("has-install-card");
      setTimeout(() => card.remove(), 300);
    };
    card.querySelector(".install-card-close").addEventListener("click", () => close(true));
    const btn = card.querySelector(".install-card-btn");
    if (btn) btn.addEventListener("click", async () => {
      const accepted = await onInstall();
      close(!accepted);
    });
  }

  function setupPWA() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (isStandalone() || installSnoozed()) return;

    // Android / Chrome / Edge: tarayicinin kendi yukleme penceresi
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      const deferred = e;
      setTimeout(() => showInstallCard({
        ios: false,
        onInstall: async () => {
          deferred.prompt();
          const choice = await deferred.userChoice.catch(() => null);
          return !!choice && choice.outcome === "accepted";
        },
      }), 2500);
    });
    window.addEventListener("appinstalled", () => {
      const card = document.getElementById("installCard");
      if (card) card.remove();
      document.body.classList.remove("has-install-card");
    });

    // iPhone/iPad Safari: otomatik yukleme penceresi yok, adimlari goster
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (isIOS && isSafari) setTimeout(() => showInstallCard({ ios: true }), 2500);
  }

  document.addEventListener("DOMContentLoaded", () => {
    hydrateIcons();
    setupNav();
    setupReveal();
    setupThemeToggle();
    setupEmergencyMode();
    setupPWA();
    markActiveLink();

    window.HavaAuth.ready.then((user) => {
      const page = location.pathname.split("/").pop() || "index.html";

      if (!user) {
        // Misafir kotasi: giris yapmadan gunde birkac sayfa serbest, sonra giris duvari.
        if (document.body.hasAttribute("data-guest-quota")) {
          if (!window.HavaQuota.pageAlreadyCounted(page) && !window.HavaQuota.canView()) {
            location.replace(`login.html?redirect=${encodeURIComponent(page)}&reason=quota`);
            return;
          }
          window.HavaQuota.countPage(page);
        } else if (document.body.hasAttribute("data-require-auth")) {
          location.replace(`login.html?redirect=${encodeURIComponent(page)}`);
          return;
        }
      }

      setupUserState(user);
      document.documentElement.classList.remove("auth-pending");
      document.dispatchEvent(new CustomEvent("havasite:auth-ready", { detail: { user } }));

      if (!user && window.HavaQuota.remaining() <= 1 && document.body.hasAttribute("data-guest-quota")) {
        const left = window.HavaQuota.remaining();
        window.showToast(
          left === 0
            ? "Bu, bugünkü son ücretsiz görüntülemendi. Sonraki ziyarette giriş yapman gerekecek."
            : "Bugün 1 ücretsiz görüntüleme hakkın kaldı — ücretsiz hesapla sınırsız devam edebilirsin.",
          { accent: "var(--accent)", duration: 6000 }
        );
      }
    });
  });

  // ---------------- misafir goruntuleme kotasi ----------------
  // Tamamen istemci tarafinda (localStorage). Amac: giris olmadan tadına bakılabilsin,
  // sonra kayit/giris'e yonlendirilsin. Gunluk sifirlanir; ayni sekmede sayfa
  // yenilemek kotadan dusmesin diye sessionStorage ile isaretlenir.
  const QUOTA_KEY = "havasite_guest_quota";
  const QUOTA_LIMIT = 5;
  const todayStr = () => new Date().toISOString().slice(0, 10);

  function readQuota() {
    try {
      const raw = JSON.parse(localStorage.getItem(QUOTA_KEY) || "{}");
      if (raw.date !== todayStr()) return { date: todayStr(), count: 0 };
      return { date: raw.date, count: Math.max(0, raw.count | 0) };
    } catch {
      return { date: todayStr(), count: 0 };
    }
  }
  function writeQuota(q) {
    try { localStorage.setItem(QUOTA_KEY, JSON.stringify(q)); } catch {}
  }

  window.HavaQuota = {
    limit: QUOTA_LIMIT,
    used: () => Math.min(QUOTA_LIMIT, readQuota().count),
    remaining: () => Math.max(0, QUOTA_LIMIT - readQuota().count),
    canView: () => readQuota().count < QUOTA_LIMIT,
    pageAlreadyCounted(page) {
      try { return sessionStorage.getItem("havasite_view_" + page) === "1"; } catch { return false; }
    },
    countPage(page) {
      if (this.pageAlreadyCounted(page)) return this.remaining();
      const q = readQuota();
      if (q.count < QUOTA_LIMIT) { q.count += 1; writeQuota(q); }
      try { sessionStorage.setItem("havasite_view_" + page, "1"); } catch {}
      return this.remaining();
    },
  };

  // ---------------- acil durum modu ----------------
  function setupEmergencyMode() {
    const fab = document.createElement("button");
    fab.className = "emergency-fab";
    fab.type = "button";
    fab.id = "emergencyFab";
    fab.innerHTML = `${window.HavaIcon("siren", { size: 20 })} ACİL`;
    document.body.appendChild(fab);

    const overlay = document.createElement("div");
    overlay.className = "emergency-overlay";
    overlay.id = "emergencyOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="emergency-panel" role="dialog" aria-modal="true">
        <div class="emergency-head">
          <h2>${window.HavaIcon("alert-triangle", { size: 22 })} Acil Durum Modu</h2>
          <button class="emergency-close" id="emergencyClose" type="button" aria-label="Kapat">${window.HavaIcon("x", { size: 18 })}</button>
        </div>
        <div class="em-grid">
          <div class="em-card">
            <span class="em-label">Son Deprem</span>
            <div class="em-value" id="emQuake">Yükleniyor…</div>
            <div class="em-sub" id="emQuakeSub"></div>
          </div>
          <div class="em-card">
            <span class="em-label">Aktif Yangın Tespiti</span>
            <div class="em-value" id="emFire">Yükleniyor…</div>
            <div class="em-sub" id="emFireSub">son 24 saat</div>
          </div>
        </div>
        <div class="em-numbers">
          <a class="em-number" href="tel:112"><div class="num">112</div><div class="lbl">Acil Çağrı Merkezi</div></a>
          <a class="em-number" href="tel:122"><div class="num">122</div><div class="lbl">AFAD İhbar Hattı</div></a>
        </div>
        <p class="em-note">
          Bu ekran gayriresmî bir özet sunar; kendi verilerimizi doğrudan aramadan kontrol etmene yardımcı olur.
          Resmî ve güncel yönlendirmeler için AFAD Deprem uygulamasını, 112'yi ve yetkili kurum duyurularını esas al.
          Deprem sırasında/sonrasında "Çök-Kapan-Tutun" kuralını uygula; bina hasarlıysa dışarı çık ve toplanma alanına git.
        </p>
      </div>`;
    document.body.appendChild(overlay);

    function open() {
      overlay.hidden = false;
      loadEmergencyData();
    }
    function close() {
      overlay.hidden = true;
    }

    fab.addEventListener("click", open);
    document.getElementById("emergencyClose").addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) close();
    });

    async function loadEmergencyData() {
      try {
        const r = await fetch("/api/quakes?limit=1");
        const data = await r.json();
        if (data.ok && data.data.length) {
          const q = data.data[0];
          document.getElementById("emQuake").textContent = `M${q.mag.toFixed(1)} — ${q.closestCity || q.title}`;
          document.getElementById("emQuakeSub").textContent = window.timeAgoTR(q.date.replace(" ", "T"));
        } else {
          document.getElementById("emQuake").textContent = "veri yok";
        }
      } catch {
        document.getElementById("emQuake").textContent = "bağlantı hatası";
      }
      try {
        const r2 = await fetch("/api/fires?days=1");
        const data2 = await r2.json();
        if (data2.ok) {
          document.getElementById("emFire").textContent = `${data2.count} nokta`;
        } else if (data2.reason === "no_key") {
          document.getElementById("emFire").textContent = "—";
          document.getElementById("emFireSub").textContent = "anahtar tanımlı değil";
        } else {
          document.getElementById("emFire").textContent = "veri yok";
        }
      } catch {
        document.getElementById("emFire").textContent = "bağlantı hatası";
      }
    }
  }

  // ---------------- tema (acik/koyu) ----------------
  const THEME_KEY = "havasite_theme";
  const SUN_ICON = window.HavaIcon("sun", { size: 18, cls: "theme-icon" });
  const MOON_ICON = window.HavaIcon("moon", { size: 18, cls: "theme-icon" });

  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }

  function applyTheme(theme, persist = true) {
    document.documentElement.setAttribute("data-theme", theme);
    // telefonun durum cubugu / tarayici cubugu temaya uysun
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme === "light" ? "#f4f6f9" : "#0e1626");
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch {}
    }
    document.querySelectorAll("[data-theme-icon]").forEach((el) => {
      el.innerHTML = theme === "light" ? SUN_ICON : MOON_ICON;
    });
    document.querySelectorAll("[data-theme-radio]").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.themeRadio === theme);
    });
  }

  window.HavaTheme = {
    get: getTheme,
    set: (t) => applyTheme(t === "light" ? "light" : "dark"),
  };

  function setupThemeToggle() {
    const urlTheme = new URLSearchParams(location.search).get("theme");
    if (urlTheme === "light" || urlTheme === "dark") applyTheme(urlTheme, true);
    else applyTheme(getTheme(), false);
    const btn = document.getElementById("themeToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        applyTheme(getTheme() === "light" ? "dark" : "light");
      });
    }
  }

  // ---------------- kullanici tercihleri (profil ozellestirme) ----------------
  const PREFS_KEY = "havasite_prefs";
  const DEFAULT_PREFS = { favoriteCity: "", quakeAlertMag: 3.5 };

  function getPrefs() {
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }
  function setPrefs(p) {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch (err) {
      console.warn("Tercihler kaydedilemedi:", err);
    }
  }
  window.HavaPrefs = { get: getPrefs, set: setPrefs };

  function setupNav() {
    const nav = document.querySelector(".site-nav");
    if (!nav) return;
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const burger = document.querySelector(".hamburger");
    const links = document.querySelector(".nav-links");
    if (burger && links) {
      burger.addEventListener("click", () => links.classList.toggle("open"));
      links.querySelectorAll("a").forEach((a) =>
        a.addEventListener("click", () => links.classList.remove("open"))
      );
    }
  }

  function markActiveLink() {
    const path = location.pathname.replace(/\/$/, "").split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a[data-page]").forEach((a) => {
      if (a.dataset.page === path) a.classList.add("active");
    });
  }

  function setupReveal() {
    const targets = document.querySelectorAll(".reveal, .reveal-scale");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("in-view"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    targets.forEach((t) => io.observe(t));
  }

  // ---------------- oturum (sunucu tarafli, imzali cerez) ----------------
  // Sayfa acilir acilmaz oturumu sunucuya sorar (window.HavaAuth.ready). Senkron
  // erisim gerektiren kod HavaAuth.ready.then(...) ile beklemeli; DOMContentLoaded'da
  // bu beklendikten sonra nav ve sayfa koruma (data-require-auth/-admin) uygulanir.
  let sessionUser = null;

  function fetchSession() {
    return fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        sessionUser = data.ok ? data.user : null;
        return sessionUser;
      })
      .catch(() => {
        sessionUser = null;
        return null;
      });
  }

  window.HavaAuth = {
    ready: fetchSession(),
    getUser: () => sessionUser,
    async refresh() {
      window.HavaAuth.ready = fetchSession();
      return window.HavaAuth.ready;
    },
    async logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      } catch (err) {
        console.warn("Cikis sirasinda hata:", err);
      }
      sessionUser = null;
      location.href = "index.html";
    },
  };

  function setupUserState(user) {
    const slot = document.getElementById("navUser");
    if (!slot) return;
    if (user) {
      slot.innerHTML = `
        <a class="user-chip" href="ayarlar.html" title="Profil ve ayarlar">
          <span class="user-avatar">${escapeHtml((user.name || "?").slice(0, 1).toUpperCase())}</span>
          <span class="label">${escapeHtml(user.name || user.email || "Kullanıcı")}</span>
        </a>
        <button class="logout-btn" id="logoutBtn" type="button" title="Çıkış yap">
          <span class="label">Çıkış</span>
          ${window.HavaIcon("log-out", { size: 16 })}
        </button>
      `;
      document.getElementById("logoutBtn").addEventListener("click", () => window.HavaAuth.logout());
    } else {
      const onLoginPage = /login\.html$/.test(location.pathname);
      const onQuotaPage = document.body.hasAttribute("data-guest-quota");
      if (onLoginPage || !onQuotaPage) {
        slot.innerHTML = `<a class="btn btn-primary btn-sm" href="login.html"><span class="label">Giriş Yap</span>${window.HavaIcon("arrow-right", { size: 15 })}</a>`;
        return;
      }
      const used = window.HavaQuota.used();
      const limit = window.HavaQuota.limit;
      const remaining = window.HavaQuota.remaining();
      const dots = Array.from({ length: limit }, (_, i) =>
        `<span class="gq-dot${i < used ? " spent" : ""}"></span>`
      ).join("");
      slot.innerHTML = `
        <span class="guest-quota${remaining <= 1 ? " low" : ""}" title="Misafir olarak bugün ${remaining}/${limit} ücretsiz görüntüleme hakkın kaldı">
          <span class="gq-text">Misafir</span>
          <span class="gq-dots" aria-hidden="true">${dots}</span>
          <a class="gq-login" href="login.html?redirect=${encodeURIComponent(location.pathname.split("/").pop() || "index.html")}">Giriş</a>
        </span>`;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  window.escapeHtml = escapeHtml;

  // ---------------- deger guncellemesinde kisa "flash" animasyonu ----------------
  window.flashUpdate = function flashUpdate(el) {
    if (!el) return;
    el.classList.remove("value-flash");
    // reflow tetikleyerek animasyonun her seferinde yeniden oynamasini sagla
    void el.offsetWidth;
    el.classList.add("value-flash");
  };

  // ---------------- animasyonlu range slider dolgusu ----------------
  // filter-bar / field icindeki <input type="range"> elemanlarini CSS'te
  // tanimli --fill degiskenine baglar, boylece topuzun soluna dogru renkli
  // bir "dolgu" izlenimi olusur ve deger degistikce yumusakca guncellenir.
  window.bindRangeFill = function bindRangeFill(input) {
    if (!input) return;
    const update = () => {
      const min = parseFloat(input.min || "0");
      const max = parseFloat(input.max || "100");
      const val = parseFloat(input.value);
      const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
      input.style.setProperty("--fill", `${Math.max(0, Math.min(100, pct))}%`);
    };
    input.addEventListener("input", update);
    update();
  };

  // ---------------- toast ----------------
  function ensureToastStack() {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    return stack;
  }
  window.showToast = function showToast(message, opts = {}) {
    const stack = ensureToastStack();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    if (opts.accent) el.style.borderColor = opts.accent;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .35s ease, transform .35s ease";
      el.style.opacity = "0";
      el.style.transform = "translateY(8px)";
      setTimeout(() => el.remove(), 350);
    }, opts.duration || 4200);
  };

  // ---------------- zaman bicimleme ----------------
  window.timeAgoTR = function timeAgoTR(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(String(dateInput).replace(" ", "T"));
    const diffMs = Date.now() - d.getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 5) return "az önce";
    if (s < 60) return `${s} sn önce`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} dk önce`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} sa önce`;
    const dd = Math.floor(h / 24);
    return `${dd} gün önce`;
  };

  window.formatClock = function formatClock(date) {
    return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
})();
