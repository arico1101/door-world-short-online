/* ===== トビラ せかい版 オンライン — クライアント =====
   判定はすべてサーバー(Durable Object)が行う。ここは表示と入力だけを担当する。 ===== */
import * as R from "./rules.js";

/* ---------- i18n ---------- */
let lang = localStorage.getItem("tobira-lang") || "ja";
const L = v => (v && typeof v === "object" && v.ja !== undefined) ? v[lang] : v;
const fm = n => lang === "ja" ? `${n}万` : `${n < 0 ? "-" : ""}¥${(Math.abs(n) * 10).toLocaleString("en-US")}k`;
const fage = n => lang === "ja" ? `${n}歳` : `Age ${n}`;
const ja = () => lang === "ja";
const $ = id => document.getElementById(id);

/* 描いたアイコン（index.html の <symbol> を参照する。絵文字は使わない） */
const ic = (name, cls) => `<svg class="ic${cls ? " " + cls : ""}" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
/* プレイヤーの色から、わりあてられたキャラを引く */
const charOf = p => R.CHARS[Math.max(0, R.PCOLORS.indexOf(p.color))] || R.CHARS[0];
const faceBg = p => `background-image:url(./chars/${charOf(p)}-face.png)`;

/* ---------- 通信 ---------- */
let ws = null, G = null, YOU = null, MYPID = null, ROOM = null, retry = 0;
let shown = {};            /* コマの表示位置（1マスずつ動かすため） */
let lastKey = "";          /* 同じモーダルを描き直さないための署名 */
let animTimer = null;

function myId() {
  /* 同じ端末の別タブでも別プレイヤーになれるよう、まずタブ内(sessionStorage)を見る。
     ?pid= を付けると固定できる（同じ端末で複数人が遊ぶとき・テスト用） */
  const forced = new URLSearchParams(location.search).get("pid");
  if (forced) { sessionStorage.setItem("tobira-pid", forced); return forced; }
  let id = sessionStorage.getItem("tobira-pid") || localStorage.getItem("tobira-pid");
  if (!id) id = crypto.randomUUID();
  sessionStorage.setItem("tobira-pid", id);
  localStorage.setItem("tobira-pid", id);
  return id;
}
function connect(code, name) {
  ROOM = code;
  localStorage.setItem("tobira-room", code);
  localStorage.setItem("tobira-name", name);
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws?room=${encodeURIComponent(code)}&pid=${encodeURIComponent(myId())}&name=${encodeURIComponent(name)}`);
  ws.onopen = () => { retry = 0; $("connMsg").textContent = ""; };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "state") { MYPID = m.pid; G = m.g; YOU = m.you; window.__tobira.msgs++; render(); }
  };
  ws.onclose = () => {
    if (!ROOM) return;
    $("connMsg").textContent = ja() ? "接続が切れました。つなぎ直しています…" : "Disconnected. Reconnecting…";
    setTimeout(() => connect(code, name), Math.min(1000 * ++retry, 5000));
  };
  ws.onerror = () => {};
}
const send = m => { try { ws && ws.readyState === 1 && ws.send(JSON.stringify(m)); } catch {} };

/* ---------- 画面切り替え ---------- */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}
function openModal(html, watching) {
  $("modalBox").className = "modal" + (watching ? " watching" : "");
  $("modalBox").innerHTML = html;
  $("overlay").classList.add("open");
  $("modalBox").scrollTop = 0;
}
function closeModal() { $("overlay").classList.remove("open"); $("modalBox").innerHTML = ""; lastKey = ""; }
const isOpen = () => $("overlay").classList.contains("open");

/* ---------- ロビー ---------- */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   /* まぎらわしい文字は除く */
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const nameOf = () => ($("nameInput").value.trim() || (ja() ? "プレイヤー" : "Player")).slice(0, 12);

$("createBtn").onclick = () => connect(newCode(), nameOf());
$("joinBtn").onclick = () => {
  const c = $("codeInput").value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(c)) { $("connMsg").textContent = ja() ? "コードを入れてください" : "Enter a room code"; return; }
  connect(c, nameOf());
};
$("startBtn").onclick = () => send({ t: "start", heavyOn: $("heavyToggle").checked });
$("againBtn").onclick = () => send({ t: "again" });
$("cardBtn").onclick = () => { if (!isOpen() && YOU) showCard(true); };
$("helpBtnGame").onclick = () => { if (!isOpen()) renderRules(0); };
$("hostBtn").onclick = () => { if (hostOpen()) closeHost(); else renderHostPanel(); };
$("claimBtn").onclick = () => send({ t: "claimHost" });

/* ---------- サイコロ ---------- */
const PIPS = {1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8]};
let spinTimer = null;
function diceFace(n) {
  const on = new Set(PIPS[n] || []);
  $("diceFace").innerHTML = Array.from({ length: 9 }, (_, i) => on.has(i) ? "<span><i></i></span>" : "<span></span>").join("");
}
function spinDice() {
  if (spinTimer) return;
  $("diceFace").classList.add("spin");
  spinTimer = setInterval(() => diceFace(1 + Math.floor(Math.random() * 6)), 70);
  setTimeout(() => {
    clearInterval(spinTimer); spinTimer = null;
    $("diceFace").classList.remove("spin");
    diceFace((G && G.dice) || 1);
  }, 700);
}
$("diceBtn").onclick = () => {
  const cur = G && G.players[G.turn];
  if (cur && cur.pos >= 4) spinDice();
  send({ t: "roll" });
};

/* ---------- 言語 ---------- */
function applyLang() {
  document.documentElement.lang = ja() ? "ja" : "en";
  document.title = ja() ? "トビラ せかい版 オンライン ショート" : "TOBIRA World Online · Short";
  $("langJa").classList.toggle("on", ja());
  $("langEn").classList.toggle("on", !ja());
  $("gameSub").textContent = ja() ? "せかい版 オンライン ショート ─ みんなの端末で遊ぶ（1〜4人・25分）" : "World Edition Online · Short — play on your own devices (1–4, 25 min)";
  $("nameInput").placeholder = ja() ? "なまえ" : "Your name";
  $("createBtn").textContent = ja() ? "ルームをつくる" : "Create a room";
  $("joinNote").textContent = ja() ? "または、進行役から聞いたコードで参加：" : "Or join with the code from your host:";
  $("joinBtn").textContent = ja() ? "ルームに参加" : "Join room";
  $("lobbyNote").innerHTML = ja()
    ? "1台ずつ、自分の端末で開いてください。<br><b>家庭カードは、自分にしか見えません。</b>"
    : "Open this on your own device.<br><b>Your family card is visible only to you.</b>";
  $("waitTitle").textContent = ja() ? "まっています" : "Waiting";
  $("codeLabel").textContent = ja() ? "あいことば" : "Room code";
  $("shareNote").textContent = ja() ? "このコードを、いっしょに遊ぶ人に伝えてください。" : "Share this code with the other players.";
  $("heavyLabel").innerHTML = ja()
    ? "死別・干ばつなどのライフイベントを含める<br><small>ファシリテーター向け設定。参加者の状況にあわせてONにしてください。</small>"
    : "Include loss & disaster life events<br><small>For facilitators. Turn on when it suits your group.</small>";
  $("startBtn").textContent = ja() ? "ゲーム開始" : "Start game";
  $("cardBtnLabel").textContent = ja() ? "カード" : "Card";
  $("cardBtn").setAttribute("aria-label", ja() ? "自分の家庭カードを見る" : "See my family card");
  $("logoTxt").textContent = ja() ? "トビラ" : "TOBIRA";
  $("resTitle").textContent = ja() ? "けっか はっぴょう" : "Results";
  $("resSub").textContent = ja()
    ? "6歳から25歳、19年間のけっか。順位は「ハッピー」の数で決まります — そして、家庭カードの公開"
    : "19 years, from age 6 to 25. Ranking is decided by ♥ Happiness — and the Family Cards are revealed";
  $("allDoorsBtn").textContent = ja() ? "19年間のトビラ一覧を見る" : "See all doors of the 19 years";
  $("againBtn").textContent = ja() ? "もういちど遊ぶ" : "Play again";
  if (G) { renderBoard(); render(); }
}
$("langJa").onclick = () => { lang = "ja"; localStorage.setItem("tobira-lang", lang); applyLang(); };
$("langEn").onclick = () => { lang = "en"; localStorage.setItem("tobira-lang", lang); applyLang(); };

/* ================= 盤面 =================
   マスをマス目に並べるのではなく、1本の道を24等分してタイルに切る。
   タイルが曲がることで「つぎにどっちへ進むか」が形そのものでわかる。 */
const NS = "http://www.w3.org/2000/svg";
const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
const mqMobile = window.matchMedia("(max-width:700px)");

/* 段と段のあいだを広くとるほど、曲がり角の半径(corner)を大きくできる。
   半径がマスの幅に近いと内がわがつぶれて扇形になるので、幅の1.7倍以上を保つ。
   空はマスを置くぶんだけ細くして、盤面を上まで使う。 */
const LAY_WIDE = {
  vb: [1160, 965], corner: 112, skyH: 89,
  pts: [[124,155],[1036,155],[1036,395],[124,395],[124,635],[1036,635],[1036,875],[124,875]],
  sub: true, tokenW: 48, tokenH: 62, fsBig: 19, fsSmall: 15,
};
const LAY_TALL = {
  vb: [560, 1905], corner: 112, skyH: 78,
  pts: [[92,140],[468,140],[468,380],[92,380],[92,620],[468,620],[468,860],[92,860],
        [92,1100],[468,1100],[468,1340],[92,1340],[92,1580],[468,1580],[468,1820],[92,1820]],
  sub: false, tokenW: 46, tokenH: 58, fsBig: 21, fsSmall: 18,
};
const HALFW = { choice: 66, start: 62, goal: 62 };
const halfW = t => HALFW[t] || 52;

let geo = null;   /* {lay, at(s), seg} — コマの位置計算でも使う */

