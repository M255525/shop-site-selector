"""抓內政部戶政司 ODRP014（村里戶數、人口數、單一年齡），彙總到鄉鎮市區。
用法：python tools/fetch_population.py 11510
輸出 tools/raw/pop_<yyymm>.json（只留四縣市）"""
import sys, json, urllib.request, os, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
ym = sys.argv[1] if len(sys.argv) > 1 else '11510'
CITIES = ('臺北市', '新北市', '桃園市', '新竹市', '新竹縣')
base = f'https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP014/{ym}'
rows, page = [], 1
while True:
    with urllib.request.urlopen(f'{base}?page={page}', timeout=60) as r:
        d = json.loads(r.read().decode('utf-8'))
    rows += d.get('responseData', [])
    if page >= int(d.get('totalPage', 1)): break
    page += 1
agg = {}
for x in rows:
    s = x['site_id']
    if not s.startswith(CITIES): continue
    a = agg.setdefault(s, {'hh': 0, 'pop': 0, 'a0_14': 0, 'a15_24': 0, 'a25_44': 0, 'a45_64': 0, 'a65': 0})
    a['hh'] += int(x['household_no']); a['pop'] += int(x['people_total'])
    for k, v in x.items():
        if k.startswith('people_age_') and (k.endswith('_m') or k.endswith('_f')):
            age = k[11:14]
            age = 100 if age == '100' else int(age)
            n = int(v or 0)
            key = 'a0_14' if age <= 14 else 'a15_24' if age <= 24 else 'a25_44' if age <= 44 else 'a45_64' if age <= 64 else 'a65'
            a[key] += n
out = {'yyymm': ym, 'source': '內政部戶政司 ODRP014 村里戶數、單一年齡人口', 'districts': agg}
json.dump(out, open(f'tools/raw/pop_{ym}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(agg), 'districts')
for city in CITIES:
    ks = [k for k in agg if k.startswith(city)]
    print(city, len(ks), sum(agg[k]['pop'] for k in ks))
bad = [k for k, a in agg.items() if a['a0_14']+a['a15_24']+a['a25_44']+a['a45_64']+a['a65'] != a['pop']]
print('age mismatch:', bad[:5])
