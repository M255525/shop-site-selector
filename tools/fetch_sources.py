"""重抓原始資料到 tools/raw/（不進版控）。用法：python tools/fetch_sources.py [人口年月 例 11510] [所得年度 例 112]
之後依序跑：count_stations.py → merge_raw.py → build_data.py → build_map.py → build_villages.py；最小統計區另跑 fetch_segis.py → build_stat.py（要在 build_villages.py 之後）
※ 村里界 shapefile 版本換了要改 build_villages.py 的 SHP、SHP_DATE
※ 換年月／年度要同步改 merge_raw.py 開頭的 YM、IY"""
import sys, io, os, subprocess, urllib.request, urllib.parse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
ym = sys.argv[1] if len(sys.argv) > 1 else '11510'
iy = sys.argv[2] if len(sys.argv) > 2 else '112'
os.makedirs('tools/raw', exist_ok=True)
UA = {'User-Agent': 'shop-site-selector-build/1.0'}
def get(url, path, data=None):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=180) as r: open(path, 'wb').write(r.read())
    print('ok', path, os.path.getsize(path))
get('https://cdn.jsdelivr.net/npm/taiwan-atlas@1.0.0/towns-10t.json', 'tools/raw/towns.json')
get(f'https://www.fia.gov.tw/WEB/fia/ias/ias{iy}/{iy}_165-9.csv', f'tools/raw/inc_{iy}.csv')
q = ('[out:json][timeout:120];(node["railway"="station"](24.45,120.85,25.32,122.02);'
     'node["public_transport"="station"]["train"="yes"](24.45,120.85,25.32,122.02););out body;')
get('https://overpass-api.de/api/interpreter', 'tools/raw/stations.json', urllib.parse.urlencode({'data': q}).encode())
subprocess.run([sys.executable, 'tools/fetch_population.py', ym], check=True)
# 村里人口（全部村里原始列，build_villages.py 用）
import json
rows, page = [], 1
while True:
    with urllib.request.urlopen(f'https://www.ris.gov.tw/rs-opendata/api/v1/datastore/ODRP014/{ym}?page={page}', timeout=60) as r: d = json.loads(r.read().decode('utf-8'))
    rows += d.get('responseData', [])
    if page >= int(d.get('totalPage', 1)): break
    page += 1
json.dump(rows, open(f'tools/raw/odrp014_{ym}_all.json', 'w', encoding='utf-8'), ensure_ascii=False); print('ok 村里人口', len(rows))
# 村里界（內政部國土測繪中心，TGOS）
os.makedirs('tools/raw/vill_shp', exist_ok=True)
get('https://www.tgos.tw/tgos/VirtualDir/Product/a04697c8-64db-450a-a105-3eb471c45abd/' + urllib.parse.quote('村(里)界(TWD97經緯度).zip'), 'tools/raw/vill_shp/vill.zip')
import zipfile
z = zipfile.ZipFile('tools/raw/vill_shp/vill.zip'); [z.extract(n, 'tools/raw/vill_shp') for n in z.namelist() if n.upper().startswith('VILLAGE_NLSC')]
print('村里界檔案', [n for n in z.namelist() if n.upper().startswith('VILLAGE_NLSC')])
# OSM 店家（分兩塊查，伺服器忙就換鏡像）
import time
open('tools/raw/poi.csv', 'w').close()
for part in ('24.45,120.85,24.95,122.02', '24.95,120.85,25.32,122.02'):
    q = ('[out:csv(::type,::lat,::lon,shop,amenity;false;"|")][timeout:300];(nwr["shop"](%s);'
         'nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream)$"](%s););out center;' % (part, part))
    for srv in ('https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
        try:
            req = urllib.request.Request(srv, data=urllib.parse.urlencode({'data': q}).encode(), headers=UA)
            t = urllib.request.urlopen(req, timeout=600).read().decode('utf-8')
            if t.startswith(('node', 'way', 'relation')):
                open('tools/raw/poi.csv', 'a', encoding='utf-8').write(t if t.endswith('\n') else t + '\n'); print('ok poi', part); break
        except Exception as e: print('retry', srv, e); time.sleep(5)
