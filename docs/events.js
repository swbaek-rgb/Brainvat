// 사건 테이블 ------------------------------------------------------------
// 각 사건:
//  id, name            : 식별자, 로그에 찍히는 이름
//  age: [min, max]     : 발생 가능 나이
//  kind                : trait(특성이 부름) | luck(순수 운) | fork(갈림길) | other(남이 걸림) | quiet(조용한 해)
//  base                : 기본 연간 가중치 (상대값)
//  w(p)                : 사람 상태를 보고 가중치 배율을 돌려주는 함수 (특성 유도)
//  once                : true면 평생 한 번
//  requires(p)/blocks  : 전제 조건
//  effects             : 성격 축 변화 {E,C,O,A,N} 와 상태 변화(health, wealth, bond, ...)
//  text(p)             : 로그 문장
//  prayer              : { prob, text, grant, deny } — grant/deny 는 함수(p, sim) → 즉시 효과 및 후과 예약
//  fork(p)             : 갈림길 사건이면 선택지 둘 중 사람이 고른 결과를 돌려줌

const EV = [];
const add = e => EV.push(e);
const hi = (v, t = 60) => v > t, lo = (v, t = 40) => v < t;

// 몇 년 뒤 후과. 저장/불러오기를 위해 함수가 아니라 이름으로 예약한다: s.later(년, "이름", 인자)
const LATER = {
  exam_struggle:   (p, s) => { s.adj(p, { N: +4, C: -2 }); s.note("따라가지 못했다. 휴학, 그리고 긴 방황."); p.edu = 1; },
  firstlove_again: (p, s) => s.adj(p, { N: +3, A: -2 }),
  job_burnout:     (p, s) => { if (p.pheno.N > 55) { s.adj(p, { N: +3 }); s.note("번아웃. 그 회사가 '어디든'에 해당했던 걸 후회했다."); } },
  child_shadow:    (p, s) => { p.health -= 15; s.note("건강검진에서 그림자가 나왔다."); },
  debut_after:     (p, s) => { if (Math.random() < 0.5) { p.famous = false; s.note("인기는 오래가지 않았다. 이름을 기억하는 사람이 줄었다."); s.adj(p, { N: +4, E: -2 }); p.job = 1; } else { p.famous = true; s.note("이름이 알려졌다. 거리에서 알아보는 사람이 생겼다."); p.wealth = clamp(p.wealth + 25); } },
  illness_treated: (p, s, k) => { s.adj(p, { N: -6 }); p.illness = false; s.note("조금 나아졌다. 완전히는 아니다."); s.won(k); },
  immersion_result:(p, s) => {
    if ((p.pheno.C + p.pheno.O + p.pheno.iq) / 3 + randn() * 10 > 58) { p.wealth = clamp(p.wealth + 20); s.adj(p, { E: +3, N: -2 }); s.note("걸었던 것이 열매를 맺었다. 이름 앞에 수식어가 붙기 시작했다."); }
    else { s.adj(p, { O: +2, N: +2 }); s.note("몇 년이 지났지만 남은 건 습관뿐이었다. 그래도 그 습관은 평생 갔다."); }
  },
  addiction_quit:  (p, s, k) => { p.addict = false; s.adj(p, { C: +3 }); s.won(k); },
};

// ---------- 유년 (0-12) ----------
add({ id: "parents_fight", cooldown: 3, name: "부모의 불화", age: [2, 12], kind: "luck", base: 1.2,
  w: p => 1 + (50 - p.home.stability) / 50,
  effects: { N: +3, A: -1 }, text: p => "집안에 고성이 잦아졌다. 방문을 닫고 숨는 법을 배웠다.",
  // 어머니의 기도는 집이 정말 흔들릴 때(안정 40 이하)만 올라온다. 싸움은 그래도 기록에 남는다
  prayer: { prob: p => p.home.stability <= 40 ? 0.5 : 0, by: "parent", text: p => `${p.motherName}: "아이 앞에서만은 싸우지 않게 해주세요."`,
    grant: (p, s) => { s.adj(p, { N: -2 }); p.home.stability += 10; s.note("집안이 조금 조용해졌다."); },
    deny: (p, s) => { p.home.stability -= 5; } } });

add({ id: "move", cooldown: 4, name: "이사", age: [4, 12], kind: "luck", base: 0.8,
  effects: { O: +2, E: -1 }, text: p => "낯선 동네, 낯선 학교. 친구를 처음부터 다시 사귀어야 했다." });

add({ id: "first_friend", name: "첫 친구", age: [5, 10], kind: "trait", base: 1.0, once: true,
  w: p => 0.5 + p.pheno.E / 100 + p.pheno.A / 100,
  effects: { E: +2, A: +2, N: -1 }, text: p => "처음으로 비밀을 나눌 사람이 생겼다." });

add({ id: "neglect", cooldown: 3, name: "방치", age: [1, 10], kind: "luck", base: 0.6,
  w: p => lo(p.home.warmth, 35) ? 3 : 0.3,
  effects: { N: +3, A: -2, E: -2 }, iqEnv: -6, text: p => "부모는 바빴거나, 없었다. 혼자 밥을 차려 먹는 날이 많았다." });

add({ id: "overprotect", name: "과보호", age: [3, 12], kind: "luck", base: 0.6,
  w: p => hi(p.home.warmth, 70) && hi(p.home.structure, 60) ? 2.5 : 0.3,
  effects: { N: +2, O: -2, C: +1 }, text: p => "넘어지기도 전에 손이 먼저 왔다. 스스로 해본 일이 적다." });

add({ id: "talent", name: "재능 발견", age: [6, 15], kind: "trait", base: 0.7, once: true,
  w: p => 0.3 + Math.max(0, p.pheno.iq - 55) / 30 + Math.max(0, p.pheno.O - 55) / 30,
  effects: { O: +3, C: +2 }, iqEnv: +4, text: p => "어떤 것 하나가 남들보다 쉽게 됐다. 어른들이 눈여겨보기 시작했다." });

