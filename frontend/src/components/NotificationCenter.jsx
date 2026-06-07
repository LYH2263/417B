import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Bell, X, Check, Trash2, Filter, Clock, Calendar,
  CheckCheck, ChevronDown, AlertCircle, Activity,
  Rocket, AlertTriangle, Megaphone, CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? "http://localhost:8417/api"
  : "/api";

const NOTIFICATION_ICONS = {
  system: Megaphone,
  rewrite_complete: CheckCircle,
  quota_warning: AlertTriangle,
  feature_update: Rocket,
  error_alert: AlertCircle
};

const NOTIFICATION_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'system', label: '系统公告', icon: Megaphone },
  { key: 'rewrite_complete', label: '改写完成', icon: CheckCircle },
  { key: 'quota_warning', label: '额度预警', icon: AlertTriangle },
  { key: 'feature_update', label: '功能更新', icon: Rocket },
  { key: 'error_alert', label: '异常告警', icon: AlertCircle }
];

const TIME_GROUPS = {
  today: '今天',
  yesterday: '昨天',
  earlier: '更早'
};

function formatTime(createdAt) {
  try {
    const date = new Date(createdAt);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);

    if (diffMin < 1) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateOnly.getTime() === today.getTime()) {
      return `今天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    if (dateOnly.getTime() === yesterday.getTime()) {
      return `昨天 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
    return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return createdAt;
  }
}

