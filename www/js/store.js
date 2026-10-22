/* 로컬 저장소 — 상태는 localStorage, 증거 사진은 IndexedDB (오프라인에서도 기록 유지)
 * 실서비스 전환 시 sync() 지점에서 Supabase 테이블·스토리지로 업로드한다. */
(function () {
  const KEY = 'egs.v1';
  const DB = 'egs-photos', STORE = 'photos';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no-idb'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const mem = {}; // IndexedDB 불가 환경용 메모리 폴백
  async function putPhoto(p) { try { const d = await db(); await tx(d, 'readwrite', s => s.put(p)); } catch (e) { mem[p.id] = p; } }
  async function getPhoto(id) { try { const d = await db(); return (await tx(d, 'readonly', s => s.get(id))) || mem[id] || null; } catch (e) { return mem[id] || null; } }
  async function delPhoto(id) { try { const d = await db(); await tx(d, 'readwrite', s => s.delete(id)); } catch (e) { } delete mem[id]; }
  async function clearPhotos() { try { const d = await db(); await tx(d, 'readwrite', s => s.clear()); } catch (e) { } }
  function tx(d, mode, fn) {
    return new Promise((res, rej) => { const t = d.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); });
  }

  function fresh() {
    return {
      onboarded: false, consent: null, user: null, admin: false, mode: 'g', cur: null,
      pts: 12400, won: 680000,
      cases: EG.SEED_CASES.map(c => Object.assign({ judge: {}, shots: {}, note: '', ai: {} }, JSON.parse(JSON.stringify(c)))),
      queue: JSON.parse(JSON.stringify(EG.SEED_QUEUE)),
      wallet: JSON.parse(JSON.stringify(EG.SEED_WALLET)),
      pay: [{ id: 'PAY-1021', who: '김지킴', l: 'L3', amt: 180000, desc: '10-21 · 처분 확정 · 이중보상 공제 검토 완료', st: 'wait' }],
      acts: [['10-21', 'CASE-2026-0129 성과보수 180,000원 지급 (처분 확정)'], ['10-19', 'CASE-2026-0138 점검 진행 중 — 3/8 항목 판정'], ['10-15', '정기점검 3건 종결 · +24,000P']],
      notis: [['10-21', 'CASE-2026-0129 처분이 확정되어 성과보수 180,000원이 지급되었습니다.'], ['10-19', '검증 SLA 48시간 내 처리율 94% — 협회 운영 보고'], ['10-15', '신규 현상금 케이스가 내 반경 3km에 등록되었습니다.'], ['10-12', '정기점검 체크리스트 v1이 반영되었습니다.']],
      notiSeen: 0, badges: { first: 1, ten: 1, perf: 1, bounty: 1 },
      kpi: { cases: 328, done: 27 }, seq: 148, patrols: [], reports: {}
    };
  }
  let S = fresh();
  function load() { try { const d = localStorage.getItem(KEY); if (d) S = Object.assign(fresh(), JSON.parse(d)); } catch (e) { } return S; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('save fail', e); } }
  async function reset() { try { localStorage.removeItem(KEY); } catch (e) { } await clearPhotos(); S = fresh(); return S; }

  EG.store = { get S() { return S; }, load, save, reset, putPhoto, getPhoto, delPhoto };
})();