add({ id: "child_illness", name: "큰 병치레", age: [0, 10], kind: "luck", base: 0.2,
  effects: { N: +2 }, health: -10, text: p => "몇 달을 병원에서 보냈다.",
  prayer: { prob: 0.8, by: "parent", text: p => `${p.motherName}: "제 목숨을 가져가셔도 좋으니 이 아이만은."`,
    grant: (p, s) => { p.health += 15; s.note("아이는 빠르게 회복했다. 어머니는 평생 그날을 기억한다."); p.faithSeed += 15; },
    deny: (p, s) => { if (Math.random() < 0.15) s.die(p, "병을 이기지 못했다."); else { p.health -= 5; s.note("아이는 겨우 살아났지만 오래 약했다."); } } } });

// ---------- 유년 추가분: 심심하지 않게, 대신 대부분 기도 없이 ----------
add({ id: "pet", name: "강아지", age: [5, 11], kind: "luck", base: 0.9, once: true,
  w: p => 0.6 + p.home.warmth / 100,
  effects: { A: +2, N: -2, E: +1 }, text: p => "상자 안에서 뭔가가 꼬물거렸다. 이름을 짓는 데 사흘이 걸렸다.",
  onFire: (p, s) => { p.pet = true; } });

add({ id: "pet_sick", name: "강아지가 아프다", age: [8, 16], kind: "luck", base: 1.2, once: true,
  requires: p => p.pet,
  effects: { N: +2 }, text: p => "밥을 먹지 않았다. 병원에서는 고개를 저었다.",
  // 아이의 첫 기도. 어른의 기도보다 단순하고 절대적이다
  prayer: { prob: 0.7, text: p => `"제 생일 선물 다 필요 없으니까, 얘만요."`,
    grant: (p, s) => { s.note("일주일 뒤 꼬리를 흔들었다. 아이는 그날 밤 처음으로 혼자 기도하는 법을 알았다."); s.adj(p, { A: +1 }); p.faithSeed += 8; },
    deny: (p, s) => { if (Math.random() < 0.3) { s.note("살았다. 수의사는 기적이라고 했고, 아이는 그 말을 오래 기억했다."); p.perceivedGrant = true; s.won(); }
      else { p.pet = false; s.note("마당 귀퉁이에 묻었다. 아이가 처음 겪는 끝이었다."); s.adj(p, { N: +2, O: +2, A: +1 }); } } },
  fallback: (p, s) => { if (Math.random() < 0.3) { s.note("살았다."); s.quietWin(); } else { p.pet = false; s.note("마당 귀퉁이에 묻었다. 아이가 처음 겪는 끝이었다."); s.adj(p, { N: +2, O: +2 }); } } });

add({ id: "sibling", name: "동생", age: [2, 9], kind: "luck", base: 0.9, once: true,
  w: p => 0.5 + p.home.stability / 100,
  effects: { A: +2, E: +1, N: +1 }, text: p => "집에 울음소리가 하나 늘었다. 엄마의 손이 반으로 줄었다.",
  onFire: (p, s) => { p.sibling = true; } });

add({ id: "grandma", name: "할머니 집", age: [4, 10], kind: "luck", base: 0.5, once: true,
  effects: { A: +2, N: -2, O: +1 }, text: p => "여름 한 달을 할머니 집에서 보냈다. 거기서는 아무도 서두르지 않았다.",
  onFire: (p, s) => { p.grandma = true; } });

add({ id: "grandma_death", name: "할머니의 죽음", age: [9, 18], kind: "other", base: 1.0, once: true,
  requires: p => p.grandma,
  effects: { N: +2, O: +2 }, text: p => "검은 옷을 처음 입었다. 어른들이 우는 걸 처음 봤다." });

add({ id: "first_prize", name: "첫 상장", age: [7, 12], kind: "trait", base: 0.8, once: true,
  w: p => 0.3 + Math.max(0, p.pheno.C - 45) / 30 + Math.max(0, p.pheno.iq - 50) / 30,
  effects: { C: +2, E: +2, N: -1 }, text: p => "이름이 불렸다. 앞에 나가는 동안 다리가 떨렸다. 냉장고에 오래 붙어 있었다." });

add({ id: "first_lie", name: "첫 거짓말", age: [5, 10], kind: "trait", base: 0.8, once: true,
  w: p => 0.4 + Math.max(0, 55 - p.pheno.C) / 30 + p.pheno.O / 150,
  effects: { O: +2, C: -1 }, text: p => "들키지 않았다. 세상이 생각보다 허술하다는 걸 알았다." });

add({ id: "lost", name: "미아", age: [3, 7], kind: "luck", base: 0.5, once: true,
  effects: { N: +3, E: -1 }, text: p => "시장에서 손을 놓쳤다. 두 시간이었지만 평생이었다.",
  prayer: { prob: 0.6, by: "parent", text: p => `${p.motherName}: "찾게만 해주세요. 찾게만."`,
    grant: (p, s) => { s.note("파출소 의자에 앉아 있었다. 어머니는 아이를 때리고 안았다."); s.adj(p, { N: -1 }); },
    deny: (p, s) => { s.note("해가 질 무렵 혼자 집을 찾아왔다. 그 뒤로 길을 잘 외웠다."); s.adj(p, { O: +2, C: +1 }); } } });

add({ id: "parent_jobloss", name: "아버지의 실직", age: [5, 14], kind: "luck", base: 0.6, once: true,
  w: p => 1 + Math.max(0, 50 - p.home.wealth) / 50,
  effects: { N: +2, C: +1 }, wealth: -10, text: p => "아버지가 낮에 집에 있었다. 아무도 그 얘기를 하지 않았다.",
  onFire: (p, s) => { p.home.stability = clamp(p.home.stability - 6); } });

