#!/usr/bin/env python3
"""Download the Natural Earth files the world and continent packs use, and keep only
what the builder reads (a few properties, coordinates to 4 decimals), so the copies
committed under data/sources/ stay small.

    python3 tools/fetch_sources.py

Natural Earth is public domain. Re-run only to update the data; the build itself
works offline from data/sources/.
"""
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
FILES = {
    "ne_110m_admin_0_countries": ["ADM0_A3", "ISO_A2_EH", "CONTINENT", "NAME_ES"],
    "ne_50m_admin_0_countries": ["ADM0_A3", "ISO_A2_EH", "CONTINENT", "NAME_ES"],
    "ne_110m_geography_marine_polys": ["featurecla", "name", "name_es", "wikidataid"],
}


def rounded(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 4), round(coords[1], 4)]
    return [rounded(c) for c in coords]


def main():
    for name, keep in FILES.items():
        with urllib.request.urlopen(BASE + name + ".geojson", timeout=120) as res:
            data = json.load(res)
        feats = [{
            "type": "Feature",
            "properties": {k: f["properties"].get(k) for k in keep},
            "geometry": {"type": f["geometry"]["type"], "coordinates": rounded(f["geometry"]["coordinates"])},
        } for f in data["features"] if f.get("geometry")]
        out = ROOT / "data/sources" / f"{name}.geojson"
        out.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{out.relative_to(ROOT)}: {len(feats)} features, {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
