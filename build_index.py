#!/usr/bin/env python3
"""
build_index.py

Builds the GutenSearch index over a small Project Gutenberg corpus.
Downloads ten public-domain novels, tokenizes them, and writes a JSON
index suitable for in-browser search. Python 3.8+, standard library only.

Output:
    corpus/<id>.txt          raw downloaded book (cached)
    data/index.json          inverted index, k-gram index, doc metadata
    data/docs/<id>.txt       cleaned book text (used for snippets)
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
from collections import defaultdict
from math import log, sqrt

CORPUS = [
    (1342, "Pride and Prejudice",                "Jane Austen"),
    (1661, "The Adventures of Sherlock Holmes",  "Arthur Conan Doyle"),
    (11,   "Alice's Adventures in Wonderland",   "Lewis Carroll"),
    (46,   "A Christmas Carol",                  "Charles Dickens"),
    (84,   "Frankenstein",                       "Mary Shelley"),
    (345,  "Dracula",                            "Bram Stoker"),
    (174,  "The Picture of Dorian Gray",         "Oscar Wilde"),
    (35,   "The Time Machine",                   "H. G. Wells"),
    (36,   "The War of the Worlds",              "H. G. Wells"),
    (74,   "The Adventures of Tom Sawyer",       "Mark Twain"),
]

CORPUS_DIR = "corpus"
DATA_DIR = "data"
DOCS_DIR = os.path.join(DATA_DIR, "docs")

STOPWORDS = set("""
a an the and or but if of in on at to for from with by as is are was were be been
being i you he she it we they him her them my your his their our this that these
those not no so do does did have has had will would could should can may might
""".split())

TOKEN_RE = re.compile(r"[A-Za-z']+")

GUTENBERG_URLS = [
    "https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt",
    "https://www.gutenberg.org/files/{id}/{id}-0.txt",
    "https://www.gutenberg.org/files/{id}/{id}.txt",
]


def tokenize(text):
    """Yield (term, position) tuples. Position is offset in token stream."""
    pos = 0
    for m in TOKEN_RE.finditer(text):
        raw = m.group(0).lower().replace("'", "")
        if raw:
            yield raw, pos
            pos += 1


def download_book(book_id):
    path = os.path.join(CORPUS_DIR, f"{book_id}.txt")
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return path
    last_err = None
    for tpl in GUTENBERG_URLS:
        url = tpl.format(id=book_id)
        try:
            print(f"  downloading {url}")
            req = urllib.request.Request(
                url, headers={"User-Agent": "Mozilla/5.0 GutenSearch"}
            )
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read().decode("utf-8", errors="replace")
            with open(path, "w", encoding="utf-8") as f:
                f.write(data)
            return path
        except urllib.error.URLError as e:
            last_err = e
            continue
    raise RuntimeError(f"could not download book {book_id}: {last_err}")


def strip_gutenberg(text):
    """Remove the Project Gutenberg license header and footer."""
    m = re.search(r"\*\*\*\s*START OF (THE |THIS )?PROJECT GUTENBERG.*?\*\*\*",
                  text, re.IGNORECASE)
    if m:
        text = text[m.end():]
    m = re.search(r"\*\*\*\s*END OF (THE |THIS )?PROJECT GUTENBERG.*?\*\*\*",
                  text, re.IGNORECASE)
    if m:
        text = text[:m.start()]
    return text.strip()


def delta_encode(positions):
    """Delta-encode a sorted list of integers. First value stays absolute."""
    if not positions:
        return []
    out = [positions[0]]
    for i in range(1, len(positions)):
        out.append(positions[i] - positions[i - 1])
    return out


def build():
    os.makedirs(CORPUS_DIR, exist_ok=True)
    os.makedirs(DOCS_DIR, exist_ok=True)

    documents = {}
    # postings[term][doc_id] -> list of absolute positions
    postings = defaultdict(lambda: defaultdict(list))
    doc_lengths = {}

    for book_id, title, author in CORPUS:
        print(f"processing {book_id}  {title}")
        path = download_book(book_id)
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        text = strip_gutenberg(raw)
        doc_id = str(book_id)
        documents[doc_id] = {
            "title": title,
            "author": author,
            "url": f"https://www.gutenberg.org/ebooks/{book_id}",
        }
        with open(os.path.join(DOCS_DIR, f"{doc_id}.txt"), "w",
                  encoding="utf-8") as f:
            f.write(text)
        count = 0
        for term, pos in tokenize(text):
            postings[term][doc_id].append(pos)
            count += 1
        doc_lengths[doc_id] = count
        documents[doc_id]["length"] = count

    N = len(documents)

    # idf and doc norms for the lnc.ltc tf-idf cosine scheme
    idf = {t: log(N / len(postings[t])) for t in postings}
    doc_norms = defaultdict(float)
    for term, dmap in postings.items():
        for doc_id, plist in dmap.items():
            tf = 1.0 + log(len(plist)) if plist else 0.0
            w = tf  # documents use lnc (no idf), queries use ltc
            doc_norms[doc_id] += w * w
    doc_norms = {d: sqrt(v) for d, v in doc_norms.items()}

    avg_dl = sum(doc_lengths.values()) / max(1, N)

    # 3-gram index for wildcard queries
    kgrams = defaultdict(set)
    for term in postings:
        padded = "$" + term + "$"
        for i in range(len(padded) - 2):
            kgrams[padded[i:i+3]].add(term)

    # Serialise. Delta-encode positions to shrink the JSON.
    postings_out = {}
    for term, dmap in postings.items():
        postings_out[term] = {
            "df": len(dmap),
            "p": [[doc_id, delta_encode(positions)]
                  for doc_id, positions in dmap.items()],
        }

    index = {
        "documents": documents,
        "postings": postings_out,
        "kgrams": {kg: sorted(terms) for kg, terms in kgrams.items()},
        "doc_norms": doc_norms,
        "doc_lengths": doc_lengths,
        "avg_doc_length": avg_dl,
        "total_docs": N,
        "stopwords": sorted(STOPWORDS),
        "positions_encoding": "delta",
    }

    out_path = os.path.join(DATA_DIR, "index.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    print()
    print(f"wrote {out_path}")
    print(f"  documents:     {N}")
    print(f"  total tokens:  {sum(doc_lengths.values()):,}")
    print(f"  unique terms:  {len(postings):,}")
    print(f"  k-grams:       {len(kgrams):,}")
    size_mb = os.path.getsize(out_path) / 1024 / 1024
    print(f"  index size:    {size_mb:.1f} MB")


if __name__ == "__main__":
    try:
        build()
    except KeyboardInterrupt:
        print("\ninterrupted")
        sys.exit(1)
