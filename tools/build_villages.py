"""村里（街區）資料 → villages/<city>.js（每縣市一檔，畫面點進街區才載入）
來源：內政部國土測繪中心村里界（tools/raw/vill_shp）、內政部戶政司 ODRP014（村里人口）、財政部 165-9.csv（村里所得）、
      OpenStreetMap 車站（stations_clean.json）與店家（poi.csv）
用法：python tools/build_villages.py"""
import json, io, sys, os, math, csv, re, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from read_shp import read_dbf, read_shp
YM = '11510'; IY = '112'; SHP = 'tools/raw/vill_shp/VILLAGE_NLSC_1150817'; SHP_DATE = '115-08-17'
CITY = {'臺北市': 'tpe', '新北市': 'ntpc', '桃園市': 'tyc', '新竹市': 'hsc', '新竹縣': 'hsq'}
PJ = json.load(open('tools/raw/proj.json'))
def pr(lon, lat): return ((lon - PJ['minx']) * PJ['K'] * PJ['S'], (PJ['maxy'] - lat) * PJ['S'])

# --- 界線 ---
R = read_dbf(SHP + '.dbf'); G = read_shp(SHP + '.shp')
V = [(r, g) for r, g in zip(R, G) if r['COUNTYNAME'] in CITY]
# --- 人口 ---
rows = json.load(open(f'tools/raw/odrp014_{YM}_all.json', encoding='utf-8'))
pop = {}
for x in rows:
    a = {'hh': int(x['household_no']), 'pop': int(x['people_total']), 'age': [0, 0, 0, 0, 0]}
    for k, v in x.items():
        if k.startswith('people_age_') and (k.endswith('_m') or k.endswith('_f')):
            s = k[11:14]; age = 100 if s == '100' else int(s)
            a['age'][0 if age <= 14 else 1 if age <= 24 else 2 if age <= 44 else 3 if age <= 64 else 4] += int(v or 0)
    pop[x['district_code']] = a
# --- 所得（村里名對照；罕用字在 CSV 用 [ ] 表示，比對時拿掉） ---
def norm(s): return re.sub(r'\[.*?\]', '', s).replace('台', '臺')
inc = {}
for r in csv.reader(open(f'tools/raw/inc_{IY}.csv', encoding='utf-8-sig')):
    if len(r) > 6 and r[1] not in ('合計', '其他', '村里'):
        inc[(r[0].replace('台', '臺'), norm(r[1]))] = int(r[5])
# --- 幾何工具 ---
def ring_area_km2(rg):
    A = 0
    for i in range(len(rg)):
        (l0, p0), (l1, p1) = rg[i-1], rg[i]
        A += math.radians(l1 - l0) * (2 + math.sin(math.radians(p0)) + math.sin(math.radians(p1)))
    return abs(A) * 6371.0088 ** 2 / 2
def signed(rg):
    return sum(rg[i-1][0] * rg[i][1] - rg[i][0] * rg[i-1][1] for i in range(len(rg))) / 2
def centroid(rg):
    A = signed(rg) or 1e-12; cx = cy = 0
    for i in range(len(rg)):
        x0, y0 = rg[i-1]; x1, y1 = rg[i]; c = x0 * y1 - x1 * y0; cx += (x0 + x1) * c; cy += (y0 + y1) * c
    return cx / (6 * A), cy / (6 * A)
def inside(x, y, rg):
    c = False
    for i in range(len(rg)):
        x0, y0 = rg[i]; x1, y1 = rg[i-1]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0: c = not c
    return c
def simplify(pts, eps):
    if len(pts) < 4: return pts
    a, b = pts[0], pts[-1]; dmax, idx = 0, 0
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1e-9
    for i in range(1, len(pts) - 1):
        p = pts[i]; d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L
        if d > dmax: dmax, idx = d, i
    if dmax > eps: return simplify(pts[:idx + 1], eps)[:-1] + simplify(pts[idx:], eps)
    return [a, b]
def path(rings, eps=.12):
    out = []
    for rg in rings:
        q = [pr(*p) for p in rg]
        if len(q) < 4: continue
        far = max(range(len(q)), key=lambda i: (q[i][0] - q[0][0]) ** 2 + (q[i][1] - q[0][1]) ** 2)
        q = simplify(q[:far + 1], eps)[:-1] + simplify(q[far:], eps)[:-1]
        if len(q) < 3 or abs(signed(q)) < .002: continue
        out.append('M' + 'L'.join(f'{x:.2f},{y:.2f}' for x, y in q) + 'Z')
    return ''.join(out)
def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))
# shapefile 的外環是順時針、洞是逆時針（signed<0 為外環）
def polys(g):
    P = []
    for rg in g:
        if signed(rg) <= 0: P.append([rg])
        elif P: P[-1].append(rg)
        else: P.append([rg])
    return P
