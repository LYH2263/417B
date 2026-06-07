import React, { useState, useEffect } from 'react';
import { useAdmin } from '../AdminContext.jsx';
import {
  Key, Plus, Copy, Trash2, RefreshCw, Check, Eye, EyeOff,
  Calendar, Clock, X, AlertTriangle, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

function getStatusBadge(key) {
  if (key.effective_status === 'revoked') return { label: '已吊销', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
  if (key.effective_status === 'expired') return { label: '已过期', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
  return { label: '活跃', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
}

export default function ApiKeys() {
  const { adminAxios } = useAdmin();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newExpiresDays, setNewExpiresDays] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyData, setNewKeyData] = useState(null);
  const [revealedIds, setRevealedIds] = useState(new Set());
  const [toast, setToast] = useState("");
  const [revokeConfirm, setRevokeConfirm] = useState(null);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await adminAxios.get('/admin/keys');
      setKeys(res.data.keys || []);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKeys(); }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      setCreating(true);
      const payload = {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      };
      if (newExpiresDays && parseInt(newExpiresDays) > 0) {
        payload.expires_in_days = parseInt(newExpiresDays);
      }
      const res = await adminAxios.post('/admin/keys', payload);
      setNewKeyData(res.data);
      setNewName(""); setNewDesc(""); setNewExpiresDays("");
      setShowCreate(false);
      fetchKeys();
    } catch (err) {
      showToast("创建失败: " + (err.response?.data?.detail || err.message));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId) => {
    try {
      await adminAxios.post(`/admin/keys/${keyId}/revoke`);
      showToast("已吊销该 API Key");
      setRevokeConfirm(null);
      fetchKeys();
    } catch (err) {
      showToast("吊销失败: " + (err.response?.data?.detail || err.message));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板");
  };

  const toggleReveal = (id) => {
    setRevealedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">API Key 管理</h1>
          <p className="text-sm text-slate-400 mt-1">创建、管理和吊销 API 访问密钥</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchKeys}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium border border-slate-700 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
          <button
            onClick={() => { setShowCreate(true); setNewKeyData(null); }}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-xl shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            创建新 Key
          </button>
        </div>
      </div>

      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-6 right-6 z-50 bg-slate-800 border border-slate-700 text-white text-sm px-5 py-3 rounded-xl shadow-2xl"
        >
          {toast}
        </motion.div>
      )}

      {error && (
        <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {newKeyData && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-emerald-300 mb-1">Key 创建成功！请立即保存</h3>
              <p className="text-xs text-emerald-200/60 mb-3">此密钥只显示一次，关闭后将无法再查看完整值</p>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
                <code className="flex-1 text-sm text-emerald-300 font-mono break-all">{newKeyData.key}</code>
                <button
                  onClick={() => copyToClipboard(newKeyData.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all"
                >
                  <Copy className="w-3 h-3" />
                  复制
                </button>
                <button
                  onClick={() => setNewKeyData(null)}
                  className="p-1.5 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 text-xs text-slate-400 space-y-1">
                <p>名称: <span className="text-slate-200">{newKeyData.name}</span></p>
                {newKeyData.description && <p>备注: <span className="text-slate-200">{newKeyData.description}</span></p>}
                <p>过期时间: <span className="text-slate-200">{formatDate(newKeyData.expires_at)}</span></p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-white">创建 API Key</h3>
                <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">名称 *</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="例如：生产环境、测试服务、张三的应用"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">备注描述</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="可选，用于标识这个 Key 的用途"
                    rows={2}
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    过期天数
                  </label>
                  <input
                    type="number"
                    value={newExpiresDays}
                    onChange={(e) => setNewExpiresDays(e.target.value)}
                    placeholder="留空=永不过期"
                    min="1"
                    max="3650"
                    className="w-full bg-slate-950/80 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-500">留空则永不过期。最大 3650 天（10年）</p>
                </div>
                <div className="md:col-span-2 flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={creating || !newName.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
                  >
                    {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                    生成 Key
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium border border-slate-700 transition-all"
                  >
                    取消
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && keys.length === 0 ? (
        <div className="text-center py-16 text-slate-500">加载中...</div>
      ) : keys.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
          <Key className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 mb-2">还没有 API Key</p>
          <p className="text-sm text-slate-500 mb-5">点击右上角按钮创建你的第一个密钥</p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all"
          >
            <Plus className="w-4 h-4" />
            创建 Key
          </button>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4">名称</th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4">Key 前缀</th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4">状态</th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4">请求量</th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4">创建时间</th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4">过期时间</th>
                  <th className="text-left text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4">最后使用</th>
                  <th className="text-right text-xs font-bold text-slate-400 uppercase tracking-wider px-6 py-4">操作</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => {
                  const badge = getStatusBadge(k);
                  return (
                    <tr key={k.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-white">{k.name}</p>
                          {k.description && <p className="text-xs text-slate-500 mt-0.5">{k.description}</p>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs text-slate-300 font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800">
                            {k.key_prefix}****
                          </code>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${badge.color}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-300 font-mono">{k.total_requests?.toLocaleString() || 0}</td>
                      <td className="px-6 py-4 text-sm text-slate-400">{formatDate(k.created_at)}</td>
                      <td className="px-6 py-4 text-sm text-slate-400">{formatDate(k.expires_at)}</td>
                      <td className="px-6 py-4 text-sm text-slate-400">{formatDate(k.last_used_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleReveal(k.id)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
                            title="查看详情"
                          >
                            {revealedIds.has(k.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          {k.effective_status === 'active' && (
                            <button
                              onClick={() => setRevokeConfirm(k)}
                              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                              title="吊销"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {revokeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setRevokeConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-2">确认吊销此 Key？</h3>
                  <p className="text-sm text-slate-400 mb-1">
                    <span className="text-slate-200 font-medium">{revokeConfirm.name}</span>
                  </p>
                  <p className="text-xs text-slate-500 mb-5">
                    吊销后该 Key 将无法再访问 API，且此操作无法撤销。
                  </p>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setRevokeConfirm(null)}
                      className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-medium border border-slate-700 transition-all"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleRevoke(revokeConfirm.id)}
                      className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-500/20"
                    >
                      确认吊销
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
