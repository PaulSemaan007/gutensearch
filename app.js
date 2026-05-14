// app.js — client-side search for GutenSearch.
// Loads the JSON index built by build_index.py and runs Boolean, phrase,
// wildcard, and ranked retrieval queries (tf-idf cosine and BM25),
// plus Damerau-Levenshtein spelling correction with a 3-gram pre-filter.

const INDEX_URL = "data/index.json";

let INDEX = null;
let STOPWORDS = null;
const DOC_CACHE = new Map();

const $ = (id) => document.getElementById(id);
const statusEl = () => $("status");
const resultsEl = () => $("results");

document.addEventListener("DOMContentLoaded", main);

async function main() {
  $("search-form").addEventListener("submit", onSearch);
  statusEl().textContent = "Loading index...";
  try {
    const t0 = performance.now();
    const resp = await fetch(INDEX_URL);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    INDEX = await resp.json();
    STOPWORDS = new Set(INDEX.stopwords);
    const t1 = performance.now();
    const N = INDEX.total_docs;
    const T = Object.keys(INDEX.postings).length;
    statusEl().textContent =
      `Index loaded. ${N} documents, ${T.toLocaleString()} unique terms ` +
      `(${Math.round(t1 - t0)} ms).`;
  } catch (e) {
    statusEl().textContent =
      "Failed to load the index. Run build_index.py first, then refresh. (" +
      e.message + ")";
    statusEl().classList.add("error");
  }
}

// ---------- Tokenization ----------

function tokenize(text) {
  const out = [];
  const re = /[A-Za-z']+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].toLowerCase().replace(/'/g, "");
    if (t) out.push(t);
  }
  return out;
}

// ---------- Posting list access ----------

function decodePositions(deltas) {
  if (!deltas.length) return [];
  const out = new Array(deltas.length);
  out[0] = deltas[0];
  for (let i = 1; i < deltas.length; i++) out[i] = out[i - 1] + deltas[i];
  return out;
}

// Returns Map<doc_id, absolutePositions[]> or null if term not in index.
function getPostings(term) {
  const entry = INDEX.postings[term];
  if (!entry) return null;
  const m = new Map();
  for (const [docId, deltas] of entry.p) m.set(docId, decodePositions(deltas));
  return m;
}

function docFreq(term) {
  const e = INDEX.postings[term];
  return e ? e.df : 0;
}

// ---------- Set operations ----------

function setIntersect(a, b) {
  const out = new Set();
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) out.add(x);
  return out;
}
function setUnion(a, b) {
  const out = new Set(a);
  for (const x of b) out.add(x);
  return out;
}
function setDiff(a, b) {
  const out = new Set();
  for (const x of a) if (!b.has(x)) out.add(x);
  return out;
}

// ---------- Boolean query ----------

