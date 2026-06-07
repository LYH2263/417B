import React, { useState, useEffect } from 'react';
import { Lightbulb, X, ChevronRight, AlertTriangle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

function SuggestionBanner({ externalSuggestions, onApply, refreshTrigger }) {
  const [suggestions, setSuggestions] = useState([]);
  const [dismissed, setDismissed] = useState({});

  const fetchSuggestions = async () => {
    try {
      const response = await axios.get('/api/ratings/suggestions');
      if (response.data && response.data.suggestions) {
        setSuggestions(response.data.suggestions);
      }
    } catch (err) {
      // silently fail
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, [refreshTrigger]);

  useEffect(() => {
    if (externalSuggestions && externalSuggestions.length > 0) {
      setSuggestions(prev => {
        const existingDims = new Set(prev.map(s => s.dimension));
        const newOnes = externalSuggestions.filter(s => !existingDims.has(s.dimension));
        return [...newOnes, ...prev];
      });
    }
  }, [externalSuggestions]);

  const activeSuggestions = suggestions.filter(s => !dismissed[s.dimension]);

  if (activeSuggestions.length === 0) {
    return null;
  }

  const handleDismiss = (dim) => {
    setDismissed(prev => ({ ...prev, [dim]: true }));
  };

  const getSeverityStyles = (severity) => {
    if (severity === 'high') {
      return {
        border: 'border-red-500/40',
        bg: 'from-red-500/10 to-orange-500/5',
        icon: AlertTriangle,
        iconColor: 'text-red-400',
        iconBg: 'bg-red-500/10'
      };
    }
    return {
      border: 'border-amber-500/40',
      bg: 'from-amber-500/10 to-yellow-500/5',
      icon: AlertCircle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10'
    };
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -10, height: 0 }}
        className="mb-6 space-y-3"
      >
        {activeSuggestions.map((suggestion, idx) => {
          const styles = getSeverityStyles(suggestion.severity);
          const Icon = styles.icon;
          return (
            <motion.div
              key={suggestion.dimension}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`relative bg-gradient-to-r ${styles.bg} border ${styles.border} rounded-2xl p-4 overflow-hidden`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl ${styles.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${styles.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-white">智能改写优化建议</h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      suggestion.severity === 'high'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {suggestion.severity === 'high' ? '高优先级' : '建议'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-2">
                    检测到您连续多次对「<span className="text-slate-200 font-semibold">{suggestion.dimension_label}</span>」评分较低。
                  </p>
                  <p className="text-sm text-slate-300 mb-3">{suggestion.description}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onApply && onApply(suggestion)}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-500/20"
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      {suggestion.action}
                    </button>
                    <button
                      onClick={() => handleDismiss(suggestion.dimension)}
                      className="flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-slate-300 text-xs font-medium transition-colors"
                    >
                      暂不需要
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => handleDismiss(suggestion.dimension)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}

export default SuggestionBanner;
