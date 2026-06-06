import re
import math
from collections import Counter
from typing import List, Dict, Any, Tuple

ACADEMIC_CONNECTORS = [
    "however", "therefore", "thus", "hence", "consequently", "moreover",
    "furthermore", "additionally", "in addition", "nevertheless", "nonetheless",
    "meanwhile", "conversely", "in contrast", "on the contrary", "similarly",
    "likewise", "accordingly", "as a result", "for instance", "for example",
    "in particular", "specifically", "in conclusion", "to summarize",
    "in summary", "ultimately", "eventually", "subsequently", "previously",
    "respectively", "thereby", "whereas", "while", "although", "though",
    "despite", "in spite of", "regardless", "nevertheless", "firstly",
    "secondly", "thirdly", "finally", "lastly"
]

IRREGULAR_PAST_PARTICIPLES = {
    "been", "done", "gone", "taken", "given", "made", "said", "found",
    "seen", "known", "thought", "got", "gotten", "put", "set", "run",
    "written", "brought", "bought", "caught", "taught", "held", "felt",
    "left", "met", "paid", "sent", "spent", "stood", "understood", "won",
    "begun", "broken", "chosen", "driven", "eaten", "fallen", "forgotten",
    "frozen", "hidden", "ridden", "risen", "shaken", "shown", "sung",
    "struck", "thrown", "worn", "swum", "become", "come", "run", "cut",
    "hurt", "let", "put", "read", "built", "crept", "dealt", "dug",
    "fled", "forbade", "forbidden", "foreseen", "forgiven", "frozen",
    "ground", "hung", "kept", "laid", "led", "lent", "lit", "lost",
    "made", "meant", "overcome", "overdone", "overtaken", "overthrown",
    "proven", "ridden", "risen", "seen", "sent", "shown", "sown",
    "spoken", "spent", "spread", "stood", "stolen", "struck", "stuck",
    "sworn", "taken", "taught", "torn", "thrown", "undertaken", "understood",
    "undertaken", "woken", "worn", "written"
}

PASSIVE_BE_WORDS = {"is", "are", "was", "were", "be", "been", "being", "am"}

JOURNAL_STANDARDS = {
    "sci_q1": {
        "avg_sentence_length": {"min": 18, "max": 28, "target": 22},
        "sentence_std": {"min": 8, "max": 15},
        "ttr": {"min": 0.45, "max": 0.65, "target": 0.55},
        "hapax_ratio": {"min": 0.4, "max": 0.6},
        "passive_rate": {"min": 0.15, "max": 0.30, "target": 0.22},
        "connector_density": {"min": 0.015, "max": 0.035},
        "avg_paragraph_sentences": {"min": 4, "max": 8}
    },
    "sci_q2": {
        "avg_sentence_length": {"min": 15, "max": 30, "target": 20},
        "sentence_std": {"min": 6, "max": 18},
        "ttr": {"min": 0.4, "max": 0.6, "target": 0.5},
        "hapax_ratio": {"min": 0.35, "max": 0.6},
        "passive_rate": {"min": 0.1, "max": 0.35, "target": 0.20},
        "connector_density": {"min": 0.01, "max": 0.04},
        "avg_paragraph_sentences": {"min": 3, "max": 10}
    },
    "sci_q3": {
        "avg_sentence_length": {"min": 12, "max": 32, "target": 18},
        "sentence_std": {"min": 5, "max": 20},
        "ttr": {"min": 0.35, "max": 0.55, "target": 0.45},
        "hapax_ratio": {"min": 0.3, "max": 0.55},
        "passive_rate": {"min": 0.08, "max": 0.4, "target": 0.18},
        "connector_density": {"min": 0.008, "max": 0.045},
        "avg_paragraph_sentences": {"min": 2, "max": 12}
    }
}


def _split_sentences(text: str) -> List[Dict[str, Any]]:
    text = text.strip()
    sentences = []
    pattern = re.compile(r'([.!?。！？]+)\s*')
    last_end = 0
    for match in pattern.finditer(text):
        sentence_text = text[last_end:match.end()].strip()
        if sentence_text:
            sentences.append({
                "text": sentence_text,
                "start": last_end,
                "end": match.end(),
                "word_count": len(re.findall(r'\b[a-zA-Z]+\b', sentence_text))
            })
        last_end = match.end()
    if last_end < len(text):
        remaining = text[last_end:].strip()
        if remaining:
            sentences.append({
                "text": remaining,
                "start": last_end,
                "end": len(text),
                "word_count": len(re.findall(r'\b[a-zA-Z]+\b', remaining))
            })
    return sentences


