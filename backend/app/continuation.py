import os
import requests
import json
import re
from dotenv import load_dotenv

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MODEL_NAME = os.getenv("MODEL_NAME", "llama-3.3-70b-versatile")

CONTINUATION_DIRECTIONS = {
    "continue": {
        "name": "继续论述",
        "instruction": "Continue the existing line of argumentation naturally. Deepen the analysis, add supporting evidence, or elaborate on the previous point. Maintain logical coherence with the preceding text.",
        "tone_hints": ["严谨论证", "逻辑延展", "深度分析"]
    },
    "contrast": {
        "name": "转折过渡",
        "instruction": "Introduce a thoughtful transition or counterpoint. Present an alternative perspective, acknowledge a limitation, or set up a contrasting argument while maintaining academic balance.",
        "tone_hints": ["辩证转折", "过渡衔接", "视角切换"]
    },
    "summary": {
        "name": "总结收尾",
        "instruction": "Provide a concise synthesis and conclusion. Summarize key findings, restate the thesis with new insight, and articulate the broader significance of the discussion.",
        "tone_hints": ["收束归纳", "总结提炼", "意义升华"]
    },
    "data": {
        "name": "引出数据",
        "instruction": "Introduce empirical support or quantitative evidence. Lead naturally into presenting statistics, experimental results, comparative data, or measurable findings relevant to the argument.",
        "tone_hints": ["实证导向", "数据支撑", "量化分析"]
    }
}


def _simulated_continuation(direction: str, context: str) -> list:
    direction_info = CONTINUATION_DIRECTIONS.get(direction, CONTINUATION_DIRECTIONS["continue"])
    samples = {
        "continue": [
            "Furthermore, the empirical evidence from recent longitudinal studies consistently corroborates this hypothesis, demonstrating that the observed effects persist even when controlling for confounding variables. The methodological rigor of these investigations, which employed multi-level regression modeling and propensity score matching, lends substantial credibility to the causal inferences drawn by the researchers. Moreover, qualitative data from semi-structured interviews provides complementary insights into the underlying mechanisms at play.",
            "Building upon this theoretical framework, subsequent research has identified several boundary conditions that modulate the strength of the relationship. Specifically, contextual factors such as institutional support, resource availability, and cultural norms appear to function as significant moderators. These findings suggest that the proposed model may require refinement to account for the heterogeneous effects observed across different populations and settings.",
            "In extending this line of inquiry, it becomes evident that the temporal dimension warrants closer examination. The dynamic interplay between variables over time reveals patterns that cross-sectional designs inevitably obscure. Recent methodological advances in growth curve modeling and time-series analysis now enable researchers to capture these developmental trajectories with unprecedented precision, thereby offering a more nuanced understanding of the phenomena under investigation."
        ],
        "contrast": [
            "However, notwithstanding the compelling nature of these findings, several important caveats must be acknowledged. Critics have pointed out that the sampling methodology may introduce selection bias, and the operationalization of key constructs remains open to alternative interpretations. Furthermore, the generalizability of these results to non-WEIRD populations represents a significant unresolved question that future research must systematically address.",
            "Nevertheless, an alternative theoretical perspective suggests a somewhat different interpretation. Proponents of the competing framework argue that the observed correlations may reflect spurious associations driven by unmeasured third variables rather than genuine causal relationships. This counterposition, while controversial, has stimulated productive debate and prompted a re-evaluation of prevailing assumptions within the field.",
            "Conversely, emerging evidence from alternative paradigms challenges the prevailing consensus. Researchers employing mixed-methods approaches have uncovered qualitative dimensions that purely quantitative analyses fail to capture. These divergent findings underscore the importance of methodological pluralism and caution against overreliance on any single analytical framework when investigating complex social phenomena."
        ],
        "summary": [
            "Taken together, the body of evidence reviewed herein converges on a coherent understanding of the phenomenon. The cumulative findings demonstrate a robust and consistent pattern across diverse methodological approaches, reinforcing confidence in the central thesis. Ultimately, this synthesis contributes to a more sophisticated theoretical framework that can guide future empirical investigations and inform evidence-based decision-making in practical applications.",
            "In conclusion, the multifaceted analysis presented in this study illuminates several critical dimensions that had previously remained under-explored. The integrated findings not only corroborate the foundational hypotheses but also reveal unexpected nuances that enrich our theoretical comprehension. These insights carry meaningful implications for both scholarly discourse and practical intervention strategies within the domain.",
            "Overall, the empirical and theoretical contributions of this investigation collectively advance the field in several important respects. By systematically addressing prior limitations and integrating disparate strands of research, this work establishes a more solid foundation upon which subsequent scholarship can build. The implications extend beyond the immediate context, suggesting broader conceptual refinements that may prove fruitful across related disciplines."
        ],
        "data": [
            "To contextualize these claims, consider the following empirical findings. Analysis of the 2024 national survey dataset (N=12,847) reveals that 68.3% of respondents exhibited the predicted response pattern, with a statistically significant effect size of d=0.42 (p<0.001, 95% CI: [0.35, 0.49]). The regression model accounted for 34.7% of variance in the outcome variable, representing a substantial improvement over baseline specifications.",
            "Quantitative analysis provides compelling validation. Table 2 presents the descriptive statistics and correlation matrix for the primary measures. The Cronbach's alpha coefficients for all multi-item scales exceeded 0.82, indicating satisfactory internal consistency. Hierarchical regression analysis demonstrated that the predictor variables explained 41.2% of variance in the criterion, F(5, 312)=43.8, p<0.001.",
            "The empirical results are striking. Across three independent experiments, the treatment group consistently outperformed the control condition, with mean differences ranging from 18.5% to 27.3% on the primary outcome measure. The meta-analytic aggregate effect size across all studies was r=0.31 (p<0.0001), with minimal heterogeneity (I²=12.4%, Q=8.1, p=0.32)."
        ]
    }

    candidates = samples.get(direction, samples["continue"])
    result = []
    for i, text in enumerate(candidates):
        result.append({
            "id": f"cand_{i}",
            "text": text,
            "tone_tag": direction_info["tone_hints"][i % len(direction_info["tone_hints"])],
            "direction": direction_info["name"]
        })
    return result


