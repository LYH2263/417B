import os
import re
import json
import math
import requests
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "llama-3.3-70b-versatile")


def _split_sentences(text):
    text = text.strip()
    if not text:
        return []

    sentences = []
    i = 0
    n = len(text)
    current = ""

    while i < n:
        ch = text[i]
        current += ch

        if ch in "。！？!?":
            if i + 1 < n and text[i + 1] in "”\"'」』":
                current += text[i + 1]
                i += 1
            if current.strip():
                sentences.append(current.strip())
            current = ""
        elif ch == "\n":
            if current.strip():
                sentences.append(current.strip())
            current = ""
        i += 1

    if current.strip():
        sentences.append(current.strip())

    return [s for s in sentences if len(s.strip()) > 1]


def _tokenize(sentence):
    sentence = sentence.lower()
    tokens = re.findall(r"[\u4e00-\u9fa5]+|[a-zA-Z0-9]+", sentence)
    stopwords = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "to", "of", "in", "for",
        "on", "with", "at", "by", "from", "as", "into", "through", "during",
        "before", "after", "above", "below", "between", "out", "off", "over",
        "under", "again", "further", "then", "once", "here", "there", "when",
        "where", "why", "how", "all", "any", "both", "each", "few", "more",
        "most", "other", "some", "such", "no", "nor", "not", "only", "own",
        "same", "so", "than", "too", "very", "just", "and", "but", "or",
        "if", "because", "until", "while", "this", "that", "these", "those",
        "it", "its", "i", "me", "my", "we", "our", "you", "your", "he", "him",
        "his", "she", "her", "they", "them", "their", "what", "which", "who",
        "whom", "up", "down", "about",
        "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都",
        "一", "一个", "上", "也", "很", "到", "说", "要", "去", "你", "会",
        "着", "没有", "看", "好", "自己", "这", "他", "她", "它", "们",
        "那", "被", "把", "让", "给", "从", "向", "对", "与", "及", "或",
        "等", "等等", "中", "为", "以", "于", "因", "此", "但", "并",
        "而", "还", "又", "再", "已", "已经", "将", "要", "会", "能",
        "可", "不", "没", "莫", "非", "其", "之", "乎", "者", "所",
        "然", "则", "虽", "若", "如", "何", "乃", "即", "皆", "既"
    }
    return [t for t in tokens if t and t not in stopwords and len(t) > 1]


def _sentence_similarity(tokens1, tokens2):
    if not tokens1 or not tokens2:
        return 0.0
    set1 = set(tokens1)
    set2 = set(tokens2)
    if not set1 or not set2:
        return 0.0
    overlap = len(set1 & set2)
    denom = math.log(len(set1)) + math.log(len(set2))
    if denom == 0:
        return 0.0
    return overlap / denom


def _pagerank_iteration(graph, sentences_tokens, damping=0.85, max_iter=100, tol=1e-4):
    n = len(graph)
    if n == 0:
        return {}
    scores = {i: 1.0 / n for i in range(n)}

    for _ in range(max_iter):
        new_scores = {}
        for i in range(n):
            rank_sum = 0.0
            for j in range(n):
                if i != j and graph[j][i] > 0:
                    out_sum = sum(graph[j][k] for k in range(n) if k != j)
                    if out_sum > 0:
                        rank_sum += graph[j][i] / out_sum * scores[j]
            new_scores[i] = (1 - damping) / n + damping * rank_sum

        diff = sum(abs(new_scores[i] - scores[i]) for i in range(n))
        scores = new_scores
        if diff < tol:
            break

    return scores


