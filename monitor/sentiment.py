"""Labels a mention as positive, negative or neutral.

Uses a simple Persian word list by default. If ANTHROPIC_API_KEY is set,
asks Claude instead, which understands context and sarcasm much better.
"""

import json
import os
import urllib.request

from .matcher import normalize

NEGATIVE = [
    "کلاهبرداری", "کلاهبردار", "کلاه برداری", "پولمو", "پولم", "پس نمیدن", "پس ندادن",
    "بی ارزش", "بیارزش", "دروغ", "فریب", "شیاد", "ضرر", "پشیمون", "پشیمان",
    "افتضاح", "بد بود", "ناراضی", "شکایت", "اسکم", "scam", "fraud", "جواب نمیدن",
    "پاسخگو نیستن", "گرون", "ارزش نداره", "نخرید", "توصیه نمیکنم",
]
POSITIVE = [
    "عالی", "راضی", "ممنون", "مرسی", "خوب بود", "کاربردی", "مفید", "توصیه میکنم",
    "ارزششو داشت", "ارزش داشت", "بهترین", "درآمد داشتم", "نتیجه گرفتم", "حرفه ای",
    "حرفهای", "پشتیبانی خوب", "عالیه", "دمتون گرم",
]

_LABELS = {"positive", "negative", "neutral"}


def _lexicon(text: str) -> str:
    t = normalize(text)
    neg = sum(normalize(w) in t for w in NEGATIVE)
    pos = sum(normalize(w) in t for w in POSITIVE)
    if neg > pos:
        return "negative"
    if pos > neg:
        return "positive"
    return "neutral"


def _claude(text: str, api_key: str) -> str:
    prompt = (
        "The following Persian text mentions the brand Behzad eCom (بهزاد ایکام). "
        "Classify the author's sentiment toward the brand. "
        "Answer with exactly one word: positive, negative or neutral.\n\n" + text[:3000]
    )
    body = json.dumps({
        "model": os.environ.get("CLAUDE_MODEL", "claude-haiku-5-5"),
        "max_tokens": 5,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body, method="POST",
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        answer = json.load(resp)["content"][0]["text"].strip().lower()
    return answer if answer in _LABELS else "neutral"


def classify(text: str) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        try:
            return _claude(text, api_key)
        except Exception as exc:  # fall back rather than lose the mention
            print(f"Claude sentiment failed, using word list: {exc}")
    return _lexicon(text)