/* 折れ線を、角だけ丸めた細かい点列に変える */
function densePath(lay) {
  const P = lay.pts, Rr = lay.corner, out = [];
  const unit = (a, b) => { const d = [b[0]-a[0], b[1]-a[1]]; const n = Math.hypot(d[0], d[1]); return [d[0]/n, d[1]/n, n]; };
  let cur = P[0].slice();
  for (let i = 1; i < P.length; i++) {
    const v = P[i], [ux, uy, len] = unit(cur, v), hasCorner = i < P.length - 1;
    const stop = hasCorner ? Math.max(0, len - Rr) : len;
    const n = Math.max(2, Math.round(stop / 6));
    for (let k = 0; k <= n; k++) out.push([cur[0] + ux*stop*k/n, cur[1] + uy*stop*k/n]);
    if (hasCorner) {
      const [wx, wy] = unit(v, P[i+1]);
      const s = [cur[0] + ux*stop, cur[1] + uy*stop], e = [v[0] + wx*Rr, v[1] + wy*Rr], m = 40;
      for (let k = 1; k <= m; k++) {
        const t = k/m, it = 1-t;
        out.push([it*it*s[0] + 2*it*t*v[0] + t*t*e[0], it*it*s[1] + 2*it*t*v[1] + t*t*e[1]]);
      }
      cur = e;
    }
  }
  return out;
}
function buildGeo(lay) {
  const D = densePath(lay), cum = [0];
  for (let i = 1; i < D.length; i++) cum.push(cum[i-1] + Math.hypot(D[i][0]-D[i-1][0], D[i][1]-D[i-1][1]));
  const total = cum[cum.length - 1];
  const at = s => {
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
    const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    const p = [D[lo][0] + (D[hi][0]-D[lo][0])*t, D[lo][1] + (D[hi][1]-D[lo][1])*t];
    const a = D[Math.max(0, lo-2)], b = D[Math.min(D.length-1, hi+2)];
    const dx = b[0]-a[0], dy = b[1]-a[1], n = Math.hypot(dx, dy) || 1;
    return { p, n: [-dy/n, dx/n] };
  };
  return { lay, at, seg: total / R.SQUARES.length };
}

/* 背景：日本・欧米・ウガンダが地つづきに並ぶ、一枚の風景。
   3つの風景はそれぞれ「地平線を y=0」とした座標で描き、
   同じ倍率で拡大して空の帯におさめる（縦だけ縮めるとつぶれて見えるため） */
const SCENES = [
  { cx: 0.15, w: 180, draw: a => {          /* 日本：富士山・鳥居・桜 */
    a("path", { d: "M-169 0 L-83 -112 L3 0 Z", fill: "#BBD6E8" });
    a("path", { d: "M-113 -76 L-83 -112 L-53 -76 q-30 14 -60 0 z", fill: "#FFFFFF" });
    a("path", { d: "M17 0 v-56 M83 0 v-56", stroke: "#D95F45", "stroke-width": 10, "stroke-linecap": "round" });
    a("path", { d: "M3 -56 h94 M11 -40 h78", stroke: "#D95F45", "stroke-width": 10, "stroke-linecap": "round" });
    a("path", { d: "M145 -20 v22", stroke: "#B08968", "stroke-width": 7, "stroke-linecap": "round" });
    a("circle", { cx: 139, cy: -38, r: 30, fill: "#F8CBDA" });
    a("circle", { cx: 169, cy: -20, r: 21, fill: "#FBDCE6" });
    a("circle", { cx: 117, cy: -16, r: 17, fill: "#FBDCE6" });
  }},
  { cx: 0.5, w: 126, draw: a => {           /* 欧米：街なみ */
    [[-126,-70],[-84,-46],[-40,-92],[4,-56],[48,-76],[92,-44]].forEach(([bx, by], i) => {
      a("rect", { x: bx, y: by, width: 34, height: -by, rx: 4, fill: i % 2 ? "#CBDAE9" : "#D9E5F0" });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++)
        if (by + 12 + r * 20 < -10) a("rect", { x: bx + 7 + c * 14, y: by + 12 + r * 20, width: 8, height: 10, rx: 2, fill: "#EEF5FA" });
    });
  }},
  { cx: 0.85, w: 175, draw: a => {          /* ウガンダ：サバンナの丘・アカシア・丸い家 */
    a("path", { d: "M-141 0 q120 -54 250 -14 q50 16 80 14 z", fill: "#DCEEC6" });
    a("path", { d: "M-13 0 v-48", stroke: "#A98363", "stroke-width": 9, "stroke-linecap": "round" });
    a("path", { d: "M-75 -48 q62 -34 124 0 q-62 14 -124 0 z", fill: "#8CC28A" });
    a("path", { d: "M-61 -62 q48 -22 96 0 q-48 10 -96 0 z", fill: "#A2D19E" });
    a("path", { d: "M81 0 a30 19 0 0 1 60 0 z", fill: "#EBCDA1" });
    a("path", { d: "M73 -20 l38 -26 l38 26 z", fill: "#C99B6A" });
    a("path", { d: "M-149 0 a22 14 0 0 1 44 0 z", fill: "#EBCDA1" });
    a("path", { d: "M-155 -14 l28 -20 l28 20 z", fill: "#C99B6A" });
  }},
];
function drawScenery(svg, lay) {
  const [W, H] = lay.vb, skyH = lay.skyH;
  const defs = el("defs");
  const grad = el("linearGradient", { id: "sky", x1: 0, y1: 0, x2: 0, y2: 1 });
  [["0%", "#DDEFF9"], ["40%", "#EDF7F1"], ["100%", "#E6F3DC"]].forEach(([o, c]) =>
    grad.appendChild(el("stop", { offset: o, "stop-color": c })));
  defs.appendChild(grad); svg.appendChild(defs);
  svg.appendChild(el("rect", { width: W, height: H, fill: "url(#sky)" }));

  const g = el("g", {}), add = (t, a) => g.appendChild(el(t, a));
  add("rect", { x: 0, y: 0, width: W, height: skyH, fill: "#DCEEF9" });
  /* 太陽と雲。地平線の上の細い帯におさめる */
  add("circle", { cx: W * 0.93, cy: skyH * 0.32, r: skyH * 0.2, fill: "#FFE49A" });
  [0.1, 0.34, 0.6, 0.78].forEach(f => {
    const cx = W * f, cy = skyH * 0.24, rx = skyH * 0.3, ry = skyH * 0.12;
    add("ellipse", { cx, cy, rx, ry, fill: "#fff", opacity: .9 });
    add("ellipse", { cx: cx - rx * 0.6, cy: cy + ry * 0.5, rx: rx * 0.62, ry: ry * 0.8, fill: "#fff", opacity: .9 });
  });
  /* 3つの風景。倍率は縦横おなじ＝形がつぶれない */
  const k = skyH / 124;
  SCENES.forEach(sc => {
    const cx = Math.min(W - sc.w * k - 4, Math.max(sc.w * k + 4, W * sc.cx));
    const sg = el("g", { transform: `translate(${cx.toFixed(1)} ${skyH}) scale(${k.toFixed(3)})` });
    sc.draw((t, a) => sg.appendChild(el(t, a)));
    g.appendChild(sg);
  });
  /* 道ぞいの木 */
  const tree = (tx, ty, sz) => {
    add("path", { d: `M${tx} ${ty} v${16*sz}`, stroke: "#A98363", "stroke-width": 4.5*sz, "stroke-linecap": "round" });
    add("circle", { cx: tx, cy: ty - 5*sz, r: 13*sz, fill: "#93C58F" });
    add("circle", { cx: tx - 9*sz, cy: ty + 2*sz, r: 10*sz, fill: "#7FB87F" });
    add("circle", { cx: tx + 9*sz, cy: ty + 1*sz, r: 9*sz, fill: "#7FB87F" });
  };
  const inset = lay.sub ? 46 : 28, n = lay.sub ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const ty = skyH + 50 + (H - skyH - 90) * (i + .5) / n;
    tree(inset, ty, lay.sub ? 1 : .8);
    tree(W - inset, ty + 34, lay.sub ? .9 : .75);
  }
  svg.appendChild(g);
}

/* 高さ y のところで、その形の中にとれる「いちばん長い横の線」。無ければ null */
function widestSpan(poly, y) {
  const xs = [];
  for (let k = 0; k < poly.length; k++) {
    const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % poly.length];
    if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + (x1 - x0) * (y - y0) / (y1 - y0));
  }
  if (xs.length < 2) return null;
  xs.sort((a, b) => a - b);
  let best = null;
  for (let k = 0; k + 1 < xs.length; k += 2)
    if (!best || xs[k + 1] - xs[k] > best[1] - best[0]) best = [xs[k], xs[k + 1]];
  return best;
}
/* マスの中で、文字のかたまりがいちばん広く入る場所をさがす。
   まっすぐなマスならまん中、Uターンのマスなら曲がりの外がわの太いところが選ばれる。
   offs は「かたまりの中心から見た、各行の位置」 */
function bestLabelSpot(poly, offs) {
  const ys = poly.map(q => q[1]);
  const top = Math.min(...ys), bot = Math.max(...ys), N = 30;
  const probes = [];
  offs.forEach(o => { probes.push(o - 12, o + 4); });
  const cand = [];
  for (let i = 0; i <= N; i++) {
    const ay = top + (bot - top) * i / N;
    let lo = -Infinity, hi = Infinity;
    for (const o of probes) {
      const sp = widestSpan(poly, ay + o);
      if (!sp) { lo = 0; hi = -1; break; }
      lo = Math.max(lo, sp[0]); hi = Math.min(hi, sp[1]);
    }
    if (hi - lo > 0) cand.push({ x: (lo + hi) / 2, y: ay, w: hi - lo });
  }
  if (!cand.length) return null;
  const max = Math.max(...cand.map(c => c.w));
  const tie = cand.filter(c => c.w >= max - 1);        /* 同じ広さなら、そのまん中に置く */
  return tie[Math.floor(tie.length / 2)];
}

/* 横位置 x のところで、その形が上下どこからどこまであるか。無ければ null */
function spanAtX(poly, x) {
  const ys = [];
  for (let k = 0; k < poly.length; k++) {
    const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % poly.length];
    if ((x0 <= x && x1 > x) || (x1 <= x && x0 > x)) ys.push(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
  }
  return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
}

