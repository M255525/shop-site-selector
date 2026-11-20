// 規則引擎測試：node tools/test_engine.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const D = require('../data.js');
const M = require('../map_data.js');
let fail = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fail++; console.log('FAIL', msg); } };

// 資料完整性
const L = D.list;
ok(L.length === 70, '70 個行政區');
const cnt = c => L.filter(d => d.city === c).length;
ok(cnt('臺北市') === 12 && cnt('新北市') === 29 && cnt('桃園市') === 13 && cnt('新竹市') === 3 && cnt('新竹縣') === 13, '各縣市區數 12/29/13/3/13');
const popOf = c => L.filter(d => d.city === c).reduce((s, d) => s + d.pop, 0);
// 官方縣市人口量級（約略，民國 115 年）：北市 240～250 萬、新北 400～410 萬、桃園 230～240 萬、竹市 44～47 萬、竹縣 58～61 萬
ok(popOf('臺北市') > 2.35e6 && popOf('臺北市') < 2.5e6, '台北市人口量級');
ok(popOf('新北市') > 3.95e6 && popOf('新北市') < 4.1e6, '新北市人口量級');
ok(popOf('桃園市') > 2.25e6 && popOf('桃園市') < 2.45e6, '桃園市人口量級');
for (const d of L) {
  ok(d.age.reduce((a, b) => a + b, 0) === d.pop, d.id + ' 年齡加總＝人口');
  ok(d.inc > 300 && d.inc < 1500, d.id + ' 所得合理');
  ok(d.area > 1 && d.dens > 0, d.id + ' 面積密度');
  ok(D.RENT_TIERS[d.rent] && d.tags.length && d.tags.every(t => D.TAGS[t]), d.id + ' 租金級距與性質');
  ok(M.towns[d.id] && M.towns[d.id].d.length > 50, d.id + ' 有地圖');
}
ok(Object.keys(M.towns).length === 70, '地圖 70 區');

// 評分範圍
const types = Object.keys(D.TYPES), tg = Object.keys(D.TARGETS);
let combos = 0;
for (const type of types) for (let m = 0; m < 32; m++) for (const budget of [0, 3, 8, 20]) for (const flags of [0, 7]) {
  const ctx = { type, targets: tg.filter((t, i) => m >> i & 1), budget, transit: !!(flags & 1), parking: !!(flags & 2), night: !!(flags & 4) };
  const r = D.rankDistricts(ctx); combos++;
  ok(r.length === 70 && r.every(x => x.total >= 0 && x.total <= 100 && isFinite(x.total)), 'score range ' + JSON.stringify(ctx));
  ok(r.every((x, i) => i === 0 || r[i - 1].total >= x.total), '排序遞減');
  const sum = r[0]; ok(Math.abs(Object.values(sum.parts).reduce((a, b) => a + b, 0) - sum.total) < .11, '組成加總＝總分');
}
// 縣市篩選
ok(D.rankDistricts({ type: 'food', cities: ['新竹市'] }).length === 3, '縣市篩選');
// 租金：預算越高分數不降
for (const t of [1, 2, 3, 4]) { let prev = -1; for (let b = 0.5; b < 25; b += .5) { const s = D.rentScore(t, b); ok(s >= prev, 'rent monotonic'); prev = s; } }
ok(D.rentScore(4, 25) === 100 && D.rentScore(4, 3) === 0, 'rent ends');
// 合理性：學區手搖飲台北第一名是大安；網路商店不會選信義；家庭美髮竹區前二有竹北
ok(D.rankDistricts(D.EXAMPLES[0].ctx)[0].d.name === '大安區', '手搖飲→大安');
ok(D.rankDistricts({ type: 'online', budget: 4 }).slice(-10).some(r => r.d.name === '信義區'), '網路商店信義在後段');
ok(D.rankDistricts(D.EXAMPLES[2].ctx).slice(0, 2).some(r => r.d.name === '竹北市'), '親子美髮→竹北');
// 銀髮客群：65+ 比例最高的區 fit 最高
const old = L.slice().sort((a, b) => D.share(b, 4) - D.share(a, 4))[0];
ok(D.fitScore(old, ['senior']) === 100, '銀髮 fit');

