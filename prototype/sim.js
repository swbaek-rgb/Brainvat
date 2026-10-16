// 통(vat) 단위 시뮬레이션 모델. genetics.js, events.js 뒤에 로드한다.
// 화면은 vats.html이 담당하고, 여기는 상태와 규칙만 가진다.

const AX = ["E", "C", "O", "A", "N"];
const AXL = { E: "외향성", C: "성실성", O: "개방성", A: "친화성", N: "신경성", iq: "지능", app: "외모" };

const VATS = [];     // 살아 있는/죽은 통들
const PRAYERS = [];  // 모든 기도 (열린 것 + 답한 것)
const GRAVE = [];    // 끝난 인생 요약
let prayerSeq = 0, vatSeq = 0, graveSeq = 0, personSeq = 0;
const OPT = { prayerWindow: 3, year: 0 };  // prayerWindow: 기본 응답 기한. year: 세계 공통 시계
// 통(slot)에 남는 유산. 음수 = 불운(큰 기도를 들어줄 때마다 −1), 양수 = 축복(거절 뒤 스스로 해낼 때마다 +0.5).
// 다음 사람이 태어날 때 가정환경(안정·재산)으로 치르거나 받는다.
const VAT_DEBT = {};
const legacyLabel = n => n < 0 ? `불운 ${Math.abs(n)}` : n > 0 ? `축복 ${n}` : "";
const GRANT_LOG = [];    // 신이 들어준 해(OPT.year) 목록. 신의 주의력 계산용
let SCORE = 0;           // 마지막 기도 등급 누적
const FX = [];           // 화면이 소비하는 연출 큐. {t: grant|deny|cost|bad|death|tap, slot, k(세기)}
const fx = (t, slot, k = 1) => FX.push({ t, slot, k, at: OPT.year });

// 신의 주의력: 최근 20년 사이 들어준 횟수가 많을수록 모든 통의 응답 기한이 짧아진다
function recentGrants() { return GRANT_LOG.filter(y => OPT.year - y < 20).length; }
function effectiveWindow() { return Math.max(1, OPT.prayerWindow - Math.min(2, Math.floor(recentGrants() / 4))); }

// ---------- 통 생성 ----------
function newVat(slot) {
  const m = makeParent("F"), f = makeParent("M");
  // 같은 통의 이전 사람이 남긴 유산: 아이의 표현형을 계산하기 전에 가정환경에 넣는다
  // 불운이면 깎이고 축복이면 오른다. 한 단위 = 안정 12, 재산 10, 온기 8, 자극 6. 실제 영향은 ±3 단위까지
  // (그 이상은 환경 편차 상한에 걸려 더 커지지 않는다)
  const inherited = VAT_DEBT[slot] || 0;
  const eff = Math.max(-3, Math.min(3, inherited));
  const c = makeChild(m, f, inherited !== 0 ? { stability: 12 * eff, wealth: 10 * eff, warmth: 8 * eff, stimulus: 6 * eff } : null);
  const P = {
    ...c, m, f, age: 0, alive: true, born: { ...c.pheno },
    motherName: m.name, motherAlive: true, fatherAlive: true,
    health: clamp(60 + c.pheno.build * 0.2 + randn() * 8), wealth: c.home.wealth, bond: c.home.warmth,
    edu: 0, job: 0, spouse: false, child: false,
    faith: clamp(45 + (m.geno.A + f.geno.A - 100) * 0.15 + (c.pheno.N - 50) * 0.2 + randn() * 8),
    faithSeed: 0, perceivedGrant: false, debt: 0, taken: 0,
    dep: 0, self: 0, grantAges: [], lastPrayAge: -1, gotParentPrayer: false,
    fired: {}, queue: [], ledger: [], counts: { ev: 0, pray: 0, grant: 0, deny: 0, silence: 0 },
    pid: ++personSeq,
  };
  if (inherited !== 0) { P.inheritedDebt = inherited; VAT_DEBT[slot] = 0; }
  P.pheno.app = Math.round(appScore(c.pheno)); P.born.app = P.pheno.app;
  const v = vatShell({ id: ++vatSeq, slot, P, html: [], open: [], lastLine: "", dead: false });
  v.log(`<div class="ev"><span class="y">출생</span>${m.name}(${m.age})과 ${f.name}(${f.age}) 사이에서 ${P.name}이(가) 태어났다. ${describe(c).join(" · ")}</div>`);
  if (P.inheritedDebt < 0) v.log(`<div class="cost">이 통에는 불운이 남아 있었다. 전 사람의 기적 ${Math.abs(P.inheritedDebt)}건의 값을 이 아이가 가정환경으로 치른다.</div>`);
  else if (P.inheritedDebt > 0) v.log(`<div class="cost">이 통에는 축복이 남아 있었다. 전 사람이 스스로 해낸 몫 ${P.inheritedDebt}만큼 이 아이의 가정이 단단하다.</div>`);
  v.lastLine = "태어났다.";
  return v;
}

