"""Pixel-level review of the colour-update screenshots (detection-based).

Instead of guessing fixed regions, each check scans the whole image for a
colour family:
- deep indigo header/footer pixels (#1E1B4B +- tolerance)
- hero gradient pixels (#4F46E5..#7C3AED family)
- risk strip colour on result shots
- the four segment identity colours on the portfolio shot
- dark text ink present (page not blank)
"""
from PIL import Image
import os

SHOTS = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "docs", "screenshots"))

def count_near(img, targets, tol=28, step=3):
    """Fraction of sampled pixels within tol of any target colour."""
    img = img.convert("RGB")
    w, h = img.size
    px = img.load()
    hits = total = 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            total += 1
            p = px[x, y]
            for t in targets:
                if all(abs(p[i] - t[i]) <= tol for i in range(3)):
                    hits += 1
                    break
    return hits / total

DEEP = [(30, 27, 75)]                      # #1E1B4B header/footer
HERO = [(79, 70, 229), (99, 102, 241), (124, 58, 237)]  # indigo -> violet
LOW_STRIP = [(21, 128, 61)]
HIGH_STRIP = [(185, 28, 28)]
TILES = {
    "rose": (225, 29, 72),
    "amber": (180, 83, 9),
    "teal": (15, 118, 110),
    "slate": (71, 85, 105),
}

def review(name, expect_hero=False, expect_strip=None, expect_tiles=False):
    img = Image.open(os.path.join(SHOTS, name))
    w, h = img.size
    issues = []

    deep = count_near(img, DEEP, tol=20)
    if deep < 0.01:
        issues.append(f"deep indigo header/footer not found ({deep:.3%})")

    rgb = img.convert("RGB")
    px = rgb.load()
    dark = sum(1 for y in range(0, h, 3) for x in range(0, w, 3) if sum(px[x, y]) < 240)
    if dark == 0:
        issues.append("no dark text pixels (page looks blank)")

    if expect_hero:
        hero = count_near(img, HERO, tol=45)
        if hero < 0.005:
            issues.append(f"hero gradient not found ({hero:.3%})")

    if expect_strip:
        strip = count_near(img, expect_strip, tol=45)
        if strip < 0.0005:
            issues.append(f"risk strip colour not found ({strip:.4%})")

    if expect_tiles:
        missing = [
            k for k, c in TILES.items() if count_near(img.crop((0, 0, w, min(700, h))), [c], tol=60) < 0.0005
        ]
        if missing:
            issues.append(f"tile identity colours missing: {missing}")

    print(f"[{'OK   ' if not issues else 'ISSUE'}] {name} ({w}x{h})  deep={deep:.2%}")
    for i in issues:
        print(f"   - {i}")
    return not issues

results = [
    review("colour-check-empty.png", expect_hero=True),
    review("colour-check-low.png", expect_hero=True, expect_strip=LOW_STRIP),
    review("colour-check-high.png", expect_hero=True, expect_strip=HIGH_STRIP),
    review("colour-portfolio.png", expect_tiles=True),
    review("colour-learn.png"),
    review("colour-check-mobile.png", expect_hero=True),
]
print()
print("ALL OK" if all(results) else "REVIEW NEEDED")
