"""OSM 車站節點 → 用內政部鄉鎮市區界線（未簡化）判斷所在行政區，輸出 tools/raw/stations_by_district.json"""
import json, io, sys, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
T = json.load(open('tools/raw/towns.json', encoding='utf-8'))
sx, sy = T['transform']['scale']; tx, ty = T['transform']['translate']
arcs = []
for a in T['arcs']:
    x = y = 0; pts = []
    for dx, dy in a: x += dx; y += dy; pts.append((x*sx+tx, y*sy+ty))
    arcs.append(pts)
def ring(r):
    pts = []
    for i in r:
        p = arcs[i] if i >= 0 else arcs[~i][::-1]; pts += p if not pts else p[1:]
    return pts
WANT = {'台北市': '臺北市', '臺北市': '臺北市', '新北市': '新北市', '桃園市': '桃園市', '新竹市': '新竹市', '新竹縣': '新竹縣'}
polys = {}
for g in T['objects']['towns']['geometries']:
    pc = g['properties']
    if pc['COUNTYNAME'] not in WANT: continue
    P = [g['arcs']] if g['type'] == 'Polygon' else g['arcs']
    polys[WANT[pc['COUNTYNAME']] + pc['TOWNNAME']] = [[ring(r) for r in poly] for poly in P]
def inside(pt, r):
    x, y = pt; c = False
    for i in range(len(r)):
        x0, y0 = r[i]; x1, y1 = r[i-1]
        if (y0 > y) != (y1 > y) and x < (x1-x0)*(y-y0)/(y1-y0)+x0: c = not c
    return c
def where(pt):
    for n, P in polys.items():
        for poly in P:
            if inside(pt, poly[0]) and not any(inside(pt, h) for h in poly[1:]): return n
    return None
E = json.load(open('tools/raw/stations.json', encoding='utf-8'))['elements']
seen = {}; out = {n: {'metro': [], 'rail': [], 'hsr': []} for n in polys}
for e in E:
    t = e['tags']; net = t.get('network', ''); st = t.get('station')
    name = t.get('name', '').strip(); name = name if name.endswith('車站') else re.sub(r'站$', '', name)
    if not name or net in ('烏來觀光台車', 'Skytrain') or 'Skytrain' in t.get('name:en', ''): continue
    if net == '台灣高鐵' or '高鐵' in t.get('operator', ''): k = 'hsr'
    elif st in ('subway', 'light_rail') or '捷運' in net: k = 'metro'
    elif st == 'train' or '臺鐵' in net or '台鐵' in net or 'railway' in t.get('operator:en', '').lower(): k = 'rail'
    else: continue
    d = where((e['lon'], e['lat']))
    if not d: continue
    key = (k, name, d)
    if key in seen: continue
    seen[key] = 1; out[d][k].append(name)
json.dump(out, open('tools/raw/stations_by_district.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
for k in ('metro', 'rail', 'hsr'): print(k, sum(len(v[k]) for v in out.values()))
for n in ('臺北市大安區', '臺北市中正區', '新北市板橋區', '桃園市中壢區', '新竹縣竹北市', '新竹市東區', '桃園市桃園區'):
    print(n, {k: v for k, v in out[n].items()})