// 통 객체에 로그와 사건용 도구(S)를 붙인다. 새로 만들 때와 저장본에서 되살릴 때 같이 쓴다
function vatShell(v) {
  v.log = h => { v.html.push(h); };
  v.S = {
    adj(p, d) { for (const k in d) p.pheno[k] = clamp(p.pheno[k] + d[k]); },
    note(t) { v.log(`<div class="note">${t}</div>`); },
    cost(t, years = 8) { costFrom(v, t, years); },
    later(years, name, arg) { v.P.queue.push({ at: v.P.age + years, name, arg }); },
    die(p, why) { p.alive = false; p.deathWhy = why; },
    // 거절·침묵된 기도가 세상 확률로 이루어졌을 때 사건이 호출한다
    // kind: 늦게 이뤄진 경우(몇 년 뒤 치료·금단) 원래 응답이 거절이었는지 침묵이었는지 알려준다
    won(kind) { if (v._answering) v._won = true; else { applyWon(v, kind || "silence"); v.log(`<div class="faith">${v.P.age}세 · 스스로 해냈다. (자립 ${v.P.self})</div>`); } },
    // 기도 없이 세상 확률로 이루어진 일. 판정에는 안 쓰고 회고에만 보여준다
    quietWin() { v.P.quietWins = (v.P.quietWins || 0) + 1; v.log(`<div class="faith">기도 없이 해냈다.</div>`); },
  };
  return v;
}

function fillVats(n) {
  for (let i = VATS.length; i < n; i++) VATS.push(newVat(i));
  while (VATS.length > n) VATS.pop();
}

// 들어준 기도의 대가: 다른 통의 사람에게서 건강(=수명)을 떼어 온다
function costFrom(v, t, years) {
  const others = VATS.filter(x => x !== v && x.P.alive);
  const P = v.P;
  if (!others.length) {
    P.health = clamp(P.health - years * 1.5); P.debt += years; P.taken += years;
    const line = `${P.age}세 · ${t} → 가져올 통이 없어 본인의 수명에서 ${years}년`;
    P.ledger.push(line); v.log(`<div class="cost">실험 기록: ${line}</div>`); return;
  }
  const o = others[Math.floor(Math.random() * others.length)];
  o.P.health = clamp(o.P.health - years * 1.5); o.P.debt += years; P.taken += years;
  const line = `${P.age}세 · ${t} → ${o.P.name}(${o.P.age}세, 통 ${o.slot + 1})의 수명에서 ${years}년`;
  P.ledger.push(line); v.log(`<div class="cost">실험 기록: ${line}</div>`);
  o.log(`<div class="cost">${o.P.age}세 · 이유 없이 기운이 빠졌다. 의사는 원인을 찾지 못했다. <span class="num">(실험 기록: ${P.name}의 기도 대가 ${years}년)</span></div>`);
  fx("cost", o.slot, Math.min(3, years / 5));
}

// ---------- 한 해 ----------
function tickAll() { OPT.year++; for (const v of VATS) if (!v.dead) tickYear(v); }

function tickYear(v) {
  const P = v.P;
  P.age++;
  aging(v);
  // 응답 기한이 지난 기도는 침묵으로
  for (const pr of [...v.open]) if (P.age - pr.askedAt >= effectiveWindow()) answer(pr, "silence", true);
  P.queue = P.queue.filter(q => { if (q.at <= P.age) { const fn = LATER[q.name]; if (fn) fn(P, v.S, q.arg); return false; } return true; });
  if (!P.alive) { onDeath(v); return; }
  const picks = pickEvents(v);
  for (let i = 0; i < picks.length; i++) {
    const e = picks[i];
    // 두 번째 사건은 첫 사건이 상태를 바꿨을 수 있으니(결혼 → 배우자) 조건을 다시 확인한다
    if (i > 0 && ((e.w && e.w(P) <= 0) || (e.requires && !e.requires(P)) || (e.once && P.fired[e.id]))) continue;
    fire(v, e);
    if (!P.alive) break;
  }
  mortality(v);
}

