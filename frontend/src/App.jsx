import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, ShieldCheck, Zap, FileText, ChevronRight, Sparkles, RefreshCcw,
  CheckCircle, FileDown, Layers, Wand2, ArrowRightLeft, ListEnd, BarChart3,
  Check, RotateCcw, PenLine, Loader2, Copy, ThumbsUp, Feather
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = "http://localhost:8417/api";

const DIRECTIONS = [
  { key: "continue", label: "继续论述", icon: ArrowRightLeft, color: "from-indigo-500 to-blue-500", desc: "深化分析，延展论证" },
  { key: "contrast", label: "转折过渡", icon: Wand2, color: "from-purple-500 to-pink-500", desc: "视角切换，辩证转折" },
  { key: "summary", label: "总结收尾", icon: ListEnd, color: "from-emerald-500 to-teal-500", desc: "归纳提炼，意义升华" },
  { key: "data", label: "引出数据", icon: BarChart3, color: "from-amber-500 to-orange-500", desc: "实证支撑，量化分析" }
];

function App() {
  const [activeTab, setActiveTab] = useState("detect");
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [result, setResult] = useState(null);
  const [rewriteLevel, setRewriteLevel] = useState("medium");
  const [rewriteResult, setRewriteResult] = useState(null);
  const [quota, setQuota] = useState(10);

  const [contDirection, setContDirection] = useState("continue");
  const [contText, setContText] = useState("");
  const [contCandidates, setContCandidates] = useState([]);
  const [contLoading, setContLoading] = useState(false);
  const [contGeneration, setContGeneration] = useState(0);
  const abortRef = useRef(null);

  const scrollToInput = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetAll = () => {
    setResult(null);
    setRewriteResult(null);
    setText("");
    setFile(null);
    setContCandidates([]);
    scrollToInput();
  };

  const decreaseQuota = () => {
    if (quota > 0) {
      setQuota(prev => prev - 1);
    }
  };

  const handleBatchClick = () => {
    alert("批量处理功能正在内测中。如需大批量处理，请通过 API 接入或联系学术客服。");
  };

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setLoading(true);
    setRewriteResult(null);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${API_BASE}/detect-file`, formData);
      setResult(response.data);
      if (response.data.text) setText(response.data.text);
      decreaseQuota();
      setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 500);
    } catch (err) {
      alert("Error uploading file: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDetectText = async () => {
    if (!text.trim()) return;

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setLoading(true);
    setRewriteResult(null);
    try {
      const response = await axios.post(`${API_BASE}/detect-text`, { text });
      setResult(response.data);
      decreaseQuota();
      setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 500);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRewrite = async () => {
    if (!text.trim()) return;

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setRewriting(true);
    try {
      const response = await axios.post(`${API_BASE}/rewrite`, {
        text: text,
        level: rewriteLevel
      });
      setRewriteResult(response.data);
      decreaseQuota();
      setTimeout(() => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }), 500);
    } catch (err) {
      alert("Rewriting failed: " + err.message);
    } finally {
      setRewriting(false);
    }
  };

  const handleGenerateContinuation = useCallback(async (useStream = true) => {
    if (!contText.trim() || contText.trim().length < 10) {
      alert("请输入至少 10 个字符的上下文文本。");
      return;
    }

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    if (contLoading) return;

    setContLoading(true);
    setContGeneration(prev => prev + 1);
    decreaseQuota();

    if (useStream) {
      setContCandidates([
        { id: "cand_0", text: "", tone_tag: "", direction: "", ai_score: null, streaming: true, done: false },
        { id: "cand_1", text: "", tone_tag: "", direction: "", ai_score: null, streaming: false, done: false },
        { id: "cand_2", text: "", tone_tag: "", direction: "", ai_score: null, streaming: false, done: false }
      ]);

      try {
        const response = await fetch(`${API_BASE}/continuation/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: contText, direction: contDirection })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let activeIdx = 0;

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
              const data = JSON.parse(dataStr);

              if (data.type === "ai_score") {
                setContCandidates(prev => prev.map(c =>
                  c.id === data.id ? { ...c, ai_score: data.ai_score } : c
                ));
              } else {
                setContCandidates(prev => {
                  const next = [...prev];
                  const idx = next.findIndex(c => c.id === data.id);
                  if (idx !== -1) {
                    next[idx] = {
                      ...next[idx],
                      text: data.text,
                      tone_tag: data.tone_tag,
                      direction: data.direction,
                      streaming: !data.done,
                      done: data.done
                    };
                    if (data.done && idx + 1 < next.length) {
                      next[idx + 1].streaming = true;
                    }
                  }
                  return next;
                });
              }
            } catch (e) {
              // ignore parse errors
            }
          }
        }
      } catch (err) {
        alert("流式续写生成失败，切换到非流式模式: " + err.message);
        await handleGenerateContinuation(false);
      } finally {
        setContLoading(false);
        setContCandidates(prev => prev.map(c => ({ ...c, streaming: false })));
      }
    } else {
      try {
        const response = await axios.post(`${API_BASE}/continuation`, {
          text: contText,
          direction: contDirection
        });
        setContCandidates(response.data.candidates.map(c => ({
          ...c,
          streaming: false,
          done: true
        })));
      } catch (err) {
        alert("续写生成失败: " + err.message);
      } finally {
        setContLoading(false);
      }
    }
  }, [contText, contDirection, contLoading, quota]);

  const handleAdopt = (candidateText) => {
    const separator = contText.length > 0 && !contText.endsWith('\n') && !contText.endsWith('。')
      ? " " : "";
    setContText(prev => prev + separator + candidateText);
  };

  const handleCopy = (candidateText) => {
    navigator.clipboard.writeText(candidateText);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-indigo-500/30 pb-20">
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetAll}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white italic">Paper<span className="text-indigo-500 font-black">Wise</span></span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-slate-500 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
              今日额度: <span className={quota > 3 ? "text-indigo-400" : "text-red-400"}>{quota}/10</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold mb-4"
          >
            <Sparkles className="w-3 h-3" />
            全新 Llama 3 改写引擎已上线
          </motion.div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight">
            让 AI 充满 <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">学术人味</span>
          </h1>
          <p className="text-base text-slate-400 max-w-2xl mx-auto">
            一站式学术论文工具：深度 AIGC 检测 + 多级人性化改写 + 智能续写。
          </p>
        </div>

        <div className="flex items-center justify-center mb-8">
          <div className="inline-flex bg-slate-900 border border-slate-800 p-1 rounded-2xl">
            <button
              onClick={() => setActiveTab("detect")}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "detect" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}
            >
              <ShieldCheck className="w-4 h-4" />
              检测与改写
            </button>
            <button
              onClick={() => setActiveTab("continuation")}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "continuation" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}
            >
              <PenLine className="w-4 h-4" />
              智能续写
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "detect" && (
            <motion.div
              key="detect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-12">
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 pointer-events-none"></div>

                    <div className="relative mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex gap-2">
                          <button className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium border border-slate-700">文本模式</button>
                          <div className="relative group">
                            <button
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${loading ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                              disabled={loading}
                            >
                              {loading ? (
                                <>
                                  <RefreshCcw className="w-4 h-4 animate-spin" />
                                  上传中...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4" />
                                  上传文件
                                </>
                              )}
                            </button>
                            <input
                              type="file"
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              onChange={handleFileUpload}
                              accept=".pdf,.docx,.txt"
                              disabled={loading}
                            />
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">
                          当前字数: {text.length} / 5000
                        </div>
                      </div>

                      <textarea
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[300px] transition-all text-sm leading-relaxed"
                        placeholder="在此输入您的学术论文片段，或上传附件..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      ></textarea>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                          {['low', 'medium', 'high'].map(l => (
                            <button
                              key={l}
                              onClick={() => setRewriteLevel(l)}
                              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${rewriteLevel === l ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                              {l === 'low' ? '轻微' : l === 'medium' ? '中度' : '深度'}改写
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Layers className="w-4 h-4" />
                          <span>术语锁定已开启</span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={handleDetectText}
                          disabled={loading || !text.trim()}
                          className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all border border-slate-700"
                        >
                          {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                          仅检测 AI 率
                        </button>
                        <button
                          onClick={handleRewrite}
                          disabled={rewriting || !text.trim()}
                          className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/20"
                        >
                          {rewriting ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                          一键人性化改写
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {(result || rewriteResult) && (
                    <motion.div
                      initial={{ opacity: 0, y: 40 }}
                      animate={{ opacity: 1, y: 0 }}
                      id="results-section"
                      className="lg:col-span-12 space-y-8"
                    >
                      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 overflow-hidden relative">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                          <div>
                            <h2 className="text-2xl font-bold text-white mb-2">分析报告</h2>
                            <p className="text-slate-400 text-sm">基于 RoBERTa 及语义突发性检测引擎</p>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-center">
                              <p className="text-xs text-slate-500 uppercase font-bold mb-1">原文 AI 率</p>
                              <p className={`text-3xl font-black ${result?.overall_ai_score > 50 ? 'text-red-500' : 'text-green-500'}`}>
                                {result?.overall_ai_score}%
                              </p>
                            </div>
                            {rewriteResult && (
                              <div className="flex items-center gap-6 pl-6 border-l border-slate-800">
                                <ChevronRight className="text-slate-700" />
                                <div className="text-center">
                                  <p className="text-xs text-indigo-400 uppercase font-bold mb-1">改写后 AI 率</p>
                                  <p className="text-3xl font-black text-indigo-400">
                                    {rewriteResult.detection_after?.overall_ai_score}%
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${result?.overall_ai_score}%` }}
                            transition={{ duration: 1, delay: 0.2 }}
                            className={`h-full ${result?.overall_ai_score > 50 ? 'bg-red-500' : 'bg-green-500'}`}
                          ></motion.div>
                          {rewriteResult && (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${rewriteResult.detection_after?.overall_ai_score}%` }}
                              transition={{ duration: 1, delay: 0.5 }}
                              className="h-full bg-indigo-500 border-l-2 border-slate-900"
                            ></motion.div>
                          )}
                        </div>
                      </div>

                      {rewriteResult && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6 backdrop-blur">
                            <h3 className="text-sm font-bold text-slate-500 mb-4 flex items-center gap-2">
                              <FileText className="w-4 h-4" /> 原文
                            </h3>
                            <div className="text-sm leading-relaxed text-slate-400 h-[400px] overflow-y-auto pr-4">
                              {text}
                            </div>
                          </div>
                          <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl shadow-indigo-500/5">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-sm font-bold text-indigo-400 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" /> 人性化改写文
                              </h3>
                              <button
                                onClick={() => {
                                  const blob = new Blob([rewriteResult.rewritten_text], { type: 'text/plain' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = 'rewritten_paper.txt';
                                  a.click();
                                }}
                                className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                              >
                                <FileDown className="w-3 h-3" /> 导出 TXT
                              </button>
                            </div>
                            <div className="text-sm leading-relaxed text-white h-[400px] overflow-y-auto pr-4 font-medium">
                              {rewriteResult.rewritten_text}
                            </div>
                          </div>
                        </div>
                      )}

                      {!rewriteResult && result?.details && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {result.details.map((chunk, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.05 }}
                              className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl hover:border-slate-700 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">段落 {idx + 1}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chunk.ai_score > 0.5 ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                  {Math.round(chunk.ai_score * 100)}%
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                                {chunk.text}
                              </p>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {activeTab === "continuation" && (
            <motion.div
              key="continuation"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 pointer-events-none"></div>

                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <PenLine className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white">智能续写工作台</h2>
                      </div>
                      <div className="text-xs text-slate-500">
                        上下文字数: <span className={contText.length > 1000 ? "text-amber-400" : "text-slate-300"}>{contText.length}</span> / 1000 (超出自动截取末尾)
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3 block">选择续写方向</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {DIRECTIONS.map(d => {
                          const Icon = d.icon;
                          const isActive = contDirection === d.key;
                          return (
                            <button
                              key={d.key}
                              onClick={() => setContDirection(d.key)}
                              className={`relative p-4 rounded-2xl border transition-all text-left overflow-hidden group ${isActive ? 'border-transparent bg-slate-800/50' : 'border-slate-800 hover:border-slate-700 bg-slate-950/30'}`}
                            >
                              {isActive && (
                                <motion.div
                                  layoutId="direction-active"
                                  className={`absolute inset-0 bg-gradient-to-br ${d.color} opacity-15`}
                                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                              )}
                              <div className="relative">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 bg-gradient-to-br ${d.color} shadow-lg`}>
                                  <Icon className="w-4 h-4 text-white" />
                                </div>
                                <div className="text-sm font-bold text-white mb-0.5">{d.label}</div>
                                <div className="text-[11px] text-slate-500">{d.desc}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <textarea
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[200px] transition-all text-sm leading-relaxed resize-y"
                      placeholder="在此粘贴或输入论文的已有段落...系统将自动提取最后 1000 字作为续写上下文。"
                      value={contText}
                      onChange={(e) => setContText(e.target.value)}
                    ></textarea>

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Feather className="w-4 h-4" />
                        <span>每次生成 3 条候选续写，支持流式输出与 AI 率实时检测</span>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setContText("");
                            setContCandidates([]);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-sm font-bold transition-all border border-slate-700"
                        >
                          <RotateCcw className="w-4 h-4" />
                          清空
                        </button>
                        <button
                          onClick={() => handleGenerateContinuation(true)}
                          disabled={contLoading || !contText.trim() || contText.trim().length < 10}
                          className="flex items-center gap-2 px-7 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-indigo-500/20"
                        >
                          {contLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              生成中...
                            </>
                          ) : contCandidates.length > 0 ? (
                            <>
                              <RefreshCcw className="w-4 h-4" />
                              再来一组
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              生成续写
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {contCandidates.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        候选续写方案 · 第 {contGeneration} 组
                      </h3>
                      <div className="text-xs text-slate-600">
                        点击「采纳」将续写内容追加到输入区
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {contCandidates.map((cand, idx) => (
                        <motion.div
                          key={cand.id || idx}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className={`relative bg-slate-900 border rounded-3xl p-5 overflow-hidden transition-all ${cand.streaming ? 'border-indigo-500/50 shadow-xl shadow-indigo-500/10' : 'border-slate-800 hover:border-slate-700'}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">候选 {idx + 1}</span>
                              {cand.tone_tag && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 border border-indigo-500/30">
                                  {cand.tone_tag}
                                </span>
                              )}
                            </div>
                            {cand.ai_score !== null && cand.ai_score !== undefined ? (
                              <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${cand.ai_score > 50 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                                AI率 {cand.ai_score}%
                              </div>
                            ) : cand.done ? (
                              <div className="text-[10px] text-slate-600 flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                检测中
                              </div>
                            ) : null}
                          </div>

                          <div className="min-h-[160px] mb-4">
                            <p className="text-sm leading-relaxed text-slate-300">
                              {cand.text || (cand.streaming ? <span className="text-slate-600">正在生成...</span> : "")}
                              {cand.streaming && (
                                <span className="inline-block w-1.5 h-4 bg-indigo-400 rounded-sm animate-pulse ml-0.5 align-middle"></span>
                              )}
                            </p>
                          </div>

                          <div className="flex gap-2 pt-3 border-t border-slate-800">
                            <button
                              onClick={() => handleCopy(cand.text)}
                              disabled={!cand.text}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white disabled:opacity-40"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              复制
                            </button>
                            <button
                              onClick={() => handleAdopt(cand.text)}
                              disabled={!cand.text || !cand.done}
                              className="flex-[1.5] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              采纳并追加
                            </button>
                          </div>

                          {cand.streaming && (
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-pulse"></div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {!contCandidates.length && !contLoading && (
                  <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
                      <PenLine className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-slate-400 font-bold mb-2">选择续写方向，输入论文段落</h3>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                      系统将基于上下文智能生成 3 条风格各异的续写方案，每条包含 AI 率预估与语气标签，供您择优采纳。
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {activeTab === "detect" && !result && !rewriteResult && (
        <div className="max-w-4xl mx-auto px-4 mt-16 opacity-30 grayscale contrast-125">
          <div className="flex flex-wrap justify-center gap-12 items-center">
            <div className="text-xl font-bold italic">IEEE</div>
            <div className="text-xl font-bold italic">Springer</div>
            <div className="text-xl font-bold italic">Nature</div>
            <div className="text-xl font-bold italic">Elsevier</div>
            <div className="text-xl font-bold italic">ACM</div>
          </div>
        </div>
      )}

      <footer className="mt-12 border-t border-slate-800 py-8 text-center text-slate-500 text-sm">
        <p>© 2026 PaperWise AI. 专业级学术诚信守护者。</p>
      </footer>
    </div>
  );
}

export default App;