add({ id: "secret_place", name: "비밀 장소", age: [6, 12], kind: "trait", base: 0.7, once: true,
  w: p => 0.4 + Math.max(0, 50 - p.pheno.E) / 30 + p.pheno.O / 120,
  effects: { O: +3, E: -1, N: -1 }, text: p => "아무도 모르는 자리를 찾았다. 거기서는 혼자여도 외롭지 않았다." });

add({ id: "happy_summer", name: "좋은 여름", age: [5, 12], kind: "luck", base: 0.7, cooldown: 4,
  requires: p => p.home.warmth >= 50 && p.home.stability >= 50,   // 따뜻하고 안정된 집에서만
  w: p => 0.5 + p.home.warmth / 80,
  effects: { N: -2, E: +1 }, text: p => "특별한 일은 없었다. 그래서 오래 기억에 남는 여름이었다." });

// ---------- 청소년 (13-19) ----------
add({ id: "exam", requires: p => !p.famous && !p.lawmaker, name: "입시", age: [17, 19], kind: "fork", base: 3.0, once: true,
  text: p => "인생의 첫 관문. 밤을 새워도 자신이 없었다.",
  prayer: { prob: 0.7, text: p => `"제발, 붙게만 해주세요. 그 다음은 제가 할게요."`,
    grant: (p, s) => { p.edu = 2; s.note("합격했다. 본인은 운이 좋았다고 생각했다.");
      // 후과: 그릇을 넘는 합격이면 몇 년 뒤 무너질 수 있음
      if (p.pheno.iq * 0.6 + p.pheno.C * 0.4 < 48) s.later(3, "exam_struggle"); },
    deny: (p, s) => { const pass = (p.pheno.iq * 0.6 + p.pheno.C * 0.4 + randn() * 10) > 55;
      p.edu = pass ? 2 : 1; s.note(pass ? "스스로의 힘으로 붙었다. 신이 들어줬다고 믿었다." : "떨어졌다. 다른 길을 찾아야 했다."); if (pass) s.won(); else s.adj(p, { N: +2, O: +2 }); },
    auto: (p, s) => { const pass = (p.pheno.iq * 0.6 + p.pheno.C * 0.4 + randn() * 10) > 55; p.edu = pass ? 2 : 1; s.note(pass ? "합격했다." : "떨어졌다."); } },
  fallback: (p, s) => { const pass = (p.pheno.iq * 0.6 + p.pheno.C * 0.4 + randn() * 10) > 55; p.edu = pass ? 2 : 1; s.note(pass ? "합격했다. 기도는 하지 않았다." : "떨어졌다. 기도할 생각조차 못 했다."); if (pass) s.quietWin(); } });

add({ id: "first_love", name: "첫사랑", age: [15, 22], kind: "trait", base: 1.5, once: true,
  w: p => 0.4 + p.pheno.E / 80 + p.pheno.app / 150,
  effects: { E: +2, N: +2, O: +2 }, text: p => "세상이 한 사람으로 좁아졌다가, 다시 넓어졌다. 끝은 좋지 않았다.",
  prayer: { prob: 0.4, text: p => `"그 사람 마음이 돌아오게 해주세요."`,
    grant: (p, s) => { s.note("돌아왔다. 그리고 2년을 더 끌다 더 아프게 끝났다."); s.later(2, "firstlove_again"); },
    deny: (p, s) => { s.adj(p, { N: +1, C: +1 }); s.note("돌아오지 않았다. 대신 밤에 글을 쓰기 시작했다."); } } });

add({ id: "bullying", name: "따돌림", age: [11, 17], kind: "trait", base: 0.8, once: true,
  w: p => 0.3 + Math.max(0, 45 - p.pheno.E) / 25 + Math.max(0, 45 - p.pheno.app) / 30,
  effects: { N: +5, E: -3, A: -2 }, text: p => "이유는 끝내 알 수 없었다. 교실에서 혼자였다.",
  prayer: { prob: 0.6, text: p => `"내일 학교에 안 가도 되게 해주세요. 아니면 저 애들이 없어지게."`,
    grant: (p, s) => { s.note("주동자가 전학을 갔다. 아이는 그것이 자기 기도 때문이라고 믿었고, 조금 무서워졌다."); s.adj(p, { N: -2, O: +1 }); },
    deny: (p, s) => { s.note("아무 일도 일어나지 않았다. 졸업까지 버텼다."); s.adj(p, { C: +2, A: -1 }); s.won(); } } });

add({ id: "rebellion", name: "반항기", age: [14, 18], kind: "trait", base: 1.0, once: true,
  w: p => 0.4 + Math.max(0, 50 - p.pheno.C) / 30 + Math.max(0, 50 - p.pheno.A) / 40 + Math.max(0, p.home.structure - 65) / 30,
  effects: { O: +2, C: -2, A: -1 }, text: p => "집을 나갔다 들어오기를 반복했다. 부모와는 말을 섞지 않았다.",
  prayer: { prob: 0.5, by: "parent", text: p => `${p.motherName}: "저 아이가 제 품으로 돌아오게만 해주세요."` ,
    grant: (p, s) => { s.adj(p, { A: +3, N: -1 }); s.note("어느 날 밤 둘이 오래 울었다."); },
    deny: (p, s) => { p.bond -= 15; s.note("아이는 끝내 돌아오지 않았다. 스무 살이 되자 집을 떠났다."); } } });

