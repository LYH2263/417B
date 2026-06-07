import re
import math
import os
import requests
from collections import Counter, defaultdict
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "llama-3.3-70b-versatile")

DEFAULT_WHITELIST = [
    "Abstract",
    "Keywords",
    "Introduction",
    "Related Work",
    "Methodology",
    "Methods",
    "Materials and Methods",
    "Experimental Setup",
    "Results",
    "Discussion",
    "Conclusion",
    "Conclusions",
    "References",
    "Acknowledgements",
    "Table",
    "Figure",
    "Fig.",
    "Eq.",
    "et al.",
    "in order to",
    "as shown in",
    "it can be seen that",
    "the results show that",
    "in this paper",
    "in this study",
    "in this work",
    "to the best of our knowledge",
    "as far as we know",
    "it is worth noting that",
    "it should be noted that",
]

CATEGORY_WHITELIST = {
    "methodology": [
        "was used to",
        "were used to",
        "was performed using",
        "were performed using",
        "was conducted using",
        "were conducted using",
        "was carried out",
        "were carried out",
        "was applied to",
        "were applied to",
        "was implemented by",
        "were implemented by",
        "was measured using",
        "were measured using",
        "was calculated as",
        "were calculated as",
        "was computed using",
        "were computed using",
        "data was collected",
        "data were collected",
        "samples were prepared",
        "experiments were performed",
        "statistical analysis was performed",
        "analysis of variance",
        "Student's t-test",
        "p < 0.05",
        "confidence interval",
        "standard deviation",
        "standard error of the mean",
    ],
    "math_formulas": [
        "where",
        "where,",
        "is defined as",
        "are defined as",
        "denotes",
        "denote",
        "represents",
        "represent",
        "is the",
        "are the",
    ]
}


def _split_sentences(text: str):
    """
    Split text into sentences while preserving position offsets.
    Supports both English and Chinese sentence delimiters.
    """
    sentences = []
    pattern = r'(?<=[。！？.!?])\s+|(?<=[。！？.!?])(?=[^\s])|\n\s*\n'
    last_end = 0
    for m in re.finditer(pattern, text):
        sent_text = text[last_end:m.end()].strip()
        if sent_text:
            sentences.append({
                "index": len(sentences),
                "text": sent_text,
                "start": last_end,
                "end": last_end + len(sent_text)
            })
        last_end = m.end()
    if last_end < len(text):
        sent_text = text[last_end:].strip()
        if sent_text:
            sentences.append({
                "index": len(sentences),
                "text": sent_text,
                "start": last_end,
                "end": last_end + len(sent_text)
            })
    return sentences


def _levenshtein_distance(s1: str, s2: str) -> float:
    """
    Compute normalized Levenshtein edit distance (0.0 = identical, 1.0 = completely different).
    """
    if len(s1) == 0 and len(s2) == 0:
        return 0.0
    if len(s1) == 0 or len(s2) == 0:
        return 1.0

    if len(s1) < len(s2):
        s1, s2 = s2, s1

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    raw_distance = previous_row[-1]
    max_len = max(len(s1), len(s2))
    normalized = raw_distance / max_len if max_len > 0 else 1.0
    return 1.0 - normalized


