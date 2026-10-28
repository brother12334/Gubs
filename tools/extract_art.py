# Cuts the illustration out of each card in a 10x7 scan of the deck. The card frames
# (title, plaque, colour band, rules box) are drawn by the browser, so only the art is kept.
# Usage: python3 tools/extract_art.py <deck-scan.jpg> <card-back.jpg> public/cards
import sys
import numpy as np
from PIL import Image, ImageFilter

src, back, out = sys.argv[1], sys.argv[2], sys.argv[3]
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
# Art box per card as fractions of the card (left, top, right, bottom).
DEFAULT = (.03, .175, .97, .72)
BOX = {
    'gub': (.05, .05, .95, .725),
    # cards with two- or three-line flavour text start lower
    'flop_boat': (.03, .21, .97, .675),
    **{k: (.03, .205, .97, .72) for k in ['sud_spout', 'scout', 'omen_beetle', 'velvet_moth',
                                         'rumor_of_wasps', 'gargok_plague', 'esteemed_elder', 'smahl_thief']},
    'letter_g': (.05, .03, .95, .76), 'letter_u': (.05, .03, .95, .76), 'letter_b': (.05, .03, .95, .76),
}

def tidy(card):
    a = np.asarray(card, dtype=float) / 255
    # Divide out the scan's paper tint (estimated from the brightest pixels) so the paper
    # becomes pure white without changing the illustration's own tones.
    lum = a.mean(axis=2)
    paper = np.median(a[lum >= np.percentile(lum, 90)], axis=0)
    a = np.clip(a / np.maximum(paper, .75), 0, 1)
    # Fade near-white, low-colour pixels fully to white so the art blends into the drawn
    # parchment (the browser draws it with multiply blending).
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    t = np.clip((lum - .86) / .1, 0, 1) * np.clip(1 - sat / .2, 0, 1)
    a = a * (1 - t[..., None]) + t[..., None]
    # Remove scan dust: greyish specks sitting in otherwise blank paper. Coloured or dark
    # strokes (antennae, outlines) are kept.
    img = Image.fromarray((a * 255).astype('uint8'))
    med = np.asarray(img.convert('L').filter(ImageFilter.MedianFilter(7)), dtype=float) / 255
    lum = a.mean(axis=2)
    sat = a.max(axis=2) - a.min(axis=2)
    dust = (med > .95) & (sat < .16) & (lum > .4)
    a[dust] = 1
    img = Image.fromarray((a * 255).astype('uint8'))
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    return img.filter(ImageFilter.UnsharpMask(radius=1.0, percent=25, threshold=4))

for key, (r, c) in POS.items():
    x0, y0, x1, y1 = cells[r][c]
    w, h = x1 - x0, y1 - y0
    l, t, rr, b = BOX.get(key, DEFAULT)
    art = im.crop((x0 + round(w * l), y0 + round(h * t), x0 + round(w * rr), y0 + round(h * b)))
    tidy(art).save(f'{out}/art/{key}.jpg', quality=90)

# Leopard-print band from the Gub card: mirror its plain left edge into a seamless tile.
x0, y0, x1, y1 = cells[0][7]
w, h = x1 - x0, y1 - y0
strip = im.crop((x0 + round(w * .02), y0 + round(h * .79), x0 + round(w * .24), y0 + round(h * .985)))
tile = Image.new('RGB', (strip.width * 2, strip.height))
tile.paste(strip, (0, 0)); tile.paste(strip.transpose(Image.FLIP_LEFT_RIGHT), (strip.width, 0))
tile.resize((tile.width * 2, tile.height * 2), Image.LANCZOS).save(f'{out}/leopard.jpg', quality=90)

# Card back photo: trim the photo's own corners; the browser rounds the card.
b = Image.open(back).convert('RGB')
bw, bh = b.size
b.crop((int(bw * .03), int(bh * .025), int(bw * .97), int(bh * .975))).resize((400, 570), Image.LANCZOS).save(f'{out}/back.jpg', quality=88)
print('done')
