"""tools/raw/merged.json（官方統計）＋本檔 META（自行整理：租金級距、商圈性質）→ districts_data.js
用法：python tools/build_data.py"""
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
M = json.load(open('tools/raw/merged.json', encoding='utf-8'))
# 租金級距 r：4 高、3 中高、2 中、1 低（一樓店面行情的相對高低，自行整理、非官方統計）
# 性質 t：core 商業核心｜office 辦公／科技園區｜resi 住宅｜school 學校聚集｜tour 觀光｜night 夜市／夜間人潮｜industry 工業區｜rural 郊區／山區
META = {
 '臺北市大安區': (4, 'core office school night resi'), '臺北市信義區': (4, 'core office tour night'),
 '臺北市中山區': (4, 'core office tour night'), '臺北市松山區': (4, 'core office night resi'),
 '臺北市中正區': (4, 'core office school tour'), '臺北市大同區': (3, 'core tour night resi'),
 '臺北市萬華區': (3, 'core tour night resi'), '臺北市內湖區': (3, 'office resi'),
 '臺北市士林區': (3, 'resi tour night school'), '臺北市文山區': (3, 'resi school'),
 '臺北市南港區': (3, 'office resi'), '臺北市北投區': (3, 'resi tour school'),
 '新北市板橋區': (3, 'core office resi night'), '新北市三重區': (3, 'resi night industry'),
 '新北市中和區': (3, 'resi industry'), '新北市永和區': (3, 'resi night'),
 '新北市新莊區': (3, 'resi school industry'), '新北市新店區': (3, 'resi tour office'),
 '新北市樹林區': (2, 'resi industry'), '新北市鶯歌區': (2, 'tour resi'),
 '新北市三峽區': (2, 'tour school resi'), '新北市淡水區': (2, 'tour school resi night'),
 '新北市汐止區': (2, 'resi office'), '新北市瑞芳區': (1, 'tour rural'),
 '新北市土城區': (2, 'resi industry'), '新北市蘆洲區': (2, 'resi night'),
 '新北市五股區': (2, 'industry resi'), '新北市泰山區': (2, 'resi school industry'),
 '新北市林口區': (2, 'resi school'), '新北市深坑區': (2, 'tour resi'),
 '新北市石碇區': (1, 'rural tour'), '新北市坪林區': (1, 'rural tour'), '新北市三芝區': (1, 'rural tour'),
 '新北市石門區': (1, 'rural tour'), '新北市八里區': (2, 'tour resi'), '新北市平溪區': (1, 'rural tour'),
 '新北市雙溪區': (1, 'rural'), '新北市貢寮區': (1, 'rural tour'), '新北市金山區': (1, 'rural tour'),
 '新北市萬里區': (1, 'rural tour'), '新北市烏來區': (1, 'rural tour'),
 '桃園市桃園區': (3, 'core office resi night'), '桃園市中壢區': (2, 'core school resi night industry'),
 '桃園市大溪區': (2, 'tour resi'), '桃園市楊梅區': (2, 'resi industry'), '桃園市蘆竹區': (2, 'resi industry'),
 '桃園市大園區': (2, 'industry rural'), '桃園市龜山區': (2, 'resi industry school'), '桃園市八德區': (2, 'resi'),
 '桃園市龍潭區': (2, 'resi tour'), '桃園市平鎮區': (2, 'resi industry'), '桃園市新屋區': (1, 'rural industry'),
 '桃園市觀音區': (1, 'rural industry'), '桃園市復興區': (1, 'rural tour'),
 '新竹市東區': (3, 'core office school resi night'), '新竹市北區': (2, 'core resi night tour'),
 '新竹市香山區': (2, 'resi school rural'),
 '新竹縣竹北市': (3, 'core resi office'), '新竹縣竹東鎮': (2, 'resi core'), '新竹縣湖口鄉': (2, 'industry resi'),
 '新竹縣新豐鄉': (2, 'industry resi'), '新竹縣關西鎮': (1, 'rural tour'), '新竹縣新埔鎮': (1, 'rural'),
 '新竹縣芎林鄉': (1, 'rural'), '新竹縣寶山鄉': (1, 'rural'), '新竹縣北埔鄉': (1, 'rural tour'),
 '新竹縣峨眉鄉': (1, 'rural'), '新竹縣橫山鄉': (1, 'rural tour'), '新竹縣尖石鄉': (1, 'rural tour'),
 '新竹縣五峰鄉': (1, 'rural tour'),
}
miss = set(M['d']) - set(META); assert not miss, miss
CITY = ['臺北市', '新北市', '桃園市', '新竹市', '新竹縣']
rows = []
for n, d in sorted(M['d'].items(), key=lambda kv: (CITY.index(kv[0][:3]), -kv[1]['pop'])):
    r, t = META[n]
    rows.append({'id': n, 'city': n[:3], 'name': n[3:], 'pop': d['pop'], 'hh': d['hh'], 'area': d['area'], 'dens': d['dens'],
                 'age': [d['a0_14'], d['a15_24'], d['a25_44'], d['a45_64'], d['a65']], 'inc': d['inc_med'], 'incAvg': d['inc_avg'],
                 'metro': d['metro'], 'rail': d['rail'], 'hsr': d['hsr'], 'rent': r, 'tags': t.split()})
meta = {'popYm': M['pop_ym'], 'incYear': M['inc_year'], 'stationsDate': '2026-11-20'}
js = ('/* 自動產生：tools/build_data.py。人口：內政部戶政司 ODRP014（民國 %s）；所得：財政部財政資訊中心 %s 年度綜稅所得「合計」列（單位千元／納稅單位）；'
      '車站：OpenStreetMap 站點（© OpenStreetMap contributors, ODbL）依內政部界線判斷所在區；面積由界線圖計算；rent、tags 為自行整理。 */\n' % (M['pop_ym'], M['inc_year']) +
      'var SSS_DISTRICTS = ' + json.dumps({'meta': meta, 'list': rows}, ensure_ascii=False, separators=(',', ':')) + ';\n'
      "if(typeof module !== 'undefined') module.exports = SSS_DISTRICTS;\n")
open('districts_data.js', 'w', encoding='utf-8', newline='\n').write(js)
print(len(rows), 'districts,', len(js), 'bytes')