# --- 店家 ---
FOOD_A = {'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream'}
FOOD_S = {'beverages', 'bakery', 'deli', 'coffee', 'tea', 'confectionery', 'pastry'}
BEAUTY = {'hairdresser', 'beauty', 'nails', 'massage'}
SERV = {'laundry', 'dry_cleaning', 'tailor', 'photo', 'copyshop'}
NOT_RETAIL = {'car', 'car_repair', 'motorcycle', 'motorcycle_repair', 'vacant', 'tyres', 'car_parts', 'fuel'}
def cat(shop, am):
    if am in FOOD_A or shop in FOOD_S: return 'food'
    if shop in BEAUTY: return 'beauty'
    if shop == 'convenience': return 'conv'
    if shop in SERV: return 'service'
    if shop and shop not in NOT_RETAIL: return 'retail'
    return None
POI = []
for l in open('tools/raw/poi.csv', encoding='utf-8').read().splitlines():
    f = l.split('|')
    if len(f) != 5: continue
    try: lat, lon = float(f[1]), float(f[2])
    except ValueError: continue
    c = cat(f[3], f[4])
    if c: POI.append((lon, lat, c))
grid = collections.defaultdict(list); GS = .01
for p in POI: grid[(int(p[0] / GS), int(p[1] / GS))].append(p)
ST = json.load(open('tools/raw/stations_clean.json', encoding='utf-8'))
KIDX = ['food', 'retail', 'beauty', 'service', 'conv']

out = {c: [] for c in CITY}; unpop = 0
for r, g in V:
    code = r['VILLCODE']; city = r['COUNTYNAME']; dist = city + r['TOWNNAME']
    P = polys(g); outer = [p[0] for p in P]
    area = sum(ring_area_km2(p[0]) - sum(ring_area_km2(h) for h in p[1:]) for p in P)
    big = max(outer, key=lambda rg: abs(signed(rg)))
    cx, cy = centroid(big)
    if not inside(cx, cy, big):   # 凹形村里：改用環上點的平均最近內點
        cx, cy = min(big, key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
    rec = {'id': code, 'd': dist, 'p': path([rg for p in P for rg in p]), 'c': [round(v, 2) for v in pr(cx, cy)]}
    if code in pop and r['VILLNAME']:
        a = pop[code]
        lo = [min(p[0] for p in rg) for rg in outer]; hi = [max(p[0] for p in rg) for rg in outer]
        la = [min(p[1] for p in rg) for rg in outer]; ha = [max(p[1] for p in rg) for rg in outer]
        cnt = [0] * 5
        for gx in range(int(min(lo) / GS), int(max(hi) / GS) + 1):
            for gy in range(int(min(la) / GS), int(max(ha) / GS) + 1):
                for (x, y, c) in grid.get((gx, gy), ()):
                    for p in P:
                        if inside(x, y, p[0]) and not any(inside(x, y, h) for h in p[1:]):
                            cnt[KIDX.index(c)] += 1; break
        near = sorted(ST, key=lambda s: hav((cx, cy), (s['lon'], s['lat'])))
        n0 = near[0]; dm = round(hav((cx, cy), (n0['lon'], n0['lat'])))
        n500 = sum(1 for s in near[:12] if hav((cx, cy), (s['lon'], s['lat'])) <= 500)
        rec.update({'n': r['VILLNAME'], 'pop': a['pop'], 'hh': a['hh'], 'age': a['age'], 'area': round(area, 3),
                    'dens': round(a['pop'] / area) if area > 0 else 0, 'inc': inc.get((dist, norm(r['VILLNAME']))),
                    'st': [n0['n'], n0['k'], dm], 's5': n500, 'poi': cnt})
    else:
        rec['u'] = 1; unpop += 1
    out[city].append(rec)

os.makedirs('villages', exist_ok=True)
meta = {'popYm': YM, 'incYear': IY, 'shp': SHP_DATE, 'osm': '2026-11-20'}
tot = 0
for city, slug in CITY.items():
    st = [{'n': s['n'], 'k': s['k'], 'd': s['d'], 'xy': [round(v, 2) for v in pr(s['lon'], s['lat'])]} for s in ST if s['d'].startswith(city)]
    data = {'meta': meta, 'city': city, 'list': out[city], 'stations': st}
    js = ('/* 自動產生：tools/build_villages.py。村里界：內政部國土測繪中心（%s 版）；人口：內政部戶政司 ODRP014（民國 %s）；所得：財政部財政資訊中心 %s 年度；'
          '車站與店家：© OpenStreetMap contributors（ODbL），店家登錄不完整。 */\n' % (SHP_DATE, YM, IY) +
          'window.SSS_VILL = window.SSS_VILL || {};\nwindow.SSS_VILL[' + json.dumps(city, ensure_ascii=False) + '] = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(f'villages/{slug}.js', 'w', encoding='utf-8', newline='\n').write(js); tot += len(js)
    pp = [v for v in out[city] if 'u' not in v]
    print(city, len(out[city]), '個（有人口', len(pp), '）', len(js) // 1024, 'KB', '所得缺', sum(1 for v in pp if v['inc'] is None), '店家', sum(sum(v['poi']) for v in pp))
print('合計', tot // 1024, 'KB；未編定村里', unpop, '；店家總數', len(POI))
