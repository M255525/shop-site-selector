/* 開店選址評估：畫面 */
(function(){
'use strict';
var D = window.SSS, MAP = window.SSS_MAP;
var $ = function(id){ return document.getElementById(id); };
var PFX = 'sss.';
function lsGet(k){ try{ return localStorage.getItem(PFX + k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(PFX + k, v); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(PFX + k); }catch(e){} }
function lsJson(k, d){ try{ var v = JSON.parse(lsGet(k)); return v === null || v === undefined ? d : v; }catch(e){ return d; } }
function esc(s){ return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
function fmtN(v){ return Math.round(v).toLocaleString('zh-TW'); }
function today(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
var standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches || navigator.standalone;
var SC = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'];
var Q = ['var(--q0)', 'var(--q1)', 'var(--q2)', 'var(--q3)', 'var(--q4)'];
var MAXSITES = 5;

/* ---------- 狀態 ---------- */
function defCtx(){ return {name:'', type:'food', targets:[], cities:[], budget:0, transit:false, parking:false, night:false, weights:null, rentOverride:{}}; }
function cleanCtx(c){
  var o = defCtx(); if(!c || typeof c !== 'object') return o;
  if(typeof c.name === 'string') o.name = c.name.slice(0, 30);
  if(D.TYPES[c.type]) o.type = c.type;
  if(Array.isArray(c.targets)) o.targets = c.targets.filter(function(t, i, a){ return D.TARGETS[t] && a.indexOf(t) === i; });
  if(Array.isArray(c.cities)) o.cities = c.cities.filter(function(t, i, a){ return D.CITIES.indexOf(t) >= 0 && a.indexOf(t) === i; });
  var b = +c.budget; o.budget = isFinite(b) && b > 0 ? Math.min(Math.round(b * 10) / 10, 999) : 0;
  ['transit', 'parking', 'night'].forEach(function(k){ o[k] = !!c[k]; });
  if(c.weights && typeof c.weights === 'object'){ o.weights = {}; D.COMPS.forEach(function(x){ var v = +c.weights[x.k]; o.weights[x.k] = isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0; }); }
  if(c.rentOverride && typeof c.rentOverride === 'object') for(var k in c.rentOverride){ if(D.byId(k) && D.RENT_TIERS[c.rentOverride[k]]) o.rentOverride[k] = +c.rentOverride[k]; }
  return o;
}
var NUMF = {rent:[0, 999], ping:[0, 9999], front:[0, 99], walk:[0, 120], comp:[0, 99], compl:[0, 99], vis:[1, 5], traffic:[0, 99999], capture:[0, 100], ticket:[0, 99999], hours:[0, 24], revenue:[0, 99999]};
var sid = 0;
function newId(){ return 's' + Date.now().toString(36) + (sid++).toString(36); }
function cleanSite(s){
  var o = {id:typeof s.id === 'string' && /^[\w-]{1,30}$/.test(s.id) ? s.id : newId(), name:typeof s.name === 'string' ? s.name.slice(0, 30) : '候選店面'};
  o.district = D.byId(s.district) ? s.district : '';
  for(var k in NUMF){ var v = +s[k]; if(s[k] !== '' && s[k] !== undefined && s[k] !== null && isFinite(v)) o[k] = Math.max(NUMF[k][0], Math.min(NUMF[k][1], v)); }
  o.floor = D.FLOORS[s.floor] ? s.floor : '1';
  o.cond = D.CONDS[s.cond] ? s.cond : 'light';
  o.park = D.PARKS[s.park] !== undefined ? +s.park : 1;
  if(o.vis === undefined) o.vis = 3;
  o.checks = {};
  if(s.checks && typeof s.checks === 'object') for(var c in s.checks){ if(/^[\w]{1,20}$/.test(c) && s.checks[c]) o.checks[c] = 1; }
  o.trafficAuto = !!s.trafficAuto;
  return o;
}
function cleanSession(x, ids){
  if(!x || ids.indexOf(x.site) < 0 || !D.DAYS[x.day] || !D.SLOTS[x.slot]) return null;
  var min = +x.min, n = +x.n; if(!(min > 0 && min <= 240) || !(n >= 0 && n < 100000)) return null;
  return {site:x.site, day:x.day, slot:x.slot, min:Math.round(min * 10) / 10, n:Math.round(n), at:typeof x.at === 'string' ? x.at.slice(0, 20) : today()};
}
function cleanState(d){
  d = d && typeof d === 'object' ? d : {};
  var o = {ctx:cleanCtx(d.ctx), sel:D.byId(d.sel) ? d.sel : '', layer:D.LAYERS[d.layer] ? d.layer : 'score', sites:[], sessions:[]};
  if(Array.isArray(d.sites)) o.sites = d.sites.slice(0, MAXSITES).map(cleanSite);
  var ids = o.sites.map(function(s){ return s.id; });
  if(Array.isArray(d.sessions)) o.sessions = d.sessions.map(function(x){ return cleanSession(x, ids); }).filter(Boolean).slice(-300);
  return o;
}
function load(){ return cleanState(lsJson('state', null)); }
var S = load(), saved = null, demo = false;
var V = {tab:lsGet('tab') || 'area', radar:null, chkSite:null, cnt:null, sortK:'rank', sortDir:1, showAll:false, demoKey:''};
if(['area', 'sites', 'count', 'check'].indexOf(V.tab) < 0) V.tab = 'area';
function save(){ if(demo) return; lsSet('state', JSON.stringify(S)); }

/* ---------- 共用 ---------- */
function toast(msg){ var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2600); }
function openModal(h){ $('modalBox').innerHTML = h; $('modal').hidden = false; var f = $('modalBox').querySelector('button,input,select,a'); if(f) f.focus(); }
function closeModal(){ $('modal').hidden = true; $('modalBox').innerHTML = ''; }
var tip = $('tip');
function showTip(e, html){ tip.innerHTML = html; tip.classList.add('show'); moveTip(e); }
function moveTip(e){ var x = e.clientX + 14, y = e.clientY + 14, w = tip.offsetWidth, h = tip.offsetHeight; if(x + w > innerWidth - 8) x = e.clientX - w - 14; if(y + h > innerHeight - 8) y = e.clientY - h - 14; tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px'; }
function hideTip(){ tip.classList.remove('show'); }
function cityShort(c){ return c.replace('臺北市', '北市').replace('新北市', '新北').replace('桃園市', '桃園').replace('新竹市', '竹市').replace('新竹縣', '竹縣'); }
function siteColor(i){ return SC[i % SC.length]; }
function ranked(){ return D.rankDistricts(S.ctx); }
var rankCache = null, rankKey = '';
function R(){ var k = JSON.stringify(S.ctx); if(k !== rankKey){ rankKey = k; rankCache = ranked(); } return rankCache; }
function rankOf(id){ var r = R(); for(var i = 0; i < r.length; i++) if(r[i].id === id) return r[i]; return null; }
function trafficOf(site){ var ft = D.footTraffic(S.sessions, site.id); return ft; }

/* ---------- 標頭與分頁 ---------- */
var TABS = [['area', '01', '🗺 找區域'], ['sites', '02', '🏪 比店面'], ['count', '03', '👣 人流計數'], ['check', '04', '✅ 看店清單']];
function renderChrome(){
  $('tbName').textContent = S.ctx.name || '我的店';
  $('tbType').textContent = D.TYPES[S.ctx.type].n;
  $('tbCity').textContent = S.ctx.cities.length ? S.ctx.cities.map(cityShort).join('・') : '四縣市';
  $('tbDate').textContent = today();
  $('tabs').innerHTML = TABS.map(function(t){ return '<button class="tab' + (V.tab === t[0] ? ' on' : '') + '" role="tab" aria-selected="' + (V.tab === t[0]) + '" data-tab="' + t[0] + '"><span class="no">' + t[1] + '</span>' + t[2] + (t[0] === 'sites' && S.sites.length ? ' (' + S.sites.length + ')' : '') + '</button>'; }).join('');
  $('exStrip').className = 'exstrip' + (demo ? ' on' : '');
  $('exStrip').innerHTML = (demo ? '<b>範例模式</b>：資料不會存下來。' : '<span>看範例：</span>') +
    D.EXAMPLES.map(function(e){ return '<button data-demo="' + e.key + '" class="' + (V.demoKey === e.key && demo ? 'cur' : '') + '">' + esc(e.label) + '</button>'; }).join('') +
    (demo ? '<button data-act="leaveDemo">離開範例</button>' : '');
  $('foot').innerHTML = '人口：內政部戶政司（民國 ' + D.DIST.meta.popYm.slice(0, 3) + ' 年 ' + (+D.DIST.meta.popYm.slice(3)) + ' 月）・所得：財政部財政資訊中心 ' + D.DIST.meta.incYear + ' 年度綜稅所得・界線：內政部國土測繪中心・車站位置：© OpenStreetMap contributors<br>' +
    '👤 創作者 Mark Tsai（蔡豐全）・<a href="manual.html">📖 操作手冊</a>・<a href="#" data-act="warn">⚠ 使用警語</a>' + (standalone ? '' : '・<a href="#" data-act="install">📲 加入主畫面</a>') +
    '<br><img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.shopsiteselector" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle;margin-top:.4rem">';
}
function render(){
  renderChrome();
  var m = $('main');
  if(V.tab === 'area') m.innerHTML = areaHtml();
  else if(V.tab === 'sites') m.innerHTML = sitesHtml();
  else if(V.tab === 'count') m.innerHTML = countHtml();
  else m.innerHTML = checkHtml();
  if(V.tab === 'area') fitMap();
}

/* ========== 01 找區域 ========== */
function chip(attr, val, on, label){ return '<button class="chip' + (on ? ' on' : '') + '" ' + attr + '="' + esc(val) + '" aria-pressed="' + !!on + '">' + label + '</button>'; }
function condHtml(){
  var c = S.ctx, w = D.weightsFor(Object.assign({}, c, {transit:false, night:false}));
  return '<div class="cond">' +
    '<div class="fld"><span class="lab">店型</span><div class="chips">' + Object.keys(D.TYPES).map(function(k){ return chip('data-type', k, c.type === k, D.TYPES[k].ic + ' ' + D.TYPES[k].n); }).join('') + '</div></div>' +
    '<div class="fld"><span class="lab">主要客群（可複選）</span><div class="chips">' + Object.keys(D.TARGETS).map(function(k){ return chip('data-target', k, c.targets.indexOf(k) >= 0, D.TARGETS[k].ic + ' ' + D.TARGETS[k].n); }).join('') + '</div></div>' +
    '<div class="fld"><span class="lab">範圍（不選＝四縣市全部）</span><div class="chips">' + D.CITIES.map(function(k){ return chip('data-city', k, c.cities.indexOf(k) >= 0, k); }).join('') + '</div></div>' +
    '<div class="fld"><label for="budget">店面月租預算</label><div class="inrow"><input type="number" id="budget" data-ctx="budget" min="0" step="0.5" value="' + (c.budget || '') + '" placeholder="例 8"><span class="unit">萬元／月（不填＝租金越低分越高）</span></div>' +
      '<div class="chips" style="margin-top:6px">' + chip('data-flag', 'transit', c.transit, '🚇 要靠近捷運／車站') + chip('data-flag', 'parking', c.parking, '🅿 客人開車騎車') + chip('data-flag', 'night', c.night, '🌙 晚上營業') + '</div></div>' +
    '<details class="adv"' + (lsGet('advOpen') ? ' open' : '') + ' id="advW"><summary>⚖ 進階：調整評分權重' + (c.weights ? '（已自訂）' : '（目前是「' + D.TYPES[c.type].n + '」的預設）') + '</summary>' +
      '<div class="wts">' + D.COMPS.map(function(x, i){ return '<label class="wt"><i class="sw" style="background:' + SC[i] + '"></i><span>' + x.n + '</span><input type="range" min="0" max="50" step="5" value="' + w[x.k] + '" data-w="' + x.k + '" aria-label="' + x.n + '權重"><b class="mono" id="wv_' + x.k + '">' + w[x.k] + '</b></label>'; }).join('') + '</div>' +
      '<p class="small">數字是相對比重，系統會自動換算成百分比。' + (c.weights ? '<button class="btn sm alt" data-act="resetW">恢復預設權重</button>' : '') + '</p></details>' +
  '</div>';
}
function layerVals(key, rows){
  if(key === 'score'){ var m = {}; rows.forEach(function(r){ m[r.id] = r.total; }); return m; }
  var o = {}; D.list.forEach(function(d){ o[d.id] = key === 'rent' ? (S.ctx.rentOverride[d.id] || d.rent) : D.LAYERS[key].v(d); }); return o;
}
function layerBreaks(key, vals){
  if(key === 'rent') return [2, 3, 4, 5];
  var arr = Object.keys(vals).map(function(k){ return vals[k]; });
  return D.breaks(arr, 5);
}
function fmtLayer(key, v){
  if(v === undefined || v === null) return '—';
  if(key === 'rent') return D.RENT_TIERS[v].n;
  if(key === 'young' || key === 'kids' || key === 'old') return v + '%';
  if(key === 'score') return v + ' 分';
  return fmtN(v);
}
function mapHtml(rows){
  var key = S.layer, vals = layerVals(key, rows), br = layerBreaks(key, vals), inSet = {};
  rows.forEach(function(r){ inSet[r.id] = 1; });
  var top = rows.slice(0, 10), paths = '', pins = '';
  Object.keys(MAP.towns).forEach(function(id){
    var t = MAP.towns[id], v = vals[id], out = !inSet[id];
    var fill = key === 'rent' ? Q[[0, 0, 1, 3, 4][v]] : Q[D.binOf(v, br)];
    paths += '<path class="t' + (out ? ' out' : '') + (S.sel === id ? ' sel' : '') + '" d="' + t.d + '" data-d="' + id + '" style="fill:' + fill + '"></path>';
  });
  top.forEach(function(r, i){ var c = MAP.towns[r.id].c; pins += '<g class="pin" data-d="' + r.id + '" transform="translate(' + c[0] + ',' + c[1] + ')"><circle r="9" stroke-width="1.5"></circle><text font-size="10">' + (i + 1) + '</text></g>'; });
  var sel = S.sel && MAP.towns[S.sel] ? '<text class="lbl" id="selLbl" x="' + MAP.towns[S.sel].c[0] + '" y="' + (MAP.towns[S.sel].c[1] - 14) + '" font-size="15" stroke-width="4">' + esc(S.sel.slice(3)) + '</text>' : '';
  var lg;
  if(key === 'rent') lg = [1, 2, 3, 4].map(function(t){ return '<span class="lg"><i class="sw" style="background:' + Q[[0, 0, 1, 3, 4][t]] + '"></i>' + D.RENT_TIERS[t].n + '（粗估 ' + D.RENT_TIERS[t].lo + '～' + D.RENT_TIERS[t].hi + ' 萬）</span>'; }).join('');
  else{
    var arr = Object.keys(vals).map(function(k){ return vals[k]; }), mn = Math.min.apply(null, arr), mx = Math.max.apply(null, arr), edges = [mn].concat(br, [mx]);
    lg = Q.map(function(q, i){ return '<span class="lg"><i class="sw" style="background:' + q + '"></i>' + fmtLayer(key, edges[i]) + (i < 4 ? '～' : '～' + fmtLayer(key, edges[i + 1])) + '</span>'; }).join('');
  }
  return '<div class="card"><h2 class="ctitle"><span class="dwg">A-01</span>行政區地圖<span class="sub">點一區看詳細資料・紅圖釘＝適合度前 10 名</span></h2>' +
    '<div class="mapbar" role="group" aria-label="地圖圖層">' + Object.keys(D.LAYERS).map(function(k){ return chip('data-layer', k, key === k, D.LAYERS[k].n); }).join('') + '</div>' +
    '<div class="mapwrap"><svg id="map" viewBox="0 0 ' + MAP.w + ' ' + MAP.h + '" role="img" aria-label="四縣市行政區' + D.LAYERS[key].n + '地圖">' + paths + pins + sel + '</svg>' +
    '<div class="compass" aria-hidden="true"><b>↑</b>N</div></div>' +
    '<div class="legend"><b>' + D.LAYERS[key].n + '</b>' + lg + '<span class="lg"><i class="sw" style="background:var(--qna)"></i>不在範圍內</span></div>' +
    (key === 'rent' ? '<p class="src">租金級距是本工具自行整理的相對高低，不是官方統計；可到 ⚙ 常用設定逐區修改。</p>' : key === 'score' ? '<p class="src">顏色依 5 等分位數分級（每一級約同樣多個區）。</p>' : '<p class="src">' + srcOf(key) + '</p>') + '</div>';
}
function srcOf(key){
  var m = D.DIST.meta;
  if(key === 'inc') return '財政部財政資訊中心 ' + m.incYear + ' 年度綜合所得總額「合計」列的中位數，單位千元／每一納稅單位，不含免稅與分離課稅所得。';
  if(key === 'st') return '捷運（含輕軌、機場捷運）、台鐵、高鐵站：OpenStreetMap 站點位置依行政區界線自動判斷，界線上的站可能算到鄰區（' + m.stationsDate + ' 整理）。';
  return '內政部戶政司 ODRP014 村里人口統計（民國 ' + m.popYm.slice(0, 3) + ' 年 ' + (+m.popYm.slice(3)) + ' 月）彙總；面積由界線圖計算，為概略值。';
}
/* 依範圍縮放地圖 */
var BBOX = null;
function bboxes(){
  if(BBOX) return BBOX; BBOX = {};
  Object.keys(MAP.towns).forEach(function(id){
    var n = MAP.towns[id].d.match(/-?\d+(\.\d+)?/g).map(Number), b = [1e9, 1e9, -1e9, -1e9];
    for(var i = 0; i + 1 < n.length; i += 2){ b[0] = Math.min(b[0], n[i]); b[1] = Math.min(b[1], n[i + 1]); b[2] = Math.max(b[2], n[i]); b[3] = Math.max(b[3], n[i + 1]); }
    BBOX[id] = b;
  });
  return BBOX;
}
function fitMap(){
  var svg = $('map'); if(!svg) return;
  var cs = S.ctx.cities, B = bboxes(), b = [1e9, 1e9, -1e9, -1e9];
  Object.keys(B).forEach(function(id){ if(cs.length && cs.indexOf(id.slice(0, 3)) < 0) return; var x = B[id]; b[0] = Math.min(b[0], x[0]); b[1] = Math.min(b[1], x[1]); b[2] = Math.max(b[2], x[2]); b[3] = Math.max(b[3], x[3]); });
  var pad = 14, w = b[2] - b[0] + pad * 2, h = b[3] - b[1] + pad * 2;
  svg.setAttribute('viewBox', (b[0] - pad) + ' ' + (b[1] - pad) + ' ' + w + ' ' + h);
  var k = w / MAP.w;   // 圖釘與文字大小跟著縮放比例
  svg.querySelectorAll('.pin').forEach(function(g){ var t = g.getAttribute('transform').replace(/ scale\([^)]*\)/, ''); g.setAttribute('transform', t + ' scale(' + Math.max(.35, k) + ')'); });
  svg.querySelectorAll('path.t').forEach(function(p){ p.style.strokeWidth = (.9 * Math.max(.35, k)) + ''; });
  var sl = $('selLbl'); if(sl){ sl.setAttribute('font-size', 15 * Math.max(.4, k)); sl.setAttribute('stroke-width', 4 * Math.max(.4, k)); }
}
function rankHtml(rows){
  var n = V.showAll ? rows.length : Math.min(10, rows.length), list = rows.slice(0, n);
  return '<div class="card"><h2 class="ctitle"><span class="dwg">A-02</span>適合度排名<span class="sub">長條由 7 個評分項目疊成，越長越適合；滑過色塊看細節</span></h2>' +
    '<div class="lgd">' + D.COMPS.map(function(x, i){ return '<span><i class="sw" style="background:' + SC[i] + '"></i>' + x.n + '</span>'; }).join('') + '</div>' +
    '<div class="rank">' + list.map(function(r, i){
      return '<div class="rrow' + (S.sel === r.id ? ' sel' : '') + '" data-d="' + r.id + '" tabindex="0" role="button" aria-label="第' + (i + 1) + '名 ' + r.id + ' ' + r.total + '分"><span class="no">' + (i + 1) + '</span><span class="nm">' + esc(r.d.name) + '<small>' + r.d.city + '</small></span><div class="stk">' +
        D.COMPS.map(function(x, ci){ var p = r.parts[x.k]; return p > .05 ? '<span data-seg="' + ci + '" style="width:' + p + '%;background:' + SC[ci] + '"></span>' : ''; }).join('') +
        '</div><span class="val">' + r.total + '</span></div>';
    }).join('') + '</div>' +
    (rows.length > 10 ? '<div class="stack"><button class="btn sm alt" data-act="toggleAll">' + (V.showAll ? '只看前 10 名' : '看全部 ' + rows.length + ' 區') + '</button></div>' : '') + '</div>';
}
/* 商圈定位散布圖：x＝人口密度（對數）、y＝所得中位數、圓大小＝人口 */
function scatterHtml(rows){
  var W = 600, H = 380, ml = 48, mr = 14, mt = 14, mb = 40;
  var lx = function(v){ return ml + (Math.log10(Math.max(v, 10)) - 1) / (Math.log10(40000) - 1) * (W - ml - mr); };
  var ys = [350, 1100], ly = function(v){ return mt + (1 - (v - ys[0]) / (ys[1] - ys[0])) * (H - mt - mb); };
  var top = {}; rows.slice(0, 10).forEach(function(r){ top[r.id] = 1; });
  var dens = rows.map(function(r){ return r.d.dens; }).sort(function(a, b){ return a - b; }), inc = rows.map(function(r){ return r.d.inc; }).sort(function(a, b){ return a - b; });
  var md = dens[Math.floor(dens.length / 2)], mi = inc[Math.floor(inc.length / 2)];
  var g = '';
  [10, 100, 1000, 10000].forEach(function(v){ g += '<line class="gl" x1="' + lx(v) + '" x2="' + lx(v) + '" y1="' + mt + '" y2="' + (H - mb) + '"></line><text x="' + lx(v) + '" y="' + (H - mb + 16) + '" text-anchor="middle">' + fmtN(v) + '</text>'; });
  [400, 600, 800, 1000].forEach(function(v){ g += '<line class="gl" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + ly(v) + '" y2="' + ly(v) + '"></line><text x="' + (ml - 6) + '" y="' + (ly(v) + 4) + '" text-anchor="end">' + v + '</text>'; });
  g += '<line class="med" x1="' + lx(md) + '" x2="' + lx(md) + '" y1="' + mt + '" y2="' + (H - mb) + '"></line><line class="med" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + ly(mi) + '" y2="' + ly(mi) + '"></line>';
  g += '<text class="q" x="' + (W - mr - 4) + '" y="' + (mt + 14) + '" text-anchor="end">人多・所得高</text><text class="q" x="' + (ml + 6) + '" y="' + (mt + 14) + '">人少・所得高</text>' +
    '<text class="q" x="' + (W - mr - 4) + '" y="' + (H - mb - 8) + '" text-anchor="end">人多・所得較低</text><text class="q" x="' + (ml + 6) + '" y="' + (H - mb - 8) + '">人少・所得較低</text>';
  g += '<text x="' + ((W + ml) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">人口密度（人／km²，對數刻度）→</text><text x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90 12 ' + (H / 2) + ')">所得中位數（千元）→</text>';
  var order = rows.slice().sort(function(a, b){ return (top[a.id] ? 1 : 0) - (top[b.id] ? 1 : 0) || (a.id === S.sel) - (b.id === S.sel) || b.d.pop - a.d.pop; });
  order.forEach(function(r){
    var rr = 3 + Math.sqrt(r.d.pop) / 60;
    g += '<circle class="dot ' + (top[r.id] ? 'top' : 'oth') + (S.sel === r.id ? ' sel' : '') + '" data-d="' + r.id + '" cx="' + lx(r.d.dens).toFixed(1) + '" cy="' + ly(Math.min(Math.max(r.d.inc, ys[0]), ys[1])).toFixed(1) + '" r="' + Math.max(rr, 5).toFixed(1) + '"></circle>';
  });
  var lbl = rows.slice(0, 5).map(function(r){ return '<text x="' + lx(r.d.dens).toFixed(1) + '" y="' + (ly(r.d.inc) - 3 - Math.max(3 + Math.sqrt(r.d.pop) / 60, 5)).toFixed(1) + '" text-anchor="middle" style="font-weight:700;fill:var(--ink);paint-order:stroke;stroke:var(--paper);stroke-width:3px">' + esc(r.d.name) + '</text>'; }).join('');
  return '<div class="card"><h2 class="ctitle"><span class="dwg">A-03</span>商圈定位圖<span class="sub">每個圓是一區，圓越大人口越多；虛線是中位數</span></h2>' +
    '<div class="lgd"><span><i class="sw" style="background:var(--s1);border-radius:50%"></i>適合度前 10 名</span><span><i class="sw" style="background:var(--ref);border-radius:50%"></i>其他區</span><span><i class="sw" style="border:2px solid var(--pin);border-radius:50%"></i>目前選的區</span></div>' +
    '<svg class="svgchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="人口密度與所得中位數散布圖">' + g + lbl + '</svg>' +
    '<p class="src">所得高的區，客單價可以抓高一點；密度高的區，路過人潮多但租金通常也高。所得取 ' + D.DIST.meta.incYear + ' 年度、超出 1,100 千元的畫在上緣。</p></div>';
}
function detailHtml(rows){
  var r = S.sel ? rankOf(S.sel) : null, outside = false;
  if(!r && S.sel){ r = D.scoreDistrict(D.byId(S.sel), S.ctx); outside = true; }
  if(!r) r = rows[0];
  if(!r) return '<div class="card pinned"><div class="empty">範圍內沒有行政區</div></div>';
  var d = r.d, ex = D.explain(r, S.ctx), shares = d.age.map(function(v){ return v / d.pop; });
  var mx = Math.max.apply(null, shares.concat(D.AVG.age));
  return '<div class="card pinned" id="detail"><div class="dhead"><h3>' + esc(d.name) + '<small>' + d.city + (outside ? '・不在目前範圍' : '・排名第 ' + r.rank + ' ／ ' + rows.length) + '</small></h3>' +
    '<div class="score"><b>' + r.total + '</b><small>適合度（滿分 100）</small></div></div>' +
    '<div class="kpis">' +
      '<div class="kpi"><b>' + fmtN(d.pop) + '</b><span>人口</span></div>' +
      '<div class="kpi"><b>' + fmtN(d.dens) + '</b><span>人／km²（概略）</span></div>' +
      '<div class="kpi"><b>' + d.inc + '</b><span>所得中位數 千元</span></div>' +
      '<div class="kpi"><b>' + fmtN(d.hh) + '</b><span>戶數</span></div>' +
      '<div class="kpi"><b>' + (d.metro.length + d.rail.length + d.hsr.length) + '</b><span>軌道車站</span></div>' +
      '<div class="kpi est"><b>' + D.RENT_TIERS[r.tier].n + '</b><span>租金級距（自估）</span></div></div>' +
    '<div class="small" style="font-weight:700">評分項目（0～100）</div><div class="cbars">' + D.COMPS.map(function(x, i){
      var v = Math.round(r.s[x.k]); return '<div class="cbar" title="' + x.s + '"><span>' + x.n + '</span><div class="tr"><i style="width:' + v + '%;background:' + SC[i] + '"></i></div><span class="v">' + v + '</span></div>'; }).join('') + '</div>' +
    '<ul class="why">' + ex.good.map(function(t){ return '<li class="g">' + esc(t) + '</li>'; }).join('') + ex.warn.map(function(t){ return '<li class="w">' + esc(t) + '</li>'; }).join('') + '</ul>' +
    '<div class="small" style="font-weight:700;margin-top:10px">年齡結構</div>' +
    '<div class="lgd" style="margin:2px 0 0"><span><i class="sw" style="background:var(--s1)"></i>' + esc(d.name) + '</span><span><i class="sw" style="background:var(--ref)"></i>四縣市平均</span></div>' +
    '<div class="ages">' + shares.map(function(v, i){ return '<div class="ag" data-age="' + i + '"><i style="height:' + (v / mx * 100) + '%;background:var(--s1)" data-tipv="' + esc(d.name) + ' ' + D.AGE_N[i] + '：' + (v * 100).toFixed(1) + '%"></i><i style="height:' + (D.AVG.age[i] / mx * 100) + '%;background:var(--ref)" data-tipv="四縣市平均 ' + D.AGE_N[i] + '：' + (D.AVG.age[i] * 100).toFixed(1) + '%"></i></div>'; }).join('') + '</div>' +
    '<div class="agel">' + D.AGE_N.map(function(n, i){ return '<span>' + n + '<br><b class="mono">' + (shares[i] * 100).toFixed(0) + '%</b></span>'; }).join('') + '</div>' +
    '<p class="small" style="margin:10px 0 2px"><b>區域性質（自行整理）</b>　' + d.tags.map(function(t){ return '<span class="tagc">' + D.TAGS[t] + '</span>'; }).join('') + '</p>' +
    '<p class="small" style="margin:4px 0"><b>車站</b>　' + (d.metro.length + d.rail.length + d.hsr.length ? (d.metro.length ? '捷運／輕軌：' + d.metro.map(esc).join('、') + '。' : '') + (d.rail.length ? '台鐵：' + d.rail.map(esc).join('、') + '。' : '') + (d.hsr.length ? '高鐵：' + d.hsr.map(esc).join('、') + '。' : '') : '區內沒有軌道車站') + '</p>' +
    '<div class="stack"><button class="btn" data-act="addSiteHere" data-d="' + d.id + '">📍 在這區新增候選店面</button></div></div>';
}
function tableHtml(rows){
  var cols = [['rank', '名次'], ['name', '行政區'], ['total', '適合度'], ['pop', '人口'], ['dens', '密度'], ['inc', '所得中位數'], ['kids', '0–14%'], ['young', '15–44%'], ['old', '65+%'], ['st', '車站'], ['rent', '租金級距']];
  var get = function(r, k){ var d = r.d; return k === 'rank' ? r.rank : k === 'name' ? r.id : k === 'total' ? r.total : k === 'rent' ? r.tier : k === 'st' ? d.metro.length + d.rail.length + d.hsr.length : k === 'kids' ? D.share(d, 0) : k === 'young' ? D.share(d, 1) + D.share(d, 2) : k === 'old' ? D.share(d, 4) : d[k]; };
  var list = rows.slice().sort(function(a, b){ var x = get(a, V.sortK), y = get(b, V.sortK); return (x < y ? -1 : x > y ? 1 : 0) * V.sortDir; });
  return '<details class="card" id="tblD"' + (lsGet('tblOpen') ? ' open' : '') + '><summary class="ctitle" style="cursor:pointer;margin:0"><span class="dwg">A-04</span>全部行政區數據表<span class="sub">點欄位名稱排序・點一列選取</span></summary><div class="tblw" style="margin-top:10px;max-height:460px"><table class="t"><thead><tr>' +
    cols.map(function(c){ return '<th data-sort="' + c[0] + '">' + c[1] + (V.sortK === c[0] ? (V.sortDir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
    list.map(function(r){ var d = r.d; return '<tr data-d="' + r.id + '" class="' + (S.sel === r.id ? 'sel' : '') + '"><td>' + r.rank + '</td><td class="tx">' + d.city + d.name + '</td><td>' + r.total + '</td><td>' + fmtN(d.pop) + '</td><td>' + fmtN(d.dens) + '</td><td>' + d.inc + '</td><td>' + (D.share(d, 0) * 100).toFixed(1) + '</td><td>' + ((D.share(d, 1) + D.share(d, 2)) * 100).toFixed(1) + '</td><td>' + (D.share(d, 4) * 100).toFixed(1) + '</td><td>' + (d.metro.length + d.rail.length + d.hsr.length) + '</td><td class="tx">' + D.RENT_TIERS[r.tier].n + '</td></tr>'; }).join('') +
    '</tbody></table></div></details>';
}
function areaHtml(){
  var rows = R();
  return condHtml() + '<div class="grid g-area">' + mapHtml(rows) + detailHtml(rows) + '</div>' +
    '<div class="grid g-2" style="margin-top:14px">' + rankHtml(rows) + scatterHtml(rows) + '</div>' +
    '<div style="margin-top:14px">' + tableHtml(rows) + '</div>';
}

/* ========== 02 比店面 ========== */
function numIn(s, k, label, unit, step, ph){
  return '<div class="fld"><label>' + label + '</label><div class="inrow"><input type="number" min="0" step="' + (step || 1) + '" data-sk="' + k + '" data-sid="' + s.id + '" value="' + (s[k] !== undefined ? s[k] : '') + '" placeholder="' + (ph || '') + '"><span class="unit">' + unit + '</span></div></div>';
}
function selIn(s, k, label, opts){
  return '<div class="fld"><label>' + label + '</label><select data-sk="' + k + '" data-sid="' + s.id + '">' + Object.keys(opts).map(function(o){ return '<option value="' + o + '"' + (String(s[k]) === o ? ' selected' : '') + '>' + opts[o] + '</option>'; }).join('') + '</select></div>';
}
function siteCard(s, i){
  var t = D.TYPES[S.ctx.type], sc = D.scoreSite(s, S.ctx), ft = trafficOf(s);
  var dOpts = {'':'（不指定）'}; D.list.forEach(function(d){ dOpts[d.id] = cityShort(d.city) + ' ' + d.name; });
  return '<div class="site" style="--c:' + siteColor(i) + '" data-site="' + s.id + '"><div class="shd"><input type="text" data-sk="name" data-sid="' + s.id + '" value="' + esc(s.name) + '" aria-label="店面名稱"><span class="sc" id="sc_' + s.id + '">' + sc.total + '</span></div>' +
    '<div class="sf">' +
      '<div class="w2">' + selIn(s, 'district', '所在行政區', dOpts) + '</div>' +
      numIn(s, 'rent', '月租', '萬元', .1) + numIn(s, 'ping', '坪數', '坪', .5) +
      numIn(s, 'front', '店面寬', '公尺', .5) + selIn(s, 'floor', '樓層位置', D.FLOORS) +
      numIn(s, 'walk', '走到捷運／公車站', '分鐘', 1) + selIn(s, 'park', '停車', D.PARKS) +
      numIn(s, 'comp', '200m 內同業', '家', 1) + numIn(s, 'compl', '200m 內互補店', '家', 1, '例 超商') +
      selIn(s, 'vis', '能見度（從路口看）', {1:'1 很難看到', 2:'2', 3:'3 普通', 4:'4', 5:'5 非常顯眼'}) + selIn(s, 'cond', '店況', D.CONDS) +
      '<div class="fld w2"><label>門前人流</label><div class="inrow"><input type="number" min="0" step="10" data-sk="traffic" data-sid="' + s.id + '" value="' + (s.traffic !== undefined ? s.traffic : '') + '"><span class="unit">人／小時</span>' +
        (ft.n ? '<button class="btn sm alt" data-act="useCount" data-sid="' + s.id + '" title="用人流計數的平均">用計數 ' + ft.avg + '</button>' : '<button class="btn sm alt" data-act="goCount" data-sid="' + s.id + '">去數人流</button>') + '</div></div>' +
    '</div>' +
    '<details style="margin-top:8px"><summary class="small" style="cursor:pointer;font-weight:700">💰 營業額估算（月租占比要用）</summary><div class="sf" style="margin-top:6px">' +
      numIn(s, 'capture', '進店率', '%', .1, t.capture) + numIn(s, 'ticket', '客單價', '元', 10, t.ticket) +
      numIn(s, 'hours', '每天營業', '小時', 1, t.hours) + numIn(s, 'revenue', '或直接填月營業額', '萬元', 1) +
      '<p class="small w2" style="margin:0">月營業額 ≈ 人流 × 進店率 × 客單價 × 營業時數 × 30 天。空白就用「' + t.n + '」的預設值（灰字）。</p></div></details>' +
    '<p class="small" id="rv_' + s.id + '" style="margin:6px 0 0">' + revLine(sc) + '</p>' +
    (sc.notes.length ? '<ul class="notes" id="nt_' + s.id + '">' + sc.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '<ul class="notes" id="nt_' + s.id + '"></ul>') +
    '<div class="stack"><button class="btn sm alt" data-act="toChecklist" data-sid="' + s.id + '">➜ 帶到開店前置清單</button><button class="btn sm alt" data-act="delSite" data-sid="' + s.id + '">刪除</button></div></div>';
}
function revLine(sc){ return sc.revenue > 0 ? '預估月營業額 <b class="mono">' + sc.revenue + '</b> 萬・租金占 <b class="mono">' + (sc.ratio === null ? '—' : sc.ratio + '%') + '</b>' : '<span class="muted">還沒有營業額預估</span>'; }
function compareHtml(){
  var ss = S.sites; if(!ss.length) return '';
  var scs = ss.map(function(s){ return D.scoreSite(s, S.ctx); });
  if(!V.radar) V.radar = ss.slice(0, 3).map(function(s){ return s.id; });
  V.radar = V.radar.filter(function(id){ return ss.some(function(s){ return s.id === id; }); });
  // 總分長條
  var bars = '<div class="rank">' + ss.map(function(s, i){ var sc = scs[i]; return '<div class="rrow" style="cursor:default"><span class="no"><i class="sw" style="background:' + siteColor(i) + '"></i></span><span class="nm">' + esc(s.name) + '<small>' + (s.district ? esc(s.district) : '未指定區') + '</small></span><div class="stk">' +
    D.SITE_COMPS.map(function(x, ci){ var p = sc.parts[x.k]; return p > .05 ? '<span data-sseg="' + ci + '" data-sid="' + s.id + '" style="width:' + p + '%;background:' + SC[ci] + '"></span>' : ''; }).join('') + '</div><span class="val">' + sc.total + '</span></div>'; }).join('') + '</div>';
  // 雷達（最多 3 間同時比，顏色跟著店面走）
  var N = D.SITE_COMPS.length, cx = 170, cy = 150, RR = 110, ax = '', poly = '';
  for(var lv = 1; lv <= 4; lv++){ var pts = []; for(var a = 0; a < N; a++){ var an = -Math.PI / 2 + a * 2 * Math.PI / N; pts.push((cx + Math.cos(an) * RR * lv / 4).toFixed(1) + ',' + (cy + Math.sin(an) * RR * lv / 4).toFixed(1)); } ax += '<polygon points="' + pts.join(' ') + '" fill="none" class="gl"></polygon>'; }
  D.SITE_COMPS.forEach(function(x, a){ var an = -Math.PI / 2 + a * 2 * Math.PI / N, ex = cx + Math.cos(an) * RR, ey = cy + Math.sin(an) * RR; ax += '<line class="ax" x1="' + cx + '" y1="' + cy + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '"></line><text x="' + (cx + Math.cos(an) * (RR + 16)).toFixed(1) + '" y="' + (cy + Math.sin(an) * (RR + 16) + 4).toFixed(1) + '" text-anchor="middle" style="font-weight:700">' + x.n + '</text>'; });
  ss.forEach(function(s, i){ if(V.radar.indexOf(s.id) < 0) return; var sc = scs[i], pts = D.SITE_COMPS.map(function(x, a){ var an = -Math.PI / 2 + a * 2 * Math.PI / N, v = sc.s[x.k] / 100 * RR; return (cx + Math.cos(an) * v).toFixed(1) + ',' + (cy + Math.sin(an) * v).toFixed(1); });
    poly += '<polygon points="' + pts.join(' ') + '" style="fill:' + siteColor(i) + ';fill-opacity:.14;stroke:' + siteColor(i) + ';stroke-width:2"></polygon>' + pts.map(function(p, a){ var xy = p.split(','); return '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="4" style="fill:' + siteColor(i) + ';stroke:var(--paper);stroke-width:2" data-rtip="' + esc(s.name) + '・' + D.SITE_COMPS[a].n + '：' + Math.round(sc.s[D.SITE_COMPS[a].k]) + '"></circle>'; }).join(''); });
  var radar = '<div class="chips" style="margin-bottom:6px">' + ss.map(function(s, i){ var on = V.radar.indexOf(s.id) >= 0; return '<button class="chip' + (on ? ' on' : '') + '" data-radar="' + s.id + '" aria-pressed="' + on + '"><i class="sw" style="background:' + siteColor(i) + ';margin-right:4px"></i>' + esc(s.name) + '</button>'; }).join('') + '</div>' +
    '<svg class="svgchart" viewBox="0 0 340 300" style="max-width:420px;margin:0 auto" role="img" aria-label="店面六項評分雷達圖">' + ax + poly + '</svg><p class="src">一次最多疊 3 間，避免顏色太多看不清楚。</p>';
  // 租金占比
  var ratio = ss.map(function(s, i){ var sc = scs[i], p = sc.ratio, lab = {ok:'寬鬆', mid:'尚可', high:'偏重', na:'—'}[sc.level], ic = {ok:'✔', mid:'⚠', high:'✖', na:''}[sc.level];
    return '<div class="ratio" style="--c:' + siteColor(i) + '"><span class="nm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(s.name) + '</span><div class="trk" aria-hidden="true">' + (p !== null ? '<i style="width:' + Math.min(p, 25) / 25 * 100 + '%"></i>' : '') + '<em style="left:40%"></em><em style="left:60%"></em></div><span class="mono">' + (p === null ? '—' : p + '%') + ' <span class="lv ' + sc.level + '">' + ic + lab + '</span></span></div>'; }).join('');
  // 對照表
  var rowsT = [['所在區', function(s){ return s.district ? esc(s.district.slice(3)) : '—'; }], ['區域適合度', function(s){ var r = s.district ? D.scoreDistrict(D.byId(s.district), S.ctx) : null; return r ? r.total : '—'; }],
    ['月租（萬）', function(s){ return s.rent !== undefined ? s.rent : '—'; }], ['每坪租金（元）', function(s){ return s.rent > 0 && s.ping > 0 ? fmtN(s.rent * 10000 / s.ping) : '—'; }],
    ['人流（人／時）', function(s){ return s.traffic !== undefined ? fmtN(s.traffic) : '—'; }], ['預估月營業額（萬）', function(s, sc){ return sc.revenue || '—'; }], ['租金占比', function(s, sc){ return sc.ratio === null ? '—' : sc.ratio + '%'; }]]
    .concat(D.SITE_COMPS.map(function(x){ return [x.n, function(s, sc){ return Math.round(sc.s[x.k]); }]; })).concat([['總分', function(s, sc){ return '<b>' + sc.total + '</b>'; }]]);
  var tbl = '<div class="tblw"><table class="t" style="min-width:' + (180 + ss.length * 110) + 'px"><thead><tr><th>項目</th>' + ss.map(function(s, i){ return '<th><i class="sw" style="background:' + siteColor(i) + '"></i> ' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rowsT.map(function(r){ return '<tr style="cursor:default"><td class="tx">' + r[0] + '</td>' + ss.map(function(s, i){ return '<td>' + r[1](s, scs[i]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
  return '<div class="grid g-2" style="margin-top:14px"><div class="card"><h2 class="ctitle"><span class="dwg">B-02</span>店面總分<span class="sub">由 6 項組成，權重依店型「' + D.TYPES[S.ctx.type].n + '」</span></h2>' +
      '<div class="lgd">' + D.SITE_COMPS.map(function(x, i){ return '<span><i class="sw" style="background:' + SC[i] + '"></i>' + x.n + ' ' + D.SITE_W[S.ctx.type][x.k] + '%</span>'; }).join('') + '</div>' + bars +
      '<h3 class="ctitle" style="margin-top:16px;font-size:1rem"><span class="dwg">B-03</span>租金占營業額<span class="sub">綠 ≤10%・黃 10～15%・紅 >15%（常見經驗法則）</span></h3>' + ratio + '</div>' +
    '<div class="card"><h2 class="ctitle"><span class="dwg">B-04</span>六項評分雷達</h2>' + radar + '</div></div>' +
    '<div class="card" style="margin-top:14px"><h2 class="ctitle"><span class="dwg">B-05</span>店面對照表</h2>' + tbl + '</div>';
}
function sitesHtml(){
  var ss = S.sites;
  return '<div class="card" style="margin-bottom:14px"><h2 class="ctitle"><span class="dwg">B-01</span>候選店面<span class="sub">把實地看過的店面填進來（最多 ' + MAXSITES + ' 間），分數會即時更新</span></h2>' +
    '<p class="small" style="margin:0 0 10px">店型：<b>' + D.TYPES[S.ctx.type].ic + ' ' + D.TYPES[S.ctx.type].n + '</b>（在「🗺 找區域」修改）。不知道的欄位可以先空著。</p>' +
    (ss.length ? '<div class="sites">' + ss.map(siteCard).join('') + '</div>' : '<div class="empty">還沒有候選店面。<br>先到「🗺 找區域」挑一區按「📍 在這區新增候選店面」，或直接新增。</div>') +
    (ss.length < MAXSITES ? '<div class="stack"><button class="btn" data-act="addSite">＋ 新增候選店面</button></div>' : '') + '</div>' +
    '<div id="cmp">' + compareHtml() + '</div>';
}
function refreshSites(){
  S.sites.forEach(function(s){ var sc = D.scoreSite(s, S.ctx), e = $('sc_' + s.id); if(e) e.textContent = sc.total; var rv = $('rv_' + s.id); if(rv) rv.innerHTML = revLine(sc); var nt = $('nt_' + s.id); if(nt) nt.innerHTML = sc.notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join(''); });
  var c = $('cmp'); if(c) c.innerHTML = compareHtml();
}

/* ========== 03 人流計數 ========== */
function slotNow(){ var h = new Date().getHours(); return h < 11 ? 'am' : h < 14 ? 'noon' : h < 17 ? 'pm' : 'night'; }
function dayNow(){ var w = new Date().getDay(); return w === 0 || w === 6 ? 'we' : 'wd'; }
function countHtml(){
  if(!S.sites.length) return '<div class="empty">要先有候選店面才能數人流。<div class="stack" style="justify-content:center"><button class="btn" data-act="addSite">＋ 新增候選店面</button></div></div>';
  if(!V.cnt) V.cnt = {site:S.sites[0].id, day:dayNow(), slot:slotNow(), target:15, n:0, start:0, run:false, el:0};
  if(!S.sites.some(function(s){ return s.id === V.cnt.site; })) V.cnt.site = S.sites[0].id;
  var c = V.cnt, si = S.sites.findIndex(function(s){ return s.id === c.site; }), s = S.sites[si], ft = trafficOf(s);
  var all = []; Object.keys(D.SLOTS).forEach(function(k){ ['wd', 'we'].forEach(function(dk){ if(ft.m[dk][k].avg !== null) all.push(ft.m[dk][k].avg); }); });
  var mx = Math.max.apply(null, all.concat([1]));
  var gb = Object.keys(D.SLOTS).map(function(k){ return '<div class="gb">' + ['wd', 'we'].map(function(dk, j){ var v = ft.m[dk][k].avg; return v === null ? '<i style="height:2px;background:var(--rule)" data-tipv="' + D.DAYS[dk] + D.SLOTS[k] + '：還沒數"></i>' : '<i style="height:' + (v / mx * 92) + '%;background:' + (j ? 'var(--s2)' : 'var(--s1)') + '" data-tipv="' + D.DAYS[dk] + D.SLOTS[k] + '：每小時約 ' + fmtN(v) + ' 人（' + ft.m[dk][k].cnt + ' 次平均）"><em>' + fmtN(v) + '</em></i>'; }).join('') + '</div>'; }).join('');
  var ses = S.sessions.filter(function(x){ return x.site === s.id; });
  return '<div class="counter"><div class="card"><h2 class="ctitle"><span class="dwg">C-01</span>人流計數器<span class="sub">站在店門口，每有一個人走過就按一下</span></h2>' +
    '<div class="fld"><span class="lab">店面</span><div class="chips">' + S.sites.map(function(x, i){ return '<button class="chip' + (x.id === c.site ? ' on' : '') + '" data-cnt-site="' + x.id + '"><i class="sw" style="background:' + siteColor(i) + ';margin-right:4px"></i>' + esc(x.name) + '</button>'; }).join('') + '</div></div>' +
    '<div class="cond" style="margin:8px 0;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' +
      '<div class="fld"><span class="lab">日子</span><div class="chips">' + Object.keys(D.DAYS).map(function(k){ return chip('data-cnt-day', k, c.day === k, D.DAYS[k]); }).join('') + '</div></div>' +
      '<div class="fld"><span class="lab">時段</span><div class="chips">' + Object.keys(D.SLOTS).map(function(k){ return chip('data-cnt-slot', k, c.slot === k, D.SLOTS[k]); }).join('') + '</div></div>' +
      '<div class="fld"><span class="lab">要數幾分鐘</span><div class="chips">' + [5, 10, 15, 30].map(function(k){ return chip('data-cnt-min', k, c.target === k, k + ' 分'); }).join('') + '</div></div></div>' +
    '<div class="inrow" style="justify-content:space-between"><span class="clock" id="clk">' + clockText() + '</span><span class="small" id="clkHint">' + (c.run ? '計時中…' : c.n ? '已暫停' : '按下大按鈕就開始計時') + '</span></div>' +
    '<div class="prog"><i id="clkBar" style="width:' + Math.min(100, elapsed() / (c.target * 60000) * 100) + '%"></i></div>' +
    '<button class="tap" data-act="tap" id="tapBtn"><b id="tapN">' + c.n + '</b><span>有人走過　＋1</span></button>' +
    '<div class="stack"><button class="btn alt" data-act="tapMinus">－1</button><button class="btn alt" data-act="tapPause">' + (c.run ? '⏸ 暫停' : c.el || c.n ? '▶ 繼續' : '▶ 開始') + '</button><button class="btn" data-act="tapSave">💾 存下這次</button><button class="btn alt" data-act="tapReset">重來</button></div>' +
    '<p class="src">電腦上也可以按空白鍵＋1。只算經過店門口的行人（含騎樓），車內的人不算。建議平日、假日的早、中、晚各數 15 分鐘。</p></div>' +
    '<div class="card"><h2 class="ctitle"><span class="dwg">C-02</span>' + esc(s.name) + ' 的人流<span class="sub">每小時人數，平日 vs 假日</span></h2>' +
      (ft.n ? '<p style="margin:0">平均每小時約 <b class="mono" style="font-size:1.4rem">' + fmtN(ft.avg) + '</b> 人（' + ft.n + ' 次計數）</p>' : '<p class="small">這間還沒有計數紀錄。</p>') +
      '<div class="lgd" style="margin-top:8px"><span><i class="sw" style="background:var(--s1)"></i>平日</span><span><i class="sw" style="background:var(--s2)"></i>假日</span></div>' +
      '<div class="gbars">' + gb + '</div><div class="gbl">' + Object.keys(D.SLOTS).map(function(k){ return '<span>' + D.SLOTS[k] + '</span>'; }).join('') + '</div>' +
      (ses.length ? '<div class="tblw" style="margin-top:12px"><table class="t" style="min-width:0"><thead><tr><th>日期</th><th>時段</th><th>分鐘</th><th>人數</th><th>每小時</th><th></th></tr></thead><tbody>' +
        ses.map(function(x){ var gi = S.sessions.indexOf(x); return '<tr style="cursor:default"><td>' + esc(x.at) + '</td><td class="tx">' + D.DAYS[x.day] + D.SLOTS[x.slot] + '</td><td>' + x.min + '</td><td>' + x.n + '</td><td>' + fmtN(D.perHour(x)) + '</td><td><button class="btn sm alt" data-act="delSes" data-i="' + gi + '" aria-label="刪除這筆">✕</button></td></tr>'; }).join('') + '</tbody></table></div>' : '') +
      (ft.n ? '<p class="small">存檔時會自動把平均人流填進這間店面的「門前人流」。</p>' : '') + '</div></div>';
}
function elapsed(){ var c = V.cnt; return c ? c.el + (c.run ? Date.now() - c.start : 0) : 0; }
function clockText(){ var t = Math.floor(elapsed() / 1000); return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + t % 60).slice(-2) + ' / ' + (V.cnt ? V.cnt.target : 15) + ':00'; }
var clkTimer = null;
function tickClock(){
  var c = V.cnt; if(!c) return;
  var e = $('clk'); if(e) e.textContent = clockText();
  var b = $('clkBar'); if(b) b.style.width = Math.min(100, elapsed() / (c.target * 60000) * 100) + '%';
  if(c.run && elapsed() >= c.target * 60000){ c.el = c.target * 60000; c.run = false; stopClock(); toast('時間到！共 ' + c.n + ' 人，按「存下這次」'); if(navigator.vibrate) try{ navigator.vibrate([200, 100, 200]); }catch(er){} if(V.tab === 'count') render(); }
}
function startClock(){ if(!clkTimer) clkTimer = setInterval(tickClock, 500); }
function stopClock(){ if(clkTimer){ clearInterval(clkTimer); clkTimer = null; } }
function tap(d){
  var c = V.cnt; if(!c) return;
  if(d > 0 && !c.run && elapsed() < c.target * 60000){ c.run = true; c.start = Date.now(); startClock(); var h = $('clkHint'); if(h) h.textContent = '計時中…'; }
  c.n = Math.max(0, c.n + d); var n = $('tapN'); if(n) n.textContent = c.n;
}

/* ========== 04 看店清單 ========== */
function checkHtml(){
  if(!S.sites.length) return '<div class="empty">要先有候選店面才能用看店清單。<div class="stack" style="justify-content:center"><button class="btn" data-act="addSite">＋ 新增候選店面</button></div></div>';
  if(!V.chkSite || !S.sites.some(function(s){ return s.id === V.chkSite; })) V.chkSite = S.sites[0].id;
  var s = S.sites.filter(function(x){ return x.id === V.chkSite; })[0], total = 0;
  D.CHECK.forEach(function(g){ total += g.items.length; });
  var prog = S.sites.map(function(x, i){ var n = Object.keys(x.checks).length; return '<div class="mini" style="--c:' + siteColor(i) + '"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.name) + '</span><div class="tr"><i style="width:' + n / total * 100 + '%"></i></div><span class="mono">' + n + '/' + total + '</span></div>'; }).join('');
  return '<div class="grid g-area"><div class="card"><h2 class="ctitle"><span class="dwg">D-01</span>看店檢查清單<span class="sub">簽約前逐項確認，每間店面分開記</span></h2>' +
    '<div class="chips" style="margin-bottom:10px">' + S.sites.map(function(x, i){ return '<button class="chip' + (x.id === s.id ? ' on' : '') + '" data-chk-site="' + x.id + '"><i class="sw" style="background:' + siteColor(i) + ';margin-right:4px"></i>' + esc(x.name) + '</button>'; }).join('') + '</div>' +
    '<div class="chk">' + D.CHECK.map(function(g){ return '<div><h4>' + g.g + '</h4>' + g.items.map(function(it){ var on = !!s.checks[it[0]]; return '<label class="' + (on ? 'done' : '') + '"><input type="checkbox" data-chk="' + it[0] + '"' + (on ? ' checked' : '') + '><span>' + esc(it[1]) + '</span></label>'; }).join('') + '</div>'; }).join('') + '</div>' +
    '<p class="src">要辦哪些登記與執照，請接著用「開店前置清單」（店面卡片上的「➜ 帶到開店前置清單」）。</p></div>' +
    '<div class="card pinned"><h2 class="ctitle"><span class="dwg">D-02</span>各店面完成度</h2>' + prog + '</div></div>';
}

/* ---------- 匯出 ---------- */
function download(name, text, type){
  var b = new Blob([text], {type:type || 'text/plain;charset=utf-8'}), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvCell(v){ v = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function csvText(){
  var rows = [['名次', '縣市', '行政區', '適合度'].concat(D.COMPS.map(function(c){ return c.n; }), ['人口', '戶數', '人口密度(概略)', '所得中位數(千元)', '0-14歲%', '15-24歲%', '25-44歲%', '45-64歲%', '65歲以上%', '捷運輕軌站', '台鐵站', '高鐵站', '租金級距(自估)', '區域性質(自行整理)'])];
  R().forEach(function(r){ var d = r.d; rows.push([r.rank, d.city, d.name, r.total].concat(D.COMPS.map(function(c){ return Math.round(r.s[c.k]); }), [d.pop, d.hh, d.dens, d.inc], d.age.map(function(v){ return (v / d.pop * 100).toFixed(1); }), [d.metro.length, d.rail.length, d.hsr.length, D.RENT_TIERS[r.tier].n, d.tags.map(function(t){ return D.TAGS[t]; }).join('、')])); });
  if(S.sites.length){
    rows.push([]); rows.push(['候選店面', '所在區', '月租(萬)', '坪數', '人流(人/時)', '預估月營業額(萬)', '租金占比%'].concat(D.SITE_COMPS.map(function(c){ return c.n; }), ['總分']));
    S.sites.forEach(function(s){ var sc = D.scoreSite(s, S.ctx); rows.push([s.name, s.district, s.rent, s.ping, s.traffic, sc.revenue, sc.ratio].concat(D.SITE_COMPS.map(function(c){ return Math.round(sc.s[c.k]); }), [sc.total])); });
  }
  return '﻿' + rows.map(function(r){ return r.map(csvCell).join(','); }).join('\r\n');
}
function b64e(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(s){ s = s.replace(/-/g, '+').replace(/_/g, '/'); while(s.length % 4) s += '='; return decodeURIComponent(escape(atob(s))); }
function shareObj(){ return {ctx:S.ctx, sites:S.sites.map(function(s){ var o = Object.assign({}, s); delete o.checks; delete o.id; return o; })}; }
function shareUrl(){ return location.origin + location.pathname + '#s=' + b64e(JSON.stringify(shareObj())); }
function copyText(t, msg){
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function(){ toast(msg || '已複製'); }, function(){ fallbackCopy(t, msg); });
  else fallbackCopy(t, msg);
}
function fallbackCopy(t, msg){ openModal('<h2>請複製下面的內容</h2><textarea rows="5" style="width:100%" readonly>' + esc(t) + '</textarea><div class="stack"><button class="btn" data-act="close">關閉</button></div>'); var ta = $('modalBox').querySelector('textarea'); ta.focus(); ta.select(); }
/* 開店前置清單接力 */
var SOC_URL = 'https://m255525.github.io/shop-opening-checklist/';
function checklistUrl(s){
  var t = S.ctx.type, sc = D.scoreSite(s, S.ctx);
  var ctx = {name:(S.ctx.name || s.name || '').slice(0, 30), type:t, org:'sole', sales:Math.round(sc.revenue || 0), staff:t === 'food' || t === 'retail' || t === 'beauty' ? '1-4' : '0',
    place:t === 'stall' ? 'spot' : 'rent', reno:s.cond !== 'ready', sign:t !== 'online', music:t === 'food' || t === 'retail' || t === 'beauty', member:false, delivery:false, food:false};
  return SOC_URL + '#s=' + b64e(JSON.stringify(ctx));
}
/* 報告（列印＋PDF 共用） */
function mapSvgStatic(rows){
  var cols = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'], vals = layerVals('score', rows), br = layerBreaks('score', vals), inSet = {}, h = '';
  rows.forEach(function(r){ inSet[r.id] = 1; });
  var B = bboxes(), b = [1e9, 1e9, -1e9, -1e9];
  Object.keys(MAP.towns).forEach(function(id){ var x = B[id]; if(inSet[id]){ b[0] = Math.min(b[0], x[0]); b[1] = Math.min(b[1], x[1]); b[2] = Math.max(b[2], x[2]); b[3] = Math.max(b[3], x[3]); } });
  var swd = Math.max(.4, (b[2] - b[0]) / 900);
  Object.keys(MAP.towns).forEach(function(id){ h += '<path d="' + MAP.towns[id].d + '" fill="' + (inSet[id] ? cols[D.binOf(vals[id], br)] : '#e2ddd0') + '" stroke="#fff" stroke-width="' + swd + '"></path>'; });
  var k = Math.max(.35, (b[2] - b[0] + 28) / MAP.w);
  rows.slice(0, 10).forEach(function(r, i){ var c = MAP.towns[r.id].c; h += '<g transform="translate(' + c[0] + ',' + c[1] + ') scale(' + k + ')"><circle r="9" fill="#c8372d" stroke="#fff" stroke-width="1.5"></circle><text font-size="10" fill="#fff" text-anchor="middle" dy="3.5" font-family="Arial" font-weight="700">' + (i + 1) + '</text></g>'; });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (b[0] - 14) + ' ' + (b[1] - 14) + ' ' + (b[2] - b[0] + 28) + ' ' + (b[3] - b[1] + 28) + '" style="width:100%;max-height:330px">' + h + '</svg>';
}
function reportEl(){
  var rows = R(), c = S.ctx, top = rows.slice(0, 10);
  var h = '<style>#pdfReport,#pdfReport *{box-sizing:border-box}#pdfReport{width:100%;padding:2px 8px 2px 2px;background:#fff;color:#222;font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif;font-size:12.5px;line-height:1.55}' +
    '#pdfReport h1{font-family:"Noto Serif TC",serif;font-size:23px;margin:0 0 4px;color:#1d3557}#pdfReport h2{font-size:15px;color:#1b4f86;border-bottom:2px solid #1b4f86;padding-bottom:2px;margin:16px 0 8px}' +
    '#pdfReport .meta{color:#555;font-size:12px;margin:0}#pdfReport .warn{font-size:11px;color:#8a2a1f;margin:6px 0 10px;border:1px solid #e3c4bd;border-radius:6px;padding:4px 8px;background:#fdf5f3}' +
    '#pdfReport table{border-collapse:collapse;width:100%;font-size:11.5px}#pdfReport th,#pdfReport td{border:1px solid #cfd6e0;padding:3px 6px;text-align:right}#pdfReport th{background:#eef3f9}#pdfReport td.l,#pdfReport th.l{text-align:left}' +
    '#pdfReport .kp{page-break-inside:avoid}#pdfReport ul{margin:4px 0;padding-left:1.3em}</style>' +
    '<div id="pdfReport"><h1>開店選址評估報告' + (c.name ? '：' + esc(c.name) : '') + '</h1>' +
    '<p class="meta">產出日期 ' + today() + '・店型 ' + D.TYPES[c.type].n + '・客群 ' + (c.targets.length ? c.targets.map(function(t){ return D.TARGETS[t].n; }).join('、') : '未指定') + '・範圍 ' + (c.cities.length ? c.cities.join('、') : '台北市、新北市、桃園市、新竹市、新竹縣') + '・月租預算 ' + (c.budget ? c.budget + ' 萬元' : '未填') + '</p>' +
    '<p class="warn">評分為規則式參考，不保證營業成績。人口為內政部戶政司民國 ' + D.DIST.meta.popYm.slice(0, 3) + ' 年 ' + (+D.DIST.meta.popYm.slice(3)) + ' 月統計、所得為財政部 ' + D.DIST.meta.incYear + ' 年度資料；租金級距與區域性質為自行整理的粗估；車站依 OpenStreetMap 站點判斷。</p>' +
    '<h2>一、適合度前 10 名</h2><div class="kp">' + mapSvgStatic(rows) + '</div>' +
    '<table class="kp"><thead><tr><th>名次</th><th class="l">行政區</th><th>適合度</th><th>人口</th><th>密度</th><th>所得中位數</th><th>65+%</th><th>車站</th><th class="l">租金級距</th></tr></thead><tbody>' +
    top.map(function(r){ var d = r.d; return '<tr><td>' + r.rank + '</td><td class="l">' + d.city + d.name + '</td><td>' + r.total + '</td><td>' + fmtN(d.pop) + '</td><td>' + fmtN(d.dens) + '</td><td>' + d.inc + '</td><td>' + (D.share(d, 4) * 100).toFixed(1) + '</td><td>' + (d.metro.length + d.rail.length + d.hsr.length) + '</td><td class="l">' + D.RENT_TIERS[r.tier].n + '</td></tr>'; }).join('') + '</tbody></table>' +
    top.slice(0, 3).map(function(r){ var e = D.explain(r, c); return '<div class="kp"><p style="margin:8px 0 0"><b>' + r.rank + '. ' + r.d.city + r.d.name + '（' + r.total + ' 分）</b></p><ul>' + e.good.map(function(t){ return '<li>✔ ' + esc(t) + '</li>'; }).join('') + e.warn.map(function(t){ return '<li>⚠ ' + esc(t) + '</li>'; }).join('') + '</ul></div>'; }).join('');
  if(S.sites.length){
    var scs = S.sites.map(function(s){ return D.scoreSite(s, c); }), total = 0; D.CHECK.forEach(function(g){ total += g.items.length; });
    h += '<h2>二、候選店面比較</h2><table class="kp"><thead><tr><th class="l">項目</th>' + S.sites.map(function(s){ return '<th>' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      [['所在區', function(s){ return esc(s.district || '—'); }], ['月租（萬）', function(s){ return s.rent === undefined ? '—' : s.rent; }], ['坪數', function(s){ return s.ping === undefined ? '—' : s.ping; }], ['人流（人／時）', function(s){ return s.traffic === undefined ? '—' : fmtN(s.traffic); }],
       ['預估月營業額（萬）', function(s, sc){ return sc.revenue || '—'; }], ['租金占比', function(s, sc){ return sc.ratio === null ? '—' : sc.ratio + '%'; }]]
      .concat(D.SITE_COMPS.map(function(x){ return [x.n, function(s, sc){ return Math.round(sc.s[x.k]); }]; }), [['總分', function(s, sc){ return '<b>' + sc.total + '</b>'; }], ['看店清單', function(s){ return Object.keys(s.checks).length + '/' + total; }]])
      .map(function(rw){ return '<tr><td class="l">' + rw[0] + '</td>' + S.sites.map(function(s, i){ return '<td>' + rw[1](s, scs[i]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' +
      S.sites.map(function(s, i){ return scs[i].notes.length ? '<div class="kp"><p style="margin:8px 0 0"><b>' + esc(s.name) + ' 要注意</b></p><ul>' + scs[i].notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : ''; }).join('');
  }
  h += '<p class="meta" style="margin-top:14px">開店選址評估・m255525.github.io/shop-site-selector・創作者 Mark Tsai（蔡豐全）</p></div>';
  var w = document.createElement('div'); w.innerHTML = h; return w;
}
function doPrint(){ var p = $('printArea'); p.innerHTML = ''; p.appendChild(reportEl()); setTimeout(function(){ window.print(); }, 60); }
var H2P_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js', pdfBusy = false;
function loadH2P(){ if(window.html2pdf) return Promise.resolve(); return new Promise(function(ok, no){ var s = document.createElement('script'); s.src = H2P_URL; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
function fadedWatermark(alpha){
  return new Promise(function(ok, no){ var im = new Image(); im.onload = function(){ var c = document.createElement('canvas'); c.width = im.width; c.height = im.height; var x = c.getContext('2d'); x.globalAlpha = alpha; x.drawImage(im, 0, 0); ok({url:c.toDataURL('image/png'), w:im.width, h:im.height}); }; im.onerror = no; im.src = window.SSS_WATERMARK; });
}
/* html2canvas 不吃 SVG 的 viewBox：先把報告裡的地圖畫成 PNG 再放進去 */
function svgToImg(el){
  var svg = el.querySelector('svg'); if(!svg) return Promise.resolve();
  var vb = svg.getAttribute('viewBox').split(' ').map(Number), W = 1400, H = Math.round(W * vb[3] / vb[2]);
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  var src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  return new Promise(function(ok){
    var im = new Image();
    im.onload = function(){ var c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(im, 0, 0, W, H);
      var img = document.createElement('img'); img.src = c.toDataURL('image/png'); img.style.cssText = 'display:block;max-width:100%;max-height:330px;margin:0 auto'; svg.replaceWith(img); ok(); };
    im.onerror = function(){ ok(); };
    im.src = src;
  });
}
function downloadPdf(){
  if(pdfBusy) return; pdfBusy = true; toast('正在產生 PDF，請稍候…');
  var name = (S.ctx.name || '開店') + '選址評估-' + today() + '.pdf', el = reportEl();
  Promise.all([loadH2P(), fadedWatermark(.11), document.fonts ? document.fonts.ready : null, svgToImg(el)]).then(function(r){
    var wm = r[1];
    return html2pdf().set({
      margin:[12, 10, 14, 10], filename:name, image:{type:'jpeg', quality:.92},
      html2canvas:{scale:2, backgroundColor:'#ffffff', useCORS:true},
      jsPDF:{unit:'mm', format:'a4', orientation:'portrait'},
      pagebreak:{mode:['css', 'legacy'], avoid:['.kp', 'h2', 'tr']}
    }).from(el).toPdf().get('pdf').then(function(pdf){
      var n = pdf.internal.getNumberOfPages(), W = 210, H = 297, w = W * .42, hh = w * wm.h / wm.w;
      for(var i = 1; i <= n; i++){
        pdf.setPage(i); pdf.addImage(wm.url, 'PNG', (W - w) / 2, (H - hh) / 2, w, hh, 'ssswm', 'FAST');
        pdf.setFontSize(8); pdf.setTextColor(140); pdf.text('m255525.github.io/shop-site-selector', 10, H - 6); pdf.text(i + ' / ' + n, W - 10, H - 6, {align:'right'});
      }
    }).save();
  }).then(function(){ toast('PDF 已下載'); }, function(){ toast('PDF 產生失敗（可能沒有網路），請改用「🖨 列印」另存 PDF'); }).then(function(){ pdfBusy = false; });
}

/* ---------- 設定、警語 ---------- */
var WARN_HTML = '<h2>⚠ 使用警語</h2><ul>' +
  '<li>適合度與店面分數是本工具<b>自訂的規則式評分</b>，只能幫你縮小範圍、整理思路，<b>不保證營業成績</b>，也不是投資建議。</li>' +
  '<li>人口、年齡、戶數來自內政部戶政司民國 ' + D.DIST.meta.popYm.slice(0, 3) + ' 年 ' + (+D.DIST.meta.popYm.slice(3)) + ' 月統計；所得來自財政部財政資訊中心 ' + D.DIST.meta.incYear + ' 年度綜稅資料（不含免稅與分離課稅所得），都有時間差，也只到行政區層級，同一區不同街道差很多。</li>' +
  '<li><b>租金級距與區域性質是自行整理的粗估</b>，不是官方統計，實際租金請看當地行情；你可以在 ⚙ 常用設定逐區修改。</li>' +
  '<li>車站數依 OpenStreetMap 的站點位置自動判斷，行政區界線上的車站可能算到隔壁區；面積由界線圖計算，是概略值。</li>' +
  '<li>店面能不能開這種店（使用分區、建物用途、消防、室內裝修）請以縣市政府與承辦機關認定為準，簽約前一定要確認。</li>' +
  '<li>你填的條件、店面與人流紀錄<b>只存在這台裝置的瀏覽器</b>，不會上傳；清除瀏覽器資料就會不見，重要資料請用「⚙ 常用設定 → 資料備份」。</li>' +
  '<li>範例店家與店面全部是虛構的。</li></ul>';
function showWarn(){ openModal(WARN_HTML + '<div class="stack"><button class="btn" data-act="close">我知道了</button></div>'); }
function sec(id, title, val, body){ return '<details class="set-sec" data-sec="' + id + '"><summary><span class="sst">' + title + '</span><span class="ssv">' + esc(val) + '</span></summary><div class="set-body">' + body + '</div></details>'; }
function openSettings(){
  var c = S.ctx, nOv = Object.keys(c.rentOverride).length;
  var ov = D.CITIES.map(function(city){ return '<p class="small" style="margin:8px 0 4px"><b>' + city + '</b></p><div class="rentov">' + D.list.filter(function(d){ return d.city === city; }).map(function(d){ var cur = c.rentOverride[d.id] || d.rent; return '<label>' + d.name + '<select data-rentov="' + d.id + '">' + [1, 2, 3, 4].map(function(t){ return '<option value="' + t + '"' + (cur === t ? ' selected' : '') + '>' + D.RENT_TIERS[t].n + (t === d.rent ? '＊' : '') + '</option>'; }).join('') + '</select></label>'; }).join('') + '</div>'; }).join('');
  var h = '<div class="inrow" style="justify-content:space-between"><h2 style="margin:0">⚙ 常用設定</h2><button class="btn sm alt" data-act="foldall">全部展開／收合</button></div>' +
    sec('name', '店名（印在報告上）', c.name || '未填', '<input type="text" id="setName" maxlength="30" value="' + esc(c.name) + '" placeholder="例 晨光巷早午餐"><div class="stack"><button class="btn sm" data-act="saveName">儲存</button></div>') +
    sec('rent', '租金級距（自估，可逐區修改）', nOv ? '已改 ' + nOv + ' 區' : '用預設', '<p class="small">＊＝本工具預設值。級距是 15～20 坪一樓店面的粗估：低 1.5～3.5 萬、中 3～6 萬、中高 5～10 萬、高 8～20 萬／月。</p>' + ov + '<div class="stack"><button class="btn sm alt" data-act="resetRent">全部恢復預設</button></div>') +
    sec('weights', '評分權重', c.weights ? '已自訂' : '依店型預設', '<p class="small">在「🗺 找區域」的「⚖ 進階：調整評分權重」拖拉調整。</p>' + (c.weights ? '<div class="stack"><button class="btn sm alt" data-act="resetW">恢復預設權重</button></div>' : '')) +
    sec('view', '顯示', document.documentElement.dataset.fsize === 'xl' ? '大字' : '標準字', '<div class="stack"><button class="btn sm' + (document.documentElement.dataset.fsize === 'xl' ? ' alt' : '') + '" data-fontsize="m">標準字</button><button class="btn sm' + (document.documentElement.dataset.fsize === 'xl' ? '' : ' alt') + '" data-fontsize="xl">大字</button></div>') +
    sec('data', '資料備份', S.sites.length + ' 間店面・' + S.sessions.length + ' 筆人流', '<p class="small">資料只存在這台裝置。換電腦或手機前先下載備份檔，再到新裝置還原。</p><div class="stack"><button class="btn sm" data-act="backup">下載備份檔</button><button class="btn sm alt" data-act="restore">從備份檔還原</button><button class="btn sm red" data-act="wipe">清除全部資料</button></div><input type="file" id="restoreFile" accept=".json,application/json" hidden>') +
    sec('demo', '看範例', demo ? '範例模式中' : '', '<p class="small">用虛構的店家看看成果，你自己的資料不受影響。</p><div class="stack">' + D.EXAMPLES.map(function(e){ return '<button class="btn sm alt" data-demo="' + e.key + '">' + esc(e.label) + '</button>'; }).join('') + (demo ? '<button class="btn sm" data-act="leaveDemo">離開範例</button>' : '') + '</div>') +
    sec('about', '關於本工具', '', '<p>👤 創作者 Mark Tsai（蔡豐全）<br><a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a></p><div class="stack"><a class="btn sm alt" href="manual.html">📖 操作手冊</a><button class="btn sm alt" data-act="warn">⚠ 使用警語</button>' +
      (standalone ? '' : '<button class="btn sm alt" data-act="install">📲 加入主畫面</button>') + '</div><p class="small" style="margin-top:.5rem">訪客數 <img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.shopsiteselector" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle"></p>' +
      '<p class="small">資料來源：內政部戶政司人口統計、財政部財政資訊中心綜稅所得統計、內政部國土測繪中心鄉鎮市區界線（經 taiwan-atlas 整理）、© OpenStreetMap contributors 車站位置（ODbL）。</p>') +
    '<div class="stack"><button class="btn" data-act="close">關閉</button></div>';
  openModal(h);
  var open = lsJson('fold', []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; d.addEventListener('toggle', saveFold); });
  $('restoreFile').addEventListener('change', restoreFile);
}
function saveFold(){ var o = []; document.querySelectorAll('.set-sec').forEach(function(d){ if(d.open) o.push(d.dataset.sec); }); lsSet('fold', JSON.stringify(o)); }
function applyView(){ document.documentElement.dataset.fsize = lsGet('fs') === 'xl' ? 'xl' : 'm'; }
function restoreFile(e){
  var f = e.target.files[0]; if(!f) return;
  var rd = new FileReader();
  rd.onload = function(){ try{ var d = JSON.parse(rd.result); if(d.app !== 'shop-site-selector') throw 0; if(demo) leaveDemo(); S = cleanState(d.state); save(); closeModal(); render(); toast('已還原'); }catch(er){ toast('這不是開店選址評估的備份檔'); } };
  rd.readAsText(f);
}
function installHelp(){
  if(window._dp){ window._dp.prompt(); window._dp = null; return; }
  openModal('<h2>📲 加入主畫面</h2><ul><li><b>iPhone／iPad</b>：用 Safari 開，按下方「分享」→「加入主畫面」。</li><li><b>Android</b>：用 Chrome 開，按右上「⋮」→「加到主畫面」或「安裝應用程式」。</li><li><b>電腦</b>：Chrome／Edge 網址列右邊的「安裝」圖示。</li></ul><p class="small">裝好後沒網路也能打開（第一次要有網路）。</p><div class="stack"><button class="btn" data-act="close">知道了</button></div>');
}

/* ---------- 範例 ---------- */
function enterDemo(key){
  var ex = D.EXAMPLES.filter(function(e){ return e.key === key; })[0]; if(!ex) return;
  if(!demo) saved = S;
  var sites = ex.sites.map(function(s){ return cleanSite(Object.assign({}, s)); });
  var sessions = ex.sessions.map(function(x){ return {site:sites[x.site].id, day:x.day, slot:x.slot, min:x.min, n:x.n, at:today()}; });
  S = cleanState({ctx:ex.ctx, sites:sites, sessions:sessions});
  S.sites = sites; S.sessions = sessions;
  S.sel = sites[0].district; if(sites[0].checks) sites[0].checks = {zone:1, term:1, count:1, comp:1, power:1};
  demo = true; V.demoKey = key; V.radar = null; V.cnt = null; V.chkSite = null; closeModal(); render(); window.scrollTo(0, 0); toast('範例：' + ex.label);
}
function leaveDemo(){ demo = false; S = saved || load(); saved = null; V.radar = null; V.cnt = null; V.chkSite = null; closeModal(); render(); toast('已回到你自己的資料'); }

/* ---------- 事件 ---------- */
function setSel(id){ S.sel = id; save(); render(); if(innerWidth < 900){ var d = $('detail'); if(d) d.scrollIntoView({behavior:'smooth', block:'start'}); } }
function addSite(district){
  if(S.sites.length >= MAXSITES){ toast('最多 ' + MAXSITES + ' 間'); return; }
  var s = cleanSite({name:'店面 ' + String.fromCharCode(65 + S.sites.length), district:district || S.sel || ''});
  S.sites.push(s); V.radar = null; save(); V.tab = 'sites'; lsSet('tab', 'sites'); render(); window.scrollTo(0, 0); toast('已新增「' + s.name + '」');
}
var ACT = {
  close:closeModal, warn:showWarn, settings:openSettings, install:installHelp, leaveDemo:leaveDemo,
  print:doPrint, pdf:downloadPdf,
  csv:function(){ download('開店選址評估-' + today() + '.csv', csvText(), 'text/csv;charset=utf-8'); },
  share:function(){ copyText(shareUrl(), '分享連結已複製（含條件與店面，不含人流紀錄與勾選）'); },
  toggleAll:function(){ V.showAll = !V.showAll; render(); },
  resetW:function(){ S.ctx.weights = null; save(); closeModal(); render(); },
  resetRent:function(){ S.ctx.rentOverride = {}; save(); closeModal(); render(); toast('已恢復預設租金級距'); },
  saveName:function(){ S.ctx.name = ($('setName').value || '').slice(0, 30); save(); closeModal(); render(); },
  addSite:function(){ addSite(''); },
  addSiteHere:function(el){ addSite(el.dataset.d); },
  delSite:function(el){
    var id = el.dataset.sid, s = S.sites.filter(function(x){ return x.id === id; })[0]; if(!s) return;
    if(V.delPending !== id){ V.delPending = id; el.textContent = '再按一次確認刪除'; el.classList.add('red'); setTimeout(function(){ if(V.delPending === id){ V.delPending = null; if(el.isConnected){ el.textContent = '刪除'; el.classList.remove('red'); } } }, 3000); return; }
    V.delPending = null; S.sites = S.sites.filter(function(x){ return x.id !== id; }); S.sessions = S.sessions.filter(function(x){ return x.site !== id; }); save(); render(); toast('已刪除「' + s.name + '」');
  },
  useCount:function(el){ var s = siteBy(el.dataset.sid); if(!s) return; s.traffic = trafficOf(s).avg; save(); render(); },
  goCount:function(el){ V.cnt = null; V.tab = 'count'; lsSet('tab', 'count'); render(); V.cnt.site = el.dataset.sid; render(); window.scrollTo(0, 0); },
  toChecklist:function(el){ var s = siteBy(el.dataset.sid); if(!s) return; window.open(checklistUrl(s), '_blank', 'noopener'); toast('已開啟開店前置清單（登記型態、員工數請在那邊再調整）'); },
  tap:function(){ tap(1); }, tapMinus:function(){ tap(-1); },
  tapPause:function(){ var c = V.cnt; if(c.run){ c.el += Date.now() - c.start; c.run = false; stopClock(); } else if(elapsed() < c.target * 60000){ c.run = true; c.start = Date.now(); startClock(); } render(); },
  tapReset:function(){ var c = V.cnt; c.n = 0; c.el = 0; c.run = false; stopClock(); render(); },
  tapSave:function(){
    var c = V.cnt, min = Math.round(elapsed() / 6000) / 10;
    if(min < .5){ toast('至少數 30 秒再存'); return; }
    if(c.run){ c.el += Date.now() - c.start; c.run = false; stopClock(); }
    S.sessions.push({site:c.site, day:c.day, slot:c.slot, min:min, n:c.n, at:today()});
    var s = siteBy(c.site); if(s){ s.traffic = trafficOf(s).avg; }
    save(); toast('已存：' + min + ' 分鐘 ' + c.n + ' 人，約每小時 ' + fmtN(c.n * 60 / min) + ' 人'); c.n = 0; c.el = 0; render();
  },
  delSes:function(el){ var i = +el.dataset.i; if(S.sessions[i]){ var site = S.sessions[i].site; S.sessions.splice(i, 1); var s = siteBy(site), ft = trafficOf(s); if(s && ft.n) s.traffic = ft.avg; save(); render(); } },
  backup:function(){ download('開店選址評估備份-' + today() + '.json', JSON.stringify({app:'shop-site-selector', v:1, at:new Date().toISOString(), state:S}, null, 1), 'application/json'); },
  restore:function(){ $('restoreFile').click(); },
  wipe:function(el){
    if(!V.wipePending){ V.wipePending = true; el.textContent = '再按一次確認清除'; setTimeout(function(){ V.wipePending = false; }, 3000); return; }
    V.wipePending = false; ['state', 'tab', 'fold', 'tblOpen', 'advOpen'].forEach(lsDel); if(demo){ demo = false; saved = null; } S = load(); V.radar = null; V.cnt = null; closeModal(); render(); toast('已清除');
  },
  foldall:function(){ var all = document.querySelectorAll('.set-sec'), any = Array.prototype.some.call(all, function(d){ return !d.open; }); all.forEach(function(d){ d.open = any; }); saveFold(); },
  useShared:function(){ if(V.pendingShare){ applyShare(V.pendingShare); } closeModal(); }
};
function siteBy(id){ return S.sites.filter(function(x){ return x.id === id; })[0]; }
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-act],[data-tab],[data-type],[data-target],[data-city],[data-flag],[data-layer],[data-demo],[data-fontsize],[data-sort],[data-radar],[data-cnt-site],[data-cnt-day],[data-cnt-slot],[data-cnt-min],[data-chk-site],.rrow[data-d],#map [data-d],.dot[data-d],tr[data-d]');
  if(!t){ if(e.target === $('modal')) closeModal(); return; }
  var ds = t.dataset, c = S.ctx;
  if(ds.act){ if(t.tagName === 'A') e.preventDefault(); if(ACT[ds.act]) ACT[ds.act](t); return; }
  if(ds.tab){ V.tab = ds.tab; lsSet('tab', ds.tab); render(); return; }
  if(ds.type){ c.type = ds.type; c.weights = null; save(); render(); return; }
  if(ds.target){ var i = c.targets.indexOf(ds.target); if(i >= 0) c.targets.splice(i, 1); else c.targets.push(ds.target); save(); render(); return; }
  if(ds.city){ var j = c.cities.indexOf(ds.city); if(j >= 0) c.cities.splice(j, 1); else c.cities.push(ds.city); save(); render(); return; }
  if(ds.flag){ c[ds.flag] = !c[ds.flag]; save(); render(); return; }
  if(ds.layer){ S.layer = ds.layer; save(); render(); return; }
  if(ds.demo){ enterDemo(ds.demo); return; }
  if(ds.fontsize){ lsSet('fs', ds.fontsize); applyView(); closeModal(); openSettings(); return; }
  if(ds.sort){ if(V.sortK === ds.sort) V.sortDir = -V.sortDir; else { V.sortK = ds.sort; V.sortDir = ds.sort === 'rank' || ds.sort === 'name' ? 1 : -1; } render(); return; }
  if(ds.radar){ var k = V.radar.indexOf(ds.radar); if(k >= 0) V.radar.splice(k, 1); else { if(V.radar.length >= 3){ toast('一次最多疊 3 間'); return; } V.radar.push(ds.radar); } refreshSites(); return; }
  if(ds.cntSite){ V.cnt.site = ds.cntSite; render(); return; }
  if(ds.cntDay){ V.cnt.day = ds.cntDay; render(); return; }
  if(ds.cntSlot){ V.cnt.slot = ds.cntSlot; render(); return; }
  if(ds.cntMin){ V.cnt.target = +ds.cntMin; render(); return; }
  if(ds.chkSite){ V.chkSite = ds.chkSite; render(); return; }
  if(ds.d){ setSel(ds.d); return; }
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !$('modal').hidden) closeModal();
  if((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('rrow')){ e.preventDefault(); setSel(e.target.dataset.d); }
  if(V.tab === 'count' && e.key === ' ' && $('modal').hidden && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)){ e.preventDefault(); tap(1); }
});
var wTimer = null;
document.addEventListener('input', function(e){
  var t = e.target, ds = t.dataset;
  if(ds.ctx === 'budget'){ var v = +t.value; S.ctx.budget = isFinite(v) && v > 0 ? Math.min(v, 999) : 0; save(); clearTimeout(wTimer); wTimer = setTimeout(function(){ var p = t.selectionStart; render(); var b = $('budget'); if(b){ b.focus(); try{ b.setSelectionRange(p, p); }catch(er){} } }, 450); return; }
  if(ds.w){
    if(!S.ctx.weights) S.ctx.weights = Object.assign({}, D.WEIGHTS[S.ctx.type]);
    S.ctx.weights[ds.w] = +t.value; var o = $('wv_' + ds.w); if(o) o.textContent = t.value; save();
    clearTimeout(wTimer); wTimer = setTimeout(function(){ var y = scrollY; render(); scrollTo(0, y); var r = document.querySelector('[data-w="' + ds.w + '"]'); if(r) r.focus(); }, 250); return;
  }
  if(ds.sk && ds.sid){
    var s = siteBy(ds.sid); if(!s) return;
    if(ds.sk === 'name'){ s.name = t.value.slice(0, 30); }
    else if(ds.sk === 'district' || ds.sk === 'floor' || ds.sk === 'cond'){ s[ds.sk] = t.value; }
    else if(ds.sk === 'park' || ds.sk === 'vis'){ s[ds.sk] = +t.value; }
    else { var n = +t.value, lim = NUMF[ds.sk]; if(t.value === '' || !isFinite(n)) delete s[ds.sk]; else s[ds.sk] = Math.max(lim[0], Math.min(lim[1], n)); }
    save(); clearTimeout(wTimer); wTimer = setTimeout(refreshSites, 200);
  }
});
document.addEventListener('change', function(e){
  var t = e.target, ds = t.dataset;
  if(ds.chk){ var s = siteBy(V.chkSite); if(!s) return; if(t.checked) s.checks[ds.chk] = 1; else delete s.checks[ds.chk]; save(); render(); return; }
  if(ds.rentov){ var v = +t.value, d = D.byId(ds.rentov); if(v === d.rent) delete S.ctx.rentOverride[d.id]; else S.ctx.rentOverride[d.id] = v; save(); render(); return; }
});
document.addEventListener('toggle', function(e){
  if(e.target.id === 'advW'){ if(e.target.open) lsSet('advOpen', '1'); else lsDel('advOpen'); }
  if(e.target.id === 'tblD'){ if(e.target.open) lsSet('tblOpen', '1'); else lsDel('tblOpen'); }
}, true);
/* 滑過提示 */
document.addEventListener('pointermove', function(e){
  var t = e.target;
  if(t.closest && t.closest('#map [data-d]')){ var id = t.closest('[data-d]').dataset.d, d = D.byId(id), r = rankOf(id), key = S.layer;
    var v = key === 'score' ? (r ? r.total : null) : layerVals(key, [])[id];
    showTip(e, '<b>' + esc(id) + '</b><br>' + D.LAYERS[key].n + '：' + fmtLayer(key, v) + (key !== 'score' && r ? '<br>適合度：' + r.total + ' 分（第 ' + r.rank + ' 名）' : !r ? '<br>不在目前範圍' : '') + '<br>人口 ' + fmtN(d.pop)); return; }
  if(t.dataset && t.dataset.seg !== undefined){ var row = t.closest('.rrow'), rr = rankOf(row.dataset.d), x = D.COMPS[+t.dataset.seg], sw = 0; D.COMPS.forEach(function(c){ sw += rr.w[c.k]; });
    showTip(e, '<b>' + esc(rr.d.name) + '・' + x.n + '</b><br>得分 ' + Math.round(rr.s[x.k]) + ' × 權重 ' + Math.round(rr.w[x.k] / sw * 100) + '%<br>＝ ' + rr.parts[x.k].toFixed(1) + ' 分<br><span style="opacity:.8">' + x.s + '</span>'); return; }
  if(t.dataset && t.dataset.sseg !== undefined){ var s = siteBy(t.dataset.sid), sc = D.scoreSite(s, S.ctx), y = D.SITE_COMPS[+t.dataset.sseg];
    showTip(e, '<b>' + esc(s.name) + '・' + y.n + '</b><br>得分 ' + Math.round(sc.s[y.k]) + ' × 權重 ' + sc.w[y.k] + '%<br>＝ ' + sc.parts[y.k].toFixed(1) + ' 分'); return; }
  if(t.classList && t.classList.contains('dot')){ var dd = D.byId(t.dataset.d), r2 = rankOf(t.dataset.d); showTip(e, '<b>' + esc(dd.id) + '</b><br>人口密度 ' + fmtN(dd.dens) + ' 人／km²<br>所得中位數 ' + dd.inc + ' 千元<br>人口 ' + fmtN(dd.pop) + (r2 ? '<br>適合度 ' + r2.total + '（第 ' + r2.rank + ' 名）' : '')); return; }
  if(t.dataset && (t.dataset.tipv || t.dataset.rtip)){ showTip(e, esc(t.dataset.tipv || t.dataset.rtip)); return; }
  hideTip();
}, {passive:true});
document.addEventListener('pointerleave', hideTip);
window.addEventListener('scroll', hideTip, {passive:true});

/* ---------- 分享連結 ---------- */
function applyShare(o){
  S.ctx = cleanCtx(o.ctx);
  if(Array.isArray(o.sites)){ S.sites = o.sites.slice(0, MAXSITES).map(cleanSite); S.sessions = []; }
  V.radar = null; save(); render(); toast('已套用分享連結');
}
function readHash(){
  var m = /#s=([\w-]+)/.exec(location.hash); if(!m) return;
  var o; try{ o = JSON.parse(b64d(m[1])); }catch(e){ o = null; }
  history.replaceState(null, '', location.pathname + location.search);
  if(!o || typeof o !== 'object'){ toast('分享連結格式不正確'); return; }
  if(!S.sites.length && !lsGet('state')){ applyShare(o); return; }
  V.pendingShare = o;
  setTimeout(function(){ openModal('<h2>🔗 要套用連結裡的選址條件嗎？</h2><p>' + esc(D.TYPES[cleanCtx(o.ctx).type].n) + (Array.isArray(o.sites) ? '・' + Math.min(o.sites.length, MAXSITES) + ' 間候選店面' : '') + '</p><p class="small">你目前已經有自己的資料。套用後<b>條件與候選店面會被取代</b>（人流紀錄也會清空），建議先到 ⚙ 下載備份。</p><div class="stack"><button class="btn" data-act="useShared">套用</button><button class="btn alt" data-act="close">不要，維持我的資料</button></div>'); }, 0);
}

/* ---------- 跑馬燈（工作區共用公告，不可關） ---------- */
function initMarquee(){
  var URL_ = 'https://script.google.com/macros/s/AKfycbwKX0DNNbY8y4nf90BFTHtxgfqJcHHcZasRrgycl4QAe52_hkjMWSkYk4xOsqU-JPCROw/exec';
  var REFRESH = 20 * 60 * 1000, bar = $('marqueeBar'), track = $('marqueeTrack'), lastKey = null;
  function appendText(c, text){ var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, li = 0, m; while((m = re.exec(text))){ if(m.index > li) c.appendChild(document.createTextNode(text.slice(li, m.index))); var a = document.createElement('a'); a.href = m[2]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit'; a.style.textDecoration = 'underline'; c.appendChild(a); li = re.lastIndex; } if(li < text.length) c.appendChild(document.createTextNode(text.slice(li))); }
  function renderM(items){
    if(!items || !items.length) return;
    var k = JSON.stringify(items); if(k === lastKey) return; lastKey = k; track.innerHTML = '';
    var fr = document.createDocumentFragment();
    function pass(){ items.forEach(function(it, i){ if(i > 0) fr.appendChild(document.createTextNode('　★　')); appendText(fr, String(it)); }); }
    pass(); fr.appendChild(document.createTextNode('　★　')); pass(); track.appendChild(fr);
    bar.classList.add('show'); document.body.classList.add('has-marquee');
    track.style.animationDuration = Math.max(track.scrollWidth / 2 / 60, 12) + 's';
  }
  function fetchM(){ fetch(URL_, {method:'POST', body:JSON.stringify({serial:''})}).then(function(r){ return r.json(); }).then(function(d){ if(d && Array.isArray(d.marquee) && d.marquee.length){ lsSet('marquee', JSON.stringify(d.marquee)); renderM(d.marquee); } }).catch(function(){}); }
  renderM(lsJson('marquee', [])); fetchM(); setInterval(fetchM, REFRESH);
}

window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); window._dp = e; });
if('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('service-worker.js').catch(function(){});
(function(){ if(!window.SSS_WATERMARK) return; var w = document.createElement('div'); w.id = 'pdfWatermark'; w.setAttribute('aria-hidden', 'true'); w.innerHTML = '<img alt="" src="' + window.SSS_WATERMARK + '">'; document.body.appendChild(w); })();
window.addEventListener('resize', function(){ if(V.tab === 'area') fitMap(); });
applyView(); readHash(); render(); initMarquee();
window.addEventListener('hashchange', function(){ if(/#s=/.test(location.hash)){ readHash(); } });
if(!lsGet('warnSeen')){ lsSet('warnSeen', '1'); showWarn(); }
window._sss = {render:render, reportEl:reportEl, downloadPdf:downloadPdf, csvText:csvText, shareUrl:shareUrl, checklistUrl:checklistUrl, enterDemo:enterDemo, leaveDemo:leaveDemo, addSite:addSite,
  get S(){ return S; }, get V(){ return V; }};
})();