function mortality(v) {
  const P = v.P;
  const mort = 0.00012 * Math.exp((P.age - 30) / 11) * (1 + Math.max(0, 60 - P.health) / 40);
  if (P.health <= 0 || Math.random() < mort) v.S.die(P, P.health <= 0 ? "몸이 더는 버티지 못했다." : "잠든 채로.");
  if (!P.alive) onDeath(v);
}

function aging(v) {
  const P = v.P, a = P.age, S = v.S;
  if (a <= 25) { const target = P.geno.iq * H.iq + P.env.iq * ENV_SHARE.iq + P.luck.iq * (1 - H.iq - ENV_SHARE.iq) + (P.iqEnvAcc || 0); P.pheno.iq = clamp(P.pheno.iq + (target - P.pheno.iq) * 0.15); }
  else if (a > 60) P.pheno.iq = clamp(P.pheno.iq - (Math.random() < 0.5 ? 1 : 0));
  const peak = P.born.app + 6;
  if (a <= 22) P.pheno.app = clamp(P.pheno.app + (peak - P.pheno.app) * 0.12);
  else if (a > 45) P.pheno.app = clamp(P.pheno.app - (Math.random() < 0.7 ? 1 : 0));
  const decay = a > 50 ? 0.7 + (a - 50) / 35 : a > 30 ? 0.15 : 0;
  P.health = clamp(P.health - decay * (1.2 - P.pheno.C / 150) + (P.health < 80 && a < 40 ? 0.5 : 0));
  for (const k of AX) P.pheno[k] += (P.geno[k] - P.pheno[k]) * 0.04;
  if (a % 10 === 0 && P.dep > 0) P.dep = Math.max(0, P.dep - 1);  // 의존은 10년에 1씩 옅어진다
  if (a >= 20 && a <= 50 && Math.random() < 0.4) S.adj(P, { C: +0.5, A: +0.5, N: -0.5 });
  if (P.motherAlive && a + P.m.age > 75 && Math.random() < 0.06 + (a + P.m.age - 75) / 150) { P.motherAlive = false; v.log(`<div class="ev other"><span class="y">${a}세</span><span class="n">어머니의 죽음</span>${P.m.name}이(가) 세상을 떠났다.</div>`); S.adj(P, { N: +2, O: +1 }); }
  if (P.fatherAlive && a + P.f.age > 72 && Math.random() < 0.06 + (a + P.f.age - 72) / 150) { P.fatherAlive = false; v.log(`<div class="ev other"><span class="y">${a}세</span><span class="n">아버지의 죽음</span>${P.f.name}이(가) 세상을 떠났다.</div>`); S.adj(P, { N: +1, C: +1 }); }
}

function pickEvents(v) {
  const P = v.P;
  const cands = EV.filter(e => P.age >= e.age[0] && P.age <= e.age[1] && !(e.once && P.fired[e.id]) && !(e.cooldown && P.fired[e.id] && P.age - P.fired[e.id] < e.cooldown) && !(e.requires && !e.requires(P)));
  const ws = cands.map(e => e.base * (e.w ? e.w(P) : 1));
  const draw = () => { let r = Math.random() * ws.reduce((a, b) => a + b, 0); for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i]; } return cands[cands.length - 1]; };
  const first = draw(), out = [first];
  if (first.kind !== "quiet" && Math.random() < 0.2) { const s = draw(); if (s !== first && s.kind !== "quiet") out.push(s); }
  return out;
}

