import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminContext.jsx';
import {
  Activity, Key, Zap, Clock, AlertTriangle, TrendingUp,
  RefreshCw, Server
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from 'recharts';

export default function Dashboard() {
  const { adminAxios } = useAdmin();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const [dashboardRes, usageRes] = await Promise.all([
        adminAxios.get('/admin/stats/dashboard'),
        adminAxios.get('/admin/stats/usage', { params: { period: 'day' } })
      ]);
      setData({
        dashboard: dashboardRes.data,
        usage: usageRes.data
      });
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);

  const statCards = data ? [
    { label: '总请求量', value: data.dashboard.total_requests.toLocaleString(), icon: Activity, color: 'from-indigo-500 to-blue-500', sub: `今日 ${data.dashboard.today_requests.toLocaleString()}` },
    { label: '今日活跃 Key', value: data.dashboard.active_keys_today, icon: Key, color: 'from-emerald-500 to-teal-500', sub: `总数 ${data.dashboard.total_active_keys}` },
    { label: '当前并发数', value: data.dashboard.current_concurrency, icon: Zap, color: 'from-amber-500 to-orange-500', sub: '最近1分钟' },
    { label: '平均响应', value: `${data.dashboard.avg_response_time_ms}ms`, icon: Clock, color: 'from-purple-500 to-fuchsia-500', sub: `错误率 ${data.dashboard.error_rate}%` },
  ] : [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">总览仪表盘</h1>
          <p className="text-sm text-slate-400 mt-1">实时监控 API 系统运行状态</p>
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

      {error && (
        <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-16 text-slate-500">加载中...</div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {statCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="relative bg-slate-900 border border-slate-800 rounded-2xl p-5 overflow-hidden group"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-5 pointer-events-none`} />
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    </div>
                    <p className="text-2xl font-black text-white">{card.value}</p>
                    <p className="text-sm text-slate-400 mt-1">{card.label}</p>
                    <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-base font-bold text-white">请求量趋势（24小时）</h3>
                  <p className="text-xs text-slate-500 mt-1">按小时聚合</p>
                </div>
                <Activity className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.usage.trend_data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="bucket" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Line type="monotone" dataKey="request_count" name="请求数" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
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
                  <h3 className="text-base font-bold text-white">热门接口 Top 10</h3>
                  <p className="text-xs text-slate-500 mt-1">按调用次数排序</p>
                </div>
                <Server className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dashboard.top_endpoints.slice(0, 6)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="endpoint" type="category" stroke="#64748b" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '12px' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Bar dataKey="count" name="调用次数" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {data.dashboard.total_errors > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-300">系统检测到 {data.dashboard.total_errors} 个错误请求</p>
                  <p className="text-xs text-amber-200/70 mt-0.5">整体错误率: {data.dashboard.error_rate}% — 请前往「调用统计」查看详情</p>
                </div>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
