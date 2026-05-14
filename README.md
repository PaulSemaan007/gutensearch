# GutenSearch

A small search engine over ten public domain novels from Project Gutenberg. Final project for CECS 429.

## Build

Needs Python 3.8 or newer. Standard library only, no dependencies.

    python build_index.py

This downloads the books and writes the index to data/index.json.

## Run

    python -m http.server 8000

Then open http://localhost:8000 in a browser.

Live version at https://paulsemaan007.github.io/gutensearch/