def _tokenize(text: str):
    """
    Simple tokenizer for TF-IDF.
    """
    text = text.lower()
    tokens = re.findall(r'[a-zA-Z\u4e00-\u9fff]+|\d+', text)
    stopwords = {'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'this', 'that', 'these', 'those', 'it', 'its', 'as', 'at', 'from', 'up', 'about', 'into', 'over', 'after', 'before', 'between', 'through', 'during', 'we', 'our', 'ours'}
    return [t for t in tokens if t not in stopwords and len(t) > 1]


def _compute_tfidf_vectors(sentences):
    """
    Compute TF-IDF vectors for all sentences.
    """
    doc_tokens = [_tokenize(s["text"]) for s in sentences]
    n_docs = len(doc_tokens)

    df = Counter()
    for tokens in doc_tokens:
        for token in set(tokens):
            df[token] += 1

    idf = {}
    for token, freq in df.items():
        idf[token] = math.log((n_docs + 1) / (freq + 1)) + 1

    vectors = []
    for tokens in doc_tokens:
        tf = Counter(tokens)
        vector = {}
        for token, count in tf.items():
            tf_val = count / len(tokens) if tokens else 0
            vector[token] = tf_val * idf.get(token, 0)
        vectors.append(vector)

    return vectors


def _cosine_similarity(v1: dict, v2: dict) -> float:
    """
    Compute cosine similarity between two sparse TF-IDF vectors.
    """
    if not v1 or not v2:
        return 0.0
    intersection = set(v1.keys()) & set(v2.keys())
    dot = sum(v1[t] * v2[t] for t in intersection)
    norm1 = math.sqrt(sum(v * v for v in v1.values()))
    norm2 = math.sqrt(sum(v * v for v in v2.values()))
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return dot / (norm1 * norm2)


def _combined_similarity(edit_sim: float, cosine_sim: float) -> float:
    """
    Combined similarity score weighted by both edit distance and semantic similarity.
    """
    return 0.4 * edit_sim + 0.6 * cosine_sim


def _is_whitelisted(text: str, custom_whitelist=None, enabled_categories=None) -> bool:
    """
    Check if a sentence should be whitelisted (reasonable/acceptable repetition).
    """
    text_lower = text.strip().lower()

    if len(text_lower) < 6:
        return True

    combined_whitelist = list(DEFAULT_WHITELIST)
    if custom_whitelist:
        combined_whitelist.extend(custom_whitelist)
    if enabled_categories:
        for cat in enabled_categories:
            if cat in CATEGORY_WHITELIST:
                combined_whitelist.extend(CATEGORY_WHITELIST[cat])

    for phrase in combined_whitelist:
        if phrase.lower() == text_lower:
            return True

    if re.match(r'^\d+[\.\)]\s*$', text_lower):
        return True
    if re.match(r'^[\[\(]?\d+[\]\)]\s*[:：]?\s*$', text_lower):
        return True
    if re.match(r'^(table|figure|fig\.|eq\.)\s+\d+[:：]?.*$', text_lower, re.IGNORECASE):
        return True

    return False


def _union_find_groups(pairs, n_sentences):
    """
    Use Union-Find (Disjoint Set Union) to cluster sentences into repetition groups.
    """
    parent = list(range(n_sentences))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[rx] = ry

    for pair in pairs:
        union(pair["i"], pair["j"])

    groups_map = defaultdict(list)
    for i in range(n_sentences):
        root = find(i)
        groups_map[root].append(i)

    groups = []
    for root, members in groups_map.items():
        if len(members) >= 2:
            group_pairs = [p for p in pairs if p["i"] in members and p["j"] in members]
            avg_sim = sum(p["similarity"] for p in group_pairs) / len(group_pairs) if group_pairs else 0
            groups.append({
                "group_id": len(groups),
                "sentence_indices": sorted(members),
                "avg_similarity": round(avg_sim, 4),
                "pairs": group_pairs
            })

    groups.sort(key=lambda g: -g["avg_similarity"])
    for idx, g in enumerate(groups):
        g["group_id"] = idx
    return groups


def detect_internal_plagiarism(
    text: str,
    threshold: float = 0.8,
    window_size: int = 50,
    custom_whitelist=None,
    enabled_categories=None
):
    """
    Detect internal plagiarism/self-plagiarism within a single text.
    
    Args:
        text: The full paper text
        threshold: Similarity threshold (0.0-1.0), default 0.8
        window_size: Sliding window size for comparison (compare each sentence with next N sentences)
        custom_whitelist: Additional user-provided phrases to whitelist
        enabled_categories: Whitelist categories to enable (e.g. ["methodology"])
    
    Returns:
        Dict with sentences, similar pairs, and repetition groups
    """
    if not text or not text.strip():
        return {
            "sentences": [],
            "similar_pairs": [],
            "groups": [],
            "statistics": {
                "total_sentences": 0,
                "total_pairs": 0,
                "total_groups": 0,
                "sentences_involved": 0
            }
        }

    if enabled_categories is None:
        enabled_categories = ["methodology", "math_formulas"]

    sentences = _split_sentences(text)
    n = len(sentences)

    if n < 2:
        return {
            "sentences": sentences,
            "similar_pairs": [],
            "groups": [],
            "statistics": {
                "total_sentences": n,
                "total_pairs": 0,
                "total_groups": 0,
                "sentences_involved": 0
            }
        }

    whitelisted_flags = [
        _is_whitelisted(s["text"], custom_whitelist, enabled_categories)
        for s in sentences
    ]

    tfidf_vectors = _compute_tfidf_vectors(sentences)

    similar_pairs = []
    for i in range(n):
        if whitelisted_flags[i]:
            continue
        effective_window = min(window_size, n - i - 1)
        for j in range(i + 1, i + 1 + effective_window):
            if whitelisted_flags[j]:
                continue
            edit_sim = _levenshtein_distance(sentences[i]["text"], sentences[j]["text"])
            cosine_sim = _cosine_similarity(tfidf_vectors[i], tfidf_vectors[j])
            combined = _combined_similarity(edit_sim, cosine_sim)

            if combined >= threshold:
                similar_pairs.append({
                    "i": i,
                    "j": j,
                    "edit_similarity": round(edit_sim, 4),
                    "semantic_similarity": round(cosine_sim, 4),
                    "similarity": round(combined, 4)
                })

    groups = _union_find_groups(similar_pairs, n)

    involved_indices = set()
    for g in groups:
        for idx in g["sentence_indices"]:
            involved_indices.add(idx)

    return {
        "sentences": [
            {
                **s,
                "whitelisted": whitelisted_flags[s["index"]]
            }
            for s in sentences
        ],
        "similar_pairs": similar_pairs,
        "groups": groups,
        "statistics": {
            "total_sentences": n,
            "total_pairs": len(similar_pairs),
            "total_groups": len(groups),
            "sentences_involved": len(involved_indices)
        }
    }


def generate_dedup_suggestion(original_sentences, group):
    """
    Generate AI-powered deduplication rewriting suggestions for a repetition group.
    
    Args:
        original_sentences: The full list of sentence objects
        group: The repetition group dict
    
    Returns:
        Dict with group info and per-sentence rewrite suggestions
    """
    group_sentences = [original_sentences[idx] for idx in group["sentence_indices"]]
    texts = [s["text"] for s in group_sentences]

    suggestions = []
    for i, sent in enumerate(group_sentences):
        other_texts = [t for j, t in enumerate(texts) if j != i]

        suggestion = _ai_rewrite_for_dedup(sent["text"], other_texts)

        suggestions.append({
            "sentence_index": group["sentence_indices"][i],
            "original": sent["text"],
            "suggested": suggestion,
            "start": sent["start"],
            "end": sent["end"]
        })

    return {
        "group_id": group["group_id"],
        "avg_similarity": group["avg_similarity"],
        "suggestions": suggestions
    }


def _ai_rewrite_for_dedup(original_text: str, other_group_texts: list) -> str:
    """
    Use Groq API (or fallback) to rewrite a sentence to avoid duplication with other sentences in the group.
    """
    if not GROQ_API_KEY:
        return _simulated_dedup_rewrite(original_text)

    others_context = "\n".join([f"- {t}" for t in other_group_texts[:3]])

    system_prompt = """You are an expert academic editor specialized in eliminating self-plagiarism and redundant phrasing in research papers.

TASK: Rewrite the given sentence so that it conveys exactly the same meaning but uses completely different wording, sentence structure, and phrasing. The rewritten sentence must NOT repeat the phrasing, vocabulary, or grammatical structure of the other sentences in the repetition group.

STRICT REQUIREMENTS:
1. Preserve ALL technical meaning, data, numbers, citations, and terminology exactly
2. Use entirely different vocabulary, sentence structure, and grammatical patterns
3. Maintain formal academic tone appropriate for a peer-reviewed journal
4. Do NOT use the same opening phrases, transition words, or sentence patterns as the other sentences
5. Output ONLY the rewritten sentence with no explanation, no preamble, no quotes"""

    user_prompt = f"""Sentence to rewrite:\n{original_text}\n\nOther sentences in the same repetition group (avoid repeating their phrasing):\n{others_context}"""

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.85,
        "max_tokens": 500
    }

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=15
        )
        if response.status_code == 200:
            result = response.json()
            rewritten = result['choices'][0]['message']['content'].strip()
            return rewritten
    except Exception as e:
        print(f"AI dedup rewrite failed: {e}")

    return _simulated_dedup_rewrite(original_text)


