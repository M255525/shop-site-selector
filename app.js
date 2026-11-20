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
var MAXSITES = 5, VER = '20261120c';

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
  o.village = o.district && typeof s.village === 'string' && /^\w{8,12}$/.test(s.village) ? s.village : '';
  o.stat = o.district && typeof s.stat === 'string' && /^[A-Z]\d{4}-\d{4}-\d{2}$/.test(s.stat) ? s.stat : '';
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
  var o = {ctx:cleanCtx(d.ctx), sel:D.byId(d.sel) ? d.sel : '', layer:D.LAYERS[d.layer] ? d.layer : 'score', sites:[], sessions:[],
    vdist:D.byId(d.vdist) ? d.vdist : '', vlayer:D.VLAYERS[d.vlayer] ? d.vlayer : 'score', vsel:typeof d.vsel === 'string' && /^\w{8,12}$/.test(d.vsel) ? d.vsel : '', vscope:d.vscope === 'range' ? 'range' : 'dist', vlevel:d.vlevel === 'stat' ? 'stat' : 'village',
    cmp:Array.isArray(d.cmp) ? d.cmp.filter(function(x, i, a){ return D.byId(x) && a.indexOf(x) === i; }).slice(0, 3) : []};
  if(Array.isArray(d.sites)) o.sites = d.sites.slice(0, MAXSITES).map(cleanSite);
  var ids = o.sites.map(function(s){ return s.id; });
  if(Array.isArray(d.sessions)) o.sessions = d.sessions.map(function(x){ return cleanSession(x, ids); }).filter(Boolean).slice(-300);
  return o;
}
function load(){ return cleanState(lsJson('state', null)); }
var S = load(), saved = null, demo = false;
var V = {tab:lsGet('tab') || 'area', radar:null, chkSite:null, cnt:null, sortK:'rank', sortDir:1, showAll:false, demoKey:'', vsortK:'rank', vsortDir:1, vAll:false};
if(['area', 'vill', 'sites', 'count', 'check'].indexOf(V.tab) < 0) V.tab = 'area';
function save(){ if(demo) return; lsSet('state', JSON.stringify(S)); }

