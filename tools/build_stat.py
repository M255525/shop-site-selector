"""最小統計區 → stat/<鄉鎮市區代碼>.js（每區一檔，畫面切到「最小統計區」才載入）
來源：內政部統計處 最小統計區圖（SHP，TWD97 TM2 公尺座標）、統計區人口統計／十歲年齡組（113 年 12 月）、
      村里（所屬里與所得，取自 villages/*.js 的建置資料）、OpenStreetMap 車站與店家
用法：python tools/build_stat.py"""
import sys, io, os, re, json, math, glob, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from read_shp import read_dbf, read_shp
CITY = {'tpe': '臺北市', 'ntpc': '新北市', 'tyc': '桃園市', 'hsc': '新竹市', 'hsq': '新竹縣'}
PJ = json.load(open('tools/raw/proj.json'))
def pr(lon, lat): return ((lon - PJ['minx']) * PJ['K'] * PJ['S'], (PJ['maxy'] - lat) * PJ['S'])

# --- TWD97 TM2（中央經線 121°、k0=0.9999、東偏 250000）反算經緯度 ---
A = 6378137.0; F = 1 / 298.257222101; K0 = 0.9999; L0 = math.radians(121); E0 = 250000.0
E2 = F * (2 - F); EP2 = E2 / (1 - E2); E1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
def tm2_ll(x, y):
    M = y / K0; mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256))
    p1 = mu + (3 * E1 / 2 - 27 * E1 ** 3 / 32) * math.sin(2 * mu) + (21 * E1 ** 2 / 16 - 55 * E1 ** 4 / 32) * math.sin(4 * mu) + (151 * E1 ** 3 / 96) * math.sin(6 * mu) + (1097 * E1 ** 4 / 512) * math.sin(8 * mu)
    s, c, t = math.sin(p1), math.cos(p1), math.tan(p1)
    C1 = EP2 * c * c; T1 = t * t; N1 = A / math.sqrt(1 - E2 * s * s); R1 = A * (1 - E2) / (1 - E2 * s * s) ** 1.5; D = (x - E0) / (N1 * K0)
    lat = p1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6 / 720)
    lon = L0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5 / 120) / c
    return math.degrees(lon), math.degrees(lat)

def signed(rg): return sum(rg[i-1][0] * rg[i][1] - rg[i][0] * rg[i-1][1] for i in range(len(rg))) / 2
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
def path(rings, eps=.04):
    out = []
    for q in rings:
        if len(q) < 4: continue
        far = max(range(len(q)), key=lambda i: (q[i][0] - q[0][0]) ** 2 + (q[i][1] - q[0][1]) ** 2)
        q = simplify(q[:far + 1], eps)[:-1] + simplify(q[far:], eps)[:-1]
        if len(q) < 3 or abs(signed(q)) < .0005: continue
        out.append('M' + 'L'.join(f'{x:.2f},{y:.2f}' for x, y in q) + 'Z')
    return ''.join(out)
def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))
def xmlrows(path, keys):
    t = open(path, encoding='utf-8').read(); out = {}
    for blk in re.findall(r'<RowData>(.*?)</RowData>', t, re.S):
        d = dict(re.findall(r'<(\w+)>([^<]*)</\1>', blk)); out[d['CODEBASE']] = {k: int(float(d.get(k) or 0)) for k in keys}
        out[d['CODEBASE']]['_t'] = d.get('INFO_TIME', '')
    return out
AGE10 = ['A0A9_CNT', 'A10A19_CNT', 'A20A29_CNT', 'A30A39_CNT', 'A40A49_CNT', 'A50A59_CNT', 'A60A69_CNT', 'A70A79_CNT', 'A80A89_CNT', 'A90A99_CNT', 'A100UP_10_CNT']

# --- 村里（所屬里、所得）：從 villages/*.js 讀已建好的資料，用村里界多邊形判斷 ---
VIL = {}
for f in glob.glob('villages/*.js'):
    t = open(f, encoding='utf-8').read(); js = t[t.index('] = ') + 4: t.rindex(';')]
    d = json.loads(js)
    for v in d['list']:
        if v.get('u'): continue
        VIL.setdefault(v['d'], []).append(v)
def parse_path(p):
    rings = []
    for seg in p.split('M')[1:]:
        rings.append([tuple(map(float, xy.split(','))) for xy in seg.rstrip('Z').split('L')])
    return rings
VPOLY = {d: [(v, parse_path(v['p'])) for v in vs] for d, vs in VIL.items()}
def which_village(dist, mx, my):
    best = None
    for v, rings in VPOLY.get(dist, []):
        if any(inside(mx, my, rg) for rg in rings): return v
    # 落在簡化邊界縫隙：取中心點最近的里
    for v, rings in VPOLY.get(dist, []):
        d = (v['c'][0] - mx) ** 2 + (v['c'][1] - my) ** 2
        if best is None or d < best[0]: best = (d, v)
    return best[1] if best else None
TOWN = {}
for v in sum(VIL.values(), []): TOWN[v['id'][:8]] = v['d']

# --- 店家與車站 ---
FOOD_A = {'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream'}
FOOD_S = {'beverages', 'bakery', 'deli', 'coffee', 'tea', 'confectionery', 'pastry'}
BEAUTY = {'hairdresser', 'beauty', 'nails', 'massage'}; SERV = {'laundry', 'dry_cleaning', 'tailor', 'photo', 'copyshop'}
NOT_RETAIL = {'car', 'car_repair', 'motorcycle', 'motorcycle_repair', 'vacant', 'tyres', 'car_parts', 'fuel'}
KIDX = ['food', 'retail', 'beauty', 'service', 'conv']
def cat(shop, am):
    if am in FOOD_A or shop in FOOD_S: return 0
    if shop in BEAUTY: return 2
    if shop == 'convenience': return 4
    if shop in SERV: return 3
    if shop and shop not in NOT_RETAIL: return 1
    return None
