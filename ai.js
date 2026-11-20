/* 開店選址評估：AI 助手（自備金鑰 BYOK，支援 Gemini、OpenAI、Claude、OpenRouter、xAI、DeepSeek、自訂 OpenAI 相容端點）
   原則：分數、排名、門檻一律由 data.js 規則決定，AI 只做「聽懂使用者的話」「解讀與建議」「看照片給觀察」。
   沒有金鑰也能用：一句話設定有規則式解析，其他功能可「複製提示詞」貼到任何 AI。金鑰只存在這台瀏覽器（localStorage sss.ai）。 */
(function(){
'use strict';
var A = window.SSS_APP; if(!A) return;
var D = A.D, esc = A.esc;
var $ = function(id){ return document.getElementById(id); };

/* ---------- 服務商（與開店前置清單 ai.js 相同） ---------- */
function geminiModelFix(m){ var r = {'gemini-2.5-flash':'gemini-3.6-flash', 'gemini-2.5-flash-lite':'gemini-3.5-flash-lite', 'gemini-2.5-pro':'gemini-3.8-flash', 'gemini-2.0-flash':'gemini-3.6-flash', 'gemini-2.0-flash-001':'gemini-3.6-flash', 'gemini-2.0-flash-lite':'gemini-3.1-flash-lite', 'gemini-1.5-flash':'gemini-3.6-flash', 'gemini-1.5-pro':'gemini-3.1-pro-preview', 'gemini-3-pro':'gemini-3.1-pro-preview', 'gemini-3-pro-preview':'gemini-3.1-pro-preview', 'gemini-3.5-pro':'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview':'gemini-3.1-flash-lite'}; m = String(m || '').trim().replace(/^models\//, ''); return r[m] || m; }
var PROVIDERS = {
  gemini: {label:'Gemini（Google AI Studio）', vision:true, models:[['gemini-3.5-flash', 'Gemini 3.5 Flash（均衡，推薦）'], ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro 預覽版（最強）'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite（快速省錢）']]},
  openai: {label:'OpenAI', vision:true, url:'https://api.openai.com/v1/chat/completions', models:[['gpt-5-mini', 'GPT-5 mini（均衡，推薦）'], ['gpt-5', 'GPT-5（最強）'], ['gpt-4o-mini', 'GPT-4o mini（快速省錢）']]},
  claude: {label:'Claude（Anthropic）', vision:true, models:[['claude-sonnet-5-5', 'Claude Sonnet 5.5（均衡，推薦）'], ['claude-opus-5-5', 'Claude Opus 5.5（最強）'], ['claude-haiku-5-5', 'Claude Haiku 5.5（快速省錢）']]},
  openrouter: {label:'OpenRouter', vision:true, url:'https://openrouter.ai/api/v1/chat/completions', models:[['openai/gpt-4o-mini', 'OpenAI GPT-4o mini（推薦）'], ['google/gemini-2.5-flash', 'Google Gemini 2.5 Flash'], ['anthropic/claude-sonnet-4.5', 'Anthropic Claude Sonnet 4.5']]},
  xai: {label:'xAI Grok', vision:true, url:'https://api.x.ai/v1/chat/completions', models:[['grok-4', 'Grok 4'], ['grok-3-mini', 'Grok 3 mini（不支援看圖）']]},
  deepseek: {label:'DeepSeek（只支援文字）', vision:false, url:'https://api.deepseek.com/chat/completions', models:[['deepseek-chat', 'DeepSeek Chat（推薦）'], ['deepseek-reasoner', 'DeepSeek Reasoner（推理）']]},
  custom: {label:'自訂（OpenAI 相容端點，例如 Ollama、LM Studio）', vision:true, models:[]}
};
function cfg(){ var c = A.lsJson('ai', {}); if(!c || typeof c !== 'object') c = {}; if(!PROVIDERS[c.provider]) c.provider = 'gemini'; return c; }
function aiModel(c){ c = c || cfg(); return (c.modelCustom || '').trim() || c.model || ((PROVIDERS[c.provider].models[0]) || [''])[0]; }
function customUrl(base){ base = (base || '').trim().replace(/\/+$/, ''); return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions'; }
function ready(){ var c = cfg(); return c.provider === 'custom' ? !!(c.base || '').trim() && !!aiModel(c) : !!c.key; }
function status(){ var c = cfg(); return ready() ? PROVIDERS[c.provider].label.replace(/（.*/, '') + '・' + aiModel(c) : '未設定'; }

async function callLLM(prompt, images, wantJson, onStatus){
  var c = cfg(), provider = c.provider, model = aiModel(c), key = c.key, url, headers, body, extract;
  images = PROVIDERS[provider].vision === false ? [] : (images || []);
  if(provider === 'claude'){
    url = 'https://api.anthropic.com/v1/messages';
    headers = {'content-type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true'};
    var content = images.map(function(im){ return {type:'image', source:{type:'base64', media_type:im.mime, data:im.b64}}; });
    content.push({type:'text', text:prompt});
    body = {model:model, max_tokens:4000, messages:[{role:'user', content:content}]};
    extract = function(d){ return (d.content || []).filter(function(b){ return b.type === 'text'; }).map(function(b){ return b.text; }).join(''); };
  } else if(provider !== 'gemini'){
    url = provider === 'custom' ? customUrl(c.base) : PROVIDERS[provider].url;
    headers = {'content-type':'application/json'};
    if(key) headers.authorization = 'Bearer ' + key;
    var msg = images.length ? [{type:'text', text:prompt}].concat(images.map(function(im){ return {type:'image_url', image_url:{url:im.dataUrl}}; })) : prompt;
    body = {model:model, messages:[{role:'user', content:msg}]};
    extract = function(d){ return d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content; };
  } else {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(geminiModelFix(model)) + ':generateContent';
    headers = {'content-type':'application/json', 'x-goog-api-key':key};
    var parts = images.map(function(im){ return {inline_data:{mime_type:im.mime, data:im.b64}}; });
    parts.push({text:prompt});
    body = {contents:[{parts:parts}]};
    if(wantJson) body.generationConfig = {responseMimeType:'application/json'};
    extract = function(d){ var ps = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || []; return ps.map(function(p){ return p.text || ''; }).join(''); };
  }
  for(var attempt = 1; attempt <= 3; attempt++){
    var resp = await fetch(url, {method:'POST', headers:headers, body:JSON.stringify(body), signal:AbortSignal.timeout(150000)});
    var raw = await resp.text();
    if(resp.ok){ var t = extract(JSON.parse(raw)); if(!t) throw new Error('回應中沒有文字內容'); return t; }
    var em = raw.slice(0, 200);
    try{ var e = JSON.parse(raw); em = (e.error && e.error.message) || e.message || em; }catch(x){}
    if({429:1, 500:1, 503:1, 529:1}[resp.status] && attempt < 3){ if(onStatus) onStatus('服務忙碌（' + resp.status + '），' + attempt * 6 + ' 秒後重試…'); await new Promise(function(r){ setTimeout(r, attempt * 6000); }); continue; }
    throw new Error('HTTP ' + resp.status + '：' + em);
  }
}
function parseJson(txt){ var s = txt.indexOf('{'), e = txt.lastIndexOf('}'); if(s < 0 || e < s) throw new Error('AI 回傳的不是 JSON'); return JSON.parse(txt.slice(s, e + 1)); }

/* ---------- 事實（只給統計數字與規則分數，不給使用者以外的個資） ---------- */
var RULES = '你是協助台灣小店創業者的「開店選址顧問」。請遵守：\n' +
  '1. 一律使用繁體中文（台灣用語），口吻親切、具體、短句，用小標題與條列。\n' +
  '2. 只能根據下面提供的數據說明；不得編造人口、租金、人流、營業額、店名、地址、商圈名稱或電話。需要但沒有的數字寫【請實地確認】。\n' +
  '3. 適合度分數與排名是本工具依公開統計用規則算出來的，不要重新打分或改變排名，可以解釋為什麼。\n' +
  '4. 不保證營業成績，不給投資建議；店面能不能開這種店（使用分區、建物用途、消防）提醒以縣市政府認定為準。\n' +
  '5. OpenStreetMap 店家數不完整，台北市以外漏登較多，引用時要提醒。\n';
function ctxFacts(){ var c = A.S.ctx; return '【我的店】' + A.ctxLine(c) + (c.name ? '；店名：' + c.name : '') + '\n'; }
function distFacts(id){
  var r = A.rankOf(id) || D.scoreDistrict(D.byId(id), A.S.ctx), d = r.d, ex = D.explain(r, A.S.ctx);
  return '【行政區】' + d.id + '：適合度 ' + r.total + ' 分' + (r.rank ? '（範圍內第 ' + r.rank + ' 名）' : '') + '；人口 ' + d.pop + '、人口密度約 ' + d.dens + ' 人/km²、戶數 ' + d.hh + '、綜合所得中位數 ' + d.inc + ' 千元（' + D.DIST.meta.incYear + ' 年度）；' +
    '年齡 0–14 歲 ' + (D.share(d, 0) * 100).toFixed(1) + '%、15–24 歲 ' + (D.share(d, 1) * 100).toFixed(1) + '%、25–44 歲 ' + (D.share(d, 2) * 100).toFixed(1) + '%、65 歲以上 ' + (D.share(d, 4) * 100).toFixed(1) + '%；' + D.stationText(d) +
    '；租金級距（本工具自估）' + D.RENT_TIERS[r.tier].n + '；區域性質（自行整理）' + d.tags.map(function(t){ return D.TAGS[t]; }).join('、') + '\n' +
    '  各項得分（0–100）：' + D.COMPS.map(function(x){ return x.n + ' ' + Math.round(r.s[x.k]); }).join('、') + '\n' +
    '  規則說明：' + ex.good.concat(ex.warn.map(function(w){ return '注意：' + w; })).join('；') + '\n';
}
function unitFacts(id){
  var dist = A.vDist(), rows = A.vRanked(dist), r = rows.filter(function(x){ return x.id === id; })[0];
  if(!r) return '';
  var v = r.v, st = !!v.a6, ex = D.explainVillage(r, A.S.ctx);
  var ages = st ? D.A6_N.map(function(n, i){ return n + ' ' + (v.a6[i] / v.pop * 100).toFixed(1) + '%'; }) : D.AGE_N.map(function(n, i){ return n + ' ' + (v.age[i] / v.pop * 100).toFixed(1) + '%'; });
  return '【' + (st ? '最小統計區' : '村里') + '】' + v.d + ' ' + v.n + (st ? '（代碼 ' + v.id + '，屬於' + v.vn + '）' : '') + '：' + (st ? '統計區' : '街區') + '適合度 ' + r.total + ' 分（本區第 ' + r.rank + ' / ' + rows.length + ' 名）；人口 ' + v.pop + '、戶數 ' + v.hh + '、人口密度約 ' + v.dens + ' 人/km²；' +
    (v.inc ? (st ? '所屬里' : '') + '所得中位數 ' + v.inc + ' 千元；' : '') + '最近車站：' + D.ST_K[v.st[1]] + v.st[0] + '站，直線約 ' + v.st[2] + ' 公尺；' +
    (st ? '中心半徑 300 公尺內' : '里內') + ' OSM 登錄店家：' + D.POI_K.map(function(k, i){ return D.POI_N[k] + ' ' + v.poi[i]; }).join('、') + '；年齡：' + ages.join('、') + '\n' +
    '  各項得分（0–100，和同區比較）：' + D.VCOMPS.map(function(x){ return x.n + ' ' + Math.round(r.s[x.k]); }).join('、') + '\n' +
    '  規則說明：' + ex.good.concat(ex.warn.map(function(w){ return '注意：' + w; })).join('；') + '\n';
}
function siteFacts(){
  return A.S.sites.map(function(s, i){
    var sc = D.scoreSite(s, A.S.ctx), v = A.villOf(s.village, s.district);
    return (i + 1) + '. ' + s.name + '：' + (s.district || '未指定區') + (v ? ' ' + v.n : '') + '；月租 ' + (s.rent !== undefined ? s.rent + ' 萬' : '未填') + '、' + (s.ping !== undefined ? s.ping + ' 坪' : '坪數未填') + '、店面寬 ' + (s.front !== undefined ? s.front + ' 公尺' : '未填') + '、' + D.FLOORS[s.floor] + '、' + D.CONDS[s.cond] +
      '、走到車站 ' + (s.walk !== undefined ? s.walk + ' 分鐘' : '未填') + '、200m 內同業 ' + (s.comp !== undefined ? s.comp : '?') + ' 家／互補店 ' + (s.compl !== undefined ? s.compl : '?') + ' 家、門前人流 ' + (s.traffic !== undefined ? s.traffic + ' 人/時' : '未數') +
      '、預估月營業額 ' + (sc.revenue || '未估') + ' 萬、租金占比 ' + (sc.ratio === null ? '—' : sc.ratio + '%') + '；總分 ' + sc.total + '（' + D.SITE_COMPS.map(function(x){ return x.n + ' ' + Math.round(sc.s[x.k]); }).join('、') + '）' + (sc.notes.length ? '；規則提醒：' + sc.notes.join('；') : '');
  }).join('\n') + '\n';
}

/* ---------- 各功能的提示詞 ---------- */
var P = {
  parse:function(text){
    return '把使用者對開店的描述轉成 JSON，只能用下列欄位與值，看不出來的欄位就省略：\n' +
      '{"type": 店型，只能是 ' + Object.keys(D.TYPES).map(function(k){ return '"' + k + '"（' + D.TYPES[k].n + '）'; }).join('、') + ',\n' +
      ' "targets": 客群陣列，只能是 ' + Object.keys(D.TARGETS).map(function(k){ return '"' + k + '"（' + D.TARGETS[k].n + '）'; }).join('、') + ',\n' +
      ' "cities": 縣市陣列，只能是 ' + D.CITIES.map(function(c){ return '"' + c + '"'; }).join('、') + '（只說「新竹」就兩個都放）,\n' +
      ' "focus": 如果提到這四縣市裡某個行政區，填「縣市＋區名」全名，例如 "臺北市大安區"、"新竹縣竹北市",\n' +
      ' "budget": 店面月租預算，單位「萬元」的數字, "transit": 是否要靠近捷運或車站 true/false, "parking": 客人是否多開車騎車 true/false, "night": 是否晚上營業 true/false,\n' +
      ' "found": 你理解到的重點，繁體中文字串陣列}\n只輸出 JSON。\n使用者的描述：' + text;
  },
  dist:function(id){ return RULES + ctxFacts() + distFacts(id) + '\n請幫我解讀這個行政區適不適合開我的店：\n## 一句話結論\n## 主要優勢（2–4 點，引用上面的數字）\n## 要小心的地方（2–4 點）\n## 這區適合怎樣的店（定位、價位、營業時段建議）\n## 實地看店時要特別確認的 5 件事\n'; },
  unit:function(id){ return RULES + ctxFacts() + unitFacts(id) + '\n請幫我解讀這個街區適不適合開我的店：\n## 一句話結論\n## 這個街區的人與生活樣貌（從年齡、密度、所得、店家組成推論，標明是推論）\n## 優勢與風險\n## 到現場要觀察什麼（時段、動線、看哪一側人流）\n## 適合的開店方向\n'; },
  compare:function(){ return RULES + ctxFacts() + A.S.cmp.map(distFacts).join('') + '\n請比較這幾個行政區對我的店的差別：\n## 結論：各區適合的情況\n## 比較表（用條列，不用表格）\n## 我該怎麼選（依預算、客群、營業時段給判斷方式）\n'; },
  sites:function(){ return RULES + ctxFacts() + '【候選店面】（數字是我實地記錄或估計的）\n' + siteFacts() + '\n請幫我比較這些候選店面：\n## 結論與推薦順序（說明理由，不要改變工具的分數）\n## 每間的優缺點\n## 租金議價建議（用租金占營業額、空置、裝潢期等角度，提出可以談的條件，例如免租期、續約漲幅上限）\n## 簽約前還缺哪些資料\n'; },
  check:function(){ return RULES + ctxFacts() + (A.S.sites.length ? '【候選店面】\n' + siteFacts() : '') + '\n請幫我列出實地看店時要問的問題，分三組，每組 6–8 題，口語、可以直接問：\n## 問房東／仲介\n## 問隔壁店家或鄰居\n## 自己觀察（不同時段）\n最後提醒哪些要請縣市政府或專業人士確認。\n'; },
  photo:function(s){ return RULES + ctxFacts() + '【店面】' + s.name + '（' + (s.district || '未指定區') + '）\n' +
    '這是候選店面的照片。請只根據照片看得到的東西，輸出 JSON：\n{"vis": 從路口或對街看過來的能見度 1–5 的整數, "front_m": 估計店面寬度（公尺，看不出來就省略）, "floor": "1" 或 "1in"（騎樓後或巷內）或 "2" 或 "b1",\n' +
    ' "cond": "ready"（可直接沿用）或 "light"（小改裝）或 "heavy"（要大改／毛胚）, "observations": 看到的重點（繁中字串陣列，4–8 點）, "risks": 可能的問題（繁中字串陣列）, "ask": 建議再確認的事（繁中字串陣列）}\n看不出來的不要猜，放進 ask。只輸出 JSON。'; }
};

/* ---------- 結果視窗 ---------- */
function mdLite(t){
  return esc(t).replace(/^#{1,3}\s*(.+)$/gm, '<h3>$1</h3>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-*•]\s+(.+)$/gm, '<li>$1</li>').replace(/^\s*(\d+)[.)、]\s+(.+)$/gm, '<li>$2</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>').replace(/<\/ul>\s*<ul>/g, '').replace(/\n{2,}/g, '<br>').replace(/\n/g, ' ');
}
var LAST = '';
function showResult(title, text){
  LAST = text;
  A.openModal('<h2>🤖 ' + esc(title) + '</h2><div class="aiout">' + mdLite(text) + '</div><p class="small muted">AI 內容僅供參考，可能出錯；數字以工具與官方資料為準。</p><div class="stack"><button class="btn" data-ai="copyOut">📋 複製內容</button><button class="btn alt" data-act="close">關閉</button></div>');
}
function showPrompt(title, prompt, extra){
  LAST = prompt;
  A.openModal('<h2>🤖 ' + esc(title) + '</h2>' + (extra || '') + '<p class="small">還沒設定 AI 金鑰。可以按「複製提示詞」貼到 ChatGPT、Gemini、Claude 等任何 AI；或到 <a href="#" data-act="aiSettings">⚙ AI 設定</a> 填入自己的金鑰，之後按一下就有結果。</p>' +
    '<textarea readonly rows="10" style="width:100%;font-size:.82rem">' + esc(prompt) + '</textarea><div class="stack"><button class="btn" data-ai="copyOut">📋 複製提示詞</button><button class="btn alt" data-act="aiSettings">⚙ 設定金鑰</button><button class="btn alt" data-act="close">關閉</button></div>');
}
function busy(title){ A.openModal('<h2>🤖 ' + esc(title) + '</h2><p><span class="spin"></span><span id="aiMsg">AI 思考中…（約 10～40 秒）</span></p><div class="stack"><button class="btn alt" data-act="close">背景執行，先關閉</button></div>'); }
function msg(m){ var e = $('aiMsg'); if(e) e.textContent = m; }
var running = false;
async function go(title, prompt, images, wantJson, onJson){
  if(running){ A.toast('AI 還在處理上一個請求'); return; }
  running = true; busy(title);
  try{
    var t = await callLLM(prompt, images, wantJson, msg);
    if(onJson) onJson(parseJson(t)); else showResult(title, t);
  }catch(e){ A.openModal('<h2>🤖 ' + esc(title) + '</h2><p style="color:var(--pin)">失敗：' + esc(e && e.message || e) + '</p><p class="small">常見原因：金鑰錯誤、模型名稱不存在、額度用完、網路被擋。</p><div class="stack"><button class="btn" data-ai="copyPrompt">📋 改複製提示詞</button><button class="btn alt" data-act="aiSettings">⚙ 檢查設定</button><button class="btn alt" data-act="close">關閉</button></div>'); LAST = prompt; }
  finally{ running = false; }
}

/* ---------- 照片：壓縮後送出 ---------- */
function readImage(file){
  return new Promise(function(ok, no){
    var fr = new FileReader(); fr.onerror = no;
    fr.onload = function(){ var im = new Image(); im.onerror = no; im.onload = function(){
      var k = Math.min(1, 1280 / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); var url = c.toDataURL('image/jpeg', .85);
      ok({dataUrl:url, mime:'image/jpeg', b64:url.split(',')[1]}); }; im.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
var photoSite = null, photoJson = null;
function cleanPhoto(o){
  var r = {};
  var v = Math.round(+o.vis); if(v >= 1 && v <= 5) r.vis = v;
  var f = +o.front_m; if(f > 0 && f < 60) r.front = Math.round(f * 2) / 2;
  if(D.FLOORS[o.floor]) r.floor = o.floor;
  if(D.CONDS[o.cond]) r.cond = o.cond;
  ['observations', 'risks', 'ask'].forEach(function(k){ r[k] = Array.isArray(o[k]) ? o[k].filter(function(x){ return typeof x === 'string'; }).map(function(x){ return x.slice(0, 200); }).slice(0, 10) : []; });
  return r;
}
function showPhoto(s, r){
  photoJson = r;
  var sug = [r.vis ? '能見度 ' + r.vis + ' / 5' : '', r.front ? '店面寬約 ' + r.front + ' 公尺' : '', r.floor ? D.FLOORS[r.floor] : '', r.cond ? D.CONDS[r.cond] : ''].filter(Boolean);
  var li = function(a){ return a.length ? '<ul>' + a.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="small muted">（無）</p>'; };
  A.openModal('<h2>📷 AI 看店面：' + esc(s.name) + '</h2><div class="aiout"><h3>建議填入</h3><p>' + (sug.length ? esc(sug.join('・')) : '照片看不出來，請手動填。') + '</p><h3>看到的重點</h3>' + li(r.observations) + '<h3>可能的問題</h3>' + li(r.risks) + '<h3>建議再確認</h3>' + li(r.ask) + '</div>' +
    '<p class="small muted">AI 只看照片，可能看錯；套用後仍可以在店面卡修改。</p><div class="stack">' + (sug.length ? '<button class="btn" data-ai="applyPhoto">套用建議值</button>' : '') + '<button class="btn alt" data-act="close">關閉</button></div>');
}

/* ---------- 入口 ---------- */
function run(kind, arg){
  var c = A.S.ctx;
  if(kind === 'parse'){
    var text = (($('nlText') || {}).value || '').trim();
    if(!text){ A.toast('先在輸入框用一句話描述你的店'); var n = $('nlText'); if(n) n.focus(); return; }
    if(!ready()){ A.applyParsed(D.parseText(text), '規則，沒有 AI 金鑰'); return; }
    go('AI 理解你的描述', P.parse(text), null, true, function(o){
      var ctx = {}; if(D.TYPES[o.type]) ctx.type = o.type;
      if(Array.isArray(o.targets)) ctx.targets = o.targets.filter(function(t){ return D.TARGETS[t]; });
      if(Array.isArray(o.cities)) ctx.cities = o.cities.filter(function(t){ return D.CITIES.indexOf(t) >= 0; });
      if(typeof o.focus === 'string' && D.byId(o.focus.replace('台', '臺'))) ctx.focus = o.focus.replace('台', '臺');
      if(+o.budget > 0 && +o.budget < 999) ctx.budget = +o.budget;
      ['transit', 'parking', 'night'].forEach(function(k){ if(o[k] === true) ctx[k] = true; });
      A.closeModal(); A.applyParsed({ctx:ctx, found:Array.isArray(o.found) ? o.found.filter(function(x){ return typeof x === 'string'; }).map(function(x){ return x.slice(0, 60); }).slice(0, 6) : []}, 'AI');
    });
    return;
  }
  var map = {dist:['AI 解讀：' + arg, function(){ return P.dist(arg); }], unit:['AI 解讀街區', function(){ return P.unit(arg); }], compare:['AI 比較行政區', P.compare], sites:['AI 比較候選店面', P.sites], check:['看店要問的問題', P.check]};
  if(kind === 'sites' && !A.S.sites.length){ A.toast('先新增候選店面'); return; }
  if(kind === 'compare' && A.S.cmp.length < 2){ A.toast('至少加入 2 區才能比較'); return; }
  if(kind === 'photo'){
    var s = A.siteBy(arg); if(!s) return; photoSite = s.id;
    var vis = PROVIDERS[cfg().provider].vision !== false;
    A.openModal('<h2>📷 拍店面給 AI 看：' + esc(s.name) + '</h2><p class="small">拍店門口正面、從對街或路口看過來各一張效果最好（最多 3 張）。照片會壓縮後送到你選的 AI 服務商，不會存在本工具。</p>' +
      (ready() && vis ? '' : '<p class="small" style="color:var(--pin)">' + (ready() ? '目前的 AI 服務商不能看圖，請到 ⚙ AI 設定改用 Gemini、OpenAI 或 Claude。' : '這個功能需要 AI 金鑰（要能看圖的服務商）。') + '</p>') +
      '<input type="file" id="aiPhotoFile" accept="image/*" capture="environment" multiple><div class="stack"><button class="btn" data-ai="sendPhoto"' + (ready() && vis ? '' : ' disabled') + '>送出給 AI</button><button class="btn alt" data-act="aiSettings">⚙ AI 設定</button><button class="btn alt" data-act="close">取消</button></div>');
    return;
  }
  var m = map[kind]; if(!m) return;
  var prompt = m[1]();
  if(!ready()){ showPrompt(m[0], prompt); return; }
  go(m[0], prompt);
}
document.addEventListener('click', async function(e){
  var t = e.target.closest('[data-ai]'); if(!t) return;
  var k = t.dataset.ai;
  if(k === 'copyOut' || k === 'copyPrompt') A.copyText(LAST, '已複製');
  if(k === 'sendPhoto'){
    var f = $('aiPhotoFile'), files = f && f.files ? Array.prototype.slice.call(f.files, 0, 3) : [];
    if(!files.length){ A.toast('請先選照片'); return; }
    var s = A.siteBy(photoSite); if(!s) return;
    var imgs; try{ imgs = await Promise.all(files.map(readImage)); }catch(er){ A.toast('讀不到照片'); return; }
    go('AI 看店面', P.photo(s), imgs, true, function(o){ showPhoto(s, cleanPhoto(o)); });
  }
  if(k === 'applyPhoto'){
    var s2 = A.siteBy(photoSite), r = photoJson; if(!s2 || !r) return;
    ['vis', 'front', 'floor', 'cond'].forEach(function(x){ if(r[x] !== undefined) s2[x] = r[x]; });
    A.save(); A.closeModal(); A.render(); A.toast('已套用到「' + s2.name + '」');
  }
  if(k === 'test'){
    saveSettings(); var o = $('aiTestMsg'); if(o) o.textContent = '測試中…';
    try{ var r2 = await callLLM('請只回答「連線成功」四個字。', null, false); if(o) o.textContent = '✓ ' + r2.slice(0, 40); }catch(er){ if(o) o.textContent = '✕ ' + (er.message || er); }
  }
  if(k === 'clearKey'){ A.lsSet('ai', JSON.stringify({provider:cfg().provider})); A.closeModal(); A.openSettings('ai'); A.toast('已清除金鑰'); }
});

/* ---------- 設定 ---------- */
function settingsBody(){
  var c = cfg();
  return '<p class="small">自備金鑰（BYOK）：金鑰<b>只存在這台裝置的瀏覽器</b>，按 AI 按鈕時才直接送到你選的服務商，不經過本工具的伺服器。不想填金鑰也能按「複製提示詞」。</p>' +
    '<div class="aiset"><label>服務商<select id="aiProvider">' + Object.keys(PROVIDERS).map(function(k){ return '<option value="' + k + '"' + (k === c.provider ? ' selected' : '') + '>' + PROVIDERS[k].label + '</option>'; }).join('') + '</select></label>' +
    '<label>模型<select id="aiModel"></select></label><label>或自己輸入模型名稱<input type="text" id="aiModelCustom" value="' + esc(c.modelCustom || '') + '" placeholder="留空用上面的選項"></label>' +
    '<label id="aiBaseWrap">端點網址（自訂才要）<input type="text" id="aiBase" value="' + esc(c.base || '') + '" placeholder="例 http://localhost:11434/v1"></label>' +
    '<label>API 金鑰<input type="password" id="aiKey" value="' + esc(c.key || '') + '" autocomplete="off" placeholder="貼上你的金鑰"></label></div>' +
    '<p class="small" id="aiVision"></p><div class="stack"><button class="btn sm" data-ai="test">儲存並測試</button><button class="btn sm alt" data-ai="clearKey">清除金鑰</button></div><p class="small" id="aiTestMsg"></p>';
}
function fillModels(){
  var p = ($('aiProvider') || {}).value || 'gemini', c = cfg(), pv = PROVIDERS[p], cur = c.provider === p ? c.model : '';
  var sel = $('aiModel'); if(!sel) return;
  sel.innerHTML = pv.models.map(function(m){ return '<option value="' + m[0] + '"' + (m[0] === cur ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') || '<option value="">（請在下方輸入模型名稱）</option>';
  $('aiBaseWrap').hidden = p !== 'custom';
  $('aiVision').textContent = pv.vision ? '✓ 支援看圖（可用「📷 拍店面給 AI 看」）' : '⚠ 只支援文字，「拍店面給 AI 看」不能用';
}
function saveSettings(){
  if(!$('aiProvider')) return;
  A.lsSet('ai', JSON.stringify({provider:$('aiProvider').value, model:$('aiModel').value, modelCustom:$('aiModelCustom').value.trim(), base:$('aiBase').value.trim(), key:$('aiKey').value.trim()}));
}
function bindSettings(){
  if(!$('aiProvider')) return;
  fillModels();
  $('aiProvider').addEventListener('change', function(){ fillModels(); saveSettings(); });
  ['aiModel', 'aiModelCustom', 'aiBase', 'aiKey'].forEach(function(id){ $(id).addEventListener('change', saveSettings); });
}

window.SSS_AI = {run:run, status:status, ready:ready, settingsBody:settingsBody, bindSettings:bindSettings,
  _t:{P:P, callLLM:callLLM, cleanPhoto:cleanPhoto, parseJson:parseJson, PROVIDERS:PROVIDERS, distFacts:distFacts, unitFacts:unitFacts, siteFacts:siteFacts}};
})();
