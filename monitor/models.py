from dataclasses import dataclass, field


@dataclass
class Mention:
    url: str
    title: str
    text: str
    source: str            # e.g. "google", "youtube"
    site: str              # domain where the mention lives
    published: str = ""    # date as given by the source, if any
    matched_term: str = ""
    sentiment: str = ""
    extra: dict = field(default_factory=dict)