/* マスのアイコン（盤面用・線で描く） */
function tileIcon(type, cx, cy, c) {
  const g = el("g", { transform: `translate(${cx} ${cy})` });
  const a = (t, at) => g.appendChild(el(t, at));
  const S = { fill: "none", stroke: c, "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" };
  if (type === "income") {
    a("ellipse", { cx: 0, cy: 6, rx: 13, ry: 5, fill: "#F6C445", stroke: c, "stroke-width": 2.6 });
    a("ellipse", { cx: 0, cy: 0, rx: 13, ry: 5, fill: "#FFD86B", stroke: c, "stroke-width": 2.6 });
    a("ellipse", { cx: 0, cy: -6, rx: 13, ry: 5, fill: "#FFE49A", stroke: c, "stroke-width": 2.6 });
  } else if (type === "cost") {
    a("circle", { cx: -4, cy: -2, r: 11, fill: "#fff", stroke: c, "stroke-width": 2.8 });
    a("path", { ...S, d: "M-8 -6 L-4 -2 L0 -6 M-8 -1 h8 M-4 -2 v6", "stroke-width": 2.6 });
    a("path", { ...S, d: "M10 2 v10 M10 14 l-5 -5 M10 14 l5 -5", "stroke-width": 3.2 });
  } else if (type === "event" || type === "heavy") {
    a("path", { d: "M4 -14 L-9 3 h7 l-4 13 L11 -2 h-7 z", fill: type === "heavy" ? "#C9A98C" : "#B59BE8", stroke: c, "stroke-width": 2.6, "stroke-linejoin": "round" });
  } else if (type === "learn") {
    a("path", { d: "M-13 -8 h11 a2 2 0 0 1 2 2 v15 a2 2 0 0 0 -2 -2 h-11 z", fill: "#fff", stroke: c, "stroke-width": 2.8, "stroke-linejoin": "round" });
    a("path", { d: "M13 -8 h-11 a2 2 0 0 0 -2 2 v15 a2 2 0 0 1 2 -2 h11 z", fill: "#DCEEF9", stroke: c, "stroke-width": 2.8, "stroke-linejoin": "round" });
  } else if (type === "choice") {
    a("path", { d: "M-12 15 v-22 a12 12 0 0 1 24 0 v22 z", fill: "#fff", stroke: "#D4547A", "stroke-width": 3, "stroke-linejoin": "round" });
    a("circle", { cx: 6, cy: 5, r: 2.6, fill: "#D4547A" });
  } else if (type === "start") {
    a("path", { ...S, d: "M-12 0 h20 M2 -7 l8 7 l-8 7", stroke: "#fff", "stroke-width": 4 });
  } else if (type === "goal") {
    a("path", { ...S, d: "M-9 14 v-24", stroke: "#7A6320", "stroke-width": 3.4 });
    a("path", { d: "M-9 -10 h20 v12 h-20 z", fill: "#fff", stroke: "#7A6320", "stroke-width": 2.6 });
    a("path", { d: "M-9 -10 h10 v6 h-10 z M1 -4 h10 v6 h-10 z", fill: "#7A6320" });
  }
  return g;
}

function renderBoard() {
  const lay = mqMobile.matches ? LAY_TALL : LAY_WIDE;
  geo = buildGeo(lay);
  const svg = $("board");
  svg.setAttribute("viewBox", `0 0 ${lay.vb[0]} ${lay.vb[1]}`);
  svg.innerHTML = "";
  drawScenery(svg, lay);

  const gTiles = el("g", {}), gLabels = el("g", {});
  svg.appendChild(gTiles); svg.appendChild(gLabels);
  const { at, seg } = geo;
  const band = [];                                      /* 各マスの上下端。章ラベルの位置決めに使う */

  R.SQUARES.forEach((sq, i) => {
    const m = R.TYPE_META[sq.t], hw = halfW(sq.t);
    const s0 = i * seg + 3.5, s1 = (i + 1) * seg - 3.5, M = 22, left = [], right = [], mid = [];
    for (let k = 0; k <= M; k++) {
      const { p, n } = at(s0 + (s1 - s0) * k / M);
      left.push([p[0] + n[0]*hw, p[1] + n[1]*hw]);
      right.push([p[0] - n[0]*hw, p[1] - n[1]*hw]);
      mid.push(p);
    }
    const d = "M" + left.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ")
      + " L " + right.reverse().map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ") + " Z";
    gTiles.appendChild(el("path", { d, id: `sq-${i}`, fill: m.fill, stroke: "#FFFFFF", "stroke-width": 9, "stroke-linejoin": "round" }));

    const poly = left.concat(right);
    const big = sq.t === "choice" || sq.t === "start" || sq.t === "goal";
    const tTxt = L(sq.name) || L(m.label);
    /* このマスが曲がりの上にあるか。大きく曲がるマスは横に使える幅がせまいので、
       説明文まで入れると字が小さくなりすぎる。年齢だけにする */
    const v0 = [mid[1][0] - mid[0][0], mid[1][1] - mid[0][1]];
    const v1 = [mid[M][0] - mid[M-1][0], mid[M][1] - mid[M-1][1]];
    const cos = (v0[0]*v1[0] + v0[1]*v1[1]) / ((Math.hypot(v0[0],v0[1]) * Math.hypot(v1[0],v1[1])) || 1);
    const curvy = cos < 0.64;                           /* 約50度より大きく曲がる */
    /* 年齢はトビラ・スタート・ゴールだけ。せまい画面では説明文は出さない */
    const ageTxt = ja() ? `${R.AGES[i]}歳` : `Age ${R.AGES[i]}`;
    const sTxt = big
      ? (curvy ? ageTxt : ageTxt + (L(sq.sub) ? "・" + L(sq.sub) : ""))
      : ((lay.sub && !curvy) ? (L(sq.sub) || "") : "");
    /* アイコン・見出し・説明の位置（かたまりの中心から見た相対位置）。
       上下おなじ余白になるよう、説明のあるなしでずらす */
    const dy = sTxt ? 5 : 14;
    const offs = [-(big ? 30 : 26) + dy, (big ? 12 : 10) + dy];
    if (sTxt) offs.push((big ? 32 : 28) + dy);
    const spot = bestLabelSpot(poly, offs)
      || { x: mid[Math.floor(mid.length / 2)][0], y: mid[Math.floor(mid.length / 2)][1], w: 2 * hw };
    /* 文字はこの幅におさめる。曲がったマスでも白いフチをまたがない */
    const room = Math.max(46, spot.w - 26);
    const fit = (txt, base) => {
      const w = [...txt].reduce((s2, ch) => s2 + (ch.charCodeAt(0) > 0x2E80 ? 1 : 0.55), 0);
      return Math.max(9, Math.min(base, room / Math.max(1, w)));
    };
    gLabels.appendChild(tileIcon(sq.t, spot.x, spot.y + offs[0], m.chip));
    const title = el("text", { x: spot.x, y: spot.y + offs[1], "text-anchor": "middle",
      "font-size": fit(tTxt, big ? lay.fsBig : lay.fsSmall), "font-weight": 900, fill: m.ink });
    title.textContent = tTxt;
    gLabels.appendChild(title);
    if (sTxt) {
      const sub = el("text", { x: spot.x, y: spot.y + offs[2], "text-anchor": "middle",
        "font-size": fit(sTxt, big ? (lay.sub ? 11.5 : 12.5) : 10.5), "font-weight": 700,
        fill: big ? m.ink : "#6E7E8C", opacity: big ? .92 : 1 });
      sub.textContent = sTxt;
      gLabels.appendChild(sub);
    }
    band[i] = poly;      /* 章のラベルを置くときに、どこが空いているかを測るのに使う */
  });

  /* 章のラベルは、段と段のあいだの「ほんとうに空いているところ」のまん中に置く。
     角のタイルはとなりの段までふくらむので、盤面のまん中(cx)での空きだけを見る */
  const cx = lay.vb[0] / 2, perRow = lay.sub ? 6 : 3;
  const spans = band.map(poly => spanAtX(poly, cx));
  R.CHAPTERS.forEach((ch, r) => {
    const first = r * 6;
    const tops = spans.slice(first, first + perRow).filter(Boolean).map(v => v[0] - 4.5);
    const bots = spans.slice(0, first).filter(Boolean).map(v => v[1] + 4.5);
    const top = tops.length ? Math.min(...tops) : 40;
    const y = bots.length
      ? (Math.max(...bots) + top) / 2
      : Math.max(16, top - 30);                         /* 1章目だけは、段の上に同じだけ空けて置く */
    const t = L(ch.t);
    const w = Math.min(lay.vb[0] - 24, t.length * (lay.sub ? 14 : 15) + 24);
    gLabels.appendChild(el("rect", { x: cx - w/2, y: y - 13, width: w, height: 26, rx: 13,
      fill: "#fff", opacity: .95, stroke: "#DCE7EE", "stroke-width": 2 }));
    const e = el("text", { x: cx, y: y + 5, "font-size": lay.sub ? 13.5 : 14.5, "font-weight": 900,
      fill: "#3F5266", "text-anchor": "middle" });
    e.textContent = t;
    gLabels.appendChild(e);
  });

  svg.appendChild(el("g", { id: "tokLayer" }));
}
mqMobile.addEventListener("change", () => { renderBoard(); renderTokens(); });

/* コマの表情。数字の変化ではなく「いまの状態」をあらわす */
function emotionOf(p, isTurn) {
  if (p.left) return "angry";
  if (p.money < 0) return "sad";
  if (p.done) return "joy";
  return isTurn ? "fun" : "joy";
}
function renderTokens() {
  const layer = $("tokLayer");
  if (!layer || !G || !geo) return;
  layer.innerHTML = "";
  const { at, seg, lay } = geo;
  /* 同じマスに重なったときは、少しずつ横にずらす */
  const bucket = {};
  G.players.forEach(p => {
    const pos = shown[p.id] != null ? shown[p.id] : p.pos;
    (bucket[pos] = bucket[pos] || []).push(p);
  });
  Object.entries(bucket).forEach(([posStr, list]) => {
    const pos = +posStr;
    const sq = R.SQUARES[pos]; if (!sq) return;
    const { p: c, n } = at(pos * seg + seg / 2);
    const hw = halfW(sq.t);
    /* どの段でも「タイルの上ふち」に立つよう、法線の向きをそろえる */
    const sg = n[1] < 0 ? 1 : -1;
    const base = [c[0] + n[0]*sg*(hw - 6), c[1] + n[1]*sg*(hw - 6)];
    const W = lay.tokenW, H = lay.tokenH;
    list.forEach((p, k) => {
      const off = (k - (list.length - 1) / 2) * (W * 0.52);
      const foot = [base[0] + off, base[1] - Math.abs(off) * 0.12];
      const g = el("g", { id: `tok-${p.id}` });
      g.appendChild(el("ellipse", { cx: foot[0], cy: foot[1] - 1, rx: 15, ry: 5, fill: "rgba(63,82,102,.18)" }));
      const isTurn = G.players[G.turn] && G.players[G.turn].id === p.id && !p.done;
      if (p.id === MYPID) {
        g.appendChild(el("rect", { x: foot[0] - 31, y: foot[1] - H - 23, width: 62, height: 22, rx: 11, fill: "#F4879F" }));
        const t = el("text", { x: foot[0], y: foot[1] - H - 8, "text-anchor": "middle",
          "font-size": 12.5, "font-weight": 900, fill: "#fff" });
        t.textContent = ja() ? "あなた" : "YOU";
        g.appendChild(t);
      }
      const fo = el("foreignObject", { x: foot[0] - W/2, y: foot[1] - H, width: W, height: H });
      const div = document.createElement("div");
      div.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
      div.style.cssText = `width:${W}px;height:${H}px;background:url(./chars/${charOf(p)}-${emotionOf(p, isTurn)}.png) center bottom/contain no-repeat;`
        + `filter:drop-shadow(0 1px 2px rgba(63,82,102,.3))${isTurn ? "" : ";opacity:.82"}`;
      fo.appendChild(div); g.appendChild(fo);
      layer.appendChild(g);
    });
  });
}
/* サーバーが決めた位置まで、1マスずつ歩かせる。
   表示が失敗しても進行を止めないよう、必ず終了して次のモーダルを出す */
