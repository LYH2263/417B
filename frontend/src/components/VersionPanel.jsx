import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, ShieldCheck, Wand2, ChevronDown, ChevronUp,
  RotateCcw, GitCompare, Tag as TagIcon, X, Plus,
  Loader2, TrendingUp, TrendingDown, Minus, Archive,
  Copy as CopyIcon, ChevronLeft, ChevronRight, Eye
} from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? "http://localhost:8417/api"
  : "/api";

const OPERATION_CONFIG = {
  detect: {
    label: "AI率检测",
    icon: ShieldCheck,
    color: "from-sky-500 to-blue-500",
    bgColor: "bg-sky-500/10",
    borderColor: "border-sky-500/30",
    textColor: "text-sky-400",
    dotColor: "bg-sky-500"
  },
  rewrite_low: {
    label: "轻微改写",
    icon: Wand2,
    color: "from-emerald-500 to-teal-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    textColor: "text-emerald-400",
    dotColor: "bg-emerald-500"
  },
  rewrite_medium: {
    label: "中度改写",
    icon: Wand2,
    color: "from-amber-500 to-orange-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    textColor: "text-amber-400",
    dotColor: "bg-amber-500"
  },
  rewrite_high: {
    label: "深度改写",
    icon: Wand2,
    color: "from-rose-500 to-pink-500",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    textColor: "text-rose-400",
    dotColor: "bg-rose-500"
  }
};

const DEFAULT_CONFIG = {
  label: "未知操作",
  icon: Clock,
  color: "from-slate-500 to-slate-600",
  bgColor: "bg-slate-500/10",
  borderColor: "border-slate-500/30",
  textColor: "text-slate-400",
  dotColor: "bg-slate-500"
};

function getOpConfig(opType) {
  return OPERATION_CONFIG[opType] || DEFAULT_CONFIG;
}

function formatTime(createdAt) {
  try {
    const d = new Date(createdAt);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return createdAt;
  }
}

function VersionTag({ tag, onRemove }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ backgroundColor: tag.tag_color + '20', color: tag.tag_color, border: `1px solid ${tag.tag_color}40` }}
    >
      <TagIcon className="w-2.5 h-2.5" />
      {tag.tag_name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(tag.id); }}
          className="hover:bg-white/10 rounded p-0.5 transition-colors"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

