// Il sinirli olay haritasi (deprem ve yangin panelleri ortak).
// 81 il sinirlari, secili listedeki olay sayisina gore renklenir; uzerinde olay noktalari,
// solda canli ozet paneli, altta olcek. Hava haritasiyla ayni gorunum.
// Sinirlar: geoBoundaries (© OpenStreetMap katkicilari, CC BY-SA)
// Aktif faylar (istege bagli): GEM Global Active Faults Database (Styron & Pagani 2020, CC BY-SA 4.0)
(function () {
  "use strict";

  const TR_BOUNDS = [[35.8, 25.7], [42.1, 44.8]];
  let geoPromise = null;
  const loadGeo = () => (geoPromise = geoPromise || fetch("/data/tr-iller.geojson").then((r) => r.json()).catch(() => null));

  function mix(stops, t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < stops.length - 1; i++) {
      const [x0, c0] = stops[i], [x1, c1] = stops[i + 1];
      if (t <= x1) { const k = (t - x0) / (x1 - x0 || 1); return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k))})`; }
    }
    return `rgb(${stops[stops.length - 1][1]})`;
  }

  /**
   * opts: {
   *   el: harita kutusu id'si, statsEl, legendEl,
   *   stops: [[0..1, [r,g,b]], ...]  il renk olcegi (0 = en az, 1 = en cok),
   *   unit: "deprem" | "tespit", legendTitle,
   *   onProvinceClick(name)
   * }
   */
  function create(opts) {
    const map = L.map(opts.el, { zoomControl: false, scrollWheelZoom: false, zoomSnap: 0.25, minZoom: 4.5, maxZoom: opts.maxZoom || 12, maxBounds: [[32, 20], [46, 50]], maxBoundsViscosity: 0.8 });
    L.control.zoom({ position: "topright", zoomInTitle: "Yakınlaştır", zoomOutTitle: "Uzaklaştır" }).addTo(map);
    const wide = () => window.innerWidth > 700;
    const fit = () => map.fitBounds(TR_BOUNDS, wide() ? { paddingTopLeft: [200, 10], paddingBottomRight: [10, 40] } : { padding: [6, 6] });
    fit();
    window.HavaMap.addBaseLayer(map, { labels: false });
    map.attributionControl.addAttribution("Sınırlar: geoBoundaries");
    map.once("click", () => map.scrollWheelZoom.enable());
    map.createPane("points");
    map.getPane("points").style.zIndex = 450;
    map.getPane("points").classList.add(`pts-${opts.kind}`);
    const points = L.layerGroup().addTo(map);
    if (opts.faults) addFaults(map);

    const st = { counts: new Map(), extra: new Map(), max: 1, prov: null, active: null };

    function color(name) {
      const n = st.counts.get(name) || 0;
      if (!n || opts.noFill) return null; // noFill: iller boyanmaz (yalnizca noktalar)
      return mix(opts.stops, Math.sqrt(n / st.max));
    }
    function style(f) {
      const c = color(f.properties.n);
      const active = st.active === f.properties.n;
      return { className: "prov", fillColor: c || "#5b6470", fillOpacity: c ? (active ? 0.85 : 0.62) : opts.noFill ? 0.18 : 0.1, weight: active ? 2.5 : 0.8, color: active ? "#ffffff" : "#0b0d11" };
    }
    function tooltip(name) {
      const n = st.counts.get(name) || 0;
      const ex = st.extra.get(name);
      return `<strong>${window.escapeHtml(name)}</strong><span class="pt-main">${n ? `${n} ${opts.unit}` : `${opts.unit} yok`}</span>${ex ? `<span class="pt-sub">${ex}</span>` : ""}`;
    }
    loadGeo().then((geo) => {
      if (!geo) return;
      st.prov = L.geoJSON(geo, {
        style,
        onEachFeature: (f, layer) => {
          layer.on({
            mouseover: () => layer.bringToFront(),
            click: () => {
              st.active = st.active === f.properties.n ? null : f.properties.n;
              st.prov.setStyle(style);
              if (st.active) map.flyToBounds(layer.getBounds(), { padding: [40, 40], duration: 0.7, maxZoom: 9 });
              opts.onProvinceClick && opts.onProvinceClick(st.active);
            },
          });
          layer.bindTooltip(() => tooltip(f.properties.n), { sticky: true, direction: "top", offset: [0, -10], className: "prov-tip" });
        },
      }).addTo(map);
      st.prov.bringToBack();
    });

    return {
      map,
      points,
      invalidate() { setTimeout(() => map.invalidateSize(), 60); },
      fitTurkey: fit,
      // counts: Map(il -> sayi), extra: Map(il -> ipucu ek satiri)
      setCounts(counts, extra) {
        st.counts = counts;
        st.extra = extra || new Map();
        st.max = Math.max(1, ...counts.values());
        if (st.prov) st.prov.setStyle(style);
        renderLegend();
      },
      setStats(html) {
        const el = document.getElementById(opts.statsEl);
        if (!el) return;
        el.innerHTML = html;
        el.querySelectorAll("[data-fly]").forEach((b) => b.addEventListener("click", () => {
          const [lat, lon] = b.dataset.fly.split(",").map(Number);
          map.flyTo([lat, lon], 8.5, { duration: 0.8 });
        }));
      },
    };

    function renderLegend() {
      const el = document.getElementById(opts.legendEl);
      if (!el) return;
      if (opts.legendHtml) { el.innerHTML = opts.legendHtml; return; }
      const grad = opts.stops.map(([t, c]) => `rgb(${c}) ${Math.round(t * 100)}%`).join(", ");
      const mid = Math.max(1, Math.round(st.max / 4));
      el.innerHTML = `<span class="ml-title">${opts.legendTitle} <small>il başına</small></span>
        <div class="ml-scale"><div class="ml-bar" style="background:linear-gradient(90deg, ${grad})"></div>
        <div class="ml-ticks"><span style="left:0%">1</span><span style="left:50%">${mid}</span><span style="left:100%">${st.max}</span></div></div>`;
    }
  }

  // fay turleri: renk ve aciklama (mobil uygulamayla ayni)
  const FAULT_GROUPS = {
    yanal: { label: "Yanal atımlı", color: "#ff5a4e", text: "İki kaya bloğu birbirine göre yatay kayar. Kuzey Anadolu Fayı (sağ yanal) ve Doğu Anadolu Fayı (sol yanal) bu türdendir." },
    normal: { label: "Normal", color: "#b48cff", text: "Yer kabuğu gerilir ve bir blok aşağı düşer; Batı Anadolu'daki çöküntü ovaları (graben) bu faylarla oluşmuştur." },
    ters: { label: "Ters (bindirme)", color: "#22d3ee", text: "Yer kabuğu sıkışır ve bir blok diğerinin üzerine çıkar; daha çok güneydoğuda, Bitlis-Zagros kuşağında görülür." },
  };
  const TYPE_TR = { Dextral: "Sağ yanal doğrultu atımlı", Sinistral: "Sol yanal doğrultu atımlı", Normal: "Normal fay (açılma)", Reverse: "Ters fay (sıkışma)", "Dextral-Normal": "Sağ yanal, normal bileşenli", "Sinistral-Normal": "Sol yanal, normal bileşenli", "Dextral-Reverse": "Sağ yanal, ters bileşenli", "Sinistral-Reverse": "Sol yanal, ters bileşenli" };
  const groupOf = (t) => (String(t).startsWith("Normal") ? "normal" : String(t).startsWith("Reverse") ? "ters" : "yanal");
  const faultColor = (t) => FAULT_GROUPS[groupOf(t)].color;
  const FAULT_NAMES = [
    { name: "Kuzey Anadolu Fayı", lat: 40.95, lon: 33.6 }, { name: "Kuzey Anadolu Fayı", lat: 39.95, lon: 38.6 },
    { name: "Doğu Anadolu Fayı", lat: 38.3, lon: 38.75 }, { name: "Ölü Deniz Fay Zonu", lat: 35.9, lon: 36.15 },
    { name: "Batı Anadolu grabenleri", lat: 38.15, lon: 28.4 }, { name: "Bitlis-Zagros Kuşağı", lat: 38.1, lon: 42.3 },
  ];
  function faultPopup(p) {
    const g = FAULT_GROUPS[groupOf(p.slip_type)];
    const m = /\(([\d.]+)?,([\d.]+)?,([\d.]+)?\)/.exec(p.net_slip_rate || "");
    const rate = m && m[1] ? `Yılda yaklaşık <b>${m[1]} mm</b>${m[2] && m[3] && (m[2] !== m[1] || m[3] !== m[1]) ? ` (${m[2]}–${m[3]})` : ""} kayıyor. ` : "";
    return `<div class="map-pop"><strong><i style="background:${g.color}"></i>${TYPE_TR[p.slip_type] || "Aktif fay"}</strong><br/>${rate}${g.text}<br/><small>Kaynak: GEM Küresel Aktif Faylar Veritabanı (EMME/SHARE). Resmî fay haritası için MTA'yı esas al.</small></div>`;
  }

  // aktif fay hatlari: il boyamasinin ustunde, noktalarin altinda; sag ustte ac/kapa dugmesi
  let faultsPromise = null;
  const loadFaults = () => (faultsPromise = faultsPromise || fetch("/data/faults.geojson").then((r) => r.json()).catch(() => null));
  function addFaults(map) {
    map.createPane("faults");
    map.getPane("faults").style.zIndex = 430;
    let layer = null, on = true;
    loadFaults().then((geo) => {
      if (!geo) return;
      layer = L.layerGroup([
        L.geoJSON(geo, {
          pane: "faults",
          style: (f) => ({ color: faultColor(f.properties.slip_type), weight: 2, opacity: 0.75 }),
          onEachFeature: (f, l) => {
            l.bindPopup(() => faultPopup(f.properties), { className: "fault-pop" });
            l.on({ mouseover: () => l.setStyle({ weight: 4, opacity: 1 }), mouseout: () => l.setStyle({ weight: 2, opacity: 0.75 }) });
          },
        }),
        ...FAULT_NAMES.map((n) => L.marker([n.lat, n.lon], { pane: "faults", interactive: false, icon: L.divIcon({ className: "fault-name", html: `<span>${n.name}</span>`, iconSize: [0, 0] }) })),
      ]);
      if (on) layer.addTo(map);
    });
    map.attributionControl.addAttribution('Faylar: <a href="https://github.com/GEMScienceTools/gem-global-active-faults" target="_blank" rel="noopener">GEM</a> (CC BY-SA 4.0)');
    const Ctl = L.Control.extend({
      onAdd() {
        const b = L.DomUtil.create("button", "fault-toggle on");
        b.type = "button";
        b.innerHTML = '<i></i><span>Fay hatları</span>';
        b.title = "Aktif fay hatlarını göster/gizle";
        b.setAttribute("aria-pressed", "true");
        L.DomEvent.disableClickPropagation(b);
        L.DomEvent.on(b, "click", () => {
          on = !on;
          b.classList.toggle("on", on);
          b.setAttribute("aria-pressed", String(on));
          if (layer) (on ? layer.addTo(map) : map.removeLayer(layer));
        });
        return b;
      },
    });
    new Ctl({ position: "topright" }).addTo(map);
  }

  window.HavaProvMap = { create };
})();
