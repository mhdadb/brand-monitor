"""Runs one monitoring pass: collect, filter, label, store, report.

    python -m monitor.main            # normal run
    python -m monitor.main --dry-run  # print the report, don't send or save
"""

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .matcher import find_match
from .sentiment import classify
from .sources import SOURCES
from .telegram import build_messages, send_report

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "keywords.json"
SEEN = ROOT / "data" / "seen.json"
LOG = ROOT / "data" / "mentions.csv"
LOG_FIELDS = ["found_at", "sentiment", "source", "site", "published", "matched_term", "title", "url", "text"]


def run(dry_run: bool = False) -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    seen = set(json.loads(SEEN.read_text())) if SEEN.exists() else set()

    collected = []
    for name, fetch in SOURCES.items():
        found = fetch(config)
        print(f"{name}: {len(found)} results")
        collected.extend(found)

    new, urls = [], set()
    for m in collected:
        if m.url in seen or m.url in urls:
            continue
        m.matched_term = find_match(f"{m.title} {m.text} {m.url}", config["brand_terms"],
                                    config.get("max_typos", 2)) or ""
        if not m.matched_term and not m.extra.get("on_brand_video"):
            continue  # search engines return loose matches; keep only real mentions
        m.sentiment = classify(m.text or m.title)
        new.append(m)
        urls.add(m.url)
    print(f"{len(new)} new mentions")

    if dry_run:
        print("\n\n".join(build_messages(new)))
        return
    send_report(new)

    SEEN.parent.mkdir(exist_ok=True)
    SEEN.write_text(json.dumps(sorted(seen | urls), ensure_ascii=False, indent=0))
    write_header = not LOG.exists()
    with LOG.open("a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_FIELDS)
        if write_header:
            writer.writeheader()
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
        for m in new:
            writer.writerow({"found_at": now, "sentiment": m.sentiment, "source": m.source,
                             "site": m.site, "published": m.published, "matched_term": m.matched_term,
                             "title": m.title, "url": m.url, "text": m.text})


if __name__ == "__main__":
    run(dry_run="--dry-run" in sys.argv)
