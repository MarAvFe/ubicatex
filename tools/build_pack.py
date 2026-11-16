#!/usr/bin/env python3
"""Turn boundary GeoJSON into the small map packs the game loads.

    python3 tools/build_pack.py            # rebuild every pack in tools/packs.json

A pack is one JSON file: a viewBox; per playable region an SVG path, a label point,
a Spanish name and (when the names file has one) a capital; and non-playable
background paths (neighbouring land, open water, the globe outline). The game knows
nothing about places; adding a map means adding an entry to tools/packs.json and
running this. It also writes docs/MAPS.md, which says how tappable each map is on a
phone. Standard library only.

Each source in a pack entry turns features into regions:
  file          GeoJSON under data/sources/
  key           property whose value is the region key, or "=XX" for a fixed key
  name_property fallback when the key is empty: match this name against the names file
  map           {property value: region key or null}; null and unlisted go to `rest`
  rest          "land" or "water": draw unmatched features as background of that kind
  filter        {property: [allowed values]}
  drop_feature  {property: [values]}: skip these features (a pack's own country in its background)
  keep_bbox     [w, s, e, n]: keep only polygons wholly inside (drops far islands)
  drop_bboxes   list of boxes: drop polygons wholly inside any of them
  split         list of {"property", "value", "bands": [[lon_from, lon_to, key], ...]}: cut
                a feature by longitude (Russia between Europe and Asia; France's
                French Guiana into America)
  fill_holes    GeoJSON of land: holes in a polygon with no land in them are filled
                (Natural Earth's North Atlantic has a hole where the Sargasso Sea is)
Pack fields beyond the obvious: group (heading in the map dropdown), capitals (true: add a capital level), projection (equirect, laea, equalearth), sphere (draw
the globe outline as this background kind), min_step, theme ("sea" for water maps).
Several features with the same key become one region (a continent, an ocean).
"""
import csv
import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 1000  # viewBox width; height follows the map's aspect ratio
PAD = 20
# Islets smaller than this share of their feature's largest polygon are dropped: they
# are untappable on a phone and add nothing a player can recognise. Applied per
# source feature, so merging countries into a continent cannot drop a whole country.
MIN_PART_SHARE = 0.01
# Points closer than this (viewBox units) to the previous one are dropped. Well under
# the border stroke width, so it cannot be seen, and it halves the pack size. Packs
# can raise it ("min_step") where the source is far more detailed than the screen.
MIN_STEP = 0.8
# The play area of a small phone in CSS pixels (360 wide, minus HUD and browser bars).
PHONE = (360, 520)
# Tap-size verdicts, by the widest circle that fits in a region at phone size.
# 44 px is the usual comfortable touch target; 24 px is the WCAG 2.2 minimum.
TAP_OK, TAP_MIN = 44, 24
# The game counts a tap this close to the right region as on it (TAP_SLOP_PX in
# js/app.js; keep the two equal), which widens every target by twice this.
TAP_SLOP = 14

KIND = r"(departamento|provincia|distrito|comarca|regi[oó]n aut[oó]noma|oc[eé]ano)"


# ---- names ----

def clean_name(label):
    """'Departamento de El Progreso' -> 'El Progreso'; 'mar Rojo' -> 'Mar Rojo'."""
    # The connective is matched in lower case only: "de La Libertad" must keep its "La".
    s = re.sub(rf"^(?i:{KIND})\s+(de la |del |de )?", "", label).strip()
    return s[:1].upper() + s[1:]


def clean_capital(label):
    """'Granada (Ciudad)' -> 'Granada'."""
    return re.sub(r"\s*\(.*\)$", "", label).strip()


def norm(label):
    s = unicodedata.normalize("NFD", clean_name(label)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)|\bprovince\b|\bde\b", " ", s)
    return re.sub(r"[^a-z]", "", s)


