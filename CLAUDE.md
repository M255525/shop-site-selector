# shop-site-selector — 開店選址評估

台北市、新北市、桃園市、新竹市、新竹縣 70 個行政區＋2,339 個村里＋49,424 個最小統計區：先依店型、客群、月租預算排出適合開店的區域，再細到街區（村里），最後比較實地看過的候選店面，附人流計數器與看店檢查清單。分數全部規則式；另有選用的 BYOK AI 助手（`ai.js`，只解讀不打分）。

- 純靜態：`index.html`（CSS）＋`districts_data.js`（產出檔，70 區資料）＋`map_data.js`（產出檔，SVG 界線）＋`villages/<tpe|ntpc|tyc|hsc|hsq>.js`（產出檔，每縣市一檔，進「🏘 街區」或店面選了區才 `loadCity()` 動態載入，共約 1.6 MB）＋`stat/<鄉鎮市區代碼8碼>.js`（產出檔，最小統計區，每區一檔、選到那區且切到「最小統計區」才 `loadStat()`，共約 20 MB、最大中壢 835 KB）＋`data.js`（規則引擎，node 也能 require）＋`app.js`（畫面）＋`ui.js`（縮放、連動高亮）＋`ai.js`（AI 助手）＋`watermark.js`＋`manual.html`＋PWA。
- 本機預覽 port **8898**（`.claude/launch.json` 的 `shop-site-selector`）。visitor-badge `m255525.shopsiteselector`。
- 尚未部署（上線前先問使用者）。

## 資料（逐項標來源，改了要同步 manual、警語、報告文字）
- 人口／戶數／年齡：內政部戶政司 ODRP014（村里、單一年齡）民國 115 年 10 月，彙總到區。`tools/fetch_population.py`。
- 所得：財政部財政資訊中心 `165-9.csv` 112 年度，取各區「合計」列中位數（千元／納稅單位）。113 年度 2026-11 還沒發布（404）。
- 界線：taiwan-atlas@1.0.0 `towns-10t.json`（內政部國土測繪中心），`tools/build_map.py` 只留四縣市、Douglas-Peucker 簡化；**封閉環要先在最遠點切兩段再簡化**，否則整環縮成兩點。
- 車站：OpenStreetMap Overpass（ODbL，要標 © OpenStreetMap contributors），`tools/count_stations.py` 用未簡化界線做點在多邊形；排除 Skytrain、烏來台車；「台北車站」不可去掉「站」字。
- 面積：界線算的球面面積（大安 11.35 vs 官方 11.36；山區誤差數 %），標「概略」。
- **租金級距（1 低～4 高）與區域性質 tags 是自行整理**，寫在 `tools/build_data.py` 的 `META`；畫面、手冊、報告都要標「自估／自行整理」，⚙ 可逐區覆寫（`ctx.rentOverride`）。
- **村里（街區）**：`tools/build_villages.py`。村里界用內政部國土測繪中心 TGOS 的「村(里)界(TWD97經緯度).zip」（115-08-17 版，`VILLAGE_NLSC_*.shp`，UTF-8），**taiwan-atlas 的 villages 太舊，少 56 個新設里，不要用**；`tools/read_shp.py` 自寫 shp／dbf 讀取（不裝 pyshp）。村里人口用 VILLCODE 對 ODRP014 `district_code`（2339 個全對上，另有 19 個「未編定村里」畫灰色）；所得用「區＋里名」對 165-9.csv（罕用字 CSV 寫成 `石[曹]里`，比對時拿掉中括號；約 27 個新設里沒有所得）。
- 村里店家：OSM Overpass `shop=*` 與餐飲 `amenity`，用 csv 輸出、分兩塊查（overpass-api.de 常 502/504，換 overpass.kumi.systems）。**台北市登錄遠比其他縣市完整**，所以 `scoreVillages()` 的百分位只在「比較的村里清單」裡算（預設同一區）。分類：food／retail／beauty／service／conv（`POI_K`）。
- 最近車站：村里最大多邊形的形心（凹形改用最近的環上點）到 OSM 車站的直線距離。
- 村里路徑和行政區地圖同一個投影（`tools/raw/proj.json`，由 `build_map.py` 輸出），簡化容差 0.12 單位（約 14 m）；1 單位約 114 m（`M_PER_UNIT`，比例尺用）。
- **最小統計區**：`tools/fetch_segis.py`（從 data.gov.tw API 取最新下載網址：25128 最小統計區圖 SHP、18681 統計區人口統計、18310 十歲年齡組，XML）→ `tools/build_stat.py`。**SHP 座標是 TWD97 TM2 公尺（.prj 寫經緯度是錯的）**，自寫反算（中央經線 121、k0 0.9999、東偏 250000）；DBF 除新竹市外不是 UTF-8，改用 `TOWN_ID` 對應行政區（取村里代碼前 8 碼）。資料時間 113Y12M（比村里舊，畫面要標）。年齡存 `a6`＝0–9／10–19／20–29／30–49／50–59／60+；所屬里用村里多邊形判斷（`vl`、`vn`、`inc` 用里的）；店家是中心半徑 300 m（`r3:1`，密度除 π·0.3²）。檔案裡**不存 `d`（所屬區）**，app 的 `sData()` 載入後補上。各區統計區人口和 115-10 區人口差 ≤5.4%（兩年人口變動）。
- 重建：`python tools/fetch_sources.py` → `count_stations.py` → `merge_raw.py` → `build_data.py` → `build_map.py` → `build_villages.py`。`tools/raw/` 不進版控。

