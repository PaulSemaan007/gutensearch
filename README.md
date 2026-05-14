# GutenSearch

A mini search engine over ten classic public domain novels from Project Gutenberg, built as the final project for CECS 429 at CSULB, Spring 2026.

## Live demo

After deploying with GitHub Pages, the site lives at
`https://<your-github-username>.github.io/<repo-name>/`

## Features

- Tokenization with stopword handling, no stemming
- Positional inverted index
- Boolean queries with AND, OR, and NOT
- Phrase queries (wrap in double quotes for exact match)
- Wildcard queries like `runn*`, `*ing`, `w*ld` via a 3-gram index
- Ranked retrieval using tf-idf cosine similarity or BM25
- Spelling correction using Damerau-Levenshtein edit distance with a 3-gram pre-filter

## Corpus

Ten public domain English novels from Project Gutenberg.

| Gutenberg ID | Title | Author |
|--------------|-------|--------|
| 1342 | Pride and Prejudice | Jane Austen |
| 1661 | The Adventures of Sherlock Holmes | Arthur Conan Doyle |
| 11   | Alice's Adventures in Wonderland | Lewis Carroll |
| 46   | A Christmas Carol | Charles Dickens |
| 84   | Frankenstein | Mary Shelley |
| 345  | Dracula | Bram Stoker |
| 174  | The Picture of Dorian Gray | Oscar Wilde |
| 35   | The Time Machine | H. G. Wells |
| 36   | The War of the Worlds | H. G. Wells |
| 74   | The Adventures of Tom Sawyer | Mark Twain |

## How to build the index

You need Python 3.8 or higher. There are no external dependencies (standard library only).

```
python build_index.py
```

This downloads the ten books from Project Gutenberg into `corpus/`, then writes the index to `data/index.json` and per-document text to `data/docs/*.txt`. The download is cached so re-runs are fast.

## How to run locally

After building, serve the project root with any static file server.

```
python -m http.server 8000
```

Then open `http://localhost:8000/` in a browser.

## How to deploy to GitHub Pages

1. Push this folder to GitHub
2. In the repo's Settings tab, go to Pages
3. Set source to `Deploy from a branch`
4. Pick the `main` branch and the `/ (root)` folder
5. Save and wait about a minute
6. Visit `https://<username>.github.io/<repo-name>/`

## Repository layout

```
.
├── index.html              search UI
├── app.js                  search engine logic in the browser
├── style.css               styles
├── build_index.py          builds the index from the corpus
├── corpus/                 raw downloaded book text (created by build script)
├── data/                   built index artifacts (created by build script)
│   ├── index.json
│   └── docs/<id>.txt
├── Project_2_Report.html   writeup
├── Project_2_Slides.html   presentation deck
├── Project_2_Script.html   reading script for the presentation
└── README.md
```

## Author

Paul Semaan, CECS 429, Professor Xin Qin, Spring 2026.