function VersionTimelineNode({
  version, isExpanded, onToggle, onRestore, onCompareSelect,
  compareSelected, onAddTag, onRemoveTag
}) {
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagColor, setTagColor] = useState("#6366f1");
  const [addingTag, setAddingTag] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const cfg = getOpConfig(version.operation_type);
  const Icon = cfg.icon;
  const isCompareA = compareSelected?.a === version.id;
  const isCompareB = compareSelected?.b === version.id;

  const handleAddTag = async () => {
    if (!tagInput.trim()) return;
    setAddingTag(true);
    try {
      const res = await axios.post(`${API_BASE}/versions/tags`, {
        version_id: version.id,
        tag_name: tagInput.trim(),
        tag_color: tagColor
      });
      onAddTag(version.id, res.data);
      setTagInput("");
      setShowTagInput(false);
    } catch (err) {
      alert("添加标签失败: " + (err.response?.data?.detail || err.message));
    } finally {
      setAddingTag(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const res = await axios.get(`${API_BASE}/versions/${version.id}/content`);
      onRestore(res.data.content);
    } catch (err) {
      alert("恢复版本失败: " + (err.response?.data?.detail || err.message));
    } finally {
      setRestoring(false);
    }
  };

  const TAG_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

  return (
    <motion.div
      layout
      className="relative pl-8 pb-6 last:pb-0"
    >
      <div className={`absolute left-0 top-1 bottom-0 w-px ${isExpanded ? cfg.borderColor : 'bg-slate-700'} transition-colors`}></div>

      <div className={`absolute left-0 top-0 w-7 h-7 -translate-x-1/2 rounded-full flex items-center justify-center border-2 border-slate-900 z-10 ${cfg.dotColor} shadow-lg`}>
        <Icon className="w-3.5 h-3.5 text-white" />
      </div>

      {version.is_full_snapshot && (
        <div className="absolute left-0 -bottom-0.5 w-4 h-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center z-10" title="完整快照">
          <Archive className="w-2 h-2 text-slate-500" />
        </div>
      )}

      <div
        className={`rounded-2xl border transition-all cursor-pointer ${
          isExpanded
            ? `${cfg.bgColor} ${cfg.borderColor}`
            : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
        } ${(isCompareA || isCompareB) ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-slate-950' : ''}`}
        onClick={onToggle}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className={`text-sm font-black ${cfg.textColor}`}>v{version.version_number}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bgColor} ${cfg.textColor} ${cfg.borderColor} border`}>
                  {cfg.label}
                </span>
                {version.tags?.map(t => (
                  <VersionTag key={t.id} tag={t} onRemove={onRemoveTag} />
                ))}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(version.created_at)}</span>
                <span>{version.content_length} 字</span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="text-right">
                <div className="text-lg font-black text-white">{version.ai_score}%</div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">AI率</div>
              </div>
              {version.ai_change !== null && version.ai_change !== undefined && (
                <div className={`flex items-center gap-0.5 text-[11px] font-bold ${
                  version.ai_change < 0 ? 'text-emerald-400' : version.ai_change > 0 ? 'text-rose-400' : 'text-slate-500'
                }`}>
                  {version.ai_change < 0 ? <TrendingDown className="w-3 h-3" /> : version.ai_change > 0 ? <TrendingUp className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                  {version.ai_change > 0 ? '+' : ''}{version.ai_change}%
                </div>
              )}
            </div>
          </div>

          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={(e) => { e.stopPropagation(); onCompareSelect(version.id, 'a'); }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                        isCompareA ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <GitCompare className="w-3 h-3" />{isCompareA ? '已选为 A' : '选为对比 A'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onCompareSelect(version.id, 'b'); }}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                        isCompareB ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      <GitCompare className="w-3 h-3" />{isCompareB ? '已选为 B' : '选为对比 B'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestore(); }}
                      disabled={restoring}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-all flex items-center gap-1 disabled:opacity-50"
                    >
                      {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      恢复此版本
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowTagInput(v => !v); }}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> 标签
                    </button>
                  </div>

                  {showTagInput && (
                    <div className="flex items-center gap-2 p-2 bg-slate-950/60 rounded-xl border border-slate-700">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="输入标签名称，如：导师审阅版"
                        className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag(); }}
                      />
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {TAG_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setTagColor(c)}
                            className={`w-4 h-4 rounded-full transition-all ${tagColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-950 scale-110' : ''}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAddTag(); }}
                        disabled={addingTag || !tagInput.trim()}
                        className="px-2 py-1 rounded bg-indigo-600 text-white text-xs font-bold disabled:opacity-50"
                      >
                        {addingTag ? '...' : '添加'}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function DiffLine({ line, side }) {
  const typeColors = {
    equal: 'bg-transparent',
    insert: side === 'right' ? 'bg-emerald-500/15' : 'bg-transparent',
    delete: side === 'left' ? 'bg-rose-500/15' : 'bg-transparent',
    replace: side === 'left' ? 'bg-rose-500/10' : 'bg-emerald-500/10',
    empty: 'bg-slate-900/30'
  };
  const typeTextColors = {
    equal: 'text-slate-400',
    insert: 'text-emerald-300',
    delete: 'text-rose-300',
    replace: side === 'left' ? 'text-rose-300' : 'text-emerald-300',
    empty: 'text-transparent'
  };
  const gutterBg = {
    equal: 'bg-slate-900/50 text-slate-600',
    insert: 'bg-emerald-500/20 text-emerald-400',
    delete: 'bg-rose-500/20 text-rose-400',
    replace: side === 'left' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400',
    empty: 'bg-slate-900/50 text-transparent'
  };

  return (
    <div className={`flex font-mono text-[11px] leading-relaxed ${typeColors[line.type]}`}>
      <div className={`w-10 flex-shrink-0 text-right pr-2 py-0.5 select-none text-[10px] font-bold ${gutterBg[line.type]}`}>
        {line.line_num || ''}
      </div>
      <pre className={`flex-1 whitespace-pre-wrap break-words py-0.5 px-2 ${typeTextColors[line.type]}`}>
        {line.content || '\n'}
      </pre>
    </div>
  );
}

function VersionDiffView({ compareSelected, onClose, onClearCompare }) {
  const [loading, setLoading] = useState(true);
  const [diffData, setDiffData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!compareSelected?.a || !compareSelected?.b) return;
    setLoading(true);
    setError("");
    axios.post(`${API_BASE}/versions/compare`, {
      version_a_id: compareSelected.a,
      version_b_id: compareSelected.b
    }).then(res => {
      setDiffData(res.data);
    }).catch(err => {
      setError(err.response?.data?.detail || err.message);
    }).finally(() => {
      setLoading(false);
    });
  }, [compareSelected?.a, compareSelected?.b]);

  if (!compareSelected?.a || !compareSelected?.b) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
        <div className="text-center">
          <GitCompare className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p>请从时间线选择两个版本进行对比</p>
          <p className="text-xs text-slate-600 mt-1">点击版本卡片的"选为对比 A"和"选为对比 B"</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3">
          <GitCompare className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-bold text-white">版本对比</span>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">A: v{diffData?.version_a?.version_number || '?'}</span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="px-2 py-0.5 rounded bg-indigo-600/20 text-indigo-400">B: v{diffData?.version_b?.version_number || '?'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {diffData?.stats && (
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="text-emerald-400">+{diffData.stats.insert} 新增</span>
              <span className="text-rose-400">-{diffData.stats.delete} 删除</span>
              <span className="text-amber-400">~{diffData.stats.replace} 修改</span>
            </div>
          )}
          <button
            onClick={onClearCompare}
            className="text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors"
          >
            清除选择
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center text-rose-400 text-sm">{error}</div>
        ) : diffData ? (
          <>
            <div className="w-1/2 border-r border-slate-800 overflow-y-auto bg-slate-950/50">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-900/50 sticky top-0">
                版本 A · v{diffData.version_a?.version_number}
              </div>
              {diffData.lines_left.map((line, i) => (
                <DiffLine key={i} line={line} side="left" />
              ))}
            </div>
            <div className="w-1/2 overflow-y-auto bg-slate-950/50">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-900/50 sticky top-0">
                版本 B · v{diffData.version_b?.version_number}
              </div>
              {diffData.lines_right.map((line, i) => (
                <DiffLine key={i} line={line} side="right" />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function VersionPanel({ onRestoreContent, refreshTrigger }) {
  const [versions, setVersions] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [compareSelected, setCompareSelected] = useState({ a: null, b: null });
  const [showDiff, setShowDiff] = useState(false);
  const [viewMode, setViewMode] = useState('timeline');

  const loadVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/versions`, { params: { page, page_size: 20 } });
      setVersions(res.data.versions);
      setTotalPages(res.data.total_pages);
      setTotal(res.data.total);
      if (res.data.versions.length > 0 && !expandedId) {
        setExpandedId(res.data.versions[0].id);
      }
    } catch (err) {
      console.error("加载版本失败:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadVersions();
  }, [page, loadVersions, refreshTrigger]);

  const handleCompareSelect = (versionId, which) => {
    setCompareSelected(prev => ({ ...prev, [which]: versionId }));
    if (which === 'b' && compareSelected.a) {
      setShowDiff(true);
    }
  };

  const handleClearCompare = () => {
    setCompareSelected({ a: null, b: null });
  };

  const handleAddTag = (versionId, tag) => {
    setVersions(prev => prev.map(v =>
      v.id === versionId ? { ...v, tags: [...(v.tags || []), tag] } : v
    ));
  };

  const handleRemoveTag = async (versionId, tagId) => {
    try {
      await axios.delete(`${API_BASE}/versions/tags/${tagId}`);
      setVersions(prev => prev.map(v =>
        v.id === versionId ? { ...v, tags: (v.tags || []).filter(t => t.id !== tagId) } : v
      ));
    } catch (err) {
      alert("删除标签失败: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleRestore = (content) => {
    if (typeof onRestoreContent === 'function') {
      onRestoreContent(content);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-bold text-white">文档版本库</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-bold">{total}</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-950/60 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
              viewMode === 'timeline' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Clock className="w-3 h-3 inline mr-1" />时间线
          </button>
          <button
            onClick={() => setShowDiff(true)}
            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
              viewMode === 'diff' || showDiff ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <GitCompare className="w-3 h-3 inline mr-1" />对比
          </button>
        </div>
      </div>

      {showDiff ? (
        <div className="flex-1 overflow-hidden">
          <VersionDiffView
            compareSelected={compareSelected}
            onClose={() => setShowDiff(false)}
            onClearCompare={handleClearCompare}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loading && versions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>暂无版本记录</p>
                <p className="text-xs text-slate-600 mt-1">执行检测或改写操作后会自动保存版本</p>
              </div>
            ) : (
              <div className="space-y-1">
                {versions.map(v => (
                  <VersionTimelineNode
                    key={v.id}
                    version={v}
                    isExpanded={expandedId === v.id}
                    onToggle={() => setExpandedId(expandedId === v.id ? null : v.id)}
                    onRestore={handleRestore}
                    onCompareSelect={handleCompareSelect}
                    compareSelected={compareSelected}
                    onAddTag={handleAddTag}
                    onRemoveTag={(tagId) => handleRemoveTag(v.id, tagId)}
                  />
                ))}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-900/50">
              <span className="text-[11px] text-slate-500">
                第 {page} / {totalPages} 页 · 共 {total} 个版本
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default VersionPanel;
