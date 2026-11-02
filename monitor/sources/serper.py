"""Google search results through the Serper API (https://serper.dev).

Many Iranian forums block automated reading in robots.txt, so instead of
crawling them we find their pages in Google and report the link and snippet.
"""

import json
import os
import urllib.request
from urllib.parse import urlparse

from ..models import Mention

API_URL = "https://google.serper.dev/search"


def _search(query: str, api_key: str, period: str) -> list[dict]:
    body = json.dumps({"q": query, "hl": "fa", "num": 20, "tbs": period}).encode()
    req = urllib.request.Request(
        API_URL, data=body, method="POST",
        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp).get("organic", [])


def fetch(config: dict) -> list[Mention]:
    api_key = os.environ.get("SERPER_API_KEY")
    if not api_key:
        print("SERPER_API_KEY not set, skipping Google search")
        return []
    own = set(config.get("own_domains", []))
    mentions = []
    for query in config["search_queries"]:
        try:
            results = _search(query, api_key, config.get("search_period", "qdr:w"))
        except Exception as exc:
            print(f"Serper search failed for {query!r}: {exc}")
            continue
        for r in results:
            site = urlparse(r.get("link", "")).netloc.removeprefix("www.")
            if not site or site in own:
                continue
            mentions.append(Mention(
                url=r["link"], title=r.get("title", ""), text=r.get("snippet", ""),
                source="google", site=site, published=r.get("date", ""),
            ))
    return mentions
