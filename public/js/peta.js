'use strict';

// ============================================================
// Tahap 6: Inisialisasi peta dan basemap
// ============================================================
const PUSAT_AWAL = [-7.2575, 112.7521];   // [lintang, bujur] Surabaya
const ZOOM_AWAL = 11;
const teksStatus = document.getElementById('status');

const map = L.map('map').setView(PUSAT_AWAL, ZOOM_AWAL);

const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  zIndex: 1,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">' +
    'OpenStreetMap</a> contributors'
}).addTo(map);

const esri = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/' +
  'tile/{z}/{y}/{x}', {
    maxZoom: 19,
    zIndex: 1,
    attribution: 'Tiles &copy; Esri'
  });

L.control.scale({ imperial: false }).addTo(map);

// ============================================================
// Tahap 10: Pane khusus supaya urutan tampil terkendali
// tilePane (200): basemap + WMS | paneBatas (450) | paneTitik (460)
// markerPane (600): marker
// ============================================================
map.createPane('paneBatas');
map.getPane('paneBatas').style.zIndex = 450;
map.createPane('paneTitik');
map.getPane('paneTitik').style.zIndex = 460;

// ============================================================
// Tahap 7: Data GeoJSON dari backend (WFS)
// ============================================================
async function ambilJSON(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Permintaan gagal.');
  }
  return data;
}

// Popup aman: atribut disusun dengan textContent, bukan string HTML
function buatPopup(properties) {
  const tabel = document.createElement('table');
  Object.entries(properties || {}).forEach(([kunci, nilai]) => {
    const baris = tabel.insertRow();
    baris.insertCell().textContent = kunci;
    baris.insertCell().textContent = nilai === null ? '-' : String(nilai);
  });
  return tabel;
}

const WARNA = ['#14532d', '#dc2626', '#1d4ed8', '#9333ea'];

async function muatLayerWfs(id, indeks) {
  const data = await ambilJSON('/api/layer-data/' + encodeURIComponent(id));
  const warna = WARNA[indeks % WARNA.length];

  const layer = L.geoJSON(data, {
    pane: 'paneBatas',
    style: { color: warna, weight: 2, fillOpacity: 0.1 },
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      pane: 'paneTitik',
      radius: 6,
      color: '#ffffff',
      weight: 1,
      fillColor: warna,
      fillOpacity: 0.9
    }),
    onEachFeature: (feature, lapis) => {
      lapis.bindPopup(buatPopup(feature.properties), { maxHeight: 250 });
    }
  });

  return { layer: layer, jumlah: data.features.length };
}

// ============================================================
// Tahap 8: Layer WMS
// ============================================================
function buatLayerWms(cfg) {
  const hasil = {};
  cfg.wmsLayers.forEach((nama, i) => {
    hasil['WMS: ' + nama.split(':')[1]] = L.tileLayer.wms(cfg.wmsUrl, {
      layers: nama,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      opacity: 0.7,
      zIndex: 10 + i
    });
  });
  return hasil;
}

// ============================================================
// Tahap 9: Marker, popup, layer control, dan perakitan
// ============================================================
function buatTitikContoh() {
  const koordinat = [-7.2459, 112.7378];   // Tugu Pahlawan, Surabaya
  const marker = L.marker(koordinat, {
    title: 'Tugu Pahlawan',
    zIndexOffset: 1000
  });
  marker.bindPopup(buatPopup({
    Nama: 'Tugu Pahlawan',
    Jenis: 'Titik contoh',
    Koordinat: koordinat.join(', ')
  }));
  return L.layerGroup([marker]);
}

async function main() {
  const tambahan = {};
  const catatan = [];

  // --- WFS: satu layer per entri WFS_LAYERS di backend ---
  try {
    const daftar = await ambilJSON('/api/layers');
    let sudahZoom = false;
    let berhasil = 0;
    const gagal = [];

    for (const [i, l] of daftar.layers.entries()) {
      try {
        const hasil = await muatLayerWfs(l.id, i);
        hasil.layer.addTo(map);
        tambahan['WFS: ' + l.id + ' (' + hasil.jumlah + ')'] = hasil.layer;
        berhasil++;

        // Koleksi kosong sah: getBounds tidak valid, fitBounds dilewati
        if (!sudahZoom && hasil.layer.getBounds().isValid()) {
          map.fitBounds(hasil.layer.getBounds());
          sudahZoom = true;
        }
      } catch (error) {
        console.error('Layer WFS gagal:', l.id, error);
        gagal.push(l.id);
      }
    }

    catatan.push('WFS: ' + berhasil + ' layer' +
      (gagal.length ? ' (gagal: ' + gagal.join(', ') + ')' : ''));
  } catch (error) {
    catatan.push('WFS gagal: ' + error.message);
  }

  // --- WMS: alamat dan nama layer dari /api/config ---
  try {
    const cfg = await ambilJSON('/api/config');
    if (cfg.wmsUrl && cfg.wmsLayers.length > 0) {
      const wms = buatLayerWms(cfg);
      Object.values(wms).forEach((lapis) => lapis.addTo(map));
      Object.assign(tambahan, wms);
      catatan.push('WMS: ' + cfg.wmsLayers.length + ' layer');
    }
  } catch (error) {
    catatan.push('Konfigurasi gagal: ' + error.message);
  }

  // --- Marker contoh ---
  tambahan['Titik contoh'] = buatTitikContoh().addTo(map);

  // --- Layer control: basemap (radio) dan layer tambahan (checkbox) ---
  L.control.layers(
    { 'OpenStreetMap': osm, 'Citra Esri': esri },
    tambahan,
    { collapsed: false }
  ).addTo(map);

  teksStatus.textContent = catatan.join(' | ');
}

main();