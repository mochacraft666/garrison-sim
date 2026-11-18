import json, base64, io, os
from PIL import Image

root = os.getcwd()
m = json.load(open(os.path.join(root, 'data/raw/avatar-map.json'), encoding='utf-8'))
out = {}
missing = []
total = 0
for name, cid in m.items():
    p = os.path.join(root, 'data/raw/avatars', cid + '.png')
    if not os.path.exists(p):
        missing.append(name); continue
    im = Image.open(p).convert('RGBA')
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s)//2, (h - s)//2, (w - s)//2 + s, (h - s)//2 + s)).resize((128, 128), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=80, method=6)
    b = buf.getvalue()
    total += len(b)
    out[name] = 'data:image/webp;base64,' + base64.b64encode(b).decode()
json.dump(out, open(os.path.join(root, 'data/avatars.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('avatars', len(out), 'missing', len(missing), missing[:5])
print('webp bytes', total, 'json KB', round(os.path.getsize(os.path.join(root,"data/avatars.json"))/1024, 1))