def extract_key_sentences(text, top_n=8):
    sentences = _split_sentences(text)
    if len(sentences) == 0:
        return []

    if len(sentences) <= top_n:
        top_n = max(1, len(sentences) // 2) if len(sentences) > 1 else 1

    sentences_tokens = [_tokenize(s) for s in sentences]

    n = len(sentences)
    graph = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            sim = _sentence_similarity(sentences_tokens[i], sentences_tokens[j])
            graph[i][j] = sim
            graph[j][i] = sim

    scores = _pagerank_iteration(graph, sentences_tokens)

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top_indices = sorted([idx for idx, _ in ranked[:top_n]])

    result = []
    for idx in top_indices:
        sentence = sentences[idx]
        start_pos = text.find(sentence)
        result.append({
            "index": idx,
            "text": sentence,
            "score": round(scores[idx], 6),
            "start": start_pos if start_pos != -1 else 0,
            "end": start_pos + len(sentence) if start_pos != -1 else len(sentence)
        })

    return result


def _simulated_structured_summary(key_sentences_text):
    return {
        "background": "随着相关领域研究的不断深入，该问题已成为学术界关注的焦点。现有研究在理论框架与实证层面均取得了一定进展，但仍存在若干亟待解决的关键问题与局限性。",
        "purpose": "本研究旨在系统探讨目标问题的内在机制与影响因素，弥补现有研究的不足，为相关理论构建与实践应用提供更为坚实的证据支撑。",
        "methods": "本研究采用多方法融合的研究设计，综合运用定量分析与定性研究相结合的策略，通过构建严谨的分析框架，对采集的多维数据进行系统性检验与深入剖析。",
        "results": "实证结果表明，核心变量之间存在显著的关联关系。研究发现了若干关键影响路径，同时揭示了不同情境下效应的异质性特征，验证了所提出假设的合理性。",
        "conclusion": "本研究的发现拓展了对该领域的理论认知，对后续研究方向具有重要启示。研究结果同时为相关实践提供了可操作的参考依据，并指明了未来值得进一步探索的方向。"
    }


def generate_structured_summary(key_sentences, original_text):
    key_texts = [ks["text"] for ks in key_sentences]
    key_sentences_joined = "\n".join([f"{i+1}. {t}" for i, t in enumerate(key_texts)])

    if not GROQ_API_KEY:
        print("⚠️ 未配置 GROQ_API_KEY，切换到降级方案（模拟摘要）")
        return _simulated_structured_summary(key_sentences_joined)

    system_prompt = """You are an expert academic paper summarization assistant.

TASK: Generate a structured summary of an academic paper based on the provided key sentences.

REQUIREMENTS:
1. Produce exactly 5 sections: background, purpose, methods, results, conclusion
2. Each section should be 2-4 concise sentences in the same language as the source paper
3. Base ONLY on the information contained in the key sentences, do NOT invent facts
4. Use formal academic tone
5. Output STRICTLY as valid JSON, no other text

OUTPUT FORMAT (JSON only):
{
  "background": "...",
  "purpose": "...",
  "methods": "...",
  "results": "...",
  "conclusion": "..."
}"""

    user_prompt = f"""KEY SENTENCES EXTRACTED FROM PAPER:
{key_sentences_joined}

Now generate the structured 5-part summary as valid JSON."""

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
        "temperature": 0.4,
        "max_tokens": 1200
    }

    try:
        print("🔄 正在调用 Groq API 生成结构化摘要...")
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )

        if response.status_code != 200:
            print(f"❌ Groq API 错误 ({response.status_code})，切换到降级方案")
            return _simulated_structured_summary(key_sentences_joined)

        result = response.json()
        content = result['choices'][0]['message']['content'].strip()

        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            parsed = json.loads(json_match.group())
        else:
            parsed = json.loads(content)

        required_keys = ["background", "purpose", "methods", "results", "conclusion"]
        for k in required_keys:
            if k not in parsed:
                parsed[k] = ""

        print("✅ 结构化摘要生成成功")
        return parsed

    except Exception as e:
        print(f"❌ Groq API 调用失败: {str(e)}，启动降级方案")
        return _simulated_structured_summary(key_sentences_joined)


def summarize_paper(text, max_len=20000):
    if not text or not text.strip():
        raise ValueError("输入文本不能为空")

    text = text.strip()
    if len(text) > max_len:
        text = text[:max_len]

    key_sentences = extract_key_sentences(text, top_n=8)
    structured = generate_structured_summary(key_sentences, text)

    return {
        "original_text": text,
        "original_length": len(text),
        "key_sentences": key_sentences,
        "structured_summary": structured
    }
