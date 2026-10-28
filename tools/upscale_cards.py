# Rebuilds public/cards/<key>.jpg from a 10x7 scan of the deck using the Real-ESRGAN x4plus model
# (run on CPU through ncnn), so each card keeps its real printed lettering at a usable resolution.
#
# Setup:  pip install ncnn pillow numpy
#         download realesrgan-ncnn-vulkan-20220424-ubuntu.zip from
#         https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0 and unzip its models/ folder
# Usage:  python3 tools/upscale_cards.py <deck-scan.jpg> <card-back.jpg> <models-dir> public/cards [key ...]
import sys
import numpy as np
import ncnn
from PIL import Image, ImageFilter

src, back, models, out = sys.argv[1:5]
only = set(sys.argv[5:])
OUT_W, OUT_H = 600, 838  # 63 x 88 mm card proportions

POS = {
    'letter_g': (0, 0), 'letter_u': (0, 1), 'letter_b': (0, 2), 'traveling_merchant': (0, 3),
    'gargok_plague': (0, 4), 'flash_flood': (0, 5), 'rumor_of_wasps': (0, 6), 'gub': (0, 7),
    'mushroom': (2, 0), 'toad_rider': (2, 7), 'velvet_moth': (3, 1), 'lure': (3, 3),
    'super_lure': (4, 0), 'cyclone': (4, 2), 'omen_beetle': (4, 3), 'smahl_thief': (4, 4),
    'lightning': (4, 5), 'sud_spout': (4, 6), 'single_ring': (5, 0), 'double_ring': (5, 1),
    'triple_ring': (5, 2), 'spear': (5, 3), 'haki_flute': (5, 7), 'scout': (5, 9),
    'retreat': (6, 0), 'feather': (6, 1), 'age_old_cure': (6, 3), 'blindfold': (6, 5),
    'flop_boat': (6, 6), 'esteemed_elder': (6, 7), 'cricket_song': (6, 8),
}

im = Image.open(src).convert('RGB')
W, H = im.size
gray = np.asarray(im.convert('L'), dtype=float)

def seam(profile, guess, r=30):
    lo = max(1, guess - r); hi = min(len(profile) - 1, guess + r)
    return lo + int(profile[lo:hi].argmin())  # seams between cards are dark lines

rows = [0] + [seam(gray.mean(axis=1), round(k * H / 7)) for k in range(1, 7)] + [H]
cells = []
for r in range(7):
    colprof = gray[rows[r] + 10:rows[r + 1] - 10].mean(axis=0)
    cols = [0] + [seam(colprof, round(k * W / 10)) for k in range(1, 10)] + [W]
    cells.append([(cols[c], rows[r], cols[c + 1], rows[r + 1]) for c in range(10)])

net = ncnn.Net()
net.opt.use_vulkan_compute = False
net.opt.num_threads = 4
net.load_param(f'{models}/realesrgan-x4plus.param')
net.load_model(f'{models}/realesrgan-x4plus.bin')

def upscale(img, tile=128, pad=10):
    a = np.asarray(img, dtype=np.float32) / 255
    h, w, _ = a.shape
    res = np.zeros((h * 4, w * 4, 3), np.float32)
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            y0, x0 = max(0, y - pad), max(0, x - pad)
            y1, x1 = min(h, y + tile + pad), min(w, x + tile + pad)
            # ncnn.Mat borrows the numpy buffer, so keep the tile alive and copy the result out.
            tile_in = np.ascontiguousarray(a[y0:y1, x0:x1].transpose(2, 0, 1))
            mat_in = ncnn.Mat(tile_in).clone()
            ex = net.create_extractor()
            ex.input('data', mat_in)
            _, o = ex.extract('output')
            o = np.array(o, copy=True).transpose(1, 2, 0)
            th, tw = (min(h, y + tile) - y) * 4, (min(w, x + tile) - x) * 4
            res[y * 4:y * 4 + th, x * 4:x * 4 + tw] = o[(y - y0) * 4:(y - y0) * 4 + th, (x - x0) * 4:(x - x0) * 4 + tw]
    return np.clip(res, 0, 1)

def even_paper(a):
    # Take out part of the scan's yellow/grey cast, estimated from the brightest paper pixels.
    lum = a.mean(axis=2)
    paper = np.median(a[lum >= np.percentile(lum, 92)], axis=0)
    target = np.array([.965, .95, .91])  # warm off-white card stock
    return np.clip(a * (target / np.maximum(paper, .6)), 0, 1)

def smooth(col, k):
    p = k // 2
    q = np.pad(col, ((p, p), (0, 0)), mode='edge')
    c = np.cumsum(q, axis=0); c = np.vstack([np.zeros((1, 3)), c])
    return (c[k:] - c[:-k]) / k  # running mean

def add_border(a, side=.03, top=.022, bottom=.018):
    # The scan trims each card's outer edge; rebuild it by continuing the paper/band colours.
    h, w, _ = a.shape
    px, pt, pb = round(w * side), round(h * top), round(h * bottom)
    e = max(6, w // 60)
    left = smooth(np.percentile(a[:, :e], 80, axis=1), 61)
    right = smooth(np.percentile(a[:, -e:], 80, axis=1), 61)
    outa = np.zeros((h + pt + pb, w + 2 * px, 3))
    outa[pt:pt + h, px:px + w] = a
    outa[pt:pt + h, :px] = left[:, None]
    outa[pt:pt + h, px + w:] = right[:, None]
    topc = smooth(np.percentile(outa[pt:pt + 3 * e], 92, axis=0), 121)
    botc = smooth(np.percentile(outa[pt + h - e:pt + h], 75, axis=0), 61)
    outa[:pt] = topc[None]
    outa[pt + h:] = botc[None]
    rng = np.random.default_rng(h)
    mask = np.ones(outa.shape[:2], bool); mask[pt:pt + h, px:px + w] = False
    outa[mask] += rng.normal(0, .008, outa.shape)[mask]  # faint grain like the printed stock
    return np.clip(outa, 0, 1)

for key, (r, c) in POS.items():
    if only and key not in only:
        continue
    x0, y0, x1, y1 = cells[r][c]
    card = im.crop((x0 + 3, y0 + 3, x1 - 3, y1 - 3)).filter(ImageFilter.GaussianBlur(.45))
    a = add_border(even_paper(upscale(card)))
    Image.fromarray((a * 255 + .5).astype('uint8')).resize((OUT_W, OUT_H), Image.LANCZOS).save(f'{out}/{key}.jpg', quality=88)
    print('done', key, flush=True)

if not only:
    b = Image.open(back).convert('RGB')
    bw, bh = b.size
    b.crop((int(bw * .03), int(bh * .025), int(bw * .97), int(bh * .975))).resize((OUT_W, OUT_H), Image.LANCZOS).save(f'{out}/back.jpg', quality=88)
