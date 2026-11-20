"""端對端：python tools/e2e_site.py（自己起一個本機伺服器，不連正式站）"""
import sys, io, os, threading, http.server, functools, base64, json, socketserver
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H = functools.partial(Q, directory=ROOT)
srv = socketserver.TCPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{port}/index.html'
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1300, 'height': 900})
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(600)
    ok(pg.is_visible('#modal') and '使用警語' in pg.inner_text('#modalBox'), '首訪跳出警語')
    pg.click('[data-act=close]')
    pg.reload(); pg.wait_for_timeout(400)
    ok(not pg.is_visible('#modal'), '第二次不再跳警語')
    ok(pg.locator('#map path.t').count() == 70, '地圖 70 區')
    ok(pg.locator('#map .pin').count() == 10, '10 個圖釘')
    # 條件
    pg.click('[data-type=beauty]'); pg.click('[data-target=family]'); pg.click('[data-city="新竹縣"]'); pg.wait_for_timeout(200)
    ok(pg.locator('#map path.t:not(.out)').count() == 13, '範圍篩選新竹縣 13 區')
    first = pg.locator('.rrow .nm').first.inner_text()
    ok('竹北市' in first, '親子美髮新竹縣第一名竹北：' + first.split()[0])
    # 圖層
    for k in ['dens', 'pop', 'inc', 'young', 'kids', 'old', 'st', 'rent', 'score']:
        pg.click(f'[data-layer={k}]')
    ok(not errs, '切換 9 種圖層無錯誤')
    # 點地圖
    pg.locator('#map path[data-d="新竹縣竹東鎮"]').click(force=True); pg.wait_for_timeout(200)
    ok('竹東鎮' in pg.inner_text('#detail'), '點地圖開區域卡')
    pg.hover('.rrow .stk span >> nth=0'); ok('權重' in pg.inner_text('#tip'), '排名色塊提示')
    pg.click('[data-act=addSiteHere]'); pg.wait_for_timeout(200)
    ok(pg.locator('.site').count() == 1, '新增候選店面')
    sid = pg.get_attribute('.site', 'data-site')
    pg.click('.site details summary')
    for k, v in [('rent', '5'), ('ping', '18'), ('traffic', '300'), ('revenue', '40')]:
        pg.fill(f'[data-sk={k}][data-sid={sid}]', v)
    pg.wait_for_timeout(400)
    ok('12.5%' in pg.inner_text(f'#rv_{sid}'), '租金占比 5/40=12.5%')
    pg.click('[data-act=addSite]'); pg.wait_for_timeout(200)
    ok(pg.locator('.site').count() == 2 and pg.locator('svg polygon[style*="fill-opacity"]').count() == 2, '兩間店面＋雷達')
    # 人流
    pg.click('[data-tab=count]')
    for _ in range(12): pg.click('#tapBtn')
    pg.wait_for_timeout(1200)
    pg.evaluate("() => { window._sss.V.cnt.el = 5*60000; window._sss.V.cnt.run = false; }")
    pg.click('[data-act=tapSave]'); pg.wait_for_timeout(200)
    st = pg.evaluate('() => window._sss.S')
    ok(len(st['sessions']) == 1 and st['sessions'][0]['n'] == 12, '存一筆人流 12 人')
    ok(st['sites'][0]['traffic'] == 144, '人流自動填入 12/5 分×60＝144')
    # 看店清單
    pg.click('[data-tab=check]'); pg.check('[data-chk=zone]'); pg.wait_for_timeout(100)
    ok('1/22' in pg.inner_text('.card.pinned'), '看店清單 1/22')
    # 保存
    pg.reload(); pg.wait_for_timeout(400)
    st = pg.evaluate('() => window._sss.S')
    ok(len(st['sites']) == 2 and st['sites'][0]['checks'].get('zone') == 1, '重新整理後資料還在')
    # 接力網址
    u = pg.evaluate('() => window._sss.checklistUrl(window._sss.S.sites[0])')
    s = u.split('#s=')[1]; s += '=' * (-len(s) % 4)
    c = json.loads(base64.urlsafe_b64decode(s).decode())
    ok(u.startswith('https://m255525.github.io/shop-opening-checklist/') and c['type'] == 'beauty' and c['place'] == 'rent' and c['sales'] == 40 and c['org'] in ('small', 'sole', 'partner', 'ltd', 'corp'), '開店清單接力網址')
    # 分享連結到新頁面
    share = pg.evaluate('() => window._sss.shareUrl()')
    pg2 = b.new_page(); pg2.goto(share); pg2.wait_for_timeout(600)
    if pg2.is_visible('#modal'): pg2.click('[data-act=close]')
    s2 = pg2.evaluate('() => window._sss.S')
    ok(s2['ctx']['type'] == 'beauty' and len(s2['sites']) == 2 and '#s=' not in pg2.url, '分享連結還原')
    pg2.close()
    # 範例不寫入
    before = pg.evaluate("() => localStorage.getItem('sss.state')")
    pg.click('[data-demo=tea]'); pg.wait_for_timeout(200); pg.click('[data-tab=sites]')
    pg.fill('.site [data-sk=rent] >> nth=0', '99'); pg.wait_for_timeout(400)
    ok(pg.evaluate("() => localStorage.getItem('sss.state')") == before, '範例模式不寫入')
    # PDF
    pg.add_script_tag(url='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js')
    pg.wait_for_function('() => window.html2pdf')
    pg.evaluate("""() => { window.__pdf = null; html2pdf.Worker.prototype.save = function(){ return this.then(function(){ window.__pdf = this.prop.pdf.output('datauristring'); }); }; }""")
    pg.click('[data-act=pdf]')
    pg.wait_for_function('() => window.__pdf', timeout=60000)
    data = pg.evaluate('() => window.__pdf'); raw = base64.b64decode(data.split(',')[1])
    open(os.path.join(ROOT, 'tools', 'raw', 'e2e_report.pdf'), 'wb').write(raw)
    ok(raw[:4] == b'%PDF' and len(raw) > 50000, f'PDF 產生 {len(raw)//1024} KB')
    pg.click('[data-act=leaveDemo]')
    # 手機寬度
    m = b.new_page(viewport={'width': 400, 'height': 820})
    m.goto(URL); m.wait_for_timeout(500)
    if m.is_visible('#modal'): m.click('[data-act=close]')
    m.click('[data-demo=salon]')
    for t in ['area', 'sites', 'count', 'check']:
        m.click(f'[data-tab={t}]'); m.wait_for_timeout(150)
        ok(m.evaluate('() => document.documentElement.scrollWidth') <= 400, f'手機 {t} 無橫向捲動')
    ok(not errs, '沒有 JS 錯誤 ' + '; '.join(errs[:3]))
    b.close()
srv.shutdown()
print('全部通過' if not fails else f'{len(fails)} 項失敗')
sys.exit(1 if fails else 0)
