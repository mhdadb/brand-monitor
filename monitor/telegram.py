"""Sends the report to Telegram."""

import html
import json
import os
import urllib.request

from .models import Mention

LIMIT = 4000  # Telegram allows 4096 characters per message
ICONS = {"negative": "🔴", "positive": "🟢", "neutral": "⚪️"}
LABELS = {"negative": "منفی", "positive": "مثبت", "neutral": "خنثی"}


def _send(token: str, chat_id: str, text: str) -> None:
    body = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML",
                       "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage",
                                 data=body, headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=30).read()


def _format(m: Mention) -> str:
    snippet = m.text.replace("\n", " ")
    if len(snippet) > 300:
        snippet = snippet[:300] + "…"
    date = f" · {html.escape(m.published)}" if m.published else ""
    return (f"{ICONS[m.sentiment]} <b>{LABELS[m.sentiment]}</b> · {html.escape(m.site)}{date}\n"
            f"{html.escape(m.title)}\n<i>{html.escape(snippet)}</i>\n"
            f"<a href=\"{html.escape(m.url)}\">منبع</a>")


def build_messages(mentions: list[Mention]) -> list[str]:
    order = {"negative": 0, "neutral": 1, "positive": 2}
    mentions = sorted(mentions, key=lambda m: order[m.sentiment])
    counts = {s: sum(m.sentiment == s for m in mentions) for s in order}
    header = (f"📊 <b>گزارش پایش بهزاد ایکام</b>\n"
              f"{len(mentions)} اشاره‌ی جدید: 🔴 {counts['negative']} منفی · "
              f"⚪️ {counts['neutral']} خنثی · 🟢 {counts['positive']} مثبت")
    if not mentions:
        return [header.split("\n")[0] + "\nامروز اشاره‌ی جدیدی پیدا نشد."]
    messages, current = [], header
    for m in mentions:
        block = "\n\n" + _format(m)
        if len(current) + len(block) > LIMIT:
            messages.append(current)
            current = block.strip()
        else:
            current += block
    messages.append(current)
    return messages


def send_report(mentions: list[Mention]) -> None:
    token, chat_id = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    messages = build_messages(mentions)
    if not token or not chat_id:
        print("Telegram not configured; report would be:\n")
        print("\n\n---\n\n".join(messages))
        return
    for text in messages:
        _send(token, chat_id, text)