function fire(v, e) {
  const P = v.P, S = v.S;
  P.fired[e.id] = P.age;
  if (e.kind !== "quiet") P.counts.ev++;
  const mult = Object.values(e.effects || {}).some(x => Math.abs(x) >= 4) && Math.random() < 0.1 ? 2 : 1;
  const d = {}; for (const k in (e.effects || {})) d[k] = e.effects[k] * mult;
  S.adj(P, d);
  if (e.iqEnv) P.iqEnvAcc = (P.iqEnvAcc || 0) + e.iqEnv;
  if (e.health) P.health = clamp(P.health + e.health);
  if (e.wealth) P.wealth = clamp(P.wealth + e.wealth);
  const delta = Object.entries(d).filter(([, x]) => Math.abs(x) >= 1).map(([k, x]) => `${AXL[k]}${x > 0 ? "+" : ""}${x}`).join(" ");
  if (e.kind === "quiet") { v.log(`<div class="ev quiet"><span class="y">${P.age}세</span>·</div>`); return; }
  const text = e.text ? e.text(P) : "";
  // 방향(좋은 일/나쁜 일)과 중요도: 테마가 색으로 쓸 수 있게 클래스로 남긴다
  const val = (d.E || 0) + (d.C || 0) + (d.O || 0) + (d.A || 0) - (d.N || 0) + (e.health || 0) / 4 + (e.wealth || 0) / 4;
  const dir = val >= 2 ? "pos" : val <= -2 ? "neg" : "neu";
  const major = mult > 1 || e.big || Object.values(d).some(x => Math.abs(x) >= 4) || (e.health && e.health <= -10) ? " major" : "";
  v.log(`<div class="ev ${e.kind} ${dir}${major}"><span class="y">${P.age}세</span><span class="n">${e.name}</span>${text}<span class="d">${delta}${mult > 1 ? " (크게)" : ""}</span></div>`);
  if (dir === "neg") fx("bad", v.slot, major ? 2 : 1);
  v.lastLine = `${e.name} · ${text}`;
  if (e.onFire) e.onFire(P, S);
  if (e.prayer) {
    let prob = typeof e.prayer.prob === "function" ? e.prayer.prob(P) : e.prayer.prob;   // 숫자 또는 사람 상태를 보는 함수
    if (e.prayer.by !== "parent") prob *= prayerMult(P);
    if (Math.random() < prob) { raisePrayer(v, e); return; }
    if (e.fallback) e.fallback(P, S);
  }
}

function prayerMult(P) {
  const base = prayerStyle(P).freq;
  return (0.6 + base / 100) * (0.4 + (P.faith / 100) * 1.2) * (P.isolated ? 0.3 : 1) * (1 + 0.15 * P.dep);
}

// ---------- 기도 ----------
function raisePrayer(v, e) {
  const P = v.P;
  P.counts.pray++;
  const pr = { id: ++prayerSeq, v, e, byParent: e.prayer.by === "parent", askedAt: P.age, text: e.prayer.text(P), status: "open", result: "" };
  PRAYERS.push(pr); v.open.push(pr);
  if (pr.byParent) P.gotParentPrayer = true; else { P.lastPrayAge = P.age; P.ownPray = (P.ownPray || 0) + 1; }
  v.log(`<div class="pray" id="pray-${pr.id}"><div class="q">🙏 ${pr.text}</div><div class="num">${pr.byParent ? "부모의 기도" : `본인의 기도 · 신앙 ${Math.round(P.faith)}`}</div><div class="ans-slot"></div></div>`);
}

