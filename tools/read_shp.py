"""最小 shapefile 讀取（Polygon，type 5）＋DBF，不依賴第三方套件"""
import struct
def read_dbf(path, enc='utf-8'):
    b = open(path, 'rb').read()
    n, hlen, rlen = struct.unpack('<IHH', b[4:12])
    fields = []; p = 32
    while b[p] != 0x0D:
        name = b[p:p+11].split(b'\0')[0].decode('ascii'); ln = b[p+16]; fields.append((name, ln)); p += 32
    out = []
    for i in range(n):
        r = b[hlen + i*rlen: hlen + (i+1)*rlen]; o = 1; rec = {}
        for name, ln in fields:
            rec[name] = r[o:o+ln].decode(enc, 'replace').strip(); o += ln
        out.append(rec)
    return out
def read_shp(path):
    b = open(path, 'rb').read(); p = 100; shapes = []
    while p < len(b):
        clen = struct.unpack('>I', b[p+4:p+8])[0] * 2; c = b[p+8:p+8+clen]; p += 8 + clen
        st = struct.unpack('<i', c[:4])[0]
        if st == 0: shapes.append([]); continue
        nparts, npts = struct.unpack('<ii', c[36:44])
        parts = list(struct.unpack('<%di' % nparts, c[44:44+4*nparts])) + [npts]
        xy = struct.unpack('<%dd' % (2*npts), c[44+4*nparts:44+4*nparts+16*npts])
        pts = [(xy[2*k], xy[2*k+1]) for k in range(npts)]
        shapes.append([pts[parts[k]:parts[k+1]] for k in range(nparts)])
    return shapes
