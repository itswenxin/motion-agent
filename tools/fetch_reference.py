#!/usr/bin/env python3
"""Download the reference video behind a Pinterest, Behance or direct media link.

    python3 tools/fetch_reference.py <url> [--slug name] [--out refs/]

Writes refs/<slug>/reference.<ext> plus meta.json (source URL, creator, title, size).
refs/ is git-ignored: reference videos belong to their creators and are never committed.

Supported:
  - Pinterest: pin.it short links and /pin/<id>/ URLs, through Pinterest's public widget
    API (no login). Video pins and idea/story pins. If the pin is only an image, the tool
    says so and prints the pin's outbound link, where the real motion usually lives.
  - Behance: project pages (/gallery/<id>/...). Native video modules are downloaded; embedded
    Vimeo/YouTube players are listed so they can be opened in the browser.
  - Direct .mp4 / .mov / .webm / .gif URLs.

Exit codes: 0 downloaded · 2 no video found (see message) · 3 page blocked or unreachable;
open the link in the user's browser and copy the <video> source URL, then rerun with it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
UA = "Motion-Agent-reference-fetcher/1.0 (+https://github.com/itswenxin/motion-agent)"
MEDIA_RE = re.compile(r"https?://[^\s\"'<>\\]+?\.(?:mp4|mov|webm|gif)(?:\?[^\s\"'<>\\]*)?", re.I)


def http_get(url: str, timeout=30) -> tuple[str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.geturl(), resp.read()


def resolve(url: str, hops=8) -> str:
    """Follow redirects by hand (Python 3.9's urllib does not follow 307/308)."""
    import urllib.error
    for _ in range(hops):
        req = urllib.request.Request(url, headers={"User-Agent": UA}, method="HEAD")
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.geturl()
        except urllib.error.HTTPError as err:
            loc = err.headers.get("Location")
            if err.code in (301, 302, 303, 307, 308) and loc:
                url = urllib.parse.urljoin(url, loc)
                if "/pin/" in url:
                    return url
                continue
            raise
    return url


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:48] or "reference"


def pick_best(urls: list[str]) -> str | None:
    """Prefer mp4, then the largest width hinted in the URL (720w, 1080p, ...)."""
    def score(u: str):
        w = max([int(x) for x in re.findall(r"(\d{3,4})(?:w|p)\b", u)] or [0])
        return (u.lower().split("?")[0].endswith(".mp4"), w)
    urls = [u for u in dict.fromkeys(urls)]
    return max(urls, key=score) if urls else None


def from_pinterest(url: str) -> dict:
    final = resolve(url) if "pin.it/" in url else url
    m = re.search(r"/pin/(?:[^/]*--)?(\d+)", final)
    if not m:
        raise LookupError(f"Could not find a pin id in {final}")
    pin_id = m.group(1)
    _, body = http_get(f"https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids={pin_id}")
    data = json.loads(body)["data"][0]
    blob = json.dumps(data)
    media = [u for u in MEDIA_RE.findall(blob) if "pinimg.com" in u and not u.lower().endswith(".gif")]
    creator = (data.get("native_creator") or data.get("pinner") or {}).get("username")
    meta = {
        "platform": "pinterest",
        "pin_id": pin_id,
        "source_url": f"https://www.pinterest.com/pin/{pin_id}/",
        "title": (data.get("title") or data.get("description") or "").strip()[:200],
        "creator": creator,
        "outbound_link": data.get("link"),
        "candidates": media,
    }
    if not media:
        meta["note"] = ("This pin has no video (image only). The motion usually lives at the pin's "
                        "outbound link or the creator's original post; open that and fetch it instead.")
    return meta


def from_behance(url: str) -> dict:
    try:
        final, body = http_get(url)
    except Exception as err:
        raise PermissionError(f"Behance page not reachable from the CLI ({err}).")
    html = body.decode("utf-8", "replace")
    if "cf-chl" in html or "Attention Required" in html:
        raise PermissionError("Behance served a bot check.")
    html_unescaped = html.replace("\\/", "/").replace("\\u002F", "/")
    media = [u for u in MEDIA_RE.findall(html_unescaped) if "behance" in u or "adobe" in u]
    embeds = sorted(set(re.findall(r"https?://(?:player\.vimeo\.com/video/\d+|www\.youtube(?:-nocookie)?\.com/embed/[\w-]+)", html_unescaped)))
    title = re.search(r"<title>([^<]+)</title>", html)
    creator = re.search(r'"owners":\s*\[\s*\{[^}]*?"display_name":"([^"]+)"', html_unescaped)
    meta = {
        "platform": "behance",
        "source_url": final,
        "title": title.group(1).strip() if title else "",
        "creator": creator.group(1) if creator else None,
        "candidates": media,
        "embeds": embeds,
    }
    if not media:
        meta["note"] = ("No native video module found. " + (f"Embedded players: {', '.join(embeds)}. Open one in the browser and copy its video source." if embeds else "The project may use images or GIF modules only."))
    return meta


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("--slug")
    ap.add_argument("--out", default=str(REPO / "refs"))
    args = ap.parse_args()
    url = args.url.strip()
    host = urllib.parse.urlparse(url).netloc.lower()

    try:
        if MEDIA_RE.fullmatch(url):
            meta = {"platform": "direct", "source_url": url, "title": "", "creator": None, "candidates": [url]}
        elif "pinterest." in host or host.endswith("pin.it"):
            meta = from_pinterest(url)
        elif "behance.net" in host:
            meta = from_behance(url)
        else:
            _, body = http_get(url)
            meta = {"platform": "page", "source_url": url, "title": "", "creator": None,
                    "candidates": MEDIA_RE.findall(body.decode("utf-8", "replace").replace("\\/", "/"))}
    except PermissionError as err:
        print(json.dumps({"ok": False, "blocked": True, "message": f"{err} Open the link in the user's browser, copy the <video> src, and rerun with that URL."}, ensure_ascii=False))
        return 3
    except Exception as err:
        print(json.dumps({"ok": False, "message": str(err)}, ensure_ascii=False))
        return 3

    best = pick_best(meta.get("candidates") or [])
    slug = args.slug or slugify(meta.get("title") or meta.get("pin_id") or "reference")
    out = Path(args.out) / slug
    out.mkdir(parents=True, exist_ok=True)
    meta["slug"] = slug
    if not best:
        (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"ok": False, "folder": str(out), **{k: meta.get(k) for k in ("platform", "note", "outbound_link", "embeds")}}, ensure_ascii=False))
        return 2
    ext = Path(urllib.parse.urlparse(best).path).suffix or ".mp4"
    _, data = http_get(best, timeout=120)
    video = out / f"reference{ext}"
    video.write_bytes(data)
    meta.update({"video_url": best, "file": str(video), "bytes": len(data)})
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "folder": str(out), "file": str(video), "creator": meta.get("creator"), "title": meta.get("title")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
