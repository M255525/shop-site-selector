"""下載內政部「最小統計區」資料到 tools/raw/segis/（不進版控）
- 最小統計區圖（data.gov.tw 25128，各縣市 SHP zip）
- 統計區人口統計_最小統計區（18681：戶數、人口數）
- 統計區十歲年齡組性別人口統計_最小統計區（18310）
下載網址每次從 data.gov.tw API 取最新的。用法：python tools/fetch_segis.py"""
import sys, io, os, json, urllib.request, zipfile
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
OUT = 'tools/raw/segis'; os.makedirs(OUT, exist_ok=True)
CITY = {'臺北市': 'tpe', '新北市': 'ntpc', '桃園市': 'tyc', '新竹市': 'hsc', '新竹縣': 'hsq'}
UA = {'User-Agent': 'shop-site-selector-build/1.0'}
def fx(s): return str(s).encode('utf-16', 'surrogatepass').decode('utf-16', 'replace')
def res(ds):
    with urllib.request.urlopen(urllib.request.Request(f'https://data.gov.tw/api/v2/rest/dataset/{ds}', headers=UA), timeout=60) as r:
        return [(fx(x.get('resourceDescription', '')), fx(x.get('resourceDownloadUrl', ''))) for x in json.loads(r.read().decode('utf-8'))['result']['distribution']]
def get(url, path):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as r: open(path, 'wb').write(r.read())
    print('ok', path, os.path.getsize(path))
for ds, tag, want in (('25128', 'shp', '最小統計區圖'), ('18681', 'pop', '統計區人口統計_最小統計區'), ('18310', 'age10', '十歲年齡組性別人口統計_最小統計區')):
    for desc, url in res(ds):
        for city, slug in CITY.items():
            if desc.startswith(city) and want in desc:
                path = f'{OUT}/{slug}_{tag}.' + ('zip' if tag == 'shp' else 'xml')
                get(url, path)
                if tag == 'shp':
                    z = zipfile.ZipFile(path); d = f'{OUT}/{slug}_shp'; os.makedirs(d, exist_ok=True)
                    for n in z.namelist():
                        if n.lower().endswith(('.shp', '.dbf', '.prj', '.cpg', '.shx')): open(os.path.join(d, os.path.basename(n)), 'wb').write(z.read(n))
                    print('  ', [os.path.basename(n) for n in z.namelist()])
