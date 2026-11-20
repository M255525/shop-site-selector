"""把 taiwan-atlas towns-10t.json（內政部鄉鎮市區界線）轉成四縣市內嵌 SVG path → map_data.js
用法：python tools/build_map.py"""
import json, math, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
T = json.load(open('tools/raw/towns.json', encoding='utf-8'))
sx, sy = T['transform']['scale']; tx, ty = T['transform']['translate']
arcs = []
for a in T['arcs']:
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
    arcs.append(pts)
def arc(i): return arcs[i] if i >= 0 else arcs[~i][::-1]
def ring(r):
    pts = []
    for i in r:
        p = arc(i); pts += p if not pts else p[1:]
    return pts
WANT = {'台北市': '臺北市', '臺北市': '臺北市', '新北市': '新北市', '桃園市': '桃園市', '新竹市': '新竹市', '新竹縣': '新竹縣'}
geos = [g for g in T['objects']['towns']['geometries'] if g['properties']['COUNTYNAME'] in WANT]
LAT0 = 24.9; K = math.cos(math.radians(LAT0))
allp = []
polys = {}
for g in geos:
    rs = g['arcs'] if g['type'] == 'Polygon' else [r for poly in g['arcs'] for r in poly]
    name = WANT[g['properties']['COUNTYNAME']] + g['properties']['TOWNNAME']
    rings = [ring(r) for r in rs]
    polys[name] = rings
    for r in rings: allp += r
minx = min(p[0] for p in allp); maxx = max(p[0] for p in allp)
miny = min(p[1] for p in allp); maxy = max(p[1] for p in allp)
W = 1000; S = W / ((maxx - minx) * K); H = round((maxy - miny) * S)
json.dump({'minx': minx, 'maxy': maxy, 'K': K, 'S': S, 'W': W, 'H': H}, open('tools/raw/proj.json', 'w'))
def pr(p): return ((p[0] - minx) * K * S, (maxy - p[1]) * S)
def simplify(pts, eps):
    if len(pts) < 4: return pts
    a, b = pts[0], pts[-1]; dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]; dx, dy = b[0]-a[0], b[1]-a[1]
        L = math.hypot(dx, dy) or 1e-9
        d = abs(dy*p[0] - dx*p[1] + b[0]*a[1] - b[1]*a[0]) / L
        if d > dmax: dmax, idx = d, i
    if dmax > eps: return simplify(pts[:idx+1], eps)[:-1] + simplify(pts[idx:], eps)
    return [a, b]
out = {}
for name, rings in polys.items():
    d = []; area_best = 0; cen = (0, 0)
    for r in rings:
        q = [pr(p) for p in r]
        far = max(range(len(q)), key=lambda i: (q[i][0]-q[0][0])**2 + (q[i][1]-q[0][1])**2)
        q = simplify(q[:far+1], 0.5)[:-1] + simplify(q[far:], 0.5)[:-1]
        if len(q) < 3: continue
        A = 0; cx = cy = 0
        for i in range(len(q)):
            x0, y0 = q[i]; x1, y1 = q[(i+1) % len(q)]
            c = x0*y1 - x1*y0; A += c; cx += (x0+x1)*c; cy += (y0+y1)*c
        if abs(A) > area_best and A != 0: area_best = abs(A); cen = (cx/(3*A), cy/(3*A))
        if abs(A) < 2: continue
        d.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in q) + 'Z')
    out[name] = {'d': ''.join(d), 'c': [round(cen[0], 1), round(cen[1], 1)]}
js = ('/* 自動產生：tools/build_map.py。界線資料：taiwan-atlas towns-10t（來源：內政部國土測繪中心鄉鎮市區界線，政府資料開放授權條款）*/\n'
      f'var SSS_MAP = {{w:{W}, h:{H}, towns:' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '};\n'
      "if(typeof module !== 'undefined') module.exports = SSS_MAP;\n")
open('map_data.js', 'w', encoding='utf-8').write(js)
print(len(out), 'towns', W, H, len(js), 'bytes')
print(sorted(out)[:5])