def _simulated_dedup_rewrite(text: str) -> str:
    """
    Fallback simulated rewrite for deduplication when API is unavailable.
    """
    synonym_map = {
        "shows": "demonstrates",
        "show": "demonstrate",
        "indicates": "suggests",
        "indicate": "suggest",
        "reveals": "exhibits",
        "reveal": "exhibit",
        "demonstrates": "illustrates",
        "demonstrate": "illustrate",
        "results": "findings",
        "result": "finding",
        "method": "approach",
        "methods": "approaches",
        "technique": "strategy",
        "techniques": "strategies",
        "analysis": "examination",
        "important": "critical",
        "significant": "substantial",
        "using": "by employing",
        "used": "employed",
        "based on": "building upon",
        "according to": "as reported by",
        "however": "nevertheless",
        "therefore": "consequently",
        "furthermore": "moreover",
        "in addition": "additionally",
        "for example": "for instance",
        "in conclusion": "taken together",
        "it is clear that": "evidently",
        "it is evident that": "clearly",
        "the purpose of": "this study aims to",
        "the aim of": "the objective of",
        "we found that": "our investigation revealed that",
        "we observed that": "it was noted that",
        "in this section": "the following section",
        "in the previous section": "as discussed earlier",
    }

    result = text
    for orig, repl in synonym_map.items():
        pattern = re.compile(r'\b' + re.escape(orig) + r'\b', re.IGNORECASE)
        def _replace(m):
            word = m.group(0)
            if word.istitle():
                return repl.capitalize()
            elif word.isupper():
                return repl.upper()
            return repl
        result = pattern.sub(_replace, result)

    if result == text:
        result = text + " (rephrased)"

    return result


def get_whitelist_info():
    """
    Return information about available whitelist categories and items.
    """
    return {
        "default_whitelist": DEFAULT_WHITELIST,
        "categories": {
            cat: phrases for cat, phrases in CATEGORY_WHITELIST.items()
        }
    }
