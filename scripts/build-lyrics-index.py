import json, re, time, urllib.parse, urllib.request, sys
from concurrent.futures import ThreadPoolExecutor

SRC = "/root/vitrail/src/lib/demoCatalog.ts"
OUT = "/root/vitrail/src/lib/lyricsIndex.ts"

text = open(SRC, encoding="utf-8").read()
blocks = text.split("  {\n")[1:]
tracks = []
for b in blocks:
    bid = re.search(r'id: "([^"]+)"', b)
    title = re.search(r'title: ("(?:[^"\\]|\\.)*")', b)
    dur = re.search(r"durationSec: (\d+)", b)
    if bid and title and dur:
        tracks.append({"id": bid.group(1), "title": json.loads(title.group(1)), "dur": int(dur.group(1))})

print("tracks parsed:", len(tracks), flush=True)
if len(tracks) != 65:
    print("ATTENTION: nombre inattendu", flush=True)

def query(t):
    params = urllib.parse.urlencode({"track_name": t["title"], "artist_name": "Josh Woodward"})
    url = f"https://lrclib.net/api/search?{params}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Vitrail/0.1 (demo lyrics index)"})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except Exception:
            time.sleep(2 + attempt * 2)
    return None

def work(t):
    data = query(t)
    time.sleep(0.35)
    if data is None:
        return t["id"], "error", None
    best, delta_best = None, 10**9
    for x in data:
        if not (x.get("syncedLyrics") or x.get("plainLyrics")):
            continue
        d = abs((x.get("duration") or 0) - t["dur"])
        if d < delta_best:
            best, delta_best = x, d
    if best is None or delta_best > 8:
        return t["id"], "none", None
    return t["id"], ("synced" if best.get("syncedLyrics") else "plain"), t["title"]

results = {}
with ThreadPoolExecutor(max_workers=4) as ex:
    for i, (tid, status, title) in enumerate(ex.map(work, tracks), start=1):
        results[tid] = status
        if status in ("synced", "plain"):
            print(f"[{i}/{len(tracks)}] {status}: {title}", flush=True)

synced = sorted([k for k, v in results.items() if v == "synced"])
plain = sorted([k for k, v in results.items() if v == "plain"])
print("synced:", len(synced), "plain:", len(plain), "total:", len(results), flush=True)

lines = [
    "/**",
    " * Fichier généré : morceaux du catalogue de démo dont LRCLIB possède les paroles.",
    " * Régénérer avec scripts/build-lyrics-index.py.",
    " */",
    "export const LYRICS_IDS: ReadonlySet<string> = new Set([",
]
for tid in synced:
    lines.append(f'  "{tid}",')
lines.append("])")
lines.append("")
lines.append("export const LYRICS_SYNCED_IDS: ReadonlySet<string> = LYRICS_IDS")
lines.append("")
open(OUT, "w", encoding="utf-8").write("\n".join(lines))
print("écrit:", OUT, flush=True)
