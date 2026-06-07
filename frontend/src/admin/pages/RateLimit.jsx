import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminContext.jsx';
import {
  Gauge, RefreshCw, Save, Zap, AlertCircle, Check, Clock,
  Info
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function RateLimit() {
  const { adminAxios } = useAdmin();
  const [keys, setKeys] = useState([]);
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(""), 2500);
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await adminAxios.get('/admin/keys');
      const keyList = res.data.keys || [];
      setKeys(keyList);
      const rateMap = {};
      keyList.forEach(k => {
        rateMap[k.id] = k.requests_per_minute || 60;
      });
      setRates(rateMap);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleRateChange = (keyId, value) => {
    const num = parseInt(value) || 0;
    setRates(prev => ({ ...prev, [keyId]: Math.max(1, Math.min(10000, num)) }));
  };

  const handleSave = async (keyId) => {
    try {
      setSaving(keyId);
      await adminAxios.put('/admin/rate-limit', {
        api_key_id: keyId,
        requests_per_minute: rates[keyId] || 60
      });
      showToast("已更新速率限制配置");
    } catch (err) {
      showToast("保存失败: " + (err.response?.data?.detail || err.message), true);
    } finally {
      setSaving(null);
    }
  };

  const isActive = (k) => k.effective_status === 'active';

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">速率限制配置</h1>
          <p className="text-sm text-slate-400 mt-1">为每个 API Key 设置每分钟最大请求数（令牌桶算法）</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium border border-slate-700 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`fixed top-6 right-6 z-50 text-sm px-5 py-3 rounded-xl shadow-2xl border ${
            toast.isError
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}
        >
          {toast.msg}
        </motion.div>
      )}

      {error && (
        <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6"
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white mb-1">令牌桶算法说明</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              每个 Key 对应一个令牌桶，桶容量等于设置的每分钟请求数（RPM）。每秒按 RPM/60 速率向桶中补充令牌。
              每个请求消耗 1 个令牌，令牌不足时返回 429 Rate Limit Exceeded。
              响应头中会包含 <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs text-indigo-300">X-RateLimit-Limit</code> 和
              <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs text-indigo-300 mx-1">X-RateLimit-Remaining</code>。
            </p>
          </div>
        </div>
      </motion.div>

      {loading && keys.length === 0 ? (
        <div className="text-center py-16 text-slate-500">加载中...</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
          <Gauge className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-1">还没有 API Key</p>
          <p className="text-sm text-slate-500">请先在「API Key 管理」中创建密钥</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k, i) => {
            const rpm = rates[k.id] || 60;
            const active = isActive(k);
            return (
              <motion.div
                key={k.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`bg-slate-900 border rounded-2xl p-5 transition-all ${
                  active ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/50 opacity-60'
                }`}
              >
                <div className="flex flex-wrap items-center gap-5">
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white">{k.name}</h4>
                      {!active && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700">
                          {k.effective_status === 'revoked' ? '已吊销' : '已过期'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                      <code className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 font-mono text-slate-400">
                        {k.key_prefix}****
                      </code>
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        累计 {k.total_requests?.toLocaleString() || 0} 请求
                      </span>
                    </div>
                    {k.description && (
                      <p className="text-xs text-slate-500 mt-1">{k.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
                      <Gauge className="w-4 h-4 text-indigo-400" />
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={rpm}
                        onChange={(e) => handleRateChange(k.id, e.target.value)}
                        disabled={!active || saving === k.id}
                        className="w-24 bg-transparent text-right text-sm font-mono font-bold text-white outline-none disabled:opacity-50"
                      />
                      <span className="text-xs text-slate-500 pr-1">请求/分钟</span>
                    </div>

                    <button
                      onClick={() => handleSave(k.id)}
                      disabled={!active || saving === k.id || rpm < 1 || rpm > 10000}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
                    >
                      {saving === k.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      保存
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800/50">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      令牌桶状态
                    </span>
                    <span className="font-mono font-bold text-slate-400">{rpm} RPM = {Math.round(rpm / 60 * 100) / 100} 令牌/秒</span>
                  </div>
                  <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, rpm / 100)}%` }}
                      transition={{ duration: 0.6, delay: 0.1 + i * 0.02 }}
                      className={`h-full rounded-full ${
                        rpm <= 30 ? 'bg-emerald-500' : rpm <= 200 ? 'bg-indigo-500' : rpm <= 1000 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>低 (30)</span>
                    <span>标准 (200)</span>
                    <span>高 (1000)</span>
                    <span>极高 (10000)</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