def generate_continuations(context: str, direction: str = "continue") -> list:
    direction_info = CONTINUATION_DIRECTIONS.get(direction, CONTINUATION_DIRECTIONS["continue"])

    if len(context) > 1000:
        context = context[-1000:]

    if not GROQ_API_KEY:
        print("⚠️ 未配置 GROQ_API_KEY，切换到降级方案（模拟续写）")
        return _simulated_continuation(direction, context)

    system_prompt = f"""You are an expert academic writing assistant specializing in Chinese academic paper composition.

YOUR TASK: Generate THREE distinct, high-quality continuation candidates for the given academic text.

CONTINUATION STYLE: {direction_info["name"]}
INSTRUCTION: {direction_info["instruction"]}

STRICT REQUIREMENTS:
1. Each continuation must be 100-200 Chinese characters (approximately 60-120 words in English if writing in English).
2. The three candidates must be meaningfully different from each other in approach, focus, or expression.
3. Continue seamlessly from the provided context - the transition must be natural and logical.
4. Maintain a rigorous, professional academic tone appropriate for scholarly publication.
5. Do NOT repeat verbatim what is already in the context.
6. Each continuation must be self-contained and grammatically complete.

AVAILABLE TONE TAGS (choose one per candidate, distribute across the three):
- {direction_info["tone_hints"][0]}
- {direction_info["tone_hints"][1]}
- {direction_info["tone_hints"][2]}

OUTPUT FORMAT:
Return ONLY a valid JSON array with three objects. Do NOT include any text before or after the JSON.
Each object must have:
- "text": the continuation content (string)
- "tone_tag": the tone tag from the list above (string)

Example format:
[
  {{"text": "...", "tone_tag": "..."}},
  {{"text": "...", "tone_tag": "..."}},
  {{"text": "...", "tone_tag": "..."}}
]
"""

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Context to continue:\n\n{context}"}
        ],
        "temperature": 0.85,
        "max_tokens": 1500
    }

    try:
        print(f"🔄 正在调用 Groq API 生成续写候选，方向: {direction_info['name']}")
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=30
        )

        if response.status_code != 200:
            print(f"❌ Groq API 错误 ({response.status_code})，切换到降级方案")
            return _simulated_continuation(direction, context)

        result = response.json()
        content = result['choices'][0]['message']['content'].strip()

        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group())
        else:
            parsed = json.loads(content)

        result_candidates = []
        for i, cand in enumerate(parsed[:3]):
            result_candidates.append({
                "id": f"cand_{i}",
                "text": cand.get("text", "").strip(),
                "tone_tag": cand.get("tone_tag", direction_info["tone_hints"][i % len(direction_info["tone_hints"])]),
                "direction": direction_info["name"]
            })

        print(f"✅ Groq API 续写生成成功，共 {len(result_candidates)} 条候选")
        return result_candidates

    except Exception as e:
        print(f"❌ Groq API 调用失败: {str(e)}，启动降级方案")
        return _simulated_continuation(direction, context)


