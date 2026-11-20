/* 開店選址評估：互動層
   - 地圖縮放／拖曳（滾輪、拖曳、兩指縮放、＋－⟲ 按鈕），縮放後圖釘與車站符號維持大小、比例尺跟著變
   - 連動高亮：滑過地圖、排名、散布圖、數據表任何一處，同一個區／里在其他地方一起亮起來 */
(function(){
'use strict';
var A = window.SSS_APP; if(!A) return;
var Z = {};   // 每張地圖（zkey）記住使用者縮放到哪裡，重畫後還原
function getVb(svg){ return svg.getAttribute('viewBox').split(/[ ,]+/).map(Number); }
function homeVb(svg){ return (svg.getAttribute('data-home') || svg.getAttribute('viewBox')).split(/[ ,]+/).map(Number); }
function unitPerPx(svg){ var b = getVb(svg), r = svg.getBoundingClientRect(); return r.width && r.height ? Math.max(b[2] / r.width, b[3] / r.height) : 1; }
function setVb(svg, b){
  var h = homeVb(svg), minW = h[2] / 60, maxW = h[2] * 1.15;
  if(b[2] < minW){ var k = minW / b[2]; b = [b[0] - (b[2] * k - b[2]) / 2, b[1] - (b[3] * k - b[3]) / 2, b[2] * k, b[3] * k]; }
  if(b[2] > maxW){ var k2 = maxW / b[2]; b = [b[0] + (b[2] - b[2] * k2) / 2, b[1] + (b[3] - b[3] * k2) / 2, b[2] * k2, b[3] * k2]; }
  // 不要拖到完全看不見
  b[0] = Math.min(Math.max(b[0], h[0] - b[2] * .8), h[0] + h[2] - b[2] * .2);
  b[1] = Math.min(Math.max(b[1], h[1] - b[3] * .8), h[1] + h[3] - b[3] * .2);
  svg.setAttribute('viewBox', b.map(function(x){ return x.toFixed(3); }).join(' '));
  Z[svg.getAttribute('data-zkey')] = b; rescale(svg);
}
function rescale(svg){
  var w = getVb(svg)[2];
  svg.querySelectorAll('[data-k0]').forEach(function(g){ g.setAttribute('transform', 'translate(' + g.getAttribute('data-x') + ',' + g.getAttribute('data-y') + ') scale(' + (w * +g.getAttribute('data-k0')).toFixed(5) + ')'); });
  var sb = svg.parentNode.querySelector('.scalebar'); if(!sb) return;
  var mpp = unitPerPx(svg) * A.M_PER_UNIT, m = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter(function(x){ return x / mpp <= 130; }).pop() || 20;
  sb.querySelector('i').style.width = (m / mpp).toFixed(1) + 'px';
  sb.querySelector('span').textContent = m >= 1000 ? m / 1000 + ' 公里' : m + ' 公尺';
}
function zoomAt(svg, cx, cy, f){
  var b = getVb(svg), r = svg.getBoundingClientRect(), u = unitPerPx(svg);
  // 置中補償（preserveAspectRatio meet）
  var ox = (r.width * u - b[2]) / 2, oy = (r.height * u - b[3]) / 2;
  var px = b[0] - ox + (cx - r.left) * u, py = b[1] - oy + (cy - r.top) * u;
  setVb(svg, [px - (px - b[0]) * f, py - (py - b[1]) * f, b[2] * f, b[3] * f]);
}
function attach(svg){
  if(svg._z) return; svg._z = 1;
  var wrap = svg.parentNode, pts = {}, drag = null, pinch = null;
  if(!wrap.querySelector('.zoombar')){
    var zb = document.createElement('div'); zb.className = 'zoombar';
    zb.innerHTML = '<button type="button" data-z="in" aria-label="放大">＋</button><button type="button" data-z="out" aria-label="縮小">－</button><button type="button" data-z="home" aria-label="回到全圖">⟲</button>';
    wrap.appendChild(zb);
    zb.addEventListener('click', function(e){
      var t = e.target.closest('[data-z]'); if(!t) return; e.stopPropagation();
      var r = svg.getBoundingClientRect();
      if(t.dataset.z === 'home') setVb(svg, homeVb(svg)); else zoomAt(svg, r.left + r.width / 2, r.top + r.height / 2, t.dataset.z === 'in' ? 1 / 1.5 : 1.5);
    });
  }
  if(!wrap.querySelector('.scalebar')){ var s = document.createElement('div'); s.className = 'scalebar'; s.innerHTML = '<i></i><span></span>'; wrap.appendChild(s); }
  svg.addEventListener('wheel', function(e){ e.preventDefault(); zoomAt(svg, e.clientX, e.clientY, Math.pow(1.0018, e.deltaMode ? e.deltaY * 30 : e.deltaY)); }, {passive:false});
  svg.addEventListener('pointerdown', function(e){
    pts[e.pointerId] = {x:e.clientX, y:e.clientY};
    var ids = Object.keys(pts);
    if(ids.length === 1 && e.pointerType === 'mouse'){ drag = {x:e.clientX, y:e.clientY, vb:getVb(svg), moved:false}; }
    if(ids.length === 2){ var a = pts[ids[0]], b = pts[ids[1]]; pinch = {d:Math.hypot(a.x - b.x, a.y - b.y), vb:getVb(svg)}; drag = null; svg._moved = true; }
  });
  svg.addEventListener('pointermove', function(e){
    if(!pts[e.pointerId]) return;
    pts[e.pointerId] = {x:e.clientX, y:e.clientY};
    var ids = Object.keys(pts);
    if(pinch && ids.length === 2){
      var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if(d > 10){ svg.setAttribute('viewBox', pinch.vb.join(' ')); zoomAt(svg, (a.x + b.x) / 2, (a.y + b.y) / 2, pinch.d / d); }
      e.preventDefault(); return;
    }
    if(drag){
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if(!drag.moved && Math.hypot(dx, dy) < 5) return;
      if(!drag.moved){ drag.moved = true; svg._moved = true; svg.classList.add('panning'); try{ svg.setPointerCapture(e.pointerId); }catch(er){} }
      var u = unitPerPx(svg); setVb(svg, [drag.vb[0] - dx * u, drag.vb[1] - dy * u, drag.vb[2], drag.vb[3]]);
    }
  });
  function up(e){ delete pts[e.pointerId]; if(Object.keys(pts).length < 2) pinch = null; if(!Object.keys(pts).length){ drag = null; svg.classList.remove('panning'); setTimeout(function(){ svg._moved = false; }, 0); } }
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up); svg.addEventListener('pointerleave', function(e){ if(e.pointerType === 'mouse') up(e); });
  // 拖曳結束那一下不要當成點選
  svg.addEventListener('click', function(e){ if(svg._moved){ e.stopPropagation(); e.preventDefault(); } }, true);
  svg.addEventListener('dblclick', function(e){ e.preventDefault(); zoomAt(svg, e.clientX, e.clientY, e.shiftKey ? 1.8 : 1 / 1.8); });
}
function after(){
  document.querySelectorAll('[data-zoom] svg').forEach(function(svg){
    var k = svg.getAttribute('data-zkey');
    if(Z[k]) svg.setAttribute('viewBox', Z[k].map(function(x){ return x.toFixed(3); }).join(' '));
    attach(svg); rescale(svg);
  });
  hlId = null;
}
window.addEventListener('resize', function(){ document.querySelectorAll('[data-zoom] svg').forEach(rescale); });

/* ---------- 連動高亮 ---------- */
var hlId = null, HL_SEL = 'path.t,.rrow,.dot,tbody tr,.pin';
function setHl(attr, id){
  var key = id ? attr + '=' + id : null; if(key === hlId) return;
  document.querySelectorAll('.hl').forEach(function(e){ e.classList.remove('hl'); });
  hlId = key; if(!id) return;
  document.querySelectorAll('[data-' + attr + '="' + id.replace(/"/g, '') + '"]').forEach(function(e){ if(e.matches(HL_SEL)) e.classList.add('hl'); });
}
document.addEventListener('pointerover', function(e){
  var t = e.target.closest && e.target.closest('[data-v],[data-d]');
  if(!t || !t.matches(HL_SEL)){ setHl(null, null); return; }
  if(t.dataset.v) setHl('v', t.dataset.v); else setHl('d', t.dataset.d);
});
document.addEventListener('focusin', function(e){ var t = e.target; if(t.classList && t.classList.contains('rrow')){ if(t.dataset.v) setHl('v', t.dataset.v); else if(t.dataset.d) setHl('d', t.dataset.d); } });

/* 匯出選單：點選項目或點外面就收起 */
document.addEventListener('click', function(e){ document.querySelectorAll('details.menu[open]').forEach(function(m){ if(!m.contains(e.target) || e.target.closest('.menubox button')) m.open = false; }); });
window.SSS_UI = {after:after, binFilter:function(){ A.render(); }, reset:function(k){ delete Z[k]; }, _Z:Z};
after();   // app.js 第一次畫面在 ui.js 載入前就畫好了
})();
