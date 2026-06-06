import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, ShieldCheck, Zap, FileText, ChevronRight, Sparkles, RefreshCcw,
  CheckCircle, FileDown, Layers, Wand2, ArrowRightLeft, ListEnd, BarChart3,
  Check, RotateCcw, PenLine, Loader2, Copy, ThumbsUp, Feather, Lightbulb,
  ChevronDown, FileSearch, Highlighter, AlignJustify, BookOpen,
  Gauge, Target, AlertTriangle, Info, TrendingUp, Award, Type, Hash, Users
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import RatingPanel from './components/RatingPanel';
import RatingStatistics from './components/RatingStatistics';
import SuggestionBanner from './components/SuggestionBanner';
import CollabEditor from './components/CollabEditor';

const API_BASE = "http://localhost:8417/api";

const DIRECTIONS = [
  { key: "continue", label: "继续论述", icon: ArrowRightLeft, color: "from-indigo-500 to-blue-500", desc: "深化分析，延展论证" },
  { key: "contrast", label: "转折过渡", icon: Wand2, color: "from-purple-500 to-pink-500", desc: "视角切换，辩证转折" },
  { key: "summary", label: "总结收尾", icon: ListEnd, color: "from-emerald-500 to-teal-500", desc: "归纳提炼，意义升华" },
  { key: "data", label: "引出数据", icon: BarChart3, color: "from-amber-500 to-orange-500", desc: "实证支撑，量化分析" }
];

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('room=')) {
      return "collab";
    }
    return "detect";
  });
  const [initialRoomId, setInitialRoomId] = useState(() => {
    if (typeof window !== 'undefined') {
      const match = window.location.hash.match(/room=([a-zA-Z0-9]+)/);
      return match ? match[1] : '';
    }
    return '';
  });
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

  const [ratingRefreshKey, setRatingRefreshKey] = useState(0);
  const [externalSuggestions, setExternalSuggestions] = useState([]);
  const [toastMsg, setToastMsg] = useState("");

  const [sumText, setSumText] = useState("");
  const [sumFile, setSumFile] = useState(null);
  const [sumLoading, setSumLoading] = useState(false);
  const [sumResult, setSumResult] = useState(null);
  const [sumExpanded, setSumExpanded] = useState({
    background: true,
    purpose: true,
    methods: true,
    results: true,
    conclusion: true
  });
  const [sumEditable, setSumEditable] = useState(null);

  const [styleText, setStyleText] = useState("");
  const [styleLevel, setStyleLevel] = useState("sci_q2");
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleResult, setStyleResult] = useState(null);
  const [activeStyleHighlight, setActiveStyleHighlight] = useState(null);
  const styleTextRef = useRef(null);

  const scrollToInput = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetAll = () => {
    setResult(null);
    setRewriteResult(null);
    setText("");
    setFile(null);
    setContCandidates([]);
    setSumResult(null);
    setSumText("");
    setSumFile(null);
    setSumEditable(null);
    setStyleResult(null);
    setStyleText("");
    setActiveStyleHighlight(null);
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

  const MAX_SUM_LENGTH = 20000;

  const handleSummarizeFileUpload = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setSumLoading(true);
    setSumResult(null);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post(`${API_BASE}/summarize-file`, formData);
      setSumResult(response.data);
      if (response.data.original_text) setSumText(response.data.original_text);
      setSumEditable({ ...response.data.structured_summary });
      decreaseQuota();
      setTimeout(() => document.getElementById('summary-results-section')?.scrollIntoView({ behavior: 'smooth' }), 300);
    } catch (err) {
      alert("智能摘要失败: " + (err.response?.data?.detail || err.message));
    } finally {
      setSumLoading(false);
    }
  };

  const handleSummarizeText = async () => {
    if (!sumText.trim()) return;

    if (sumText.trim().length > MAX_SUM_LENGTH) {
      alert(`输入文本超出字数限制（${MAX_SUM_LENGTH}字），当前 ${sumText.trim().length} 字。请精简后重试。`);
      return;
    }

    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }

    setSumLoading(true);
    setSumResult(null);
    try {
      const response = await axios.post(`${API_BASE}/summarize-text`, { text: sumText });
      setSumResult(response.data);
      setSumEditable({ ...response.data.structured_summary });
      decreaseQuota();
      setTimeout(() => document.getElementById('summary-results-section')?.scrollIntoView({ behavior: 'smooth' }), 300);
    } catch (err) {
      alert("智能摘要失败: " + (err.response?.data?.detail || err.message));
    } finally {
      setSumLoading(false);
    }
  };

  const toggleSection = (key) => {
    setSumExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSummaryEdit = (key, value) => {
    setSumEditable(prev => ({ ...prev, [key]: value }));
  };

  const handleCopyFullSummary = () => {
    if (!sumEditable) return;
    const labels = {
      background: "【研究背景】",
      purpose: "【研究目的】",
      methods: "【研究方法】",
      results: "【研究结果】",
      conclusion: "【研究结论】"
    };
    const text = Object.entries(sumEditable)
      .map(([k, v]) => `${labels[k] || k}\n${v}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setToastMsg("摘要已复制到剪贴板");
  };

  const MAX_STYLE_LENGTH = 30000;
  const JOURNAL_LEVELS = [
    { key: "sci_q1", label: "SCI 一区", desc: "顶刊标准，要求最严格" },
    { key: "sci_q2", label: "SCI 二区", desc: "优质期刊，标准适中" },
    { key: "sci_q3", label: "SCI 三区", desc: "标准期刊，相对宽松" }
  ];

  const STYLE_DIMENSIONS = [
    { key: "sentence_length", label: "句子长度", icon: Type, color: "from-sky-500 to-blue-600" },
    { key: "vocabulary", label: "词汇丰富度", icon: Hash, color: "from-emerald-500 to-teal-600" },
    { key: "passive_voice", label: "被动语态", icon: Target, color: "from-amber-500 to-orange-600" },
    { key: "connectors", label: "逻辑连接词", icon: TrendingUp, color: "from-purple-500 to-fuchsia-600" },
    { key: "paragraphs", label: "段落结构", icon: Layers, color: "from-rose-500 to-pink-600" }
  ];

  const handleStyleAnalyze = async () => {
    if (!styleText.trim()) return;
    if (styleText.trim().length > MAX_STYLE_LENGTH) {
      alert(`输入文本超出字数限制（${MAX_STYLE_LENGTH}字），当前 ${styleText.trim().length} 字。请精简后重试。`);
      return;
    }
    if (quota <= 0) {
      alert("今日额度已用完，请明天再试或升级账户。");
      return;
    }
    setStyleLoading(true);
    setStyleResult(null);
    setActiveStyleHighlight(null);
    try {
      const response = await axios.post(`${API_BASE}/style-analyze`, {
        text: styleText,
        journal_level: styleLevel
      });
      setStyleResult(response.data);
      decreaseQuota();
      setTimeout(() => document.getElementById('style-results-section')?.scrollIntoView({ behavior: 'smooth' }), 300);
    } catch (err) {
      alert("写作风格诊断失败: " + (err.response?.data?.detail || err.message));
    } finally {
      setStyleLoading(false);
    }
  };

  const renderStyleHighlightedText = (text, suggestions, activeHighlight) => {
    if (!suggestions || suggestions.length === 0) {
      return <span>{text}</span>;
    }
    const relevant = suggestions.filter(s => s.start !== undefined && s.end !== undefined && s.start < s.end);
    if (relevant.length === 0) {
      return <span>{text}</span>;
    }
    const sorted = [...relevant].sort((a, b) => a.start - b.start);
    const segments = [];
    let lastEnd = 0;
    sorted.forEach((sug, idx) => {
      if (sug.start > lastEnd) {
        segments.push({ type: 'normal', text: text.slice(lastEnd, sug.start) });
      }
      const isActive = activeHighlight && activeHighlight.start === sug.start && activeHighlight.end === sug.end;
      const severityColors = {
        high: 'bg-red-500/25 border-b-2 border-red-500 text-red-200',
        medium: 'bg-amber-500/25 border-b-2 border-amber-500 text-amber-200',
        low: 'bg-sky-500/20 border-b-2 border-sky-500 text-sky-200'
      };
      segments.push({
        type: 'highlight',
        text: text.slice(sug.start, sug.end),
        suggestion: sug,
        idx,
        isActive,
        className: severityColors[sug.severity] || severityColors.medium
      });
      lastEnd = sug.end;
    });
    if (lastEnd < text.length) {
      segments.push({ type: 'normal', text: text.slice(lastEnd) });
    }
    return segments.map((seg, i) => {
      if (seg.type === 'highlight') {
        return (
          <mark
            key={i}
            className={`${seg.className} cursor-pointer rounded px-0.5 transition-all ${seg.isActive ? 'ring-2 ring-offset-2 ring-offset-slate-950 ring-white scale-[1.02]' : ''}`}
            title={`${seg.suggestion.title}`}
            onClick={() => setActiveStyleHighlight(seg.suggestion)}
          >
            {seg.text}
          </mark>
        );
      }
      return <span key={i}>{seg.text}</span>;
    });
  };

  const scrollToStylePosition = (suggestion) => {
    if (!suggestion || suggestion.start === 0 && suggestion.end === 0) return;
    setActiveStyleHighlight(suggestion);
    if (styleTextRef.current) {
      styleTextRef.current.scrollTop = 0;
    }
    setTimeout(() => {
      const marks = styleTextRef.current?.querySelectorAll('mark');
      if (marks && marks.length > 0) {
        for (let m of marks) {
          if (m.title === suggestion.title) {
            m.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
          }
        }
      }
    }, 100);
  };

  const ScoreGauge = ({ score, label, color, size = 120 }) => {
    const radius = (size - 16) / 2;
    const circumference = 2 * Math.PI * radius;
    const progress = (score / 100) * circumference;
    const strokeColor = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
    return (
      <div className="flex flex-col items-center">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} stroke="#1e293b" strokeWidth="10" fill="none" />
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              stroke={strokeColor} strokeWidth="10" fill="none"
              strokeDasharray={`${progress} ${circumference}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 1s ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-black text-white">{score}</span>
          </div>
        </div>
        <span className={`mt-2 text-xs font-bold bg-gradient-to-r ${color} bg-clip-text text-transparent`}>{label}</span>
      </div>
    );
  };

  const renderHighlightedText = (text, keySentences) => {
    if (!keySentences || keySentences.length === 0) {
      return <span>{text}</span>;
    }

    const sorted = [...keySentences].sort((a, b) => a.start - b.start);
    const segments = [];
    let lastEnd = 0;

    sorted.forEach((ks, idx) => {
      if (ks.start > lastEnd) {
        segments.push({
          type: 'normal',
          text: text.slice(lastEnd, ks.start)
        });
      }
      segments.push({
        type: 'highlight',
        text: ks.text,
        score: ks.score,
        idx: idx
      });
      lastEnd = ks.start + ks.text.length;
    });

    if (lastEnd < text.length) {
      segments.push({
        type: 'normal',
        text: text.slice(lastEnd)
      });
    }

    return segments.map((seg, i) => {
      if (seg.type === 'highlight') {
        return (
          <mark
            key={i}
            className="bg-amber-400/30 text-amber-200 border-b border-amber-400/60 rounded px-0.5"
            title={`关键句 #${seg.idx + 1} · TextRank 分数: ${seg.score}`}
          >
            {seg.text}
          </mark>
        );
      }
      return <span key={i}>{seg.text}</span>;
    });
  };

  const SUMMARY_SECTIONS = [
    { key: "background", label: "研究背景", icon: BookOpen, color: "from-sky-500 to-blue-500" },
    { key: "purpose", label: "研究目的", icon: Lightbulb, color: "from-amber-500 to-orange-500" },
    { key: "methods", label: "研究方法", icon: Layers, color: "from-emerald-500 to-teal-500" },
    { key: "results", label: "研究结果", icon: BarChart3, color: "from-purple-500 to-fuchsia-500" },
    { key: "conclusion", label: "研究结论", icon: CheckCircle, color: "from-rose-500 to-pink-500" }
  ];

  const handleRatingSuggestions = (suggestions) => {
    setExternalSuggestions(suggestions);
    setRatingRefreshKey(prev => prev + 1);
  };

  const handleApplySuggestion = (suggestion) => {
    if (suggestion.dimension === 'ai_reduction') {
      setRewriteLevel('high');
      setToastMsg('已自动切换到深度改写模式');
    } else {
      setToastMsg(`已启用：${suggestion.action}`);
    }
    setExternalSuggestions(prev => prev.filter(s => s.dimension !== suggestion.dimension));
    setTimeout(() => setToastMsg(""), 3000);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(""), 3000);
    return () => clearTimeout(t);
  }, [toastMsg]);

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
        <SuggestionBanner
          externalSuggestions={externalSuggestions}
          onApply={handleApplySuggestion}
          refreshTrigger={ratingRefreshKey}
        />

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

        <div className="mb-10">
          <RatingStatistics refreshTrigger={ratingRefreshKey} />
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
            <button
              onClick={() => setActiveTab("summary")}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "summary" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}
            >
              <AlignJustify className="w-4 h-4" />
              智能摘要
            </button>
            <button
              onClick={() => setActiveTab("style")}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "style" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Gauge className="w-4 h-4" />
              风格诊断
            </button>
            <button
              onClick={() => setActiveTab("collab")}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "collab" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Users className="w-4 h-4" />
              实时协作
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
                        <>
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

                          <RatingPanel
                            key={ratingRefreshKey + '-' + (rewriteResult?.rewritten_text?.length || 0)}
                            rewriteResult={rewriteResult}
                            rewriteLevel={rewriteLevel}
                            originalText={text}
                            onSuggestions={handleRatingSuggestions}
                          />
                        </>
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

          {activeTab === "summary" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-500/5 pointer-events-none"></div>

                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <AlignJustify className="w-5 h-5 text-amber-400" />
                        <h2 className="text-lg font-bold text-white">智能摘要工作台</h2>
                      </div>
                      <div className="text-xs text-slate-500">
                        当前字数: <span className={sumText.length > MAX_SUM_LENGTH ? "text-red-400 font-bold" : sumText.length > MAX_SUM_LENGTH * 0.9 ? "text-amber-400" : "text-slate-300"}>{sumText.length}</span> / {MAX_SUM_LENGTH}
                        {sumText.length > MAX_SUM_LENGTH && <span className="ml-2 text-red-400">（已超限）</span>}
                      </div>
                    </div>

                    <div className="mb-4 flex gap-2">
                      <button className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium border border-slate-700">文本模式</button>
                      <div className="relative group">
                        <button
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${sumLoading ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'hover:bg-slate-800 text-slate-400 hover:text-white'}`}
                          disabled={sumLoading}
                        >
                          {sumLoading ? (
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
                          onChange={handleSummarizeFileUpload}
                          accept=".pdf,.docx,.txt"
                          disabled={sumLoading}
                        />
                      </div>
                    </div>

                    <textarea
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-slate-300 focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none min-h-[280px] transition-all text-sm leading-relaxed resize-y"
                      placeholder="在此粘贴论文全文，或上传 PDF/DOCX/TXT 文件。系统将自动提取关键句并生成结构化摘要（背景/目的/方法/结果/结论）。最长支持 20000 字。"
                      value={sumText}
                      onChange={(e) => setSumText(e.target.value)}
                    ></textarea>

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <FileSearch className="w-4 h-4" />
                        <span>基于 TextRank 关键句提取 + Groq LLM 结构化摘要生成</span>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setSumText("");
                            setSumResult(null);
                            setSumEditable(null);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-sm font-bold transition-all border border-slate-700"
                        >
                          <RotateCcw className="w-4 h-4" />
                          清空
                        </button>
                        <button
                          onClick={handleSummarizeText}
                          disabled={sumLoading || !sumText.trim() || sumText.trim().length > MAX_SUM_LENGTH}
                          className="flex items-center gap-2 px-7 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-amber-500/20"
                        >
                          {sumLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              生成中...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              生成智能摘要
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {sumResult && sumEditable && (
                  <motion.div
                    id="summary-results-section"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                          <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                            <Highlighter className="w-5 h-5 text-amber-400" />
                            关键句提取结果
                          </h3>
                          <p className="text-slate-400 text-sm">
                            基于 TextRank + PageRank 迭代算法，共提取 {sumResult.key_sentences?.length || 0} 句核心论点
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-xs text-slate-500 uppercase font-bold mb-1">摘要 AI 率</p>
                            <p className={`text-3xl font-black ${sumResult.summary_ai_detection?.overall_ai_score > 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                              {sumResult.summary_ai_detection?.overall_ai_score}%
                            </p>
                          </div>
                          <button
                            onClick={handleCopyFullSummary}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
                          >
                            <Copy className="w-4 h-4" />
                            一键复制摘要
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 p-5 bg-slate-950/70 border border-slate-800 rounded-2xl max-h-[400px] overflow-y-auto">
                        <p className="text-sm leading-loose text-slate-300 whitespace-pre-wrap">
                          {renderHighlightedText(sumResult.original_text || sumText, sumResult.key_sentences)}
                        </p>
                      </div>

                      {sumResult.key_sentences && sumResult.key_sentences.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">提取的关键句列表</p>
                          <div className="grid grid-cols-1 gap-2">
                            {sumResult.key_sentences.map((ks, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-slate-300 leading-relaxed">{ks.text}</p>
                                  <p className="text-[10px] text-slate-600 mt-1">TextRank 权重: {ks.score}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                          <FileText className="w-5 h-5 text-indigo-400" />
                          结构化摘要 · 可编辑
                        </h3>
                        <div className="text-xs text-slate-500">点击各部分标题可折叠/展开</div>
                      </div>

                      <div className="space-y-3">
                        {SUMMARY_SECTIONS.map((sec, idx) => {
                          const Icon = sec.icon;
                          const isExpanded = sumExpanded[sec.key];
                          return (
                            <motion.div
                              key={sec.key}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className={`border rounded-2xl overflow-hidden transition-colors ${isExpanded ? 'border-slate-700 bg-slate-900/50' : 'border-slate-800'}`}
                            >
                              <button
                                onClick={() => toggleSection(sec.key)}
                                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-800/50 transition-colors"
                              >
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br ${sec.color} shadow-lg`}>
                                  <Icon className="w-4 h-4 text-white" />
                                </div>
                                <span className="font-bold text-white">{sec.label}</span>
                                <div className="ml-auto flex items-center gap-3">
                                  {!isExpanded && (
                                    <span className="text-xs text-slate-500 line-clamp-1 max-w-[280px] text-right">
                                      {sumEditable[sec.key]}
                                    </span>
                                  )}
                                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                  </motion.div>
                                </div>
                              </button>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-5 pb-5">
                                      <textarea
                                        value={sumEditable[sec.key] || ""}
                                        onChange={(e) => handleSummaryEdit(sec.key, e.target.value)}
                                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-sm leading-relaxed text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[100px] resize-y transition-all"
                                        placeholder={`在此编辑${sec.label}内容...`}
                                      ></textarea>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}

                {!sumResult && !sumLoading && (
                  <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
                      <AlignJustify className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-slate-400 font-bold mb-2">粘贴论文或上传文件，一键生成结构化摘要</h3>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                      系统将基于 TextRank 算法提取关键句，调用大模型生成包含研究背景、目的、方法、结果、结论五部分的结构化摘要，并检测 AI 生成率。
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "style" && (
            <motion.div
              key="style"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-emerald-500/5 pointer-events-none"></div>

                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Gauge className="w-5 h-5 text-sky-400" />
                        <h2 className="text-lg font-bold text-white">写作风格诊断工作台</h2>
                      </div>
                      <div className="text-xs text-slate-500">
                        当前字数: <span className={styleText.length > MAX_STYLE_LENGTH ? "text-red-400 font-bold" : styleText.length > MAX_STYLE_LENGTH * 0.9 ? "text-amber-400" : "text-slate-300"}>{styleText.length}</span> / {MAX_STYLE_LENGTH}
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-3 block">目标期刊级别</label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {JOURNAL_LEVELS.map(lvl => {
                          const isActive = styleLevel === lvl.key;
                          return (
                            <button
                              key={lvl.key}
                              onClick={() => setStyleLevel(lvl.key)}
                              className={`relative p-4 rounded-2xl border transition-all text-left overflow-hidden group ${isActive ? 'border-transparent bg-slate-800/50' : 'border-slate-800 hover:border-slate-700 bg-slate-950/30'}`}
                            >
                              {isActive && (
                                <motion.div
                                  layoutId="journal-active"
                                  className="absolute inset-0 bg-gradient-to-br from-sky-500/20 to-emerald-500/20"
                                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                              )}
                              <div className="relative">
                                <div className="text-sm font-bold text-white mb-0.5">{lvl.label}</div>
                                <div className="text-[11px] text-slate-500">{lvl.desc}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <textarea
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-5 text-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none min-h-[280px] transition-all text-sm leading-relaxed resize-y"
                      placeholder="在此粘贴论文全文或段落，系统将从句子长度、词汇丰富度、被动语态使用、逻辑连接词、段落结构五个维度进行深度诊断，并与目标期刊标准做对比，给出具体改进建议。"
                      value={styleText}
                      onChange={(e) => setStyleText(e.target.value)}
                    ></textarea>

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Award className="w-4 h-4" />
                        <span>基于学术写作计量语言学特征分析，覆盖 SCI Q1-Q3 期刊写作标准</span>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setStyleText("");
                            setStyleResult(null);
                            setActiveStyleHighlight(null);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-sm font-bold transition-all border border-slate-700"
                        >
                          <RotateCcw className="w-4 h-4" />
                          清空
                        </button>
                        <button
                          onClick={handleStyleAnalyze}
                          disabled={styleLoading || !styleText.trim() || styleText.trim().length > MAX_STYLE_LENGTH}
                          className="flex items-center gap-2 px-7 py-2.5 bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-sky-500/20"
                        >
                          {styleLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              诊断中...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              开始风格诊断
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {styleResult && (
                  <motion.div
                    id="style-results-section"
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 overflow-hidden relative">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                        <div>
                          <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                            <Gauge className="w-6 h-6 text-sky-400" />
                            风格诊断综合报告
                          </h2>
                          <p className="text-slate-400 text-sm">
                            目标期刊级别: <span className="text-white font-bold">{JOURNAL_LEVELS.find(j => j.key === styleLevel)?.label}</span>
                            &nbsp;·&nbsp; 共 {styleResult.analysis.vocabulary.total_words} 词 / {styleResult.analysis.sentence_length.sentences.length} 句 / {styleResult.analysis.paragraphs.count} 段
                          </p>
                        </div>
                        <div className="text-center px-8 py-4 bg-slate-950/60 rounded-2xl border border-slate-800">
                          <p className="text-xs text-slate-500 uppercase font-bold mb-1">综合风格得分</p>
                          <p className={`text-4xl font-black ${styleResult.scores.overall >= 80 ? 'text-emerald-400' : styleResult.scores.overall >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                            {styleResult.scores.overall}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                        {STYLE_DIMENSIONS.map((dim, idx) => {
                          const Icon = dim.icon;
                          const score = styleResult.scores[dim.key];
                          return (
                            <motion.div
                              key={dim.key}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.08 }}
                              className="p-4 bg-slate-950/50 border border-slate-800 rounded-2xl flex flex-col items-center"
                            >
                              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${dim.color} flex items-center justify-center mb-2 shadow-lg`}>
                                <Icon className="w-5 h-5 text-white" />
                              </div>
                              <ScoreGauge score={score} label={dim.label} color={dim.color} size={90} />
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-7 space-y-6">
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Highlighter className="w-4 h-4 text-sky-400" />
                            原文问题点标注 · 点击高亮查看详情
                          </h3>
                          <div
                            ref={styleTextRef}
                            className="p-5 bg-slate-950/70 border border-slate-800 rounded-2xl max-h-[500px] overflow-y-auto"
                          >
                            <p className="text-sm leading-loose text-slate-300 whitespace-pre-wrap">
                              {renderStyleHighlightedText(styleResult.original_text, styleResult.suggestions, activeStyleHighlight)}
                            </p>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded bg-red-500/40 border-b-2 border-red-500"></span>
                              高优先级
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded bg-amber-500/40 border-b-2 border-amber-500"></span>
                              中优先级
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="inline-block w-3 h-3 rounded bg-sky-500/30 border-b-2 border-sky-500"></span>
                              低优先级
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                            <h4 className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <Type className="w-3.5 h-3.5" /> 句子长度统计
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-slate-500">平均句长</span><span className="text-white font-bold">{styleResult.analysis.sentence_length.avg} 词</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">标准差</span><span className="text-white font-bold">{styleResult.analysis.sentence_length.std}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">最短句</span><span className="text-white font-bold">{styleResult.analysis.sentence_length.min} 词</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">最长句</span><span className="text-white font-bold">{styleResult.analysis.sentence_length.max} 词</span></div>
                              <div className="pt-2 mt-2 border-t border-slate-800">
                                <p className="text-xs text-slate-500 mb-1.5">区间分布：</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {Object.entries(styleResult.analysis.sentence_length.distribution || {}).map(([k, v]) => (
                                    <span key={k} className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-full">{k}: {v}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <Hash className="w-3.5 h-3.5" /> 词汇丰富度
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-slate-500">总词数</span><span className="text-white font-bold">{styleResult.analysis.vocabulary.total_words}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">独立词汇数</span><span className="text-white font-bold">{styleResult.analysis.vocabulary.unique_words}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">TTR (类符/形符比)</span><span className="text-white font-bold">{(styleResult.analysis.vocabulary.ttr * 100).toFixed(1)}%</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Hapax 一次词比例</span><span className="text-white font-bold">{(styleResult.analysis.vocabulary.hapax_ratio * 100).toFixed(1)}%</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">一次词数量</span><span className="text-white font-bold">{styleResult.analysis.vocabulary.hapax_count}</span></div>
                            </div>
                          </div>

                          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <Target className="w-3.5 h-3.5" /> 被动语态使用
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-slate-500">被动句占比</span><span className="text-white font-bold">{(styleResult.analysis.passive_voice.passive_rate * 100).toFixed(1)}%</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">被动句数量</span><span className="text-white font-bold">{styleResult.analysis.passive_voice.passive_sentence_count} / {styleResult.analysis.passive_voice.total_sentences}</span></div>
                              <div className="pt-2 mt-2 border-t border-slate-800">
                                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${styleResult.analysis.passive_voice.passive_rate * 100}%` }}
                                    transition={{ duration: 0.8 }}
                                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                                  ></motion.div>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                            <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                              <TrendingUp className="w-3.5 h-3.5" /> 逻辑连接词 & 段落
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between"><span className="text-slate-500">连接词密度</span><span className="text-white font-bold">{(styleResult.analysis.connectors.density * 100).toFixed(2)}%</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">连接词总数</span><span className="text-white font-bold">{styleResult.analysis.connectors.total_count}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">段落数</span><span className="text-white font-bold">{styleResult.analysis.paragraphs.count}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">平均每段句数</span><span className="text-white font-bold">{styleResult.analysis.paragraphs.avg_sentences}</span></div>
                              {styleResult.analysis.connectors.connector_counts && Object.keys(styleResult.analysis.connectors.connector_counts).length > 0 && (
                                <div className="pt-2 mt-2 border-t border-slate-800">
                                  <p className="text-xs text-slate-500 mb-1.5">高频连接词：</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(styleResult.analysis.connectors.connector_counts).slice(0, 8).map(([k, v]) => (
                                      <span key={k} className="text-[10px] px-2 py-0.5 bg-purple-500/10 text-purple-300 border border-purple-500/30 rounded-full">{k}: {v}</span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-5">
                        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sticky top-24">
                          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            具体改进建议 · {styleResult.suggestions.length} 条
                          </h3>
                          {styleResult.suggestions.length === 0 ? (
                            <div className="p-8 text-center bg-slate-950/50 border border-slate-800 rounded-2xl">
                              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                              <p className="text-emerald-400 font-bold">太棒了！</p>
                              <p className="text-sm text-slate-500 mt-1">未发现明显的风格问题，您的写作符合目标期刊标准。</p>
                            </div>
                          ) : (
                            <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
                              {styleResult.suggestions.map((sug, idx) => {
                                const dim = STYLE_DIMENSIONS.find(d => d.key === sug.dimension);
                                const severityStyles = {
                                  high: 'border-red-500/40 bg-red-500/5 hover:bg-red-500/10',
                                  medium: 'border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10',
                                  low: 'border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10'
                                };
                                const severityLabels = { high: '高', medium: '中', low: '低' };
                                const severityColors = { high: 'text-red-400 bg-red-500/20', medium: 'text-amber-400 bg-amber-500/20', low: 'text-sky-400 bg-sky-500/20' };
                                const isActive = activeStyleHighlight && activeStyleHighlight.start === sug.start && activeStyleHighlight.end === sug.end;
                                const hasPosition = sug.start > 0 || sug.end > 0;
                                return (
                                  <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.04 }}
                                    onClick={() => hasPosition && scrollToStylePosition(sug)}
                                    className={`p-4 rounded-xl border transition-all cursor-pointer ${severityStyles[sug.severity] || severityStyles.medium} ${isActive ? 'ring-2 ring-white/50 scale-[1.01]' : ''}`}
                                  >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <div className="flex items-center gap-2 flex-1 min-w-0">
                                        {dim && (
                                          <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${dim.color} text-white`}>
                                            {dim.label}
                                          </span>
                                        )}
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${severityColors[sug.severity] || severityColors.medium}`}>
                                          {severityLabels[sug.severity]}优先级
                                        </span>
                                      </div>
                                      {hasPosition && (
                                        <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                                      )}
                                    </div>
                                    <p className="text-sm font-bold text-white mb-1">{sug.title}</p>
                                    <p className="text-xs text-slate-400 leading-relaxed">{sug.message}</p>
                                    {sug.text && (
                                      <div className="mt-2 p-2 bg-slate-950/60 rounded-lg border border-slate-800">
                                        <p className="text-[11px] text-slate-500 mb-1">关联原文：</p>
                                        <p className="text-xs text-slate-300 line-clamp-2 italic">"{sug.text}"</p>
                                      </div>
                                    )}
                                  </motion.div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {!styleResult && !styleLoading && (
                  <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
                      <Gauge className="w-8 h-8 text-slate-600" />
                    </div>
                    <h3 className="text-slate-400 font-bold mb-2">粘贴论文文本，一键诊断写作风格</h3>
                    <p className="text-sm text-slate-600 max-w-md mx-auto">
                      系统将从句子长度、词汇丰富度、被动语态、逻辑连接词、段落结构五个维度进行分析，对比 SCI 期刊标准，生成带原文定位的改进建议。
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "collab" && (
            <motion.div
              key="collab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <CollabEditor
                initialRoomId={initialRoomId}
                onRoomChange={(id) => {
                  if (id) {
                    window.location.hash = `room=${id}`;
                  } else {
                    window.location.hash = '';
                  }
                }}
              />
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

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-emerald-600 text-white rounded-xl shadow-2xl shadow-emerald-500/30 text-sm font-bold flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="mt-12 border-t border-slate-800 py-8 text-center text-slate-500 text-sm">
        <p>© 2026 PaperWise AI. 专业级学术诚信守护者。</p>
      </footer>
    </div>
  );
}

export default App;
