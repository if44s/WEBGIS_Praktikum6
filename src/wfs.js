const axios = require('axios');

// `layer` berupa objek { nama, max } dari daftar WFS_LAYERS di .env.
async function ambilGeoJSON(config, layer) {
  const response = await axios.get(config.wfsUrl, {
    params: {
      service: 'WFS',
      version: '1.0.0',
      request: 'GetFeature',
      typeName: layer.nama,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      maxFeatures: layer.max
    },
    timeout: 30000,
    maxContentLength: 50 * 1024 * 1024,
    responseType: 'json'
  });

  const data = response.data;

  // GeoServer kadang membalas XML pengecualian meski status HTTP 200,
  // jadi bentuk data tetap harus divalidasi di sini.
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Respons WFS bukan FeatureCollection yang valid.');
  }

  return data;
}

module.exports = { ambilGeoJSON };