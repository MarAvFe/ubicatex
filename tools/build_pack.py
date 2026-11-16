#!/usr/bin/env python3
"""Turn boundary GeoJSON into the small map packs the game loads.

    python3 tools/build_pack.py            # rebuild every pack in tools/packs.json

A pack is one JSON file: a viewBox plus, per region, an SVG path, a label point, a
Spanish name and (when the names file has one) a capital. The game knows nothing
about countries; adding a map means adding an entry to tools/packs.json and running
this. It also writes docs/MAPS.md, which says how tappable each map is on a phone.
Standard library only.
"""
import csv
import json
import math
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 1000  # viewBox width; height follows the map's aspect ratio
PAD = 20
# Islets smaller than this share of a region's largest polygon are dropped: they are
# untappable on a phone and add nothing a player can recognise.
MIN_PART_SHARE = 0.01
# Points closer than this (viewBox units) to the previous one are dropped. Well under
# the border stroke width, so it cannot be seen, and it halves the pack size.
MIN_STEP = 0.8
# The play area of a small phone in CSS pixels (360 wide, minus HUD and browser bars).
PHONE = (360, 520)
# Tap-size verdicts, by the widest circle that fits in a region at phone size.
# 44 px is the usual comfortable touch target; 24 px is the WCAG 2.2 minimum.
TAP_OK, TAP_MIN = 44, 24
# The game counts a tap this close to the right region as on it (TAP_SLOP_PX in
# js/app.js; keep the two equal), which widens every target by twice this.
TAP_SLOP = 14

KIND = r"(departamento|provincia|distrito|comarca|regi[oó]n aut[oó]noma)"


def clean_name(label):
    """'Departamento de El Progreso' -> 'El Progreso'."""
    # The connective is matched in lower case only: "de La Libertad" must keep its "La".
    return re.sub(rf"^(?i:{KIND})\s+(de la |del |de )?", "", label).strip()


def clean_capital(label):
    """'Granada (Ciudad)' -> 'Granada'."""
    return re.sub(r"\s*\(.*\)$", "", label).strip()


def norm(label):
    s = unicodedata.normalize("NFD", clean_name(label)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)|\bprovince\b|\bde\b", " ", s)
    return re.sub(r"[^a-z]", "", s)


def ring_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2


def inside(pt, poly):
    """Even-odd test against a polygon given as [outer, hole, ...]."""
    x, y = pt
    hit = False
    for ring in poly:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                hit = not hit
    return hit


def edge_distance(pt, poly):
    x, y = pt
    best = math.inf
    for ring in poly:
        for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
            dx, dy = x2 - x1, y2 - y1
            t = 0 if dx == dy == 0 else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
            best = min(best, math.hypot(x - x1 - t * dx, y - y1 - t * dy))
    return best


def label_point(poly, steps=40):
    """The interior point farthest from any edge (grid search), and that distance.
    A centroid can fall outside a crescent-shaped region such as Puntarenas; this cannot."""
    xs = [p[0] for p in poly[0]]
    ys = [p[1] for p in poly[0]]
    best, best_d = None, -1
    for i in range(1, steps):
        for j in range(1, steps):
            pt = (min(xs) + (max(xs) - min(xs)) * i / steps, min(ys) + (max(ys) - min(ys)) * j / steps)
            if inside(pt, poly):
                d = edge_distance(pt, poly)
                if d > best_d:
                    best, best_d = pt, d
    return best, best_d


def thin(ring):
    out = [ring[0]]
    for pt in ring[1:]:
        if math.dist(pt, out[-1]) >= MIN_STEP:
            out.append(pt)
    return out


def load_names(cfg):
    with open(ROOT / cfg["names"], encoding="utf-8", newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["iso"].startswith(cfg["iso_prefix"])]
    return {r["iso"]: r for r in rows}, {norm(r["itemLabel"]): r for r in rows}