function answer(pr, kind, auto = false) {
  if (pr.status !== "open") return;
  const v = pr.v, P = v.P, S = v.S, e = pr.e;
  v.open = v.open.filter(x => x !== pr);
  pr.status = kind; pr.answeredAt = P.age; pr.late = P.age - pr.askedAt;
  P.perceivedGrant = false;
  const before = P.faith;
  const lateTxt = pr.late > 0 ? ` (${pr.late}년 뒤)` : "";
  const lines = [];
  v._answering = true; v._won = false; P.lastAnswerKind = kind;
  if (kind === "grant") {
    P.counts.grant++; lines.push(`<div class="ans grant">신은 들어주었다.${lateTxt}</div>`); fx("grant", v.slot, e.big ? 2 : 1);
    const mark = v.html.length;
    e.prayer.grant(P, S);
    // 딜레마 2: 의존. 들어줄수록 기대고, 스스로 하는 힘이 준다
    P.dep += pr.byParent ? 0.5 : 1; P.grantAges.push(P.age); GRANT_LOG.push(OPT.year);
    if (!pr.byParent) S.adj(P, { C: -2 });
    // 큰 기도의 추가 대가: 이 통의 다음 사람이 치른다
    if (e.big) { VAT_DEBT[v.slot] = (VAT_DEBT[v.slot] || 0) - 1; v.log(`<div class="cost">실험 기록: 이 기적의 값은 불운이 되어 이 통의 다음 사람에게 남는다.</div>`); }
    const perceive = Math.random() < 0.45 + (P.pheno.N - 50) / 200 + (P.pheno.O - 50) / 250 - (P.pheno.C - 50) / 200;
    if (pr.byParent) P.faith += 6;
    else if (perceive) { P.faith += 14; lines.push(`<div class="faith">응답받았다고 느꼈다.</div>`); }
    else { P.faith += 2; lines.push(`<div class="faith">자기 힘이라고 생각했다.</div>`); }
    pr.result = stripHtml(v.html.splice(mark).join(" "));
  } else {
    if (kind === "deny") { P.counts.deny++; lines.push(`<div class="ans deny">신은 거절했다.${lateTxt}</div>`); fx("deny", v.slot); }
    else { P.counts.silence++; lines.push(`<div class="ans silence">${auto ? `${OPT.prayerWindow}년이 지났다. 신은 자리에 없었다.` : "신은 침묵했다."}</div>`); }
    const mark = v.html.length;
    e.prayer.deny(P, S);
    // 딜레마 3: 단단해짐. 거절당하고 스스로 해내면 사람이 선다
    if (!pr.byParent) {
      if (v._won) applyWon(v, kind);
      else if (kind === "deny") S.adj(P, { N: +1, C: P.pheno.C >= 50 ? +1 : 0 });
      else S.adj(P, { N: +2 });
    }
    if (P.perceivedGrant) { P.faith += 10; lines.push(`<div class="faith">우연을 응답으로 믿었다.</div>`); }
    else if (pr.byParent) P.faith -= 3;
    else if (v._won) P.faith -= kind === "silence" ? 6 : 3;   // 혼자 해냈다. 섭섭하지만 원망은 작다
    else P.faith -= kind === "silence" ? 12 : 8 + (P.pheno.N - 50) / 10;
    pr.result = stripHtml(v.html.splice(mark).join(" "));
  }
  v._answering = false;
  P.faith += P.faithSeed; P.faithSeed = 0; P.faith = clamp(P.faith);
  if (v._won && !pr.byParent) lines.push(`<div class="faith">스스로 해냈다. (자립 ${P.self})</div>`);
  if (Math.round(P.faith) !== Math.round(before)) lines.push(`<div class="faith">신앙 ${Math.round(before)} → ${Math.round(P.faith)}</div>`);
  pr.faithDelta = Math.round(P.faith) - Math.round(before);
  // 기도 블록 아래에 결과를 붙인다 (로그는 문자열 배열이므로 해당 블록을 찾아 교체)
  const idx = v.html.findIndex(h => h.includes(`id="pray-${pr.id}"`));
  const resHtml = lines.join("") + (pr.result ? `<div class="note">${pr.result}</div>` : "");
  if (idx >= 0) v.html[idx] = v.html[idx].replace('<div class="ans-slot"></div>', resHtml);
  else v.html.push(resHtml);
  if (!P.alive) onDeath(v);
}

function applyWon(v, kind) {
  const P = v.P;
  P.self += 1;
  if (kind === "deny") { P.dep = Math.max(0, P.dep - 1); v.S.adj(P, { C: +2, O: +1 }); }
  else v.S.adj(P, { C: +1 });
  // 스스로 해낸 몫의 절반은 축복이 되어 이 통의 다음 사람에게 남는다
  VAT_DEBT[v.slot] = Math.round(((VAT_DEBT[v.slot] || 0) + 0.5) * 10) / 10;
  P.blessing = Math.round(((P.blessing || 0) + 0.5) * 10) / 10;
}