def load_names(path):
    """iso -> {"name", "capital"}. A key listed twice has two capitals (Bolivia)."""
    rows = {}
    with open(ROOT / path, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            cap = clean_capital(r.get("capLabel") or "")
            if r["iso"] in rows:
                if cap and cap not in rows[r["iso"]]["capitals"]:
                    rows[r["iso"]]["capitals"].append(cap)
            else:
                rows[r["iso"]] = {"label": r["itemLabel"], "capitals": [cap] if cap else []}
    return rows


# ---- geometry ----

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


def outer_edges(polys):
    """Every edge of a region except those it shares with itself. Countries merged into a
    continent share their borders; only the coast counts for labels and tap size."""
    edges = [(a, b) for poly in polys for ring in poly for a, b in zip(ring, ring[1:] + ring[:1]) if a != b]
    seen = set(edges)
    return [(a, b) for a, b in edges if (b, a) not in seen]


def label_point(polys, steps=48):
    """The interior point farthest from the region's outer edge (grid search), and that
    distance. A centroid can fall outside a crescent such as Puntarenas; this cannot."""
    edges = outer_edges(polys)
    xs = [p[0] for poly in polys for p in poly[0]]
    ys = [p[1] for poly in polys for p in poly[0]]
    boxes = [(min(p[0] for p in poly[0]), min(p[1] for p in poly[0]), max(p[0] for p in poly[0]), max(p[1] for p in poly[0]))
             for poly in polys]
    best, best_d = None, -1
    for i in range(1, steps):
        for j in range(1, steps):
            pt = (min(xs) + (max(xs) - min(xs)) * i / steps, min(ys) + (max(ys) - min(ys)) * j / steps)
            if not any(b[0] <= pt[0] <= b[2] and b[1] <= pt[1] <= b[3] and inside(pt, poly) for b, poly in zip(boxes, polys)):
                continue
            d = math.inf
            for (x1, y1), (x2, y2) in edges:
                # cheap reject before the exact segment distance
                if min(abs(pt[0] - x1), abs(pt[0] - x2)) > d and (pt[0] - x1) * (pt[0] - x2) > 0:
                    continue
                dx, dy = x2 - x1, y2 - y1
                u = max(0, min(1, ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / (dx * dx + dy * dy)))
                d = min(d, math.hypot(pt[0] - x1 - u * dx, pt[1] - y1 - u * dy))
                if d <= best_d:
                    break
            if d > best_d:
                best, best_d = pt, d
    if best is None:  # a sliver the grid missed: fall back to its first vertex
        best, best_d = polys[0][0][0], 0
    return best, best_d


def clip(ring, axis, value, keep_greater):
    """Sutherland-Hodgman against one axis-aligned line. Works for any ring; a
    concave ring may come back with zero-width bridges, which fill invisibly."""
    def keep(p):
        return p[axis] >= value if keep_greater else p[axis] <= value

    def cross(p, q):
        t = (value - p[axis]) / (q[axis] - p[axis])
        return (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))

    out = []
    if not ring:
        return out
    prev = ring[-1]
    for cur in ring:
        if keep(cur):
            if not keep(prev):
                out.append(cross(prev, cur))
            out.append(cur)
        elif keep(prev):
            out.append(cross(prev, cur))
        prev = cur
    return out


def clip_box(ring, x0, y0, x1, y1):
    for axis, value, greater in ((0, x0, True), (0, x1, False), (1, y0, True), (1, y1, False)):
        ring = clip(ring, axis, value, greater)
    return ring


def thin(ring, step=MIN_STEP):
    """Snap to a grid of `step` and drop repeats. Snapping, unlike dropping points by
    distance, treats a border shared by two regions identically from both sides, so
    merged regions (a continent, an ocean) stay seamless."""
    out = []
    for x, y in ring:
        pt = (round(round(x / step) * step, 1), round(round(y / step) * step, 1))
        if not out or pt != out[-1]:
            out.append(pt)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def within(poly, box):
    w, s, e, n = box
    return all(w <= x <= e and s <= y <= n for x, y, *_ in poly[0])


# ---- projections: degrees -> plane, x to the east, y to the north ----

