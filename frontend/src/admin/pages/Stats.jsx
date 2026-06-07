import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminContext.jsx';
import {
  BarChart3, RefreshCw, Activity, Clock, AlertTriangle,
  Calendar, TrendingUp
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart, ComposedChart, Bar
} from 'recharts';

const PERIOD_OPTIONS = [
  { value: 'day', label: '近24小时' },
  { value: 'week', label: '近7天' },
  { value: 'month', label: '近30天' },
];

export default function Stats() {
  const { adminAxios } = useAdmin();
  const [period, setPeriod] = useState('day');
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [keys, setKeys] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const params = { period };
      if (selectedKeyId) params.api_key_id = parseInt(selectedKeyId);
      const res = await adminAxios.get('/admin/stats/usage', { params });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchKeys = async () => {
    try {
      const res = await adminAxios.get('/admin/keys');
      setKeys(res.data.keys || []);
    } catch (_) {}
  };

  useEffect(() => { fetchKeys(); }, []);
  useEffect(() => { fetchData(); }, [period, selectedKeyId]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">调用统计</h1>
          <p className="text-sm text-slate-400 mt-1">分析 API 调用量、响应时间和错误率</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  period === opt.value
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">全部 Key</option>
            {keys.map(k => (
              <option key={k.id} value={k.id}>{k.name} ({k.key_prefix})</option>
            ))}
          </select>

          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium border border-slate-700 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="text-center py-16 text-slate-500">加载中...</div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-3xl font-black text-white">{data.total_requests.toLocaleString()}</p>
              <p className="text-sm text-slate-400 mt-1">总请求量</p>
              <p className="text-xs text-slate-500 mt-1">{PERIOD_OPTIONS.find(p => p.value === period)?.label}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg">
                  <Clock className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-3xl font-black text-white">{data.avg_response_time_ms}<span className="text-lg text-slate-400 font-medium">ms</span></p>
              <p className="text-sm text-slate-400 mt-1">平均响应时间</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-3xl font-black text-white">{data.error_rate}<span className="text-lg text-slate-400 font-medium">%</span></p>
              <p className="text-sm text-slate-400 mt-1">错误率</p>
              <p className="text-xs text-slate-500 mt-1">共 {data.error_count} 个错误</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-3xl font-black text-white">{data.trend_data.length}</p>
              <p className="text-sm text-slate-400 mt-1">数据点数</p>
              <p className="text-xs text-slate-500 mt-1">{period === 'day' ? '按小时' : '按天'}统计</p>
            </motion.div>
          </div>

          <div className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-bold text-white">请求量趋势</h3>
                  <p className="text-xs text-slate-500 mt-1">{period === 'day' ? '按小时聚合' : '按天聚合'}</p>
                </div>
                <Activity className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend_data}>
                    <defs>
                      <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="bucket" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Area type="monotone" dataKey="request_count" name="请求数" stroke="#6366f1" strokeWidth={2} fill="url(#reqGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-bold text-white">平均响应时间</h3>
                    <p className="text-xs text-slate-500 mt-1">毫秒 (ms)</p>
                  </div>
                  <Clock className="w-5 h-5 text-purple-400" />
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend_data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="bucket" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Line type="monotone" dataKey="avg_response_time" name="响应时间(ms)" stroke="#a855f7" strokeWidth={2} dot={{ r: 2, fill: '#a855f7' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-base font-bold text-white">错误率趋势</h3>
                    <p className="text-xs text-slate-500 mt-1">百分比 (%)</p>
                  </div>
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.trend_data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="bucket" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Bar dataKey="error_count" name="错误数" fill="#ef4444" opacity={0.7} radius={[2, 2, 0, 0]} />
                      <Line type="monotone" dataKey="error_rate" name="错误率(%)" stroke="#f97316" strokeWidth={2} yAxisId={0} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