function lexBoolean(q) {
  const re = /\s*(\(|\)|\bAND\b|\bOR\b|\bNOT\b|[A-Za-z']+)\s*/g;
  const raw = [];
  let m;
  while ((m = re.exec(q)) !== null) raw.push(m[1]);
  // Collapse "NOT term" into a single negated-term token "~term"
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i];
    if (tok === "NOT" && i + 1 < raw.length &&
        /^[A-Za-z']+$/.test(raw[i + 1]) &&
        raw[i + 1] !== "AND" && raw[i + 1] !== "OR") {
      out.push("~" + raw[i + 1].toLowerCase());
      i++;
    } else if (tok === "AND" || tok === "OR" || tok === "(" || tok === ")") {
      out.push(tok);
    } else {
      out.push(tok.toLowerCase());
    }
  }
  return out;
}

function toRPN(tokens) {
  const prec = { OR: 1, AND: 2 };
  const out = [];
  const stack = [];
  for (const t of tokens) {
    if (t === "(") {
      stack.push(t);
    } else if (t === ")") {
      while (stack.length && stack[stack.length - 1] !== "(")
        out.push(stack.pop());
      stack.pop();
    } else if (t in prec) {
      while (stack.length && stack[stack.length - 1] in prec &&
             prec[stack[stack.length - 1]] >= prec[t])
        out.push(stack.pop());
      stack.push(t);
    } else {
      out.push(t);
    }
  }
  while (stack.length) out.push(stack.pop());
  return out;
}

function evalBoolean(rpn) {
  const allDocs = new Set(Object.keys(INDEX.documents));
  const stack = [];
  for (const t of rpn) {
    if (t === "AND") {
      const b = stack.pop(), a = stack.pop();
      stack.push(setIntersect(a, b));
    } else if (t === "OR") {
      const b = stack.pop(), a = stack.pop();
      stack.push(setUnion(a, b));
    } else if (t.startsWith("~")) {
      const term = t.slice(1);
      const post = getPostings(term);
      const docs = post ? new Set(post.keys()) : new Set();
      stack.push(setDiff(allDocs, docs));
    } else {
      const post = getPostings(t);
      stack.push(post ? new Set(post.keys()) : new Set());
    }
  }
  return stack.length ? stack[0] : new Set();
}

// ---------- Phrase query ----------

function phraseQuery(phraseTerms) {
  if (phraseTerms.length === 0) return new Set();
  if (phraseTerms.length === 1) {
    const p = getPostings(phraseTerms[0]);
    return p ? new Set(p.keys()) : new Set();
  }
  const postings = phraseTerms.map(getPostings);
  if (postings.some(p => p === null)) return new Set();
  let docs = new Set(postings[0].keys());
  for (let i = 1; i < postings.length; i++)
    docs = setIntersect(docs, new Set(postings[i].keys()));
  const matched = new Set();
  for (const docId of docs) {
    const first = postings[0].get(docId);
    for (const pos of first) {
      let ok = true;
      for (let i = 1; i < postings.length; i++) {
        if (!binarySearchPos(postings[i].get(docId), pos + i)) {
          ok = false;
          break;
        }
      }
      if (ok) { matched.add(docId); break; }
    }
  }
  return matched;
}

function binarySearchPos(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] === target) return true;
    if (arr[mid] < target) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

// ---------- Wildcard query ----------

function wildcardQuery(pattern) {
  const padded = "$" + pattern + "$";
  const kgrams = [];
  for (let i = 0; i <= padded.length - 3; i++) {
    const kg = padded.slice(i, i + 3);
    if (!kg.includes("*")) kgrams.push(kg);
  }
  if (kgrams.length === 0) return [];
  let candidates = INDEX.kgrams[kgrams[0]];
  if (!candidates) return [];
  candidates = new Set(candidates);
  for (let i = 1; i < kgrams.length; i++) {
    const list = INDEX.kgrams[kgrams[i]];
    if (!list) return [];
    const set = new Set(list);
    for (const c of [...candidates]) if (!set.has(c)) candidates.delete(c);
    if (candidates.size === 0) return [];
  }
  const re = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  return [...candidates].filter(t => re.test(t));
}

// ---------- Ranked retrieval ----------