async def generate_continuations_stream(context: str, direction: str = "continue"):
    direction_info = CONTINUATION_DIRECTIONS.get(direction, CONTINUATION_DIRECTIONS["continue"])

    if len(context) > 1000:
        context = context[-1000:]

    if not GROQ_API_KEY:
        candidates = _simulated_continuation(direction, context)
        for cand in candidates:
            yield f"data: {json.dumps(cand, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"
        return

    for cand_idx in range(3):
        tone_tag = direction_info["tone_hints"][cand_idx % len(direction_info["tone_hints"])]

        system_prompt = f"""You are an expert academic writing assistant.

Generate ONE continuation candidate.
STYLE: {direction_info["name"]}
INSTRUCTION: {direction_info["instruction"]}
TONE TAG: {tone_tag}

REQUIREMENTS:
- 100-200 Chinese characters
- Continue seamlessly from context
- Academic tone
- Return ONLY the text content, no JSON, no explanations."""

        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json"
        }

        payload = {
            "model": MODEL_NAME,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Context:\n{context}"}
            ],
            "temperature": 0.8 + cand_idx * 0.05,
            "max_tokens": 600,
            "stream": True
        }

        cand_id = f"cand_{cand_idx}"

        try:
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
                stream=True,
                timeout=60
            )

            full_text = ""
            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith("data: "):
                        data = line_str[6:]
                        if data == "[DONE]":
                            break
                        try:
                            delta = json.loads(data)
                            content = delta['choices'][0]['delta'].get('content', '')
                            if content:
                                full_text += content
                                chunk_data = {
                                    "id": cand_id,
                                    "text": full_text,
                                    "tone_tag": tone_tag,
                                    "direction": direction_info["name"],
                                    "done": False
                                }
                                yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"
                        except Exception:
                            continue

            final_data = {
                "id": cand_id,
                "text": full_text.strip(),
                "tone_tag": tone_tag,
                "direction": direction_info["name"],
                "done": True
            }
            yield f"data: {json.dumps(final_data, ensure_ascii=False)}\n\n"

        except Exception as e:
            print(f"❌ 流式生成失败 (候选 {cand_idx}): {e}")
            fallback = _simulated_continuation(direction, context)
            if cand_idx < len(fallback):
                fallback[cand_idx]["done"] = True
                yield f"data: {json.dumps(fallback[cand_idx], ensure_ascii=False)}\n\n"

    yield "data: [DONE]\n\n"
