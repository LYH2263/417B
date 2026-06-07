import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAdmin } from './AdminContext.jsx';
import {
  LayoutDashboard, Key, BarChart3, Gauge, LogOut,
  ShieldCheck, Loader2, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './pages/Dashboard.jsx';
import ApiKeys from './pages/ApiKeys.jsx';
import Stats from './pages/Stats.jsx';
import RateLimit from './pages/RateLimit.jsx';

const NAV_ITEMS = [
  { id: 'dashboard', label: '总览仪表盘', icon: LayoutDashboard },
  { id: 'keys', label: 'API Key 管理', icon: Key },
  { id: 'stats', label: '调用统计', icon: BarChart3 },
  { id: 'rate-limit', label: '速率限制', icon: Gauge },
];

export default function AdminApp() {
  const navigate = useNavigate();
  const { isVerified, verifying, logout } = useAdmin();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (verifying) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>正在验证身份...</span>
        </div>
      </div>
    );
  }

  if (!isVerified) {
    return <Navigate to="/admin/login" replace />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'keys': return <ApiKeys />;
      case 'stats': return <Stats />;
      case 'rate-limit': return <RateLimit />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 flex">
      <aside className="w-64 bg-slate-900/80 border-r border-slate-800 flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold text-white">Paper<span className="text-indigo-500">Wise</span></span>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Admin Console</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronRight className={`w-3 h-3 transition-transform ${isActive ? 'opacity-100' : 'opacity-0'}`} />
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-800">
          <button
            onClick={() => { logout(); navigate('/admin/login'); }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
