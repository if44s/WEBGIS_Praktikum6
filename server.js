require('dotenv').config();
const express = require('express');
const path = require('path');
const { ambilGeoJSON } = require('./src/wfs');

// ---- Konfigurasi dari .env ----
const config = {
  port: Number(process.env.PORT || 3000),
  wfsUrl: process.env.WFS_URL,
  maxFeatures: Number(process.env.WFS_MAX_FEATURES || 100),
  // BARU: konfigurasi WMS
  wmsUrl: process.env.WMS_URL || '',
  wmsLayers: (process.env.WMS_LAYERS || '')
    .split(',')
    .map((nama) => nama.trim())
    .filter(Boolean)
};

// WFS_LAYERS=workspace:layer1,workspace:layer2
// Opsional batas per layer: workspace:layer|500
// id di URL = nama layer tanpa workspace (mis. jalan_surabaya)
function bacaLayers(teks, maxDefault) {
  const daftar = new Map();
  (teks || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [nama, batas] = item.split('|').map((s) => s.trim());

      if (!/^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/.test(nama)) {
        throw new Error('Nama layer harus workspace:layer: ' + item);
      }

      const max = batas === undefined ? maxDefault : Number(batas);
      if (!Number.isInteger(max) || max < 1) {
        throw new Error('Batas fitur tidak valid pada: ' + item);
      }

      const id = nama.split(':')[1];
      if (daftar.has(id)) {
        throw new Error('Nama layer ganda (setelah workspace): ' + id);
      }
      daftar.set(id, { nama, max });
    });
  return daftar;
}

// ---- Validasi (startup dihentikan bila tidak sah) ----
if (!Number.isInteger(config.port) ||
    config.port < 1 || config.port > 65535) {
  throw new Error('PORT harus berupa bilangan 1-65535.');
}
if (!config.wfsUrl) {
  throw new Error('Isi WFS_URL pada .env.');
}
const alamatWfs = new URL(config.wfsUrl);
if (!['http:', 'https:'].includes(alamatWfs.protocol)) {
  throw new Error('WFS_URL harus menggunakan HTTP/HTTPS.');
}
if (!Number.isInteger(config.maxFeatures) ||
    config.maxFeatures < 1 || config.maxFeatures > 10000) {
  throw new Error('WFS_MAX_FEATURES harus bernilai 1-10000.');
}

// BARU: validasi WMS_URL
if (config.wmsUrl) {
  const alamatWms = new URL(config.wmsUrl);
  if (!['http:', 'https:'].includes(alamatWms.protocol)) {
    throw new Error('WMS_URL harus menggunakan HTTP/HTTPS.');
  }
}

const layers = bacaLayers(process.env.WFS_LAYERS, config.maxFeatures);
if (layers.size === 0) {
  throw new Error('Isi WFS_LAYERS pada .env.');
}

const app = express();
app.disable('x-powered-by');

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'webgis-backend' });
});

// Daftar layer yang tersedia
app.get('/api/layers', (req, res) => {
  res.json({
    layers: Array.from(layers, ([id, l]) => ({ id, nama: l.nama, max: l.max }))
  });
});

// GeoJSON satu layer, mis. /api/layer-data/jalan_surabaya
app.get('/api/layer-data/:id', async (req, res) => {
  const layer = layers.get(req.params.id);
  if (!layer) {
    return res.status(404).json({
      error: 'Layer tidak terdaftar.',
      tersedia: Array.from(layers.keys())
    });
  }

  try {
    const geojson = await ambilGeoJSON(config, layer);
    res.json(geojson);
  } catch (error) {
    const timeout = ['ECONNABORTED', 'ETIMEDOUT'].includes(error.code);
    console.error('Pengambilan WFS gagal (' + layer.nama + '):', error.message);
    res.status(timeout ? 504 : 502).json({
      error: timeout
        ? 'Waktu tunggu GeoServer habis.'
        : 'Gagal memperoleh GeoJSON yang valid dari GeoServer.'
    });
  }
});

// BARU: konfigurasi untuk frontend (hanya info yang memang perlu diketahui browser)
app.get('/api/config', (req, res) => {
  res.json({ wmsUrl: config.wmsUrl, wmsLayers: config.wmsLayers });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan.' });
});

app.listen(config.port, '127.0.0.1', () => {
  console.log('WebGIS: http://localhost:' + config.port);
  console.log('Layer:', Array.from(layers.values()));
});