def build(cfg):
    by_iso, by_name = load_names(cfg)
    box = cfg.get("clip_bbox")
    regions = []
    for source in cfg["sources"]:
        src = json.loads((ROOT / source["file"]).read_text(encoding="utf-8"))
        for feat in src["features"]:
            props = feat["properties"]
            # Names and capitals come from the names file, never from the boundary file
            # (whose labels mix languages). Match on ISO code, else on the name.
            row = by_iso.get(source.get("id") or props.get("shapeISO")) or by_name.get(norm(props["shapeName"]))
            if not row:
                raise SystemExit(f"{cfg['id']}: no name for {props.get('shapeISO')} {props['shapeName']!r}")
            geom = feat["geometry"]
            polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
            if box:  # drops far islands such as Isla del Coco
                w, s, e, n = box
                polys = [p for p in polys if all(w <= x <= e and s <= y <= n for x, y, *_ in p[0])]
            if not polys:
                raise SystemExit(f"{cfg['id']}: {row['itemLabel']} has no polygon inside clip_bbox")
            regions.append({"row": row, "polys": polys})
    if len({r["row"]["iso"] for r in regions}) != len(regions):
        raise SystemExit(f"{cfg['id']}: two regions matched the same name row")

    # Decide the frame from each region's main landmass only, so stray islets
    # cannot shrink the map.
    for r in regions:
        r["polys"].sort(key=lambda p: -abs(ring_area(p[0])))
        biggest = abs(ring_area(r["polys"][0][0]))
        r["polys"] = [p for p in r["polys"] if abs(ring_area(p[0])) >= biggest * MIN_PART_SHARE]
    pts = [pt for r in regions for p in r["polys"] for pt in p[0]]
    lon0, lon1 = min(p[0] for p in pts), max(p[0] for p in pts)
    lat0, lat1 = min(p[1] for p in pts), max(p[1] for p in pts)
    # Equirectangular with the mid-latitude correction: at this scale it is
    # indistinguishable from a proper projection and needs no library.
    k = math.cos(math.radians((lat0 + lat1) / 2))
    scale = (WIDTH - 2 * PAD) / ((lon1 - lon0) * k)
    height = round((lat1 - lat0) * scale + 2 * PAD)
    phone_scale = min(PHONE[0] / WIDTH, PHONE[1] / height)

    def project(pt):
        return (round(PAD + (pt[0] - lon0) * k * scale, 1), round(PAD + (lat1 - pt[1]) * scale, 1))

    out = []
    for r in regions:
        polys = [[thin([project(pt) for pt in ring]) for ring in poly] for poly in r["polys"]]
        polys = [[ring for ring in poly if len(ring) >= 3] for poly in polys]
        polys = [p for p in polys if p]
        d = "".join("M" + "L".join(f"{x:g},{y:g}" for x, y in ring) + "Z" for poly in polys for ring in poly)
        allpts = [pt for p in polys for pt in p[0]]
        x0, y0 = min(p[0] for p in allpts), min(p[1] for p in allpts)
        x1, y1 = max(p[0] for p in allpts), max(p[1] for p in allpts)
        (lx, ly), radius = label_point(polys[0])
        region = {
            "id": r["row"]["iso"], "name": clean_name(r["row"]["itemLabel"]), "d": d,
            "label": [round(lx, 1), round(ly, 1)],
            "box": [x0, y0, round(x1 - x0, 1), round(y1 - y0, 1)],
            "tapPx": round(2 * radius * phone_scale),
        }
        if r["row"]["capLabel"]:
            region["capital"] = clean_capital(r["row"]["capLabel"])
        out.append(region)
    out.sort(key=lambda r: r["name"])
    smallest = min(out, key=lambda r: r["tapPx"])
    reach = smallest["tapPx"] + 2 * TAP_SLOP
    verdict = "ok" if reach >= TAP_OK else "tight" if reach >= TAP_MIN else "needs-zoom"
    return {
        "id": cfg["id"], "title": cfg["title"], "subtitle": cfg["subtitle"], "flag": cfg.get("flag", ""),
        "noun": cfg["noun"], "viewBox": [WIDTH, height],
        # Smaller names on crowded maps, so they overlap less.
        "labelSize": 26 if len(out) <= 8 else 20 if len(out) <= 15 else 16,
        "hasCapitals": all("capital" in r for r in out),
        "tap": {"verdict": verdict, "smallest": smallest["name"], "px": smallest["tapPx"],
                "under24": sorted(r["name"] for r in out if r["tapPx"] < TAP_MIN)},
        "attribution": cfg["attribution"], "regions": out,
    }


def main():
    cfgs = json.loads((ROOT / "tools/packs.json").read_text(encoding="utf-8"))["packs"]
    index, report = [], []
    for cfg in cfgs:
        pack = build(cfg)
        path = ROOT / "packs" / f"{cfg['id']}.json"
        path.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        index.append({k: pack[k] for k in ("id", "title", "subtitle", "flag", "noun", "attribution")} | {"count": len(pack["regions"])})
        t = pack["tap"]
        report.append(f"| {pack['title']} · {pack['subtitle']} | {len(pack['regions'])} | {t['smallest']} | {t['px']} | "
                      f"{t['px'] + 2 * TAP_SLOP} | {t['verdict']} | {', '.join(t['under24']) or 'none'} |")
        print(f"{path.relative_to(ROOT)}: {len(pack['regions'])} regions, {path.stat().st_size // 1024} KB, "
              f"smallest tap {t['smallest']} {t['px']} px -> {t['verdict']}")
    (ROOT / "packs/index.json").write_text(json.dumps({"packs": index}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "docs/MAPS.md").write_text(
        "# Maps: can they be played without zoom?\n\n"
        "Generated by `tools/build_pack.py`; do not edit.\n\n"
        f"**px** is the widest circle that fits inside a map's hardest region when the map is drawn on a\n"
        f"{PHONE[0]}x{PHONE[1]} px phone play area. **With slop** adds the {TAP_SLOP} px on each side that the game forgives\n"
        f"around the right region, and the verdict is based on it: `ok` is {TAP_OK} px or more, `tight` is {TAP_MIN} to\n"
        f"{TAP_OK - 1} px, `needs-zoom` is under {TAP_MIN} px. The last column lists regions that are under {TAP_MIN} px before\n"
        "the slop: they can be tapped, but they are hard to *see* on a phone, and their names are tiny.\n\n"
        "| Map | Regions | Smallest region | px | With slop | Verdict | Hard to see on a phone |\n|---|---|---|---|---|---|---|\n"
        + "\n".join(report) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
