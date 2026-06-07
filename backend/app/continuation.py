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
            "进一步而言，近年来多项纵向研究的实证证据一致印证了上述假设，表明即便在控制混淆变量后，所观测到的效应依然稳健存在。这些研究采用多层回归建模与倾向得分匹配等方法，其方法论的严谨性为研究者所推导的因果推断提供了充分可信度。与此同时，来自半结构化访谈的质性数据也为揭示作用机制提供了互补性的洞见。",
            "在这一理论框架基础上，后续研究识别出若干调节变量关系强度的边界条件。具体而言，制度支持、资源可获得性以及文化规范等情境因素均表现出显著的调节效应。这些发现表明，既有模型可能需要进一步细化，以充分解释在不同人群与研究场景中所观测到的异质性效应。",
            "将这一研究脉络向前延展，时间维度显然值得更为深入的考察。变量间随时间演进的动态互动模式，恰恰是横断面设计所难以捕捉的关键所在。近年来，增长曲线建模与时间序列分析等方法论进展，使得研究者能够以前所未有的精度刻画这些发展轨迹，从而对所研究现象形成更为细致入微的理解。"
        ],
        "contrast": [
            "然而，尽管上述发现颇具说服力，仍有若干重要局限值得正视。批评者指出，抽样方法可能存在选择偏差，核心构念的操作化定义也尚有其他解读空间。此外，将研究结论推广至非西方教育背景人群的普适性问题，仍是未来研究必须系统回应的重要课题。",
            "尽管如此，另一种理论视角提供了略显不同的解释路径。竞争性框架的支持者认为，所观测到的相关关系可能反映的是由未测量第三变量驱动的虚假关联，而非真实的因果关系。这一对立立场虽具争议性，但确实激发了富有成效的学术讨论，并促使学界重新审视领域内的既有假设。",
            "与之相对，来自替代研究范式的新证据对学界共识提出了挑战。采用混合方法的研究者揭示了纯量化分析难以捕捉的质性维度。这些迥异的发现凸显了方法论多元主义的重要性，也警示我们在探究复杂社会现象时，切不可过度依赖单一的分析框架。"
        ],
        "summary": [
            "综上，本文所梳理的实证证据整体指向对该现象的一致性理解。累积研究发现在多种方法论路径下均呈现出稳健且连贯的模式，从而增强了核心论点的可信度。本研究的综合结论为构建更为完善的理论框架奠定了基础，可对未来实证探究及循证决策实践提供指导。",
            "综上所述，本研究开展的多维度分析揭示了若干此前未被充分探讨的关键层面。整合后的研究发现不仅印证了基础性假设，更揭示了丰富理论内涵的意外细节。这些洞见对领域内学术讨论与实践干预策略均具有重要启示意义。",
            "整体而言，本项研究在实证与理论层面的贡献共同推动了领域的多维度发展。通过系统回应既有研究局限并整合分散的研究脉络，本工作为后续学术探索奠定了更为坚实的基础。其启示超越当下语境，或可为相关学科的概念完善与理论拓展提供有益参考。"
        ],
        "data": [
            "为具体说明上述论断，兹呈现如下实证发现。对2024年全国调查数据（样本量N=12847）的分析显示，68.3%的受访者呈现出预期的反应模式，效应量d=0.42且具有统计显著性（p<0.001，95%置信区间：[0.35, 0.49]）。回归模型解释了结果变量34.7%的方差，较基准模型有显著提升。",
            "量化分析提供了有力的验证支持。表2呈现了主要测量指标的描述性统计与相关矩阵结果。所有多题项量表的克朗巴赫α系数均超过0.82，表明内部一致性良好。层级回归分析显示，预测变量共同解释了效标变量41.2%的方差，F(5, 312)=43.8，p<0.001。",
            "实证结果令人瞩目。在三项独立实验中，处理组在主要结果测量上的表现始终优于控制组，均值差异幅度介于18.5%至27.3%之间。跨研究的元分析聚合效应量为r=0.31（p<0.0001），异质性程度极低（I²=12.4%，Q=8.1，p=0.32）。"
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