// 人流
const ses = [{ site: 'a', day: 'wd', slot: 'am', min: 15, n: 100 }, { site: 'a', day: 'wd', slot: 'am', min: 30, n: 100 }, { site: 'a', day: 'we', slot: 'night', min: 10, n: 50 }, { site: 'b', day: 'wd', slot: 'am', min: 15, n: 999 }];
const ft = D.footTraffic(ses, 'a');
ok(ft.n === 3 && ft.m.wd.am.avg === 300 && ft.m.we.night.avg === 300 && ft.avg === Math.round((400 + 200 + 300) / 3), 'footTraffic');
ok(D.footTraffic([], 'a').avg === null, 'empty traffic');
// 營業額與租金比
ok(D.estRevenue({ traffic: 100, capture: 10, ticket: 100, hours: 10 }, 'food') === 30, 'estRevenue 100×10%×100×10×30=30萬');
ok(D.rentRatio(3, 30) === 10 && D.ratioLevel(10) === 'ok' && D.ratioLevel(12) === 'mid' && D.ratioLevel(16) === 'high' && D.rentRatio(0, 10) === null, 'rentRatio');
ok(D.revenueOf({ revenue: 50, traffic: 100 }, 'food') === 50, '手填營業額優先');
// 店面分數
for (const ex of D.EXAMPLES) for (const s of ex.sites) { const r = D.scoreSite(s, ex.ctx); ok(r.total >= 0 && r.total <= 100, 'site score ' + s.name); }
const base = { rent: 8, ping: 20, front: 5, floor: '1', walk: 5, comp: 2, compl: 3, vis: 3, park: 1, cond: 'light', traffic: 400 };
const sc = (o, type = 'food') => D.scoreSite(Object.assign({}, base, o), { type }).total;
ok(sc({ traffic: 800 }) > sc({}), '人流多分數高');
ok(sc({ rent: 15 }) < sc({}), '租金高分數低');
ok(sc({ floor: '2' }) < sc({}), '二樓分數低');
ok(sc({ walk: 1 }) > sc({ walk: 14 }), '近車站分數高');
ok(sc({ comp: 9 }) < sc({}), '同業多分數低');
ok(D.scoreSite({}, { type: 'food' }).total >= 0, '空店面不報錯');
// 街區（村里）
globalThis.window = globalThis.window || {};
for (const slug of Object.values(D.CITY_SLUG)) require('../villages/' + slug + '.js');
const VV = window.SSS_VILL;
ok(Object.keys(VV).length === 5, '5 個縣市村里檔');
let nv = 0;
for (const d of L) {
  const vs = VV[d.city].list.filter(v => v.d === d.id && !v.u);
  nv += vs.length;
  ok(vs.length > 0, d.id + ' 有村里');
  ok(vs.reduce((a, v) => a + v.pop, 0) === d.pop, d.id + ' 村里人口加總＝區人口');
  for (const v of vs) {
    ok(v.age.reduce((a, b) => a + b, 0) === v.pop && v.area > 0 && v.p.length > 20, v.id + ' 村里資料');
    ok(v.st[2] >= 0 && v.st[2] < 40000 && D.ST_K[v.st[1]], v.id + ' 最近車站');
    ok(v.poi.length === 5 && v.poi.every(x => x >= 0), v.id + ' 店家數');
  }
  for (const type of types) {
    const r = D.scoreVillages(VV[d.city].list.filter(v => v.d === d.id), { type, targets: ['family', 'worker'] });
    ok(r.length === vs.length && r.every(x => x.total >= 0 && x.total <= 100 && isFinite(x.total)), d.id + ' ' + type + ' 村里分數');
    ok(r.every(x => Math.abs(Object.values(x.parts).reduce((a, b) => a + b, 0) - x.total) < .11), '村里組成加總');
  }
}
ok(nv === 2339, '有人口的村里 2339 個：' + nv);
const allInc = Object.values(VV).flatMap(c => c.list.filter(v => !v.u));
ok(allInc.filter(v => !v.inc).length < 40, '缺所得的里少於 40：' + allInc.filter(v => !v.inc).length);
ok(D.transScore(200) === 100 && D.transScore(2000) === 0 && D.transScore(875) === 50, '車站距離分數');
// 離車站近的里 trans 分數高、空清單不報錯
ok(D.scoreVillages([], { type: 'food' }).length === 0, '空村里清單');
const da = VV['臺北市'].list.filter(v => v.d === '臺北市大安區');
const rr = D.scoreVillages(da, { type: 'food', targets: ['student'] });
ok(rr.find(x => x.v.n === '大學里').total > rr[rr.length - 1].total, '大學里不是最後');
ok(D.explainVillage(rr[0], { type: 'food' }).good.length > 0, '村里說明');
// 一句話設定（規則式）
const PT = [
  ['我想在台北大安區開手搖飲，客人是學生跟上班族，月租預算 12 萬，最好靠近捷運', { type: 'food', targets: ['student', 'worker'], cities: ['臺北市'], focus: '臺北市大安區', budget: 12, transit: true }],
  ['新北市板橋的社區早午餐，家庭客，房租8萬以內', { type: 'food', targets: ['family'], cities: ['新北市'], focus: '新北市板橋區', budget: 8 }],
  ['新竹開親子髮廊 預算6萬 要好停車', { type: 'beauty', targets: ['family'], cities: ['新竹市', '新竹縣'], budget: 6, parking: true }],
  ['桃園夜市小吃攤，晚上營業', { type: 'stall', cities: ['桃園市'], night: true }],
  ['中壢的服飾店 租金 50000 元', { type: 'retail', focus: '桃園市中壢區', cities: ['桃園市'], budget: 5 }],
  ['新竹北區小吃', { type: 'food', focus: '新竹市北區', cities: ['新竹市'] }],
  ['台北市中山區酒吧', { type: 'food', focus: '臺北市中山區', cities: ['臺北市'] }]
];
for (const [t, want] of PT) { const got = D.parseText(t).ctx; ok(JSON.stringify(Object.keys(want).sort().map(k => [k, got[k]])) === JSON.stringify(Object.keys(want).sort().map(k => [k, want[k]])), '一句話：' + t + ' → ' + JSON.stringify(got)); }
ok(Object.keys(D.parseText('今天天氣很好').ctx).length === 0, '無關句子不設定');
ok(D.parseText('x'.repeat(5000)).found.length === 0, '超長輸入不爆');

