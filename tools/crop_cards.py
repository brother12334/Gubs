# Rebuilds public/cards/*.jpg from a 10x7 scan of the deck and a photo of the card back.
# Usage: python3 tools/crop_cards.py <deck-scan.jpg> <card-back.jpg> public/cards
import sys
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance, ImageOps
src, back, out = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert('RGB')
W, H = im.size
gray = np.asarray(im.convert('L'), dtype=float)

def seam(profile, guess, r=30):
    lo = max(1, guess - r); hi = min(len(profile) - 1, guess + r)
    return lo + int(profile[lo:hi].argmin())  # seams are dark lines

# Row seams from full-width brightness, then column seams per row strip.
rowprof = gray.mean(axis=1)
rows = [0] + [seam(rowprof, round(k * H / 7)) for k in range(1, 7)] + [H]
cells = []
for r in range(7):
    strip = gray[rows[r] + 10:rows[r + 1] - 10]
    colprof = strip.mean(axis=0)
    cols = [0] + [seam(colprof, round(k * W / 10)) for k in range(1, 10)] + [W]
    cells.append([(cols[c], rows[r], cols[c + 1], rows[r + 1]) for c in range(10)])

names = [
 ["letter_g","letter_u","letter_b","traveling_merchant","gargok_plague","flash_flood","rumor_of_wasps","gub","-","-"],
 ["-"]*10,
 ["mushroom"]+["-"]*6+["toad_rider","-","-"],
 ["-","velvet_moth","-","lure"]+["-"]*6,
 ["super_lure","-","cyclone","omen_beetle","smahl_thief","lightning","sud_spout","-","-","-"],
 ["single_ring","double_ring","triple_ring","spear","-","-","-","haki_flute","-","scout"],
 ["retreat","feather","-","age_old_cure","-","blindfold","flop_boat","esteemed_elder","cricket_song","-"],
]
OUT = (400, 570)

def smooth(col, k=15):
    # Running median along the edge so stray text pixels don't streak into the margin.
    pad = k // 2
    p = np.pad(col, ((pad, pad), (0, 0)), mode='edge')
    return np.stack([np.median(p[i:i + k], axis=0) for i in range(len(col))])

def add_margin(card, side=.055, top=.04):
    # The scan is cropped right up to the printed content. Recreate the card's border by
    # continuing each edge's paper/band colour outward, so nothing sits on the card edge.
    a = np.asarray(card, dtype=float)
    h, w, _ = a.shape
    px, py = round(w * side), round(h * top)
    edge = 10
    left = smooth(np.percentile(a[:, :edge], 85, axis=1), 21)
    right = smooth(np.percentile(a[:, -edge:], 85, axis=1), 21)
    out = np.zeros((h + 2 * py, w + 2 * px, 3))
    out[py:py + h, px:px + w] = a
    out[py:py + h, :px] = left[:, None, :]
    out[py:py + h, px + w:] = right[:, None, :]
    full_w = w + 2 * px
    # Titles can touch the top edge, so sample a deeper strip and keep only the paper.
    topc = smooth(np.percentile(out[py:py + 3 * edge], 92, axis=0), 41)
    botc = smooth(np.percentile(out[py + h - edge:py + h], 80, axis=0), 21)
    out[:py] = topc[None]
    out[py + h:] = botc[None]
    # A little paper grain so the margin matches the scanned texture.
    noise = np.random.default_rng(len(a)).normal(0, 3.5, out.shape)
    mask = np.ones(out.shape[:2], bool); mask[py:py + h, px:px + w] = False
    out[mask] += noise[mask]
    return Image.fromarray(np.clip(out, 0, 255).astype('uint8'))

def clean(card):
    a = np.asarray(card, dtype=float)
    # Levels per channel: paper -> clean cream-white, ink -> solid dark. No blurring, so small text survives.
    lo = np.percentile(a.reshape(-1, 3), 0.8, axis=0)
    hi = np.percentile(a.reshape(-1, 3), 96.5, axis=0)
    a = np.clip((a - lo) / np.maximum(hi - lo, 1), 0, 1)
    a = a ** 1.08  # keep midtones from washing out
    card = Image.fromarray((a * 255).astype('uint8'))
    card = ImageEnhance.Color(card).enhance(1.12)
    card = card.resize(OUT, Image.LANCZOS)
    card = card.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=3))
    return card

for r, row in enumerate(names):
    for c, n in enumerate(row):
        if n == '-': continue
        x0, y0, x1, y1 = cells[r][c]
        # Trim the dark seam and any bleed from the neighbouring card.
        ix, iy = 4, 4
        clean(add_margin(im.crop((x0 + ix, y0 + iy, x1 - ix, y1 - iy)))).save(f'{out}/{n}.jpg', quality=88)

# Card back photo: trim its rounded scan corners so it reads as a square card.
b = Image.open(back).convert('RGB')
bw, bh = b.size
b = b.crop((int(bw * .03), int(bh * .025), int(bw * .97), int(bh * .975)))
clean(b).save(f'{out}/back.jpg', quality=88)
print('rows', rows)