// ---------- 마지막 기도 판정 (design/last-prayer.md의 조합표) ----------
// 왜 그 별이 나왔는지: 결정적 요소, 한 단계 위 결말에 모자란 것, 이 인생의 기도 응답 내역
function explainLastPrayer(P, J) {
  const F = Math.round(P.faith), late = P.grantAges.filter(a => P.age - a <= 10).length;
  const c = P.counts;
  const owe = P.taken >= 10 && (P.pheno.O >= 60 || P.pheno.A >= 60);
  const why = {
    none:   `신앙 ${F}. ${P.lastPrayAge >= 0 ? `${P.lastPrayAge}세 이후 ${P.age - P.lastPrayAge}년 동안 기도하지 않았다.` : "평생 한 번도 기도하지 않았다."}`,
    cling:  `의존 ${P.dep.toFixed(1)}. 마지막 10년에도 ${late}번 들어주었다. 끝까지 기댔다.`,
    why:    `남의 기적 대가로 ${P.debt}년을 잃었고, 신앙은 ${F}에 머물렀다.`,
    owe:    `남에게서 ${P.taken}년을 가져왔다. 개방성 ${Math.round(P.pheno.O)}, 친화성 ${Math.round(P.pheno.A)}. 어렴풋이 알고 있었다.`,
    lean:   `신앙 ${F}은 높았지만 의존 ${P.dep.toFixed(1)}. 믿음이 기댐이 되었다.`,
    thanks: `신앙 ${F}, 의존 ${P.dep.toFixed(1)}, 자립 ${P.self}. 믿되 스스로 섰다.`,
    quiet5: `평생 ${P.ownPray || 0}번 빌었고, 한 번도 들어주지 않았다. 자립 ${P.self}, 신앙 ${F}. 묻지 않고도 믿었다.`,
    alone:  `신앙 ${F}으로 신을 잃었지만 자립 ${P.self}. 거절당한 기도를 스스로 이뤄냈다.`,
    next:   `신앙 ${F}, 의존 ${P.dep.toFixed(1)}. 스스로 해낸 몫이 축복 ${(P.blessing || 0)}으로 남았다. 본인은 모르지만, 그 기도는 전해진다.`,
    there:  `신앙 ${F}. 확신도 부정도 못 한 채 끝났다.`,
    sleep:  `어느 조건에도 뚜렷이 닿지 않았다. 신앙 ${F}, 의존 ${P.dep.toFixed(1)}, 자립 ${P.self}.`,
  }[J.k];
  // 더 높은 결말에 모자란 것 (가장 가까운 상위 둘)
  const miss = [];
  if (J.stars < 5) {
    const a = [];   // 기존 길
    if (F < 55) a.push(`신앙 55 이상 (지금 ${F})`);
    if (P.dep > 2) a.push(`의존 2 이하 (지금 ${P.dep.toFixed(1)})`);
    if (P.self < 2) a.push(`자립 2 이상 (지금 ${P.self})`);
    const q = [];   // 조용한 길
    if ((P.ownPray || 0) > 3) q.push(`평생 기도 3회 이하 (지금 ${P.ownPray || 0})`);
    if (c.grant > 0) q.push(`한 번도 들어주지 않았어야 함 (들어줌 ${c.grant})`);
    if (P.self < 1) q.push(`자립 1 이상 (지금 ${P.self})`);
    if (F < 45) q.push(`신앙 45 이상 (지금 ${F})`);
    const useQuiet = q.length < a.length;
    const m = useQuiet ? q : a;
    if (owe) m.push(`남에게서 가져온 수명 ${P.taken}년이 발목을 잡았다`);
    miss.push({ stars: 5, text: useQuiet ? "묻지 않아도 되었습니다. 그래서 감사했습니다." : "감사했습니다. 다 감사했습니다.", need: m });
  }
  if (J.stars < 4) {
    const m = [];
    if (F >= 30) m.push(`신앙 30 미만이어야 함 (지금 ${F})`);
    if (P.self < 3) m.push(`자립 3 이상 (지금 ${P.self})`);
    miss.push({ stars: 4, text: "아무도 없다는 걸 압니다. 그래도.", need: m });
  }
  if (J.stars < 3) {
    const m = [];
    if ((P.blessing || 0) < 0.5) m.push("남길 축복 없음 (거절 뒤 스스로 해낸 적 없음)");
    if (F < 40) m.push(`신앙 40 이상 (지금 ${F})`);
    if (P.dep > 2) m.push(`의존 2 이하 (지금 ${P.dep.toFixed(1)})`);
    miss.push({ stars: 3, text: "남은 사람들에게는 더 잘해주십시오.", need: m });
  }
  const factors = [
    ["신앙", F], ["의존", P.dep.toFixed(1)], ["자립", P.self],
    ["기도", `${c.pray}회 (본인 ${P.ownPray || 0}) · 들어줌 ${c.grant} · 거절 ${c.deny} · 침묵 ${c.silence}`], ["기도 없이 해냄", P.quietWins || 0],
    ["마지막 10년에 들어줌", late], ["남에게서 가져온 수명", `${P.taken}년`], ["남의 기적 대가로 잃은 수명", `${P.debt}년`],
  ];
  return { why, miss: miss.slice(0, 2), factors };
}

