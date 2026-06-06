import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Users, Share2, Copy, Check, Wifi, WifiOff, ShieldCheck, Zap,
  RefreshCcw, ChevronRight, Sparkles, FileText, FileDown,
  History, Play, Pause, SkipBack, SkipForward, Clock, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCollab, createRoom } from '../hooks/useCollab';

function getCaretCoords(textarea) {
  const mirror = document.createElement('div');
  const style = window.getComputedStyle(textarea);
  mirror.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow: hidden;
    font-family: ${style.fontFamily};
    font-size: ${style.fontSize};
    line-height: ${style.lineHeight};
    letter-spacing: ${style.letterSpacing};
    padding: ${style.padding};
    width: ${textarea.clientWidth}px;
    height: ${textarea.clientHeight}px;
  `;
  mirror.textContent = textarea.value.slice(0, textarea.selectionStart);
  const span = document.createElement('span');
  span.textContent = textarea.value.slice(textarea.selectionStart, textarea.selectionStart) || '.';
  mirror.appendChild(span);
  document.body.appendChild(mirror);
  const rect = {
    top: span.offsetTop,
    left: span.offsetLeft,
    height: parseInt(style.lineHeight) || 20
  };
  document.body.removeChild(mirror);
  return rect;
}

function CursorOverlay({ textareaRef, users, currentUserId }) {
  const [cursors, setCursors] = useState([]);

  const updateCursors = useCallback(() => {
    if (!textareaRef.current) return;
    const ta = textareaRef.current;
    const taRect = ta.getBoundingClientRect();

    const newCursors = [];
    users.forEach(user => {
      if (user.user_id === currentUserId || !user.cursor) return;
      const pos = user.cursor.position || 0;

      const mirror = document.createElement('div');
      const style = window.getComputedStyle(ta);
      mirror.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow: hidden;
        font-family: ${style.fontFamily};
        font-size: ${style.fontSize};
        line-height: ${style.lineHeight};
        padding: ${style.padding};
        width: ${ta.clientWidth}px;
      `;
      mirror.textContent = ta.value.slice(0, pos);
      const span = document.createElement('span');
      span.textContent = '|';
      mirror.appendChild(span);
      document.body.appendChild(mirror);
      const coords = {
        top: span.offsetTop + (ta.scrollTop > 0 ? -ta.scrollTop : 0),
        left: span.offsetLeft,
        height: parseInt(style.lineHeight) || 20
      };
      document.body.removeChild(mirror);

      newCursors.push({
        userId: user.user_id,
        name: user.name,
        avatar: user.avatar,
        color: user.color,
        top: coords.top,
        left: coords.left,
        height: coords.height
      });
    });
    setCursors(newCursors);
  }, [textareaRef, users, currentUserId]);

  useEffect(() => {
    updateCursors();
    const ta = textareaRef.current;
    if (!ta) return;
    ta.addEventListener('scroll', updateCursors);
    window.addEventListener('resize', updateCursors);
    return () => {
      ta.removeEventListener('scroll', updateCursors);
      window.removeEventListener('resize', updateCursors);
    };
  }, [updateCursors, textareaRef]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {cursors.map(c => (
        <div
          key={c.userId}
          className="absolute transition-all duration-100 ease-out"
          style={{
            top: c.top,
            left: c.left,
            height: c.height
          }}
        >
          <div
            className="absolute top-0 left-0 w-0.5 h-full"
            style={{ backgroundColor: c.color }}
          />
          <div
            className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-xs font-bold text-white whitespace-nowrap shadow-lg flex items-center gap-1"
            style={{ backgroundColor: c.color }}
          >
            <span>{c.avatar}</span>
            <span>{c.name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function UserList({ users, currentUserId, currentUser }) {
  const allUsers = useMemo(() => {
    if (currentUser && !users.some(u => u.user_id === currentUser.user_id)) {
      return [currentUser, ...users];
    }
    return users.length > 0 ? users : (currentUser ? [currentUser] : []);
  }, [users, currentUser, currentUserId]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Users className="w-4 h-4 text-indigo-400" />
        在线用户 ({allUsers.length})
      </h3>
      <div className="space-y-2">
        {allUsers.map(u => (
          <div
            key={u.user_id}
            className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${
              u.user_id === currentUserId ? 'bg-indigo-500/10 border border-indigo-500/30' : 'hover:bg-slate-800/50'
            }`}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-lg shadow-lg"
              style={{ backgroundColor: u.color + '30', border: `2px solid ${u.color}` }}
            >
              {u.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white flex items-center gap-1.5">
                {u.name}
                {u.user_id === currentUserId && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">我</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[11px] text-slate-500">在线</span>
              </div>
            </div>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: u.color }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryReplay({ history, text, onReplayVersion }) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [replayIdx, setReplayIdx] = useState(-1);
  const [replayText, setReplayText] = useState('');
  const timerRef = useRef(null);

  const stopPlay = useCallback(() => {
    setPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startPlay = useCallback(() => {
    if (history.length === 0) return;
    setPlaying(true);
    setReplayIdx(0);
    setReplayText(history[0]?.text_snapshot || '');
    let idx = 0;
    timerRef.current = setInterval(() => {
      idx++;
      if (idx >= history.length) {
        stopPlay();
        setReplayIdx(-1);
        setReplayText('');
        return;
      }
      setReplayIdx(idx);
      setReplayText(history[idx]?.text_snapshot || '');
    }, 400);
  }, [history, stopPlay]);

  useEffect(() => {
    return () => stopPlay();
  }, [stopPlay]);

  const jumpTo = useCallback((idx) => {
    stopPlay();
    setReplayIdx(idx);
    setReplayText(history[idx]?.text_snapshot || '');
  }, [history, stopPlay]);

  const exitReplay = useCallback(() => {
    stopPlay();
    setReplayIdx(-1);
    setReplayText('');
    setOpen(false);
  }, [stopPlay]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all border border-slate-700"
      >
        <History className="w-3.5 h-3.5" />
        历史回放 ({history.length})
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
              <History className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">操作历史回放</h2>
              <p className="text-xs text-slate-500">共 {history.length} 条操作记录 · 版本 0 → {history.length > 0 ? history[history.length - 1].version : 0}</p>
            </div>
          </div>
          <button
            onClick={exitReplay}
            className="text-slate-400 hover:text-white text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-hidden grid grid-cols-12 gap-0">
          <div className="col-span-5 border-r border-slate-800 overflow-y-auto p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-800">
              <button
                onClick={() => replayIdx > 0 && jumpTo(replayIdx - 1)}
                disabled={replayIdx <= 0}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={playing ? stopPlay : startPlay}
                className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
              >
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={() => replayIdx < history.length - 1 && jumpTo(replayIdx + 1)}
                disabled={replayIdx >= history.length - 1}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-30"
              >
                <SkipForward className="w-4 h-4" />
              </button>
              <div className="flex-1 text-xs text-slate-500 text-right">
                {replayIdx >= 0 ? `${replayIdx + 1} / ${history.length}` : `点击播放或选择版本`}
              </div>
            </div>
            {history.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm">暂无操作记录</div>
            )}
            {history.map((h, idx) => (
              <div
                key={h.op_id || idx}
                onClick={() => jumpTo(idx)}
                className={`p-3 rounded-xl cursor-pointer transition-all border ${
                  replayIdx === idx
                    ? 'bg-indigo-500/15 border-indigo-500/40'
                    : 'bg-slate-800/30 border-transparent hover:bg-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                      v{h.version}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      h.op_type === 'insert' ? 'bg-green-500/20 text-green-400' :
                      h.op_type === 'delete' ? 'bg-red-500/20 text-red-400' :
                      'bg-slate-600 text-slate-300'
                    }`}>
                      {h.op_type === 'insert' ? '插入' : h.op_type === 'delete' ? '删除' : h.op_type}
                    </span>
                  </div>
                  <Clock className="w-3 h-3 text-slate-600" />
                </div>
                <div className="text-xs text-slate-300 truncate">
                  {h.op_type === 'insert'
                    ? `+"${(h.data?.text || '').slice(0, 40)}${(h.data?.text || '').length > 40 ? '…' : ''}" @${h.data?.position}`
                    : h.op_type === 'delete'
                    ? `删除 ${h.data?.length || 0} 字符 @${h.data?.position}`
                    : '操作'}
                </div>
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-500">
                  <span>{h.user_name}</span>
                  <span>·</span>
                  <span>{new Date(h.timestamp * 1000).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="col-span-7 p-5 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-bold text-slate-400">
                {replayIdx >= 0 ? `版本 ${history[replayIdx]?.version || 0} 预览` : '当前文档内容'}
              </span>
            </div>
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-5 overflow-y-auto text-sm leading-relaxed text-slate-300 font-mono whitespace-pre-wrap">
              {replayIdx >= 0 ? (replayText || '(空)') : (text || '(空)')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CollabEditor({ initialRoomId, onRoomChange }) {
  const [roomId, setRoomId] = useState(initialRoomId || '');
  const [joinId, setJoinId] = useState('');
  const [userName, setUserName] = useState(() => localStorage.getItem('collab_user_name') || '');
  const [copied, setCopied] = useState(false);
  const [rewriteLevel, setRewriteLevel] = useState('medium');
  const [detectLoading, setDetectLoading] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const textareaRef = useRef(null);
  const lastTextRef = useRef('');

  const collab = useCollab(roomId, userName);
  const {
    connected, reconnecting, text, version, users, currentUser, results,
    history, error, handleLocalInsert, handleLocalDelete, sendCursor,
    triggerDetect, triggerRewrite, reconnectNow
  } = collab;

  useEffect(() => {
    if (onRoomChange) onRoomChange(roomId);
  }, [roomId, onRoomChange]);

  const handleCreateRoom = async () => {
    try {
      const r = await createRoom();
      setRoomId(r.room_id);
    } catch (e) {
      alert('创建房间失败: ' + e.message);
    }
  };

  const handleJoinRoom = () => {
    const id = joinId.trim();
    if (id) setRoomId(id);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#room=${roomId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTextChange = (e) => {
    const newText = e.target.value;
    const oldText = lastTextRef.current;
    const ta = e.target;
    const selStart = ta.selectionStart;

    if (newText === oldText) return;

    let i = 0;
    while (i < Math.min(oldText.length, newText.length) && oldText[i] === newText[i]) i++;

    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (oldEnd > i && newEnd > i && oldText[oldEnd - 1] === newText[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }

    const delLen = oldEnd - i;
    const insText = newText.slice(i, newEnd);

    if (delLen > 0) {
      handleLocalDelete(i, delLen);
    }
    if (insText.length > 0) {
      handleLocalInsert(i, insText);
    }

    lastTextRef.current = newText;
  };

  const handleSelectionChange = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    sendCursor({ position: ta.selectionStart, selectionEnd: ta.selectionEnd });
  };

  useEffect(() => {
    if (textareaRef.current && text !== lastTextRef.current) {
      const ta = textareaRef.current;
      const selStart = ta.selectionStart;
      const selEnd = ta.selectionEnd;
      lastTextRef.current = text;
      ta.value = text;
      try {
        ta.setSelectionRange(selStart, selEnd);
      } catch (e) {}
    }
  }, [text]);

  useEffect(() => {
    lastTextRef.current = text;
  }, []);

  const doDetect = async () => {
    setDetectLoading(true);
    await triggerDetect();
    setDetectLoading(false);
  };

  const doRewrite = async () => {
    setRewriteLoading(true);
    await triggerRewrite(rewriteLevel);
    setRewriteLoading(false);
  };

  if (!roomId) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <div className="w-20 h-20 mx-auto mb-5 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30">
              <Users className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-black text-white mb-3">实时协作编辑</h2>
            <p className="text-slate-400">创建协作房间，邀请他人共同编辑论文，实时同步所有修改与检测结果</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                创建新房间
              </h3>
              <p className="text-xs text-slate-500 mb-5">生成分享链接，邀请协作者加入</p>
              <button
                onClick={handleCreateRoom}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-500/20 transition-all"
              >
                创建协作房间
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Share2 className="w-5 h-5 text-cyan-400" />
                加入房间
              </h3>
              <p className="text-xs text-slate-500 mb-5">输入房间 ID 加入现有协作空间</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinId}
                  onChange={e => setJoinId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                  placeholder="房间 ID"
                  className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!joinId.trim()}
                  className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all"
                >
                  加入
                </button>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">
              您的昵称（可选）
            </label>
            <input
              type="text"
              value={userName}
              onChange={e => { setUserName(e.target.value); localStorage.setItem('collab_user_name', e.target.value); }}
              placeholder="输入您的昵称，协作者将看到此名称"
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            connected ? 'bg-green-500/20' : reconnecting ? 'bg-amber-500/20' : 'bg-red-500/20'
          }`}>
            {connected ? <Wifi className="w-5 h-5 text-green-400" /> :
             reconnecting ? <RefreshCcw className="w-5 h-5 text-amber-400 animate-spin" /> :
             <WifiOff className="w-5 h-5 text-red-400" />}
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              房间: <span className="font-mono text-indigo-400">{roomId}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">v{version}</span>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-2">
              {connected ? '已连接' : reconnecting ? '正在重连...' : '已断开'}
              {!connected && !reconnecting && (
                <button
                  onClick={reconnectNow}
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  立即重连
                </button>
              )}
              {error && <span className="text-red-400">· {error}</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HistoryReplay history={history} text={text} />
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
            {copied ? '已复制' : '分享链接'}
          </button>
          <button
            onClick={() => { setRoomId(''); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-slate-700"
          >
            退出房间
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-9 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 pointer-events-none"></div>

            <div className="relative mb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-medium border border-slate-700">
                    协作文本模式
                  </span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-3">
                  <span>当前字数: {text.length}</span>
                  <span>版本: v{version}</span>
                </div>
              </div>

              <div className="relative">
                <textarea
                  ref={textareaRef}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl p-6 text-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none min-h-[360px] transition-all text-sm leading-relaxed font-mono"
                  placeholder="多位协作者可同时编辑此区域，所有修改实时同步..."
                  defaultValue={text}
                  onChange={handleTextChange}
                  onSelect={handleSelectionChange}
                  onKeyUp={handleSelectionChange}
                  onClick={handleSelectionChange}
                  onInput={handleSelectionChange}
                  spellCheck={false}
                />
                <CursorOverlay textareaRef={textareaRef} users={users} currentUserId={collab.userId} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  {['low', 'medium', 'high'].map(l => (
                    <button
                      key={l}
                      onClick={() => setRewriteLevel(l)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        rewriteLevel === l
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {l === 'low' ? '轻微' : l === 'medium' ? '中度' : '深度'}改写
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={doDetect}
                  disabled={detectLoading || !text.trim() || !connected}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all border border-slate-700 text-sm"
                >
                  {detectLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  协作检测 AI 率
                </button>
                <button
                  onClick={doRewrite}
                  disabled={rewriteLoading || !text.trim() || !connected}
                  className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-xl shadow-indigo-500/20 text-sm"
                >
                  {rewriteLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  协作一键改写
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {(results.detection || results.rewrite) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {results.detection && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <ShieldCheck className="w-5 h-5 text-green-400" />
                          协作检测结果
                        </h3>
                        <p className="text-xs text-slate-500">房间内全员可见</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">当前 AI 率</p>
                        <p className={`text-3xl font-black ${results.detection.overall_ai_score > 50 ? 'text-red-500' : 'text-green-500'}`}>
                          {results.detection.overall_ai_score}%
                        </p>
                      </div>
                    </div>

                    {results.detection.details && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {results.detection.details.slice(0, 8).map((chunk, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-slate-600 uppercase">段落 {idx + 1}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                chunk.ai_score > 0.5 ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                              }`}>
                                {Math.round(chunk.ai_score * 100)}%
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2">{chunk.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {results.rewrite && (
                  <div className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl shadow-indigo-500/5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-indigo-400 flex items-center gap-2">
                        <Sparkles className="w-5 h-5" />
                        协作改写结果
                      </h3>
                      <button
                        onClick={() => {
                          const blob = new Blob([results.rewrite.rewritten_text], { type: 'text/plain' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = 'collab_rewritten.txt';
                          a.click();
                        }}
                        className="text-xs flex items-center gap-1 text-slate-400 hover:text-white transition-colors"
                      >
                        <FileDown className="w-3.5 h-3.5" /> 导出 TXT
                      </button>
                    </div>

                    <div className="flex items-center gap-6 mb-5 pb-4 border-b border-slate-800">
                      <div className="text-center">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">原文 AI 率</p>
                        <p className={`text-2xl font-black ${results.detection?.overall_ai_score > 50 ? 'text-red-500' : 'text-amber-500'}`}>
                          {results.detection?.overall_ai_score ?? '?'}%
                        </p>
                      </div>
                      <ChevronRight className="text-slate-700 w-6 h-6" />
                      <div className="text-center">
                        <p className="text-xs text-indigo-400 uppercase font-bold mb-1">改写后 AI 率</p>
                        <p className="text-2xl font-black text-indigo-400">
                          {results.rewrite.detection_after?.overall_ai_score ?? '?'}%
                        </p>
                      </div>
                      <div className="text-center ml-auto">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">迭代次数</p>
                        <p className="text-2xl font-black text-white">{results.rewrite.iterations}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> 原文
                        </h4>
                        <div className="text-sm leading-relaxed text-slate-400 h-[260px] overflow-y-auto pr-2">
                          {results.rewrite.original_text}
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-indigo-500/20 rounded-2xl p-4">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase mb-3 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" /> 改写文
                        </h4>
                        <div className="text-sm leading-relaxed text-white h-[260px] overflow-y-auto pr-2 font-medium">
                          {results.rewrite.rewritten_text}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <UserList users={users} currentUserId={collab.userId} currentUser={currentUser} />

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Share2 className="w-4 h-4 text-cyan-400" />
              房间信息
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">房间 ID</span>
                <span className="font-mono text-white text-xs bg-slate-800 px-2 py-1 rounded">{roomId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">在线人数</span>
                <span className="text-white font-bold">{users.length + (currentUser && !users.some(u => u.user_id === currentUser.user_id) ? 1 : 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">文档版本</span>
                <span className="text-white font-mono">v{version}</span>
              </div>
              <button
                onClick={handleCopyLink}
                className="w-full mt-2 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex items-center justify-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '链接已复制' : '复制分享链接'}
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-indigo-300 mb-2">协作提示</h3>
            <ul className="text-[11px] text-slate-400 space-y-1.5 list-disc list-inside">
              <li>所有编辑操作实时同步到房间内所有人</li>
              <li>多人同时编辑不会丢失内容（基于 OT 算法）</li>
              <li>任何用户触发的检测/改写结果全员可见</li>
              <li>房间 30 分钟无活动将自动清理</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