grid = collections.defaultdict(list); GS = .005
for l in open('tools/raw/poi.csv', encoding='utf-8').read().splitlines():
    f = l.split('|')
    if len(f) != 5: continue
    try: lat, lon = float(f[1]), float(f[2])
    except ValueError: continue
    c = cat(f[3], f[4])
    if c is not None: grid[(int(lon / GS), int(lat / GS))].append((lon, lat, c))
ST = json.load(open('tools/raw/stations_clean.json', encoding='utf-8'))
RAD = 300.0

os.makedirs('stat', exist_ok=True)
for f in glob.glob('stat/*.js'): os.remove(f)
out = collections.defaultdict(list); info = {}
for slug, city in CITY.items():
    shp = glob.glob(f'tools/raw/segis/{slug}_shp/*.shp')[0]
    R = read_dbf(shp[:-4] + '.dbf', enc='latin-1'); G = read_shp(shp)
    pop = xmlrows(f'tools/raw/segis/{slug}_pop.xml', ['H_CNT', 'P_CNT'])
    age = xmlrows(f'tools/raw/segis/{slug}_age10.xml', AGE10)
    info[city] = sorted({p['_t'] for p in pop.values()})
    n0 = 0
    for r, g in zip(R, G):
        code = r['CODEBASE']; dist = TOWN.get(r['TOWN_ID'])
        if not dist or not g: continue
        rings_ll = [[tm2_ll(x, y) for x, y in rg] for rg in g]
        rings_m = [[pr(lo, la) for lo, la in rg] for rg in rings_ll]
        cx, cy = tm2_ll(float(r['X']), float(r['Y']))
        mx, my = pr(cx, cy)
        p = pop.get(code, {'H_CNT': 0, 'P_CNT': 0}); a = age.get(code)
        area = float(r['AREA'] or 0) / 1e6
        rec = {'id': code, 'p': path(rings_m), 'c': [round(mx, 2), round(my, 2)]}
        if p['P_CNT'] <= 0 or not a:
            rec['u'] = 1; out[dist].append(rec); continue
        a10 = [a[k] for k in AGE10]
        a6 = [a10[0], a10[1], a10[2], a10[3] + a10[4], a10[5], sum(a10[6:])]   # 0–9、10–19、20–29、30–49、50–59、60+
        v = which_village(dist, mx, my)
        cnt = [0] * 5
        gx0, gy0 = int(cx / GS), int(cy / GS)
        for gx in range(gx0 - 1, gx0 + 2):
            for gy in range(gy0 - 1, gy0 + 2):
                for (x, y, c) in grid.get((gx, gy), ()):
                    if abs(x - cx) < .0035 and abs(y - cy) < .003 and hav((cx, cy), (x, y)) <= RAD: cnt[c] += 1
        near = min(ST, key=lambda s: (s['lon'] - cx) ** 2 + (s['lat'] - cy) ** 2)
        dm = round(hav((cx, cy), (near['lon'], near['lat'])))
        rec.update({'pop': p['P_CNT'], 'hh': p['H_CNT'], 'a6': a6, 'area': round(area, 4), 'dens': round(p['P_CNT'] / area) if area > 0 else 0,
                    'vl': v['id'] if v else '', 'vn': v['n'] if v else '', 'inc': v['inc'] if v else None,
                    'st': [near['n'], near['k'], dm], 'poi': cnt, 'r3': 1})
        if sum(a6) != p['P_CNT']: n0 += 1
        out[dist].append(rec)
    print(city, len(R), '個；年齡加總≠人口', n0, '；資料時間', info[city])
meta = {'time': sorted({t for v in info.values() for t in v}), 'radius': RAD, 'osm': '2026-11-20'}
tot = 0; sizes = []
for dist, lst in out.items():
    # 編號：同一里內依人口排序，給「XX里 第 n 塊」好認的名字
    byv = collections.defaultdict(list)
    for x in lst:
        if not x.get('u'): byv[x['vl']].append(x)
    for vl, xs in byv.items():
        for i, x in enumerate(sorted(xs, key=lambda z: z['id'])): x['n'] = (x['vn'] or '') + '・' + str(i + 1)
    code = lst[0]['id'][:5] if lst else ''
    tc = [k for k, v in TOWN.items() if v == dist][0]
    js = ('/* 自動產生：tools/build_stat.py。最小統計區圖與人口：內政部統計處（%s）；所屬里與所得：內政部村里界、財政部 112 年度；車站與店家：© OpenStreetMap contributors（ODbL），店家為半徑 %d 公尺內登錄數，不完整。 */\n' % ('、'.join(meta['time']), RAD) +
          'window.SSS_STAT = window.SSS_STAT || {};\nwindow.SSS_STAT[' + json.dumps(dist, ensure_ascii=False) + '] = ' + json.dumps({'meta': meta, 'd': dist, 'list': lst}, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(f'stat/{tc}.js', 'w', encoding='utf-8', newline='\n').write(js); tot += len(js); sizes.append((len(js) // 1024, dist))
json.dump({k: v for k, v in TOWN.items()}, open('tools/raw/town_codes.json', 'w', encoding='utf-8'), ensure_ascii=False)
sizes.sort()
print('檔案', len(sizes), '個，合計', tot // 1024, 'KB；最大', sizes[-3:], '最小', sizes[:2])
