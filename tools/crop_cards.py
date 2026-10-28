# Cuts each card out of a 10x7 scan of the deck, exactly as scanned (no resizing or retouching).
# Usage: python3 tools/crop_cards.py <deck-scan.jpg> <card-back.jpg> public/cards
import sys
import numpy as np
from PIL import Image

src, back, out = sys.argv[1:4]

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
for key, (r, c) in POS.items():
    strip = gray[rows[r] + 10:rows[r + 1] - 10].mean(axis=0)
    cols = [0] + [seam(strip, round(k * W / 10)) for k in range(1, 10)] + [W]
    # Trim the 3px seam line between neighbouring cards.
    im.crop((cols[c] + 3, rows[r] + 3, cols[c + 1] - 3, rows[r + 1] - 3)).save(f'{out}/{key}.jpg', quality=95)

b = Image.open(back).convert('RGB')
bw, bh = b.size
# Trim the photo's own rounded corners; the browser rounds the card.
b.crop((int(bw * .03), int(bh * .025), int(bw * .97), int(bh * .975))).save(f'{out}/back.jpg', quality=95)