function stepAnim() {
  if (animTimer || !G) return;
  const behind = () => G.players.some(p => (shown[p.id] == null ? p.pos : shown[p.id]) !== p.pos);
  if (!behind()) return;
  let guard = 0;
  animTimer = setInterval(() => {
    try {
      guard++;
      G.players.forEach(p => {
        if (shown[p.id] == null) shown[p.id] = p.pos;
        if (shown[p.id] < p.pos) shown[p.id]++;
        else if (shown[p.id] > p.pos) shown[p.id] = p.pos;
      });
      renderTokens();
      const cur = G.players[G.turn];
      if (cur && shown[cur.id] != null) focusSquare(shown[cur.id]);
    } catch (e) {
      console.log("anim error", e);
    } finally {
      if (!behind() || guard > 40) {
        clearInterval(animTimer); animTimer = null;
        renderPending();
      }
    }
  }, 200);
}
function focusSquare(pos) {
  const t = $(`sq-${pos}`);
  if (!t || !t.getBoundingClientRect) return;
  const r = t.getBoundingClientRect();
  if (r.height === 0) return;
  window.scrollTo({ top: Math.max(0, r.top + window.scrollY - (window.innerHeight - r.height) / 2), behavior: "smooth" });
}

/* ---------- プレイヤー一覧（画面上） ---------- */
function renderStrip() {
  const s = $("playersStrip");
  s.innerHTML = "";
  G.players.forEach((p, i) => {
    const c = document.createElement("div");
    c.className = "pcard" + (i === G.turn ? " now" : "") + (p.done ? " done" : "")
      + (p.connected ? "" : " off") + (p.left ? " left" : "");
    c.innerHTML = `
      <div class="av" style="${faceBg(p)}; border-color:${p.color}"></div>
      <div style="min-width:0; flex:1">
        <div class="nm">${p.name}${p.id === MYPID ? `<span class="mine-badge">${ja() ? "あなた" : "you"}</span>` : ""}
          <span class="age">${fage(R.AGES[p.pos])}</span></div>
        <div class="row">
          <span class="m1">${fm(p.money)}</span>
          <span class="m2">★${p.learn}</span>
          <span class="m3">♥${p.happy}</span>
        </div>
      </div>`;
    s.appendChild(c);
  });
}

/* ---------- 進行役パネル ----------
   ゲームのモーダルとは別のオーバーレイを使う（できごとの表示と取り合わない） */
function openHost(html) {
  $("hostBox").innerHTML = html;
  $("hostOverlay").classList.add("open");
  document.body.classList.add("host-open");
}
function closeHost() {
  $("hostOverlay").classList.remove("open");
  $("hostBox").innerHTML = "";
  document.body.classList.remove("host-open");
}
const hostOpen = () => $("hostOverlay").classList.contains("open");
const iAmHost = () => !!G && MYPID === G.hostId;
const ask = t => window.confirm(L(t));