// 最小統計區
const fs = require('fs');
for (const f of fs.readdirSync(new URL('../stat/', import.meta.url))) require('../stat/' + f);
const SS = window.SSS_STAT;
ok(Object.keys(SS).length === 70, '70 區都有最小統計區檔');
let nUnits = 0;
for (const d of L) {
  const sd = SS[d.id]; const us = sd.list.filter(u => !u.u); nUnits += sd.list.length;
  us.forEach(u => { u.d = d.id; });
  const p = us.reduce((a, u) => a + u.pop, 0);
  ok(Math.abs(p / d.pop - 1) < .08, d.id + ' 統計區人口（113-12）與區人口（115-10）差 8% 內：' + (p / d.pop * 100 - 100).toFixed(1) + '%');
  ok(us.every(u => u.a6.length === 6 && u.vl && u.st[2] >= 0 && u.r3 === 1 && u.p.length > 10), d.id + ' 統計區欄位完整');
  const r = D.scoreVillages(sd.list, { type: 'food', targets: ['student'] });
  ok(r.length === us.length && r.every(x => x.total >= 0 && x.total <= 100), d.id + ' 統計區分數');
}
ok(nUnits === 49424, '四縣市最小統計區 49,424 塊：' + nUnits);
ok(D.tShare({ pop: 100, a6: [10, 20, 30, 40, 0, 0] }, 'worker') === .7 && D.tShare({ pop: 100, age: [10, 20, 30, 20, 20] }, 'senior') === .2, '年齡分組對應');
ok(Math.abs(D.vPoiDens({ poi: [1, 0, 0, 0, 0], r3: 1 }) - 1 / (Math.PI * .09)) < 1e-9, '300m 半徑店家密度');
console.log(`${n - fail}/${n} passed, ${combos} 種條件組合`);
process.exit(fail ? 1 : 0);