// ---------- 청년 (20-34) ----------
add({ id: "job_hunt", requires: p => !p.famous && !p.lawmaker, name: "취업 전쟁", age: [23, 29], kind: "fork", base: 2.0, once: true,
  text: p => "서류를 수십 통 넣었다. 답장은 드물었다.",
  prayer: { prob: 0.6, text: p => `"어디든 좋습니다. 그냥 어디든."`,
    grant: (p, s) => { p.job = 2; s.note("합격 통보가 왔다. 들어가서 보니 다닐 데가 아니었지만 다녔다."); s.later(4, "job_burnout"); },
    deny: (p, s) => { const ok = (p.pheno.C * 0.5 + p.pheno.iq * 0.3 + p.pheno.E * 0.2 + randn() * 10) > 50; p.job = ok ? 2 : 1;
      s.note(ok ? "1년을 더 버티고 원하던 곳에 들어갔다." : "작은 곳에서 시작했다. 괜찮은 선택이었는지는 아직 모른다."); if (ok) s.won(); },
    auto: (p, s) => { p.job = Math.random() < 0.5 ? 2 : 1; s.note("어딘가에 들어갔다."); } },
  fallback: (p, s) => { p.job = (p.pheno.C + p.pheno.iq) / 2 + randn() * 10 > 50 ? 2 : 1; s.note("기도 없이, 결과가 왔다."); if (p.job === 2) s.quietWin(); } });

// 연애 상태(p.dating): 연애로 시작하고 이별·결혼으로 끝난다. 연애 중에는 새 연애가 오지 않는다
add({ id: "love", cooldown: 2, name: "연애", age: [20, 40], kind: "trait", base: 1.2,
  requires: p => !p.dating && !p.spouse,
  w: p => 0.4 + p.pheno.E / 100 + p.pheno.app / 150 + p.pheno.A / 150,
  effects: { E: +1, N: -1 }, text: p => p.fired.breakup ? "다시 누군가와 오래 걷는 저녁이 많아졌다." : "누군가와 오래 걷는 저녁이 많아졌다.",
  onFire: (p, s) => { p.dating = true; } });

add({ id: "breakup", cooldown: 2, name: "이별", age: [20, 45], kind: "trait", base: 0.9,
  requires: p => p.dating && p.fired.love !== p.age,   // 연애 중일 때만. 시작한 해에 바로 끝나지는 않는다
  w: p => 0.5 + p.pheno.N / 100 + Math.max(0, 50 - p.pheno.A) / 50,
  effects: { N: +2, O: +1 }, text: p => "끝났다. 누가 먼저였는지는 중요하지 않았다.",
  onFire: (p, s) => { p.dating = false; } });

add({ id: "marriage", name: "결혼", age: [25, 42], kind: "fork", base: 1.0, once: true,
  requires: p => p.dating && p.fired.breakup !== p.age,   // 만나던 사람과. 이별한 해에 바로 결혼하지는 않는다
  w: p => 0.5 + p.pheno.A / 100 + p.pheno.C / 150 + (p.pheno.E > 50 ? 0.3 : 0) + (p.age - (p.fired.love || p.age)) * 0.15,  // 오래 만날수록
  effects: { N: -2, C: +2 }, text: p => "함께 살기로 했다.", onFire: (p, s) => { p.spouse = true; p.dating = false; } });

add({ id: "parent_sick", big: true, name: "부모의 병환", age: [25, 50], kind: "other", base: 1.2, once: true,
  effects: { N: +2, A: +1 }, text: p => "어머니가 쓰러졌다. 병원 복도에서 밤을 새웠다.",
  prayer: { prob: 0.85, text: p => `"어머니만은. 제 수명을 떼어서라도."`,
    grant: (p, s) => { p.motherAlive = true; s.note("어머니는 일어났다. 10년을 더 살았다."); s.cost("어머니에게 준 10년", 8); p.faithSeed += 10; },
    deny: (p, s) => { if (Math.random() < 0.55) { p.motherAlive = false; s.note("어머니는 봄을 넘기지 못했다."); s.adj(p, { N: +3, O: +2 }); } else { s.note("어머니는 반년을 앓다가 회복했다. 본인은 신이 들어줬다고 믿었다."); p.perceivedGrant = true; s.won(); } } } });

add({ id: "first_failure", name: "첫 실패", age: [24, 34], kind: "trait", base: 1.0, once: true,
  w: p => 0.5 + Math.max(0, 50 - p.pheno.C) / 40 + Math.max(0, p.pheno.O - 55) / 40,
  effects: { N: +2, C: +2, O: -1 }, wealth: -10, text: p => "벌인 일이 엎어졌다. 돈과 몇 명의 친구를 잃었다." });

add({ id: "windfall", cooldown: 8, name: "뜻밖의 행운", age: [20, 70], kind: "luck", base: 0.25,
  effects: { N: -2, O: +1 }, wealth: +25, text: p => "생각지도 않은 돈이 들어왔다." });

add({ id: "accident", big: true, cooldown: 6, name: "사고", age: [15, 80], kind: "luck", base: 0.35,
  effects: { N: +3 }, health: -15, text: p => "교차로였다. 상대가 신호를 못 봤다.",
  prayer: { prob: 0.7, text: p => `"다시 걷게 해주세요. 그것만."`,
    grant: (p, s) => { p.health += 15; s.note("재활은 길었지만 걸었다."); },
    deny: (p, s) => { if (Math.random() < 0.3) { p.health -= 10; s.note("완전히 돌아오진 않았다. 지팡이에 익숙해졌다."); s.adj(p, { O: +2, E: -2 }); } else { s.note("시간이 걸렸지만 걸었다. 의사 덕이라고 생각했다."); s.won(); } } } });

// ---------- 중년 (35-59) ----------
add({ id: "child_born", name: "자녀 출생", age: [26, 42], kind: "trait", base: 1.5, once: true,
  w: p => p.spouse ? 2 : 0.1,
  effects: { A: +3, N: +1, C: +2, O: -1 }, text: p => "작은 손이 손가락을 쥐었다. 세상의 무게가 바뀌었다.", onFire: (p, s) => { p.child = true; } });