function getTimeGroup(createdAt) {
  try {
    const date = new Date(createdAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (dateOnly.getTime() === today.getTime()) return 'today';
    if (dateOnly.getTime() === yesterday.getTime()) return 'yesterday';
    return 'earlier';
  } catch {
    return 'earlier';
  }
}

function NotificationPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState('notifications');
  const [notifications, setNotifications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [logFilter, setLogFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logStats, setLogStats] = useState(null);
  const [page, setPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [logHasMore, setLogHasMore] = useState(true);
  const [timeRange, setTimeRange] = useState('all');
  const panelRef = useRef(null);

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (e) {
        console.log('Notification permission denied');
      }
    }
  };

  const sendBrowserNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/vite.svg'
        });
      } catch (e) {
        console.log('Failed to send notification', e);
      }
    }
  };

  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    try {
      setLoading(true);
      const params = { page: pageNum, page_size: 20 };
      if (filter !== 'all') params.type = filter;

      const response = await axios.get(`${API_BASE}/notifications`, { params });
      const newNotifications = response.data.notifications || [];

      setNotifications(prev => append ? [...prev, ...newNotifications] : newNotifications);
      setHasMore(pageNum < (response.data.total_pages || 1));
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchLogs = useCallback(async (pageNum = 1, append = false) => {
    try {
      setLogLoading(true);
      const params = { page: pageNum, page_size: 20 };
      if (logFilter !== 'all') params.operation_type = logFilter;

      if (timeRange !== 'all') {
        const now = new Date();
        if (timeRange === 'today') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          params.start_time = today.toISOString();
        } else if (timeRange === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          params.start_time = weekAgo.toISOString();
        } else if (timeRange === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          params.start_time = monthAgo.toISOString();
        }
      }

      const response = await axios.get(`${API_BASE}/operation-logs`, { params });
      const newLogs = response.data.logs || [];

      setLogs(prev => append ? [...prev, ...newLogs] : newLogs);
      setLogHasMore(pageNum < (response.data.total_pages || 1));
      setLogPage(pageNum);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogLoading(false);
    }
  }, [logFilter, timeRange]);

  useEffect(() => {
    requestNotificationPermission();
    fetchNotifications(1, false);
  }, [filter, fetchNotifications]);

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs(1, false);
      fetchLogStats();
    }
  }, [activeTab, logFilter, timeRange, fetchLogs]);

  const fetchLogStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/operation-logs/stats/summary`);
      setLogStats(response.data);
    } catch (err) {
      console.error('Failed to fetch log stats:', err);
    }
  };

  const markAsRead = async (id) => {
    try {
      await axios.post(`${API_BASE}/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const params = filter !== 'all' ? { type: filter } : {};
      await axios.post(`${API_BASE}/notifications/read/all`, null, { params });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await axios.delete(`${API_BASE}/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
      window.dispatchEvent(new CustomEvent('notifications-updated'));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  const groupByTime = (items) => {
    const groups = { today: [], yesterday: [], earlier: [] };
    items.forEach(item => {
      const group = getTimeGroup(item.created_at);
      groups[group].push(item);
    });
    return groups;
  };

  const groupedNotifications = groupByTime(notifications);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
      />
      <motion.div
        ref={panelRef}
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-slate-900 border-l border-slate-800 z-[70] flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">消息中心</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-all ${
              activeTab === 'notifications'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Bell className="w-4 h-4" />
              通知
            </div>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-all ${
              activeTab === 'logs'
                ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Activity className="w-4 h-4" />
              操作日志
            </div>
          </button>
        </div>

        {activeTab === 'notifications' && (
          <>
            <div className="p-4 border-b border-slate-800 space-y-3">
              <div className="flex flex-wrap gap-2">
                {NOTIFICATION_FILTERS.map(f => {
                  const Icon = f.icon;
                  return (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        filter === f.key
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  共 {notifications.length} 条通知
                </span>
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-bold transition-all"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  全部已读
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 text-slate-500">
                  <Bell className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">暂无通知</p>
                </div>
              ) : (
                <div className="space-y-6 p-4">
                  {Object.entries(TIME_GROUPS).map(([groupKey, groupLabel]) => (
                    groupedNotifications[groupKey]?.length > 0 && (
                      <div key={groupKey}>
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            {groupLabel}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {groupedNotifications[groupKey].map(notification => {
                            const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
                            return (
                              <motion.div
                                key={notification.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                onClick={() => handleNotificationClick(notification)}
                                className={`group relative p-4 rounded-xl border cursor-pointer transition-all ${
                                  notification.is_read
                                    ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                                    : 'bg-slate-900 border-slate-700 hover:border-indigo-500/50'
                                }`}
                              >
                                {!notification.is_read && (
                                  <div className="absolute top-3 left-3 w-2 h-2 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500/50" />
                                )}
                                <div className="flex gap-3">
                                  <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${notification.type_color || 'bg-slate-800 text-slate-400'}`}>
                                    <Icon className="w-4.5 h-4.5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <h4 className={`text-sm font-bold ${notification.is_read ? 'text-slate-400' : 'text-white'}`}>
                                        {notification.title}
                                      </h4>
                                      <span className="text-[10px] text-slate-600 flex-shrink-0">
                                        {formatTime(notification.created_at)}
                                      </span>
                                    </div>
                                    {notification.content && (
                                      <p className={`text-xs mt-1 line-clamp-2 ${notification.is_read ? 'text-slate-600' : 'text-slate-400'}`}>
                                        {notification.content}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                      {!notification.is_read && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                                          className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-emerald-400 rounded text-[10px] font-bold transition-colors"
                                        >
                                          <Check className="w-3 h-3" />
                                          标为已读
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                                        className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded text-[10px] font-bold transition-colors"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        删除
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  ))}
                  {hasMore && (
                    <button
                      onClick={() => fetchNotifications(page + 1, true)}
                      disabled={loading}
                      className="w-full py-3 text-sm text-slate-500 hover:text-indigo-400 transition-colors"
                    >
                      {loading ? '加载中...' : '加载更多'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'logs' && (
          <>
            <div className="p-4 border-b border-slate-800 space-y-3">
              {logStats && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <p className="text-xl font-black text-white">{logStats.total || 0}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">总操作</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <p className="text-xl font-black text-emerald-400">{logStats.success || 0}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">成功</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                    <p className="text-xl font-black text-indigo-400">{logStats.today || 0}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">今日</p>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs text-slate-500 font-bold">操作类型</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setLogFilter('all')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                      logFilter === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-500 hover:text-white'
                    }`}
                  >
                    全部
                  </button>
                  {['file_upload', 'detect', 'rewrite', 'summarize', 'continuation', 'style_analyze', 'self_plagiarism', 'version_create', 'version_restore', 'collab_join', 'rating'].map(type => (
                    <button
                      key={type}
                      onClick={() => setLogFilter(type)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        logFilter === type
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-500 hover:text-white'
                      }`}
                    >
                      {{
                        file_upload: '上传文件',
                        detect: '执行检测',
                        rewrite: '触发改写',
                        summarize: '智能摘要',
                        continuation: '智能续写',
                        style_analyze: '风格诊断',
                        self_plagiarism: '内部查重',
                        version_create: '创建版本',
                        version_restore: '恢复版本',
                        collab_join: '加入协作',
                        rating: '提交评分'
                      }[type]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs text-slate-500 font-bold">时间范围</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'all', label: '全部' },
                    { key: 'today', label: '今天' },
                    { key: 'week', label: '本周' },
                    { key: 'month', label: '本月' }
                  ].map(range => (
                    <button
                      key={range.key}
                      onClick={() => setTimeRange(range.key)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        timeRange === range.key
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-800 text-slate-500 hover:text-white'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {logLoading && logs.length === 0 ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-60 text-slate-500">
                  <Activity className="w-12 h-12 mb-3 opacity-30" />
                  <p className="text-sm">暂无操作记录</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log, index) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="relative pl-6 pb-4"
                    >
                      {index < logs.length - 1 && (
                        <div className="absolute left-[9px] top-5 bottom-0 w-px bg-slate-800" />
                      )}
                      <div className={`absolute left-0 top-1 w-[18px] h-[18px] rounded-full flex items-center justify-center ${log.type_color || 'bg-slate-800'}`}>
                        <div className="w-2 h-2 rounded-full bg-current" />
                      </div>
                      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 hover:border-slate-700 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">{log.type_label}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                log.status === 'success'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {log.status === 'success' ? '成功' : '失败'}
                              </span>
                            </div>
                            {log.description && (
                              <p className="text-xs text-slate-400 mt-1">{log.description}</p>
                            )}
                            {log.details && Object.keys(log.details).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {Object.entries(log.details).slice(0, 3).map(([k, v]) => (
                                  <span key={k} className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded">
                                    {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 20)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-600 flex-shrink-0">
                            {formatTime(log.created_at)}
                          </span>
                        </div>
                        {log.duration_ms > 0 && (
                          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-600">
                            <Clock className="w-3 h-3" />
                            {log.duration_ms}ms
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {logHasMore && (
                    <button
                      onClick={() => fetchLogs(logPage + 1, true)}
                      disabled={logLoading}
                      className="w-full py-3 text-sm text-slate-500 hover:text-indigo-400 transition-colors"
                    >
                      {logLoading ? '加载中...' : '加载更多'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

export default function NotificationCenter({ onNotificationUpdate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/notifications/unread/count`);
      setUnreadCount(response.data.count || 0);
      if (onNotificationUpdate) onNotificationUpdate(response.data.count || 0);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  }, [onNotificationUpdate]);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    const handleUpdate = () => fetchUnreadCount();
    window.addEventListener('notifications-updated', handleUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener('notifications-updated', handleUpdate);
    };
  }, [fetchUnreadCount]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow-lg shadow-rose-500/50">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <AnimatePresence>
        {isOpen && (
          <NotificationPanel
            onClose={() => {
              setIsOpen(false);
              fetchUnreadCount();
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