## 引擎（`data.js`）
- 7 個評分項目 `COMPS`（順序＝圖表類別色順序）：人潮密度、市場規模、客群吻合、消費力、交通、租金負擔、商圈性質；各是 70 區百分位或規則分數，依 `WEIGHTS[店型]` 加權；`ctx.weights` 可自訂。
- 店型 id 與開店前置清單一致（food／retail／online／beauty／service／stall）。
- 街區 `scoreVillages(list, ctx)`：6 項（人潮密度、客群吻合、消費力、離車站 250m＝100／1500m＝0、商業活躍、同業狀況），權重 `VWEIGHTS[店型]`；`explainVillage()` 白話說明。
- 店面 `scoreSite`：人流、能見度、交通、租金負擔（租金／預估月營業額，10%／15% 經驗法則）、競爭、空間，權重 `SITE_W`。
- 一句話設定 `parseText()`（規則式；`新竹北區` 先改寫成 `新竹市北區` 避免被 `竹北` 吃掉；兩字區名要前面有縣市才認）。AI 解析結果也只走 app 的 `applyParsed()` 白名單。
- `tShare(v, 'student'|'worker'|'family'|'senior')` 統一村里（5 段）與統計區（a6）的客群比例。
- 改 `data.js` 跑 `node tools/test_engine.mjs`（1536 種條件組合＋資料完整性＋**每區村里人口加總＝區人口**＋一句話解析＋49,424 塊統計區），端對端 `python tools/e2e_site.py`（自己起伺服器；PDF 用預先載入 html2pdf 再覆寫 `Worker.prototype.save` 取 datauri，輸出到 `tools/raw/e2e_report.pdf`）。

## 畫面
- 藍曬圖底＋米白製圖紙卡、紅圖釘；圖表配色依 dataviz skill 參考色盤，light／dark 兩組都跑過 validator（light 有 4 色對比 <3:1 → 每張圖都有圖例＋提示＋表格版）。
- 地圖圖層 9 種、5 等分位著色；選縣市時 `fitMap()` 改 viewBox 並依比例縮圖釘。
- 街區分頁：村里地圖（9 圖層、車站符號 圓＝捷運／方＝台鐵／菱＝高鐵、比例尺、行政區外框；線寬用 `vector-effect:non-scaling-stroke`）、村里卡、排名、街區定位圖（離車站 × 密度，座標軸依該區資料自動調整）、數據表；店面可選「所在里」（`site.village`）。
- **PDF：html2canvas 不吃 SVG viewBox**，`svgToImg()` 先把報告地圖轉 PNG。列印直接用 SVG。
- localStorage 前綴 `sss.`；`<html>` 字體屬性叫 `data-fsize`，按鈕用 `data-fontsize`（避開 `closest()` 撞名）。
- 範例模式不寫入 localStorage；分享 `#s=`（ctx＋店面，不含人流與勾選）。
- 接力：店面卡「➜ 帶到開店前置清單」開 `https://m255525.github.io/shop-opening-checklist/#s=`（org 先帶 sole、sales＝預估月營業額）。
- 上線改版：升 `service-worker.js` 的 `CACHE_NAME`，並同步改 `index.html` 七個 `?v=` 版本號與 `app.js` 的 `VER`（村里、統計區檔版本）。
- 測試掛鉤 `window._sss`。