function renderHostPanel() {
  if (!G || !iAmHost()) { closeHost(); return; }
  const cur = G.phase === "play" ? G.players[G.turn] : null;
  const rows = G.players.map(p => {
    const tags = [];
    if (p.id === G.hostId) tags.push(ja() ? "進行役" : "host");
    if (cur && p.id === cur.id) tags.push(ja() ? "いまの手番" : "current turn");
    if (p.left) tags.push(ja() ? "退出" : "left");
    else if (p.done) tags.push(ja() ? "ゴール" : "finished");
    return `<div class="host-row${p.connected ? "" : " off"}">
      <span class="hn"><span class="p-dot" style="background:${p.color}"></span>${p.name}
        <span class="tag">${p.connected ? (ja() ? "接続中" : "online") : (ja() ? "切断中" : "offline")}</span></span>
      ${tags.map(t => `<span class="tag">${t}</span>`).join("")}
      ${p.id === MYPID || p.left ? "" : `<button class="host-act" data-pass="${p.id}">${ja() ? "ゆずる" : "make host"}</button>
      <button class="host-act danger" data-kick="${p.id}">${ja() ? "外す" : "Remove"}</button>`}
    </div>`;
  }).join("");

  const btns = [];
  if (G.phase === "cards") btns.push(`<button class="host-act" id="hForce">${ja()
    ? "まだの人を待たずに始める" : "Start without the ones still looking"}</button>`);
  if (G.phase === "play" && cur) btns.push(`<button class="host-act" id="hSkip">${ja()
    ? `${cur.name} さんの番をとばす` : `Skip ${cur.name}'s turn`}</button>`);
  btns.push(`<button class="host-act danger" id="hReset">${ja()
    ? "ロビーにもどす" : "Back to the lobby"}</button>`);

  openHost(`<div class="rule-page">
    <button class="rule-close" id="hClose">✕</button>
    <span class="m-tag" style="background:#5B7FA8">${ic("tools", "s")} ${ja() ? "進行役メニュー" : "Host tools"}</span>
    <h2>${ja() ? "進行がとまったとき" : "When the game gets stuck"}</h2>
    <div class="host-note">${ja()
      ? "端末が落ちた・席を外した・まちがえて入った——そんなときだけ使ってください。<br>ゲームの中身は変わりません。"
      : "Only for when a device dies, someone steps out, or joins by mistake.<br>None of this changes the game itself."}</div>
    <div class="host-list">${rows}</div>
    <div class="host-btns">${btns.join("")}</div>
  </div>`);

  $("hClose").onclick = closeHost;
  $("hostBox").querySelectorAll("[data-kick]").forEach(b => b.onclick = () => {
    const p = G.players.find(x => x.id === b.dataset.kick) || { name: "" };
    if (!ask(G.phase === "lobby"
      ? { ja: `${p.name} さんを名簿から外します。よろしいですか？`, en: `Remove ${p.name} from the room. Are you sure?` }
      : { ja: `${p.name} さんを、ここから先の進行から外します（けっか発表にも出ません）。よろしいですか？`,
          en: `${p.name} will be dropped from the rest of the game (and from the results). Are you sure?` })) return;
    send({ t: "kick", id: b.dataset.kick });
  });
  $("hostBox").querySelectorAll("[data-pass]").forEach(b => b.onclick = () => {
    const p = G.players.find(x => x.id === b.dataset.pass) || { name: "" };
    if (!ask({ ja: `進行役を ${p.name} さんにゆずります。よろしいですか？`, en: `Hand the host role to ${p.name}. Are you sure?` })) return;
    send({ t: "passHost", id: b.dataset.pass });
  });
  if ($("hForce")) $("hForce").onclick = () => {
    const left = G.players.filter(p => !p.seen).map(p => p.name).join(ja() ? "、" : ", ");
    if (!ask({ ja: `まだカードを見ていない人（${left}）を待たずに始めます。よろしいですか？`,
               en: `Start without those who haven't opened their card (${left}). Are you sure?` })) return;
    send({ t: "forceCards" }); closeHost();
  };
  if ($("hSkip")) $("hSkip").onclick = () => {
    if (!ask({ ja: `${cur.name} さんの番をとばして、次の人にすすみます。よろしいですか？`,
               en: `Skip ${cur.name}'s turn and move on. Are you sure?` })) return;
    send({ t: "skipTurn" }); closeHost();
  };
  $("hReset").onclick = () => {
    if (!ask({ ja: "いまのゲームをやめて、ロビーにもどります。とちゅうの結果は消えます。よろしいですか？",
               en: "End this game and return to the lobby. Progress will be lost. Are you sure?" })) return;
    send({ t: "reset" }); closeHost();
  };
}

/* ---------- モーダル部品 ---------- */
const tagChip = (type, label) => {
  const m = R.TYPE_META[type] || R.TYPE_META.event;
  return `<span class="m-tag" style="background:${m.chip}">${ic(m.icon, "s")} ${label != null ? label : L(m.label)}</span>`;
};
/* ステータスがどう変わったかを、前後の数字で見せる */
function chgPanel(before, fx) {
  const rows = [
    ["money", ja() ? "おかね" : "Money", before.money, fx.money || 0, v => fm(v)],
    ["learn", ja() ? "まなび" : "Learn", before.learn, fx.learn || 0, v => "★" + v],
    ["happy", ja() ? "ハッピー" : "Happy", before.happy, fx.happy || 0, v => "♥" + v],
  ].filter(r => r[3] !== 0);
  if (!rows.length) return `<div class="fx-line"><span class="fx">${ja() ? "数字は変わらなかった" : "No change"}</span></div>`;
  const emo = (fx.happy || 0) > 0 ? "joy" : ((fx.money || 0) > 0 || (fx.learn || 0) > 0 ? "fun" : "sad");
  return `<div class="chg-body">
    <div class="chg-char" style="background-image:url(./chars/${before.char}-${emo}.png)"></div>
    <div class="chg-rows">${rows.map(([k, label, base, d, f]) => `
      <div class="chg-r ${k}"><span class="k">${label}</span>
        <span class="v"><s>${f(base)}</s>${f(base + d)}</span>
        <span class="d ${d > 0 ? "up" : "dn"}">${d > 0 ? "+" : ""}${k === "money" ? fm(d) : d}</span></div>`).join("")}
    </div></div>`;
}
function beforeOf(pid) {
  const p = G.players.find(x => x.id === pid) || { money: 0, learn: 0, happy: 0, color: R.PCOLORS[0] };
  return { money: p.money, learn: p.learn, happy: p.happy, char: charOf(p) };
}
function reqLabel(p, o) {
  const parts = [];
  if (o.req.univ) parts.push(ja() ? "大学を出ていること" : "a university degree");
  const em = R.effectiveMoneyReq(p, o), el2 = R.effectiveLearnReq(p, o);
  if (o.req.money) {
    const memo = [];
    if (p.shienDiscount && (o.tag === "shien" || o.tag === "manabi")) memo.push(ja() ? "支援サポートで−50万" : `aid support −${fm(50)}`);
    if (p.perk === "kokusai" && o.tag === "global") memo.push(ja() ? "国際感覚で−50万" : `global sense −${fm(50)}`);
    parts.push(`${ja() ? "おかね" : "Money"} ${fm(em)}` + (memo.length ? `（${memo.join("・")}）` : ""));
  }
  if (o.req.learn) parts.push(`${ja() ? "まなび" : "Learn"} ★${el2}` + (el2 < o.req.learn ? (ja() ? "（英語ネイティブで−2）" : "（native English −2）") : ""));
  if (o.req.maxMoney != null) parts.push(ja() ? `所得制限 おかね${fm(o.req.maxMoney)}未満` : `Income limit: under ${fm(o.req.maxMoney)}`);
  return parts.join(" ＋ ");
}
const waitingNote = who => `<div class="waiting-note">${ic("clock", "s")} ${ja() ? `${who} さんが かくにん中…` : `Waiting for ${who}…`}</div>`;
/* 見ているだけのときは、自分の番とはっきり見た目を変える */
const watchHead = a => `<div class="watch-head"><span class="av" style="${faceBg(a)}"></span>${
  ja() ? `${a.name} さんの番を見ています` : `Watching ${a.name}'s turn`}</div>`;
const privNote = v => (v && (!Array.isArray(v) || v.length))
  ? `<div class="m-note priv">${(Array.isArray(v) ? v.map(L).join("<br>") : L(v))}</div>` : "";

/* ---------- 保留中のできごと（サーバーから来る） ---------- */
function renderPending() {
  const pd = G.pending;
  if (!pd) { if (isOpen() && lastKey) closeModal(); return; }
  if (animTimer) return;                       /* コマが動き終わってから出す */
  const key = JSON.stringify(pd);
  if (key === lastKey && isOpen()) return;
  lastKey = key;
  const mine = pd.for === MYPID;
  const actor = G.players.find(p => p.id === pd.for) || { name: "?", color: R.PCOLORS[0] };
  const type = pd.type === "heavy" ? "heavy" : (["learn", "event", "income", "cost"].includes(pd.type) ? pd.type : "choice");

  if (pd.kind === "info") {
    /* 「みんなで話す」マスだけは観戦ではなく、全員が同じ画面を見て話す時間 */
    const talk = pd.type === "talk";
    openModal(`<div class="m-head">${mine || talk ? "" : watchHead(actor)}
        ${tagChip(pd.type === "heavy" ? "heavy" : (R.TYPE_META[pd.type] ? pd.type : "event"))}
        <h2>${L(pd.title)}</h2>
        ${talk ? `<p class="m-sub">${ja() ? `${actor.name} さんが このマスに止まりました` : `${actor.name} landed here`}</p>` : ""}</div>
      <div class="m-body">
        <p class="m-lead">${L(pd.body)}</p>
        ${pd.note ? `<div class="m-note${talk ? " talk" : ""}">${L(pd.note)}</div>` : ""}
        ${privNote(pd.pnote)}
        ${talk ? "" : chgPanel(beforeOf(pd.for), pd.fx || {})}
        ${mine ? `<button class="m-btn" id="mOk">${talk ? (ja() ? "話せた！ すすむ" : "We talked — continue") : "OK"}</button>`
          : (talk ? `<div class="waiting-note">${ic("people", "s")} ${ja() ? "みんなで話してから、すすみます" : "Talk together, then continue"}</div>` : waitingNote(actor.name))}
      </div>`, !mine && !talk);
    if (mine) $("mOk").onclick = () => { send({ t: "ok" }); };
  }
  else if (pd.kind === "result") {
    openModal(`<div class="m-head">${mine ? "" : watchHead(actor)}
        ${tagChip(type, mine ? (ja() ? "えらんだ！" : "Chosen!") : (ja() ? `${actor.name} さんが えらんだ` : `${actor.name} chose`))}
        <h2>${L(pd.title)}</h2></div>
      <div class="m-body">
        <p class="m-lead">${L(pd.body)}${ja() ? "。" : "."}</p>
        ${pd.notes && pd.notes.length ? `<div class="m-note">${pd.notes.map(L).join("<br>")}</div>` : ""}
        ${privNote(pd.pnotes)}
        ${chgPanel(beforeOf(pd.for), pd.fx || {})}
        ${mine ? `<button class="m-btn" id="mOk">OK</button>` : waitingNote(actor.name)}
      </div>`, !mine);
    if (mine) $("mOk").onclick = () => { send({ t: "ok" }); };
  }
  else if (pd.kind === "choice" && !mine) {
    /* 何が見えていて何が見えていないかは、その人だけのもの。
       ほかの人には、トビラの名前（盤面に出ているもの）と「待っている」ことだけを見せる */
    openModal(`${watchHead(actor)}
      <div class="watch-body">
        <p class="watch-lead">${ja() ? "いま、このトビラの前に立っています。" : "Standing in front of this door."}</p>
        <div class="watch-door">${ic(pd.def.heavy ? "bolt" : "door")} ${L(pd.def.title)}</div>
        <div class="watch-wait">${ja() ? `${actor.name} さんが えらんでいます…` : `${actor.name} is choosing…`}</div>
        <p class="watch-lead">${ja() ? "えらび終わったら、みんなに結果が出ます。" : "The result appears for everyone once they choose."}</p>
      </div>`, true);
  }
  else if (pd.kind === "choice") {
    const p = pd.actor;
    const doors = R.shuffle(pd.opts.map((_, i) => i)).map(i => {
      const o = pd.opts[i], st = pd.states[i];
      if (st === "unseen") return `<button class="door unseen" disabled>
          <span class="d-title">？？？</span>
          <span class="d-desc">${ja() ? "この選択肢は、見えない。" : "You can't see this option."}</span></button>`;
      const key2 = reqLabel(p, o), ok = st === "open";
      const em = R.effectiveMoneyReq(p, o), raw = o.fx.money || 0, efx = R.effectiveMoneyFx(p, o);
      const cut = efx !== raw, redundant = o.req.money && efx === -em;
      const loan = o.special === "shogakukin" && !(p.shienDiscount || p.perk === "shienPro");
      const cost = ((efx || cut) && !redundant)
        ? `<span class="d-cost ${efx < 0 ? "minus" : "plus"}">${ic("coin", "s")} ${ja() ? "おかね" : "Money"} ${cut ? `<s>${fm(raw)}</s>→` : ""}${efx > 0 ? "+" : ""}${fm(efx)}${loan ? (ja() ? "＋返済" : " + repayment") : ""}</span>` : "";
      /* 何が足りないのかを取りちがえないように、理由ごとに書きわける。
         大学のカギだけは、いまさら取りに行けないもの */
      const short = (o.req.univ && !p.univ)
        ? (ja() ? "（大学に行っていない…）" : " (no degree…)")
        : (o.req.maxMoney != null && p.money >= o.req.maxMoney
          ? (ja() ? "（対象外…）" : " (not eligible…)") : (ja() ? "（たりない…）" : " (not enough…)"));
      return `<button class="door ${ok ? "open" : "locked"}" data-i="${i}" ${ok && mine ? "" : "disabled"}>
          <span class="d-title">${L(o.t)}</span>
          <span class="d-desc">${L(o.d)}</span>
          ${key2 ? `<span class="d-key">${ic(ok ? "door" : "lock", "s")}${ja() ? "カギ：" : "Key: "}${key2}${ok ? "" : short}</span>` : ""}${cost}
        </button>`;
    }).join("");
    const stuck = !(pd.states || []).includes("open");
    openModal(`<div class="m-head">
        ${tagChip(pd.def.heavy ? "heavy" : "choice")}
        <h2>${L(pd.def.title)}</h2>
        <p class="m-sub">${ja()
          ? `${p.name}・${R.AGES[p.pos]}歳 ／ おかね ${fm(p.money)} ／ まなび ★${p.learn}`
          : `${p.name} · Age ${R.AGES[p.pos]} / Money ${fm(p.money)} / Learn ★${p.learn}`}</p>
      </div>
      <div class="m-body">
        <p class="m-lead">${L(pd.def.body)}</p>
        <div class="door-list">${doors}</div>
        ${stuck && mine ? `<div class="m-note" style="margin-top:14px">${ja() ? "開けられるトビラが、ひとつもなかった…。" : "Not a single door would open…"}</div>
          <button class="m-btn" id="mPass">${ja() ? "今回は見送る" : "Pass this time"}</button>` : ""}
        ${mine ? "" : waitingNote(actor.name)}
      </div>`);
    if (stuck && mine && $("mPass")) $("mPass").onclick = () => send({ t: "choose", i: -1, pass: true });
    if (mine) document.querySelectorAll("#modalBox .door:not(:disabled)").forEach(b => {
      b.onclick = () => send({ t: "choose", i: +b.dataset.i });
    });
  }
  else if (pd.kind === "goal") {
    /* 25歳では返し終わらない。清算せず、背負ったまま先へ進む */
    const loanNote = pd.loan > 0
      ? `<div class="m-note">${ja() ? `奨学金が、まだ <b>${fm(pd.loan)}</b> のこっている。<br>25歳——返済は、これからも続く。`
        : `<b>${fm(pd.loan)}</b> of your scholarship is still unpaid.<br>Age 25 — the repayments go on.`}</div>` : "";
    openModal(`<div class="m-head">${mine ? "" : watchHead(actor)}
        ${tagChip("goal")}
        <h2>${ja() ? `${actor.name} さん、25歳でゴール！` : `${actor.name} reached the goal at 25!`}</h2></div>
      <div class="m-body">
        <p class="m-lead">${ja() ? `6歳からの19年間、おつかれさま！ ${pd.rankAt}番目のゴールです。` : `19 years from age 6 — well done! Finished #${pd.rankAt}.`}</p>
        ${loanNote}${chgPanel(beforeOf(pd.for), pd.fx || {})}
        ${mine ? `<button class="m-btn" id="mOk">OK</button>` : waitingNote(actor.name)}
      </div>`, !mine);
    if (mine) $("mOk").onclick = () => send({ t: "ok" });
  }
}

/* これまでに自分がえらんだ選択肢。
   えらばなかった選択肢——とくに「？？？」の中身——はここにも出さない。
   それがわかるのは、全員がゴールしたあとのネタバラシだけ。 */
function myChoiceList() {
  const list = (YOU && YOU.myChoices) || [];
  if (!list.length) return "";
  const rows = list.map(c => {
    const fx = [];
    if (c.fx.money) fx.push(`<span class="m1">${c.fx.money > 0 ? "+" : ""}${fm(c.fx.money)}</span>`);
    if (c.fx.learn) fx.push(`<span class="m2">★+${c.fx.learn}</span>`);
    if (c.fx.happy) fx.push(`<span class="m3">♥+${c.fx.happy}</span>`);
    return `<div class="mc-row">
      <span class="mc-age">${fage(c.age)}</span>
      <span class="mc-main"><span class="mc-door">${L(c.door)}</span>
        <span class="mc-t">${L(c.t)}</span>
        ${fx.length ? `<span class="mc-fx">${fx.join("")}</span>` : ""}</span></div>`;
  }).join("");
  return `<div class="fam-mine">
    <div class="k">${ic("check", "s")} ${ja() ? `あなたがえらんできたこと（${list.length}件）` : `What you have chosen so far (${list.length})`}</div>
    <div class="mc-list">${rows}</div>
    <div class="mc-note">${ja()
      ? "えらばなかった選択肢は、ここには出ません。ぜんぶ見られるのは、全員がゴールしたあとです。"
      : "The options you didn't take aren't shown here — you'll see them all once everyone finishes."}</div>
  </div>`;
}

/* ---------- 家庭カード（自分のぶんだけ） ---------- */
function showCard(review) {
  if (!YOU) return;
  const p = YOU;
  const me = G.players.find(x => x.id === MYPID) || { money: p.fam.money, name: "", pos: 0, color: R.PCOLORS[0] };
  /* タグの数ではなく、これから出会う「？？？」の実数を出す。
     タグ数だと結果発表の 👁 の数と食いちがう（例：タグ3個でも選択肢は5個） */
  const hiddenN = R.hiddenOptionCount(p, me.pos || 0);
  const tone = R.FAM_TONE[p.fam.region.ja] || ["#E9A87C", "#D98E63"];
  lastKey = "card";
  openModal(`
    <div class="fam-top" style="background:linear-gradient(120deg,${tone[0]},${tone[1]})">
      <div class="av" style="${faceBg(me)}"></div>
      <div style="min-width:0">
        <span class="pill">${ic("home", "s")} ${L(R.TYPE_META.fam.label)}</span>
        <div class="nm">${L(p.fam.name)}</div>
      </div>
    </div>
    <div class="m-body">
      <div class="fam-story">${L(p.fam.story)}
        <div class="fam-asa">${ic("sun", "s")} <b>${ja() ? "あなたの朝" : "Your morning"}</b>：${L(p.fam.asa)}</div>
      </div>
      <div class="fam-stats">
        <div class="fs wide"><div class="k">${ja() ? "いまのおかね" : "Money now"}</div><div class="v">${fm(me.money)}</div></div>
        <div class="fs"><div class="k">${ja() ? "おしごとの基本給" : "Base pay"}</div>
          <div class="v">${fm(p.fam.wage)} <small>${ja() ? `＋★×${fm(p.mult)}` : `+★×${fm(p.mult)}`}</small></div></div>
        <div class="fs"><div class="k">${ja() ? "仕送り" : "Allowance"}</div>
          <div class="v">${p.allow > 0 ? `+${fm(p.allow)}` : (ja() ? "なし" : "none")}
            <small>${p.allow > 0 ? (ja() ? "かせぐたび" : "per payday") : ""}</small></div></div>
      </div>
      <div class="fam-perk">
        <div class="k">${ic("spark", "s")} ${ja() ? "あなたのとくい" : "Your strength"}</div>
        <div class="v">${L(p.fam.perkText)}</div>
      </div>
      ${hiddenN > 0 ? `<div class="fam-hid">${ic("eye", "s")}<span>${ja()
        ? `このさき、<b>${hiddenN}個</b>の選択肢は「？？？」としか見えません。`
        : `<b>${hiddenN}</b> options ahead will show only as ？？？.`}</span></div>` : ""}
      ${myChoiceList()}
      <div class="fam-secret">${ic("lock", "s")} ${ja() ? "このカードは、あなたの端末にしか表示されません。" : "This card is shown only on your device."}</div>
      <button class="m-btn" id="mCard">${review ? (ja() ? "とじる" : "Close") : (ja() ? "OK、覚えた" : "Got it")}</button>
    </div>`);
  $("mCard").onclick = () => { closeModal(); if (!review) send({ t: "seen" }); };
}

/* ---------- 描画のふりわけ ---------- */
function render() {
  if (!G) return;
  if (G.phase === "lobby") {
    showScreen("wait");
    $("roomCode").textContent = ROOM || "------";
    const host = MYPID === G.hostId;
    $("heavyWrap").style.display = host ? "" : "none";
    $("startBtn").style.display = host ? "" : "none";
    /* ショート版は1人でも始められる（検証用）。ひとりのときは、そのことを伝える */
    $("waitNote").textContent = host
      ? (G.players.length < 2
          ? (ja() ? "ひとりでも始められます（1〜4人）" : "You can start alone (1–4 players)")
          : (ja() ? "全員そろったら開始してください" : "Start when everyone is in"))
      : (ja() ? "進行役が開始するのを待っています…" : "Waiting for the host to start…");
    $("waitList").innerHTML = G.players.map(p =>
      `<div class="p-row wait-row"><span class="p-dot" style="background:${p.color}"></span>
       <span style="flex:1; font-weight:700">${p.name}${p.id === MYPID ? `<span class="mine-badge">${ja() ? "あなた" : "you"}</span>` : ""}${p.id === G.hostId ? (ja() ? "・進行役" : " · host") : ""}</span>
       <span class="st">${p.connected ? (ja() ? "接続中" : "online") : (ja() ? "切断中" : "offline")}</span>
       ${host && p.id !== MYPID ? `<button class="rm" data-kick="${p.id}" aria-label="remove">✕</button>` : ""}</div>`).join("");
    $("waitList").querySelectorAll("[data-kick]").forEach(b => b.onclick = () => {
      const p = G.players.find(x => x.id === b.dataset.kick) || { name: "" };
      if (!ask({ ja: `${p.name} さんを名簿から外します。よろしいですか？`, en: `Remove ${p.name} from the room. Are you sure?` })) return;
      send({ t: "kick", id: b.dataset.kick });
    });
    /* 進行役の端末が落ちて戻ってこないとき、残った人が引きつげる */
    const hostP = G.players.find(p => p.id === G.hostId);
    $("claimWrap").style.display = (!host && hostP && !hostP.connected) ? "" : "none";
    $("claimBtn").textContent = ja() ? `進行役を引きつぐ（${hostP ? hostP.name : ""} さんが切断中）` : `Take over as host (${hostP ? hostP.name : ""} is offline)`;
    closeModal(); closeHost();
  }
  else if (G.phase === "cards") {
    showScreen("game");
    hostTools();
    renderBoard(); renderStrip(); shown = {}; renderTokens();
    $("turnPill").innerHTML = `<span class="tp-txt">${ja() ? "家庭カードをかくにん中" : "Checking family cards"}</span>`;
    $("diceBtn").disabled = true;
    $("diceLabel").textContent = ja() ? "まっています" : "Waiting";
    $("diceFace").style.display = "none";
    if (YOU && !YOU.seen) { if (lastKey !== "card") showCard(false); }
    else {
      const yet = G.players.filter(p => !p.seen);
      const names = yet.map(p => p.name + (p.connected ? "" : ja() ? "（切断中）" : " (offline)")).join(ja() ? "、" : ", ");
      lastKey = "waitcards";
      openModal(`<div class="m-head">${tagChip("fam")}
          <h2>${ja() ? "みんながカードを見ています" : "Everyone is checking their card"}</h2></div>
        <div class="m-body">
          <p class="m-lead">${ja() ? `まだの人：<b>${names}</b>` : `Still looking: <b>${names}</b>`}</p>
          <button class="m-btn ghost" id="mAgainCard">${ja() ? "自分のカードをもう一度見る" : "See my card again"}</button>
          ${iAmHost() ? `<button class="m-btn" id="mForce">${ja()
            ? "待たずに始める（進行役）" : "Start without them (host)"}</button>` : ""}
        </div>`);
      $("mAgainCard").onclick = () => showCard(true);
      if ($("mForce")) $("mForce").onclick = () => {
        if (!ask({ ja: `まだカードを見ていない人（${names}）を待たずに始めます。よろしいですか？`,
                   en: `Start without those who haven't opened their card (${names}). Are you sure?` })) return;
        send({ t: "forceCards" });
      };
    }
  }
  else if (G.phase === "play") {
    showScreen("game");
    hostTools();
    if (!$("board").children.length) renderBoard();
    renderStrip();
    G.players.forEach(p => { if (shown[p.id] == null) shown[p.id] = p.pos; });
    renderTokens();
    stepAnim();
    const cur = G.players[G.turn];
    const mine = cur && cur.id === MYPID;
    $("turnPill").innerHTML = `<span class="av" style="${faceBg(cur)}; border-color:${cur.color}"></span>`
      + `<span class="tp-txt">${ja() ? `${cur.name} さんの番・${R.AGES[cur.pos]}歳` : `${cur.name}'s turn · Age ${R.AGES[cur.pos]}`}</span>`
      + (cur.connected ? "" : `<span class="tp-off">${ja() ? "切断中" : "offline"}</span>`);
    const child = cur.pos < 4;
    $("diceFace").style.display = child ? "none" : "grid";
    if (!spinTimer) diceFace(G.dice || 1);
    $("diceBtn").disabled = !(mine && !G.pending);
    $("diceLabel").textContent = mine
      ? (child ? (ja() ? "一歩すすむ" : "Step forward") : (ja() ? "サイコロを回す" : "Roll the dice"))
      : (ja() ? `${cur.name} さんの番` : `${cur.name}'s turn`);
    renderPending();
  }
  else if (G.phase === "result") { showScreen("result"); closeModal(); closeHost(); showResult(); }
}

