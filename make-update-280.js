
const fs = require('fs');
const path = require('path');
const root = 'E:/CODEX 1/Bitum app/InfraFlow-proiect/InfraFlow Git';

const files = [
  'version.json',
  'CHANGELOG.md',
  'server/package.json',
  'server/app.js',
  'server/core/kiosk-sessions.js',
  'server/modules/hr/routes.js',
  'server/modules/fleet/trip-routes.js',
  'client/src/pages/KioskPage.jsx',
  'client/src/pages/FoaieParcursPage.jsx',
  'client/src/components/ui/Input.jsx',
  'client/dist/index.html',
];

// Add all client/dist/assets
const distAssets = fs.readdirSync(path.join(root, 'client/dist/assets'));
distAssets.forEach(f => files.push('client/dist/assets/' + f));

const JSZip = require('./installer/node_modules/jszip');
const zip = new JSZip();
files.forEach(f => {
  const full = path.join(root, f);
  if (fs.existsSync(full)) {
    zip.file(f, fs.readFileSync(full));
  } else {
    console.warn('MISSING:', f);
  }
});
const outDir = path.join(root, 'installer/output');
fs.mkdirSync(outDir, { recursive: true });
zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  .then(buf => {
    const out = path.join(outDir, 'InfraFlow-update-v2.8.0.zip');
    fs.writeFileSync(out, buf);
    console.log('ZIP creat:', out, '(' + (buf.length / 1024).toFixed(0) + ' KB,' , files.length + ' files)');
  });
