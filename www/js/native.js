/* 네이티브 연동 계층 — 안드로이드·iOS 앱에서는 Capacitor 플러그인을, 웹(PWA)에서는 브라우저 API를 사용한다. */
(function () {
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const platform = isNative ? Cap.getPlatform() : 'web';
  const reg = n => (isNative && window.capacitorExports) ? capacitorExports.registerPlugin(n) : null;
  const P = {
    Camera: reg('Camera'), Geolocation: reg('Geolocation'), Haptics: reg('Haptics'), Share: reg('Share'),
    StatusBar: reg('StatusBar'), SplashScreen: reg('SplashScreen'), App: reg('App'), Filesystem: reg('Filesystem')
  };

  /* 이미지 축소·압축 (증거 사진 용량 관리: 장변 1280px, JPEG 0.78) */
  function compress(src, max = 1280, q = 0.78) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = rej; img.src = src;
    });
  }

  /* 사진 촬영 */
  async function takePhoto() {
    if (P.Camera) {
      const r = await P.Camera.getPhoto({ quality: 80, width: 1600, resultType: 'dataUrl', source: 'CAMERA', saveToGallery: false, correctOrientation: true });
      return compress(r.dataUrl);
    }
    return new Promise((res, rej) => {
      const inp = document.getElementById('fileCam');
      inp.value = '';
      inp.onchange = () => {
        const f = inp.files && inp.files[0]; if (!f) return rej(new Error('cancel'));
        const fr = new FileReader(); fr.onload = () => compress(fr.result).then(res, rej); fr.onerror = rej; fr.readAsDataURL(f);
      };
      inp.click();
    });
  }

  /* 위치 */
  async function getPosition() {
    if (P.Geolocation) {
      const p = await P.Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
      return { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
    }
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('no-geo'));
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 });
    });
  }
  let nativeWatch = null, webWatch = null;
  async function watchPosition(cb, onErr) {
    stopWatch();
    if (P.Geolocation) {
      nativeWatch = await P.Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000 }, (p, err) => {
        if (err || !p) { onErr && onErr(err); return; }
        cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
      });
      return;
    }
    if (!navigator.geolocation) { onErr && onErr(new Error('no-geo')); return; }
    webWatch = navigator.geolocation.watchPosition(p => cb({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), e => onErr && onErr(e), { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
  }
  function stopWatch() {
    if (nativeWatch && P.Geolocation) { P.Geolocation.clearWatch({ id: nativeWatch }); nativeWatch = null; }
    if (webWatch != null && navigator.geolocation) { navigator.geolocation.clearWatch(webWatch); webWatch = null; }
  }

  async function permissions() {
    const out = { camera: '확인 불가', location: '확인 불가' };
    try {
      if (P.Camera) { const r = await P.Camera.checkPermissions(); out.camera = r.camera; }
      else if (navigator.permissions) { out.camera = (await navigator.permissions.query({ name: 'camera' })).state; }
    } catch (e) { }
    try {
      if (P.Geolocation) { const r = await P.Geolocation.checkPermissions(); out.location = r.location; }
      else if (navigator.permissions) { out.location = (await navigator.permissions.query({ name: 'geolocation' })).state; }
    } catch (e) { }
    return out;
  }
  async function requestPermissions() {
    try { if (P.Geolocation) await P.Geolocation.requestPermissions(); } catch (e) { }
    try { if (P.Camera) await P.Camera.requestPermissions({ permissions: ['camera'] }); } catch (e) { }
  }

  function haptic(kind = 'light') {
    try {
      if (P.Haptics) { kind === 'success' ? P.Haptics.notification({ type: 'SUCCESS' }) : P.Haptics.impact({ style: kind === 'heavy' ? 'HEAVY' : 'LIGHT' }); return; }
      if (navigator.vibrate) navigator.vibrate(kind === 'heavy' || kind === 'success' ? [30, 40, 30] : 12);
    } catch (e) { }
  }

  /* 파일 공유 — 앱: 캐시에 저장 후 공유시트 / 웹: Web Share API 또는 다운로드 */
  const dataUrlToB64 = d => d.split(',')[1];
  async function shareFiles({ title, text, files }) {
    if (isNative && P.Share) {
      const uris = [];
      if (P.Filesystem && files && files.length) {
        for (const f of files) {
          const data = f.dataUrl ? dataUrlToB64(f.dataUrl) : btoa(unescape(encodeURIComponent(f.text)));
          const r = await P.Filesystem.writeFile({ path: f.name, data, directory: 'CACHE', recursive: true });
          uris.push(r.uri);
        }
      }
      await P.Share.share({ title, text, files: uris.length ? uris : undefined, dialogTitle: title });
      return 'shared';
    }
    const fileObjs = (files || []).map(f => f.dataUrl ? dataUrlToFile(f.dataUrl, f.name) : new File(['﻿' + f.text], f.name, { type: f.type || 'text/plain' }));
    if (navigator.share) {
      try {
        if (fileObjs.length && navigator.canShare && navigator.canShare({ files: fileObjs })) { await navigator.share({ title, text, files: fileObjs }); return 'shared'; }
        if (!fileObjs.length || fileObjs.every(f => f.type.startsWith('image/'))) { await navigator.share({ title, text }); return 'shared'; }
      } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    // 폴백: 텍스트 파일은 다운로드, 본문은 클립보드
    fileObjs.filter(f => !f.type.startsWith('image/')).forEach(f => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); });
    if (text && navigator.clipboard) { try { await navigator.clipboard.writeText(text); return 'copied'; } catch (e) { } }
    return fileObjs.length ? 'downloaded' : 'none';
  }
  function dataUrlToFile(d, name) {
    const b = atob(d.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return new File([u], name, { type: d.slice(5, d.indexOf(';')) });
  }

  function openUrl(url) {
    // tel:, https: — 앱에서는 시스템이 전화앱·브라우저로 연결
    if (url.startsWith('tel:') || isNative) { window.location.href = url; return; }
    window.open(url, '_blank', 'noopener');
  }

  async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    if (window.crypto && crypto.subtle) {
      const h = await crypto.subtle.digest('SHA-256', buf);
      return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('crypto.subtle 미지원 (HTTPS 필요)');
  }

  function initChrome() {
    if (!isNative) return;
    try { P.StatusBar && P.StatusBar.setStyle({ style: 'DARK' }); } catch (e) { }
    try { if (platform === 'android' && P.StatusBar) P.StatusBar.setBackgroundColor({ color: '#0E1B2A' }); } catch (e) { }
    setTimeout(() => { try { P.SplashScreen && P.SplashScreen.hide(); } catch (e) { } }, 300);
  }
  function onBack(cb) { if (P.App) P.App.addListener('backButton', cb); }
  function exitApp() { if (P.App) P.App.exitApp(); }

  EG.native = { isNative, platform, takePhoto, getPosition, watchPosition, stopWatch, permissions, requestPermissions, haptic, shareFiles, openUrl, sha256, initChrome, onBack, exitApp, compress };
})();
