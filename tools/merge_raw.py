"""合併人口（ODRP014）、所得（財政部 165-9 合計列）、車站、面積 → tools/raw/merged.json"""
import json, io, sys, math, csv
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
YM = '11510'; IY = '112'
pop = json.load(open(f'tools/raw/pop_{YM}.json', encoding='utf-8'))['districts']
st = json.load(open('tools/raw/stations_by_district.json', encoding='utf-8'))
inc = {}
for r in csv.reader(open(f'tools/raw/inc_{IY}.csv', encoding='utf-8-sig')):
    if len(r) > 6 and r[1] == '合計': inc[r[0].replace('台', '臺')] = {'units': int(r[2]), 'avg': int(r[4]), 'med': int(r[5])}
# 面積：界線多邊形在等面積近似下計算（km²）
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
def area(rg):
    R = 6371.0088; A = 0
    for i in range(len(rg)):
        (l0, p0), (l1, p1) = rg[i-1], rg[i]
        A += math.radians(l1-l0) * (2 + math.sin(math.radians(p0)) + math.sin(math.radians(p1)))
    return abs(A) * R * R / 2
WANT = {'台北市': '臺北市', '臺北市': '臺北市', '新北市': '新北市', '桃園市': '桃園市', '新竹市': '新竹市', '新竹縣': '新竹縣'}
ar = {}
for g in T['objects']['towns']['geometries']:
    pc = g['properties']
    if pc['COUNTYNAME'] not in WANT: continue
    P = [g['arcs']] if g['type'] == 'Polygon' else g['arcs']
    ar[WANT[pc['COUNTYNAME']] + pc['TOWNNAME']] = sum(area(ring(poly[0])) - sum(area(ring(h)) for h in poly[1:]) for poly in P)
out = {}
for n, p in pop.items():
    i = inc.get(n)
    if not i: print('NO INCOME', n)
    out[n] = dict(p, area=round(ar[n], 2), dens=round(p['pop']/ar[n]), inc_med=i['med'], inc_avg=i['avg'], metro=st[n]['metro'], rail=st[n]['rail'], hsr=st[n]['hsr'])
json.dump({'pop_ym': YM, 'inc_year': IY, 'd': out}, open('tools/raw/merged.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('臺北市大安區 area', out['臺北市大安區']['area'], '(官方 11.36)', '新北市烏來區', out['新北市烏來區']['area'], '(官方 321.13)')
for n, d in out.items():
    print(f"{n[:3]}{n[3:]:<5} pop{d['pop']:>7} 密{d['dens']:>6} 中位{d['inc_med']:>4} 65+{d['a65']*100//d['pop']:>3}% 0-14{d['a0_14']*100//d['pop']:>3}% 15-24{d['a15_24']*100//d['pop']:>3}% M{len(d['metro'])} R{len(d['rail'])} H{len(d['hsr'])}")