/* 進行役だけに工具アイコンを出し、パネルを開いたままなら中身を最新にする */
function hostTools() {
  $("hostBtn").style.display = iAmHost() ? "" : "none";
  if (hostOpen()) renderHostPanel();
}

/* ---------- 結果発表 ---------- */
function showResult() {
  const playing = G.players.filter(p => !p.left);
  const gone = G.players.filter(p => p.left);
  const sorted = [...playing].sort((a, b) => b.happy - a.happy || b.money - a.money);
  const list = $("resultList");
  list.innerHTML = "";
  sorted.forEach((p, i) => {
    const total = p.open + p.locked + p.unseen;
    const pct = n => total ? Math.round(n / total * 100) : 0;
    const diff = p.money - p.initMoney;
    const tone = R.FAM_TONE[p.fam.region.ja] || ["#E9A87C", "#D98E63"];
    const card = document.createElement("div");
    card.className = "res-card";
    card.innerHTML = `
      <div class="res-head">
        <div class="av" style="${faceBg(p)}; border-color:${p.color}"></div>
        <div style="min-width:0">
          <span class="rank">${ja() ? `${i + 1}位` : `#${i + 1}`}</span>
          <div class="r-name">${p.name}</div>
          <div class="r-fam" style="color:${tone[1]}">${ic("home", "s")} ${L(p.fam.name)}</div>
        </div>
      </div>
      <div class="r-stats">
        <span class="fx m3">♥ ${p.happy}</span>
        <span class="fx m1">${fm(p.money)} <small style="font-weight:700">(${diff >= 0 ? "+" : ""}${fm(diff)})</small></span>
        <span class="fx m2">★ ${p.learn}</span>
        ${p.loan > 0 ? `<span class="fx" style="color:#C98A3C">${ja() ? `奨学金 ${fm(p.loan)} 未返済` : `${fm(p.loan)} unpaid`}</span>` : ""}
      </div>
      <div class="r-ending"><b>${ja() ? "25歳のいま" : "Life at 25"}</b>：${L(R.endingText(p, playing.length === 1))}</div>
      <div class="doorbar">
        <div class="seg-open" style="width:${pct(p.open)}%"></div>
        <div class="seg-lock" style="width:${pct(p.locked)}%"></div>
        <div class="seg-unseen" style="width:${pct(p.unseen)}%"></div>
      </div>
      <div class="doorbar-label">${ja()
        ? `出会ったトビラ ${total}枚 ── <span class="lo">開けられた ${p.open}</span>／<span class="ll">カギが足りなかった ${p.locked}</span>／<span class="lu">見えていなかった ${p.unseen}</span>`
        : `${total} doors met ── <span class="lo">opened ${p.open}</span> / <span class="ll">short of keys ${p.locked}</span> / <span class="lu">never saw ${p.unseen}</span>`}</div>
      <button class="chip-btn rv-btn" data-p="${p.id}">${ja() ? "トビラのネタバラシを見る" : "See this player's door reveal"}</button>`;
    list.appendChild(card);
  });
  list.querySelectorAll(".rv-btn").forEach(b => b.onclick = () => showRevealModal(b.dataset.p));
  $("resLeftNote").innerHTML = gone.length
    ? (ja() ? `とちゅうで抜けた人：${gone.map(p => p.name).join("、")}` : `Left partway: ${gone.map(p => p.name).join(", ")}`)
    : "";
  const totalUnseen = playing.reduce((s, p) => s + p.unseen, 0);
  /* 1人プレイでは「見くらべ」が成立しない。ネタバラシとトビラ一覧が主役になる */
  const solo = playing.length === 1;
  $("insightBox").innerHTML = ja() ? `
    <b>■ ふりかえりタイム</b><br>
    ${solo
      ? "この19年で集まった <b>♥ハッピー</b> は、<b>じぶんの意思で選べた回数</b>だ。<br>♥を生むトビラのカギは、<b>生まれた場所</b>によってぜんぜん違う。"
      : "順位を決めたのは、お金の多さじゃなくて <b>♥ハッピー</b>。<br>♥が多いということは——<b>人生の選択肢をたくさん持ち、じぶんの意思で選べた</b>ということ。<br>でも、♥を生むトビラのカギは、<b>生まれた場所</b>によってぜんぜん違った。"}<br><br>
    ${solo ? `あなたの19年間で、<b>${totalUnseen}枚のトビラが「見えてすら いなかった」</b>。`
           : `このテーブル全体で、<b>${totalUnseen}枚のトビラが「見えてすら いなかった」</b>。`}<br>
    それはウガンダの家庭だけの話じゃない——<b>支え合いのトビラ</b>は、めぐまれた家庭からこそ見えなかったはず。<br>
    カギが足りないのと、扉があることを知らないのは、ぜんぜん違う。<br><br>
    ${solo
      ? "<b>「ネタバラシ」ボタン</b>で？？？の中身を、<b>「19年間のトビラ一覧」</b>で通らなかった道を見てみよう。ここがこのゲームの本番。"
      : "それぞれのカードの<b>「ネタバラシ」ボタン</b>で、？？？の中身をのぞいてみよう。"}<br><br>
    ${solo ? "考えてみよう：" : "話してみよう："}<br>
    ・同じ「おしごとマス」・同じ★の数なのに、かせぎがぜんぜんちがった。それは本人の努力のちがいだろうか？<br>
    ・ウガンダ育ちは、★を増やすだけではかせぎが伸びなかった。「まなび」が実るために必要だった<b>もうひとつのカギ</b>は何だった？<br>
    ・あなたの家庭カードから見えなかったのは、どんなトビラだった？　逆に、見えていた強みは？<br>
    ・親を亡くしたウガンダの子には、何が「見えて」いた？　それはなぜだろう？<br>
    ・AAIの扉は「ずるい」？——その扉には「志」の約束がついていた。25歳のいま、その人はどこで何をしていた？<br>
    ・今日あなたが学校に持ってきたもの——スマホ、無料の教科書、給食。それは、どの家庭カードの世界のものだった？<br>
    ・日本にいる私たちが、世界の遺児にわたせる「カギ」って、何だろう？` : `
    <b>■ Reflection time</b><br>
    ${solo
      ? "The <b>♥ Happiness</b> you gathered over these 19 years is <b>the number of times you chose with your own will</b>.<br>But the keys to the ♥ doors differ completely depending on <b>where you were born</b>."
      : "The ranking wasn't decided by money, but by <b>♥ Happiness</b>.<br>More ♥ means you <b>held more of life's options — and chose with your own will</b>.<br>But the keys to the ♥ doors were completely different depending on <b>where you were born</b>."}<br><br>
    ${solo ? `In your 19 years, <b>${totalUnseen} doors were never even visible</b>.`
           : `Across this table, <b>${totalUnseen} doors were never even visible</b>.`}<br>
    And that's not only about the Ugandan families — the <b>doors of community support</b> were invisible to the well-off families.<br>
    Lacking a key, and not knowing a door exists, are very different things.<br><br>
    ${solo
      ? "Open the <b>Reveal button</b> to see inside the ？？？, and <b>All doors of the 19 years</b> to see the roads you never walked. This is where the game really happens."
      : "Use each player's <b>Reveal button</b> to peek inside the ？？？."}<br><br>
    ${solo ? "Think about it:" : "Talk about it:"}<br>
    · Same work square, same ★ — completely different pay. Was that about effort?<br>
    · For those raised in Uganda, more ★ alone didn't raise pay. What was <b>the other key</b> that made learning bear fruit?<br>
    · Which doors were invisible from your Family Card? And what strengths could you see?<br>
    · What could the orphan in Uganda "see"? Why?<br>
    · Was the AAI door "unfair"? — It came with a promise of purpose. At 25, where was that player, and what were they doing?<br>
    · The things you brought to school today — a phone, free textbooks, school lunch. Which family card's world do they belong to?<br>
    · What "keys" could we hand to orphans around the world?`;
}

/* ---------- ネタバラシ ---------- */
function rawReqLabel(o) {
  const parts = [];
  if (o.req.univ) parts.push(ja() ? "大学を出ていること" : "university degree");
  if (o.req.money) parts.push(`${ja() ? "おかね" : "Money "}${fm(o.req.money)}`);
  if (o.req.learn) parts.push(`★${o.req.learn}`);
  if (o.req.maxMoney != null) parts.push(ja() ? `所得制限おかね${fm(o.req.maxMoney)}未満` : `income limit: under ${fm(o.req.maxMoney)}`);
  return parts.join("＋");
}
function fxInline(fx) {
  const parts = [];
  if (fx.money) parts.push(`${fx.money > 0 ? "+" : ""}${fm(fx.money)}`);
  if (fx.learn) parts.push(`★+${fx.learn}`);
  if (fx.happy) parts.push(`♥+${fx.happy}`);
  return parts.join(" ");
}
const RV_META = {
  chosen: ["check", { ja: "えらんだ", en: "Chosen" }, "#4CA872"],
  open: ["door", { ja: "開けられた", en: "Could open" }, "#4CA872"],
  locked: ["lock", { ja: "カギ不足", en: "Short of keys" }, "#C98A3C"],
  unseen: ["eye", { ja: "見えてなかった！", en: "Never saw it!" }, "#7E6BC4"],
};
function showRevealModal(pid) {
  const p = G.players.find(x => x.id === pid);
  const secs = (p.doorLog || []).map(e => {
    const rows = e.opts.map((o, i) => {
      const st = e.chosen === i ? "chosen" : e.states[i];
      const [icon, label, col] = RV_META[st];
      const key = rawReqLabel(o), fx = fxInline(o.fx);
      return `<div class="rv-opt ${st}"><span class="rv-ic" style="color:${col}">${ic(icon)}</span>
        <span class="rv-main"><span class="rv-t">${L(o.t)}</span><span class="rv-d">${L(o.d)}</span>
        <span class="rv-meta">${key || (ja() ? "カギなし" : "No key")}${fx ? `　→ ${fx}` : ""}</span></span>
        <span class="rv-st">${L(label)}</span></div>`;
    }).join("");
    return `<div class="rv-door"><div class="rv-title">${e.age != null ? fage(e.age) + " ── " : ""}${L(e.title)}${e.variant ? `（${L(e.variant)}）` : ""}</div>${rows}</div>`;
  }).join("");
  openModal(`<div class="rule-page">
      <button class="rule-close" id="rvClose">✕</button>
      ${tagChip("choice", ja() ? "ネタバラシ" : "The Reveal")}
      <h2>${ja() ? `${p.name} さんが出会ったトビラ、ぜんぶ` : `Every door ${p.name} met`}</h2>
      <p class="m-lead" style="text-align:left">${ja() ? "紫は、ゲーム中「？？？」で中身が見えなかったトビラ。<br>ほんとうは、こんな選択肢だった——" : "Purple marks options hidden as ？？？ during the game.<br>Here's what they really were —"}</p>
      <div class="rv-list">${secs || `<p class='m-lead'>${ja() ? "トビラには出会わなかったみたい。" : "No doors were met."}</p>`}</div>
      <button class="m-btn" id="rvOk">${ja() ? "とじる" : "Close"}</button></div>`);
  $("rvClose").onclick = closeModal; $("rvOk").onclick = closeModal;
}
const whoChips = list => list.map(p => `<span class="who"><span class="p-dot" style="background:${p.color}"></span>${p.name}</span>`).join("");
function showAllDoorsModal() {
  const kt = v => v == null ? "" : (v.ja !== undefined ? v.ja : v);
  const map = new Map();
  G.players.filter(p => !p.left).forEach(p => (p.doorLog || []).forEach(e => {
    const key = `${e.age}|${kt(e.title)}|${kt(e.variant)}`;
    if (!map.has(key)) map.set(key, { age: e.age, title: e.title, variant: e.variant, opts: e.opts, perOpt: e.opts.map(() => ({ chosen: [], locked: [], unseen: [] })) });
    const g = map.get(key);
    e.opts.forEach((o, i) => {
      if (!g.perOpt[i]) g.perOpt[i] = { chosen: [], locked: [], unseen: [] };
      if (e.chosen === i) g.perOpt[i].chosen.push(p);
      else if (e.states[i] === "unseen") g.perOpt[i].unseen.push(p);
      else if (e.states[i] === "locked") g.perOpt[i].locked.push(p);
    });
  }));
  R.SQUARES.forEach((sq, i) => {
    if (sq.t !== "choice") return;
    ((sq.key === "machi" || sq.key === "kurashi") ? [true, false] : [true]).forEach(rural => {
      const dummy = { fam: { rural }, perk: null, money: 0, learn: 0, shienDiscount: false, name: "", hidden: [] };
      const def = R.choiceDef(sq.key, dummy);
      const key = `${R.AGES[i]}|${kt(def.title)}|${kt(def.variant)}`;
      if (!map.has(key)) map.set(key, { age: R.AGES[i], title: def.title, variant: def.variant, opts: def.opts, perOpt: def.opts.map(() => ({ chosen: [], locked: [], unseen: [] })), untrodden: true });
    });
  });
  const secs = [...map.values()].sort((a, b) => a.age - b.age).map(g => {
    const rows = g.opts.map((o, i) => {
      const st = g.perOpt[i], key = rawReqLabel(o), fx = fxInline(o.fx), lines = [];
      if (st.chosen.length) lines.push(`<div class="rv-who" style="color:#4CA872">${ic("check", "s")} ${ja() ? "えらんだ" : "Chose"}：${whoChips(st.chosen)}</div>`);
      if (st.locked.length) lines.push(`<div class="rv-who" style="color:#C98A3C">${ic("lock", "s")} ${ja() ? "カギ不足" : "Short of keys"}：${whoChips(st.locked)}</div>`);
      if (st.unseen.length) lines.push(`<div class="rv-who" style="color:#7E6BC4">${ic("eye", "s")} ${ja() ? "見えなかった" : "Couldn't see"}：${whoChips(st.unseen)}</div>`);
      return `<div class="rv-opt ${st.unseen.length ? "unseen" : ""}"><span class="rv-main">
        <span class="rv-t">${L(o.t)}</span><span class="rv-d">${L(o.d)}</span>
        <span class="rv-meta">${key || (ja() ? "カギなし" : "No key")}${fx ? `　→ ${fx}` : ""}</span>${lines.join("")}</span></div>`;
    }).join("");
    return `<div class="rv-door"${g.untrodden ? ' style="opacity:.75"' : ""}>
      <div class="rv-title">${fage(g.age)} ── ${L(g.title)}${g.variant ? `（${L(g.variant)}）` : ""}${g.untrodden ? `<span class="rv-untrod">${ic("walk", "s")} ${ja() ? "だれも通らなかった" : "no one passed here"}</span>` : ""}</div>${rows}</div>`;
  }).join("");
  openModal(`<div class="rule-page">
      <button class="rule-close" id="adClose">✕</button>
      ${tagChip("choice", ja() ? "トビラ一覧" : "All Doors")}
      <h2>${ja() ? "19年間に、こんなトビラがあった" : "The doors of these 19 years"}</h2>
      <div class="rv-list">${secs}</div>
      <button class="m-btn" id="adOk">${ja() ? "とじる" : "Close"}</button></div>`);
  $("adClose").onclick = closeModal; $("adOk").onclick = closeModal;
}
$("allDoorsBtn").onclick = showAllDoorsModal;

/* ---------- あそびかた ---------- */
const RULE_PAGES = [
  {type:"start", tag:{ja:"このゲームは",en:"This game"}, title:{ja:"世界のどこかに、生まれる",en:"Born somewhere in the world"}, items:[
    ["globe",{ja:"あなたは、世界のどこかの家庭に生まれます。<b>生まれる場所は、選べません</b>。",en:"You are born into a family somewhere in the world. <b>You don't choose where.</b>"}],
    ["die",{ja:"サイコロも盤面も、みんなおなじ。でも、<b>見える景色</b>は人によってちがう——それがこのゲームです。",en:"Same dice, same board for everyone. But <b>what you can see</b> is different — that's this game."}],
    ["door",{ja:"同じマスに止まっても、開けられるトビラ・見えるトビラがちがうかも。理由は、遊びおわってから分かります。",en:"On the same square, the doors you can open — or even see — may differ. You'll learn why after the game."}],
  ]},
  {type:"goal", tag:{ja:"めざすもの",en:"The goal"}, title:{ja:"順位を決めるのは ♥ハッピー",en:"Ranking is decided by ♥ Happiness"}, items:[
    ["die",{ja:"これは<b>6歳から25歳までの19年間</b>をたどる人生すごろく。サイコロを回して、ゴールをめざそう。",en:"This board traces <b>19 years, from age 6 to 25</b>. Roll the dice and head for the goal."}],
    ["walk",{ja:"<b>子ども時代（6〜15歳）はサイコロを使わず、1マスずつ</b>進む。人生の土台をつくる時間だ。",en:"<b>In childhood (6–15) there's no dice — one square at a time.</b> These years build your base."}],
    ["heart",{ja:"最後の順位は、おかねの多さじゃなく <b>♥ハッピーの数</b>で決まる！",en:"The final ranking isn't about money — it's the number of <b>♥ Happiness</b>!"}],
    ["door",{ja:"♥は、人生の選択「<b>トビラ</b>」を開けるともらえる。<b>♥の数＝じぶんの意思で選べた数</b>だ。",en:"You earn ♥ by opening life's <b>Doors</b>. <b>♥ = how often you chose with your own will.</b>"}],
    ["people",{ja:"22歳に<b>「みんなで話す」マス</b>がひとつ。いちばんに着いた人が止まり、<b>全員でいまの状況と、選んだ理由</b>を話す。ほかの人はそこを通りすぎる。",en:"At age 22 there's one <b>Talk Together square</b>. The first to arrive stops and <b>everyone talks</b> about where they are and why they chose what they chose. The rest walk past."}],
  ]},
  {type:"choice", tag:{ja:"トビラとカギ",en:"Doors & keys"}, title:{ja:"いい選択には「カギ」がいる",en:"Good choices need keys"}, items:[
    ["door",{ja:"<b>大きなトビラのマス</b>に止まると、人生の選択がやってくる。",en:"Land on a big <b>Door square</b> and a life choice arrives."}],
    ["star",{ja:"選択肢には<b>カギ</b>（必要なおかね・★まなび）があるものも。",en:"Some options have <b>keys</b> — money or ★ learning you must have."}],
    ["lock",{ja:"カギが足りないと、そのトビラは開けられない…！",en:"Without the keys, that door won't open…!"}],
    ["people",{ja:"えらぶ前に、<b>「なぜそれを選ぶのか」をひとこと</b>みんなに話してから決めよう。",en:"Before you choose, <b>say out loud why</b> you're choosing it."}],
  ]},
  {type:"learn", tag:{ja:"まなびとおかね",en:"Learning & money"}, title:{ja:"★まなびは、未来のカギ",en:"★ Learning is a future key"}, items:[
    ["book",{ja:"<b>まなびマス</b>やトビラ、できごとで★まなびが貯まる。",en:"Collect ★ from <b>Learning squares</b>, doors, and events."}],
    ["coin",{ja:"かせぎは「<b>基本給＋★×掛け率</b>」。基本給も、★がかせぎになる度合いも、生まれた場所でちがう…！",en:"Pay = <b>base + ★ × rate</b>. Both base pay and how much ★ turns into pay depend on where you were born…!"}],
    ["bolt",{ja:"<b>できごとマス</b>では、ラッキーもアクシデントも起こる。",en:"<b>Event squares</b> bring both luck and accidents."}],
  ]},
  {type:"fam", tag:{ja:"家庭カード",en:"Family Cards"}, title:{ja:"スタート地点は、国によってちがう",en:"Your start depends on where you're born"}, items:[
    ["home",{ja:"はじめに引く<b>家庭カード</b>で、生まれる国・持ちもの・基本給が変わる。",en:"The <b>Family Card</b> you draw sets your country, belongings, and base pay."}],
    ["eye",{ja:"とちゅうで「？？？」の選択肢に出会うかも。それが何なのかは——遊びおわってからのお楽しみ。",en:"You may meet ？？？ options along the way. What they are — you'll find out after the game."}],
    ["people",{ja:"全員ゴールしたら<b>ふりかえりタイム</b>。感じたことを話してみよう。",en:"When everyone finishes: <b>reflection time</b>. Talk about what you felt."}],
  ]},
  {type:"heavy", tag:{ja:"なぜウガンダ？",en:"Why Uganda?"}, title:{ja:"実在する場所と、実在する支え",en:"A real place, and real support"}, items:[
    ["globe",{ja:"このゲームの舞台のひとつ、ウガンダは実在の国。病気や紛争で親を亡くした子どもたちが、たくさん暮らしています。",en:"Uganda, one of this game's settings, is a real country — home to many children who lost parents to illness or conflict."}],
    ["spark",{ja:"あしなが育英会は<b>「あしながウガンダ」</b>で、現地の遺児の教育を実際に支えています。ゲームに出てくる「支援団体」のモデルです。",en:"The Ashinaga Foundation really supports orphans' education there through <b>Ashinaga Uganda</b> — the model for the \"aid groups\" in this game."}],
    ["cap",{ja:"あしながの<b>AAI</b>は、アフリカの遺児を海外の大学へ送り出す奨学金。ただの援助ではなく、<b>志をもって祖国に貢献するリーダーを育てる「約束」</b>の仕組みです。",en:"Ashinaga's <b>AAI</b> sends African orphans to universities abroad — not simple charity, but a \"promise\": raising <b>leaders who bring their talents home</b>."}],
    ["people",{ja:"ゲームの中で見えた「支え」は、現実の世界にもある。ふりかえりで、日本にいる私たちにできることを話してみよう。",en:"The support you saw in the game exists in the real world too. In reflection time, talk about what we can do."}],
  ]},
];
function renderRules(page) {
  const pg = RULE_PAGES[page];
  const items = pg.items.map(([icon, tx]) => `<div class="rule-item"><span class="r-ic">${ic(icon)}</span><span>${L(tx)}</span></div>`).join("");
  const dots = RULE_PAGES.map((_, i) => `<span class="${i === page ? "on" : ""}"></span>`).join("");
  const last = page === RULE_PAGES.length - 1;
  lastKey = "rules" + page;
  openModal(`<div class="rule-page">
      <button class="rule-close" id="ruleClose">✕</button>
      ${tagChip(pg.type, L(pg.tag))}
      <h2>${L(pg.title)}</h2>
      <div class="rule-list">${items}</div>
      <div class="rule-dots">${dots}</div>
      <div class="rule-nav">
        ${page > 0 ? `<button class="m-btn ghost" id="rulePrev">${ja() ? "← まえ" : "← Back"}</button>` : ""}
        ${last ? `<button class="m-btn" id="ruleDone">${ja() ? "OK！" : "OK!"}</button>` : `<button class="m-btn" id="ruleNext">${ja() ? "つぎへ →" : "Next →"}</button>`}
      </div></div>`);
  $("ruleClose").onclick = () => { closeModal(); render(); };
  if ($("rulePrev")) $("rulePrev").onclick = () => renderRules(page - 1);
  if (last) $("ruleDone").onclick = () => { closeModal(); render(); };
  else $("ruleNext").onclick = () => renderRules(page + 1);
}

/* 開発用: ブラウザから内部状態をのぞくためのフック */
setInterval(() => {
  try {
    if (G && G.pending && !isOpen() && !animTimer) renderPending();
  } catch (e) {}
}, 1500);

window.__tobira = {
  get state(){ return G; }, get you(){ return YOU; }, get pid(){ return MYPID; },
  get anim(){ return animTimer; }, get lastKey(){ return lastKey; },
  get wsState(){ return ws && ws.readyState; }, get room(){ return ROOM; },
  msgs: 0,
};

/* ---------- 起動 ---------- */
$("nameInput").value = localStorage.getItem("tobira-name") || "";
const urlCode = new URLSearchParams(location.search).get("room");
if (urlCode) $("codeInput").value = urlCode.toUpperCase();
diceFace(3);
applyLang();