def _split_paragraphs(text: str) -> List[Dict[str, Any]]:
    paragraphs_raw = re.split(r'\n\s*\n', text.strip())
    paragraphs = []
    offset = 0
    for para in paragraphs_raw:
        para = para.strip()
        if not para:
            continue
        start = text.find(para, offset)
        if start == -1:
            start = offset
        end = start + len(para)
        sentences = _split_sentences(para)
        paragraphs.append({
            "text": para,
            "start": start,
            "end": end,
            "sentence_count": len(sentences),
            "word_count": len(re.findall(r'\b[a-zA-Z]+\b', para))
        })
        offset = end
    return paragraphs


def analyze_sentence_length(text: str) -> Dict[str, Any]:
    sentences = _split_sentences(text)
    if not sentences:
        return {
            "avg": 0, "std": 0, "min": 0, "max": 0,
            "distribution": [], "sentences": []
        }
    lengths = [s["word_count"] for s in sentences]
    n = len(lengths)
    avg = sum(lengths) / n
    variance = sum((x - avg) ** 2 for x in lengths) / n
    std = math.sqrt(variance)
    min_len = min(lengths)
    max_len = max(lengths)
    distribution = Counter()
    for l in lengths:
        if l < 10:
            distribution["<10"] += 1
        elif l < 20:
            distribution["10-19"] += 1
        elif l < 30:
            distribution["20-29"] += 1
        elif l < 40:
            distribution["30-39"] += 1
        else:
            distribution["40+"] += 1
    return {
        "avg": round(avg, 2),
        "std": round(std, 2),
        "min": min_len,
        "max": max_len,
        "distribution": dict(distribution),
        "sentences": sentences
    }


def analyze_vocabulary_richness(text: str) -> Dict[str, Any]:
    words = re.findall(r'\b[a-zA-Z]+\b', text.lower())
    if not words:
        return {"ttr": 0, "hapax_ratio": 0, "total_words": 0, "unique_words": 0, "hapax_count": 0}
    word_counts = Counter(words)
    total_tokens = len(words)
    total_types = len(word_counts)
    hapax_count = sum(1 for _, c in word_counts.items() if c == 1)
    ttr = total_types / total_tokens if total_tokens > 0 else 0
    hapax_ratio = hapax_count / total_types if total_types > 0 else 0
    return {
        "ttr": round(ttr, 4),
        "hapax_ratio": round(hapax_ratio, 4),
        "total_words": total_tokens,
        "unique_words": total_types,
        "hapax_count": hapax_count
    }


def _is_past_participle(word: str, prev_word: str) -> bool:
    word_lower = word.lower()
    if word_lower in IRREGULAR_PAST_PARTICIPLES:
        return True
    if word_lower.endswith("ed") and len(word_lower) > 3:
        return True
    return False


def analyze_passive_voice(text: str) -> Dict[str, Any]:
    sentences = _split_sentences(text)
    passive_instances = []
    total_sentences = len(sentences) if sentences else 1
    for sent in sentences:
        words = re.findall(r'\b[a-zA-Z]+\b', sent["text"])
        words_lower = [w.lower() for w in words]
        for i in range(len(words_lower) - 1):
            if words_lower[i] in PASSIVE_BE_WORDS:
                for j in range(i + 1, min(i + 4, len(words_lower))):
                    if _is_past_participle(words[j], words_lower[i]):
                        if not any(w in {"not", "n't", "never"} for w in words_lower[i+1:j]):
                            pattern_start = sent["start"] + sent["text"].find(words[i])
                            pattern_end = sent["start"] + sent["text"].find(words[j]) + len(words[j])
                            passive_instances.append({
                                "sentence_index": sentences.index(sent),
                                "sentence_text": sent["text"],
                                "pattern": " ".join(words[i:j+1]),
                                "start": pattern_start,
                                "end": pattern_end
                            })
                            break
    passive_sentence_indices = list({p["sentence_index"] for p in passive_instances})
    passive_sentence_count = len(passive_sentence_indices)
    return {
        "passive_rate": round(passive_sentence_count / total_sentences, 4),
        "passive_sentence_count": passive_sentence_count,
        "total_sentences": total_sentences,
        "instances": passive_instances
    }


