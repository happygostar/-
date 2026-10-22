/* E지킴이 — 기준 데이터 (체크리스트 v1 · 시설 · 시드 케이스 · 신고 채널)
 * 실서비스 전환 시 이 파일의 내용은 Supabase 등 백엔드 테이블(members, facilities, cases …)에서 불러온다. */
window.EG = window.EG || {};

EG.VERSION = '1.0.0 (파일럿)';

/* 점검 체크리스트 v1 — 주유·충전소 8 / 변전·발전 8 / 취약계층 주택 6 (기획서 별첨 A-3) */
EG.CHECK = {
  fuel: { label: '주유·충전소', items: ['소화기 위치·압력 게이지 정상', '유류 누출 흔적 (바닥 얼룩·기름 냄새)', '급유구 커버·잠금장치 상태', '위험물 표지판·안전게시판 게시', '흡연·화기 엄금 및 인화성 물질 방치', '배관·밸브 부식 상태', '비상차단장치 위치 확인', '주변 정리정돈·통로 확보'] },
  sub: { label: '변전·발전시설', items: ['담장·출입통제 시설 훼손 여부', '무단 진입 흔적·공구 방치', '변압기 누유·이상 소음', '경고 표지판 게시 상태', '야간 조명 작동 여부', '시설 주변 식생·나지 상태', '피뢰설비·접지 외관 상태', '주변부 상습 무단투기 여부'] },
  home: { label: '에너지취약계층 주택', items: ['보일러 배기통 연결·손상', '가스 호스·밸브 노후 상태', 'CO(일산화탄소) 경보기 설치', '전기 배선·콘센트 과부하 흔적', '창호·단열 틈새 상태', '계량기 주변 안전 상태'] }
};

EG.TYPE = { regular: '정기점검', found: '발견 의뢰', bounty: '현상금', free: '자율 제보' };

/* 수료생 명부 — 수료증 코드는 평문으로 저장하지 않고 SHA-256('egs:'+코드) 해시만 보관 (별첨 A-2) */
EG.ROSTER = {
  '256272e02a5359a62a638a9afca9f6a4e69c3c3c8b396b7c74ed0d56631f57c4': { name: '김지킴', cohort: 3, joined: '2026-09-01', grade: 1, trust: 92, closed: 12 },
  '5968fcd6ea1de5ab551630ddd55586210b31411e0c55db87bfe8f28673cf7e1c': { name: '이지킴', cohort: 3, joined: '2026-09-01', grade: 1, trust: 88, closed: 7 },
  'de3e6445f1298675b7775911e33e1e6921ba7b4f7875010eb93e587d8b68fa27': { name: '박지킴', cohort: 1, joined: '2026-03-02', grade: 2, trust: 97, closed: 31 }
};
EG.ADMIN_HASH = 'b31c70c1b7ff8ebdf369ca6a92c553f9711ae33f587d31c9cf54591644b2d03e';
EG.DEMO_CODE = 'ESEA-3-0001';
EG.DEMO_ADMIN = 'ESEA-ADMIN-01';

EG.GRADES = ['신수', '인증', '시니어', '마스터'];
EG.GRADE_NEED = [0, 5, 20, 50]; // 등급별 누적 종결 건수 기준 (시범값 — 협회 승인 필요)

/* 시설 — 좌표는 파일럿 시연용 예시 위치 */
EG.FACILITIES = {
  A: { name: 'A주유소', kind: 'fuel', addr: '서울 강서구 화곡로 122', lat: 37.54105, lng: 126.84020 },
  B: { name: 'B변전소', kind: 'sub', addr: '서울 강서구 곰달래로 15', lat: 37.53790, lng: 126.84700 },
  C: { name: 'C충전소', kind: 'fuel', addr: '서울 양천구 목동동로 403', lat: 37.53060, lng: 126.87360 },
  D: { name: 'D아파트 충전구역', kind: 'fuel', addr: '서울 구로구 항동', lat: 37.48150, lng: 126.82480 },
  E: { name: 'E다세대주택', kind: 'home', addr: '서울 강서구 등촌로', lat: 37.55020, lng: 126.86010 },
  F: { name: 'F발전소 주변', kind: 'sub', addr: '경기 김포시 하성면', lat: 37.71980, lng: 126.63010 },
  G: { name: 'G배전탑', kind: 'sub', addr: '서울 강서구 오쇠동', lat: 37.55210, lng: 126.80420 },
  H: { name: 'H주유소', kind: 'fuel', addr: '서울 강서구 마곡동', lat: 37.56010, lng: 126.82980 }
};