function tfidfQuery(queryTerms, topK) {
  const N = INDEX.total_docs;
  const qtf = {};
  for (const t of queryTerms) qtf[t] = (qtf[t] || 0) + 1;
  const qw = {};
  let qNorm = 0;
  for (const t in qtf) {
    const e = INDEX.postings[t];
    if (!e) continue;
    const tf = 1 + Math.log(qtf[t]);
    const idf = Math.log(N / e.df);
    qw[t] = tf * idf;
    qNorm += qw[t] * qw[t];
  }
  qNorm = Math.sqrt(qNorm);
  if (qNorm === 0) return [];
  for (const t in qw) qw[t] /= qNorm;
  const scores = new Map();
  for (const t in qw) {
    const e = INDEX.postings[t];
    for (const [docId, deltas] of e.p) {
      const tf = 1 + Math.log(deltas.length);
      const dw = tf / INDEX.doc_norms[docId];
      scores.set(docId, (scores.get(docId) || 0) + qw[t] * dw);
    }
  }
  return [...scores.entries()]
    .map(([docId, score]) => ({ docId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function bm25Query(queryTerms, topK) {
  const k1 = 1.5, b = 0.75;
  const N = INDEX.total_docs;
  const avgDL = INDEX.avg_doc_length;
  const scores = new Map();
  const qtf = {};
  for (const t of queryTerms) qtf[t] = (qtf[t] || 0) + 1;
  for (const t in qtf) {
    const e = INDEX.postings[t];
    if (!e) continue;
    const idf = Math.log((N - e.df + 0.5) / (e.df + 0.5) + 1);
    for (const [docId, deltas] of e.p) {
      const dl = INDEX.doc_lengths[docId];
      const tf = deltas.length;
      const norm = tf + k1 * (1 - b + b * dl / avgDL);
      scores.set(docId,
        (scores.get(docId) || 0) + idf * (tf * (k1 + 1)) / norm);
    }
  }
  return [...scores.entries()]
    .map(([docId, score]) => ({ docId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function rankedQuery(queryTerms, mode, topK) {
  return mode === "bm25"
    ? bm25Query(queryTerms, topK)
    : tfidfQuery(queryTerms, topK);
}

// ---------- Spelling correction ----------

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
      if (i > 1 && j > 1 &&
          a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

function spellCorrect(misspelled) {
  if (INDEX.postings[misspelled]) return null;
  const padded = "$" + misspelled + "$";
  const qKgrams = new Set();
  for (let i = 0; i <= padded.length - 3; i++)
    qKgrams.add(padded.slice(i, i + 3));
  const counts = new Map();
  for (const kg of qKgrams) {
    const terms = INDEX.kgrams[kg];
    if (!terms) continue;
    for (const t of terms) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const candidates = [];
  for (const [t, c] of counts) {
    const tPadded = "$" + t + "$";
    const denom = (padded.length - 2) + (tPadded.length - 2) - c;
    if (c / denom >= 0.3) candidates.push(t);
  }
  if (candidates.length === 0) return null;
  const scored = candidates.map(t => ({
    term: t,
    dist: editDistance(misspelled, t),
    df: docFreq(t)
  }));
  scored.sort((a, b) => a.dist - b.dist || b.df - a.df);
  return scored[0].dist <= 3 ? scored[0].term : null;
}

// ---------- Dispatcher ----------

function detectMode(q) {
  q = q.trim();
  if (/^".*"$/.test(q)) return "phrase";
  if (q.includes("*")) return "wildcard";
  if (/\b(AND|OR|NOT)\b/.test(q)) return "boolean";
  return "ranked";
}

async function onSearch(e) {
  e.preventDefault();
  const query = $("query").value.trim();
  if (!query || !INDEX) return;
  resultsEl().innerHTML = "";
  statusEl().classList.remove("error");

  const t0 = performance.now();
  const mode = detectMode(query);
  $("hint").textContent = "mode: " + mode;
  let results = [];
  let scored = false;
  let phraseStr = "";
  let wildcardPat = "";

  try {
    if (mode === "boolean") {
      const tokens = lexBoolean(query);
      const rpn = toRPN(tokens);
      const docs = evalBoolean(rpn);
      results = [...docs].map(docId => ({ docId, score: null }));
    } else if (mode === "phrase") {
      phraseStr = query.match(/"([^"]*)"/)[1];
      const docs = phraseQuery(tokenize(phraseStr));
      results = [...docs].map(docId => ({ docId, score: null }));
    } else if (mode === "wildcard") {
      wildcardPat = query.toLowerCase().match(/[a-z*']+/g)[0];
      const terms = wildcardQuery(wildcardPat);
      const docSet = new Set();
      for (const t of terms) {
        const e = INDEX.postings[t];
        if (e) for (const [docId] of e.p) docSet.add(docId);
      }
      results = [...docSet].map(docId => ({ docId, score: null }));
    } else {
      scored = true;
      const tokens = tokenize(query);
      const ranker = $("ranker").value;
      const topK = parseInt($("topk").value, 10) || 10;
      results = rankedQuery(tokens, ranker, topK);
      if (results.length === 0 && tokens.length > 0) {
        for (const t of tokens) {
          const corr = spellCorrect(t);
          if (corr) {
            renderSpellSuggest(t, corr, query);
            break;
          }
        }
      }
    }
  } catch (err) {
    statusEl().textContent = "Query error: " + err.message;
    statusEl().classList.add("error");
    return;
  }

  const t1 = performance.now();
  statusEl().textContent =
    `${results.length} result${results.length === 1 ? "" : "s"} ` +
    `in ${Math.round(t1 - t0)} ms.`;
  await renderResults(results, { mode, query, phraseStr, wildcardPat, scored });
}

// ---------- Rendering ----------

function renderSpellSuggest(orig, corr, originalQuery) {
  const div = document.createElement("div");
  div.className = "spell-suggest";
  div.innerHTML =
    "No results. Did you mean <a href=\"#\">" + escapeHtml(corr) + "</a>?";
  div.querySelector("a").addEventListener("click", ev => {
    ev.preventDefault();
    $("query").value = originalQuery.replace(
      new RegExp("\\b" + escapeRegex(orig) + "\\b", "i"), corr);
    $("search-form").requestSubmit();
  });
  resultsEl().appendChild(div);
}

async function renderResults(results, ctx) {
  for (const r of results) {
    const meta = INDEX.documents[r.docId];
    const div = document.createElement("div");
    div.className = "result";
    let html = `<p class="title"><a href="${meta.url}" target="_blank" rel="noopener">${escapeHtml(meta.title)}</a>`;
    if (ctx.scored && r.score != null) {
      html += `<span class="score">score ${r.score.toFixed(4)}</span>`;
    }
    html += `</p><p class="meta">${escapeHtml(meta.author)} · ${meta.length.toLocaleString()} tokens</p>`;
    html += `<p class="snippet">loading snippet...</p>`;
    div.innerHTML = html;
    resultsEl().appendChild(div);
    const snipEl = div.querySelector(".snippet");
    generateSnippet(r.docId, ctx)
      .then(s => { snipEl.innerHTML = s || "(no snippet available)"; })
      .catch(() => { snipEl.textContent = "(snippet unavailable offline)"; });
  }
}

async function loadDocText(docId) {
  if (DOC_CACHE.has(docId)) return DOC_CACHE.get(docId);
  const r = await fetch("data/docs/" + docId + ".txt");
  if (!r.ok) throw new Error("doc fetch failed");
  const t = await r.text();
  DOC_CACHE.set(docId, t);
  return t;
}

async function generateSnippet(docId, ctx) {
  const text = await loadDocText(docId);
  let regex;
  if (ctx.mode === "phrase" && ctx.phraseStr) {
    regex = new RegExp("\\b" + escapeRegex(ctx.phraseStr.trim()) + "\\b", "i");
  } else if (ctx.mode === "wildcard" && ctx.wildcardPat) {
    regex = new RegExp(
      "\\b" + ctx.wildcardPat.replace(/\*/g, "[a-z']*") + "\\b", "i");
  } else {
    const tokens = tokenize(ctx.query);
    const target = tokens.find(t => !STOPWORDS.has(t) && INDEX.postings[t])
                || tokens.find(t => INDEX.postings[t]);
    if (!target) return null;
    regex = new RegExp("\\b" + escapeRegex(target) + "\\b", "i");
  }
  const m = regex.exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 90);
  const end = Math.min(text.length, m.index + m[0].length + 90);
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  const ellipsis = (s, before, after) =>
    (before ? "... " : "") + s + (after ? " ..." : "");
  const safe = escapeHtml(slice).replace(
    new RegExp(escapeRegex(escapeHtml(m[0])), "i"),
    s => "<em>" + s + "</em>"
  );
  return ellipsis(safe, start > 0, end < text.length);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