def analyze_connectors(text: str) -> Dict[str, Any]:
    text_lower = text.lower()
    connector_counts = Counter()
    connector_positions = []
    for connector in ACADEMIC_CONNECTORS:
        pattern = re.compile(r'\b' + re.escape(connector) + r'\b', re.IGNORECASE)
        for match in pattern.finditer(text):
            connector_counts[connector] += 1
            connector_positions.append({
                "connector": connector,
                "start": match.start(),
                "end": match.end()
            })
    total_words = len(re.findall(r'\b[a-zA-Z]+\b', text))
    density = (len(connector_positions) / total_words) if total_words > 0 else 0
    return {
        "density": round(density, 4),
        "total_count": len(connector_positions),
        "connector_counts": dict(connector_counts.most_common(15)),
        "positions": connector_positions
    }


def analyze_paragraphs(text: str) -> Dict[str, Any]:
    paragraphs = _split_paragraphs(text)
    if not paragraphs:
        return {
            "avg_sentences": 0, "avg_words": 0, "count": 0,
            "paragraphs": [], "logic_relations": []
        }
    sentence_counts = [p["sentence_count"] for p in paragraphs]
    word_counts = [p["word_count"] for p in paragraphs]
    logic_relations = []
    logic_cues = [
        ("additive", ["moreover", "furthermore", "in addition", "additionally", "besides"]),
        ("adversative", ["however", "nevertheless", "nonetheless", "conversely", "in contrast", "on the contrary", "although", "though", "despite", "whereas", "while"]),
        ("causal", ["therefore", "thus", "hence", "consequently", "accordingly", "as a result"]),
        ("sequential", ["firstly", "secondly", "thirdly", "finally", "lastly", "subsequently", "previously", "meanwhile", "eventually"]),
        ("exemplifying", ["for instance", "for example", "in particular", "specifically"]),
        ("summarizing", ["in conclusion", "to summarize", "in summary", "ultimately"])
    ]
    for i, para in enumerate(paragraphs):
        para_lower = para["text"].lower()
        para_relations = []
        for rel_type, cues in logic_cues:
            for cue in cues:
                if re.search(r'\b' + re.escape(cue) + r'\b', para_lower):
                    para_relations.append(rel_type)
                    break
        if i == 0:
            default_rel = "introduction"
        elif i == len(paragraphs) - 1:
            default_rel = "conclusion"
        else:
            default_rel = "development"
        logic_relations.append({
            "paragraph_index": i,
            "explicit_relations": list(set(para_relations)) if para_relations else [],
            "inferred_relation": default_rel
        })
    return {
        "avg_sentences": round(sum(sentence_counts) / len(sentence_counts), 2),
        "avg_words": round(sum(word_counts) / len(word_counts), 2),
        "count": len(paragraphs),
        "paragraphs": paragraphs,
        "logic_relations": logic_relations
    }


def _score_in_range(value: float, range_min: float, range_max: float, target: float = None) -> float:
    if range_min == range_max:
        return 100.0 if value == range_min else 0.0
    if target is None:
        target = (range_min + range_max) / 2
    if range_min <= value <= range_max:
        mid = (range_min + range_max) / 2
        distance_from_mid = abs(value - mid)
        half_range = (range_max - range_min) / 2
        score = 100 - (distance_from_mid / half_range) * 20
        return max(80.0, round(score, 1))
    else:
        if value < range_min:
            deviation = (range_min - value) / range_min
        else:
            deviation = (value - range_max) / range_max
        score = max(0.0, 80 - deviation * 100)
        return round(score, 1)


