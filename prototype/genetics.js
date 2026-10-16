// ---------- 설정 ----------
const H = { app: 0.85, iq: 0.60, per: 0.45 };   // 유전 비중
const ENV_SHARE = { app: 0.10, iq: 0.30, per: 0.40 }; // 환경 비중 (나머지는 운)
let BIG_MUT = 0.15;

const TRAITS = {
  app: [["face","얼굴"],["height","키"],["build","체격"]],
  iq:  [["iq","지능"]],
  per: [["E","외향성"],["C","성실성"],["O","개방성"],["A","친화성"],["N","신경성"]],
};

const SURN = "김이박최정강조윤장임한오서신권황안송류전홍".split("");
const GIVEN_M = ["민준","서준","도윤","예준","시우","하준","지호","준서","건우","현우","우진","선우","태양","정우","승현"];
const GIVEN_F = ["서연","서윤","지우","하은","민서","지아","수아","하윤","지유","채원","유나","은서","예린","다은","소율"];

// ---------- 난수 ----------
function randn() { // 표준정규
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const pick = a => a[Math.floor(Math.random() * a.length)];
const POP_SD = 16;  // 인구 표준편차. 부모 생성과 분리 분산의 기준
const SD_OF = k => k === "face" ? 22 : POP_SD;  // 얼굴만 분포를 넓게: 외모는 양 끝이 더 눈에 띄는 특성
const norm = (m = 50, sd = POP_SD) => clamp(Math.round(m + randn() * sd));
// 외모 대표값: 얼굴이 주, 키·체격은 보조 (세 값을 평균 내면 분산이 줄어들어 쓰지 않음)
const appScore = t => t.face;  // 대표값은 얼굴. 키·체격은 별도 특성으로만 남김

// ---------- 부모 ----------
function makeParent(sex) {
  const p = { sex, name: pick(SURN) + pick(sex === "M" ? GIVEN_M : GIVEN_F), geno: {}, mut: {} };
  for (const g in TRAITS) for (const [k] of TRAITS[g]) p.geno[k] = norm(50, SD_OF(k));
  p.age = 22 + Math.floor(Math.random() * 18);
  p.wealth = norm(50, 20);        // 가정 재산 (환경 요소)
  p.edu = clamp(Math.round(p.geno.iq * 0.6 + p.wealth * 0.3 + randn() * 10)); // 학력
  return p;
}

// 양육 환경 품질: 부모 성격·재산·학력에서 유도
function homeEnv(m, f) {
  const warmth = (m.geno.A + f.geno.A) / 2 - (m.geno.N + f.geno.N) / 2 * 0.5 + 25;
  const structure = (m.geno.C + f.geno.C) / 2;
  const stimulus = (m.edu + f.edu) / 2 * 0.6 + (m.geno.O + f.geno.O) / 2 * 0.4;
  const wealth = (m.wealth + f.wealth) / 2;
  const stability = clamp(50 + (wealth - 50) * 0.5 - (Math.abs(m.geno.N - 50) + Math.abs(f.geno.N - 50)) * 0.2 + randn() * 8);
  return {
    warmth: clamp(Math.round(warmth)), structure: Math.round(structure),
    stimulus: clamp(Math.round(stimulus)), wealth: Math.round(wealth), stability: Math.round(stability),
  };
}

// ---------- 아이 ----------
function makeChild(m, f, homeAdj) {   // homeAdj: {stability, wealth} 같은 가정환경 보정 (통의 유산)
  const sex = Math.random() < 0.5 ? "M" : "F";
  const c = { sex, name: f.name[0] + pick(sex === "M" ? GIVEN_M : GIVEN_F), geno: {}, pheno: {}, mut: {}, env: {}, luck: {} };
  const home = homeEnv(m, f);
  if (homeAdj) for (const k in homeAdj) home[k] = clamp(home[k] + homeAdj[k]);

  for (const g in TRAITS) {
    const h = H[g], e = ENV_SHARE[g], l = 1 - h - e;
    for (const [k] of TRAITS[g]) {
      // 유전형: 부모 평균 + 분리 분산(멘델 추첨). 부모 평균만 쓰면 세대마다 분산이 절반으로 줄어듦.
      // 분리 분산의 표준편차를 인구 표준편차의 약 0.71배로 두면 인구 분산이 세대를 거쳐도 유지됨.
      const mid = (m.geno[k] + f.geno[k]) / 2;
      let noise = randn() * SD_OF(k) * 0.71;
      if (Math.random() < BIG_MUT) { noise = randn() * SD_OF(k) * 2; c.mut[k] = true; }
      c.geno[k] = clamp(Math.round(mid + noise));

      // 환경값: 특성군마다 가정환경의 다른 면이 작용 (0-100, 50이 보통)
      let envVal;
      if (g === "iq") envVal = home.stimulus * 0.6 + home.stability * 0.4;
      else if (g === "app") envVal = home.wealth * 0.5 + home.stability * 0.5; // 영양·관리
      else envVal = envPersonality(k, home);
      c.env[k] = Math.round(envVal);

      // 표현형 = 유전형 + 환경 편차 + 운 편차.
      // 절대값을 가중 평균하면 모두 50으로 수렴하므로, 유전형을 닻으로 두고 편차만 더한다.
      // 환경·운의 크기는 분산 비중(e, l)에 맞춰 인구 표준편차에 비례해 정한다.
      const envZ = Math.max(-2, Math.min(2, (envVal - 50) / 12));
      const luckZ = randn();
      c.luck[k] = Math.round(50 + luckZ * 20);
      const envPts = envZ * SD_OF(k) * Math.sqrt(e);
      const luckPts = luckZ * SD_OF(k) * Math.sqrt(l);
      c.pheno[k] = clamp(Math.round(c.geno[k] + envPts + luckPts));
    }
  }
  c.home = home;
  return c;
}

// 성격 축별로 양육 환경이 미는 방향
function envPersonality(k, h) {
  switch (k) {
    case "E": return h.warmth * 0.5 + h.stability * 0.5;
    case "C": return h.structure * 0.7 + h.stability * 0.3;
    case "O": return h.stimulus * 0.8 + h.warmth * 0.2;
    case "A": return h.warmth * 0.8 + h.stability * 0.2;
    case "N": return 100 - (h.warmth * 0.5 + h.stability * 0.5); // 따뜻하고 안정적일수록 낮음
  }
}

// ---------- 서술 ----------
function describe(c) {
  const p = c.pheno, g = c.geno, out = [];
  const lv = (v, lo, mid, hi) => v < 35 ? lo : v > 65 ? hi : mid;
  out.push(lv(p.iq, "배움이 더딘 편", "보통의 머리", "눈에 띄게 영리함"));
  out.push(lv(p.E, "조용하고 혼자 있길 좋아함", "", "사람을 끌어모으는 성격"));
  out.push(lv(p.C, "계획보다 충동", "", "맡은 일은 끝까지"));
  out.push(lv(p.A, "날이 서 있음", "", "다정하고 잘 믿음"));
  out.push(lv(p.N, "잘 흔들리지 않음", "", "걱정이 많고 예민함"));
  out.push(lv(p.O, "익숙한 것을 선호", "", "낯선 것에 끌림"));
  const gap = p.iq - g.iq;
  if (gap <= -10) out.push("⚠ 지능 잠재력에 비해 환경이 발목을 잡고 있음");
  if (gap >= 10) out.push("✦ 타고난 것 이상으로 자라날 환경");
  if (Object.keys(c.mut).length) out.push("돌연변이: " + Object.keys(c.mut).map(k => label(k)).join(", "));
  return out.filter(Boolean);
}
function label(k) { for (const g in TRAITS) for (const [kk, l] of TRAITS[g]) if (kk === k) return l; return k; }

// 기도 성향: 성격에서 유도 (기도 시스템 연결용 미리보기)
function prayerStyle(c) {
  const p = c.pheno;
  const freq = clamp(Math.round(30 + (p.N - 50) * 0.8 - (p.C - 50) * 0.4));
  const type = p.A > 60 ? "남을 위한 기도가 많음" : p.N > 60 ? "불안을 덜어달라는 기도" : p.C > 60 ? "거의 기도하지 않음, 하면 절박함" : "자기 바람 위주";
  return { freq, type };
}

