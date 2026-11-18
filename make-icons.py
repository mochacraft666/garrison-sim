import json, base64, io, os
from PIL import Image
m = {"炎":"yan","萨尔贡":"sargon","维多利亚":"victoria","谢拉格":"kjerag","阿戈尔":"egir","叙拉古":"siracusa",
     "卡西米尔":"kazimierz","乌萨斯":"ursus","伊比利亚":"iberia","莱塔尼亚":"lethania",
     "精准":"preci","迅捷":"swift","灵巧":"skillful","坚守":"stead","助力":"deput","远见":"visi","奇迹":"mira",
     "投资人":"invest","突袭":"raid","不屈":"indom","调和":"mani","协防干员":"empty","独行":"solo","绝技":"sunt","聚合":"doc","奥术":"arcane"}
out={}
for name,key in m.items():
    p=os.path.join('data/raw/icons',key+'.png')
    im=Image.open(p).convert('RGBA')
    # fit into 40x40 keeping aspect
    im.thumbnail((40,40), Image.LANCZOS)
    canvas=Image.new('RGBA',(40,40),(0,0,0,0))
    canvas.paste(im, ((40-im.width)//2,(40-im.height)//2), im)
    b=io.BytesIO(); canvas.save(b,'WEBP',quality=90,method=6)
    out[name]='data:image/webp;base64,'+base64.b64encode(b.getvalue()).decode()
json.dump(out, open('data/covenant-icons.json','w',encoding='utf-8'), ensure_ascii=False)
print('icons', len(out), 'KB', round(os.path.getsize('data/covenant-icons.json')/1024,1))