add({ id: "child_sick", big: true, name: "자녀의 사고", age: [30, 55], kind: "other", base: 0.6, once: true,
  w: p => p.child ? 1 : 0,
  effects: { N: +4 }, text: p => "전화가 왔다. 병원 이름을 두 번 물었다.",
  prayer: { prob: 0.95, text: p => `"저를 데려가세요. 아이는 안 됩니다. 아이만은."`,
    grant: (p, s) => { s.note("아이는 살았다. 본인은 그날 이후 매일 기도했다."); p.faithSeed += 25; s.cost("아이에게 준 목숨", 12); s.later(5, "child_shadow"); },
    deny: (p, s) => { if (Math.random() < 0.3) { p.child = false; s.note("아이를 잃었다."); s.adj(p, { N: +6, E: -4, A: -2 }); p.faithSeed -= 30; } else { s.note("아이는 살았다. 본인은 신이 아니라 의사에게 절했다."); s.won(); } } } });

add({ id: "layoff", requires: p => !p.famous && !p.lawmaker, name: "해고", age: [38, 58], kind: "luck", base: 0.7, once: true,
  w: p => 1 + Math.max(0, 50 - p.pheno.C) / 50,
  effects: { N: +3, E: -1 }, wealth: -15, text: p => "회의실로 불려 갔다. 상자 하나에 20년이 들어갔다.",
  prayer: { prob: 0.5, text: p => `"다시 일하게 해주세요. 아이들이 아직 어립니다."`,
    grant: (p, s) => { p.wealth += 10; s.note("아는 사람의 아는 사람이 자리를 소개했다."); },
    deny: (p, s) => { s.adj(p, { O: +3, C: +1 }); s.note("1년을 쉬고 전혀 다른 일을 시작했다."); s.won(); } } });

add({ id: "betrayal", name: "배신", age: [30, 60], kind: "trait", base: 0.6, once: true,
  w: p => 0.3 + p.pheno.A / 60 + p.pheno.E / 150,
  effects: { A: -5, N: +2, O: -1 }, wealth: -10, text: p => "가장 믿던 사람이었다. 그래서 가능한 일이었다." });

add({ id: "health_warn", name: "건강 경고", age: [40, 65], kind: "trait", base: 0.9, once: true,
  w: p => 1 + Math.max(0, 60 - p.health) / 30 + p.pheno.N / 100,
  effects: { N: +2, C: +1 }, health: -8, text: p => "검진 결과지에 빨간 글씨가 늘었다." });

add({ id: "divorce", name: "이혼", age: [30, 60], kind: "trait", base: 0.5, once: true,
  w: p => p.spouse ? 0.5 + p.pheno.N / 80 + Math.max(0, 50 - p.pheno.A) / 40 : 0,
  effects: { N: +3, E: -2, O: +2 }, wealth: -15, text: p => "서류에 도장을 찍는 데 3분이 걸렸다.", onFire: (p, s) => { p.spouse = false; } });

add({ id: "midlife", name: "중년의 회의", age: [42, 55], kind: "trait", base: 0.8, once: true,
  w: p => 0.5 + p.pheno.O / 80 + p.pheno.N / 120,
  effects: { O: +3, N: +1 }, text: p => "여기까지 온 길이 내 길이었나. 밤에 자주 깼다.",
  prayer: { prob: 0.3, text: p => `"제가 뭘 바라는지라도 알게 해주세요."`,
    grant: (p, s) => { s.adj(p, { O: +3, N: -3 }); s.note("오래 미뤄둔 일을 시작했다."); },
    deny: (p, s) => { s.note("답은 없었다. 그냥 계속 살았다."); } } });

// ---------- 노년 (60+) ----------
add({ id: "retire", name: "은퇴", age: [58, 68], kind: "trait", base: 2.5, once: true,
  effects: { E: -2, N: -1, O: -1 }, text: p => "출근하지 않는 월요일은 생각보다 길었다." });

add({ id: "spouse_death", big: true, name: "배우자 사별", age: [60, 90], kind: "other", base: 0.9, once: true,
  w: p => p.spouse ? 1 + (p.age - 60) / 15 : 0,
  effects: { N: +4, E: -4, O: -2 }, text: p => "먼저 갔다. 식탁 맞은편이 비었다.", onFire: (p, s) => { p.spouse = false; },
  prayer: { prob: 0.6, text: p => `"하루만 더. 못한 말이 있습니다."`,
    grant: (p, s) => { s.note("하루를 더 받았다. 그 하루에 모든 말을 했다."); s.adj(p, { N: -3, A: +2 }); },
    deny: (p, s) => { s.note("말은 끝내 전하지 못했다."); s.adj(p, { N: +2 }); } } });

add({ id: "illness", cooldown: 2, name: "투병", age: [60, 95], kind: "luck", base: 1.0,
  w: p => 1 + Math.max(0, 50 - p.health) / 25 + Math.max(0, p.age - 70) / 10,
  effects: { N: +2, O: -1 }, health: -20, text: p => "입원이 길어졌다. 창밖 계절이 두 번 바뀌었다.",
  prayer: { prob: 0.5, text: p => `"고통 없이만 가게 해주세요."`,
    grant: (p, s) => { p.painless = true; s.note("통증이 거짓말처럼 가라앉았다."); },
    deny: (p, s) => { s.note("고통은 그대로였다. 그래도 매일 아침 눈을 떴다."); } } });

add({ id: "grandchild", name: "손주", age: [55, 80], kind: "trait", base: 1.0, once: true,
  w: p => p.child ? 1.5 : 0,
  effects: { A: +3, N: -2, E: +1 }, text: p => "아이의 아이가 품에 왔다. 손가락을 쥐는 힘이 똑같았다." });

add({ id: "regret", name: "후회", age: [65, 95], kind: "trait", base: 0.8, once: true,
  w: p => 0.5 + p.pheno.N / 80 + p.pheno.O / 100,
  effects: { O: +2, A: +1 }, text: p => "밤에 이름 하나가 자꾸 떠올랐다. 사과하기엔 늦은 이름." });

add({ id: "late_opening", name: "늦은 개안", age: [65, 90], kind: "trait", base: 0.4, once: true,
  w: p => 0.3 + p.pheno.O / 70,
  effects: { O: +4, N: -2 }, text: p => "일흔에 처음 배운 것이 가장 재미있었다." });

