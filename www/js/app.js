/* E지킴이 — 앱 로직 (화면 9종 + 온보딩·동의) */
(function () {
  const N = EG.native, ST = EG.store;
  let S = ST.load();
  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
  const save = () => ST.save();
  const fmt = n => Number(n || 0).toLocaleString('ko-KR');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const now = () => new Date();
  const md = d => pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const hm = d => pad(d.getHours()) + ':' + pad(d.getMinutes());
  const stamp = iso => { const d = new Date(iso); return d.getFullYear() + '-' + md(d) + ' ' + hm(d) + ':' + pad(d.getSeconds()); };
  const shortHash = h => h ? h.slice(0, 8) + '…' + h.slice(-4) : '—';
  const PIN = '<svg width="10" height="10" viewBox="0 0 10 10" style="flex:none"><path d="M5 1a3 3 0 0 1 3 3c0 2.2-3 5-3 5S2 6.2 2 4a3 3 0 0 1 3-3z" fill="currentColor"/><circle cx="5" cy="4" r="1" fill="#fff"/></svg>';
  const CAM = '<svg width="20" height="20" viewBox="0 0 18 18" fill="none"><path d="M2.5 6h2.6l1.2-1.8h5.4L12.9 6h2.6v8h-13V6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="9" cy="10" r="2.4" stroke="currentColor" stroke-width="1.4"/></svg>';

  /* ───────── 공통 UI ───────── */
  let toastT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
  function sheet(html) { $('#sheet').innerHTML = '<div class="grab"></div>' + html; $('#modalbg').classList.add('show'); }
  function closeSheet() { $('#modalbg').classList.remove('show'); }
  $('#modalbg').addEventListener('click', e => { if (e.target.id === 'modalbg' || e.target.closest('.grab') || e.target.closest('[data-close]')) closeSheet(); });
  function confirmSheet(title, body, okLabel, onOk) {
    sheet('<h4>' + title + '</h4><p style="font-size:13px;line-height:1.7;color:var(--mut)">' + body + '</p><div class="btnrow"><button class="btn btn-ghost" data-close>취소</button><button class="btn btn-navy" id="cfOk">' + okLabel + '</button></div>');
    $('#cfOk').onclick = () => { closeSheet(); onOk(); };
  }
  function addNoti(t) { S.notis.unshift([md(now()), t]); renderNotiDot(); }
  function addAct(t) { S.acts.unshift([md(now()), t]); S.acts = S.acts.slice(0, 20); }
  function renderNotiDot() { $('#notiDot').classList.toggle('off', S.notis.length <= S.notiSeen); }

  /* ───────── 화면 이동 ───────── */
  let CUR = 'home', listFrom = 'cases', camFrom = 'map';
  const BACK = { detail: () => listFrom, report: () => 'detail', camera: () => camFrom, console: () => 'home', consent: () => 'onboard' };
  function go(id) {
    if (id === 'console' && !S.admin) { askAdmin(); return; }
    $$('.screen').forEach(s => s.classList.remove('active'));
    const el = $('#scr-' + id); if (el) el.classList.add('active');
    $('#viewport').scrollTop = 0; CUR = id;
    document.body.classList.toggle('onboard', id === 'onboard');
    document.body.classList.toggle('no-chrome', id === 'consent' || id === 'onboard');
    const tabOf = { detail: 'cases', report: 'cases', camera: 'map', console: '' }[id];
    $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.go === (tabOf !== undefined ? tabOf : id)));
    if (id !== 'console' && S.mode === 'c') { S.mode = 'g'; setChip(); }
    if (id === 'home') renderHome();
    if (id === 'cases') renderCases();
    if (id === 'wallet') renderWallet();
    if (id === 'profile') renderProfile();
    if (id === 'console') renderConsole();
    if (id === 'map') enterMap();
    if (id === 'camera') renderCamTarget();
  }
  function goBack() {
    if ($('#qrScan').classList.contains('show')) { stopQR(); return true; }
    if ($('#modalbg').classList.contains('show')) { closeSheet(); return true; }
    if (BACK[CUR]) { go(BACK[CUR]()); return true; }
    if (CUR !== 'home' && CUR !== 'onboard') { go('home'); return true; }
    return false;
  }
  N.onBack(() => { if (!goBack()) N.exitApp(); });
  $$('.tab').forEach(t => t.onclick = () => go(t.dataset.go));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]:not(.tab)'); if (g) { if (g.dataset.go === 'camera') camFrom = CUR; go(g.dataset.go); return; }
    const b = e.target.closest('[data-back]'); if (b) { goBack(); return; }
    const cc = e.target.closest('.casecard'); if (cc) caseClick(cc.dataset.id);
  });

  /* ───────── 위치 ───────── */
  let LOC = null, SIM = null, PATROL = null;
  const R = 6371000, rad = d => d * Math.PI / 180;
  function haversine(a, b) { const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng); const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  const mtxt = m => m == null ? '—' : m < 1000 ? Math.round(m) + 'm' : (m / 1000).toFixed(1) + 'km';
  function setLoc(p, src) {
    LOC = Object.assign({ src, t: Date.now() }, p);
    renderLocHead();
    if (PATROL && (src === 'sim' || (p.acc || 99) <= 50)) {
      const last = PATROL.pts[PATROL.pts.length - 1];
      if (!last) PATROL.pts.push([p.lat, p.lng]);
      else { const d = haversine({ lat: last[0], lng: last[1] }, p); if (d > 5 && d < 500) { PATROL.dist += d; PATROL.pts.push([p.lat, p.lng]); } }
    }
    if (CUR === 'map') updateMapLoc();
    checkGeofence();
  }
  function renderLocHead() {
    const dot = $('#liveDot');
    dot.className = 'live' + (LOC ? (LOC.src === 'sim' ? ' sim' : ' on') : '');
    if (!LOC) { $('#locLabel').textContent = '위치 확인 전'; $('#gpshead').textContent = ''; return; }
    $('#locLabel').textContent = (PATROL ? '순찰 중 · ' : '') + (LOC.src === 'sim' ? '시뮬레이션 위치' : 'GPS 수신 ±' + Math.round(LOC.acc || 0) + 'm');
    $('#gpshead').textContent = LOC.lat.toFixed(4) + ', ' + LOC.lng.toFixed(4);
  }
  async function locate(silent) {
    if (SIM) return LOC;
    try { const p = await N.getPosition(); setLoc(p, 'gps'); return LOC; }
    catch (e) { if (!silent) toast('위치를 가져오지 못했습니다 — 위치 권한을 허용하거나 시뮬레이션으로 시험하세요'); return null; }
  }
  async function freshLoc() { if (LOC && (LOC.src === 'sim' || Date.now() - LOC.t < 60000)) return LOC; return await locate(true); }

  /* ───────── 케이스 공통 ───────── */
  const facOf = c => c.fac ? EG.FACILITIES[c.fac] : null;
  const addrOf = c => c.addr || (facOf(c) ? facOf(c).addr : '');
  const kindOf = c => c.kind || (facOf(c) ? facOf(c).kind : null);
  const CLof = c => EG.CHECK[kindOf(c)] || null;
  const distOf = c => (LOC && facOf(c)) ? haversine(LOC, facOf(c)) : null;
  const cur = () => S.cases.find(c => c.id === S.cur);
  function stateChip(st) { const m = { open: ['', '수임 가능'], active: ['active', '수임중'], submitted: ['submitted', '신고 대기'], verifying: ['verifying', '검증중'], done: ['done', '종결'], rejected: ['rejected', '보완 요청'] }; const c = m[st] || m.open; return '<span class="state ' + c[0] + '">' + c[1] + '</span>'; }
  function cardHTML(c) {
    const d = distOf(c);
    return '<div class="casecard ' + (c.st === 'active' || c.st === 'rejected' ? 'activec' : '') + '" data-id="' + c.id + '">' +
      '<div class="top"><span class="tagtype ' + c.type + '">' + EG.TYPE[c.type] + (c.senior ? ' · 시니어' : '') + '</span>' + stateChip(c.st) + '</div>' +
      '<div class="caseid">' + c.id + '</div><h4>' + esc(c.title) + '</h4>' +
      '<div class="meta"><span class="dist">' + PIN + '<span>' + (d != null ? mtxt(d) + ' · ' : '') + esc(addrOf(c)) + '</span></span><span class="tagtype money">' + c.reward + '</span></div></div>';
  }
  const grade = () => (S.user ? S.user.grade : 1);
  function caseClick(id) {
    const c = S.cases.find(x => x.id === id); if (!c) return;
    listFrom = (CUR === 'home' || CUR === 'cases') ? CUR : 'cases';
    if (c.st === 'open') {
      if (c.senior && grade() < 2) { toast('현상금 케이스(' + c.id + ')는 시니어 등급부터 수임할 수 있습니다'); return; }
      confirmSheet('케이스 수임', '<b style="color:var(--ink)">' + esc(c.title) + '</b><br>' + esc(addrOf(c)) + '<br>보수: ' + c.reward + '<br><br>수임하면 케이스 파일이 열리고 점검 체크리스트를 수행할 수 있습니다.', '수임하기', () => accept(c));
      return;
    }
    if (c.st === 'submitted') { S.cur = c.id; renderReport(c); go('report'); return; }
    openDetail(c.id);
  }
  function accept(c) {
    let target = c;
    if (c.repeat) { // 자율 제보: 템플릿은 그대로 두고 새 케이스 생성
      target = Object.assign(JSON.parse(JSON.stringify(c)), { id: 'CASE-2026-0' + (S.seq++), repeat: false, title: '순찰 중 발견 자율 제보', st: 'active', judge: {}, shots: {}, ev: {}, note: '', ai: {} });
      S.cases.unshift(target);
    } else target.st = 'active';
    target.acceptedAt = now().toISOString();
    addAct(target.id + ' 수임');
    save(); N.haptic(); toast(target.id + ' 수임 완료 — 케이스 파일이 열렸습니다');
    openDetail(target.id);
  }
  function openDetail(id) { S.cur = id; save(); renderDetail(); go('detail'); }

  /* ───────── 홈 ───────── */
  function renderHome() {
    const u = S.user || {};
    $('#homeHello').textContent = '안녕하세요, ' + (u.name || '지킴이') + '님';
    $('#homeSub').textContent = u.demo ? '데모 모드 · 수료증 인증 전 둘러보기' : '지킴이 ' + u.cohort + '기 · 수료증 인증 완료 · 신뢰점수 ' + u.trust;
    $('#homeGrade').textContent = EG.GRADES[grade()];
    $('#homePts').textContent = fmt(S.pts);
    $('#homePerf').textContent = fmt(S.won) + '원';
    const act = S.cases.filter(c => ['active', 'rejected', 'submitted'].includes(c.st));
    $('#homeActiveSect').style.display = act.length ? '' : 'none';
    $('#homeActive').innerHTML = act.map(cardHTML).join('');
    $('#homeCases').innerHTML = S.cases.filter(c => c.st === 'open').sort((a, b) => (distOf(a) ?? 1e9) - (distOf(b) ?? 1e9)).slice(0, 3).map(cardHTML).join('');
    $('#homeActs').innerHTML = S.acts.slice(0, 5).map(a => '<div class="flowli"><span class="n d">' + a[0] + '</span><span>' + esc(a[1]) + '</span></div>').join('');
  }
  $('#btnQuickFree').onclick = () => { const t = S.cases.find(c => c.repeat); if (t) { listFrom = 'home'; accept(t); } };

  /* ───────── 케이스 보드 ───────── */
  let F = 'all';
  function renderCases() {
    const list = S.cases.filter(c => F === 'all' ? true : F === 'mine' ? c.st !== 'open' : c.type === F);
    $('#caseList').innerHTML = list.length ? list.map(cardHTML).join('') : '<div class="notice info"><span><b>해당 케이스가 없습니다</b>필터를 바꾸거나 자율 제보 케이스를 수임해 보세요.</span></div>';
  }
  $('#caseFilter').addEventListener('click', e => { const b = e.target.closest('.fchip'); if (!b) return; $$('.fchip').forEach(x => x.classList.remove('on')); b.classList.add('on'); F = b.dataset.f; renderCases(); });

  /* ───────── 점검 실행 ───────── */
  const THUMB = {};
  async function thumb(id) { if (THUMB[id]) return THUMB[id]; const p = await ST.getPhoto(id); if (p) THUMB[id] = p.data; return THUMB[id]; }
  function shotHTML(c, key, label) {
    const id = c.shots[key];
    if (!id) return '<button class="shot" data-shot="' + key + '" aria-label="증거 사진 촬영">' + CAM + '</button>' + (label ? '<span class="mut small">' + label + '</span>' : '');
    const ev = (c.ev || {})[key] || {};
    return '<button class="shot filled" data-shot="' + key + '" data-pid="' + id + '"><img data-thumb="' + id + '" alt="증거 사진"><span class="x" data-x="1">✕</span></button>' +
      '<div class="shotmeta">' + stamp(ev.time) + '<br>' + (ev.lat != null ? ev.lat.toFixed(5) + ', ' + ev.lng.toFixed(5) + (ev.src === 'sim' ? ' (시뮬)' : '') : 'GPS 없음') + '<br>#' + shortHash(ev.hash) + '</div>';
  }
  function fillThumbs(root) { root.querySelectorAll('img[data-thumb]').forEach(async im => { const d = await thumb(im.dataset.thumb); if (d) im.src = d; }); }
  function renderDetail() {
    const c = cur(); if (!c) return; const CL = CLof(c); c.ev = c.ev || {}; c.ai = c.ai || {};
    const stepIdx = { active: 2, rejected: 2, submitted: 3, verifying: 4, done: 5 }[c.st] || 2;
    let steps = ''; for (let i = 1; i <= 5; i++) steps += '<i class="' + (i < stepIdx ? 'done' : i === stepIdx ? 'now' : '') + '"></i>';
    const lbl = ['수임', '점검', '보고', '검증', '정산'].map((t, i) => '<span' + (i < stepIdx ? ' class="on"' : '') + '>' + t + '</span>').join('');
    const d = distOf(c);
    $('#detailHead').innerHTML = '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span class="tagtype ' + c.type + '">' + EG.TYPE[c.type] + '</span>' + stateChip(c.st) + '</div>' +
      '<div class="caseid" style="margin-bottom:4px">' + c.id + ' · ' + c.reward + '</div>' +
      '<h4 style="font-size:15px;font-weight:800;letter-spacing:-.01em;line-height:1.4;margin-bottom:5px">' + esc(c.title) + '</h4>' +
      '<div class="dist">' + PIN + '<span>' + esc(addrOf(c)) + (d != null ? ' · 현재 ' + mtxt(d) : '') + '</span></div>' +
      '<div class="steps" style="margin:12px 0 6px">' + steps + '</div><div class="gradelbl" style="font-size:10px">' + lbl + '</div></div>' +
      (c.st === 'rejected' ? '<div class="notice warn" style="margin-top:10px"><span><b>보완 요청</b>' + esc(c.rejectMsg || '협회 검증에서 보완을 요청했습니다. 증거와 판정을 다시 확인해 제출해 주세요.') + '</span></div>' : '') +
      (['verifying', 'done'].includes(c.st) ? '<div class="notice ' + (c.st === 'done' ? 'ok' : 'info') + '" style="margin-top:10px"><span><b>' + (c.st === 'done' ? '종결된 케이스' : '협회 검증 중') + '</b>' + (c.st === 'done' ? '검증·정산이 끝난 기록입니다. 증거 자료는 해시와 함께 보관됩니다.' : '제출한 보고서를 검증 리더와 협회가 확인하고 있습니다 (SLA 48시간).') + '</span></div>' : '');
    const locked = ['submitted', 'verifying', 'done'].includes(c.st);
    if (!CL) {
      $('#chkList').innerHTML = '<div class="notice info" style="margin-bottom:10px"><span><b>자율 제보</b>관찰 내용과 사진, 위치를 기록해 제출하세요. 사진 1장 이상과 메모가 필요합니다.</span></div>' +
        '<div class="chk"><div class="q"><span class="num">01</span>발견한 위험요인 사진</div><div class="shots">' + shotHTML(c, 'free', '탭하여 촬영') + '</div></div>' +
        '<div class="chk"><div class="q"><span class="num">02</span>추가 사진 (선택)</div><div class="shots">' + shotHTML(c, 'free2', '') + '</div></div>';
      $('#chkProg').textContent = Object.keys(c.shots).length + '장 첨부';
    } else {
      const done = CL.items.filter((q, i) => c.judge[i] && !c.ai[i]).length;
      $('#chkProg').textContent = done + '/' + CL.items.length + ' 판정 완료';
      $('#chkList').innerHTML = CL.items.map((q, i) => {
        const j = c.judge[i] || '', ai = c.ai[i];
        return '<div class="chk"><div class="q"><span class="num">' + pad(i + 1) + '</span>' + q + '</div>' +
          (ai ? '<div class="aihint">AI 제안 ' + ai.conf + '% — ' + (ai.v ? '버튼을 눌러 최종 판정을 확정하세요' : '신뢰도가 낮아 직접 판정이 필요합니다') + '</div>' : '') +
          '<div class="seg" data-i="' + i + '"><button class="ok ' + (j === 'ok' ? 'on' : '') + '" data-v="ok">정상</button><button class="fix ' + (j === 'fix' ? 'on' : '') + '" data-v="fix">조치필요</button><button class="urg ' + (j === 'urg' ? 'on' : '') + '" data-v="urg">긴급</button></div>' +
          '<div class="shots">' + shotHTML(c, String(i), (j === 'fix' || j === 'urg') ? '증거 사진을 남겨 주세요' : '') + '</div></div>';
      }).join('');
    }
    $('#chkList').style.pointerEvents = locked ? 'none' : '';
    $('#chkList').style.opacity = locked ? '.75' : '';
    $('#chkNote').value = c.note || ''; $('#chkNote').disabled = locked;
    $('#btnSubmitInsp').style.display = locked ? 'none' : '';
    const n = Object.keys(c.shots).length;
    $('#evLine').innerHTML = '<span>GPS 자동기록</span><span>시각 자동기록</span><span>사진 SHA-256 해시</span><span class="sim">증거 사진 ' + n + '장 · 위·변조 방지를 위해 사진·GPS·시각을 해시로 잠급니다</span>';
    fillThumbs($('#chkList'));
  }
  $('#chkList').addEventListener('click', async e => {
    const c = cur(); if (!c) return;
    const sb = e.target.closest('.shot');
    if (sb) {
      const k = sb.dataset.shot;
      if (e.target.closest('[data-x]')) { confirmSheet('증거 사진 삭제', '이 사진과 증거 기록(GPS·시각·해시)을 삭제할까요?', '삭제', async () => { await ST.delPhoto(c.shots[k]); delete c.shots[k]; delete c.ev[k]; save(); renderDetail(); }); return; }
      if (sb.dataset.pid) { viewPhoto(c, k); return; }
      await capture(c, k); return;
    }
    const b = e.target.closest('.seg button');
    if (b) { const i = b.closest('.seg').dataset.i; c.judge[i] = b.dataset.v; delete c.ai[i]; N.haptic(); save(); renderDetail(); }
  });
  $('#chkNote').addEventListener('input', e => { const c = cur(); if (c) { c.note = e.target.value; save(); } });

  async function capture(c, key) {
    let data;
    try { data = await N.takePhoto(); } catch (e) { if (e && String(e.message || e).match(/cancel/i)) return; toast('카메라를 열 수 없습니다 — 카메라 권한을 확인해 주세요'); return; }
    toast('증거 기록 중 — GPS·시각·해시 생성');
    const ev = await makeEvidence(data);
    const id = 'PH-' + Date.now();
    await ST.putPhoto({ id, caseId: c.id, key, data, ...ev });
    THUMB[id] = data;
    if (c.shots[key]) ST.delPhoto(c.shots[key]);
    c.shots[key] = id; c.ev = c.ev || {}; c.ev[key] = ev;
    save(); N.haptic('success'); renderDetail();
    toast('증거 사진 첨부 · ' + (ev.lat != null ? 'GPS' : 'GPS 없음') + ' · 시각 · 해시 #' + ev.hash.slice(0, 8));
    return id;
  }
  async function makeEvidence(data) {
    const p = await freshLoc();
    const time = now().toISOString();
    const lat = p ? +p.lat.toFixed(6) : null, lng = p ? +p.lng.toFixed(6) : null;
    let hash = '';
    try { hash = await N.sha256(data + '|' + lat + '|' + lng + '|' + time); } catch (e) { hash = 'unavailable'; }
    return { time, lat, lng, acc: p ? Math.round(p.acc || 0) : null, src: p ? p.src : null, hash };
  }
  async function viewPhoto(c, k) {
    const ev = c.ev[k] || {}; const d = await thumb(c.shots[k]);
    sheet('<h4>증거 사진</h4><div class="photoview"><img src="' + d + '" alt=""><dl><dt>촬영 시각</dt><dd>' + stamp(ev.time) + '</dd><dt>GPS</dt><dd>' + (ev.lat != null ? ev.lat + ', ' + ev.lng + ' (±' + ev.acc + 'm' + (ev.src === 'sim' ? ', 시뮬레이션' : '') + ')' : '기록 없음') + '</dd><dt>SHA-256</dt><dd>' + ev.hash + '</dd><dt>케이스</dt><dd>' + c.id + '</dd></dl></div><div class="btnrow"><button class="btn btn-ghost" data-close>닫기</button></div>');
  }

  $('#btnSubmitInsp').onclick = () => {
    const c = cur(); if (!c) return; const CL = CLof(c);
    if (CL) {
      const total = CL.items.length, done = CL.items.filter((q, i) => c.judge[i] && !c.ai[i]).length;
      if (done < total) { toast('미판정·미확정 항목 ' + (total - done) + '건이 있습니다'); N.haptic('heavy'); return; }
      const needPhoto = CL.items.map((q, i) => i).filter(i => (c.judge[i] === 'fix' || c.judge[i] === 'urg') && !c.shots[i]);
      if (needPhoto.length) { toast('조치필요·긴급 항목(' + needPhoto.map(i => i + 1).join(', ') + '번)에 증거 사진이 필요합니다'); N.haptic('heavy'); return; }
    } else {
      if (!Object.keys(c.shots).length) { toast('자율 제보는 사진 1장 이상이 필요합니다'); return; }
      if (!(c.note || '').trim()) { toast('발견 내용을 메모에 적어 주세요'); return; }
    }
    c.st = 'submitted'; c.submittedAt = now().toISOString(); c.agency = c.agency || defaultAgency(c);
    addAct(c.id + ' 점검 보고서 작성 완료 — ' + sumOf(c));
    if (!S.badges.first) { S.badges.first = 1; }
    save(); renderReport(c); go('report'); N.haptic('success');
    toast('보고서 작성 완료 — 신고 채널을 확인하고 검증을 요청하세요');
  };
  function sumOf(c) {
    const o = Object.values(c.judge || {}); const u = o.filter(v => v === 'urg').length, f = o.filter(v => v === 'fix').length;
    if (!CLof(c)) return '자율 관찰 제보 · 사진 ' + Object.keys(c.shots).length + '장';
    if (u) return '긴급 ' + u + '건' + (f ? ' · 조치필요 ' + f + '건' : ''); if (f) return '조치필요 ' + f + '건'; return '긴급·조치필요 없음';
  }
  function defaultAgency(c) { const k = kindOf(c); return k === 'sub' ? 'kepco' : k === 'home' ? 'kgs' : k === 'fuel' ? 'env' : 'safe'; }

  /* ───────── 신고 연계 ───────── */
  const agOf = k => EG.AGENCIES.find(a => a.k === k) || EG.AGENCIES[0];
  function evList(c) { return Object.keys(c.shots).map(k => ({ k, id: c.shots[k], ev: (c.ev || {})[k] || {} })); }
  function firstGps(c) { const e = evList(c).find(x => x.ev.lat != null); return e ? e.ev : (LOC ? { lat: +LOC.lat.toFixed(6), lng: +LOC.lng.toFixed(6) } : null); }
  function reportText(c) {
    const CL = CLof(c), ag = agOf(c.agency), g = firstGps(c), u = S.user || {};
    const items = CL ? CL.items.map((q, i) => c.judge[i] && c.judge[i] !== 'ok' ? '  - ' + q + ': ' + (c.judge[i] === 'urg' ? '긴급' : '조치필요') : null).filter(Boolean) : [];
    return ['[에너지시설 점검·신고서] ' + c.id, '신고기관: ' + ag.name, '시설: ' + (facOf(c) ? facOf(c).name + ' · ' : '') + addrOf(c),
      '점검 일시: ' + stamp(c.submittedAt || now().toISOString()) + ' (자동기록)', '점검 유형: ' + EG.TYPE[c.type] + ' · ' + (CL ? CL.label : '자율 관찰'),
      '판정 요약: ' + sumOf(c), ...(items.length ? ['세부:', ...items] : []), '특이사항: ' + (c.note || '—'),
      'GPS: ' + (g ? g.lat + ', ' + g.lng : '—'), '증거 사진: ' + evList(c).length + '건',
      ...evList(c).map((x, n) => '  #' + (n + 1) + ' ' + stamp(x.ev.time) + ' SHA-256 ' + x.ev.hash),
      '제보자: 에너지안보환경지킴이 ' + (u.cohort ? u.cohort + '기 ' : '') + '(신원비공개 요청)', '— 사단법인 에너지안보환경협회 E지킴이 앱에서 생성'].join('\n');
  }
  function renderReport(c) {
    const ag = agOf(c.agency);
    $('#agcyRow').innerHTML = EG.AGENCIES.map(a => '<button class="' + (a.k === ag.k ? 'on' : '') + '" data-ag="' + a.k + '">' + a.label + '</button>').join('');
    const g = firstGps(c), u = S.user || {};
    $('#rptBox').innerHTML = '<h5>에너지시설 점검·신고서 <span class="caseid">' + c.id + '</span></h5><dl>' +
      '<dt>신고기관</dt><dd>' + ag.name + '<br><span class="mut" style="font-size:11px">' + ag.desc + '</span></dd>' +
      '<dt>시설 위치</dt><dd>' + esc((facOf(c) ? facOf(c).name + ' · ' : '') + addrOf(c)) + '</dd>' +
      '<dt>점검 일시</dt><dd>' + stamp(c.submittedAt || now().toISOString()) + ' (자동기록)</dd>' +
      '<dt>점검 유형</dt><dd>' + EG.TYPE[c.type] + ' · ' + (CLof(c) ? CLof(c).label : '자율 관찰') + '</dd>' +
      '<dt>판정 요약</dt><dd>' + sumOf(c) + '</dd>' +
      '<dt>증거 자료</dt><dd>사진 ' + evList(c).length + '건 · GPS ' + (g ? g.lat + ', ' + g.lng : '—') + ' · 타임스탬프 해시</dd>' +
      '<dt>제보자</dt><dd>지킴이 ' + esc(u.name || '') + ' (신원비공개 요청)</dd></dl>' +
      '<p style="margin-top:8px;color:var(--mut)">특이사항: ' + esc(c.note || '—') + '</p>' +
      '<div class="hashes">' + evList(c).map((x, n) => '#' + (n + 1) + ' ' + x.ev.hash).join('<br>') + '</div>';
    $('#agAct').innerHTML = (ag.tel ? '<button class="btn btn-ghost" data-tel="' + ag.tel + '">전화 연결 ' + ag.tel + '</button>' : '') +
      (ag.web ? '<button class="btn btn-ghost" data-web="' + ag.web + '">누리집 열기</button>' : '') +
      '<button class="btn btn-navy wide" id="btnShareRpt">신고서·증거사진 공유 (문자·메일·메신저)</button>';
    const locked = c.st !== 'submitted';
    $('#btnSendReport').style.display = locked ? 'none' : '';
  }
  $('#agcyRow').addEventListener('click', e => { const b = e.target.closest('button'); const c = cur(); if (!b || !c) return; c.agency = b.dataset.ag; save(); renderReport(c); });
  $('#agAct').addEventListener('click', async e => {
    const c = cur(); if (!c) return;
    const t = e.target.closest('[data-tel]'), w = e.target.closest('[data-web]');
    if (t) { N.openUrl('tel:' + t.dataset.tel); return; }
    if (w) { N.openUrl(w.dataset.web); return; }
    if (e.target.closest('#btnShareRpt')) {
      const files = [];
      for (const [n, x] of evList(c).entries()) { const d = await thumb(x.id); if (d) files.push({ name: c.id + '_증거' + (n + 1) + '.jpg', dataUrl: d }); }
      const r = await N.shareFiles({ title: c.id + ' 점검·신고서', text: reportText(c), files });
      if (r === 'copied') toast('신고서 내용을 복사했습니다 — 신고 채널에 붙여넣으세요');
      else if (r === 'shared') toast('공유를 마쳤습니다');
    }
  });
  $('#btnSendReport').onclick = () => {
    const c = cur(); if (!c) return;
    c.st = 'verifying'; c.sentAt = now().toISOString();
    S.queue = S.queue.filter(q => q.id !== c.id);
    S.queue.unshift({ id: c.id, by: (S.user || {}).name || '지킴이', fac: facOf(c) ? facOf(c).name : '자율 제보', sum: sumOf(c), t: hm(now()), own: true });
    S.kpi.cases++;
    addAct(c.id + ' 신고 접수(' + agOf(c.agency).name + ') · 협회 검증 요청');
    addNoti(c.id + ' 검증 요청이 접수되었습니다. 결과는 48시간 이내에 알려 드립니다.');
    save(); N.haptic('success'); go('home');
    toast('검증 요청 완료 — 기관 처분 확정 시 성과보수가 산정됩니다');
  };

  /* ───────── 순찰 지도 ───────── */
  let MAP = null, ME = null, PATH = null, MK = {};
  const NOTIFIED = {};
  function facCase(fk) { return S.cases.find(c => c.fac === fk && c.st !== 'done') || S.cases.find(c => c.fac === fk); }
  function facColor(fk) { const c = facCase(fk); if (!c) return 'var(--blue)'; if (c.st === 'done') return 'var(--volt)'; if (c.st !== 'open') return 'var(--vest-d)'; if (c.warn) return 'var(--amber)'; return 'var(--blue)'; }
  function initMap() {
    if (MAP || !window.L) return;
    const a = EG.FACILITIES.A;
    MAP = L.map('map', { zoomControl: false, attributionControl: true }).setView([a.lat, a.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(MAP);
    Object.entries(EG.FACILITIES).forEach(([k, f]) => {
      MK[k] = L.marker([f.lat, f.lng], { icon: facIcon(k) }).addTo(MAP).on('click', () => facSheet(k));
    });
  }
  function facIcon(k) {
    const f = EG.FACILITIES[k], c = facCase(k);
    const lbl = f.name + (c && c.st === 'done' ? ' ✓' : c && c.warn && c.st === 'open' ? ' · 주의' : '');
    return L.divIcon({ className: '', html: '<div class="fpin"><div class="bub">' + lbl + '</div><div class="dt" style="background:' + facColor(k) + '"></div></div>', iconSize: [0, 0] });
  }
  function refreshPins() { if (!MAP) return; Object.keys(MK).forEach(k => MK[k].setIcon(facIcon(k))); }
  function enterMap() {
    initMap();
    setTimeout(() => { if (MAP) { MAP.invalidateSize(); refreshPins(); updateMapLoc(); } }, 60);
    renderNear(); renderPatrolBar();
    if (!LOC) locate(true).then(() => { if (LOC && MAP) MAP.setView([LOC.lat, LOC.lng], 15); });
  }
  function updateMapLoc() {
    renderNear();
    if (!MAP || !LOC) return;
    const ll = [LOC.lat, LOC.lng];
    if (!ME) ME = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="mepin"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 }).addTo(MAP);
    else ME.setLatLng(ll);
    if (PATROL && PATROL.pts.length > 1) { if (!PATH) PATH = L.polyline(PATROL.pts, { color: '#FFC20E', weight: 5, dashArray: '2 9', lineCap: 'round' }).addTo(MAP); else PATH.setLatLngs(PATROL.pts); }
    if (SIM || PATROL) MAP.panTo(ll, { animate: true });
  }
  function nearList() {
    return Object.entries(EG.FACILITIES).map(([k, f]) => ({ k, f, c: facCase(k), d: LOC ? haversine(LOC, f) : null }))
      .sort((a, b) => (a.d ?? 1e12) - (b.d ?? 1e12));
  }
  function renderNear() {
    const list = nearList();
    $('#nearList').innerHTML = list.map(x => '<div class="nearrow" data-fac="' + x.k + '"><span class="nd" style="background:' + facColor(x.k) + '"></span><div><b>' + x.f.name + '</b><span>' + (x.c ? EG.TYPE[x.c.type] + ' · ' + (x.c.st === 'done' ? '완료' : EG.CHECK[x.f.kind].label + ' ' + EG.CHECK[x.f.kind].items.length + '항목') : '') + '</span></div><span class="m">' + mtxt(x.d) + '</span></div>').join('');
    const nx = list.find(x => x.c && x.c.st !== 'done');
    const card = $('#nextCard');
    if (!nx || nx.d == null) { card.classList.remove('show'); return; }
    card.classList.add('show'); card.classList.toggle('near', nx.d <= 50);
    card.innerHTML = '<svg width="26" height="26" viewBox="0 0 20 20" fill="none" style="flex:none"><circle cx="10" cy="10" r="8" stroke="#FFC20E" stroke-width="1.6"/><path d="M10 5.5V10l3 2" stroke="#FFC20E" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '<div class="nc"><b>' + nx.f.name + ' ' + EG.TYPE[nx.c.type] + (nx.d <= 50 ? ' — 도착 (50m 이내)' : '까지 ' + mtxt(nx.d)) + '</b><span>' + nx.c.id + ' · 점검포인트 ' + EG.CHECK[nx.f.kind].items.length + '개 · 도보 ' + Math.max(1, Math.round(nx.d / 75)) + '분</span></div>' +
      '<button class="btn btn-vest btn-sm" data-fac-open="' + nx.k + '">' + (nx.d <= 50 ? '점검 시작' : '카메라') + '</button>';
  }
  $('#nearList').addEventListener('click', e => { const r = e.target.closest('[data-fac]'); if (r) { const f = EG.FACILITIES[r.dataset.fac]; if (MAP) MAP.setView([f.lat, f.lng], 16); facSheet(r.dataset.fac); } });
  $('#nextCard').addEventListener('click', e => { const b = e.target.closest('[data-fac-open]'); if (!b) return; const c = facCase(b.dataset.facOpen); if (!c) return; if (b.textContent === '카메라') { camCase = c.id; camFrom = 'map'; go('camera'); } else startFacCase(c); });
  function startFacCase(c) { listFrom = 'cases'; if (c.st === 'open') caseClick(c.id); else if (c.st === 'submitted') { S.cur = c.id; renderReport(c); go('report'); } else openDetail(c.id); }
  function facSheet(k) {
    const f = EG.FACILITIES[k], c = facCase(k), d = LOC ? haversine(LOC, f) : null;
    sheet('<h4>' + f.name + '</h4><p class="mut" style="font-size:12.5px;line-height:1.7">' + f.addr + (d != null ? ' · 현재 ' + mtxt(d) : '') + '<br>' + EG.CHECK[f.kind].label + ' 체크리스트 ' + EG.CHECK[f.kind].items.length + '항목</p>' +
      (c ? '<div style="margin-top:10px">' + cardHTML(c) + '</div>' : '') +
      '<div class="btnrow"><button class="btn btn-ghost" id="fsCam">카메라 점검</button><button class="btn btn-navy" id="fsGo">' + (c && c.st === 'open' ? '수임하기' : '점검 열기') + '</button></div>');
    $('#fsCam').onclick = () => { closeSheet(); if (c) camCase = c.id; camFrom = 'map'; go('camera'); };
    $('#fsGo').onclick = () => { closeSheet(); if (c) startFacCase(c); };
  }
  function checkGeofence() {
    if (!LOC) return;
    for (const [k, f] of Object.entries(EG.FACILITIES)) {
      const c = facCase(k); if (!c || c.st === 'done') continue;
      const d = haversine(LOC, f);
      if (d <= 50 && !NOTIFIED[k]) {
        NOTIFIED[k] = 1; N.haptic('heavy');
        toast(f.name + ' 50m 이내 — 점검포인트 체크리스트를 열 수 있습니다');
        if (CUR === 'map') facSheet(k);
        addNoti(f.name + ' 근접 알림 — ' + c.id + ' 점검 대상입니다.');
      } else if (d > 120) delete NOTIFIED[k];
    }
  }
  function renderPatrolBar() {
    const b = $('#patrolBar');
    $('#btnStartCourse').textContent = PATROL ? '순찰 종료 · 기록 저장' : '순찰 코스 시작 (GPS 추적 켜기)';
    $('#btnStartCourse').className = 'btn full ' + (PATROL ? 'btn-vest' : 'btn-navy');
    $('#btnSim').textContent = SIM ? '시뮬레이션 중지' : '현장 밖에서 시험하기 (위치 시뮬레이션)';
    if (!PATROL) { b.classList.remove('show'); return; }
    const min = Math.floor((Date.now() - PATROL.start) / 60000);
    b.classList.add('show');
    b.innerHTML = '<span>순찰 시간 <b>' + Math.floor(min / 60) + ':' + pad(min % 60) + '</b></span><span>이동 거리 <b>' + (PATROL.dist / 1000).toFixed(2) + 'km</b></span><span style="margin-left:auto">' + (SIM ? '시뮬레이션' : 'GPS') + '</span>';
  }
  setInterval(() => { if (PATROL && CUR === 'map') renderPatrolBar(); }, 15000);
  $('#btnStartCourse').onclick = async () => {
    if (!PATROL) {
      PATROL = { start: Date.now(), dist: 0, pts: LOC ? [[LOC.lat, LOC.lng]] : [] };
      if (!SIM) await N.watchPosition(p => setLoc(p, 'gps'), () => toast('GPS 신호를 받지 못했습니다 — 위치 권한을 확인하거나 시뮬레이션으로 시험하세요'));
      N.haptic(); toast('순찰 시작 — 점검 대상 50m 이내 접근 시 자동으로 알려 드립니다');
    } else {
      N.stopWatch();
      const min = Math.max(1, Math.round((Date.now() - PATROL.start) / 60000)), km = PATROL.dist / 1000;
      S.patrols.push({ start: new Date(PATROL.start).toISOString(), min, km: +km.toFixed(2), sim: !!SIM });
      S.wallet.unshift({ l: 'L2', date: md(now()), title: '순찰 ' + (min >= 60 ? (min / 60).toFixed(1) + 'h' : min + '분') + ' · ' + km.toFixed(1) + 'km' + (SIM ? ' (시뮬레이션)' : ''), sub: '활동 일당·실비 — 지정 순찰 검증 후 산정', amt: 0, unit: 'P', pending: true });
      addAct('순찰 기록 저장 · ' + min + '분 · ' + km.toFixed(2) + 'km');
      S.badges.patrol = 1; save();
      if (PATH) { MAP.removeLayer(PATH); PATH = null; }
      PATROL = null; toast('순찰 기록을 저장했습니다 — 일당·실비는 검증 후 지갑에 반영됩니다');
    }
    renderPatrolBar(); renderLocHead();
  };
  $('#btnSim').onclick = () => {
    if (SIM) { clearInterval(SIM.t); SIM = null; toast('시뮬레이션을 멈췄습니다'); renderPatrolBar(); locate(true); return; }
    N.stopWatch();
    SIM = { i: 0 }; Object.keys(NOTIFIED).forEach(k => delete NOTIFIED[k]);
    const step = () => { const p = EG.SIM_ROUTE[Math.min(SIM.i, EG.SIM_ROUTE.length - 1)]; setLoc({ lat: p[0], lng: p[1], acc: 5 }, 'sim'); SIM.i++; if (SIM.i >= EG.SIM_ROUTE.length) clearInterval(SIM.t); renderPatrolBar(); };
    step(); SIM.t = setInterval(step, 1500);
    if (MAP) MAP.setView([EG.SIM_ROUTE[0][0], EG.SIM_ROUTE[0][1]], 17);
    toast('시뮬레이션 — A주유소 방향으로 이동합니다');
  };
  $('#btnLocate').onclick = async () => { const p = SIM ? LOC : await locate(); if (p && MAP) MAP.setView([p.lat, p.lng], 16); };

  /* ───────── 카메라 자동점검 (AI 보조판정 — 시범) ───────── */
  let camCase = null, camShot = null;
  const AI_DEMO = {
    fuel: [{ i: 1, v: 'fix', conf: 92, label: '유류 누유 의심', box: [60, 64, 24, 16], sev: 1, why: '바닥 얼룩 검출' }, { i: 0, v: 'ok', conf: 87, label: '소화기 게이지', box: [9, 36, 20, 18], why: '바늘 위치 녹색 구간' }, { i: 2, v: null, conf: 54, label: '급유구 커버', why: '신뢰도 낮음 — 직접 판정' }],
    sub: [{ i: 0, v: 'fix', conf: 90, label: '담장 훼손 의심', box: [12, 52, 34, 20], sev: 1, why: '철망 하단 절단 형태' }, { i: 3, v: 'ok', conf: 85, label: '경고 표지판', box: [62, 28, 22, 16], why: '표지 판독 가능' }, { i: 7, v: null, conf: 51, label: '투기물 추정', why: '신뢰도 낮음 — 직접 판정' }],
    home: [{ i: 0, v: 'fix', conf: 88, label: '배기통 이격 의심', box: [54, 22, 26, 22], sev: 1, why: '연결부 틈 검출' }, { i: 2, v: 'ok', conf: 81, label: 'CO 경보기', box: [14, 30, 18, 14], why: '기기 형태 인식' }, { i: 1, v: null, conf: 49, label: '가스 호스', why: '신뢰도 낮음 — 직접 판정' }]
  };
  function camCandidates() { return S.cases.filter(c => CLof(c) && ['open', 'active', 'rejected'].includes(c.st)); }
  function renderCamTarget() {
    const list = camCandidates();
    if (!camCase || !list.find(c => c.id === camCase)) {
      const near = LOC ? list.slice().sort((a, b) => (distOf(a) ?? 1e12) - (distOf(b) ?? 1e12))[0] : null;
      camCase = (cur() && list.find(c => c.id === S.cur) ? S.cur : null) || (near && near.id) || (list[0] && list[0].id);
    }
    $('#camTarget').innerHTML = '<select id="camSel">' + list.map(c => '<option value="' + c.id + '"' + (c.id === camCase ? ' selected' : '') + '>' + (facOf(c) ? facOf(c).name : '') + ' · ' + EG.TYPE[c.type] + ' (' + c.id.slice(-4) + ')' + (distOf(c) != null ? ' · ' + mtxt(distOf(c)) : '') + '</option>').join('') + '</select>';
    $('#camSel').onchange = e => { camCase = e.target.value; resetCam(); };
    if (!camShot) resetCam();
  }
  function resetCam() {
    camShot = null; $('#camScreen').classList.remove('has', 'scan'); $('#detLayer').innerHTML = ''; $('#camHud').textContent = ''; $('#camGps').textContent = '';
    $('#aiWrap').style.display = 'none'; $('#btnShoot').textContent = '촬영하기';
  }
  $('#btnShoot').onclick = async () => {
    const c = S.cases.find(x => x.id === camCase); if (!c) { toast('점검할 케이스를 선택하세요'); return; }
    let data; try { data = await N.takePhoto(); } catch (e) { if (!String(e && (e.message || e)).match(/cancel/i)) toast('카메라를 열 수 없습니다 — 카메라 권한을 확인해 주세요'); return; }
    const ev = await makeEvidence(data);
    camShot = { data, ev };
    $('#camImg').src = data; $('#camScreen').classList.add('has', 'scan'); $('#detLayer').innerHTML = ''; $('#aiWrap').style.display = 'none';
    $('#camHud').textContent = (facOf(c) ? facOf(c).name : '시설') + ' 인식 — AI 점검 중…';
    $('#camGps').textContent = (ev.lat != null ? ev.lat.toFixed(4) + ', ' + ev.lng.toFixed(4) : 'GPS 없음') + ' · ' + stamp(ev.time) + ' · #' + ev.hash.slice(0, 8);
    setTimeout(() => {
      $('#camScreen').classList.remove('scan');
      const det = AI_DEMO[kindOf(c)] || [];
      $('#camHud').textContent = (facOf(c) ? facOf(c).name : '') + ' — AI 보조판정 완료 (시범)';
      $('#detLayer').innerHTML = det.filter(d => d.box).map(d => '<div class="detbox' + (d.sev ? ' sev' : '') + '" style="left:' + d.box[0] + '%;top:' + d.box[1] + '%;width:' + d.box[2] + '%;height:' + d.box[3] + '%"><span class="lbl">' + d.label + ' ' + d.conf + '%</span></div>').join('');
      const CL = CLof(c);
      $('#aiResult').innerHTML = det.map((d, n) => '<div class="aidone"><div><b>' + '①②③'[n] + ' ' + CL.items[d.i] + ' — ' + (d.v ? (d.v === 'ok' ? '정상' : '조치필요') + ' 제안' : '사람이 확인해야 함') + '</b><span style="display:block;color:var(--mut);font-size:10.8px;margin-top:2px">' + d.why + ' · 체크리스트 ' + (d.i + 1) + '번 항목</span></div><span class="conf ' + (d.conf >= 90 ? 'hi' : d.conf >= 80 ? 'mid' : 'lo') + '">' + d.conf + '%</span></div>').join('');
      $('#aiWrap').style.display = ''; $('#btnShoot').textContent = '다시 촬영';
      N.haptic('success');
    }, 1500);
  };
  $('#btnApplyAI').onclick = async () => {
    const c = S.cases.find(x => x.id === camCase); if (!c || !camShot) return;
    if (c.senior && grade() < 2) { toast('시니어 등급부터 수임할 수 있는 케이스입니다'); return; }
    if (c.st === 'open') { c.st = 'active'; c.acceptedAt = now().toISOString(); addAct(c.id + ' 수임 (카메라 점검)'); }
    const det = AI_DEMO[kindOf(c)] || []; c.ai = c.ai || {}; c.ev = c.ev || {};
    det.forEach(d => { if (!c.judge[d.i] || c.ai[d.i]) { if (d.v) c.judge[d.i] = d.v; else delete c.judge[d.i]; c.ai[d.i] = { v: d.v, conf: d.conf }; } });
    const key = String((det.find(d => d.sev) || det[0] || { i: 0 }).i);
    const id = 'PH-' + Date.now();
    await ST.putPhoto({ id, caseId: c.id, key, data: camShot.data, ...camShot.ev }); THUMB[id] = camShot.data;
    if (c.shots[key]) ST.delPhoto(c.shots[key]);
    c.shots[key] = id; c.ev[key] = camShot.ev;
    const dd = det.find(d => d.sev);
    if (dd) c.note = (c.note ? c.note + ' / ' : '') + 'AI 시범 검출: ' + dd.label + ' (' + dd.conf + '%) — 사람 확인 필요';
    S.badges.ai = 1; save(); resetCam();
    listFrom = 'cases'; openDetail(c.id);
    toast('AI 제안을 점검 기록에 반영했습니다 — 항목별 최종 판정을 확정하세요');
  };

  /* ───────── 지갑 ───────── */
  function renderWallet() {
    $('#walPts').textContent = fmt(S.pts); $('#walWon').textContent = fmt(S.won) + '원';
    $('#walList').innerHTML = S.wallet.map(w => '<div class="walletrow"><div class="ic ' + w.l + '">' + w.l + '</div>' +
      '<div class="tt"><b>' + esc(w.title) + '</b><span>' + w.date + ' · ' + esc(w.sub) + '</span></div>' +
      '<div class="amt"><b>' + (w.pending ? '산정 대기' : w.amt === 0 ? '—' : (w.amt > 0 ? '+' : '−') + fmt(Math.abs(w.amt))) + '</b><span>' + (w.pending || w.amt === 0 ? '' : w.unit) + '</span></div></div>').join('');
  }
  $('#btnCash').onclick = () => {
    if (S.won <= 0) { toast('현금 전환 예정 금액이 없습니다'); return; }
    if (S.pay.find(p => p.cash && p.st === 'wait')) { toast('이미 현금 전환 신청이 결재 대기 중입니다'); return; }
    confirmSheet('현금 전환 신청', fmt(S.won) + '원을 신청합니다.<br>운영자·사무국 2인 결재 후 등록 계좌로 지급되며, 지급 명세가 발송됩니다.', '신청하기', () => {
      S.pay.unshift({ id: 'PAY-' + Date.now().toString().slice(-5), who: (S.user || {}).name || '지킴이', l: 'L3', amt: S.won, desc: md(now()) + ' · 현금 전환 신청', st: 'wait', cash: true });
      addNoti('현금 전환 신청(' + fmt(S.won) + '원)이 접수되었습니다.'); save(); toast('현금 전환 신청 완료 — 결재 후 지급됩니다');
    });
  };

  /* ───────── 프로필 ───────── */
  function renderProfile() {
    const u = S.user || {}, g = grade();
    $('#profName').textContent = u.name || '지킴이';
    $('#profSub').textContent = (u.demo ? '데모 모드' : '지킴이 ' + u.cohort + '기 · ' + u.joined + ' 가입') + ' · 케이스 ' + (u.closed || 0) + '건 종결';
    $('#profGrade').textContent = EG.GRADES[g];
    $('#gradeSteps').innerHTML = EG.GRADES.map((x, i) => '<i class="' + (i < g ? 'done' : i === g ? 'now' : '') + '"></i>').join('');
    $('#gradeLbl').innerHTML = EG.GRADES.map((x, i) => '<span' + (i <= g ? ' class="on"' : '') + '>' + x + '</span>').join('');
    const need = EG.GRADE_NEED[g + 1];
    $('#gradeMsg').textContent = need ? EG.GRADES[g + 1] + '까지 ' + Math.max(0, need - (u.closed || 0)) + '건 남았습니다.' + (g + 1 === 2 ? ' 시니어부터 현상금 케이스 수임 권한과 월 고정 활동비(리테이너) 대상이 됩니다.' : '') : '최고 등급입니다.';
    $('#trustV').textContent = u.trust || 0; $('#trustBar').style.width = (u.trust || 0) + '%';
    const auto = { senior: g >= 2, master: g >= 3, ten: (u.closed || 0) >= 10 };
    $('#badgeGrid').innerHTML = EG.BADGES.map(b => '<div class="badge' + (S.badges[b.k] || auto[b.k] ? '' : ' locked') + '"><div class="b">' + b.b + '</div><span>' + b.t + '</span></div>').join('');
    $('#verLine').textContent = 'E지킴이 v' + EG.VERSION + ' · ' + (N.isNative ? (N.platform === 'ios' ? 'iOS 앱' : '안드로이드 앱') : '웹앱(PWA)') + ' · 사단법인 에너지안보환경협회';
  }
  $('#btnLogout').onclick = () => confirmSheet('로그아웃', '온보딩 화면으로 돌아갑니다. 이 기기의 점검 기록은 유지됩니다.', '로그아웃', () => { S.onboarded = false; S.user = null; S.admin = false; S.mode = 'g'; save(); setChip(); go('onboard'); });
  $('#btnReset').onclick = () => confirmSheet('앱 데이터 초기화', '이 기기에 저장된 케이스·증거 사진·지갑 기록을 모두 지우고 처음 상태로 되돌립니다. 되돌릴 수 없습니다.', '초기화', async () => { await ST.reset(); location.reload(); });
  $('#btnPerm').onclick = async () => {
    const p = await N.permissions(); const k = { granted: '허용', denied: '거부', prompt: '미설정(요청 전)', 'prompt-with-rationale': '미설정' };
    sheet('<h4>권한 상태</h4><div class="card" style="padding:4px 14px"><div class="nearrow"><div><b>카메라</b><span>증거 사진 · 수료증 QR</span></div><span class="m">' + (k[p.camera] || p.camera) + '</span></div><div class="nearrow"><div><b>위치</b><span>GPS 증거 · 근접 알림 · 순찰 기록</span></div><span class="m">' + (k[p.location] || p.location) + '</span></div></div><p class="mut small" style="margin-top:10px;line-height:1.6">거부된 권한은 휴대폰 설정 › 앱 › E지킴이에서 바꿀 수 있습니다.</p><div class="btnrow"><button class="btn btn-ghost" data-close>닫기</button><button class="btn btn-navy" id="pmReq">권한 요청</button></div>');
    $('#pmReq').onclick = async () => { closeSheet(); await N.requestPermissions(); locate(true); };
  };
  $('#btnExport').onclick = async () => {
    const rows = [['케이스', '유형', '시설', '주소', '상태', '판정요약', '증거키', '촬영시각', '위도', '경도', '정확도(m)', 'SHA-256']];
    S.cases.filter(c => c.st !== 'open').forEach(c => {
      const ev = evList(c); const base = [c.id, EG.TYPE[c.type], facOf(c) ? facOf(c).name : '자율', addrOf(c), c.st, sumOf(c)];
      if (!ev.length) rows.push(base.concat(['', '', '', '', '', '']));
      ev.forEach(x => rows.push(base.concat([x.k, x.ev.time, x.ev.lat, x.ev.lng, x.ev.acc, x.ev.hash])));
    });
    const r = await N.shareFiles({ title: 'E지킴이 점검 기록', text: 'E지킴이 점검 기록 (CSV)', files: [{ name: 'E지킴이_점검기록_' + now().toISOString().slice(0, 10) + '.csv', text: toCSV(rows), type: 'text/csv' }] });
    if (r !== 'cancel') toast('점검 기록 CSV를 내보냈습니다');
  };
  const toCSV = rows => rows.map(r => r.map(v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');

  /* ───────── 협회 콘솔 ───────── */
  function setChip() { const b = $('#btnMode'); if (S.mode === 'c') { b.textContent = '지킴이 모드'; b.classList.add('alt'); } else { b.textContent = '콘솔 모드'; b.classList.remove('alt'); } }
  $('#btnMode').onclick = () => { if (S.mode === 'c') { S.mode = 'g'; setChip(); go('home'); } else { if (!S.admin) { askAdmin(); return; } S.mode = 'c'; setChip(); go('console'); } };
  $('#btnBackApp').onclick = () => { S.mode = 'g'; setChip(); go('home'); };
  function askAdmin() {
    sheet('<h4>협회 운영 콘솔</h4><p class="mut" style="font-size:12.5px;line-height:1.7;margin-bottom:10px">운영자(role=admin) 권한이 있는 계정만 접근할 수 있습니다. 운영자 코드를 입력하세요.</p><input class="field" id="admCode" placeholder="ESEA-ADMIN-00" autocomplete="off" autocapitalize="characters"><p class="mut small" style="margin-top:8px">시범 운영자 코드: ' + EG.DEMO_ADMIN + '</p><div class="btnrow"><button class="btn btn-ghost" data-close>취소</button><button class="btn btn-navy" id="admOk">확인</button></div>');
    const ok = async () => {
      const v = $('#admCode').value.trim().toUpperCase();
      if (await N.sha256('egs:' + v) === EG.ADMIN_HASH) { S.admin = true; S.mode = 'c'; save(); closeSheet(); setChip(); go('console'); toast('운영자 인증 완료'); }
      else { $('#admCode').classList.add('err'); N.haptic('heavy'); toast('운영자 코드가 올바르지 않습니다'); }
    };
    $('#admOk').onclick = ok; $('#admCode').onkeydown = e => { if (e.key === 'Enter') ok(); };
    setTimeout(() => $('#admCode').focus(), 250);
  }
  function renderConsole() {
    $('#consoleSub').textContent = '사단법인 에너지안보환경협회 · ' + now().getFullYear() + '년 ' + (now().getMonth() + 1) + '월 · 지킴이 86명 활동 중 · 케이스 누적 ' + S.kpi.cases + '건';
    $('#kpiCases').textContent = S.kpi.cases; $('#kpiDone').textContent = S.kpi.done;
    $('#qCount').textContent = S.queue.length + '건 대기 · SLA 48시간';
    $('#verifyQueue').innerHTML = S.queue.map(q => {
      const c = q.own ? S.cases.find(x => x.id === q.id) : null;
      return '<div class="queueitem"><div class="qh"><b style="font-size:13px">' + q.id + '</b><span class="mut mono" style="font-size:10px">' + q.t + '</span></div>' +
        '<div style="font-size:12px;color:var(--mut)">' + esc(q.by) + ' · ' + esc(q.fac) + ' — ' + esc(q.sum) + '</div>' +
        (c ? '<div class="qphotos">' + evList(c).map(x => '<img data-thumb="' + x.id + '" alt="">').join('') + '</div>' + (c.note ? '<div style="font-size:11.5px;margin-top:6px">메모: ' + esc(c.note) + '</div>' : '') : '') +
        '<div class="qa"><button class="btn btn-vest btn-sm" data-ap="' + q.id + '">승인 · 정산</button><button class="btn btn-ghost btn-sm" data-rj="' + q.id + '">반려 · 보완요청</button>' + (c ? '<button class="btn btn-ghost btn-sm" data-vw="' + q.id + '">보고서</button>' : '') + '</div></div>';
    }).join('') || '<div class="notice info"><span><b>대기 건 없음</b>모든 보고가 검증되었습니다.</span></div>';
    fillThumbs($('#verifyQueue'));
    const max = Math.max(...EG.HEAT.map(d => d[1]));
    $('#heatmap').innerHTML = EG.HEAT.map(d => '<div class="col"><span class="v">' + d[1] + '</span><div class="bar' + (d[1] === max ? ' hot' : '') + '" style="height:' + Math.round(d[1] / max * 76) + 'px"></div><span class="n">' + d[0] + '</span></div>').join('');
    $('#payQueue').innerHTML = S.pay.map(p => '<div class="walletrow"><div class="ic ' + p.l + '">' + p.l + '</div><div class="tt"><b>' + esc(p.who) + ' · ' + fmt(p.amt) + '원</b><span>' + esc(p.desc) + '</span></div><div class="amt">' + (p.st === 'wait' ? '<button class="btn btn-vest btn-sm" data-pay="' + p.id + '">승인</button>' : '<b style="font-size:11px;color:var(--volt)">지급 확정</b>') + '</div></div>').join('') || '<p class="mut small" style="padding:12px 0">결재 대기 건이 없습니다.</p>';
  }
  $('#verifyQueue').addEventListener('click', e => {
    const ap = e.target.closest('[data-ap]'), rj = e.target.closest('[data-rj]'), vw = e.target.closest('[data-vw]');
    if (vw) { const c = S.cases.find(x => x.id === vw.dataset.vw); if (c) sheet('<h4>보고서 · ' + c.id + '</h4><pre style="white-space:pre-wrap;font-size:11.5px;line-height:1.65;font-family:inherit">' + esc(reportText(c)) + '</pre><div class="btnrow"><button class="btn btn-ghost" data-close>닫기</button></div>'); return; }
    if (!ap && !rj) return;
    const id = (ap || rj).dataset[ap ? 'ap' : 'rj']; const c = S.cases.find(x => x.id === id);
    if (ap) {
      S.queue = S.queue.filter(x => x.id !== id); S.kpi.done++;
      if (c) approveCase(c);
      save(); renderConsole(); N.haptic('success');
      toast(id + ' 검증 승인 — 지킴이 지갑에 보수가 반영되었습니다');
    } else {
      sheet('<h4>반려 · 보완 요청</h4><textarea class="notebox" id="rjMsg">증거 사진의 위치가 확인되지 않습니다. 시설 전경이 보이도록 다시 촬영해 주세요.</textarea><div class="btnrow"><button class="btn btn-ghost" data-close>취소</button><button class="btn btn-navy" id="rjOk">보완 요청 전송</button></div>');
      $('#rjOk').onclick = () => {
        const msg = $('#rjMsg').value.trim();
        S.queue = S.queue.filter(x => x.id !== id);
        if (c) { c.st = 'rejected'; c.rejectMsg = msg; addNoti(id + ' 보완 요청 — ' + msg); addAct(id + ' 보완 요청 수신'); }
        save(); closeSheet(); renderConsole(); toast(id + ' 보완 요청 전송 — 지킴이에게 재점검 통보');
      };
    }
  });
  function approveCase(c) {
    c.st = 'done'; c.doneAt = now().toISOString();
    const p = c.pay || {}; const u = S.user;
    if (p.pts) { S.pts += p.pts; S.wallet.unshift({ l: 'L1', date: md(now()), title: c.title + ' — 검증 승인', sub: '건당 보수', amt: p.pts, unit: 'P' }); }
    const hasIssue = Object.values(c.judge || {}).some(v => v === 'fix' || v === 'urg') || !CLof(c);
    if ((p.perf || p.l === 'L4') && hasIssue) {
      S.wallet.unshift({ l: p.l === 'L4' ? 'L4' : 'L3', date: md(now()), title: c.title + ' — ' + (p.l === 'L4' ? '현상금' : '성과보수'), sub: '관계기관 처분 확정 후 산정·지급', amt: 0, unit: '원', pending: true });
      if (p.l === 'L4') S.badges.bounty = 1;
    }
    if (u) {
      u.closed = (u.closed || 0) + 1;
      const ng = EG.GRADE_NEED.reduce((g, need, i) => u.closed >= need ? i : g, 0);
      if (ng > u.grade) { u.grade = ng; addNoti('축하합니다! ' + EG.GRADES[ng] + ' 등급으로 승급했습니다.'); }
    }
    addAct(c.id + ' 검증 승인' + (p.pts ? ' · +' + fmt(p.pts) + 'P' : ''));
    addNoti(c.id + ' 검증이 승인되었습니다.' + (p.pts ? ' 건당 보수 ' + fmt(p.pts) + 'P가 지급되었습니다.' : ''));
  }
  $('#payQueue').addEventListener('click', e => {
    const b = e.target.closest('[data-pay]'); if (!b) return; const p = S.pay.find(x => x.id === b.dataset.pay); if (!p) return;
    confirmSheet('정산 승인', esc(p.who) + ' · ' + fmt(p.amt) + '원<br>' + esc(p.desc) + '<br><br>운영자 승인 후 사무국 결재로 지급이 확정됩니다.', '승인', () => {
      p.st = 'done';
      if (p.cash) { S.won = Math.max(0, S.won - p.amt); S.wallet.unshift({ l: 'L3', date: md(now()), title: '현금 전환 지급 확정', sub: '등록 계좌 지급 예정', amt: -p.amt, unit: '원' }); addNoti('현금 전환 ' + fmt(p.amt) + '원 지급이 확정되었습니다.'); }
      save(); renderConsole(); toast('정산 승인 완료 — 익일 지급 예정');
    });
  });
  $('#btnReport').onclick = async () => {
    const ym = now().getFullYear() + '-' + pad(now().getMonth() + 1);
    const rows = [['E지킴이 월간 활동 리포트', ym], ['이번 달 케이스', S.kpi.cases], ['처분 확정', S.kpi.done], ['검증 대기', S.queue.length], [],
      ['케이스', '유형', '시설', '주소', '상태', '판정요약', '증거사진', '제출일시', '신고기관']];
    S.cases.filter(c => c.st !== 'open').forEach(c => rows.push([c.id, EG.TYPE[c.type], facOf(c) ? facOf(c).name : '자율', addrOf(c), c.st, sumOf(c), evList(c).length, c.submittedAt || '', c.agency ? agOf(c.agency).name : '']));
    rows.push([], ['지역별 발견 건수(최근 30일)']); EG.HEAT.forEach(h => rows.push(h));
    rows.push([], ['순찰 기록', '시작', '분', 'km']); S.patrols.forEach(p => rows.push(['', p.start, p.min, p.km]));
    const r = await N.shareFiles({ title: ym + ' 월간 활동 리포트', text: 'E지킴이 ' + ym + ' 월간 활동 리포트', files: [{ name: 'E지킴이_월간리포트_' + ym + '.csv', text: toCSV(rows), type: 'text/csv' }] });
    if (r !== 'cancel') toast(ym + ' 월간 활동 리포트를 생성했습니다');
  };

  /* ───────── 알림 ───────── */
  $('#btnNoti').onclick = () => {
    S.notiSeen = S.notis.length; save(); renderNotiDot();
    sheet('<h4>알림</h4>' + (S.notis.slice(0, 30).map(n => '<div class="notirow"><span class="d">' + n[0] + '</span><span>' + esc(n[1]) + '</span></div>').join('') || '<p class="mut">알림이 없습니다.</p>'));
  };

  /* ───────── 온보딩 · 인증 · 동의 ───────── */
  async function handleCode(raw) {
    const m = String(raw || '').toUpperCase().match(/ESEA-\d{1,2}-\d{4}/);
    if (!m) return false;
    const h = await N.sha256('egs:' + m[0]);
    const r = EG.ROSTER[h]; if (!r) return false;
    S.user = Object.assign({ codeHash: h }, JSON.parse(JSON.stringify(r)));
    save(); N.haptic('success'); toast('수료증 확인 완료 — ' + r.name + '님 (' + r.cohort + '기)');
    showConsent(); return true;
  }
  function showConsent() {
    $('#consentHello').textContent = (S.user ? S.user.name + '님, ' : '') + '환영합니다';
    $$('#scr-consent input').forEach(i => i.checked = false); $('#btnConsent').disabled = true;
    go('consent');
  }
  $('#scr-consent').addEventListener('change', e => {
    const t = e.target; if (t.dataset.c === 'all') $$('#scr-consent input').forEach(i => i.checked = t.checked);
    const req = [...$$('#scr-consent input[data-req]')]; const all = [...$$('#scr-consent input:not([data-c="all"])')];
    $('#scr-consent input[data-c="all"]').checked = all.every(i => i.checked);
    $('#btnConsent').disabled = !req.every(i => i.checked);
  });
  $('#btnConsent').onclick = async () => {
    const c = {}; $$('#scr-consent input:not([data-c="all"])').forEach(i => c[i.dataset.c] = i.checked); c.at = now().toISOString(); c.ver = 'v1';
    S.consent = c; S.onboarded = true; save();
    go('home'); toast((S.user ? S.user.name + '님, ' : '') + '활동을 시작하세요');
    await N.requestPermissions(); locate(true);
  };
  $('#btnCode').onclick = () => {
    sheet('<h4>수료증 코드 입력</h4><p class="mut" style="font-size:12.5px;line-height:1.7;margin-bottom:10px">수료증 하단의 코드를 입력하세요. 코드는 기기에 평문으로 저장되지 않고 해시로만 대조합니다.</p><input class="field" id="codeIn" placeholder="ESEA-3-0001" autocomplete="off" autocapitalize="characters"><p class="mut small" style="margin-top:8px">시범 코드: ' + EG.DEMO_CODE + ' · ESEA-1-0001(시니어)</p><div class="btnrow"><button class="btn btn-ghost" data-close>취소</button><button class="btn btn-navy" id="codeOk">확인</button></div>');
    const ok = async () => { if (await handleCode($('#codeIn').value)) closeSheet(); else { $('#codeIn').classList.add('err'); N.haptic('heavy'); toast('수료증 코드를 확인해 주세요'); } };
    $('#codeOk').onclick = ok; $('#codeIn').onkeydown = e => { if (e.key === 'Enter') ok(); };
    setTimeout(() => $('#codeIn').focus(), 250);
  };
  $('#btnDemo').onclick = () => { S.user = Object.assign(JSON.parse(JSON.stringify(EG.ROSTER[Object.keys(EG.ROSTER)[0]])), { demo: true }); save(); showConsent(); };

  /* QR 스캔 — 실시간 카메라 + jsQR, 실패 시 사진으로 인식 */
  let QR = null;
  $('#btnScan').onclick = startQR;
  async function startQR() {
    $('#qrScan').classList.add('show'); $('#qrMsg').textContent = '카메라 준비 중…';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const v = $('#qrVideo'); v.srcObject = stream; await v.play();
      QR = { stream, c: document.createElement('canvas') };
      $('#qrMsg').textContent = 'QR을 찾는 중…';
      const tick = async () => {
        if (!QR) return;
        if (v.readyState >= 2 && window.jsQR) {
          const w = 480, h = Math.round(480 * v.videoHeight / v.videoWidth) || 360; QR.c.width = w; QR.c.height = h;
          const ctx = QR.c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(v, 0, 0, w, h);
          const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
          if (r && r.data) {
            if (await handleCode(r.data)) { stopQR(); return; }
            $('#qrMsg').textContent = '등록되지 않은 QR입니다 — 협회 발급 수료증 QR인지 확인하세요';
          }
        }
        QR && (QR.raf = requestAnimationFrame(tick));
      };
      tick();
    } catch (e) { $('#qrMsg').textContent = '카메라 미리보기를 쓸 수 없습니다 — "사진으로 인식"을 눌러 QR을 촬영하세요'; }
  }
  function stopQR() { if (QR) { cancelAnimationFrame(QR.raf); QR.stream.getTracks().forEach(t => t.stop()); QR = null; } $('#qrScan').classList.remove('show'); }
  $('#qrClose').onclick = stopQR;
  $('#qrPhoto').onclick = async () => {
    let d; try { d = await N.takePhoto(); } catch (e) { return; }
    const img = new Image(); img.onload = async () => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const r = window.jsQR && jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
      if (r && await handleCode(r.data)) { stopQR(); return; }
      toast(r ? '등록되지 않은 수료증 QR입니다' : 'QR을 찾지 못했습니다 — 밝은 곳에서 가까이 촬영하거나 코드를 직접 입력하세요');
    }; img.src = d;
  };

  /* ───────── 시작 ───────── */
  N.initChrome();
  setChip(); renderNotiDot();
  if (S.onboarded && S.user) { go(S.mode === 'c' && S.admin ? 'console' : 'home'); locate(true); }
  else go('onboard');
  if ('serviceWorker' in navigator && !N.isNative && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  window.EGAPP = { go, get S() { return S; }, setLoc };
})();