/* ---------- 共用 ---------- */
function toast(msg, act, fn){
  var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  if(act){ var b = document.createElement('button'); b.textContent = act; b.className = 'tbtn'; b.onclick = function(){ t.remove(); fn(); }; t.appendChild(b); }
  document.body.appendChild(t); setTimeout(function(){ t.remove(); }, act ? 6000 : 2600);
}
function ai(kind, arg){ if(window.SSS_AI) window.SSS_AI.run(kind, arg); else toast('AI 模組載入中，請稍後再試'); }
/* 一句話設定：規則式或 AI 解析的結果都走這裡（只接受白名單欄位） */
function applyParsed(r, how){
  var o = r && r.ctx || {}, c = S.ctx, n = 0;
  if(D.TYPES[o.type]){ c.type = o.type; c.weights = null; n++; }
  if(Array.isArray(o.targets) && o.targets.length){ c.targets = o.targets.filter(function(t){ return D.TARGETS[t]; }); n++; }
  if(Array.isArray(o.cities) && o.cities.length){ c.cities = o.cities.filter(function(t){ return D.CITIES.indexOf(t) >= 0; }); n++; }
  if(+o.budget > 0 && +o.budget < 999){ c.budget = Math.round(+o.budget * 10) / 10; n++; }
  ['transit', 'parking', 'night'].forEach(function(k){ if(o[k] === true){ c[k] = true; n++; } });
  if(o.focus && D.byId(o.focus)){ S.sel = o.focus; S.vdist = o.focus; n++; }
  if(!n){ toast('看不出店型、客群或地點，換個說法試試，或用下面的按鈕設定'); return; }
  save(); render(); toast('已套用（' + how + '）：' + (r.found && r.found.length ? r.found.join('；') : ctxLine(c)));
}
/* 行政區比較（最多 3 區，顏色跟著區走） */
function openCompare(){
  var rs = S.cmp.map(function(id){ return rankOf(id) || D.scoreDistrict(D.byId(id), S.ctx); });
  if(!rs.length) return;
  var N = D.COMPS.length, cx = 190, cy = 160, RR = 115, g = '';
  for(var lv = 1; lv <= 4; lv++){ var pts = []; for(var a = 0; a < N; a++){ var an = -Math.PI / 2 + a * 2 * Math.PI / N; pts.push((cx + Math.cos(an) * RR * lv / 4).toFixed(1) + ',' + (cy + Math.sin(an) * RR * lv / 4).toFixed(1)); } g += '<polygon points="' + pts.join(' ') + '" fill="none" class="gl"></polygon>'; }
  D.COMPS.forEach(function(x, a){ var an = -Math.PI / 2 + a * 2 * Math.PI / N; g += '<line class="ax" x1="' + cx + '" y1="' + cy + '" x2="' + (cx + Math.cos(an) * RR).toFixed(1) + '" y2="' + (cy + Math.sin(an) * RR).toFixed(1) + '"></line><text x="' + (cx + Math.cos(an) * (RR + 18)).toFixed(1) + '" y="' + (cy + Math.sin(an) * (RR + 18) + 4).toFixed(1) + '" text-anchor="middle" style="font-weight:700">' + x.n + '</text>'; });
  rs.forEach(function(r, i){ var pts = D.COMPS.map(function(x, a){ var an = -Math.PI / 2 + a * 2 * Math.PI / N, v = r.s[x.k] / 100 * RR; return (cx + Math.cos(an) * v).toFixed(1) + ',' + (cy + Math.sin(an) * v).toFixed(1); });
    g += '<polygon points="' + pts.join(' ') + '" style="fill:' + SC[i] + ';fill-opacity:.12;stroke:' + SC[i] + ';stroke-width:2"></polygon>' + pts.map(function(p, a){ var xy = p.split(','); return '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="4" style="fill:' + SC[i] + ';stroke:var(--paper);stroke-width:2" data-tipv="' + esc(r.d.name + '・' + D.COMPS[a].n + '：' + Math.round(r.s[D.COMPS[a].k])) + '"></circle>'; }).join(''); });
  var rowsT = [['適合度', function(r){ return '<b>' + r.total + '</b>'; }], ['排名', function(r){ return r.rank ? '第 ' + r.rank + ' 名' : '—'; }], ['人口', function(r){ return fmtN(r.d.pop); }], ['人口密度', function(r){ return fmtN(r.d.dens); }], ['所得中位數（千元）', function(r){ return r.d.inc; }],
    ['15–44 歲', function(r){ return ((D.share(r.d, 1) + D.share(r.d, 2)) * 100).toFixed(1) + '%'; }], ['65 歲以上', function(r){ return (D.share(r.d, 4) * 100).toFixed(1) + '%'; }], ['軌道車站', function(r){ return r.d.metro.length + r.d.rail.length + r.d.hsr.length; }], ['租金級距（自估）', function(r){ return D.RENT_TIERS[r.tier].n; }]]
    .concat(D.COMPS.map(function(x){ return [x.n, function(r){ return Math.round(r.s[x.k]); }]; }));
  openModal('<h2>📊 行政區比較</h2><div class="lgd">' + rs.map(function(r, i){ return '<span><i class="sw" style="background:' + SC[i] + '"></i>' + esc(r.d.city + r.d.name) + '</span>'; }).join('') + '</div>' +
    '<svg class="svgchart" viewBox="0 0 380 320" style="max-width:420px;margin:0 auto" role="img" aria-label="行政區七項評分雷達">' + g + '</svg>' +
    '<div class="tblw"><table class="t" style="min-width:0"><thead><tr><th>項目</th>' + rs.map(function(r, i){ return '<th><i class="sw" style="background:' + SC[i] + '"></i> ' + esc(r.d.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    rowsT.map(function(rw){ var vals = rs.map(function(r){ return rw[1](r); }); return '<tr style="cursor:default"><td class="tx">' + rw[0] + '</td>' + vals.map(function(v){ return '<td>' + v + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
    '<div class="stack"><button class="btn alt" data-act="aiCompare">🤖 AI 比較這幾區</button><button class="btn" data-act="close">關閉</button></div>');
}
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
var TABS = [['area', '01', '🗺 找區域'], ['vill', '02', '🏘 街區'], ['sites', '03', '🏪 比店面'], ['count', '04', '👣 人流計數'], ['check', '05', '✅ 看店清單']];
function renderChrome(){
  $('tbName').textContent = S.ctx.name || '我的店';
  $('tbType').textContent = D.TYPES[S.ctx.type].n;
  $('tbCity').textContent = S.ctx.cities.length ? S.ctx.cities.map(cityShort).join('・') : '四縣市';
  $('tbDate').textContent = today();
  var nChk = 0; S.sites.forEach(function(x){ nChk += Object.keys(x.checks).length; });
  var done = {area:!!S.sel, vill:!!S.vsel, sites:S.sites.length > 0, count:S.sessions.length > 0, check:nChk > 0};
  $('tabs').innerHTML = TABS.map(function(t){ return '<button class="tab' + (V.tab === t[0] ? ' on' : '') + (done[t[0]] ? ' done' : '') + '" role="tab" aria-selected="' + (V.tab === t[0]) + '" data-tab="' + t[0] + '"><span class="no">' + (done[t[0]] ? '✓' : t[1]) + '</span>' + t[2] + (t[0] === 'sites' && S.sites.length ? ' (' + S.sites.length + ')' : '') + '</button>'; }).join('');
  var tray = $('cmpTray');
  if(tray){ tray.hidden = !S.cmp.length || V.tab !== 'area'; tray.innerHTML = S.cmp.length ? '<span class="small"><b>比較</b></span>' + S.cmp.map(function(id, i){ return '<span class="cchip"><i class="sw" style="background:' + SC[i] + '"></i>' + esc(id.slice(3)) + '<button data-act="cmpToggle" data-d="' + id + '" aria-label="移除' + esc(id) + '">✕</button></span>'; }).join('') + '<button class="btn sm" data-act="cmpOpen">📊 比較 ' + S.cmp.length + ' 區</button><button class="btn sm alt" data-act="cmpClear">清除</button>' : ''; }
  $('exStrip').className = 'exstrip' + (demo ? ' on' : '');
  $('exStrip').innerHTML = (demo ? '<b>範例模式</b>：資料不會存下來。' : '<span>看範例：</span>') +
    '<div class="exlist">' + D.EXAMPLES.map(function(e){ return '<button data-demo="' + e.key + '" class="' + (V.demoKey === e.key && demo ? 'cur' : '') + '" title="' + esc(e.label) + '">' + (e.ic ? e.ic + ' ' : '') + esc(e.short || e.label) + '</button>'; }).join('') + '</div>' +
    (demo ? '<button data-act="leaveDemo">離開範例</button>' : '');
  $('foot').innerHTML = '人口：內政部戶政司（民國 ' + D.DIST.meta.popYm.slice(0, 3) + ' 年 ' + (+D.DIST.meta.popYm.slice(3)) + ' 月）・所得：財政部財政資訊中心 ' + D.DIST.meta.incYear + ' 年度綜稅所得・鄉鎮與村里界線：內政部國土測繪中心・車站與店家位置：© OpenStreetMap contributors<br>' +
    '👤 創作者 Mark Tsai（蔡豐全）・<a href="manual.html">📖 操作手冊</a>・<a href="#" data-act="warn">⚠ 使用警語</a>' + (standalone ? '' : '・<a href="#" data-act="install">📲 加入主畫面</a>') +
    '<br><img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.shopsiteselector" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle;margin-top:.4rem">';
}
function render(){
  renderChrome();
  var m = $('main');
  if(V.tab === 'area') m.innerHTML = areaHtml();
  else if(V.tab === 'vill') m.innerHTML = villHtml();
  else if(V.tab === 'sites'){ m.innerHTML = sitesHtml(); needVillages(S.sites.map(function(x){ return x.district; })); }
  else if(V.tab === 'count') m.innerHTML = countHtml();
  else m.innerHTML = checkHtml();
  if(V.tab === 'area') fitMap();
  if(window.SSS_UI) window.SSS_UI.after();
}
/* 拖滑桿時重畫：保留捲動位置與焦點 */
function softRender(){
  var y = window.scrollY, a = document.activeElement, w = a && a.dataset && a.dataset.w, id = a && a.id;
  render(); window.scrollTo(0, y);
  var f = w ? document.querySelector('[data-w="' + w + '"]') : id ? $(id) : null; if(f) f.focus({preventScroll:true});
}
/* 每個分頁最下面的「下一步」 */
function nextCta(tab){
  var t = {
    area:[S.sel ? '看「' + S.sel.slice(3) + '」裡面哪個街區最好' : '先點地圖或排名選一區', 'vill', '🏘 看街區 →'],
    vill:['把看中的街區按「📍 新增候選店面」，再到現場看店', 'sites', '🏪 去比店面 →'],
    sites:['到候選店面門口數 15 分鐘人流，分數會更準', 'count', '👣 去數人流 →'],
    count:['簽約前把看店清單逐項確認', 'check', '✅ 看店清單 →'],
    check:['都確認好了，下載報告或接著排開店手續', '', '']
  }[tab];
  return '<div class="nextcta"><span>下一步：' + esc(t[0]) + '</span>' + (t[1] ? '<button class="btn" data-tab="' + t[1] + '">' + t[2] + '</button>' : '<button class="btn" data-act="pdf">⬇ 下載 PDF 報告</button>' + (S.sites[0] ? '<button class="btn alt" data-act="toChecklist" data-sid="' + S.sites[0].id + '">➜ 帶到開店前置清單</button>' : '')) + '</div>';
}
/* ---------- 村里資料：每縣市一檔，用到才載入 ---------- */
var VLOAD = {};
function vData(city){ return window.SSS_VILL && window.SSS_VILL[city]; }
function loadCity(city){
  if(vData(city)) return Promise.resolve();
  if(VLOAD[city]) return VLOAD[city];
  VLOAD[city] = new Promise(function(ok, no){
    var sc = document.createElement('script'); sc.src = 'villages/' + D.CITY_SLUG[city] + '.js?v=' + VER;
    sc.onload = ok; sc.onerror = function(){ delete VLOAD[city]; sc.remove(); no(); }; document.head.appendChild(sc);
  });
  return VLOAD[city];
}
var needBusy = {};
function needVillages(dists){
  var cs = {}; dists.forEach(function(d){ if(d) cs[d.slice(0, 3)] = 1; });
  var miss = Object.keys(cs).filter(function(c){ return !vData(c) && !needBusy[c]; });
  if(!miss.length) return;
  miss.forEach(function(c){ needBusy[c] = 1; });
  Promise.all(miss.map(loadCity)).then(function(){ miss.forEach(function(c){ delete needBusy[c]; }); render(); },
    function(){ miss.forEach(function(c){ delete needBusy[c]; }); toast('村里資料載入失敗，請確認網路後重試'); });
}
function villOf(code, dist){ var vd = dist && vData(dist.slice(0, 3)); if(!vd || !code) return null; for(var i = 0; i < vd.list.length; i++) if(vd.list[i].id === code) return vd.list[i]; return null; }

/* ========== 01 找區域 ========== */
function chip(attr, val, on, label){ return '<button class="chip' + (on ? ' on' : '') + '" ' + attr + '="' + esc(val) + '" aria-pressed="' + !!on + '">' + label + '</button>'; }
function ctxLine(c){ return D.TYPES[c.type].ic + ' ' + D.TYPES[c.type].n + '・' + (c.targets.length ? c.targets.map(function(t){ return D.TARGETS[t].n; }).join('、') : '未指定客群') + '・' + (c.cities.length ? c.cities.map(cityShort).join('、') : '四縣市') + (c.budget ? '・月租 ' + c.budget + ' 萬內' : '') + (c.transit ? '・近車站' : '') + (c.parking ? '・開車騎車' : '') + (c.night ? '・晚上營業' : ''); }
function condHtml(){
  var c = S.ctx, w = D.weightsFor(Object.assign({}, c, {transit:false, night:false})), fold = lsGet('condFold') === '1';
  var head = '<div class="condhead"><h2 class="ctitle" style="margin:0"><span class="dwg">A-00</span>開店條件</h2>' +
    '<div class="nl"><input type="text" id="nlText" maxlength="200" placeholder="用一句話說，例如：台北大安區開手搖飲，客人是學生，月租 12 萬內，要靠近捷運" aria-label="用一句話描述你的店"><button class="btn sm" data-act="nlParse">套用</button><button class="btn sm alt" data-act="aiParse" title="用你的 AI 金鑰理解比較長或口語的描述">🤖 AI 理解</button></div>' +
    '<button class="btn sm alt" data-act="condFold" aria-expanded="' + !fold + '">' + (fold ? '▾ 展開條件' : '▴ 收起') + '</button></div>';
  if(fold) return '<div class="card condcard">' + head + '<p class="small" style="margin:6px 0 0">目前：' + esc(ctxLine(c)) + '</p></div>';
  return '<div class="card condcard">' + head + '<div class="cond" style="margin:10px 0 0">' +
    '<div class="fld"><span class="lab">店型</span><div class="chips">' + Object.keys(D.TYPES).map(function(k){ return chip('data-type', k, c.type === k, D.TYPES[k].ic + ' ' + D.TYPES[k].n); }).join('') + '</div></div>' +
    '<div class="fld"><span class="lab">主要客群（可複選）</span><div class="chips">' + Object.keys(D.TARGETS).map(function(k){ return chip('data-target', k, c.targets.indexOf(k) >= 0, D.TARGETS[k].ic + ' ' + D.TARGETS[k].n); }).join('') + '</div></div>' +
    '<div class="fld"><span class="lab">範圍（不選＝四縣市全部）</span><div class="chips">' + D.CITIES.map(function(k){ return chip('data-city', k, c.cities.indexOf(k) >= 0, k); }).join('') + '</div></div>' +
    '<div class="fld"><label for="budget">店面月租預算 <b class="mono" id="budgetV">' + (c.budget ? c.budget + ' 萬' : '不限') + '</b></label><div class="inrow" style="gap:10px"><input type="range" id="budgetR" data-ctx="budgetR" min="0" max="30" step="0.5" value="' + (c.budget || 0) + '" style="flex:1;max-width:none;accent-color:var(--ink)" aria-label="月租預算滑桿"><input type="number" id="budget" data-ctx="budget" min="0" step="0.5" value="' + (c.budget || '') + '" placeholder="萬" style="max-width:80px"></div>' +
      '<div class="chips" style="margin-top:6px">' + chip('data-flag', 'transit', c.transit, '🚇 要靠近捷運／車站') + chip('data-flag', 'parking', c.parking, '🅿 客人開車騎車') + chip('data-flag', 'night', c.night, '🌙 晚上營業') + '</div></div>' +
    '<details class="adv"' + (lsGet('advOpen') ? ' open' : '') + ' id="advW"><summary>⚖ 進階：調整評分權重' + (c.weights ? '（已自訂）' : '（目前是「' + D.TYPES[c.type].n + '」的預設）') + '・拖拉時地圖即時變色</summary>' +
      '<div class="wts">' + D.COMPS.map(function(x, i){ return '<label class="wt"><i class="sw" style="background:' + SC[i] + '"></i><span>' + x.n + '</span><input type="range" min="0" max="50" step="5" value="' + w[x.k] + '" data-w="' + x.k + '" aria-label="' + x.n + '權重"><b class="mono" id="wv_' + x.k + '">' + w[x.k] + '</b></label>'; }).join('') + '</div>' +
      '<p class="small">數字是相對比重，系統會自動換算成百分比。' + (c.weights ? '<button class="btn sm alt" data-act="resetW">恢復預設權重</button>' : '') + '</p></details>' +
  '</div></div>';
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
  var key = S.layer, vals = layerVals(key, rows), br = layerBreaks(key, vals), inSet = {}, bf = V.binF && V.binF.map === 'map' + key ? V.binF.b : -1;
  rows.forEach(function(r){ inSet[r.id] = 1; });
  var top = rows.slice(0, 10), paths = '', pins = '';
  Object.keys(MAP.towns).forEach(function(id){
    var t = MAP.towns[id], v = vals[id], out = !inSet[id];
    var bin = key === 'rent' ? v - 1 : D.binOf(v, br), fill = key === 'rent' ? Q[[0, 0, 1, 3, 4][v]] : Q[bin];
    paths += '<path class="t' + (out ? ' out' : '') + (S.sel === id ? ' sel' : '') + (bf >= 0 && bin !== bf && !out ? ' dim' : '') + '" d="' + t.d + '" data-d="' + id + '" data-b="' + bin + '" style="fill:' + fill + '"></path>';
  });
  top.forEach(function(r, i){ var c = MAP.towns[r.id].c; pins += zPin('data-d="' + r.id + '"', c[0], c[1], 1 / MAP.w, '<circle r="9" stroke-width="1.5"></circle><text font-size="10">' + (i + 1) + '</text>', 'pin'); });
  var sel = S.sel && MAP.towns[S.sel] ? zPin('', MAP.towns[S.sel].c[0], MAP.towns[S.sel].c[1], 1 / MAP.w, '<text class="lbl" y="-14" font-size="15" stroke-width="4">' + esc(S.sel.slice(3)) + '</text>', 'zl') : '';
  var lg;
  var lb = function(i, inner){ return '<button class="lg lgb' + (bf === i ? ' on' : '') + (bf >= 0 && bf !== i ? ' off' : '') + '" data-bin="' + i + '" data-binmap="map' + key + '" title="只看這一級">' + inner + '</button>'; };
  if(key === 'rent') lg = [1, 2, 3, 4].map(function(t){ return lb(t - 1, '<i class="sw" style="background:' + Q[[0, 0, 1, 3, 4][t]] + '"></i>' + D.RENT_TIERS[t].n + '（粗估 ' + D.RENT_TIERS[t].lo + '～' + D.RENT_TIERS[t].hi + ' 萬）'); }).join('');
  else{
    var arr = Object.keys(vals).map(function(k){ return vals[k]; }), mn = Math.min.apply(null, arr), mx = Math.max.apply(null, arr), edges = [mn].concat(br, [mx]);
    lg = Q.map(function(q, i){ return lb(i, '<i class="sw" style="background:' + q + '"></i>' + fmtLayer(key, edges[i]) + (i < 4 ? '～' : '～' + fmtLayer(key, edges[i + 1]))); }).join('');
  }
  return '<div class="card"><h2 class="ctitle"><span class="dwg">A-01</span>行政區地圖<span class="sub">滾輪或兩指縮放、拖曳移動・點一區看詳細・紅圖釘＝前 10 名</span></h2>' +
    '<div class="mapbar" role="group" aria-label="地圖圖層">' + Object.keys(D.LAYERS).map(function(k){ return chip('data-layer', k, key === k, D.LAYERS[k].n); }).join('') + '</div>' +
    '<div class="mapwrap" data-zoom="map"><svg id="map" viewBox="0 0 ' + MAP.w + ' ' + MAP.h + '" data-zkey="' + esc('area|' + S.ctx.cities.join(',')) + '" role="img" aria-label="四縣市行政區' + D.LAYERS[key].n + '地圖">' + paths + pins + sel + '</svg>' +
    '<div class="compass" aria-hidden="true"><b>↑</b>N</div></div>' +
    '<div class="legend"><b>' + D.LAYERS[key].n + '</b>' + lg + (bf >= 0 ? '<button class="lg lgb" data-bin="-1" data-binmap="map' + key + '">✕ 全部顯示</button>' : '<span class="lg muted">點色塊只看那一級</span>') + '<span class="lg"><i class="sw" style="background:var(--qna)"></i>不在範圍內</span></div>' +
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
  var pad = 14, home = (b[0] - pad) + ' ' + (b[1] - pad) + ' ' + (b[2] - b[0] + pad * 2) + ' ' + (b[3] - b[1] + pad * 2);
  svg.setAttribute('data-home', home); svg.setAttribute('viewBox', home);
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
/* 商圈定位散布圖：x＝人口密度、y＝所得中位數、圓大小＝人口；兩軸範圍可調（V.asc） */
function scatterHtml(rows){
  var W = 600, H = 380, ml = 52, mr = 14, mt = 14, mb = 40;
  var dsA = rows.map(function(r){ return Math.max(r.d.dens, 1); }), inA = rows.map(function(r){ return r.d.inc; });
  var ax = V.asc || {}, xlog = ax.xlog !== false;
  var autoX = xlog ? [Math.pow(10, Math.floor(Math.log10(Math.min.apply(null, dsA)))), Math.pow(10, Math.ceil(Math.log10(Math.max.apply(null, dsA)) + .02))] : [0, Math.ceil(Math.max.apply(null, dsA) / 5000) * 5000];
  var autoY = [Math.floor(Math.min.apply(null, inA) / 100) * 100, Math.ceil(Math.max.apply(null, inA) / 100) * 100];
  var x0 = isFinite(ax.xmin) ? ax.xmin : autoX[0], x1 = isFinite(ax.xmax) ? ax.xmax : autoX[1], y0 = isFinite(ax.ymin) ? ax.ymin : autoY[0], y1 = isFinite(ax.ymax) ? ax.ymax : autoY[1];
  if(xlog && x0 <= 0) x0 = 1;
  if(!(x1 > x0) && isFinite(ax.xmin) && !isFinite(ax.xmax)) x1 = xlog ? x0 * 10 : x0 * 2;   // 只設最小值且超過自動上限：上限跟著放大
  if(!(y1 > y0) && isFinite(ax.ymin) && !isFinite(ax.ymax)) y1 = y0 * 1.5;
  if(!(x1 > x0)){ x0 = autoX[0]; x1 = autoX[1]; }
  if(!(y1 > y0)){ y0 = autoY[0]; y1 = autoY[1]; }
  var custom = !!(V.asc && Object.keys(V.asc).some(function(k){ return k !== 'xlog'; }));
  var lx = xlog ? function(v){ return ml + (Math.log10(Math.max(v, 1e-9)) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) * (W - ml - mr); } : function(v){ return ml + (v - x0) / (x1 - x0) * (W - ml - mr); };
  var ly = function(v){ return mt + (1 - (v - y0) / (y1 - y0)) * (H - mt - mb); };
  var inR = function(r){ return r.d.dens >= x0 && r.d.dens <= x1 && r.d.inc >= y0 && r.d.inc <= y1; };
  var top = {}; rows.slice(0, 10).forEach(function(r){ top[r.id] = 1; });
  var dens = rows.map(function(r){ return r.d.dens; }).sort(function(a, c){ return a - c; }), inc = inA.slice().sort(function(a, c){ return a - c; });
  var md = dens[Math.floor(dens.length / 2)], mi = inc[Math.floor(inc.length / 2)];
  var g = '';
  (xlog ? logTicks(x0, x1) : linTicks(x0, x1, 6)).forEach(function(v){ g += '<line class="gl" x1="' + lx(v).toFixed(1) + '" x2="' + lx(v).toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"></line><text x="' + lx(v).toFixed(1) + '" y="' + (H - mb + 16) + '" text-anchor="middle">' + fmtTick(v) + '</text>'; });
  linTicks(y0, y1, 5).forEach(function(v){ g += '<line class="gl" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + ly(v).toFixed(1) + '" y2="' + ly(v).toFixed(1) + '"></line><text x="' + (ml - 6) + '" y="' + (ly(v) + 4).toFixed(1) + '" text-anchor="end">' + fmtTick(v) + '</text>'; });
  if(md > x0 && md < x1) g += '<line class="med" x1="' + lx(md).toFixed(1) + '" x2="' + lx(md).toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"></line>';
  if(mi > y0 && mi < y1) g += '<line class="med" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + ly(mi).toFixed(1) + '" y2="' + ly(mi).toFixed(1) + '"></line>';
  if(!custom) g += '<text class="q" x="' + (W - mr - 4) + '" y="' + (mt + 14) + '" text-anchor="end">人多・所得高</text><text class="q" x="' + (ml + 6) + '" y="' + (mt + 14) + '">人少・所得高</text>' +
    '<text class="q" x="' + (W - mr - 4) + '" y="' + (H - mb - 8) + '" text-anchor="end">人多・所得較低</text><text class="q" x="' + (ml + 6) + '" y="' + (H - mb - 8) + '">人少・所得較低</text>';
  g += '<text x="' + ((W + ml) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">人口密度（人／km²' + (xlog ? '，對數' : '') + '）→</text><text x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90 12 ' + (H / 2) + ')">所得中位數（千元）→</text>';
  var shown = rows.filter(inR), hidden = rows.length - shown.length;
  g += '<g clip-path="url(#ascClip)">';
  shown.slice().sort(function(a, c){ return (top[a.id] ? 1 : 0) - (top[c.id] ? 1 : 0) || (a.id === S.sel) - (c.id === S.sel) || c.d.pop - a.d.pop; }).forEach(function(r){
    var rr = Math.max(3 + Math.sqrt(r.d.pop) / 60, 5);
    g += '<circle class="dot ' + (top[r.id] ? 'top' : 'oth') + (S.sel === r.id ? ' sel' : '') + '" data-d="' + r.id + '" cx="' + lx(r.d.dens).toFixed(1) + '" cy="' + ly(r.d.inc).toFixed(1) + '" r="' + rr.toFixed(1) + '"></circle>';
  });
  g += shown.filter(function(r){ return top[r.id]; }).slice(0, 5).map(function(r){ return '<text x="' + lx(r.d.dens).toFixed(1) + '" y="' + (ly(r.d.inc) - 3 - Math.max(3 + Math.sqrt(r.d.pop) / 60, 5)).toFixed(1) + '" text-anchor="middle" style="font-weight:700;fill:var(--ink);paint-order:stroke;stroke:var(--paper);stroke-width:3px;pointer-events:none">' + esc(r.d.name) + '</text>'; }).join('') + '</g>';
  var num = function(k, ph){ return '<input type="number" class="vscin" data-asc="' + k + '" value="' + (isFinite(ax[k]) ? ax[k] : '') + '" placeholder="' + ph + '" min="0" step="any" aria-label="' + ph + '">'; };
  var qx = [[1000, '1 千以上'], [10000, '1 萬以上'], [20000, '2 萬以上']].map(function(q){ return '<button class="chip' + (ax.xmin === q[0] && !isFinite(ax.xmax) ? ' on' : '') + '" data-ascq="x" data-v1="' + q[0] + '">' + q[1] + '</button>'; }).join('');
  var qy = [[600, '600 以上'], [700, '700 以上']].map(function(q){ return '<button class="chip' + (ax.ymin === q[0] && !isFinite(ax.ymax) ? ' on' : '') + '" data-ascq="y" data-v1="' + q[0] + '">' + q[1] + '</button>'; }).join('');
  return '<div class="card"><h2 class="ctitle"><span class="dwg">A-03</span>商圈定位圖<span class="sub">每個圓是一區，圓越大人口越多；虛線是中位數；拖曳框選可放大</span></h2>' +
    '<div class="vscbar">' +
      '<div class="vscrow"><b>X 人口密度</b>' + num('xmin', '自動 ' + fmtTick(autoX[0])) + '<span>～</span>' + num('xmax', '自動 ' + fmtTick(autoX[1])) + '<span class="unit">人／km²</span>' + qx +
        '<button class="chip' + (xlog ? ' on' : '') + '" data-asclog="1">對數</button><button class="chip' + (!xlog ? ' on' : '') + '" data-asclog="0">線性</button></div>' +
      '<div class="vscrow"><b>Y 所得中位數</b>' + num('ymin', '自動 ' + fmtTick(autoY[0])) + '<span>～</span>' + num('ymax', '自動 ' + fmtTick(autoY[1])) + '<span class="unit">千元</span>' + qy + '</div>' +
      '<div class="vscrow"><button class="btn sm' + (custom ? '' : ' alt') + '" data-act="ascAuto"' + (custom ? '' : ' disabled') + '>⟲ 自動範圍</button><span class="small muted">' + (hidden ? '有 ' + hidden + ' 區在範圍外沒畫出來' : '全部 ' + rows.length + ' 區都在圖上') + '</span></div></div>' +
    '<div class="lgd"><span><i class="sw" style="background:var(--s1);border-radius:50%"></i>適合度前 10 名</span><span><i class="sw" style="background:var(--ref);border-radius:50%"></i>其他區</span><span><i class="sw" style="border:2px solid var(--pin);border-radius:50%"></i>目前選的區</span></div>' +
    '<div class="vscwrap"><svg class="svgchart" id="asc" viewBox="0 0 ' + W + ' ' + H + '" data-brush="' + [W, H, ml, mr, mt, mb, x0, x1, y0, y1, 0, xlog ? 1 : 0].join(',') + '" data-bkey="asc" role="img" aria-label="人口密度與所得中位數散布圖">' +
      '<defs><clipPath id="ascClip"><rect x="' + ml + '" y="' + mt + '" width="' + (W - ml - mr) + '" height="' + (H - mt - mb) + '"></rect></clipPath></defs>' + g + '<rect class="brush" x="0" y="0" width="0" height="0"></rect></svg></div>' +
    '<p class="src">所得高的區，客單價可以抓高一點；密度高的區，路過人潮多但租金通常也高。所得為 ' + D.DIST.meta.incYear + ' 年度。</p></div>';
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
    '<div class="stack"><button class="btn" data-act="goVill" data-d="' + d.id + '">🏘 看這區的街區</button><button class="btn alt" data-act="cmpToggle" data-d="' + d.id + '">' + (S.cmp.indexOf(d.id) >= 0 ? '✓ 已加入比較' : '⊕ 加入比較') + '</button><button class="btn alt" data-act="aiDist" data-d="' + d.id + '">🤖 AI 解讀</button><button class="btn alt" data-act="addSiteHere" data-d="' + d.id + '">📍 新增候選店面</button></div></div>';
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
  return condHtml() + '<div class="findbar"><label for="afind">🔎 找行政區</label><input type="search" id="afind" list="afindList" placeholder="例：板橋、竹北、中壢" autocomplete="off"><datalist id="afindList">' + D.list.map(function(d){ return '<option value="' + d.id + '">'; }).join('') + '</datalist><span class="small muted">共 ' + rows.length + ' 區・第 1 名 ' + (rows[0] ? esc(rows[0].id) + ' ' + rows[0].total + ' 分' : '') + '</span></div>' +
    '<div class="grid g-area">' + mapHtml(rows) + detailHtml(rows) + '</div>' +
    '<div class="grid g-2" style="margin-top:14px">' + rankHtml(rows) + scatterHtml(rows) + '</div>' +
    '<div style="margin-top:14px">' + tableHtml(rows) + '</div>' + nextCta('area');
}

/* ========== 02 街區（村里／最小統計區） ========== */
var M_PER_UNIT = 111320 / 973.1125913191273;   // 地圖 1 單位約多少公尺（與 tools/raw/proj.json 的 S 一致）
function isStat(){ return S.vlevel === 'stat'; }
function vDist(){ var d = S.vdist || S.sel || (R()[0] && R()[0].id); return D.byId(d) ? d : D.list[0].id; }
function sData(dist){
  var sd = window.SSS_STAT && window.SSS_STAT[dist];
  if(sd && !sd._d){ sd._d = 1; sd.list.forEach(function(x){ x.d = dist; }); }   // 檔案裡省略所屬區以縮小檔案
  return sd;
}
var SLOAD = {};
function townCode(dist){ var vd = vData(dist.slice(0, 3)); if(!vd) return ''; for(var i = 0; i < vd.list.length; i++) if(vd.list[i].d === dist && /^\d{11}$/.test(vd.list[i].id)) return vd.list[i].id.slice(0, 8); return ''; }
function loadStat(dist){
  if(sData(dist)) return Promise.resolve();
  if(SLOAD[dist]) return SLOAD[dist];
  var tc = townCode(dist); if(!tc) return Promise.reject();
  SLOAD[dist] = new Promise(function(ok, no){
    var sc = document.createElement('script'); sc.src = 'stat/' + tc + '.js?v=' + VER;
    sc.onload = ok; sc.onerror = function(){ delete SLOAD[dist]; sc.remove(); no(); }; document.head.appendChild(sc);
  });
  return SLOAD[dist];
}
/* 這一層這一區的單位清單（村里或最小統計區） */
function unitsOf(dist){
  if(isStat()){ var sd = sData(dist); return sd ? sd.list : []; }
  var vd = vData(dist.slice(0, 3)); return vd ? vd.list.filter(function(v){ return v.d === dist; }) : [];
}
function vScopeList(dist){
  if(!isStat() && S.vscope === 'range'){
    var cs = S.ctx.cities.length ? S.ctx.cities : D.CITIES, out = [];
    cs.forEach(function(c){ var vd = vData(c); if(vd) out = out.concat(vd.list); });
    return out;
  }
  return unitsOf(dist);
}
var vCache = {key:'', rows:null};
function vRanked(dist){
  var k = JSON.stringify([S.ctx, S.vscope, S.vlevel, dist, !isStat() && S.vscope === 'range' ? Object.keys(window.SSS_VILL || {}) : 0]);
  if(k !== vCache.key){ vCache.key = k; vCache.rows = D.scoreVillages(vScopeList(dist), S.ctx); }
  return vCache.rows;
}
function unitOf(id, dist){ var l = unitsOf(dist); for(var i = 0; i < l.length; i++) if(l[i].id === id) return l[i]; return null; }
function lvN(){ return isStat() ? '統計區' : '里'; }
function layerName(k){ var L = D.VLAYERS[k]; return k === 'same' ? '同類店家：' + D.POI_N[D.SAME[S.ctx.type]] + (isStat() ? '（300m 內）' : '') : isStat() && L.ns ? L.ns : L.n; }
function vLayerVal(key, v, scoreMap){
  if(v.u) return null;
  if(key === 'score') return scoreMap[v.id] !== undefined ? scoreMap[v.id] : null;
  if(key === 'same'){ var k = D.SAME[S.ctx.type]; return k ? v.poi[D.POI_K.indexOf(k)] : null; }
  if(key === 'inc') return v.inc || null;
  return D.VLAYERS[key].v(v);
}
function vFmt(key, v){
  if(v === null || v === undefined) return '—';
  if(key === 'young' || key === 'kids' || key === 'old') return v + '%';
  if(key === 'score') return v + ' 分';
  if(key === 'st') return v >= 1000 ? (v / 1000).toFixed(1) + ' km' : fmtN(v) + ' m';
  return fmtN(v);
}
var VBOX = {};
function distBox(dist){
  if(VBOX[dist]) return VBOX[dist];
  var vd = vData(dist.slice(0, 3)), b = [1e9, 1e9, -1e9, -1e9];
  vd.list.forEach(function(v){ if(v.d !== dist) return; var n = v.p.match(/-?\d+(\.\d+)?/g); if(!n) return; for(var i = 0; i + 1 < n.length; i += 2){ var x = +n[i], y = +n[i + 1]; if(x < b[0]) b[0] = x; if(y < b[1]) b[1] = y; if(x > b[2]) b[2] = x; if(y > b[3]) b[3] = y; } });
  return (VBOX[dist] = b);
}
/* 會跟著縮放保持大小的符號：data-x／data-y／data-k0（每單位視窗寬的縮放）；文字用 data-f0 */
function zPin(attr, x, y, k0, inner, cls){ return '<g class="' + cls + '" ' + attr + ' data-x="' + x + '" data-y="' + y + '" data-k0="' + k0 + '" transform="translate(' + x + ',' + y + ')">' + inner + '</g>'; }
function vMapHtml(dist, list, rows){
  var key = S.vlayer, scoreMap = {}, distRows = rows.filter(function(r){ return r.v.d === dist; });
  rows.forEach(function(r){ scoreMap[r.id] = r.total; });
  if(key === 'same' && !D.SAME[S.ctx.type]) key = 'score';
  var vals = list.map(function(v){ return vLayerVal(key, v, scoreMap); }).filter(function(x){ return x !== null && isFinite(x); });
  var rev = key === 'st', br = D.breaks(vals.map(function(x){ return rev ? -x : x; }), 5);
  var b = distBox(dist), pad = (b[2] - b[0]) * .04 + .5, vb = [b[0] - pad, b[1] - pad, b[2] - b[0] + pad * 2, b[3] - b[1] + pad * 2];
  var bf = V.binF && V.binF.map === 'vmap' + key ? V.binF.b : -1;
  var paths = list.map(function(v){
    var x = vLayerVal(key, v, scoreMap), bin = x === null || !isFinite(x) ? -1 : D.binOf(rev ? -x : x, br), fill = bin < 0 ? 'var(--qna)' : Q[bin];
    return '<path class="t' + (v.u ? ' out' : '') + (S.vsel === v.id ? ' sel' : '') + (bf >= 0 && bin !== bf ? ' dim' : '') + '" d="' + v.p + '"' + (v.u ? '' : ' data-v="' + v.id + '" data-b="' + bin + '"') + ' style="fill:' + fill + '"></path>';
  }).join('');
  var outline = '<path d="' + MAP.towns[dist].d + '" class="dout"></path>';
  var vlines = isStat() ? '<g class="vlines">' + vData(dist.slice(0, 3)).list.filter(function(v){ return v.d === dist; }).map(function(v){ return '<path d="' + v.p + '"></path>'; }).join('') + '</g>' : '';
  var vd = vData(dist.slice(0, 3)), sts = vd.stations.filter(function(s){ return s.xy[0] >= vb[0] && s.xy[0] <= vb[0] + vb[2] && s.xy[1] >= vb[1] && s.xy[1] <= vb[1] + vb[3]; });
  var stH = sts.map(function(s){
    var sh = s.k === 'metro' ? '<circle r="7"></circle>' : s.k === 'rail' ? '<rect x="-7" y="-7" width="14" height="14"></rect>' : '<path d="M0,-10L10,0L0,10L-10,0Z"></path>';
    return zPin('data-tipv="' + esc(D.ST_K[s.k] + '「' + s.n + '」站') + '"', s.xy[0], s.xy[1], .001, sh + '<text x="10" y="-7" font-size="13" stroke-width="3">' + esc(s.n) + '</text>', 'stn');
  }).join('');
  var pins = distRows.slice(0, 10).map(function(rr, i){ return zPin('data-v="' + rr.id + '"', rr.v.c[0], rr.v.c[1], .00115, '<circle r="9" stroke-width="1.5"></circle><text font-size="10">' + (i + 1) + '</text>', 'pin'); }).join('');
  var selV = S.vsel ? list.filter(function(v){ return v.id === S.vsel; })[0] : null;
  var selL = selV ? zPin('', selV.c[0], selV.c[1], .001, '<text class="lbl" y="-16" font-size="16" stroke-width="4">' + esc(selV.n) + '</text>', 'zl') : '';
  var sbm = [50, 100, 200, 500, 1000, 2000, 5000].filter(function(m){ return m / M_PER_UNIT < vb[2] / 4; }).pop() || 50;
  var lgVals = vals.slice().sort(function(a, c){ return a - c; }), lg = '';
  if(lgVals.length){
    var e = rev ? [lgVals[lgVals.length - 1]].concat(br.map(function(x){ return -x; }), [lgVals[0]]) : [lgVals[0]].concat(br, [lgVals[lgVals.length - 1]]);
    lg = Q.map(function(q, i){ return '<button class="lg lgb' + (bf === i ? ' on' : '') + (bf >= 0 && bf !== i ? ' off' : '') + '" data-bin="' + i + '" data-binmap="vmap' + key + '" title="只看這一級"><i class="sw" style="background:' + q + '"></i>' + vFmt(key, e[i]) + '～' + (i === 4 ? vFmt(key, e[5]) : '') + '</button>'; }).join('');
  }
  var sameOk = !!D.SAME[S.ctx.type];
  return '<div class="card"><h2 class="ctitle"><span class="dwg">V-01</span>' + esc(dist) + ' ' + (isStat() ? '最小統計區' : '村里') + '地圖<span class="sub">滾輪或兩指縮放、拖曳移動・點一塊看詳細・紅圖釘＝本區前 10 名</span></h2>' +
    '<div class="mapbar" role="group" aria-label="街區圖層">' + Object.keys(D.VLAYERS).filter(function(k){ return k !== 'same' || sameOk; }).map(function(k){ return chip('data-vlayer', k, key === k, layerName(k)); }).join('') + '</div>' +
    '<div class="mapwrap" data-zoom="vmap"><svg id="vmap" viewBox="' + vb.map(function(x){ return x.toFixed(2); }).join(' ') + '" data-home="' + vb.map(function(x){ return x.toFixed(2); }).join(' ') + '" data-zkey="' + esc(dist + '|' + S.vlevel) + '" role="img" aria-label="' + esc(dist) + layerName(key) + '地圖">' +
      paths + vlines + outline + stH + pins + selL + '</svg>' +
      '<div class="compass" aria-hidden="true"><b>↑</b>N</div><div class="scalebar" data-m="' + sbm + '"><i></i><span>' + (sbm >= 1000 ? sbm / 1000 + ' 公里' : sbm + ' 公尺') + '</span></div></div>' +
    '<div class="legend"><b>' + layerName(key) + '</b>' + lg + (rev ? '<span class="lg muted">（越深越近）</span>' : '') + (bf >= 0 ? '<button class="lg lgb" data-bin="-1" data-binmap="vmap' + key + '">✕ 全部顯示</button>' : '<span class="lg muted">點色塊只看那一級</span>') + '</div>' +
    '<div class="legend"><span class="lg"><svg width="14" height="14" viewBox="-7 -7 14 14"><circle r="5" class="stnk"></circle></svg>捷運／輕軌</span><span class="lg"><svg width="14" height="14" viewBox="-7 -7 14 14"><rect x="-5" y="-5" width="10" height="10" class="stnk"></rect></svg>台鐵</span><span class="lg"><svg width="14" height="14" viewBox="-7 -7 14 14"><path d="M0,-6L6,0L0,6L-6,0Z" class="stnk"></path></svg>高鐵</span>' + (isStat() ? '<span class="lg"><i class="sw" style="border:1.5px dashed var(--ink)"></i>村里界</span>' : '') + '<span class="lg"><i class="sw" style="background:var(--qna)"></i>無人口／未編定</span></div>' +
    '<p class="src">' + vSrc(key) + '</p></div>';
}
function vSrc(key){
  var m = vData(vDist().slice(0, 3)).meta, sm = isStat() && sData(vDist()) ? sData(vDist()).meta : null;
  if(key === 'biz' || key === 'same' || key === 'score') return '店家數來自 OpenStreetMap 志工登錄（' + m.osm + ' 整理）' + (sm ? '，最小統計區算的是中心點半徑 ' + sm.radius + ' 公尺內' : '') + '；<b>台北市較完整、其他縣市漏登較多</b>，所以分數只在比較範圍內排名。';
  if(key === 'inc') return '財政部財政資訊中心 ' + m.incYear + ' 年度村里綜合所得中位數（千元）' + (sm ? '；最小統計區沒有所得統計，<b>用所屬里的數字</b>' : '') + '；之後新設的里沒有資料。';
  if(key === 'st') return (sm ? '統計區' : '里') + '中心到最近車站的直線距離，實際走路通常更遠；車站位置來自 OpenStreetMap。';
  if(sm) return '內政部統計處最小統計區人口統計（' + sm.time.join('、').replace(/(\d+)Y(\d+)M/g, '民國 $1 年 $2 月') + '，比村里資料舊）；年齡為 10 歲一組。最小統計區圖：內政部統計處。';
  return '內政部戶政司村里戶籍人口（民國 ' + m.popYm.slice(0, 3) + ' 年 ' + (+m.popYm.slice(3)) + ' 月）；面積由內政部村里界（' + m.shp + ' 版）計算。戶籍人口不等於白天在街上的人。';
}
function vRankHtml(rows, dist){
  var list = !isStat() && S.vscope === 'range' ? rows : rows.filter(function(r){ return r.v.d === dist; }), n = V.vAll ? Math.min(list.length, 300) : Math.min(10, list.length);
  return '<div class="card"><h2 class="ctitle"><span class="dwg">V-02</span>' + (isStat() ? '統計區' : '街區') + '適合度排名<span class="sub">' + (!isStat() && S.vscope === 'range' ? '範圍內全部村里' : esc(dist) + ' ' + list.length + ' 個' + lvN()) + '・6 項疊成・↑↓ 鍵切換</span></h2>' +
    '<div class="lgd">' + D.VCOMPS.map(function(x, i){ return '<span><i class="sw" style="background:' + SC[i] + '"></i>' + x.n + '</span>'; }).join('') + '</div>' +
    '<div class="rank">' + list.slice(0, n).map(function(r, i){
      return '<div class="rrow' + (S.vsel === r.id ? ' sel' : '') + '" data-v="' + r.id + '" data-vd="' + r.v.d + '" tabindex="0" role="button" aria-label="第' + (i + 1) + '名 ' + r.v.n + ' ' + r.total + '分"><span class="no">' + (i + 1) + '</span><span class="nm">' + esc(r.v.n) + '<small>' + (!isStat() && S.vscope === 'range' ? esc(r.v.d) : esc(r.v.st[0]) + ' ' + vFmt('st', r.v.st[2])) + '</small></span><div class="stk">' +
        D.VCOMPS.map(function(x, ci){ var p = r.parts[x.k]; return p > .05 ? '<span data-vseg="' + ci + '" style="width:' + p + '%;background:' + SC[ci] + '"></span>' : ''; }).join('') + '</div><span class="val">' + r.total + '</span></div>';
    }).join('') + '</div>' + (list.length > 10 ? '<div class="stack"><button class="btn sm alt" data-act="vToggleAll">' + (V.vAll ? '只看前 10 名' : '看' + (list.length > 300 ? '前 300' : '全部 ' + list.length) + ' 個' + lvN()) + '</button></div>' : '') + '</div>';
}
function vCardHtml(rows, dist, list){
  var distRows = rows.filter(function(r){ return r.v.d === dist; });
  var r = S.vsel ? rows.filter(function(x){ return x.id === S.vsel; })[0] : null;
  if(!r || r.v.d !== dist) r = distRows[0];
  if(!r) return '<div class="card pinned"><div class="empty">這區沒有資料</div></div>';
  var v = r.v, st = isStat(), ex = D.explainVillage(r, S.ctx), AG = st ? D.A6_N : D.AGE_N, ages = st ? v.a6 : v.age;
  var shares = ages.map(function(x){ return x / v.pop; }), dp = 0, da = AG.map(function(){ return 0; });
  list.forEach(function(x){ if(x.u) return; dp += x.pop; (st ? x.a6 : x.age).forEach(function(a, i){ da[i] += a; }); });
  da = da.map(function(a){ return a / dp; });
  var mx = Math.max.apply(null, shares.concat(da)), tot = D.vPoi(v);
  var poiBar = tot ? '<div class="stk" style="height:16px;border-radius:4px;margin:4px 0">' + D.POI_K.map(function(k, i){ var n = v.poi[i]; return n ? '<span data-tipv="' + D.POI_N[k] + ' ' + n + ' 家" style="width:' + n / tot * 100 + '%;background:' + SC[i] + '"></span>' : ''; }).join('') + '</div><div class="lgd" style="margin:0">' + D.POI_K.map(function(k, i){ return '<span><i class="sw" style="background:' + SC[i] + '"></i>' + D.POI_N[k] + ' ' + v.poi[i] + '</span>'; }).join('') + '</div>' : '<p class="small muted">OSM 沒有登錄' + (st ? '附近' : '這個里') + '的店家（不代表真的沒有）。</p>';
  var ttl = st ? esc(v.n) + '<small>' + esc(v.d) + '・' + esc(v.vn) + '・代碼 ' + esc(v.id) + '・本區第 ' + r.rank + ' ／ ' + rows.length + '</small>' : esc(v.n) + '<small>' + esc(v.d) + '・' + (S.vscope === 'range' ? '範圍內' : '本區') + '第 ' + r.rank + ' ／ ' + rows.length + '</small>';
  return '<div class="card pinned" id="vdetail"><div class="dhead"><h3>' + ttl + '</h3><div class="score"><b>' + r.total + '</b><small>' + (st ? '統計區' : '街區') + '適合度</small></div></div>' +
    '<div class="kpis">' +
      '<div class="kpi"><b>' + fmtN(v.pop) + '</b><span>人口' + (st ? '（113 年底）' : '') + '</span></div>' +
      '<div class="kpi"><b>' + fmtN(v.dens) + '</b><span>人／km²</span></div>' +
      '<div class="kpi' + (st ? ' est' : '') + '"><b>' + (v.inc || '—') + '</b><span>' + (st ? '所屬里所得' : '所得中位數') + ' 千元</span></div>' +
      '<div class="kpi"><b>' + fmtN(v.hh) + '</b><span>戶數</span></div>' +
      '<div class="kpi"><b>' + vFmt('st', v.st[2]) + '</b><span>到' + D.ST_K[v.st[1]] + esc(v.st[0]) + '站</span></div>' +
      '<div class="kpi est"><b>' + tot + '</b><span>' + (st ? '300m 內店家' : '店家') + '（OSM）</span></div></div>' +
    '<div class="small" style="font-weight:700">評分項目（0～100，和' + (!st && S.vscope === 'range' ? '範圍內' : '同區') + '的' + lvN() + '比較）</div><div class="cbars">' + D.VCOMPS.map(function(x, i){ var q = Math.round(r.s[x.k]); return '<div class="cbar" title="' + x.s + '"><span>' + x.n + '</span><div class="tr"><i style="width:' + q + '%;background:' + SC[i] + '"></i></div><span class="v">' + q + '</span></div>'; }).join('') + '</div>' +
    '<ul class="why">' + ex.good.map(function(t){ return '<li class="g">' + esc(t) + '</li>'; }).join('') + ex.warn.map(function(t){ return '<li class="w">' + esc(t) + '</li>'; }).join('') + '</ul>' +
    '<div class="small" style="font-weight:700;margin-top:10px">店家組成（OSM 登錄' + (st ? '，半徑 300 公尺' : '') + '）</div>' + poiBar +
    '<div class="small" style="font-weight:700;margin-top:10px">年齡結構</div><div class="lgd" style="margin:2px 0 0"><span><i class="sw" style="background:var(--s1)"></i>' + esc(v.n) + '</span><span><i class="sw" style="background:var(--ref)"></i>' + esc(v.d.slice(3)) + '平均</span></div>' +
    '<div class="ages" style="grid-template-columns:repeat(' + AG.length + ',1fr)">' + shares.map(function(x, i){ return '<div class="ag"><i style="height:' + (x / mx * 100) + '%;background:var(--s1)" data-tipv="' + esc(v.n) + ' ' + AG[i] + '：' + (x * 100).toFixed(1) + '%"></i><i style="height:' + (da[i] / mx * 100) + '%;background:var(--ref)" data-tipv="' + esc(v.d.slice(3)) + '平均 ' + AG[i] + '：' + (da[i] * 100).toFixed(1) + '%"></i></div>'; }).join('') + '</div>' +
    '<div class="agel" style="grid-template-columns:repeat(' + AG.length + ',1fr)">' + AG.map(function(nm, i){ return '<span>' + nm + '<br><b class="mono">' + (shares[i] * 100).toFixed(0) + '%</b></span>'; }).join('') + '</div>' +
    '<div class="stack"><button class="btn" data-act="addSiteVill" data-d="' + v.d + '" data-v="' + (st ? v.vl : v.id) + '"' + (st ? ' data-stat="' + v.id + '"' : '') + '>📍 在這' + (st ? '塊' : '個里') + '新增候選店面</button>' +
      '<button class="btn alt" data-act="aiUnit" data-v="' + v.id + '">🤖 AI 解讀這' + (st ? '塊' : '個里') + '</button></div></div>';
}
/* 好讀的刻度：1、2、5 × 10^k */
function niceStep(range, n){ var raw = range / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function linTicks(a, b, n){ var st = niceStep(b - a, n), out = []; for(var v = Math.ceil(a / st) * st; v <= b + st * 1e-9; v += st) out.push(Math.round(v * 1e6) / 1e6); return out; }
function logTicks(a, b){
  var lo = Math.floor(Math.log10(a)), hi = Math.ceil(Math.log10(b)), out = [], dec = Math.log10(b) - Math.log10(a);
  for(var e = lo; e <= hi; e++) [1, 2, 5].forEach(function(m){ var v = m * Math.pow(10, e); if(v >= a * .999 && v <= b * 1.001 && (m === 1 || dec <= 2.2)) out.push(v); });
  return out.length >= 2 ? out : [a, b];
}
function fmtTick(v){ return v >= 10000 ? (v / 10000).toLocaleString('zh-TW') + ' 萬' : fmtN(v); }
/* 街區／統計區定位圖：x＝離車站距離、y＝人口密度、圓＝人口；兩軸範圍可調（輸入、快選、拖曳框選、自動） */
function vScatterHtml(rows, dist){
  var list = rows.filter(function(r){ return r.v.d === dist; }); if(!list.length) return '';
  var W = 600, H = 360, ml = 58, mr = 14, mt = 14, mb = 40;
  var dm = Math.max.apply(null, list.map(function(r){ return r.v.st[2]; })), dsAll = list.map(function(r){ return Math.max(r.v.dens, 1); });
  var autoX = [0, dm <= 1000 ? 1000 : dm <= 2000 ? 2000 : dm <= 3000 ? 3000 : Math.ceil(dm / 1000) * 1000];
  var autoY = [Math.pow(10, Math.floor(Math.log10(Math.min.apply(null, dsAll)))), Math.pow(10, Math.ceil(Math.log10(Math.max.apply(null, dsAll)) + .02))];
  var ax = V.vsc || {}, ylog = ax.ylog !== false;
  var x0 = isFinite(ax.xmin) ? ax.xmin : autoX[0], x1 = isFinite(ax.xmax) ? ax.xmax : autoX[1];
  var y0 = isFinite(ax.ymin) ? ax.ymin : ylog ? autoY[0] : 0, y1 = isFinite(ax.ymax) ? ax.ymax : autoY[1];
  if(!(x1 > x0)){ x0 = autoX[0]; x1 = autoX[1]; }
  if(ylog && y0 <= 0) y0 = 1;
  if(!(x1 > x0) && isFinite(ax.xmin) && !isFinite(ax.xmax)) x1 = x0 * 2;
  if(!(y1 > y0) && isFinite(ax.ymin) && !isFinite(ax.ymax)) y1 = ylog ? y0 * 10 : y0 * 2;
  if(!(y1 > y0)){ y0 = ylog ? autoY[0] : 0; y1 = autoY[1]; }
  var custom = !!(V.vsc && Object.keys(V.vsc).some(function(k){ return k !== 'ylog'; }));
  var lx = function(m){ return ml + (m - x0) / (x1 - x0) * (W - ml - mr); };
  var ly = ylog ? function(v){ return mt + (1 - (Math.log10(Math.max(v, 1e-9)) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) * (H - mt - mb); }
               : function(v){ return mt + (1 - (v - y0) / (y1 - y0)) * (H - mt - mb); };
  var inR = function(r){ return r.v.st[2] >= x0 && r.v.st[2] <= x1 && r.v.dens >= y0 && r.v.dens <= y1; };
  var top = {}; list.slice(0, 10).forEach(function(r){ top[r.id] = 1; });
  var g = '', rk = isStat() ? 40 : 14;
  linTicks(x0, x1, 6).forEach(function(m){ g += '<line class="gl" x1="' + lx(m).toFixed(1) + '" x2="' + lx(m).toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb) + '"></line><text x="' + lx(m).toFixed(1) + '" y="' + (H - mb + 16) + '" text-anchor="middle">' + fmtTick(m) + '</text>'; });
  (ylog ? logTicks(y0, y1) : linTicks(y0, y1, 5)).forEach(function(v){ g += '<line class="gl" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + ly(v).toFixed(1) + '" y2="' + ly(v).toFixed(1) + '"></line><text x="' + (ml - 6) + '" y="' + (ly(v) + 4).toFixed(1) + '" text-anchor="end">' + fmtTick(v) + '</text>'; });
  if(800 > x0 && 800 < x1) g += '<line class="med" x1="' + lx(800) + '" x2="' + lx(800) + '" y1="' + mt + '" y2="' + (H - mb) + '"></line><text class="q" x="' + (lx(800) + 4) + '" y="' + (mt + 12) + '">步行約 10 分鐘</text>';
  g += '<text x="' + ((W + ml) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">← 離車站越近　' + lvN() + '中心到最近車站（公尺）</text><text x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90 12 ' + (H / 2) + ')">人口密度（人／km²' + (ylog ? '，對數' : '') + '）→</text>';
  var shown = list.filter(inR), hidden = list.length - shown.length;
  g += '<g clip-path="url(#vscClip)">';
  shown.slice().sort(function(a, c){ return (top[a.id] ? 1 : 0) - (top[c.id] ? 1 : 0) || (a.id === S.vsel) - (c.id === S.vsel); }).forEach(function(r){
    var rr = Math.max(isStat() ? 2.5 : 4, 2 + Math.sqrt(r.v.pop) / rk);
    g += '<circle class="dot ' + (top[r.id] ? 'top' : 'oth') + (S.vsel === r.id ? ' sel' : '') + '" data-v="' + r.id + '" cx="' + lx(r.v.st[2]).toFixed(1) + '" cy="' + ly(r.v.dens).toFixed(1) + '" r="' + rr.toFixed(1) + '"></circle>';
  });
  g += shown.filter(function(r){ return top[r.id]; }).slice(0, 5).map(function(r){ return '<text x="' + lx(r.v.st[2]).toFixed(1) + '" y="' + (ly(r.v.dens) - 6).toFixed(1) + '" text-anchor="middle" style="font-weight:700;fill:var(--ink);paint-order:stroke;stroke:var(--paper);stroke-width:3px;pointer-events:none">' + esc(r.v.n) + '</text>'; }).join('') + '</g>';
  var num = function(k, v, ph){ return '<input type="number" class="vscin" data-vsc="' + k + '" value="' + (isFinite(ax[k]) ? ax[k] : '') + '" placeholder="' + ph + '" min="0" step="any" aria-label="' + ph + '">'; };
  var qx = [[500, '500m 內'], [1000, '1 公里內'], [2000, '2 公里內']].map(function(q){ return '<button class="chip' + (ax.xmax === q[0] && !ax.xmin ? ' on' : '') + '" data-vscq="x" data-v1="' + q[0] + '">' + q[1] + '</button>'; }).join('');
  var qy = (ylog ? [[1000, '1 千以上'], [10000, '1 萬以上'], [30000, '3 萬以上']] : [[10000, '1 萬以上'], [30000, '3 萬以上']]).map(function(q){ return '<button class="chip' + (ax.ymin === q[0] && !isFinite(ax.ymax) ? ' on' : '') + '" data-vscq="y" data-v1="' + q[0] + '">' + q[1] + '</button>'; }).join('');
  return '<div class="card"><h2 class="ctitle"><span class="dwg">V-03</span>' + (isStat() ? '統計區' : '街區') + '定位圖<span class="sub">左上＝離站近又人多；在圖上拖曳框選可放大</span></h2>' +
    '<div class="vscbar">' +
      '<div class="vscrow"><b>X 離車站</b>' + num('xmin', x0, '自動 ' + autoX[0]) + '<span>～</span>' + num('xmax', x1, '自動 ' + fmtTick(autoX[1])) + '<span class="unit">公尺</span>' + qx + '</div>' +
      '<div class="vscrow"><b>Y 人口密度</b>' + num('ymin', y0, '自動 ' + fmtTick(ylog ? autoY[0] : 0)) + '<span>～</span>' + num('ymax', y1, '自動 ' + fmtTick(autoY[1])) + '<span class="unit">人／km²</span>' + qy +
        '<button class="chip' + (ylog ? ' on' : '') + '" data-vsclog="1">對數</button><button class="chip' + (!ylog ? ' on' : '') + '" data-vsclog="0">線性</button></div>' +
      '<div class="vscrow"><button class="btn sm' + (custom ? '' : ' alt') + '" data-act="vscAuto"' + (custom ? '' : ' disabled') + '>⟲ 自動範圍</button><span class="small muted">' + (hidden ? '有 ' + hidden + ' 個' + lvN() + '在範圍外沒畫出來' : '全部 ' + list.length + ' 個都在圖上') + '</span></div></div>' +
    '<div class="lgd"><span><i class="sw" style="background:var(--s1);border-radius:50%"></i>本區前 10 名</span><span><i class="sw" style="background:var(--ref);border-radius:50%"></i>其他</span><span><i class="sw" style="border:2px solid var(--pin);border-radius:50%"></i>目前選的</span></div>' +
    '<div class="vscwrap"><svg class="svgchart" id="vsc" viewBox="0 0 ' + W + ' ' + H + '" data-brush="' + [W, H, ml, mr, mt, mb, x0, x1, y0, y1, ylog ? 1 : 0, 0].join(',') + '" data-bkey="vsc" role="img" aria-label="離車站距離與人口密度散布圖">' +
      '<defs><clipPath id="vscClip"><rect x="' + ml + '" y="' + mt + '" width="' + (W - ml - mr) + '" height="' + (H - mt - mb) + '"></rect></clipPath></defs>' + g + '<rect class="brush" x="0" y="0" width="0" height="0"></rect></svg></div>' +
    '<p class="src">直線距離，實際走路通常多 2～4 成。戶籍人口密度高代表住的人多，不一定代表白天逛街的人多。</p></div>';
}
/* 拖曳框選放大：把螢幕座標換回資料範圍 */
(function(){
  var st = null;
  function toData(svg, cx, cy){
    var p = svg.getAttribute('data-brush').split(',').map(Number), W = p[0], H = p[1], ml = p[2], mr = p[3], mt = p[4], mb = p[5], x0 = p[6], x1 = p[7], y0 = p[8], y1 = p[9], lg = p[10], xl = p[11];
    var r = svg.getBoundingClientRect(), sx = (cx - r.left) / r.width * W, sy = (cy - r.top) / r.height * H;
    sx = Math.min(Math.max(sx, ml), W - mr); sy = Math.min(Math.max(sy, mt), H - mb);
    var fx = (sx - ml) / (W - ml - mr), fy = 1 - (sy - mt) / (H - mt - mb);
    return {sx:sx, sy:sy, x:xl ? Math.pow(10, Math.log10(x0) + fx * (Math.log10(x1) - Math.log10(x0))) : x0 + fx * (x1 - x0), y:lg ? Math.pow(10, Math.log10(y0) + fy * (Math.log10(y1) - Math.log10(y0))) : y0 + fy * (y1 - y0)};
  }
  document.addEventListener('pointerdown', function(e){
    var svg = e.target.closest && e.target.closest('svg[data-brush]'); if(!svg || e.button !== 0) return;
    st = {svg:svg, a:toData(svg, e.clientX, e.clientY), cx:e.clientX, cy:e.clientY, moved:false};
  });
  document.addEventListener('pointermove', function(e){
    if(!st) return;
    if(!st.moved && Math.hypot(e.clientX - st.cx, e.clientY - st.cy) < 6) return;
    st.moved = true; e.preventDefault();
    var b = toData(st.svg, e.clientX, e.clientY), r = st.svg.querySelector('.brush');
    r.setAttribute('x', Math.min(st.a.sx, b.sx)); r.setAttribute('y', Math.min(st.a.sy, b.sy)); r.setAttribute('width', Math.abs(b.sx - st.a.sx)); r.setAttribute('height', Math.abs(b.sy - st.a.sy));
  });
  document.addEventListener('pointerup', function(e){
    if(!st) return; var s = st; st = null;
    if(!s.moved) return;
    var b = toData(s.svg, e.clientX, e.clientY);
    if(Math.abs(b.sx - s.a.sx) < 8 || Math.abs(b.sy - s.a.sy) < 8){ s.svg.querySelector('.brush').setAttribute('width', 0); return; }
    var r2 = function(v){ return v >= 100 ? Math.round(v) : Math.round(v * 10) / 10; };
    var key = s.svg.getAttribute('data-bkey') || 'vsc';
    V[key] = Object.assign({}, V[key] || {}, {xmin:Math.max(0, r2(Math.min(s.a.x, b.x))), xmax:r2(Math.max(s.a.x, b.x)), ymin:r2(Math.min(s.a.y, b.y)), ymax:r2(Math.max(s.a.y, b.y))});
    V.brushAt = Date.now(); softRender(); toast('已放大到框選範圍，按「⟲ 自動範圍」恢復');
  });
  // 框選完那一下不要當成點選圓點
  document.addEventListener('click', function(e){ if(V.brushAt && Date.now() - V.brushAt < 400){ V.brushAt = 0; e.stopPropagation(); e.preventDefault(); } }, true);
})();
function vTableHtml(rows, dist){
  var list = rows.filter(function(r){ return (!isStat() && S.vscope === 'range') || r.v.d === dist; }), same = D.SAME[S.ctx.type], st = isStat();
  var cols = [['rank', '名次'], ['name', lvN()], ['total', '適合度'], ['pop', '人口'], ['dens', '密度'], ['inc', st ? '所屬里所得' : '所得中位數'], ['st', '離車站 m'], ['biz', st ? '300m 店家' : '店家(OSM)']].concat(same ? [['same', D.POI_N[same] + (st ? '(300m)' : '(OSM)')]] : []).concat([['old', st ? '60+%' : '65+%']]);
  var get = function(r, k){ var v = r.v; return k === 'rank' ? r.rank : k === 'name' ? v.d + v.n : k === 'total' ? r.total : k === 'st' ? v.st[2] : k === 'biz' ? D.vPoi(v) : k === 'same' ? v.poi[D.POI_K.indexOf(same)] : k === 'old' ? D.tShare(v, 'senior') : k === 'inc' ? (v.inc || 0) : v[k]; };
  list = list.slice().sort(function(a, b){ var x = get(a, V.vsortK), y = get(b, V.vsortK); return (x < y ? -1 : x > y ? 1 : 0) * V.vsortDir; });
  var shown = list.slice(0, 500);
  return '<details class="card" id="vtblD"' + (lsGet('vtblOpen') ? ' open' : '') + '><summary class="ctitle" style="cursor:pointer;margin:0"><span class="dwg">V-04</span>' + (st ? '統計區' : '村里') + '數據表<span class="sub">' + list.length + ' 個' + lvN() + (list.length > 500 ? '（顯示前 500 列，可排序）' : '') + '・點欄位排序</span></summary><div class="tblw" style="margin-top:10px;max-height:460px"><table class="t"><thead><tr>' +
    cols.map(function(c){ return '<th data-vsort="' + c[0] + '">' + c[1] + (V.vsortK === c[0] ? (V.vsortDir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
    shown.map(function(r){ var v = r.v; return '<tr data-v="' + r.id + '" data-vd="' + v.d + '" class="' + (S.vsel === r.id ? 'sel' : '') + '"><td>' + r.rank + '</td><td class="tx">' + (!st && S.vscope === 'range' ? esc(v.d.slice(3)) : '') + esc(v.n) + '</td><td>' + r.total + '</td><td>' + fmtN(v.pop) + '</td><td>' + fmtN(v.dens) + '</td><td>' + (v.inc || '—') + '</td><td>' + fmtN(v.st[2]) + '</td><td>' + D.vPoi(v) + '</td>' + (same ? '<td>' + v.poi[D.POI_K.indexOf(same)] + '</td>' : '') + '<td>' + (D.tShare(v, 'senior') * 100).toFixed(1) + '</td></tr>'; }).join('') +
    '</tbody></table></div></details>';
}
function villHtml(){
  var dist = vDist(), city = dist.slice(0, 3), c = S.ctx, st = isStat();
  var opts = D.CITIES.map(function(cy){ return '<optgroup label="' + cy + '">' + D.list.filter(function(d){ return d.city === cy; }).map(function(d){ var r = rankOf(d.id); return '<option value="' + d.id + '"' + (d.id === dist ? ' selected' : '') + '>' + d.name + (r ? '（區排名 ' + r.rank + '）' : '') + '</option>'; }).join('') + '</optgroup>'; }).join('');
  var head = '<div class="cond" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">' +
    '<div class="fld"><label for="vdist">行政區</label><select id="vdist" data-vdist="1">' + opts + '</select></div>' +
    '<div class="fld"><span class="lab">細到哪一層</span><div class="chips">' + chip('data-vlevel', 'village', !st, '🏘 村里（約 2,300 個）') + chip('data-vlevel', 'stat', st, '🔬 最小統計區（約 4.9 萬塊）') + '</div></div>' +
    (st ? '<div class="fld"><span class="lab">排名範圍</span><div class="small">最小統計區只和同一區比較</div></div>' : '<div class="fld"><span class="lab">排名範圍</span><div class="chips">' + chip('data-vscope', 'dist', S.vscope !== 'range', '只比這一區') + chip('data-vscope', 'range', S.vscope === 'range', '範圍內全部村里') + '</div></div>') +
    '<div class="fld"><label for="vfind">找' + lvN() + '</label><input type="search" id="vfind" list="vfindList" placeholder="輸入里名，例：' + (st ? '錦華里' : '大學里') + '" autocomplete="off"><datalist id="vfindList"></datalist></div>' +
    '<div class="fld"><span class="lab">條件（在「🗺 找區域」修改）</span><div class="small">' + D.TYPES[c.type].ic + ' ' + D.TYPES[c.type].n + '・' + (c.targets.length ? c.targets.map(function(t){ return D.TARGETS[t].n; }).join('、') : '未指定客群') + (c.transit ? '・要靠近車站' : '') + (c.parking ? '・開車騎車' : '') + (c.night ? '・晚上營業' : '') + '</div></div></div>';
  var need = !st && S.vscope === 'range' ? (c.cities.length ? c.cities : D.CITIES) : [city];
  var miss = need.filter(function(cy){ return !vData(cy); });
  if(miss.length){
    if(miss.some(function(cy){ return !needBusy[cy]; })) setTimeout(function(){ needVillages(miss.map(function(cy){ return cy + 'x'; })); }, 0);
    return head + '<div class="empty"><span class="spin"></span>正在載入' + miss.join('、') + '的村里資料…（第一次需要網路，之後離線也能看）</div>';
  }
  if(st && !sData(dist)){
    if(!SLOAD[dist]) loadStat(dist).then(render, function(){ toast('最小統計區資料載入失敗，請確認網路後重試'); });
    return head + '<div class="empty"><span class="spin"></span>正在載入' + esc(dist) + '的最小統計區資料…（每區約 70～830 KB）</div>';
  }
  var list = unitsOf(dist), rows = vRanked(dist);
  setTimeout(function(){ var dl = $('vfindList'); if(dl) dl.innerHTML = rows.filter(function(r){ return r.v.d === dist; }).slice(0, 2000).map(function(r){ return '<option value="' + esc(r.v.n) + '">'; }).join(''); }, 0);
  return head + (c.type === 'online' ? '<p class="small" style="margin:0 0 10px">📦 網路商店主要看倉儲租金與物流，街區分數只參考交通與住宅比例。</p>' : '') +
    (st ? '<p class="small" style="margin:0 0 10px">🔬 最小統計區是內政部統計處劃的統計單位，大約一個街廓、幾十到幾百人。人口是<b>113 年 12 月</b>資料（比村里舊），所得用所屬里的數字，店家算中心點半徑 300 公尺內。</p>' : '') +
    '<div class="grid g-area">' + vMapHtml(dist, list, rows) + vCardHtml(rows, dist, list) + '</div>' +
    '<div class="grid g-2" style="margin-top:14px">' + vRankHtml(rows, dist) + vScatterHtml(rows, dist) + '</div>' +
    '<div style="margin-top:14px">' + vTableHtml(rows, dist) + '</div>' + nextCta('vill');
}

/* ========== 03 比店面 ========== */
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
      villSel(s) +
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
    '<div class="stack"><button class="btn sm alt" data-act="aiPhoto" data-sid="' + s.id + '">📷 拍店面給 AI 看</button><button class="btn sm alt" data-act="toChecklist" data-sid="' + s.id + '">➜ 帶到開店前置清單</button><button class="btn sm alt" data-act="delSite" data-sid="' + s.id + '">🗑 刪除</button></div></div>';
}
function villSel(s){
  if(!s.district) return '';
  var vd = vData(s.district.slice(0, 3));
  if(!vd) return '<div class="fld w2"><label>所在里</label><span class="small muted">載入村里資料中…</span></div>';
  var o = '<option value="">（不指定）</option>' + vd.list.filter(function(v){ return v.d === s.district && !v.u; }).map(function(v){ return '<option value="' + v.id + '"' + (s.village === v.id ? ' selected' : '') + '>' + esc(v.n) + '</option>'; }).join('');
  var su = s.stat && sData(s.district) ? unitOf(s.stat, s.district) || (sData(s.district).list.filter(function(x){ return x.id === s.stat; })[0]) : null;
  return '<div class="fld w2"><label>所在里' + (s.stat ? '・最小統計區 ' + esc(su ? su.n : s.stat) : '') + '</label><select data-sk="village" data-sid="' + s.id + '">' + o + '</select></div>';
}
function villScore(s){
  var v = villOf(s.village, s.district); if(!v) return null;
  var r = D.scoreVillages(vData(s.district.slice(0, 3)).list.filter(function(x){ return x.d === s.district; }), S.ctx).filter(function(x){ return x.id === v.id; })[0];
  return r || null;
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
    ['所在里', function(s){ var v = villOf(s.village, s.district); return v ? esc(v.n) : '—'; }], ['最小統計區', function(s){ return s.stat ? esc(s.stat) : '—'; }], ['街區適合度（同區比較）', function(s){ var r = villScore(s); return r ? r.total + '（第 ' + r.rank + ' 名）' : '—'; }],
    ['里中心離車站', function(s){ var v = villOf(s.village, s.district); return v ? esc(v.st[0]) + ' ' + vFmt('st', v.st[2]) : '—'; }],
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
    '<div id="cmp">' + compareHtml() + '</div>' +
    (ss.length ? '<div class="stack" style="margin-top:12px"><button class="btn alt" data-act="aiSites">🤖 AI 比較這幾間＋議價建議</button></div>' : '') + nextCta('sites');
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
      (ft.n ? '<p class="small">存檔時會自動把平均人流填進這間店面的「門前人流」。</p>' : '') + '</div></div>' + nextCta('count');
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
    '<div class="card pinned"><h2 class="ctitle"><span class="dwg">D-02</span>各店面完成度</h2>' + prog +
      '<div class="stack"><button class="btn alt" data-act="aiCheck">🤖 AI 幫我列看店時要問的問題</button></div></div></div>' + nextCta('check');
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
  var vdist = S.vdist || S.sel, vd = vdist && vData(vdist.slice(0, 3));
  if(vd){
    rows.push([]); rows.push(['街區名次', '行政區', '里', '街區適合度'].concat(D.VCOMPS.map(function(c){ return c.n; }), ['人口', '戶數', '人口密度', '所得中位數(千元)', '65歲以上%', '最近車站', '距離(m)', '500m內車站數'], D.POI_K.map(function(k){ return D.POI_N[k] + '(OSM)'; })));
    D.scoreVillages(vd.list.filter(function(v){ return v.d === vdist; }), S.ctx).forEach(function(r){ var v = r.v; rows.push([r.rank, v.d, v.n, r.total].concat(D.VCOMPS.map(function(c){ return Math.round(r.s[c.k]); }), [v.pop, v.hh, v.dens, v.inc || '', (D.vShare(v, 4) * 100).toFixed(1), v.st[0], v.st[2], v.s5], v.poi)); });
  }
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
    '<p class="warn">評分為規則式參考，不保證營業成績。村里店家數來自 OpenStreetMap 志工登錄、不完整。人口為內政部戶政司民國 ' + D.DIST.meta.popYm.slice(0, 3) + ' 年 ' + (+D.DIST.meta.popYm.slice(3)) + ' 月統計、所得為財政部 ' + D.DIST.meta.incYear + ' 年度資料；租金級距與區域性質為自行整理的粗估；車站依 OpenStreetMap 站點判斷。</p>' +
    '<h2>行政區適合度前 10 名</h2><div class="kp">' + mapSvgStatic(rows) + '</div>' +
    '<table class="kp"><thead><tr><th>名次</th><th class="l">行政區</th><th>適合度</th><th>人口</th><th>密度</th><th>所得中位數</th><th>65+%</th><th>車站</th><th class="l">租金級距</th></tr></thead><tbody>' +
    top.map(function(r){ var d = r.d; return '<tr><td>' + r.rank + '</td><td class="l">' + d.city + d.name + '</td><td>' + r.total + '</td><td>' + fmtN(d.pop) + '</td><td>' + fmtN(d.dens) + '</td><td>' + d.inc + '</td><td>' + (D.share(d, 4) * 100).toFixed(1) + '</td><td>' + (d.metro.length + d.rail.length + d.hsr.length) + '</td><td class="l">' + D.RENT_TIERS[r.tier].n + '</td></tr>'; }).join('') + '</tbody></table>' +
    top.slice(0, 3).map(function(r){ var e = D.explain(r, c); return '<div class="kp"><p style="margin:8px 0 0"><b>' + r.rank + '. ' + r.d.city + r.d.name + '（' + r.total + ' 分）</b></p><ul>' + e.good.map(function(t){ return '<li>✔ ' + esc(t) + '</li>'; }).join('') + e.warn.map(function(t){ return '<li>⚠ ' + esc(t) + '</li>'; }).join('') + '</ul></div>'; }).join('');
  var vdist = S.vdist || S.sel, vd = vdist && vData(vdist.slice(0, 3));
  if(vd){
    var vrows = D.scoreVillages(vd.list.filter(function(v){ return v.d === vdist; }), c);
    h += '<h2>街區（村里）：' + esc(vdist) + ' 前 10 名</h2><table class="kp"><thead><tr><th>名次</th><th class="l">里</th><th>街區適合度</th><th>人口</th><th>密度</th><th>所得中位數</th><th class="l">最近車站</th><th>距離(m)</th><th>店家(OSM)</th></tr></thead><tbody>' +
      vrows.slice(0, 10).map(function(r){ var v = r.v; return '<tr><td>' + r.rank + '</td><td class="l">' + esc(v.n) + '</td><td>' + r.total + '</td><td>' + fmtN(v.pop) + '</td><td>' + fmtN(v.dens) + '</td><td>' + (v.inc || '—') + '</td><td class="l">' + esc(v.st[0]) + '</td><td>' + fmtN(v.st[2]) + '</td><td>' + D.vPoi(v) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="meta">村里分數只和同區的里比較；店家數來自 OpenStreetMap 志工登錄，台北市以外漏登較多；距離為里中心到車站的直線距離。</p>';
  }
  if(S.sites.length){
    var scs = S.sites.map(function(s){ return D.scoreSite(s, c); }), total = 0; D.CHECK.forEach(function(g){ total += g.items.length; });
    h += '<h2>候選店面比較</h2><table class="kp"><thead><tr><th class="l">項目</th>' + S.sites.map(function(s){ return '<th>' + esc(s.name) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      [['所在區', function(s){ return esc(s.district || '—'); }], ['所在里', function(s){ var v = villOf(s.village, s.district); return v ? esc(v.n) : '—'; }], ['月租（萬）', function(s){ return s.rent === undefined ? '—' : s.rent; }], ['坪數', function(s){ return s.ping === undefined ? '—' : s.ping; }], ['人流（人／時）', function(s){ return s.traffic === undefined ? '—' : fmtN(s.traffic); }],
       ['預估月營業額（萬）', function(s, sc){ return sc.revenue || '—'; }], ['租金占比', function(s, sc){ return sc.ratio === null ? '—' : sc.ratio + '%'; }]]
      .concat(D.SITE_COMPS.map(function(x){ return [x.n, function(s, sc){ return Math.round(sc.s[x.k]); }]; }), [['總分', function(s, sc){ return '<b>' + sc.total + '</b>'; }], ['看店清單', function(s){ return Object.keys(s.checks).length + '/' + total; }]])
      .map(function(rw){ return '<tr><td class="l">' + rw[0] + '</td>' + S.sites.map(function(s, i){ return '<td>' + rw[1](s, scs[i]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' +
      S.sites.map(function(s, i){ return scs[i].notes.length ? '<div class="kp"><p style="margin:8px 0 0"><b>' + esc(s.name) + ' 要注意</b></p><ul>' + scs[i].notes.map(function(n){ return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : ''; }).join('');
  }
  h += '<p class="meta" style="margin-top:14px">開店選址評估・m255525.github.io/shop-site-selector・創作者 Mark Tsai（蔡豐全）</p></div>';
  var w = document.createElement('div'); w.innerHTML = h; return w;
}
function fillPrint(){ var p = $('printArea'); p.innerHTML = ''; p.appendChild(reportEl()); }
function doPrint(){ fillPrint(); V.printing = true; setTimeout(function(){ window.print(); V.printing = false; }, 60); }
window.addEventListener('beforeprint', function(){ if(!V.printing) fillPrint(); });
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
  '<li>「🏘 街區」的店家數來自 OpenStreetMap 志工登錄，<b>不完整</b>（台北市以外漏登較多），只在比較範圍內排名；離車站距離是里中心的直線距離，實際走路更遠。</li>' +
  '<li>店面能不能開這種店（使用分區、建物用途、消防、室內裝修）請以縣市政府與承辦機關認定為準，簽約前一定要確認。</li>' +
  '<li>「🔬 最小統計區」的人口是內政部統計處<b>113 年 12 月</b>資料（比村里舊），沒有所得統計，消費力用所屬里的數字；店家是中心點半徑 300 公尺內的 OSM 登錄數。</li>' +
  '<li>「🤖 AI」要自備金鑰，金鑰只存在這台裝置。按 AI 按鈕時，畫面上的統計數字與你填的店面資料（看店面功能則是照片）會送到你選的 AI 服務商；AI 回答可能出錯，只能當參考，分數仍以本工具規則為準。</li>' +
  '<li>你填的條件、店面與人流紀錄<b>只存在這台裝置的瀏覽器</b>，不會上傳；清除瀏覽器資料就會不見，重要資料請用「⚙ 常用設定 → 資料備份」。</li>' +
  '<li>範例店家與店面全部是虛構的。</li></ul>';
function showWarn(){ openModal(WARN_HTML + '<div class="stack"><button class="btn" data-act="close">我知道了</button></div>'); }
function sec(id, title, val, body){ return '<details class="set-sec" data-sec="' + id + '"><summary><span class="sst">' + title + '</span><span class="ssv">' + esc(val) + '</span></summary><div class="set-body">' + body + '</div></details>'; }
function openSettings(open1){
  var c = S.ctx, nOv = Object.keys(c.rentOverride).length;
  var ov = D.CITIES.map(function(city){ return '<p class="small" style="margin:8px 0 4px"><b>' + city + '</b></p><div class="rentov">' + D.list.filter(function(d){ return d.city === city; }).map(function(d){ var cur = c.rentOverride[d.id] || d.rent; return '<label>' + d.name + '<select data-rentov="' + d.id + '">' + [1, 2, 3, 4].map(function(t){ return '<option value="' + t + '"' + (cur === t ? ' selected' : '') + '>' + D.RENT_TIERS[t].n + (t === d.rent ? '＊' : '') + '</option>'; }).join('') + '</select></label>'; }).join('') + '</div>'; }).join('');
  var h = '<div class="inrow" style="justify-content:space-between"><h2 style="margin:0">⚙ 常用設定</h2><button class="btn sm alt" data-act="foldall">全部展開／收合</button></div>' +
    sec('name', '店名（印在報告上）', c.name || '未填', '<input type="text" id="setName" maxlength="30" value="' + esc(c.name) + '" placeholder="例 晨光巷早午餐"><div class="stack"><button class="btn sm" data-act="saveName">儲存</button></div>') +
    sec('rent', '租金級距（自估，可逐區修改）', nOv ? '已改 ' + nOv + ' 區' : '用預設', '<p class="small">＊＝本工具預設值。級距是 15～20 坪一樓店面的粗估：低 1.5～3.5 萬、中 3～6 萬、中高 5～10 萬、高 8～20 萬／月。</p>' + ov + '<div class="stack"><button class="btn sm alt" data-act="resetRent">全部恢復預設</button></div>') +
    sec('weights', '評分權重', c.weights ? '已自訂' : '依店型預設', '<p class="small">在「🗺 找區域」的「⚖ 進階：調整評分權重」拖拉調整。</p>' + (c.weights ? '<div class="stack"><button class="btn sm alt" data-act="resetW">恢復預設權重</button></div>' : '')) +
    sec('view', '顯示', document.documentElement.dataset.fsize === 'xl' ? '大字' : '標準字', '<div class="stack"><button class="btn sm' + (document.documentElement.dataset.fsize === 'xl' ? ' alt' : '') + '" data-fontsize="m">標準字</button><button class="btn sm' + (document.documentElement.dataset.fsize === 'xl' ? '' : ' alt') + '" data-fontsize="xl">大字</button></div>') +
    sec('data', '資料備份', S.sites.length + ' 間店面・' + S.sessions.length + ' 筆人流', '<p class="small">資料只存在這台裝置。換電腦或手機前先下載備份檔，再到新裝置還原。</p><div class="stack"><button class="btn sm" data-act="backup">下載備份檔</button><button class="btn sm alt" data-act="restore">從備份檔還原</button><button class="btn sm red" data-act="wipe">清除全部資料</button></div><input type="file" id="restoreFile" accept=".json,application/json" hidden>') +
    (window.SSS_AI ? sec('ai', '🤖 AI 設定（自備金鑰）', window.SSS_AI.status(), window.SSS_AI.settingsBody()) : '') +
    sec('demo', '看範例', demo ? '範例模式中' : '', '<p class="small">用虛構的店家看看成果，你自己的資料不受影響。</p><div class="stack">' + D.EXAMPLES.map(function(e){ return '<button class="btn sm alt" data-demo="' + e.key + '">' + esc(e.label) + '</button>'; }).join('') + (demo ? '<button class="btn sm" data-act="leaveDemo">離開範例</button>' : '') + '</div>') +
    sec('about', '關於本工具', '', '<p>👤 創作者 Mark Tsai（蔡豐全）<br><a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a></p><div class="stack"><a class="btn sm alt" href="manual.html">📖 操作手冊</a><button class="btn sm alt" data-act="warn">⚠ 使用警語</button>' +
      (standalone ? '' : '<button class="btn sm alt" data-act="install">📲 加入主畫面</button>') + '</div><p class="small" style="margin-top:.5rem">訪客數 <img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.shopsiteselector" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle"></p>' +
      '<p class="small">資料來源：內政部戶政司人口統計、財政部財政資訊中心綜稅所得統計、內政部國土測繪中心鄉鎮市區界線（經 taiwan-atlas 整理）與村里界圖、© OpenStreetMap contributors 車站與店家位置（ODbL）。</p>') +
    '<div class="stack"><button class="btn" data-act="close">關閉</button></div>';
  openModal(h);
  var open = lsJson('fold', []); if(typeof open1 === 'string') open = open.concat([open1]);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; d.addEventListener('toggle', saveFold); });
  $('restoreFile').addEventListener('change', restoreFile);
  if(window.SSS_AI) window.SSS_AI.bindSettings();
  if(typeof open1 === 'string'){ var sc = document.querySelector('.set-sec[data-sec="' + open1 + '"]'); if(sc) sc.scrollIntoView({block:'start'}); }
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
function setVSel(code, dist){
  S.vsel = code; if(dist && D.byId(dist)) S.vdist = dist; save(); render();
  if(innerWidth < 900){ var d = $('vdetail'); if(d) d.scrollIntoView({behavior:'smooth', block:'start'}); }
}
function setSel(id){ S.sel = id; save(); render(); if(innerWidth < 900 && !(document.activeElement && document.activeElement.classList.contains('rrow'))){ var d = $('detail'); if(d) d.scrollIntoView({behavior:'smooth', block:'start'}); } }
function addSite(district, village, stat){
  if(S.sites.length >= MAXSITES){ toast('最多 ' + MAXSITES + ' 間'); return; }
  var vv = village ? villOf(village, district) : null;
  var su = stat && sData(district) ? sData(district).list.filter(function(x){ return x.id === stat; })[0] : null;
  var s = cleanSite({name:su ? su.n + ' 店面' : vv ? vv.n + '店面' : '店面 ' + String.fromCharCode(65 + S.sites.length), district:district || S.sel || '', village:village || '', stat:stat || ''});
  S.sites.push(s); V.radar = null; save(); V.tab = 'sites'; lsSet('tab', 'sites'); render(); window.scrollTo(0, 0); toast('已新增「' + s.name + '」');
}
var ACT = {
  close:closeModal, warn:showWarn, settings:function(){ openSettings(); }, install:installHelp, leaveDemo:leaveDemo,
  print:doPrint, pdf:downloadPdf,
  csv:function(){ download('開店選址評估-' + today() + '.csv', csvText(), 'text/csv;charset=utf-8'); },
  share:function(){ copyText(shareUrl(), '分享連結已複製（含條件與店面，不含人流紀錄與勾選）'); },
  toggleAll:function(){ V.showAll = !V.showAll; render(); },
  resetW:function(){ S.ctx.weights = null; save(); closeModal(); render(); },
  resetRent:function(){ S.ctx.rentOverride = {}; save(); closeModal(); render(); toast('已恢復預設租金級距'); },
  saveName:function(){ S.ctx.name = ($('setName').value || '').slice(0, 30); save(); closeModal(); render(); },
  addSite:function(){ addSite(''); },
  addSiteHere:function(el){ addSite(el.dataset.d); },
  addSiteVill:function(el){ addSite(el.dataset.d, el.dataset.v, el.dataset.stat); },
  goVill:function(el){ S.vdist = el.dataset.d; S.vsel = ''; V.vAll = false; save(); V.tab = 'vill'; lsSet('tab', 'vill'); render(); window.scrollTo(0, 0); },
  vToggleAll:function(){ V.vAll = !V.vAll; render(); },
  ascAuto:function(){ V.asc = V.asc && V.asc.xlog === false ? {xlog:false} : null; softRender(); },
  vscAuto:function(){ V.vsc = V.vsc && V.vsc.ylog === false ? {ylog:false} : null; softRender(); },
  delSite:function(el){
    var id = el.dataset.sid, idx = S.sites.findIndex(function(x){ return x.id === id; }), s = S.sites[idx]; if(!s) return;
    var ses = S.sessions.filter(function(x){ return x.site === id; });
    S.sites.splice(idx, 1); S.sessions = S.sessions.filter(function(x){ return x.site !== id; }); V.radar = null; save(); render();
    toast('已刪除「' + s.name + '」', '↶ 復原', function(){ S.sites.splice(Math.min(idx, S.sites.length), 0, s); S.sessions = S.sessions.concat(ses); V.radar = null; save(); render(); toast('已復原「' + s.name + '」'); });
  },
  condFold:function(){ lsSet('condFold', lsGet('condFold') === '1' ? '0' : '1'); render(); },
  nlParse:function(){ applyParsed(D.parseText(($('nlText') || {}).value || ''), '規則'); },
  cmpToggle:function(el){ var id = el.dataset.d, i = S.cmp.indexOf(id); if(i >= 0) S.cmp.splice(i, 1); else { if(S.cmp.length >= 3){ toast('最多比較 3 區，先移除一區'); return; } S.cmp.push(id); } save(); render(); },
  cmpClear:function(){ S.cmp = []; save(); render(); },
  cmpOpen:function(){ openCompare(); },
  aiParse:function(){ ai('parse'); }, aiCompare:function(){ ai('compare'); }, aiDist:function(el){ ai('dist', el.dataset.d); }, aiUnit:function(el){ ai('unit', el.dataset.v); },
  aiSites:function(){ ai('sites'); }, aiCheck:function(){ ai('check'); }, aiPhoto:function(el){ ai('photo', el.dataset.sid); }, aiSettings:function(){ openSettings('ai'); },
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
  var t = e.target.closest('[data-act],[data-tab],[data-type],[data-target],[data-city],[data-flag],[data-layer],[data-demo],[data-fontsize],[data-sort],[data-radar],[data-cnt-site],[data-cnt-day],[data-cnt-slot],[data-cnt-min],[data-chk-site],[data-vlayer],[data-vscope],[data-vlevel],[data-bin],[data-vscq],[data-vsclog],[data-ascq],[data-asclog],[data-vsort],[data-v],.rrow[data-d],#map [data-d],.dot[data-d],tr[data-d]');
  if(!t){ if(e.target === $('modal')) closeModal(); return; }
  var ds = t.dataset, c = S.ctx;
  if(ds.act){ if(t.tagName === 'A') e.preventDefault(); if(ACT[ds.act]) ACT[ds.act](t); return; }
  if(ds.tab){ V.tab = ds.tab; lsSet('tab', ds.tab); render(); return; }
  if(ds.type){ c.type = ds.type; c.weights = null; save(); render(); return; }
  if(ds.target){ var i = c.targets.indexOf(ds.target); if(i >= 0) c.targets.splice(i, 1); else c.targets.push(ds.target); save(); render(); return; }
  if(ds.city){ var j = c.cities.indexOf(ds.city); if(j >= 0) c.cities.splice(j, 1); else c.cities.push(ds.city); save(); render(); return; }
  if(ds.flag){ c[ds.flag] = !c[ds.flag]; save(); render(); return; }
  if(ds.layer){ S.layer = ds.layer; V.binF = null; save(); render(); return; }
  if(ds.demo){ enterDemo(ds.demo); return; }
  if(ds.fontsize){ lsSet('fs', ds.fontsize); applyView(); closeModal(); openSettings(); return; }
  if(ds.sort){ if(V.sortK === ds.sort) V.sortDir = -V.sortDir; else { V.sortK = ds.sort; V.sortDir = ds.sort === 'rank' || ds.sort === 'name' ? 1 : -1; } render(); return; }
  if(ds.radar){ var k = V.radar.indexOf(ds.radar); if(k >= 0) V.radar.splice(k, 1); else { if(V.radar.length >= 3){ toast('一次最多疊 3 間'); return; } V.radar.push(ds.radar); } refreshSites(); return; }
  if(ds.cntSite){ V.cnt.site = ds.cntSite; render(); return; }
  if(ds.cntDay){ V.cnt.day = ds.cntDay; render(); return; }
  if(ds.cntSlot){ V.cnt.slot = ds.cntSlot; render(); return; }
  if(ds.cntMin){ V.cnt.target = +ds.cntMin; render(); return; }
  if(ds.chkSite){ V.chkSite = ds.chkSite; render(); return; }
  if(ds.vlayer){ S.vlayer = ds.vlayer; V.binF = null; save(); render(); return; }
  if(ds.vscq){ var q = +ds.v1, o = Object.assign({}, V.vsc || {}); if(ds.vscq === 'x'){ var onx = o.xmax === q && !o.xmin; delete o.xmin; if(onx) delete o.xmax; else o.xmax = q; } else { var ony = o.ymin === q && !isFinite(o.ymax); delete o.ymax; if(ony) delete o.ymin; else o.ymin = q; } V.vsc = o; softRender(); return; }
  if(ds.ascq){ var aq = +ds.v1, ao = Object.assign({}, V.asc || {}); if(ds.ascq === 'x'){ var onx2 = ao.xmin === aq && !isFinite(ao.xmax); delete ao.xmax; if(onx2) delete ao.xmin; else ao.xmin = aq; } else { var ony2 = ao.ymin === aq && !isFinite(ao.ymax); delete ao.ymax; if(ony2) delete ao.ymin; else ao.ymin = aq; } V.asc = ao; softRender(); return; }
  if(ds.asclog){ var ao2 = Object.assign({}, V.asc || {}); ao2.xlog = ds.asclog === '1'; delete ao2.xmin; delete ao2.xmax; V.asc = ao2; softRender(); return; }
  if(ds.vsclog){ var o2 = Object.assign({}, V.vsc || {}); o2.ylog = ds.vsclog === '1'; delete o2.ymin; delete o2.ymax; V.vsc = o2; softRender(); return; }
  if(ds.vlevel){ if(S.vlevel !== ds.vlevel){ S.vlevel = ds.vlevel; S.vsel = ''; V.vAll = false; V.binF = null; V.vsc = null; V.vsortK = 'rank'; V.vsortDir = 1; save(); render(); } return; }
  if(ds.bin !== undefined){ var bb = +ds.bin; V.binF = bb < 0 || (V.binF && V.binF.map === ds.binmap && V.binF.b === bb) ? null : {map:ds.binmap, b:bb}; if(window.SSS_UI) window.SSS_UI.binFilter(); else render(); return; }
  if(ds.vscope){ S.vscope = ds.vscope; V.vAll = false; save(); render(); return; }
  if(ds.vsort){ if(V.vsortK === ds.vsort) V.vsortDir = -V.vsortDir; else { V.vsortK = ds.vsort; V.vsortDir = ds.vsort === 'rank' || ds.vsort === 'name' || ds.vsort === 'st' ? 1 : -1; } render(); return; }
  if(ds.v){ setVSel(ds.v, ds.vd); return; }
  if(ds.d){ setSel(ds.d); return; }
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !$('modal').hidden) closeModal();
  if((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('rrow')){ e.preventDefault(); if(e.target.dataset.v) setVSel(e.target.dataset.v, e.target.dataset.vd); else if(e.target.dataset.d) setSel(e.target.dataset.d); }
  if((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.classList && e.target.classList.contains('rrow') && (e.target.dataset.v || e.target.dataset.d)){
    e.preventDefault(); var nx = e.key === 'ArrowDown' ? e.target.nextElementSibling : e.target.previousElementSibling; if(!nx) return;
    var isV = !!nx.dataset.v, id = isV ? nx.dataset.v : nx.dataset.d;
    if(isV) setVSel(id, nx.dataset.vd); else setSel(id);
    var f = document.querySelector('.rrow[data-' + (isV ? 'v' : 'd') + '="' + id + '"]'); if(f) f.focus({preventScroll:false});
  }
  if(V.tab === 'count' && e.key === ' ' && $('modal').hidden && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)){ e.preventDefault(); tap(1); }
});
var wTimer = null;
document.addEventListener('input', function(e){
  var t = e.target, ds = t.dataset;
  if(ds.ctx === 'budgetR'){ var bv = +t.value; S.ctx.budget = bv > 0 ? bv : 0; var bn = $('budget'); if(bn) bn.value = bv || ''; var bl = $('budgetV'); if(bl) bl.textContent = bv ? bv + ' 萬' : '不限'; save(); clearTimeout(wTimer); wTimer = setTimeout(function(){ softRender(); }, 120); return; }
  if(ds.ctx === 'budget'){ var v = +t.value; S.ctx.budget = isFinite(v) && v > 0 ? Math.min(v, 999) : 0; save(); clearTimeout(wTimer); wTimer = setTimeout(function(){ var p = t.selectionStart; render(); var b = $('budget'); if(b){ b.focus(); try{ b.setSelectionRange(p, p); }catch(er){} } }, 450); return; }
  if(ds.w){
    if(!S.ctx.weights) S.ctx.weights = Object.assign({}, D.WEIGHTS[S.ctx.type]);
    S.ctx.weights[ds.w] = +t.value; var o = $('wv_' + ds.w); if(o) o.textContent = t.value; save();
    clearTimeout(wTimer); wTimer = setTimeout(function(){ softRender(); }, 120); return;
  }
  if(ds.sk && ds.sid){
    var s = siteBy(ds.sid); if(!s) return;
    if(ds.sk === 'name'){ s.name = t.value.slice(0, 30); }
    else if(ds.sk === 'district'){ s.district = t.value; s.village = ''; save(); render(); return; }
    else if(ds.sk === 'village'){ return; }
    else if(ds.sk === 'floor' || ds.sk === 'cond'){ s[ds.sk] = t.value; }
    else if(ds.sk === 'park' || ds.sk === 'vis'){ s[ds.sk] = +t.value; }
    else { var n = +t.value, lim = NUMF[ds.sk]; if(t.value === '' || !isFinite(n)) delete s[ds.sk]; else s[ds.sk] = Math.max(lim[0], Math.min(lim[1], n)); }
    save(); clearTimeout(wTimer); wTimer = setTimeout(refreshSites, 200);
  }
});
document.addEventListener('change', function(e){
  var t = e.target, ds = t.dataset;
  if(ds.asc){ var ao = Object.assign({}, V.asc || {}), av = parseFloat(t.value); if(t.value === '' || !isFinite(av) || av < 0) delete ao[ds.asc]; else ao[ds.asc] = av;
    if(isFinite(ao.xmin) && isFinite(ao.xmax) && ao.xmin >= ao.xmax){ toast('X 的最小值要小於最大值'); delete ao[ds.asc]; }
    if(isFinite(ao.ymin) && isFinite(ao.ymax) && ao.ymin >= ao.ymax){ toast('Y 的最小值要小於最大值'); delete ao[ds.asc]; }
    V.asc = ao; softRender(); return; }
  if(ds.vsc){ var o = Object.assign({}, V.vsc || {}), v = parseFloat(t.value); if(t.value === '' || !isFinite(v) || v < 0) delete o[ds.vsc]; else o[ds.vsc] = v;
    if(isFinite(o.xmin) && isFinite(o.xmax) && o.xmin >= o.xmax){ toast('X 的最小值要小於最大值'); delete o[ds.vsc]; }
    if(isFinite(o.ymin) && isFinite(o.ymax) && o.ymin >= o.ymax){ toast('Y 的最小值要小於最大值'); delete o[ds.vsc]; }
    V.vsc = o; softRender(); return; }
  if(t.id === 'afind'){ var q = t.value.trim(), d = D.byId(q) || D.list.filter(function(x){ return x.name.indexOf(q.replace(/[區市鎮鄉]$/, '')) >= 0 || x.id.indexOf(q) >= 0; })[0]; if(d && q){ setSel(d.id); var dt = $('detail'); if(dt) dt.scrollIntoView({behavior:'smooth', block:'nearest'}); } else if(q) toast('找不到「' + q + '」'); return; }
  if(t.id === 'vfind'){ var q2 = t.value.trim(), dist = vDist(), u = unitsOf(dist).filter(function(x){ return !x.u && (x.n === q2 || x.n.indexOf(q2) >= 0); })[0]; if(u && q2) setVSel(u.id, dist); else if(q2) toast('這區找不到「' + q2 + '」'); return; }
  if(ds.chk){ var s = siteBy(V.chkSite); if(!s) return; if(t.checked) s.checks[ds.chk] = 1; else delete s.checks[ds.chk]; save(); render(); return; }
  if(ds.vdist){ S.vdist = t.value; S.vsel = ''; V.vAll = false; V.vsc = null; save(); render(); return; }
  if(ds.sk === 'village' && ds.sid){ var sv = siteBy(ds.sid); if(sv){ sv.village = t.value; save(); refreshSites(); } return; }
  if(ds.rentov){ var v = +t.value, d = D.byId(ds.rentov); if(v === d.rent) delete S.ctx.rentOverride[d.id]; else S.ctx.rentOverride[d.id] = v; save(); render(); return; }
});
document.addEventListener('toggle', function(e){
  if(e.target.id === 'advW'){ if(e.target.open) lsSet('advOpen', '1'); else lsDel('advOpen'); }
  if(e.target.id === 'tblD'){ if(e.target.open) lsSet('tblOpen', '1'); else lsDel('tblOpen'); }
  if(e.target.id === 'vtblD'){ if(e.target.open) lsSet('vtblOpen', '1'); else lsDel('vtblOpen'); }
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
  if(t.closest && t.closest('#vmap [data-v]')){ var vv = unitOf(t.closest('[data-v]').dataset.v, vDist()); if(vv){ var vr = (vCache.rows || []).filter(function(x){ return x.id === vv.id; })[0], kk = S.vlayer, sm = {}; if(vr) sm[vv.id] = vr.total;
    showTip(e, '<b>' + esc(vv.n) + '</b><br>' + (kk === 'same' ? '同類店家' : D.VLAYERS[kk].n) + '：' + vFmt(kk, vLayerVal(kk, vv, sm)) + (kk !== 'score' && vr ? '<br>街區適合度 ' + vr.total + '（第 ' + vr.rank + ' 名）' : '') + '<br>人口 ' + fmtN(vv.pop) + '・離' + esc(vv.st[0]) + '站 ' + vFmt('st', vv.st[2])); return; } }
  if(t.dataset && t.dataset.vseg !== undefined){ var vrow = t.closest('.rrow'), vr2 = (vCache.rows || []).filter(function(x){ return x.id === vrow.dataset.v; })[0], vx = D.VCOMPS[+t.dataset.vseg], vsw = 0; if(vr2){ D.VCOMPS.forEach(function(c){ vsw += vr2.w[c.k]; });
    showTip(e, '<b>' + esc(vr2.v.n) + '・' + vx.n + '</b><br>得分 ' + Math.round(vr2.s[vx.k]) + ' × 權重 ' + Math.round(vr2.w[vx.k] / vsw * 100) + '%<br>＝ ' + vr2.parts[vx.k].toFixed(1) + ' 分<br><span style="opacity:.8">' + vx.s + '</span>'); return; } }
  if(t.classList && t.classList.contains('dot') && t.dataset.v){ var dv = unitOf(t.dataset.v, vDist()); if(dv){ showTip(e, '<b>' + esc(dv.n) + '</b><br>離' + esc(dv.st[0]) + '站 ' + vFmt('st', dv.st[2]) + '<br>人口密度 ' + fmtN(dv.dens) + ' 人／km²<br>人口 ' + fmtN(dv.pop)); return; } }
  if(t.closest && t.closest('.stn')){ showTip(e, esc(t.closest('.stn').dataset.tipv)); return; }
  if(t.classList && t.classList.contains('dot') && D.byId(t.dataset.d)){ var dd = D.byId(t.dataset.d), r2 = rankOf(t.dataset.d); showTip(e, '<b>' + esc(dd.id) + '</b><br>人口密度 ' + fmtN(dd.dens) + ' 人／km²<br>所得中位數 ' + dd.inc + ' 千元<br>人口 ' + fmtN(dd.pop) + (r2 ? '<br>適合度 ' + r2.total + '（第 ' + r2.rank + ' 名）' : '')); return; }
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
window.SSS_APP = {
  get S(){ return S; }, get V(){ return V; }, D:D, MAP:MAP, esc:esc, fmtN:fmtN, today:today, toast:toast, openModal:openModal, closeModal:closeModal, render:render, save:save,
  lsGet:lsGet, lsSet:lsSet, lsJson:lsJson, openSettings:openSettings, copyText:copyText, applyParsed:applyParsed, ctxLine:ctxLine, R:R, rankOf:rankOf,
  vDist:vDist, isStat:isStat, unitsOf:unitsOf, vRanked:vRanked, villOf:villOf, siteBy:siteBy, sData:sData, M_PER_UNIT:M_PER_UNIT,
  refreshSites:refreshSites, setSel:setSel, setVSel:setVSel
};
window._sss = {render:render, reportEl:reportEl, downloadPdf:downloadPdf, csvText:csvText, shareUrl:shareUrl, checklistUrl:checklistUrl, enterDemo:enterDemo, leaveDemo:leaveDemo, addSite:addSite,
  get S(){ return S; }, get V(){ return V; }};
})();
