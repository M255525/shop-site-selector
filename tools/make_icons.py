# 產生 PWA 圖示：藍曬圖底＋白色格線＋紅色圖釘
import os
from PIL import Image, ImageDraw
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
def draw(size, pad):
    s = 4 * size
    im = Image.new('RGB', (s, s), '#1b4f86'); d = ImageDraw.Draw(im)
    for i in range(0, s, s // 10): d.line([(i, 0), (i, s)], fill='#2f6299', width=max(2, s // 300)); d.line([(0, i), (s, i)], fill='#2f6299', width=max(2, s // 300))
    x0, x1 = pad * s, (1 - pad) * s; w = x1 - x0
    # 街廓
    d.rectangle([x0 + w*.08, x0 + w*.52, x0 + w*.42, x0 + w*.9], outline='#e9f1fb', width=int(s*.018))
    d.rectangle([x0 + w*.56, x0 + w*.6, x0 + w*.92, x0 + w*.9], outline='#e9f1fb', width=int(s*.018))
    d.line([(x0 + w*.02, x0 + w*.46), (x1 - w*.02, x0 + w*.46)], fill='#a9c4e6', width=int(s*.012))
    # 圖釘
    cx, cy, r = x0 + w*.5, x0 + w*.3, w*.2
    d.polygon([(cx - r*.62, cy + r*.55), (cx + r*.62, cy + r*.55), (cx, cy + r*1.9)], fill='#c8372d')
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#c8372d')
    d.ellipse([cx - r*.42, cy - r*.42, cx + r*.42, cy + r*.42], fill='#f8f5ec')
    return im.resize((size, size), Image.LANCZOS)
draw(192, .08).save(os.path.join(out, 'icon-192.png'))
draw(512, .08).save(os.path.join(out, 'icon-512.png'))
draw(512, .2).save(os.path.join(out, 'icon-maskable-512.png'))
print('ok')
