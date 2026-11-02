"""YouTube videos and their comments, through the official YouTube Data API.

Finds recent videos that mention the brand and collects the latest comments
under them. Needs YOUTUBE_API_KEY; skipped when it is not set.
"""

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from ..models import Mention

API = "https://www.googleapis.com/youtube/v3/"
LOOKBACK_DAYS = 30
COMMENTS_PER_VIDEO = 50


def _get(endpoint: str, params: dict) -> dict:
    with urllib.request.urlopen(API + endpoint + "?" + urlencode(params), timeout=30) as resp:
        return json.load(resp)


def fetch(config: dict) -> list[Mention]:
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        print("YOUTUBE_API_KEY not set, skipping YouTube")
        return []
    since = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    video_ids = set(config.get("youtube_video_ids", []))
    for query in config.get("youtube_queries", config["search_queries"][:3]):
        try:
            data = _get("search", {"part": "id", "q": query.replace('"', ""), "type": "video",
                                   "order": "date", "publishedAfter": since,
                                   "maxResults": 25, "key": api_key})
            video_ids.update(item["id"]["videoId"] for item in data.get("items", []))
        except Exception as exc:
            print(f"YouTube search failed for {query!r}: {exc}")

    mentions = []
    for vid in video_ids:
        try:
            data = _get("commentThreads", {"part": "snippet", "videoId": vid, "order": "time",
                                           "maxResults": COMMENTS_PER_VIDEO, "textFormat": "plainText",
                                           "key": api_key})
        except Exception as exc:  # comments disabled, quota, etc.
            print(f"YouTube comments failed for {vid}: {exc}")
            continue
        for item in data.get("items", []):
            c = item["snippet"]["topLevelComment"]["snippet"]
            mentions.append(Mention(
                url=f"https://www.youtube.com/watch?v={vid}&lc={item['id']}",
                title=f"کامنت {c.get('authorDisplayName', '')}",
                text=c.get("textDisplay", ""), source="youtube", site="youtube.com",
                published=c.get("publishedAt", "")[:10],
                extra={"on_brand_video": True},
            ))
    return mentions