// ---------- 연예인 지망 (외모 90 이상) ----------
add({ id: "trainee_start", name: "연습생 제안", age: [14, 20], kind: "trait", base: 1.0, once: true,
  w: p => p.pheno.app >= 80 && p.pheno.O >= 50 ? 60 : 0,   // 외모 80 이상 + 개방성 50 이상이면 그 해 거의 확정적으로 발생
  text: p => "길에서 명함을 받았다. 기획사였다.",
  onFire: (p, s) => {
    if (Math.random() < 0.8) { p.trainee = true; p.traineeYears = 0; s.adj(p, { E: +2, N: +2, C: +1 }); s.note("연습생 생활이 시작됐다. 학교보다 연습실에서 보내는 시간이 길어졌다."); }
    else { s.note("명함은 서랍에 들어갔다. 꺼내지 않았다."); }
  } });

add({ id: "debut_eval", big: true, name: "데뷔 평가", age: [15, 28], kind: "fork", base: 4.0, cooldown: 1,
  w: p => p.trainee && !p.debuted ? 1 : 0,
  effects: { N: +2, C: +1 }, text: p => `연습생 ${++p.traineeYears}년 차. 월말 평가에 데뷔조 명단이 걸렸다.`,
  prayer: { prob: 0.8, text: p => `"이번엔 제 이름이 있게 해주세요. 딱 한 번만."`,
    grant: (p, s) => { if (Math.random() < 0.8) debut(p, s, "기도 덕인지 운인지, 명단에 이름이 있었다."); else { s.note("명단에 없었다. 신은 들어줬지만, 세상이 아직 자리를 내주지 않았다."); s.adj(p, { N: +2 }); } },
    deny: (p, s) => { if (Math.random() < 0.08) { debut(p, s, "스스로의 힘으로 명단에 올랐다."); s.won(); } else { s.note("명단에 없었다."); s.adj(p, { N: +1, C: +1 }); } } },
  fallback: (p, s) => { if (Math.random() < 0.08) { debut(p, s, "기도 없이, 명단에 올랐다."); s.quietWin(); } else s.note("명단에 없었다. 다음 달을 기다렸다."); } });

add({ id: "contract_end", name: "계약 종료", age: [20, 50], kind: "luck", base: 0.5, once: true,
  w: p => p.famous ? 0.6 + Math.max(0, p.age - 30) / 10 : 0,
  effects: { N: +3, E: -2, O: +2 }, wealth: -10, text: p => "재계약은 없었다. 알아보는 사람은 아직 있지만, 부르는 곳은 없다.",
  onFire: (p, s) => { p.famous = false; p.job = 1; } });

add({ id: "celeb_scandal", name: "스캔들", age: [18, 60], kind: "luck", base: 0.6, cooldown: 5,
  requires: p => p.famous,
  w: p => 1 + Math.max(0, 50 - p.pheno.C) / 30 + Math.max(0, p.pheno.N - 50) / 40 + Math.max(0, p.pheno.E - 60) / 40,
  effects: { N: +4, A: -2, E: -1 }, wealth: -15, text: p => "새벽에 기사가 떴다. 댓글은 사실보다 빨랐다. 광고가 하나씩 내려갔다.",
  prayer: { prob: 0.6, text: p => `"이것만 지나가게 해주세요. 사람들이 잊게만."`,
    grant: (p, s) => { s.note("다음 주에 더 큰 이름이 터졌다. 사람들은 옮겨 갔다. 광고는 돌아오지 않았지만 무대는 남았다."); s.adj(p, { C: -2 }); },
    deny: (p, s) => { if (Math.random() < 0.5) { p.famous = false; p.job = 1; s.note("활동을 중단했다. 사과문은 세 줄이었고, 복귀 기사는 없었다."); s.adj(p, { N: +3, E: -3 }); }
      else { s.note("버텼다. 팬이 반으로 줄었지만 남은 반은 더 단단해졌다."); s.adj(p, { C: +1, A: +1 }); s.won(); } } } });

function debut(p, s, why) {
  p.debuted = true; p.trainee = false; p.job = 2; p.wealth = clamp(p.wealth + 20);
  s.adj(p, { E: +3, N: +3, O: +2 }); s.note(`데뷔. ${why}`);
  s.later(3, "debut_after");
}

add({ id: "trainee_quit", name: "연습생 생활의 끝", age: [17, 30], kind: "trait", base: 2.0, once: true,
  w: p => p.trainee && !p.debuted && p.traineeYears >= 4 ? 1 + (p.traineeYears - 4) : 0,
  effects: { N: +3, O: +2, C: -1 }, text: p => "계약이 끝났다. 거울 앞에서 보낸 몇 년이 이력서 한 줄이 되지 못했다.",
  onFire: (p, s) => { p.trainee = false; } });

// ---------- 정신질환 (신경성 80 이상) ----------
add({ id: "mental_illness", big: true, name: "마음의 병", age: [14, 90], kind: "trait", base: 1.0, once: true,
  w: p => p.pheno.N >= 80 ? 2.5 + (p.pheno.N - 80) / 10 : 0,
  effects: { N: +3, E: -3, C: -3 }, health: -10, text: p => "아침에 일어날 이유를 찾는 데 오전이 다 갔다. 병원에서는 이름을 붙여주었다.",
  onFire: (p, s) => { p.illness = true; },
  prayer: { prob: 0.6, text: p => `"이 머릿속이 조용해지게만 해주세요."`,
    grant: (p, s) => { s.adj(p, { N: -10, E: +2 }); p.illness = false; s.note("어느 날부터 소음이 잦아들었다. 약 때문인지, 다른 무엇 때문인지는 모른다."); },
    deny: (p, s) => { if (p.pheno.C > 50 || Math.random() < 0.4) { s.note("치료를 시작했다. 느리고 지루한 길이었다."); s.later(2, "illness_treated", p.lastAnswerKind); }
      else { s.note("아무것도 하지 않았다. 더 깊이 가라앉았다."); s.adj(p, { N: +3, E: -2 }); p.health = clamp(p.health - 10); } } } });

