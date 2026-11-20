"""重抓原始資料到 tools/raw/（不進版控）。用法：python tools/fetch_sources.py [人口年月 例 11510] [所得年度 例 112]
之後依序跑：count_stations.py → merge_raw.py → build_data.py → build_map.py
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