def compute_dimension_scores(analysis: Dict[str, Any], journal_level: str) -> Dict[str, Any]:
    std = JOURNAL_STANDARDS.get(journal_level, JOURNAL_STANDARDS["sci_q2"])
    sentence_length_score = _score_in_range(
        analysis["sentence_length"]["avg"],
        std["avg_sentence_length"]["min"],
        std["avg_sentence_length"]["max"],
        std["avg_sentence_length"]["target"]
    )
    sentence_std_score = _score_in_range(
        analysis["sentence_length"]["std"],
        std["sentence_std"]["min"],
        std["sentence_std"]["max"]
    )
    combined_sentence_score = round((sentence_length_score + sentence_std_score) / 2, 1)
    ttr_score = _score_in_range(
        analysis["vocabulary"]["ttr"],
        std["ttr"]["min"],
        std["ttr"]["max"],
        std["ttr"]["target"]
    )
    hapax_score = _score_in_range(
        analysis["vocabulary"]["hapax_ratio"],
        std["hapax_ratio"]["min"],
        std["hapax_ratio"]["max"]
    )
    vocabulary_score = round((ttr_score + hapax_score) / 2, 1)
    passive_score = _score_in_range(
        analysis["passive_voice"]["passive_rate"],
        std["passive_rate"]["min"],
        std["passive_rate"]["max"],
        std["passive_rate"]["target"]
    )
    connector_score = _score_in_range(
        analysis["connectors"]["density"],
        std["connector_density"]["min"],
        std["connector_density"]["max"]
    )
    if analysis["paragraphs"]["count"] <= 1:
        paragraph_score = 85.0
    else:
        paragraph_score = _score_in_range(
            analysis["paragraphs"]["avg_sentences"],
            std["avg_paragraph_sentences"]["min"],
            std["avg_paragraph_sentences"]["max"]
        )
    overall = round((
        combined_sentence_score + vocabulary_score +
        passive_score + connector_score + paragraph_score
    ) / 5, 1)
    return {
        "overall": overall,
        "sentence_length": combined_sentence_score,
        "vocabulary": vocabulary_score,
        "passive_voice": passive_score,
        "connectors": connector_score,
        "paragraphs": paragraph_score,
        "breakdown": {
            "sentence_length_avg": sentence_length_score,
            "sentence_length_std": sentence_std_score,
            "vocabulary_ttr": ttr_score,
            "vocabulary_hapax": hapax_score
        },
        "standards_used": std
    }