def projection(kind, lon0, lat0):
    if kind == "equirect":
        # With the mid-latitude correction: at country scale this near the equator it is
        # indistinguishable from a proper projection.
        k = math.cos(math.radians(lat0))
        return lambda lon, lat: ((lon - lon0) * k, lat)
    if kind == "laea":
        # Lambert azimuthal equal-area, centred on the map: keeps a continent's shapes
        # and areas honest, and wraps the date line without special cases (Aleutians).
        l0, p0 = math.radians(lon0), math.radians(lat0)

        def laea(lon, lat):
            l, p = math.radians(lon), math.radians(lat)
            c = 1 + math.sin(p0) * math.sin(p) + math.cos(p0) * math.cos(p) * math.cos(l - l0)
            k = math.sqrt(2 / max(c, 1e-9))
            return (k * math.cos(p) * math.sin(l - l0),
                    k * (math.cos(p0) * math.sin(p) - math.sin(p0) * math.cos(p) * math.cos(l - l0)))
        return laea
    if kind == "equalearth":
        # Equal Earth (Šavrič, Patterson, Jenny 2018): an equal-area world map that
        # still looks familiar. Constants from the paper.
        a1, a2, a3, a4 = 1.340264, -0.081106, 0.000893, 0.003796
        m = math.sqrt(3) / 2

        def equal_earth(lon, lat):
            t = math.asin(m * math.sin(math.radians(lat)))
            t2, t6 = t * t, t ** 6
            x = 2 * math.sqrt(3) * math.radians(lon - lon0) * math.cos(t) / (3 * (9 * a4 * t6 * t2 + 7 * a3 * t6 + 3 * a2 * t2 + a1))
            return (x, t * (a1 + a2 * t2 + t6 * (a3 + a4 * t2)))
        return equal_earth
    raise SystemExit(f"unknown projection {kind}")


# ---- reading sources ----

def densify(ring, max_deg=1.0):
    """Add points along long edges, so that after projection an edge along a meridian
    or parallel (the rim of a world map, an ocean boundary) curves as it should."""
    out = []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        out.append(a)
        n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) / max_deg)
        out.extend((a[0] + (b[0] - a[0]) * i / (n + 1), a[1] + (b[1] - a[1]) * i / (n + 1)) for i in range(1, n + 1))
    return out


