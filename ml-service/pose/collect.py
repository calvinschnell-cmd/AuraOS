"""AURA OS pose dataset, step 1: automated collection (weak labels).

Only the category search terms below are chosen by hand, never individual
poses. For each archetype this pulls freely licensed photos from Wikimedia
Commons (official API, CC / public-domain files only) as ~500px thumbnails and
records attribution in data/manifest.jsonl. Images stay local (gitignored):
the repo only ever holds the extracted landmark vectors and the trained model.

Run:  .venv\\Scripts\\python collect.py [--per-class 160] [--only dance,standing]
      .venv\\Scripts\\python collect.py --repair   (attribution for files missing from the manifest)
"""

import argparse
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia asks for a descriptive User-Agent on API and upload requests.
USER_AGENT = "AuraOS-PoseDataset/0.1 (HackGT 13 hackathon project; pose classifier training)"
ALLOWED_HOSTS = {"upload.wikimedia.org", "thumb.wikimedia.org"}
ALLOWED_MIME = {"image/jpeg", "image/png"}
# Wikimedia serves standard thumbnail buckets; 500px is plenty for full-body landmarks.
THUMB_WIDTH = 500
# Pause between downloads, and the backoff schedule when Wikimedia answers 429.
DOWNLOAD_PAUSE_S = 2.0
RETRY_BACKOFF_S = (5, 15, 45)
MAX_BYTES = 3 * 1024 * 1024
MIN_SIDE = 300

# Archetype -> search terms (the weak label is the archetype of the query).
# Queries run in order, so the second batch (women's fashion, cosplay and dance
# poses the first dataset was thin on) comes first on a re-run with a higher
# --per-class.
CATEGORIES: dict[str, list[str]] = {
    "runway": [
        "fashion editorial photoshoot model",
        "fashion model posing full length",
        "runway model catwalk",
        "fashion week catwalk model",
        "fashion show runway walk",
        "model walking runway",
        "catwalk model fashion show",
    ],
    "hero": [
        "captain marvel cosplay",
        "supergirl cosplay",
        "storm x-men cosplay",
        "superhero cosplay",
        "superman cosplay",
        "wonder woman cosplay",
        "captain america cosplay",
        "spider-man cosplay",
        "batman cosplay",
    ],
    "action": [
        "sailor moon cosplay",
        "magical girl cosplay",
        "demon slayer cosplay",
        "anime cosplay pose",
        "cosplay sword pose",
        "naruto cosplay",
        "dragon ball cosplay",
        "cosplay action pose",
        "one piece cosplay",
    ],
    "fighter": [
        "women's boxing",
        "kickboxing stance",
        "women's karate",
        "karate kata",
        "kung fu stance",
        "martial arts stance",
        "taekwondo poomsae",
        "wushu performance",
        "boxing stance",
    ],
    "dance": [
        "ballerina",
        "cheerleader jump",
        "k-pop dance performance",
        "jazz dance",
        "dancer leap",
        "ballet jump",
        "breakdance",
        "hip hop dancer",
        "dancer jumping",
        "contemporary dance performance",
    ],
    "standing": [
        "full length portrait woman dress",
        "woman standing street fashion",
        "full length portrait standing man",
        "full length portrait standing woman",
        "person standing full body",
        "standing portrait full-length photograph",
        "man standing street portrait",
    ],
}

FREE_LICENSE = re.compile(r"^(cc0|cc[ -]by([ -]sa)?|public domain|pd\b|attribution)", re.IGNORECASE)