EG.SEED_CASES = [
  { id: 'CASE-2026-0147', type: 'regular', fac: 'A', title: 'A주유소 소화기·누유 정기 점검', reward: '건당 8,000P', pay: { l: 'L1', pts: 8000 }, st: 'open' },
  { id: 'CASE-2026-0146', type: 'bounty', fac: 'B', title: 'B변전소 담장 훼손·무단진입 흔적 확인', reward: '법정 포상금 연계', pay: { l: 'L4', won: 0 }, st: 'open', senior: false },
  { id: 'CASE-2026-0145', type: 'found', fac: 'C', title: 'C충전소 배관 부식 판정 의뢰', reward: '건당 8,000P+성과', pay: { l: 'L1', pts: 8000, perf: true }, st: 'open', warn: true },
  { id: 'CASE-2026-0144', type: 'regular', fac: 'D', title: 'D아파트 전기차 충전구역 정기 점검', reward: '건당 6,000P', pay: { l: 'L1', pts: 6000 }, st: 'open' },
  { id: 'CASE-2026-0143', type: 'found', fac: 'E', title: 'E다세대주택 보일러 배기 시설 확인', reward: '건당 7,000P+성과', pay: { l: 'L1', pts: 7000, perf: true }, st: 'open' },
  { id: 'CASE-2026-0142', type: 'bounty', fac: 'F', title: 'F발전소 주변 상습 무단투기 적발', reward: '피해액 연동 현상금', pay: { l: 'L4', won: 0 }, st: 'open', senior: true },
  { id: 'CASE-2026-0141', type: 'free', fac: null, title: '순찰 중 발견 자율 제보 (수시 접수)', reward: '건당 5,000P+성과', pay: { l: 'L1', pts: 5000, perf: true }, st: 'open', addr: '내 위치 반경 5km', repeat: true },
  { id: 'CASE-2026-0138', type: 'regular', fac: 'G', title: 'G배전탑 주변 식생·담장 정기 점검', reward: '건당 8,000P', pay: { l: 'L1', pts: 8000 }, st: 'active', judge: { 0: 'ok', 1: 'fix', 2: 'ok' }, note: '담장 하단 모서리 절단 흔적 발견 (길이 약 40cm)' },
  { id: 'CASE-2026-0129', type: 'found', fac: 'H', title: 'H주유소 유증기 회수장치 이상 제보', reward: '처분 확정·지급 완료', pay: { l: 'L3' }, st: 'done', judge: { 0: 'ok', 1: 'urg', 2: 'ok', 3: 'ok', 4: 'fix', 5: 'ok', 6: 'ok', 7: 'ok' }, note: '주유 중 유증기 다량 발생, 회수 노즐 고정 불량' }
];

EG.SEED_QUEUE = [
  { id: 'CASE-2026-0135', by: '이지킴', fac: '목동 LPG 충전소', sum: '유류 누출 의심 · 긴급 1건', t: '14:02', ext: true },
  { id: 'CASE-2026-0133', by: '박지킴', fac: '오곡 변전소', sum: '담장 훼손 흔적', t: '11:47', ext: true }
];

EG.SEED_WALLET = [
  { l: 'L3', date: '10-21', title: 'H주유소 유증기 회수장치 — 처분 확정', sub: '법정 포상금 연계 성과보수', amt: 180000, unit: '원' },
  { l: 'L1', date: '10-15', title: '정기점검 3건 종결', sub: '건당 보수', amt: 24000, unit: 'P' },
  { l: 'L2', date: '10-12', title: '지정 순찰 3.5h · 8.2km', sub: '활동 일당·실비', amt: 12000, unit: 'P' },
  { l: 'L4', date: '08-27', title: '전선도난 적발 제보', sub: '한전 포상금 연계', amt: 500000, unit: '원' },
  { l: 'L5', date: '09-01', title: '월 고정 활동비 (시니어 대상)', sub: '시니어 승급 시 지급', amt: 0, unit: 'P' }
];

EG.BADGES = [
  { b: '검', t: '첫 점검 완료', k: 'first' }, { b: '10', t: '10건 달성', k: 'ten' }, { b: '성', t: '첫 성과보수', k: 'perf' }, { b: '포', t: '현상금 적발', k: 'bounty' },
  { b: '시', t: '시니어 승급', k: 'senior' }, { b: '마', t: '마스터', k: 'master' }, { b: 'AI', t: 'AI 판별 베타', k: 'ai' }, { b: '순', t: '첫 순찰 완료', k: 'patrol' }
];

EG.HEAT = [['강서구', 14], ['양천구', 9], ['구로구', 7], ['금천구', 6], ['관악구', 4], ['부천시', 3], ['김포시', 2], ['오류동', 2]];

/* 신고 채널 — 실제 전송은 각 기관 앱·웹·전화로 연계(안내)만 한다 (별첨 A-5) */
EG.AGENCIES = [
  { k: 'env', name: '환경신문고', label: '환경신문고 128', tel: '128', desc: '환경오염 행위 (국번 없이 128)' },
  { k: 'safe', name: '안전신문고', label: '안전신문고', web: 'https://www.safetyreport.go.kr', desc: '생활 속 안전 위험요인 (앱·누리집 신고)' },
  { k: 'kepco', name: '한국전력공사', label: '한전 123', tel: '123', desc: '전력설비 이상·전선 도난 (국번 없이 123)' },
  { k: 'kgs', name: '한국가스안전공사', label: '가스안전공사', tel: '043-750-1000', web: 'https://www.kgs.or.kr', desc: '가스시설 안전 (대표번호 · 누리집)' },
  { k: 'local', name: '지자체 담당부서', label: '지자체 담당', tel: '120', desc: '서울은 120 다산콜 — 그 밖의 지역은 해당 시·군·구청' }
];

/* 시뮬레이션 경로 — 현장 밖에서 지오펜싱 시험용 (A주유소 북서쪽 약 300m → 도착) */
EG.SIM_ROUTE = [
  [37.54330, 126.83760], [37.54300, 126.83800], [37.54270, 126.83840], [37.54240, 126.83880], [37.54210, 126.83920],
  [37.54180, 126.83950], [37.54150, 126.83975], [37.54130, 126.83995], [37.54115, 126.84010], [37.54107, 126.84018]
];
