import React, { useState } from 'react';
import { Star, MessageSquare, Send, Check, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const DIMENSIONS = [
  { key: 'semantic_fidelity', label: '语义保真度', desc: '改写内容与原文核心含义的一致性' },
  { key: 'academic_norm', label: '学术规范性', desc: '学术表达的严谨性与专业度' },
  { key: 'fluency', label: '流畅度', desc: '语句衔接自然度与可读性' },
  { key: 'terminology_accuracy', label: '术语准确性', desc: '专业术语的保留与准确度' },
  { key: 'ai_reduction', label: 'AI率降低效果', desc: 'AI检测率的下降程度' }
];

function RatingPanel({ rewriteResult, rewriteLevel, originalText, onSuggestions }) {
  const [ratings, setRatings] = useState({
    semantic_fidelity: 0,
    academic_norm: 0,
    fluency: 0,
    terminology_accuracy: 0,
    ai_reduction: 0
  });
  const [hoveredStars, setHoveredStars] = useState({});
  const [comment, setComment] = useState('');
  const [showComment, setShowComment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const allRated = Object.values(ratings).every(v => v > 0);
  const avgRating = allRated ? (Object.values(ratings).reduce((a, b) => a + b, 0) / 5).toFixed(1) : '0.0';

  const handleStarClick = (dimKey, value) => {
    if (submitted) return;
    setRatings(prev => ({ ...prev, [dimKey]: value }));
  };

  const handleStarHover = (dimKey, value) => {
    if (submitted) return;
    setHoveredStars(prev => ({ ...prev, [dimKey]: value }));
  };

  const handleStarLeave = (dimKey) => {
    setHoveredStars(prev => {
      const next = { ...prev };
      delete next[dimKey];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!allRated) {
      setError('请为所有维度评分后再提交');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await axios.post('/api/ratings', {
        rewrite_level: rewriteLevel,
        semantic_fidelity: ratings.semantic_fidelity,
        academic_norm: ratings.academic_norm,
        fluency: ratings.fluency,
        terminology_accuracy: ratings.terminology_accuracy,
        ai_reduction: ratings.ai_reduction,
        comment: comment,
        original_length: originalText?.length || 0,
        rewritten_length: rewriteResult?.rewritten_text?.length || 0,
        ai_score_before: rewriteResult?.detection_after?.overall_ai_score ? Math.max(0, rewriteResult.detection_after.overall_ai_score + 20) : 0,
        ai_score_after: rewriteResult?.detection_after?.overall_ai_score || 0
      });
      setSubmitted(true);
      if (response.data.suggestions && response.data.suggestions.length > 0 && onSuggestions) {
        onSuggestions(response.data.suggestions);
      }
    } catch (err) {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const StarRow = ({ dimKey, label, desc }) => {
    const current = hoveredStars[dimKey] ?? ratings[dimKey];
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex-1 min-w-0 mr-4">
          <div className="text-sm font-semibold text-slate-200">{label}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => handleStarClick(dimKey, n)}
              onMouseEnter={() => handleStarHover(dimKey, n)}
              onMouseLeave={() => handleStarLeave(dimKey)}
              disabled={submitted}
              className={`p-0.5 transition-transform ${submitted ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
            >
              <Star
                className={`w-5 h-5 transition-colors ${
                  n <= current
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-slate-600'
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-indigo-500/20 rounded-3xl p-6 shadow-2xl shadow-indigo-500/5"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Star className="w-5 h-5 text-white fill-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">改写质量评分</h3>
            <p className="text-xs text-slate-500">您的反馈将帮助我们持续优化改写质量</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-black text-amber-400">{avgRating}</div>
          <div className="text-[10px] text-slate-500 uppercase font-bold">综合评分</div>
        </div>
      </div>

      <AnimatePresence>
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="py-12 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-white mb-1">感谢您的评分！</div>
            <div className="text-sm text-slate-400">您的反馈已成功提交</div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-1"
          >
            {DIMENSIONS.map(dim => (
              <StarRow
                key={dim.key}
                dimKey={dim.key}
                label={dim.label}
                desc={dim.desc}
              />
            ))}

            <div className="pt-4 mt-2 border-t border-slate-800">
              {!showComment ? (
                <button
                  onClick={() => setShowComment(true)}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-indigo-400 transition-colors"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>追加评论（可选）</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="请分享您的宝贵建议，帮助我们改进改写质量..."
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-sm text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[80px] transition-all resize-y"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            <div className="flex items-center justify-between mt-4 pt-3">
              <div className="text-xs text-slate-500">
                {allRated ? '准备就绪，点击提交' : '请完成所有维度的评分'}
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || !allRated}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-amber-500/20"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    提交中...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    提交评分
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default RatingPanel;
