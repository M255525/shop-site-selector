# shop-site-selector — 開店選址評估

台北市、新北市、桃園市、新竹市、新竹縣 70 個行政區：先依店型、客群、月租預算排出適合開店的區域（第一層），再比較實地看過的候選店面（第二層），附人流計數器與看店檢查清單。全部規則式，不串 AI。

- 純靜態：`index.html`（CSS）＋`districts_data.js`（產出檔，70 區資料）＋`map_data.js`（產出檔，SVG 界線）＋`data.js`（規則引擎，node 也能 require）＋`app.js`（畫面）＋`watermark.js`＋`manual.html`＋PWA。
- 本機預覽 port **8898**（`.claude/launch.json` 的 `shop-site-selector`）。visitor-badge `m255525.shopsiteselector`。
- 尚未部署（上線前先問使用者）。

## 資料（逐項標來源，改了要同步 manual、警語、報告文字）
- 人口／戶數／年齡：內政部戶政司 ODRP014（村里、單一年齡）民國 115 年 10 月，彙總到區。`tools/fetch_population.py`。
- 所得：財政部財政資訊中心 `165-9.csv` 112 年度，取各區「合計」列中位數（千元／納稅單位）。113 年度 2026-11 還沒發布（404）。
- 界線：taiwan-atlas@1.0.0 `towns-10t.json`（內政部國土測繪中心），`tools/build_map.py` 只留四縣市、Douglas-Peucker 簡化；**封閉環要先在最遠點切兩段再簡化**，否則整環縮成兩點。
- 車站：OpenStreetMap Overpass（ODbL，要標 © OpenStreetMap contributors），`tools/count_stations.py` 用未簡化界線做點在多邊形；排除 Skytrain、烏來台車；「台北車站」不可去掉「站」字。
- 面積：界線算的球面面積（大安 11.35 vs 官方 11.36；山區誤差數 %），標「概略」。
- **租金級距（1 低～4 高）與區域性質 tags 是自行整理**，寫在 `tools/build_data.py` 的 `META`；畫面、手冊、報告都要標「自估／自行整理」，⚙ 可逐區覆寫（`ctx.rentOverride`）。
- 重建：`python tools/fetch_sources.py` → `count_stations.py` → `merge_raw.py` → `build_data.py` → `build_map.py`。`tools/raw/` 不進版控。

## 引擎（`data.js`）
- 7 個評分項目 `COMPS`（順序＝圖表類別色順序）：人潮密度、市場規模、客群吻合、消費力、交通、租金負擔、商圈性質；各是 70 區百分位或規則分數，依 `WEIGHTS[店型]` 加權；`ctx.weights` 可自訂。
- 店型 id 與開店前置清單一致（food／retail／online／beauty／service／stall）。
- 店面 `scoreSite`：人流、能見度、交通、租金負擔（租金／預估月營業額，10%／15% 經驗法則）、競爭、空間，權重 `SITE_W`。
- 改 `data.js` 跑 `node tools/test_engine.mjs`（1536 種條件組合＋資料完整性），端對端 `python tools/e2e_site.py`（自己起伺服器；PDF 用預先載入 html2pdf 再覆寫 `Worker.prototype.save` 取 datauri，輸出到 `tools/raw/e2e_report.pdf`）。

## 畫面
- 藍曬圖底＋米白製圖紙卡、紅圖釘；圖表配色依 dataviz skill 參考色盤，light／dark 兩組都跑過 validator（light 有 4 色對比 <3:1 → 每張圖都有圖例＋提示＋表格版）。
- 地圖圖層 9 種、5 等分位著色；選縣市時 `fitMap()` 改 viewBox 並依比例縮圖釘。
- **PDF：html2canvas 不吃 SVG viewBox**，`svgToImg()` 先把報告地圖轉 PNG。列印直接用 SVG。
- localStorage 前綴 `sss.`；`<html>` 字體屬性叫 `data-fsize`，按鈕用 `data-fontsize`（避開 `closest()` 撞名）。
- 範例模式不寫入 localStorage；分享 `#s=`（ctx＋店面，不含人流與勾選）。
- 接力：店面卡「➜ 帶到開店前置清單」開 `https://m255525.github.io/shop-opening-checklist/#s=`（org 先帶 sole、sales＝預估月營業額）。
- 上線改版：升 `service-worker.js` 的 `CACHE_NAME`，並同步改 `index.html` 五個 `?v=` 版本號。
- 測試掛鉤 `window._sss`。

## 標準配備
跑馬燈（工作區公告 GAS，不可關）、⚙ 常用設定收合式＋關於本工具、首訪警語＋頁面入口、`manual.html#creator` 完整版（改 `tools/manual_body.html` 後跑 `tools/build_manual.py`）、PWA（`tools/make_icons.py`）、訪客計數器。

## 未驗證
人流計數器在手機實地使用（震動提醒、螢幕常亮）未實測。