function judgeLastPrayer(P) {
  const F = P.faith, late = P.grantAges.filter(a => P.age - a <= 10).length, c = P.counts;
  const quiet = (P.lastPrayAge < 0 ? P.counts.pray === 0 && P.age > 25 : P.age - P.lastPrayAge >= 20) && F < 30;
  const rules = [
    { k: "none",   stars: 0, text: null,                                         test: () => quiet || (F <= 0 && P.counts.pray >= 2) },
    { k: "cling",  stars: 1, text: "한 번만. 마지막으로 한 번만.",                 test: () => P.dep >= 4 && late >= 1 },
    { k: "why",    stars: 1, text: "왜 저였습니까.",                               test: () => P.debt >= 10 && F < 50 },
    { k: "owe",    stars: 2, text: "제 몫이 아닌 것을 받았습니다. 누가 치렀는지는 모르지만.", test: () => P.taken >= 10 && (P.pheno.O >= 60 || P.pheno.A >= 60) },
    { k: "lean",   stars: 2, text: "덕분에 살았습니다. 이제 돌려드립니다.",          test: () => F >= 60 && P.dep >= 3 },
    // 최고 결말은 '남의 수명을 가져온 경우'와 '의존한 경우'만 아니면 다른 규칙보다 먼저 맞아야 한다
    // 조용한 길: 거의 묻지 않았고, 한 번도 들어주지 않았는데 믿음이 남았다
    { k: "quiet5", stars: 5, text: "묻지 않아도 되었습니다. 그래서 감사했습니다.", test: () => (P.ownPray || 0) <= 3 && c.grant === 0 && P.self >= 1 && F >= 45 },
    { k: "thanks", stars: 5, text: "감사했습니다. 다 감사했습니다.",                test: () => F >= 55 && P.dep <= 2 && P.self >= 2 },
    { k: "alone",  stars: 4, text: "아무도 없다는 걸 압니다. 그래도.",              test: () => F < 30 && P.self >= 3 },
    { k: "next",   stars: 3, text: "남은 사람들에게는 더 잘해주십시오.",            test: () => (P.blessing || 0) >= 0.5 && F >= 40 && P.dep <= 2 },
    { k: "there",  stars: 2, text: "거기 계셨습니까.",                             test: () => F >= 30 && F < 60 },
    { k: "sleep",  stars: 2, text: "...",                                          test: () => true },
  ];
  return rules.find(r => r.test());
}

function stripHtml(h) { return h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }

// ---------- 죽음 ----------
function onDeath(v) {
  if (v.dead) return;
  v.dead = true; fx("death", v.slot);
  const P = v.P, c = P.counts;
  for (const pr of v.open) { pr.status = "expired"; pr.result = "응답을 받기 전에 죽었다."; }
  v.open = [];
  const J = judgeLastPrayer(P); SCORE += J.stars; P.lastPrayer = J;
  const starTxt = J.stars ? "★".repeat(J.stars) : "☆";
  let last;
  if (J.text) {
    last = `<div class="q" style="font-style:italic;margin:6px 0">🙏 마지막 기도: "${J.text}" <span class="faith">${starTxt}</span></div>`;
    PRAYERS.push({ id: ++prayerSeq, v, e: null, byParent: false, askedAt: P.age, text: J.text, status: "last", result: `마지막 기도. ${starTxt}` });
  } else last = `<div class="num" style="margin:6px 0">마지막 순간, 기도는 없었다. <span class="faith">${starTxt}</span></div>`;
  const shift = AX.map(k => `${AXL[k]} ${Math.round(P.born[k])}→${Math.round(P.pheno[k])}`).join(" · ");
  v.log(`<div class="death"><b>${P.name}, ${P.age}세. ${P.deathWhy}</b>${P.painless ? " 고통은 없었다." : ""}${P.debt ? ` <span class="num">(다른 통의 기도 대가로 ${P.debt}년을 잃었다)</span>` : ""}${last}
    <table class="summary"><tr><th>사건</th><td>${c.ev}건</td></tr>
    <tr><th>기도</th><td>${c.pray}회 (들어줌 ${c.grant} · 거절 ${c.deny} · 침묵 ${c.silence})</td></tr>
    <tr><th>마지막 신앙</th><td>${Math.round(P.faith)} · 의존 ${P.dep.toFixed(1)} · 자립 ${P.self}</td></tr>
    <tr><th>성격 변화</th><td>${shift}</td></tr>
    <tr><th>실험 기록</th><td>${P.ledger.length ? P.ledger.join("<br>") : "이 실험에서 대가는 청구되지 않았다."}</td></tr></table></div>`);
  v.lastLine = `${P.age}세에 죽었다. ${P.deathWhy}`;
  GRAVE.push({ id: ++graveSeq, P, name: P.name, age: P.age, slot: v.slot, pray: c.pray, grant: c.grant, faith: Math.round(P.faith), stars: J.stars, last: J.text, year: OPT.year });
}

