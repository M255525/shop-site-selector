/* 開店選址評估：規則引擎（瀏覽器與 node 共用）
   第一層 scoreDistrict：70 個行政區依店型、客群、租金預算加權評分
   第二層 scoreSite：使用者實地看過的候選店面評分
   全部是規則式計算，評分權重與門檻為本工具自訂的參考值，不是官方標準。 */
(function(root){
'use strict';
var DIST = (typeof module !== 'undefined') ? require('./districts_data.js') : root.SSS_DISTRICTS;

/* 店型 id 與開店前置清單相同，方便接力 */
var TYPES = {
  food:   {n:'餐飲／飲料店', ic:'🍜', ping:[12, 40], capture:4, ticket:150, hours:10},
  retail: {n:'零售實體店', ic:'🛍', ping:[8, 30], capture:2, ticket:450, hours:10},
  online: {n:'網路商店（倉儲／出貨）', ic:'📦', ping:[5, 40], capture:0, ticket:0, hours:8},
  beauty: {n:'美容美髮美甲', ic:'💇', ping:[10, 30], capture:.4, ticket:800, hours:10},
  service:{n:'工作室／服務業', ic:'🛠', ping:[8, 25], capture:.3, ticket:1200, hours:9},
  stall:  {n:'攤販／小吃攤', ic:'⛺', ping:[1, 6], capture:3, ticket:100, hours:6}
};
var TARGETS = {
  student:{n:'學生', ic:'🎒'}, worker:{n:'上班族', ic:'💼'}, family:{n:'家庭親子', ic:'👨‍👩‍👧'},
  senior:{n:'銀髮族', ic:'🧓'}, tourist:{n:'觀光客', ic:'📷'}
};
var CITIES = ['臺北市', '新北市', '桃園市', '新竹市', '新竹縣'];
var TAGS = {core:'商業核心', office:'辦公／科技園區', resi:'住宅區', school:'學校聚集', tour:'觀光', night:'夜間人潮', industry:'工業區', rural:'郊區／山區'};
/* 租金級距：15～20 坪一樓店面的「粗估」月租範圍（萬元），自行整理，僅供區與區比較，實際以現場行情為準 */
var RENT_TIERS = {1:{n:'低', lo:1.5, hi:3.5}, 2:{n:'中', lo:3, hi:6}, 3:{n:'中高', lo:5, hi:10}, 4:{n:'高', lo:8, hi:20}};

/* 評分項目（7 項），順序＝圖表類別色順序 */
var COMPS = [
  {k:'dens', n:'人潮密度', s:'每平方公里人口'},
  {k:'size', n:'市場規模', s:'行政區總人口'},
  {k:'fit',  n:'客群吻合', s:'目標客群的人口比例與區域性質'},
  {k:'inc',  n:'消費力', s:'綜合所得中位數'},
  {k:'trans',n:'交通', s:'捷運、台鐵、高鐵站數'},
  {k:'rent', n:'租金負擔', s:'租金級距與你的預算'},
  {k:'vibe', n:'商圈性質', s:'區域性質和店型合不合'}
];
var WEIGHTS = {
  food:   {dens:25, size:15, fit:15, inc:10, trans:15, rent:10, vibe:10},
  retail: {dens:20, size:15, fit:15, inc:20, trans:15, rent:5,  vibe:10},
  online: {dens:0,  size:5,  fit:5,  inc:5,  trans:10, rent:50, vibe:25},
  beauty: {dens:15, size:20, fit:20, inc:20, trans:5,  rent:10, vibe:10},
  service:{dens:10, size:10, fit:20, inc:20, trans:20, rent:10, vibe:10},
  stall:  {dens:25, size:10, fit:15, inc:5,  trans:10, rent:15, vibe:20}
};
var VIBE = {   // 區域性質對各店型的加分（合計上限 100，rural 為扣分）
  food:   {core:40, night:30, office:30, school:25, tour:20, resi:15, rural:-30},
  retail: {core:50, tour:30, night:20, office:15, resi:10, rural:-30},
  online: {industry:60, resi:30, core:-20},
  beauty: {resi:50, core:25, office:15, school:10, rural:-20},
  service:{office:45, core:30, resi:25, rural:-20},
  stall:  {night:50, tour:35, school:25, core:20, resi:10, rural:-20}
};

function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
function r1(v){ return Math.round(v * 10) / 10; }
var L = DIST.list;
var AGE_N = ['0–14 歲', '15–24 歲', '25–44 歲', '45–64 歲', '65 歲以上'];
function share(d, i){ return d.age[i] / d.pop; }
function stations(d){ return d.metro.length + d.rail.length + 2 * d.hsr.length; }
/* 百分位（0～100，同值取平均名次） */
function pctFn(vals){
  var s = vals.slice().sort(function(a, b){ return a - b; }), n = s.length;
  return function(v){
    var lo = 0, hi = 0;
    for(var i = 0; i < n; i++){ if(s[i] < v) lo++; if(s[i] <= v) hi++; }
    return n > 1 ? ((lo + hi - 1) / 2) / (n - 1) * 100 : 50;
  };
}
var P = {
  pop: pctFn(L.map(function(d){ return d.pop; })),
  dens: pctFn(L.map(function(d){ return d.dens; })),
  inc: pctFn(L.map(function(d){ return d.inc; })),
  st: pctFn(L.map(stations)),
  sh: [0, 1, 2, 3, 4].map(function(i){ return pctFn(L.map(function(d){ return share(d, i); })); })
};
var AVG = (function(){
  var t = [0, 0, 0, 0, 0], pop = 0;
  L.forEach(function(d){ pop += d.pop; d.age.forEach(function(v, i){ t[i] += v; }); });
  return {age:t.map(function(v){ return v / pop; }), pop:pop};
})();
function has(d, t){ return d.tags.indexOf(t) >= 0; }

function fitScore(d, targets){
  if(!targets || !targets.length) return 50;
  var s = 0;
  targets.forEach(function(t){
    if(t === 'student') s += .6 * P.sh[1](share(d, 1)) + (has(d, 'school') ? 40 : 0);
    else if(t === 'worker') s += .4 * P.sh[2](share(d, 2)) + (has(d, 'office') ? 60 : has(d, 'core') ? 35 : 0);
    else if(t === 'family') s += .7 * P.sh[0](share(d, 0)) + (has(d, 'resi') ? 30 : 0);
    else if(t === 'senior') s += P.sh[4](share(d, 4));
    else if(t === 'tourist') s += has(d, 'tour') ? 100 : has(d, 'core') ? 40 : 0;
  });
  return clamp(s / targets.length, 0, 100);
}
/* 租金：預算 0＝沒填，用級距高低；有填就看預算落在級距的哪裡 */
function rentScore(tier, budget){
  var t = RENT_TIERS[tier];
  if(!(budget > 0)) return (4 - tier) / 3 * 100;
  if(budget >= t.hi) return 100;
  var lo = t.lo * .7;
  if(budget <= lo) return 0;
  return (budget - lo) / (t.hi - lo) * 100;
}
function vibeScore(d, type, ctx){
  var tb = VIBE[type] || {}, s = 0;
  d.tags.forEach(function(t){ s += tb[t] || 0; });
  if(ctx.night && has(d, 'night')) s += 30;
  return clamp(s, 0, 100);
}
function weightsFor(ctx){
  var w = {}, base = (ctx.weights && typeof ctx.weights === 'object') ? ctx.weights : WEIGHTS[ctx.type] || WEIGHTS.food;
  COMPS.forEach(function(c){ var v = +base[c.k]; w[c.k] = isFinite(v) && v >= 0 ? v : 0; });
  if(ctx.transit) w.trans += 10;
  if(ctx.night) w.vibe += 5;
  return w;
}
function rentTier(d, ctx){
  var o = ctx.rentOverride && ctx.rentOverride[d.id];
  return RENT_TIERS[o] ? +o : d.rent;
}
/* 停車：人口密度越低越好停，有勾才計入「交通」 */
function scoreDistrict(d, ctx){
  ctx = ctx || {};
  var tier = rentTier(d, ctx);
  var tr = stations(d) ? P.st(stations(d)) : 0;
  if(ctx.parking) tr = .6 * tr + .4 * (100 - P.dens(d.dens));
  var s = {
    dens: P.dens(d.dens), size: P.pop(d.pop), fit: fitScore(d, ctx.targets), inc: P.inc(d.inc),
    trans: tr, rent: rentScore(tier, +ctx.budget), vibe: vibeScore(d, ctx.type, ctx)
  };
  var w = weightsFor(ctx), sw = 0, tot = 0, parts = {};
  COMPS.forEach(function(c){ sw += w[c.k]; });
  COMPS.forEach(function(c){ parts[c.k] = sw ? s[c.k] * w[c.k] / sw : 0; tot += parts[c.k]; });
  return {id:d.id, d:d, total:r1(tot), s:s, parts:parts, w:w, tier:tier};
}
function rankDistricts(ctx){
  ctx = ctx || {};
  var list = L.filter(function(d){ return !ctx.cities || !ctx.cities.length || ctx.cities.indexOf(d.city) >= 0; })
    .map(function(d){ return scoreDistrict(d, ctx); });
  list.sort(function(a, b){ return b.total - a.total || b.d.pop - a.d.pop; });
  list.forEach(function(r, i){ r.rank = i + 1; });
  return list;
}
function topPct(p){ return Math.max(1, Math.round(100 - p)); }
/* 白話說明：為什麼適合／要注意 */
function explain(r, ctx){
  ctx = ctx || {};
  var d = r.d, good = [], warn = [], s = r.s, w = r.w;
  if(s.dens >= 75 && w.dens) good.push('人潮密度高（每平方公里約 ' + d.dens.toLocaleString() + ' 人，四縣市前 ' + topPct(s.dens) + '%）');
  if(s.size >= 75 && w.size) good.push('人口多，約 ' + Math.round(d.pop / 10000) + ' 萬人');
  if(s.inc >= 75 && w.inc) good.push('所得中位數較高（每戶約 ' + d.inc + ' 千元／年）');
  if(s.trans >= 75 && w.trans && stations(d)) good.push('交通方便（' + stationText(d) + '）');
  if(s.fit >= 70 && ctx.targets && ctx.targets.length) good.push('跟你的客群（' + ctx.targets.map(function(t){ return TARGETS[t].n; }).join('、') + '）合得來');
  if(s.vibe >= 60) good.push('區域性質（' + d.tags.map(function(t){ return TAGS[t]; }).join('、') + '）適合' + TYPES[ctx.type || 'food'].n);
  if(s.rent >= 80 && +ctx.budget > 0) good.push('租金級距在預算內');
  if(+ctx.budget > 0 && s.rent < 40) warn.push('店面租金行情可能超過你的預算（本區級距「' + RENT_TIERS[r.tier].n + '」粗估 ' + RENT_TIERS[r.tier].lo + '～' + RENT_TIERS[r.tier].hi + ' 萬／月）');
  if(s.dens < 25 && w.dens >= 15) warn.push('人口密度低，路過人潮少，要靠目的型來客或外送');
  if(s.trans < 20 && w.trans >= 10) warn.push('區內軌道車站少，客人多半騎車開車');
  if(share(d, 4) > .25) warn.push('65 歲以上占 ' + Math.round(share(d, 4) * 100) + '%，高齡化較明顯');
  if(ctx.targets && ctx.targets.length && s.fit < 30) warn.push('目標客群的比例在四縣市偏低');
  if(has(d, 'tour') && ctx.type !== 'online') warn.push('觀光人潮集中在假日與旺季，平日營業額落差大');
  return {good:good.slice(0, 4), warn:warn.slice(0, 3)};
}
function stationText(d){
  var a = [];
  if(d.metro.length) a.push('捷運／輕軌 ' + d.metro.length + ' 站');
  if(d.rail.length) a.push('台鐵 ' + d.rail.length + ' 站');
  if(d.hsr.length) a.push('高鐵 ' + d.hsr.length + ' 站');
  return a.join('、') || '區內沒有軌道車站';
}

/* ---------- 地圖圖層 ---------- */
var LAYERS = {
  score: {n:'適合度', unit:'分', v:null},
  dens:  {n:'人口密度', unit:'人/km²', v:function(d){ return d.dens; }},
  pop:   {n:'總人口', unit:'人', v:function(d){ return d.pop; }},
  inc:   {n:'所得中位數', unit:'千元', v:function(d){ return d.inc; }},
  young: {n:'15–44 歲比例', unit:'%', v:function(d){ return r1((share(d, 1) + share(d, 2)) * 100); }},
  kids:  {n:'0–14 歲比例', unit:'%', v:function(d){ return r1(share(d, 0) * 100); }},
  old:   {n:'65 歲以上比例', unit:'%', v:function(d){ return r1(share(d, 4) * 100); }},
  st:    {n:'車站數', unit:'站', v:function(d){ return d.metro.length + d.rail.length + d.hsr.length; }},
  rent:  {n:'租金級距', unit:'級', v:function(d){ return d.rent; }}
};
/* 分 5 級（分位數斷點），回傳 [b1,b2,b3,b4] 讓 v 落到 0..4 */
function breaks(vals, k){
  k = k || 5;
  var s = vals.filter(function(v){ return isFinite(v); }).sort(function(a, b){ return a - b; }), out = [];
  for(var i = 1; i < k; i++) out.push(s[Math.min(s.length - 1, Math.floor(s.length * i / k))]);
  return out;
}
function binOf(v, br){ var i = 0; while(i < br.length && v >= br[i]) i++; return i; }

/* ---------- 第二層：候選店面 ---------- */
var FLOORS = {'1':'一樓臨街', '1in':'一樓（巷內／騎樓後）', '2':'二樓以上', 'b1':'地下室'};
var CONDS = {ready:'可直接沿用', light:'小改裝', heavy:'要大改／毛胚'};
var PARKS = {0:'附近不好停', 1:'有機車位', 2:'汽機車都好停'};
var SITE_COMPS = [
  {k:'traffic', n:'人流'}, {k:'visible', n:'能見度'}, {k:'access', n:'交通'},
  {k:'cost', n:'租金負擔'}, {k:'compete', n:'競爭環境'}, {k:'space', n:'空間條件'}
];
var SITE_W = {
  food:   {traffic:25, visible:20, access:15, cost:20, compete:10, space:10},
  retail: {traffic:25, visible:25, access:15, cost:15, compete:10, space:10},
  online: {traffic:0,  visible:5,  access:10, cost:45, compete:0,  space:40},
  beauty: {traffic:10, visible:15, access:15, cost:20, compete:20, space:20},
  service:{traffic:5,  visible:10, access:25, cost:25, compete:15, space:20},
  stall:  {traffic:35, visible:20, access:10, cost:15, compete:10, space:10}
};
function num(v, d){ v = +v; return isFinite(v) ? v : (d === undefined ? 0 : d); }
/* 人流計數：sessions [{site, day:'wd'|'we', slot:'am'|'noon'|'pm'|'night', min, n}] */
var SLOTS = {am:'早上', noon:'中午', pm:'下午', night:'晚上'};
var DAYS = {wd:'平日', we:'假日'};
function perHour(s){ return s.min > 0 ? s.n * 60 / s.min : 0; }
function footTraffic(sessions, siteId){
  var ss = (sessions || []).filter(function(s){ return s.site === siteId && s.min > 0; });
  var m = {};
  Object.keys(DAYS).forEach(function(dk){ m[dk] = {}; Object.keys(SLOTS).forEach(function(sk){ m[dk][sk] = {sum:0, cnt:0, avg:null}; }); });
  var all = 0;
  ss.forEach(function(s){ var c = m[s.day] && m[s.day][s.slot]; if(!c) return; c.sum += perHour(s); c.cnt++; all += perHour(s); });
  Object.keys(m).forEach(function(dk){ Object.keys(m[dk]).forEach(function(sk){ var c = m[dk][sk]; c.avg = c.cnt ? Math.round(c.sum / c.cnt) : null; }); });
  return {n:ss.length, avg:ss.length ? Math.round(all / ss.length) : null, m:m};
}
/* 預估月營業額（萬元）＝每小時人流 × 進店率 × 客單價 × 營業時數 × 30 天 */
function estRevenue(site, type){
  var t = TYPES[type] || TYPES.food;
  var tr = num(site.traffic), cap = num(site.capture, t.capture), tk = num(site.ticket, t.ticket), h = num(site.hours, t.hours);
  if(!(tr > 0) || !(cap > 0) || !(tk > 0)) return 0;
  return r1(tr * cap / 100 * tk * h * 30 / 10000);
}
function revenueOf(site, type){ return num(site.revenue) > 0 ? num(site.revenue) : estRevenue(site, type); }
/* 租金占營業額比（%）；經驗法則：10% 以下寬鬆、10～15% 尚可、15% 以上偏重 */
function rentRatio(rent, revenue){ return rent > 0 && revenue > 0 ? r1(rent / revenue * 100) : null; }
function ratioLevel(p){ return p === null ? 'na' : p <= 10 ? 'ok' : p <= 15 ? 'mid' : 'high'; }
function scoreSite(site, ctx){
  var type = (ctx && ctx.type) || 'food', t = TYPES[type];
  var tr = num(site.traffic), rent = num(site.rent), rev = revenueOf(site, type), ratio = rentRatio(rent, rev);
  var s = {};
  s.traffic = tr > 0 ? clamp(100 * Math.log(tr / 20) / Math.log(1500 / 20), 0, 100) : 0;
  var floorAdj = {'1':0, '1in':-15, '2':-30, 'b1':-35}[site.floor] || 0;
  s.visible = clamp(num(site.vis, 3) * 16 + Math.min(num(site.front), 8) / 8 * 20 + floorAdj, 0, 100);
  var walk = num(site.walk, 10);
  s.access = clamp((15 - walk) / 12 * 100, 0, 100);
  if(site.park !== undefined) s.access = clamp(s.access * .8 + num(site.park) * 10, 0, 100);
  s.cost = ratio === null ? (rent > 0 ? 40 : 50) : clamp((25 - ratio) / 17 * 100, 0, 100);
  var comp = num(site.comp), compl = num(site.compl);
  s.compete = type === 'food' || type === 'stall'
    ? clamp(60 + compl * 6 - Math.max(0, comp - 3) * 10 + Math.min(comp, 3) * 3, 0, 100)
    : clamp(70 + compl * 5 - comp * 10, 0, 100);
  var ping = num(site.ping), sp = 50;
  if(ping > 0){ sp = ping >= t.ping[0] && ping <= t.ping[1] ? 65 : ping < t.ping[0] ? 65 - (t.ping[0] - ping) / t.ping[0] * 80 : 55; }
  sp += {ready:25, light:10, heavy:-10}[site.cond] || 0;
  s.space = clamp(sp, 0, 100);
  var w = SITE_W[type] || SITE_W.food, sw = 0, tot = 0, parts = {};
  SITE_COMPS.forEach(function(c){ sw += w[c.k]; });
  SITE_COMPS.forEach(function(c){ parts[c.k] = s[c.k] * w[c.k] / sw; tot += parts[c.k]; });
  var notes = [];
  if(ratio !== null && ratio > 15) notes.push('租金占預估營業額 ' + ratio + '%，偏重（常見經驗是 10～15% 以內）');
  if(ratio === null && rent > 0) notes.push('還沒有營業額預估，先到「人流計數」數人流，或直接填預估月營業額');
  if(site.floor === '2' || site.floor === 'b1') notes.push('不在一樓，招牌與動線要特別設計');
  if(ping > 0 && ping < t.ping[0]) notes.push('坪數比' + t.n + '常見的 ' + t.ping[0] + ' 坪小');
  if(comp >= 5) notes.push('附近同業 ' + comp + ' 家，要想清楚差異化');
  if(site.cond === 'heavy') notes.push('要大改，裝潢費與工期要多抓');
  return {total:r1(tot), s:s, parts:parts, w:w, revenue:rev, ratio:ratio, level:ratioLevel(ratio), notes:notes};
}

/* ---------- 看店檢查清單 ---------- */
var CHECK = [
  {g:'法規與用途', items:[
    ['zone', '確認土地使用分區與建物用途可以開這種店（到縣市政府查使用分區、看建物使用執照）'],
    ['decor', '要不要辦室內裝修審查、消防安檢，先問縣市建管與消防單位'],
    ['food', '賣吃的：確認排油煙、廢水、瓦斯管線可以裝，房東與大樓管委會同意'],
    ['sign', '招牌位置與大小，問清楚大樓規約與縣市招牌規定'],
    ['regaddr', '房東同意用這個地址辦商業／稅籍登記']]},
  {g:'租約', items:[
    ['term', '租期至少 3 年，有優先續租權，續租漲幅寫進合約'],
    ['free', '談到免租裝潢期（常見 1～2 個月）'],
    ['deposit', '押金月數、提前解約條件、違約金寫清楚'],
    ['restore', '退租時要不要恢復原狀、哪些裝修可以留下'],
    ['fees', '管理費、水電是否獨立電表、房屋稅地價稅誰付'],
    ['owner', '核對房東身分與謄本（確認是屋主或有轉租權）']]},
  {g:'店面現況', items:[
    ['power', '電力容量夠不夠（餐飲、美髮設備很吃電）'],
    ['water', '給排水、廁所、漏水壁癌'],
    ['size', '實際量坪數與店面寬，對照權狀'],
    ['view', '從對街、路口看得到店面與招牌'],
    ['access', '無障礙、門前有沒有高低差或障礙物']]},
  {g:'周邊與人流', items:[
    ['count', '平日、假日，早中晚至少各數一次人流'],
    ['comp', '走一圈記下 200 公尺內的同業與互補店家'],
    ['park', '附近機車、汽車停車與臨停狀況'],
    ['side', '人流走的是哪一側、紅綠燈與斑馬線位置'],
    ['night', '晚上去看一次（照明、治安、營業店家）'],
    ['future', '附近有沒有施工、都更、新捷運站或大型開發計畫']]}
];

/* ---------- 範例（全部虛構） ---------- */
var EXAMPLES = [
  {key:'tea', label:'學區手搖飲（台北、預算 12 萬）', ctx:{name:'青田小茶舖', type:'food', targets:['student', 'worker'], budget:12, cities:['臺北市'], transit:true, parking:false, night:false},
    sites:[
      {name:'大學路口轉角', district:'臺北市大安區', rent:13, ping:12, front:5, floor:'1', walk:3, comp:6, compl:5, vis:5, park:1, cond:'light', traffic:820, capture:5.5, ticket:70},
      {name:'巷內老公寓一樓', district:'臺北市大安區', rent:7.5, ping:15, front:4, floor:'1in', walk:7, comp:2, compl:3, vis:3, park:1, cond:'ready', traffic:260, capture:9, ticket:70},
      {name:'站前商場二樓', district:'臺北市中正區', rent:9, ping:20, front:6, floor:'2', walk:1, comp:3, compl:8, vis:2, park:0, cond:'heavy', traffic:1100, capture:3, ticket:70}],
    sessions:[{site:0, day:'wd', slot:'noon', min:15, n:230}, {site:0, day:'wd', slot:'pm', min:15, n:180}, {site:0, day:'we', slot:'pm', min:15, n:200},
      {site:1, day:'wd', slot:'noon', min:15, n:70}, {site:1, day:'we', slot:'pm', min:15, n:60}, {site:2, day:'wd', slot:'night', min:15, n:290}]},
  {key:'brunch', label:'社區早午餐（新北、預算 8 萬）', ctx:{name:'晨光巷早午餐', type:'food', targets:['family', 'worker'], budget:8, cities:['新北市'], transit:false, parking:true, night:false},
    sites:[
      {name:'市場旁邊間', district:'新北市板橋區', rent:8, ping:25, front:7, floor:'1', walk:6, comp:4, compl:6, vis:4, park:1, cond:'light', traffic:480, ticket:180, capture:3, hours:8},
      {name:'國小對面', district:'新北市新莊區', rent:5.5, ping:22, front:5, floor:'1', walk:10, comp:2, compl:3, vis:4, park:2, cond:'ready', traffic:300, ticket:180, capture:4, hours:8}],
    sessions:[{site:0, day:'wd', slot:'am', min:20, n:180}, {site:0, day:'we', slot:'am', min:20, n:150}, {site:1, day:'wd', slot:'am', min:20, n:110}]},
  {key:'salon', label:'親子美髮（新竹、預算 6 萬）', ctx:{name:'小樹親子髮藝', type:'beauty', targets:['family'], budget:6, cities:['新竹市', '新竹縣'], transit:false, parking:true, night:false},
    sites:[
      {name:'新社區大路旁', district:'新竹縣竹北市', rent:6, ping:20, front:6, floor:'1', walk:12, comp:2, compl:4, vis:4, park:2, cond:'ready', traffic:150, revenue:42},
      {name:'學校附近巷口', district:'新竹市東區', rent:4.8, ping:16, front:4, floor:'1in', walk:9, comp:3, compl:2, vis:3, park:1, cond:'light', traffic:120, revenue:30}],
    sessions:[]}
];

var API = {
  TYPES:TYPES, TARGETS:TARGETS, CITIES:CITIES, TAGS:TAGS, RENT_TIERS:RENT_TIERS, COMPS:COMPS, WEIGHTS:WEIGHTS, VIBE:VIBE,
  LAYERS:LAYERS, FLOORS:FLOORS, CONDS:CONDS, PARKS:PARKS, SITE_COMPS:SITE_COMPS, SITE_W:SITE_W, SLOTS:SLOTS, DAYS:DAYS,
  CHECK:CHECK, EXAMPLES:EXAMPLES, AGE_N:AGE_N, AVG:AVG, DIST:DIST, list:L,
  byId:function(id){ for(var i = 0; i < L.length; i++) if(L[i].id === id) return L[i]; return null; },
  share:share, stations:stations, stationText:stationText, scoreDistrict:scoreDistrict, rankDistricts:rankDistricts, explain:explain,
  weightsFor:weightsFor, rentScore:rentScore, fitScore:fitScore, breaks:breaks, binOf:binOf,
  footTraffic:footTraffic, perHour:perHour, estRevenue:estRevenue, revenueOf:revenueOf, rentRatio:rentRatio, ratioLevel:ratioLevel, scoreSite:scoreSite,
  clamp:clamp, r1:r1
};
if(typeof module !== 'undefined') module.exports = API; else root.SSS = API;
})(typeof window !== 'undefined' ? window : this);
