import React, { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement
} from 'chart.js';
import { Radar, Line, Bar } from 'react-chartjs-2';
import { BarChart3, TrendingUp, PieChart, Loader2, Activity } from 'lucide-react';
import axios from 'axios';
import { motion } from 'framer-motion';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement
);

const DIMENSION_KEYS = [
  'semantic_fidelity',
  'academic_norm',
  'fluency',
  'terminology_accuracy',
  'ai_reduction'
];

const DIMENSION_LABELS_MAP = {
  semantic_fidelity: '语义保真度',
  academic_norm: '学术规范性',
  fluency: '流畅度',
  terminology_accuracy: '术语准确性',
  ai_reduction: 'AI率降低'
};

const chartTextColor = 'rgb(148 163 184)';
const gridColor = 'rgba(148, 163 184, 0.1)';

function RatingStatistics({ refreshTrigger }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/ratings/statistics');
      setStats(response.data);
    } catch (err) {
      setError('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>正在加载统计数据...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center text-red-400">
        {error}
      </div>
    );
  }

  if (!stats || stats.total_count === 0) {
    return (
      <div className="bg-slate-900 border border-dashed border-slate-800 rounded-3xl p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
          <Activity className="w-8 h-8 text-slate-600" />
        </div>
        <h3 className="text-slate-400 font-bold mb-2">暂无评分数据</h3>
        <p className="text-sm text-slate-600 max-w-md mx-auto">
          完成改写并提交评分后，这里将展示您的改写质量统计概览，帮助您追踪改写效果的变化趋势。
        </p>
      </div>
    );
  }

  const radarData = {
    labels: DIMENSION_KEYS.map(k => DIMENSION_LABELS_MAP[k]),
    datasets: [{
      label: '平均分',
      data: DIMENSION_KEYS.map(k => stats.dimension_averages[k] || 0),
      backgroundColor: 'rgba(99, 102, 241, 0.2)',
      borderColor: 'rgba(99, 102, 241, 1)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(99, 102, 241, 1)',
      pointBorderColor: '#fff',
      pointHoverBackgroundColor: '#fff',
      pointHoverBorderColor: 'rgba(99, 102, 241, 1)'
    }]
  };

  const radarOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#fff',
        bodyColor: chartTextColor,
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      r: {
        beginAtZero: true,
        max: 5,
        ticks: {
          stepSize: 1,
          color: chartTextColor,
          backdropColor: 'transparent',
          font: { size: 10 }
        },
        grid: { color: gridColor },
        angleLines: { color: gridColor },
        pointLabels: {
          color: chartTextColor,
          font: { size: 11, weight: '600' }
        }
      }
    }
  };

  const trendLabels = stats.trend_data.map((_, i) => `第${i + 1}次`);
  const trendData = {
    labels: trendLabels,
    datasets: [{
      label: '综合满意度',
      data: stats.trend_data.map(t => t.overall),
      borderColor: 'rgba(99, 102, 241, 1)',
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointBackgroundColor: 'rgba(99, 102, 241, 1)',
      pointBorderColor: '#fff',
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  };

  const trendOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#fff',
        bodyColor: chartTextColor,
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        grid: { color: gridColor, display: false },
        ticks: { color: chartTextColor, font: { size: 10 } }
      },
      y: {
        beginAtZero: true,
        max: 5,
        grid: { color: gridColor },
        ticks: { color: chartTextColor, stepSize: 1, font: { size: 10 } }
      }
    }
  };

  const distLabels = ['1星', '2星', '3星', '4星', '5星'];
  const distData = {
    labels: distLabels,
    datasets: [{
      label: '评分次数',
      data: ['1', '2', '3', '4', '5'].map(k => stats.score_distribution[k] || 0),
      backgroundColor: [
        'rgba(239, 68, 68, 0.7)',
        'rgba(245, 158, 11, 0.7)',
        'rgba(234, 179, 8, 0.7)',
        'rgba(34, 197, 94, 0.7)',
        'rgba(99, 102, 241, 0.7)'
      ],
      borderColor: [
        'rgba(239, 68, 68, 1)',
        'rgba(245, 158, 11, 1)',
        'rgba(234, 179, 8, 1)',
        'rgba(34, 197, 94, 1)',
        'rgba(99, 102, 241, 1)'
      ],
      borderWidth: 1,
      borderRadius: 8
    }]
  };

  const distOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleColor: '#fff',
        bodyColor: chartTextColor,
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8
      }
    },
    scales: {
      x: {
        grid: { color: gridColor, display: false },
        ticks: { color: chartTextColor, font: { size: 11 } }
      },
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: chartTextColor, stepSize: 1, font: { size: 10 } }
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 pointer-events-none"></div>

      <div className="relative">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">改写质量统计</h3>
              <p className="text-xs text-slate-500">基于 {stats.total_count} 次改写评分数据</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center px-4 py-2 rounded-xl bg-slate-800/50 border border-slate-700">
              <div className="text-2xl font-black text-indigo-400">{stats.overall_average}</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">总平均分</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4 text-indigo-400" />
              <h4 className="text-sm font-bold text-slate-300">各维度平均分</h4>
            </div>
            <div className="h-[220px] flex items-center justify-center">
              <Radar data={radarData} options={radarOptions} />
            </div>
          </div>

          <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h4 className="text-sm font-bold text-slate-300">满意度趋势</h4>
            </div>
            <div className="h-[220px]">
              <Line data={trendData} options={trendOptions} />
            </div>
          </div>

          <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <h4 className="text-sm font-bold text-slate-300">评分分布</h4>
            </div>
            <div className="h-[220px]">
              <Bar data={distData} options={distOptions} />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default RatingStatistics;