## 互動（`ui.js`，2026-11-20 使用者要求「UI/UX 優化、加強互動」）
- 地圖縮放：`[data-zoom] svg` 由 `after()`（每次 render 後呼叫）掛上滾輪／拖曳／兩指／雙擊與＋－⟲；縮放狀態以 `data-zkey` 記在 `Z`，重畫後還原。**會保持大小的符號用 `zPin()` 產生（`data-x/y/k0`）**，`rescale()` 依 viewBox 寬重設 transform；線寬一律 `vector-effect:non-scaling-stroke`。拖曳後的那一下 click 會被吃掉（`svg._moved`）。
- 連動高亮：pointerover 找 `[data-d]`／`[data-v]`，同 id 的 `path.t,.rrow,.dot,tbody tr,.pin` 加 `.hl`。
- 圖例按鈕 `data-bin`／`data-binmap` → `V.binF`，路徑有 `data-b`，不符的加 `.dim`。
- 定位圖（）兩軸可調（2026-11-20 使用者要求）：（只在這次瀏覽，換區／換層級清掉）；輸入框 、快選 、對數／線性 、；刻度 ／（1-2-5）；點用 clipPath 裁切、範圍外不畫並計數。**拖曳框選**：svg 的  存比例參數，pointerup 換算資料範圍；框選後 400ms 內的 click 會被吃掉（，因為重畫後 svg 已換掉）。
- 其他：分頁＝步驟條（完成打 ✓、sticky）、條件卡可收合（`sss.condFold`）、一句話輸入、預算滑桿、找區／找里（datalist）、↑↓ 鍵、行政區比較（`S.cmp` 最多 3、底部 `#cmpTray`、`openCompare()` 雷達）、刪除店面可復原（toast 按鈕）、每頁 `nextCta()`、匯出選單 `details.menu`。拖滑桿用 `softRender()` 保留捲動與焦點。

## AI（`ai.js`，BYOK 7 家，服務商與 `callLLM` 複製自開店前置清單）
- 設定存 `sss.ai`（不在備份檔裡）；⚙ 有「🤖 AI 設定」區，頁首「🤖 AI 設定」直接打開。
- 功能：一句話理解（JSON 白名單）、解讀行政區／街區、比較行政區、比較店面＋議價、看店問題、📷 看店面照片（壓到 1280px JPEG，回 JSON `vis/front_m/floor/cond`，`cleanPhoto()` 過濾後才能套用）。沒金鑰：一句話走規則，其餘顯示提示詞可複製。
- `RULES` 要求不得編造數字、店名、地址，不得重新打分。
- 測試：e2e 改寫 `window.fetch` 模擬 Gemini，檢查金鑰在 header、JSON 模式、照片 inline_data、套用結果。真實金鑰未實測。

## 浮水印（使用者要求下載 PDF 與列印都要有）
- 下載 PDF：每頁 `addImage`（e2e 檢查每頁都有圖）。
- 列印：`#pdfWatermark` 在 `@media print` 用 `z-index:50`＋`opacity:.11` 疊在報告**上面**（原本 `z-index:-1` 被報告白底蓋住看不到）；`beforeprint` 會自動填報告，所以用瀏覽器選單列印也有。e2e 用 `page.pdf()` 驗證每頁都有浮水印圖。

## 標準配備
跑馬燈（工作區公告 GAS，不可關）、⚙ 常用設定收合式＋關於本工具、首訪警語＋頁面入口、`manual.html#creator` 完整版（改 `tools/manual_body.html` 後跑 `tools/build_manual.py`）、PWA（`tools/make_icons.py`）、訪客計數器。

## 未驗證
人流計數器在手機實地使用（震動提醒、螢幕常亮）未實測。
