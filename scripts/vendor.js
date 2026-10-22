// 외부 라이브러리를 www/lib 로 복사 (번들러 없이 사용)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), lib = path.join(root, 'www', 'lib');
const cp = (from, to) => { fs.mkdirSync(path.dirname(path.join(lib, to)), { recursive: true }); fs.copyFileSync(path.join(root, 'node_modules', from), path.join(lib, to)); };
cp('@capacitor/core/dist/capacitor.js', 'capacitor.js');
cp('jsqr/dist/jsQR.js', 'jsQR.js');
cp('leaflet/dist/leaflet.js', 'leaflet/leaflet.js');
cp('leaflet/dist/leaflet.css', 'leaflet/leaflet.css');
for (const f of fs.readdirSync(path.join(root, 'node_modules/leaflet/dist/images'))) cp('leaflet/dist/images/' + f, 'leaflet/images/' + f);
console.log('vendor: www/lib 준비 완료');
