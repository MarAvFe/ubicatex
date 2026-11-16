#!/usr/bin/env python3
"""Turn boundary GeoJSON into the small map packs the game loads.

    python3 tools/build_pack.py            # rebuild every pack in tools/packs.json
    python3 tools/build_pack.py cr-provincias

A pack is one JSON file: a viewBox plus, per region, an SVG path and a label point.
The game knows nothing about countries; adding a map means adding an entry to
tools/packs.json and running this. Standard library only.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 1000  # viewBox width; height follows the map's aspect ratio
PAD = 20
# Islets smaller than this share of a region's largest polygon are dropped: they are
# untappable on a phone and add nothing a player can recognise.
MIN_PART_SHARE = 0.01


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


def label_point(poly, steps=48):
    """The interior point farthest from any edge (grid search). A centroid can fall
    outside a crescent-shaped region such as Puntarenas; this cannot."""
    xs = [p[0] for p in poly[0]]
    ys = [p[1] for p in poly[0]]
    best, best_d = None, -1
    for i in range(steps + 1):
        for j in range(steps + 1):
            pt = (min(xs) + (max(xs) - min(xs)) * i / steps, min(ys) + (max(ys) - min(ys)) * j / steps)
            if inside(pt, poly):
                d = edge_distance(pt, poly)
                if d > best_d:
                    best, best_d = pt, d
    return best


def build(cfg):
    src = json.loads((ROOT / cfg["source"]).read_text(encoding="utf-8"))
    w, s, e, n = cfg["clip_bbox"]
    regions = []
    for feat in src["features"]:
        geom = feat["geometry"]
        polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        # keep only parts inside the clip box (drops far islands such as Isla del Coco)
        polys = [p for p in polys if all(w <= x <= e and s <= y <= n for x, y, *_ in p[0])]
        name = feat["properties"][cfg["name_property"]]
        if name.startswith(cfg.get("strip_prefix", "")):
            name = name[len(cfg.get("strip_prefix", "")):]
        if not polys:
            raise SystemExit(f"{cfg['id']}: {name} has no polygon inside clip_bbox")
        regions.append({"id": feat["properties"][cfg["id_property"]], "name": name, "polys": polys})

    pts = [pt for r in regions for p in r["polys"] for pt in p[0]]
    lon0, lon1 = min(p[0] for p in pts), max(p[0] for p in pts)
    lat0, lat1 = min(p[1] for p in pts), max(p[1] for p in pts)
    # Equirectangular with the mid-latitude correction: at this scale it is
    # indistinguishable from a proper projection and needs no library.
    k = math.cos(math.radians((lat0 + lat1) / 2))
    scale = (WIDTH - 2 * PAD) / ((lon1 - lon0) * k)
    height = round((lat1 - lat0) * scale + 2 * PAD)

    def project(pt):
        return (round(PAD + (pt[0] - lon0) * k * scale, 1), round(PAD + (lat1 - pt[1]) * scale, 1))

    out = []
    for r in regions:
        polys = [[[project(pt) for pt in ring] for ring in poly] for poly in r["polys"]]
        polys.sort(key=lambda p: -abs(ring_area(p[0])))
        biggest = abs(ring_area(polys[0][0]))
        polys = [p for p in polys if abs(ring_area(p[0])) >= biggest * MIN_PART_SHARE]
        d = "".join(
            "M" + "L".join(f"{x:g},{y:g}" for x, y in ring) + "Z" for poly in polys for ring in poly
        )
        allpts = [pt for p in polys for pt in p[0]]
        x0, y0 = min(p[0] for p in allpts), min(p[1] for p in allpts)
        x1, y1 = max(p[0] for p in allpts), max(p[1] for p in allpts)
        lx, ly = label_point(polys[0])
        out.append({
            "id": r["id"], "name": r["name"], "d": d,
            "label": [round(lx, 1), round(ly, 1)],
            "box": [x0, y0, round(x1 - x0, 1), round(y1 - y0, 1)],
        })
    out.sort(key=lambda r: r["name"])
    return {
        "id": cfg["id"], "title": cfg["title"], "subtitle": cfg["subtitle"], "flag": cfg.get("flag", ""),
        "viewBox": [WIDTH, height], "attribution": cfg["attribution"], "regions": out,
    }


def main():
    cfgs = json.loads((ROOT / "tools/packs.json").read_text(encoding="utf-8"))["packs"]
    wanted = sys.argv[1:]
    index = []
    for cfg in cfgs:
        index.append({k: cfg[k] for k in ("id", "title", "subtitle", "flag", "attribution")})
        if wanted and cfg["id"] not in wanted:
            continue
        pack = build(cfg)
        path = ROOT / "packs" / f"{cfg['id']}.json"
        path.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{path.relative_to(ROOT)}: {len(pack['regions'])} regions, {path.stat().st_size // 1024} KB")
    (ROOT / "packs/index.json").write_text(json.dumps({"packs": index}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