def generate_suggestions(analysis: Dict[str, Any], scores: Dict[str, Any], journal_level: str) -> List[Dict[str, Any]]:
    suggestions = []
    std = scores["standards_used"]
    sl = analysis["sentence_length"]
    sentences = sl["sentences"]
    sl_std = std["avg_sentence_length"]
    if sl["avg"] < sl_std["min"]:
        short_sents = sorted(sentences, key=lambda s: s["word_count"])[:3]
        for s in short_sents:
            if s["word_count"] < sl_std["min"]:
                suggestions.append({
                    "dimension": "sentence_length",
                    "severity": "medium" if scores["sentence_length"] < 70 else "low",
                    "type": "too_short",
                    "title": f"句子过短（{s['word_count']}词）",
                    "message": f"该句仅含 {s['word_count']} 个单词，建议与相邻句合并或补充细节以增强论述深度。",
                    "start": s["start"],
                    "end": s["end"],
                    "text": s["text"]
                })
    if sl["avg"] > sl_std["max"]:
        long_sents = sorted(sentences, key=lambda s: s["word_count"], reverse=True)[:3]
        for s in long_sents:
            if s["word_count"] > sl_std["max"]:
                suggestions.append({
                    "dimension": "sentence_length",
                    "severity": "medium" if scores["sentence_length"] < 70 else "low",
                    "type": "too_long",
                    "title": f"句子过长（{s['word_count']}词）",
                    "message": f"该句长达 {s['word_count']} 个单词，建议拆分为2-3个短句以提升可读性。",
                    "start": s["start"],
                    "end": s["end"],
                    "text": s["text"]
                })
    vocab = analysis["vocabulary"]
    if vocab["total_words"] > 100:
        if vocab["ttr"] < std["ttr"]["min"]:
            suggestions.append({
                "dimension": "vocabulary",
                "severity": "high" if scores["vocabulary"] < 60 else "medium",
                "type": "low_ttr",
                "title": "词汇丰富度不足",
                "message": f"Type-Token Ratio 仅为 {vocab['ttr']:.0%}，低于目标区间 [{std['ttr']['min']:.0%}, {std['ttr']['max']:.0%}]。建议使用更多同义词替换高频重复词汇。",
                "start": 0,
                "end": 0,
                "text": ""
            })
    pv = analysis["passive_voice"]
    passive_std = std["passive_rate"]
    if pv["passive_rate"] > passive_std["max"]:
        for inst in pv["instances"][:5]:
            suggestions.append({
                "dimension": "passive_voice",
                "severity": "high" if scores["passive_voice"] < 60 else "medium",
                "type": "high_passive",
                "title": f"被动语态使用：'{inst['pattern']}'",
                "message": f"被动语态使用率为 {pv['passive_rate']:.0%}，超出目标上限 {passive_std['max']:.0%}。建议将此句改为主动语态以增强表达力度。",
                "start": inst["start"],
                "end": inst["end"],
                "text": inst["sentence_text"]
            })
    if pv["passive_rate"] < passive_std["min"] and pv["total_sentences"] > 10:
        suggestions.append({
            "dimension": "passive_voice",
            "severity": "low",
            "type": "low_passive",
            "title": "被动语态使用偏少",
            "message": f"被动语态仅占 {pv['passive_rate']:.0%}，低于建议下限 {passive_std['min']:.0%}。在描述实验方法、客观结果时可适当使用被动语态。",
            "start": 0,
            "end": 0,
            "text": ""
        })
    conn = analysis["connectors"]
    conn_std = std["connector_density"]
    if conn["density"] < conn_std["min"] and conn["total_words"] if False else analysis["vocabulary"]["total_words"] > 200:
        suggestions.append({
            "dimension": "connectors",
            "severity": "medium" if scores["connectors"] < 60 else "low",
            "type": "low_connectors",
            "title": "学术连接词使用不足",
            "message": f"连接词密度仅为 {conn['density']:.2%}，建议增加 however、therefore、for example、in addition 等逻辑连接词以增强段落衔接。",
            "start": 0,
            "end": 0,
            "text": ""
        })
    paras = analysis["paragraphs"]
    para_std = std["avg_paragraph_sentences"]
    if paras["count"] > 1:
        if paras["avg_sentences"] > para_std["max"]:
            long_paragraphs = sorted(paras["paragraphs"], key=lambda p: p["sentence_count"], reverse=True)[:2]
            for p in long_paragraphs:
                if p["sentence_count"] > para_std["max"]:
                    suggestions.append({
                        "dimension": "paragraphs",
                        "severity": "medium",
                        "type": "long_paragraph",
                        "title": f"段落过长（{p['sentence_count']}句）",
                        "message": f"该段落含 {p['sentence_count']} 个句子，建议拆分为2个逻辑独立的短段落。",
                        "start": p["start"],
                        "end": p["end"],
                        "text": p["text"][:100] + ("..." if len(p["text"]) > 100 else "")
                    })
        if paras["avg_sentences"] < para_std["min"]:
            suggestions.append({
                "dimension": "paragraphs",
                "severity": "low",
                "type": "short_paragraphs",
                "title": "段落平均句子数偏少",
                "message": f"平均每段仅 {paras['avg_sentences']} 句，低于建议下限 {para_std['min']} 句。建议将关系紧密的短段落合并。",
                "start": 0,
                "end": 0,
                "text": ""
            })
    return suggestions


def analyze_writing_style(text: str, journal_level: str = "sci_q2") -> Dict[str, Any]:
    if not text or not text.strip():
        return {"error": "No text provided"}
    valid_levels = ["sci_q1", "sci_q2", "sci_q3"]
    if journal_level not in valid_levels:
        journal_level = "sci_q2"
    sentence_length = analyze_sentence_length(text)
    vocabulary = analyze_vocabulary_richness(text)
    passive_voice = analyze_passive_voice(text)
    connectors = analyze_connectors(text)
    paragraphs = analyze_paragraphs(text)
    analysis = {
        "sentence_length": sentence_length,
        "vocabulary": vocabulary,
        "passive_voice": passive_voice,
        "connectors": connectors,
        "paragraphs": paragraphs,
        "journal_level": journal_level
    }
    scores = compute_dimension_scores(analysis, journal_level)
    suggestions = generate_suggestions(analysis, scores, journal_level)
    return {
        "analysis": analysis,
        "scores": scores,
        "suggestions": suggestions,
        "original_text": text
    }
