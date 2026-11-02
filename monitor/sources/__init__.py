"""Mention sources.

Each source is a function `fetch(config) -> list[Mention]`. To add a new
site or platform, write a module here and add it to SOURCES.
A source must only use official APIs or pages that allow automated reading.
"""

from . import serper, youtube

SOURCES = {
    "google": serper.fetch,
    "youtube": youtube.fetch,
}