add({ id: "illness_relapse", name: "재발", age: [14, 90], kind: "trait", base: 1.0, cooldown: 2,
  w: p => p.illness ? 1.5 : 0,
  effects: { N: +2, C: -2 }, health: -8, text: p => "괜찮아진 줄 알았다. 아니었다." });

// ---------- 특성이 부르는 사건 (추가분) ----------
add({ id: "immersion", name: "몰입", age: [22, 40], kind: "trait", base: 1.0, once: true,
  w: p => hi(p.pheno.O, 60) && hi(p.pheno.C, 55) ? 1.8 : 0.1,
  effects: { C: +2, E: -2 }, text: p => "한 가지에 몇 년을 걸기로 했다. 주말이 사라졌다.",
  onFire: (p, s) => s.later(4, "immersion_result") });

add({ id: "promotion", requires: p => !p.famous && !p.lawmaker, name: "승진", age: [34, 52], kind: "trait", base: 0.9, once: true,
  w: p => p.job > 0 ? 0.3 + Math.max(0, p.pheno.C - 50) / 20 + Math.max(0, p.pheno.E - 50) / 40 : 0,
  effects: { N: -2, C: +1, E: +1 }, wealth: +15, text: p => "책상이 창가로 옮겨졌다. 아래에 사람이 생겼다." });

add({ id: "stagnation", requires: p => !p.famous && !p.lawmaker, name: "정체", age: [38, 54], kind: "trait", base: 0.9, once: true,
  w: p => p.job > 0 && lo(p.pheno.C, 45) && !p.fired.promotion ? 1.6 : 0.05,
  effects: { N: +2, O: -2, E: -1 }, text: p => "같은 자리에 15년. 후배가 상사가 되는 걸 두 번 봤다." });

add({ id: "leadership", name: "앞에 서는 자리", age: [28, 50], kind: "trait", base: 0.7, once: true,
  w: p => hi(p.pheno.E, 65) && hi(p.pheno.C, 50) ? 1.5 : 0.05,
  effects: { E: +2, N: +2, C: +1 }, wealth: +10, text: p => "사람들이 자기를 따라오고 있다는 걸 어느 날 알았다. 잠이 줄었다." });

add({ id: "burnout", name: "번아웃", age: [27, 52], kind: "trait", base: 0.8, cooldown: 5,
  w: p => hi(p.pheno.C, 65) && hi(p.pheno.N, 58) ? 1.4 : 0,
  effects: { N: +3, C: -2, E: -2 }, health: -6, text: p => "열심히 하는 것 말고는 할 줄 아는 게 없었다. 그게 문제였다.",
  prayer: { prob: 0.4, text: p => `"조금만 쉬게 해주세요. 멈추는 법을 모르겠습니다."`,
    grant: (p, s) => { s.adj(p, { N: -4, C: -1 }); p.health = clamp(p.health + 6); s.note("병가가 나왔다. 처음으로 평일 낮의 동네를 걸었다."); },
    deny: (p, s) => { s.note("멈추지 못했다. 몸이 대신 멈췄다."); p.health = clamp(p.health - 8); s.adj(p, { N: +2 }); } } });

add({ id: "addiction", name: "중독", age: [20, 62], kind: "trait", base: 0.9, cooldown: 2,
  w: p => hi(p.pheno.N, 60) && lo(p.pheno.C, 45) ? 1.3 + (p.addictCount || 0) * 0.4 : 0,
  effects: { C: -3, N: +2, A: -1 }, health: -8, wealth: -10,
  text: p => (p.addictCount = (p.addictCount || 0) + 1) === 1 ? "처음엔 잠들기 위해서였다. 나중엔 깨어 있기 위해서였다." : `다시 손을 댔다. ${p.addictCount}번째.`,
  onFire: (p, s) => { p.addict = true; },
  prayer: { prob: 0.55, text: p => (p.addictCount || 1) === 1 ? `"이번만 끊게 해주세요."` : `"또 왔습니다. 염치없는 거 압니다. 이번만."`,
    grant: (p, s) => { p.addict = false; s.adj(p, { C: +4, N: -2 }); p.health = clamp(p.health + 5); s.note("끊었다. 매일 아침이 작은 승리였다."); },
    deny: (p, s) => { if (p.pheno.C > 40 || Math.random() < 0.3) { s.note("혼자 끊어보기로 했다. 세 번 실패하고 네 번째에 됐다."); s.later(2, "addiction_quit", p.lastAnswerKind); }
      else { s.note("끊지 못했다. 주변 사람이 하나씩 떠났다."); s.adj(p, { A: -3, E: -2 }); p.wealth = clamp(p.wealth - 10); } } } });

add({ id: "isolation", name: "고립", age: [45, 72], kind: "trait", base: 1.0, once: true,
  w: p => lo(p.pheno.E, 40) && lo(p.pheno.A, 40) ? 2.2 : 0.05,
  effects: { N: +2, O: -2 }, text: p => "전화기에 연락할 이름이 없다는 걸 알았다. 기도도 하지 않게 됐다.",
  onFire: (p, s) => { p.isolated = true; } });

add({ id: "late_bloom", name: "늦은 개화", age: [35, 58], kind: "trait", base: 1.2, once: true,
  w: p => p.geno.iq - p.pheno.iq >= 12 ? 2 : 0,
  effects: { O: +3, N: -2, C: +2 }, wealth: +5, text: p => "마흔 넘어 처음 배운 것이 이상하게 쉬웠다. 어릴 때 누가 가르쳐줬다면.",
  onFire: (p, s) => { p.pheno.iq = clamp(p.pheno.iq + 8); } });