def fetch(url: str, limit: int | None = None) -> bytes:
    """GET with Wikimedia's etiquette: honor 429 Retry-After, back off, give up after a few tries."""
    for attempt in range(len(RETRY_BACKOFF_S) + 1):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return res.read() if limit is None else res.read(limit)
        except urllib.error.HTTPError as err:
            if err.code != 429 or attempt == len(RETRY_BACKOFF_S):
                raise
            retry_after = err.headers.get("Retry-After")
            wait = int(retry_after) if retry_after and retry_after.isdigit() else RETRY_BACKOFF_S[attempt]
            print(f"  .. 429, waiting {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def get_json(params: dict) -> dict:
    return json.loads(fetch(f"{API}?{urllib.parse.urlencode(params)}"))


def strip_html(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def search(query: str, offset: int, limit: int = 50) -> tuple[list[dict], int | None]:
    data = get_json(
        {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": f"{query} filetype:bitmap",
            "gsrnamespace": 6,
            "gsrlimit": limit,
            "gsroffset": offset,
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": THUMB_WIDTH,
            "iiextmetadatafilter": "LicenseShortName|Artist",
        }
    )
    pages = sorted(data.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    nxt = data.get("continue", {}).get("gsroffset")
    return pages, (int(nxt) if nxt is not None else None)


def download(url: str, dest: Path) -> int:
    host = urllib.parse.urlparse(url).hostname
    if host not in ALLOWED_HOSTS:
        raise ValueError(f"unexpected host {host}")
    body = fetch(url, MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise ValueError("too large")
    if not (body[:3] == b"\xff\xd8\xff" or body[:8] == b"\x89PNG\r\n\x1a\n"):
        raise ValueError("not a jpeg/png")
    dest.write_bytes(body)
    return len(body)


def manifest_line(category: str, query: str, file: str, title: str, info: dict) -> str:
    meta = info.get("extmetadata", {})
    return json.dumps(
        {
            "file": file,
            "category": category,
            "query": query,
            "title": title,
            "license": strip_html(meta.get("LicenseShortName", {}).get("value", "")),
            "artist": strip_html(meta.get("Artist", {}).get("value", ""))[:200],
            "source": info.get("descriptionurl"),
        }
    )


def repair(out: Path) -> int:
    """Files on disk without a manifest line (an interrupted run): fetch their
    attribution by page id from the Commons API and append it, or delete the
    file when it is not freely licensed."""
    manifest_path = out / "manifest.jsonl"
    known = set()
    if manifest_path.exists():
        for line in manifest_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                known.add(json.loads(line)["file"])
    orphans = [f for f in sorted((out / "raw").glob("*/*")) if f"raw/{f.parent.name}/{f.name}" not in known]
    print(f"{len(orphans)} files without attribution")
    fixed = 0
    with manifest_path.open("a", encoding="utf-8") as manifest:
        for i in range(0, len(orphans), 50):
            batch = orphans[i : i + 50]
            ids = {f.stem.rsplit("_", 1)[-1]: f for f in batch}
            data = get_json(
                {
                    "action": "query",
                    "format": "json",
                    "pageids": "|".join(ids),
                    "prop": "imageinfo",
                    "iiprop": "url|extmetadata",
                    "iiextmetadatafilter": "LicenseShortName|Artist",
                }
            )
            for pid, page in data.get("query", {}).get("pages", {}).items():
                f = ids.get(pid)
                info = (page.get("imageinfo") or [{}])[0]
                license_name = strip_html(info.get("extmetadata", {}).get("LicenseShortName", {}).get("value", ""))
                if not f:
                    continue
                if not FREE_LICENSE.search(license_name):
                    f.unlink(missing_ok=True)
                    continue
                manifest.write(manifest_line(f.parent.name, "(repaired)", f"raw/{f.parent.name}/{f.name}", page.get("title", ""), info) + "\n")
                manifest.flush()
                fixed += 1
            time.sleep(1)
    print(f"repaired {fixed}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=160)
    ap.add_argument("--only", default="", help="comma-separated categories to collect")
    ap.add_argument("--repair", action="store_true")
    ap.add_argument("--out", default=str(Path(__file__).parent / "data"))
    args = ap.parse_args()
    only = {c.strip() for c in args.only.split(",") if c.strip()}

    out = Path(args.out)
    if args.repair:
        return repair(out)
    raw = out / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    manifest_path = out / "manifest.jsonl"
    seen: set[str] = set()
    if manifest_path.exists():
        for line in manifest_path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                seen.add(json.loads(line)["title"])

    total_bytes = 0
    with manifest_path.open("a", encoding="utf-8") as manifest:
        for category, queries in CATEGORIES.items():
            if only and category not in only:
                continue
            (raw / category).mkdir(exist_ok=True)
            have = len(list((raw / category).glob("*")))
            per_query = max(1, -(-args.per_class // len(queries)))
            for query in queries:
                if have >= args.per_class:
                    break
                got, offset = 0, 0
                while got < per_query and have < args.per_class and offset is not None and offset < 400:
                    try:
                        pages, offset = search(query, offset)
                    except Exception as err:  # noqa: BLE001 - keep going on a flaky page
                        print(f"  ! search failed ({query}): {err}", file=sys.stderr)
                        break
                    for page in pages:
                        if got >= per_query or have >= args.per_class:
                            break
                        title = page.get("title", "")
                        info = (page.get("imageinfo") or [{}])[0]
                        meta = info.get("extmetadata", {})
                        license_name = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
                        if title in seen or info.get("mime") not in ALLOWED_MIME:
                            continue
                        if not FREE_LICENSE.search(license_name):
                            continue
                        if min(info.get("width", 0), info.get("height", 0)) < MIN_SIDE:
                            continue
                        url = info.get("thumburl") or info.get("url")
                        if not url:
                            continue
                        seen.add(title)
                        ext = ".png" if info.get("mime") == "image/png" else ".jpg"
                        name = f"{category}_{page['pageid']}{ext}"
                        try:
                            size = download(url, raw / category / name)
                        except Exception as err:  # noqa: BLE001
                            print(f"  ! {title}: {err}", file=sys.stderr)
                            continue
                        total_bytes += size
                        got += 1
                        have += 1
                        manifest.write(manifest_line(category, query, f"raw/{category}/{name}", title, info) + "\n")
                        # Flushed per file: an interrupted run never loses attribution.
                        manifest.flush()
                        time.sleep(DOWNLOAD_PAUSE_S)
                print(f"{category:9s} {query!r}: +{got} (class total {have})")
    print(f"downloaded {total_bytes / 1e6:.1f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