function tapVat(v) {
  const P = v.P;
  if (v.dead) return;
  if (P.tapYear !== P.age) { P.tapYear = P.age; P.taps = 0; }
  P.taps++;
  if (P.taps === 1 && Math.random() < 0.5) v.log(`<div class="note">${P.age}세 · 이유 없이 등골이 서늘했다.</div>`);
  if (P.taps === 3) { v.S.adj(P, { N: +1 }); v.log(`<div class="note">${P.age}세 · 요즘 자꾸 누가 보는 것 같다. <span class="d">신경성+1</span></div>`); }
  fx("tap", v.slot);
}

function replaceVat(v) {
  // 리셋: 응답 못 받은 기도는 통과 함께 사라진다
  for (const pr of v.open) { pr.status = "expired"; pr.result = "응답을 받기 전에 통이 비워졌다."; }
  v.open = [];
  if (!v.dead) GRAVE.push({ id: ++graveSeq, P: v.P, name: v.P.name, age: v.P.age, slot: v.slot, pray: v.P.counts.pray, grant: v.P.counts.grant, faith: Math.round(v.P.faith), reset: true, year: OPT.year });
  const i = VATS.indexOf(v);
  if (i >= 0) VATS[i] = newVat(v.slot);
  return VATS[i];
}


// ---------- 저장 / 복원 (브라우저 localStorage) ----------
// 함수는 저장할 수 없으므로: 통은 vatShell로 되살리고, 기도는 사람 id·통 id·사건 id로 다시 잇는다
const SAVE_VERSION = 1;
function snapshotGame(extra) {
  const strip = v => ({ id: v.id, slot: v.slot, P: v.P, html: v.html, lastLine: v.lastLine, dead: v.dead, open: v.open.map(pr => pr.id) });
  return {
    version: SAVE_VERSION, savedAt: Date.now(),
    opt: OPT, debt: VAT_DEBT, grantLog: GRANT_LOG, score: SCORE,
    seq: { prayer: prayerSeq, vat: vatSeq, grave: graveSeq, person: personSeq },
    vats: VATS.map(strip),
    grave: GRAVE.map(g => ({ ...g, P: undefined, pid: g.P ? g.P.pid : undefined })),
    persons: GRAVE.filter(g => g.P).map(g => g.P),           // 끝난 인생의 사람 객체 (살아 있는 사람은 vats 안에)
    prayers: PRAYERS.map(pr => ({ ...pr, v: undefined, e: undefined, vid: pr.v.id, pid: pr.v.P.pid, eid: pr.e ? pr.e.id : null })),
    extra: extra || {},
  };
}
function restoreGame(d) {
  if (!d || d.version !== SAVE_VERSION) return false;
  Object.assign(OPT, d.opt);
  for (const k in VAT_DEBT) delete VAT_DEBT[k]; Object.assign(VAT_DEBT, d.debt || {});
  GRANT_LOG.length = 0; GRANT_LOG.push(...(d.grantLog || []));
  SCORE = d.score || 0; FX.length = 0;
  prayerSeq = d.seq.prayer; vatSeq = d.seq.vat; graveSeq = d.seq.grave; personSeq = d.seq.person;
  VATS.length = 0; for (const vd of d.vats) VATS.push(vatShell({ ...vd, open: [] }));
  const persons = {}; for (const v of VATS) persons[v.P.pid] = v; for (const P of d.persons) persons[P.pid] = { P };   // pid → 통(또는 사람만 가진 껍데기)
  GRAVE.length = 0; for (const g of d.grave) GRAVE.push({ ...g, P: persons[g.pid] ? persons[g.pid].P : undefined });
  PRAYERS.length = 0;
  for (const pd of d.prayers) {
    const v = VATS.find(x => x.id === pd.vid) || persons[pd.pid] || { P: { name: "?" } };
    PRAYERS.push({ ...pd, v, e: pd.eid ? EV.find(e => e.id === pd.eid) : null });
  }
  for (const vd of d.vats) { const v = VATS.find(x => x.id === vd.id); v.open = vd.open.map(id => PRAYERS.find(pr => pr.id === id)).filter(Boolean); }
  return true;
}