add({ id: "generosity", name: "베풂", age: [30, 75], kind: "trait", base: 0.6, cooldown: 6,
  w: p => hi(p.pheno.A, 65) && p.wealth > 55 ? 1.5 : 0,
  effects: { A: +1, N: -2 }, wealth: -10, text: p => "가진 것의 일부를 모르는 사람에게 보냈다. 이름은 남기지 않았다." });

add({ id: "feud", name: "원한", age: [25, 65], kind: "trait", base: 0.6, once: true,
  w: p => lo(p.pheno.A, 35) && hi(p.pheno.N, 55) ? 1.5 : 0.05,
  effects: { A: -2, N: +2, C: +1 }, text: p => "누군가를 10년 동안 미워했다. 그 사람은 그 사실을 몰랐다." });

// ---------- 정치인 ----------
add({ id: "politics_entry", name: "정치 입문", age: [30, 52], kind: "trait", base: 0.8, once: true,
  requires: p => !p.lawmaker,
  w: p => p.pheno.E >= 70 && p.pheno.C >= 40 && p.pheno.A >= 40 && p.wealth >= 50 ? 1.6 + (p.famous ? 1 : 0) : 0,
  effects: { E: +2, N: +1, A: -1 }, text: p => "누군가 명함 대신 공천장을 내밀었다. 거절하지 않았다.",
  onFire: (p, s) => { p.politician = true; p.lost = 0; } });

add({ id: "election", name: "선거", age: [31, 70], kind: "fork", base: 4.0, cooldown: 4,
  requires: p => p.politician && !p.lawmaker,
  effects: { N: +3, E: +1 }, wealth: -10, text: p => "현수막을 걸고 새벽마다 지하철 입구에 섰다. 돈이 물처럼 나갔다.",
  prayer: { prob: 0.75, text: p => `"이번 선거만은. 이름 하나만 더 불리게 해주세요."`,
    grant: (p, s) => { if (Math.random() < 0.8) elected(p, s, "개표 자정, 역전이었다. 본인은 하늘이 도왔다고 했다."); else lostElection(p, s, "표는 모자랐다. 신이 들어줬는데도 세상이 자리를 내주지 않았다."); },
    deny: (p, s) => { if (Math.random() < 0.5) { elected(p, s, "근소한 차이로 이겼다. 조직이 움직였다."); s.won(); } else lostElection(p, s, "떨어졌다. 사무실 보증금도 날렸다."); } },
  fallback: (p, s) => { if (Math.random() < 0.5) { elected(p, s, "이겼다. 기도는 하지 않았다."); s.quietWin(); } else lostElection(p, s, "떨어졌다."); } });

function elected(p, s, why) {
  p.lawmaker = true; p.job = 2; p.wealth = clamp(p.wealth + 15); p.terms = 1;
  s.adj(p, { E: +2, N: +2, C: +1 }); s.note(`당선. ${why}`);
}
function lostElection(p, s, why) {
  p.lost = (p.lost || 0) + 1; p.wealth = clamp(p.wealth - 20);
  s.adj(p, { N: +3, A: -1 }); s.note(`낙선. ${why}`);
  if (p.lost >= 2) { p.politician = false; s.note("두 번째 낙선 뒤 정치를 접었다. 남은 건 빚과 악수하던 버릇뿐이었다."); s.adj(p, { O: +2, E: -2 }); }
}

add({ id: "reelection", name: "재선", age: [35, 75], kind: "fork", base: 4.0, cooldown: 4,
  requires: p => p.lawmaker && p.age - (p.fired.election || 0) >= 4,   // 당선 뒤 임기 4년을 채운 다음
  effects: { N: +2 }, text: p => `${p.terms}선 의원의 선거. 이번엔 지킬 것이 있었다.`,
  onFire: (p, s) => {
    if (Math.random() < 0.7) { p.terms++; p.wealth = clamp(p.wealth + 10); s.adj(p, { E: +1, A: -1 }); s.note(`${p.terms}선. 이름 앞의 수식어가 하나 더 늘었다.`); }
    else { p.lawmaker = false; p.politician = p.terms >= 2; p.wealth = clamp(p.wealth - 10); s.adj(p, { N: +4, E: -2, O: +2 }); s.note("낙선. 다음 날 아침, 전화가 한 통도 오지 않았다."); }
  } });

add({ id: "scandal", name: "스캔들", age: [35, 75], kind: "luck", base: 0.6, cooldown: 6,
  requires: p => p.lawmaker,
  w: p => 1 + Math.max(0, 50 - p.pheno.C) / 30 + Math.max(0, 50 - p.pheno.A) / 40,
  effects: { N: +4, A: -2 }, wealth: -15, text: p => "기사가 났다. 사실인 부분과 아닌 부분이 섞여 있었고, 아무도 구분하려 하지 않았다.",
  prayer: { prob: 0.6, text: p => `"이것만 덮이게 해주세요. 다음부터는 깨끗하게 살겠습니다."`,
    grant: (p, s) => { s.note("다음 주에 더 큰 기사가 다른 사람 이름으로 났다. 사람들은 잊었다."); s.adj(p, { C: -2 }); },
    deny: (p, s) => { if (Math.random() < 0.5) { p.lawmaker = false; p.politician = false; p.job = 1; s.note("사퇴했다. 카메라 앞에서 고개를 숙이는 데 4초가 걸렸다."); s.adj(p, { N: +3, E: -3 }); } else { s.note("버텼다. 지지율은 반 토막이 났지만 자리는 지켰다."); s.adj(p, { C: +1 }); s.won(); } } } });

// ---------- 조용한 해 (언제나 후보) ----------
add({ id: "quiet", name: "평범한 한 해", age: [0, 120], kind: "quiet", base: 3.5,
  w: p => 1 + p.pheno.C / 100,
  effects: { N: -0.5 }, text: null });

// 신앙 사건: 기도 결과에 대한 해석. 시뮬레이터가 직접 처리하므로 테이블에는 없음.