def feature_polys(feat):
    g = feat["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    def open_ring(ring):  # GeoJSON repeats the first point at the end; the code here doesn't
        pts = [(p[0], p[1]) for p in ring]
        return pts[:-1] if len(pts) > 1 and pts[0] == pts[-1] else pts
    return [[densify(open_ring(ring)) for ring in poly] for poly in polys]


_LAND = {}


def land_polys(path):
    if path not in _LAND:
        data = json.loads((ROOT / path).read_text(encoding="utf-8"))
        polys = [p for f in data["features"] for p in feature_polys(f)]
        _LAND[path] = [(min(x for x, _ in p[0]), min(y for _, y in p[0]), max(x for x, _ in p[0]), max(y for _, y in p[0]), p)
                       for p in polys]
    return _LAND[path]


def fill_empty_holes(poly, land):
    """Keep a hole only if land shows through it (an island); fill the others."""
    keep = [poly[0]]
    for hole in poly[1:]:
        cx = sum(x for x, _ in hole) / len(hole)
        cy = sum(y for _, y in hole) / len(hole)
        # A centroid outside its own (concave) hole says nothing: keep such holes.
        if not inside((cx, cy), [hole]) or any(
                b[0] <= cx <= b[2] and b[1] <= cy <= b[3] and inside((cx, cy), p) for *b, p in land):
            keep.append(hole)
    return keep


def drop_islets(polys):
    polys = sorted(polys, key=lambda p: -abs(ring_area(p[0])))
    biggest = abs(ring_area(polys[0][0]))
    return [p for p in polys if abs(ring_area(p[0])) >= biggest * MIN_PART_SHARE]


def read_source(src, names):
    """Yields (key or None, background kind or None, polys) per feature part."""
    data = json.loads((ROOT / src["file"]).read_text(encoding="utf-8"))
    for feat in data["features"]:
        props = feat["properties"]
        if any(props.get(k) not in allowed for k, allowed in src.get("filter", {}).items()):
            continue
        if any(props.get(k) in banned for k, banned in src.get("drop_feature", {}).items()):
            continue
        polys = feature_polys(feat)
        if "fill_holes" in src:
            land = land_polys(src["fill_holes"])
            polys = [fill_empty_holes(p, land) for p in polys]
        if "keep_bbox" in src:
            polys = [p for p in polys if within(p, src["keep_bbox"])]
        for box in src.get("drop_bboxes", []):
            polys = [p for p in polys if not within(p, box)]
        if not polys:
            continue
        key = src["key"][1:] if src["key"].startswith("=") else props.get(src["key"])
        if "map" in src:
            key = src["map"].get(key)
        elif key and "name_property" in src and key not in names:
            key = None
        if not key and "name_property" in src and "map" not in src:
            wanted = norm(props[src["name_property"]])
            key = next((k for k, row in names.items() if norm(row["label"]) == wanted), None)
            if not key:
                raise SystemExit(f"{src['file']}: no name row for {props[src['name_property']]!r}")
        split = next((s for s in src.get("split", []) if props.get(s["property"]) == s["value"]), None)
        if key and split:
            for lon_from, lon_to, band_key in split["bands"]:
                part = []
                for poly in polys:
                    rings = [clip(clip(ring, 0, lon_from, True), 0, lon_to, False) for ring in poly]
                    if len(rings[0]) >= 3:
                        part.append([r for r in rings if len(r) >= 3])
                if part:
                    yield band_key, None, drop_islets(part)
            continue
        if key:
            yield key, None, drop_islets(polys)
        elif src.get("rest"):
            yield None, src["rest"], polys


def sphere(project):
    """The outline of a whole-world map: the 180° meridian down one side and up the other."""
    left = [project(-180, lat) for lat in range(-90, 91, 2)]
    right = [project(180, lat) for lat in range(90, -91, -2)]
    return [[left + right]]


# ---- building ----

def main_box(polys, reach=0.12):
    """The box a falling piece shows: the largest part plus the parts near it. A region
    split by the date line (Pacific, Oceania with Fiji) would otherwise span the whole
    map and shrink to a speck."""
    def bbox(p):
        return [min(x for x, _ in p[0]), min(y for _, y in p[0]), max(x for x, _ in p[0]), max(y for _, y in p[0])]
    parts = [bbox(p) for p in polys]
    box = parts[0][:]
    gap = reach * WIDTH
    grew = True
    while grew:
        grew = False
        for b in parts:
            near = b[0] <= box[2] + gap and b[2] >= box[0] - gap and b[1] <= box[3] + gap and b[3] >= box[1] - gap
            if near and (b[0] < box[0] or b[1] < box[1] or b[2] > box[2] or b[3] > box[3]):
                box = [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
                grew = True
    return [box[0], box[1], round(box[2] - box[0], 1), round(box[3] - box[1], 1)]


def path_d(polys):
    return "".join("M" + "L".join(f"{x:g},{y:g}" for x, y in ring) + "Z" for poly in polys for ring in poly)


def build(cfg):
    names = load_names(cfg["names"])
    regions = {}  # key -> list of polys (lon/lat)
    background = []  # (kind, polys)
    for src in cfg["sources"]:
        for key, kind, polys in read_source(src, names):
            if key:
                regions.setdefault(key, []).extend(polys)
            else:
                background.append((kind, polys))
    for bg in cfg.get("background", []):
        for _, _, polys in read_source({"key": "=bg", **bg}, {}):
            background.append((bg["kind"], polys))
    missing = [k for k in regions if k not in names]
    if missing:
        raise SystemExit(f"{cfg['id']}: no name for {missing}")

    allpts = [pt for polys in regions.values() for p in polys for pt in p[0]]
    lons = [p[0] for p in allpts]
    lats = [p[1] for p in allpts]
    kind = cfg.get("projection", "equirect")
    if kind == "equalearth":
        center = (cfg.get("lon0", 0), 0)
    elif kind == "laea" and max(lons) - min(lons) > 180:  # the map crosses the date line
        center = ((sum((l + 360) % 360 for l in lons) / len(lons) + 180) % 360 - 180, (min(lats) + max(lats)) / 2)
    else:
        center = ((min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2)
    proj = projection(kind, *center)

    def project_polys(polys):
        return [[[proj(*pt) for pt in ring] for ring in poly] for poly in polys]

    plane = {k: project_polys(v) for k, v in regions.items()}
    pts = [pt for polys in plane.values() for p in polys for pt in p[0]]
    if cfg.get("sphere"):
        pts += [pt for p in sphere(proj) for pt in p[0]]
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    scale = (WIDTH - 2 * PAD) / (x1 - x0)
    height = round((y1 - y0) * scale + 2 * PAD)
    phone_scale = min(PHONE[0] / WIDTH, PHONE[1] / height)

    step = cfg.get("min_step", MIN_STEP)

    def to_view(polys, keep_thin=True):
        out = []
        for poly in polys:
            rings = []
            for ring in poly:
                r = [(round(PAD + (x - x0) * scale, 1), round(PAD + (y1 - y) * scale, 1)) for x, y in ring]
                if keep_thin:
                    r = thin(r, step)
                if len(r) >= 3:
                    rings.append(r)
            if rings:
                out.append(rings)
        return out

    out = []
    for key, polys in plane.items():
        view = to_view(polys)
        view.sort(key=lambda p: -abs(ring_area(p[0])))
        (lx, ly), radius = label_point(view)
        row = names[key]
        region = {
            "id": key, "name": clean_name(row["label"]), "d": path_d(view),
            "label": [round(lx, 1), round(ly, 1)],
            "box": main_box(view),
            "tapPx": round(2 * radius * phone_scale),
        }
        # Capitals only where a pack asks for them: country maps, whose capitals were
        # checked against a second source. Province capitals are not verified yet.
        if row["capitals"] and cfg.get("capitals"):
            region["capital"] = " / ".join(row["capitals"])
        out.append(region)
    out.sort(key=lambda r: r["name"])

    layers = {}
    if cfg.get("sphere"):
        sphere_kind = cfg["sphere"] if isinstance(cfg["sphere"], str) else "sphere"
        layers[sphere_kind] = to_view(sphere(proj), keep_thin=False)
    w, h = WIDTH, height
    for bg_kind, polys in background:
        for poly in to_view(project_polys(polys)):
            rings = [r for r in (clip_box(ring, 0, 0, w, h) for ring in poly) if len(r) >= 3]
            if rings:
                layers.setdefault(bg_kind, []).append([[(round(x, 1), round(y, 1)) for x, y in r] for r in rings])
    smallest = min(out, key=lambda r: r["tapPx"])
    reach = smallest["tapPx"] + 2 * TAP_SLOP
    verdict = "ok" if reach >= TAP_OK else "tight" if reach >= TAP_MIN else "needs-zoom"
    return {
        "id": cfg["id"], "title": cfg["title"], "subtitle": cfg["subtitle"], "chip": cfg.get("chip", cfg["title"]),
        "flag": cfg.get("flag", ""), "noun": cfg["noun"], "theme": cfg.get("theme", "land"),
        "viewBox": [WIDTH, height],
        # Drawn in this order, under the regions, and never tappable.
        "background": [{"kind": k, "d": path_d(layers[k])} for k in ("sphere", "openwater", "water", "land") if k in layers],
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
        index.append({k: pack[k] for k in ("id", "title", "subtitle", "chip", "flag", "noun", "attribution")}
                     | {"group": cfg["group"]}
                     | {"count": len(pack["regions"])})
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
        "the slop: they can be tapped, but they are hard to *see* on a phone.\n\n"
        "| Map | Regions | Smallest region | px | With slop | Verdict | Hard to see on a phone |\n|---|---|---|---|---|---|---|\n"
        + "\n".join(report) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
