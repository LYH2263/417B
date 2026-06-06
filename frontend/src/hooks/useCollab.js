import { useState, useEffect, useRef, useCallback } from 'react';

const WS_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? 'ws://localhost:8417/ws/collab'
  : `ws://${typeof window !== 'undefined' ? window.location.host : 'localhost:8417'}/ws/collab`;

const API_BASE = (typeof window !== 'undefined' && window.location.hostname === 'localhost')
  ? 'http://localhost:8417/api'
  : `/api`;

function generateUserId() {
  const stored = localStorage.getItem('collab_user_id');
  if (stored) return stored;
  const id = 'u_' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem('collab_user_id', id);
  return id;
}

function getUserName() {
  return localStorage.getItem('collab_user_name') || '';
}

function saveUserName(name) {
  localStorage.setItem('collab_user_name', name);
}

function transformInsert(opA, opB) {
  const pos = opB.position;
  if (opA.type === 'insert') {
    if (opA.position <= pos) {
      return { ...opB, position: pos + opA.text.length };
    }
  } else if (opA.type === 'delete') {
    if (opA.position + opA.length <= pos) {
      return { ...opB, position: pos - opA.length };
    } else if (opA.position < pos) {
      return { ...opB, position: opA.position };
    }
  }
  return opB;
}

function transformDelete(opA, opB) {
  let pos = opB.position;
  let length = opB.length;
  if (opA.type === 'insert') {
    if (opA.position <= pos) {
      return { ...opB, position: pos + opA.text.length };
    } else if (opA.position < pos + length) {
      return { ...opB, length: length + opA.text.length };
    }
  } else if (opA.type === 'delete') {
    const aStart = opA.position;
    const aEnd = aStart + opA.length;
    const bStart = pos;
    const bEnd = pos + length;
    if (aEnd <= bStart) {
      return { ...opB, position: bStart - opA.length };
    } else if (bEnd <= aStart) {
      return opB;
    } else if (aStart <= bStart && aEnd >= bEnd) {
      return { ...opB, position: aStart, length: 0 };
    } else if (aStart <= bStart && aEnd < bEnd) {
      return { ...opB, position: aStart, length: bEnd - aEnd };
    } else if (bStart < aStart && bEnd > aEnd) {
      return { ...opB, length: length - opA.length };
    } else if (bStart < aStart && bEnd <= aEnd) {
      return { ...opB, length: aStart - bStart };
    }
  }
  return opB;
}

function transformOperation(opA, opB) {
  if (opB.type === 'insert') return transformInsert(opA, opB);
  if (opB.type === 'delete') return transformDelete(opA, opB);
  return opB;
}

function applyOperation(text, op) {
  if (op.type === 'insert') {
    const pos = Math.max(0, Math.min(op.position, text.length));
    return text.slice(0, pos) + op.text + text.slice(pos);
  } else if (op.type === 'delete') {
    const pos = Math.max(0, Math.min(op.position, text.length));
    const end = Math.max(pos, Math.min(pos + op.length, text.length));
    return text.slice(0, pos) + text.slice(end);
  }
  return text;
}

export function useCollab(roomId, userName) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [text, setText] = useState('');
  const [version, setVersion] = useState(0);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [results, setResults] = useState({});
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const versionRef = useRef(0);
  const textRef = useRef('');
  const pendingOpsRef = useRef([]);
  const acknowledgedRef = useRef(true);
  const userCursorRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const heartbeatRef = useRef(null);
  const userIdRef = useRef(generateUserId());

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  const send = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const handleIncomingOp = useCallback((op, opVersion) => {
    let localOp = op.data || op;
    let localPending = pendingOpsRef.current;

    for (let i = 0; i < localPending.length; i++) {
      localPending[i].op = transformOperation(localPending[i].op, localOp);
      localOp = transformOperation(localOp, localPending[i].op);
    }

    const newText = applyOperation(textRef.current, localOp);
    textRef.current = newText;
    setText(newText);

    versionRef.current = opVersion;
    setVersion(opVersion);

    if (userCursorRef.current) {
      const cursor = userCursorRef.current;
      let transformed = { ...cursor };
      transformed = transformOperation(localOp, { type: 'insert', position: cursor.position, text: '' });
      if (localOp.type === 'delete' && cursor.position >= localOp.position && cursor.position < localOp.position + localOp.length) {
        transformed.position = localOp.position;
      }
      userCursorRef.current = transformed;
    }
  }, []);

  const submitOp = useCallback((op) => {
    pendingOpsRef.current.push({ op, baseVersion: versionRef.current });
    send({
      type: 'op',
      op,
      base_version: versionRef.current
    });
    acknowledgedRef.current = false;
  }, [send]);

  const sendCursor = useCallback((cursor) => {
    userCursorRef.current = cursor;
    send({ type: 'cursor', cursor });
  }, [send]);

  const fetchHistory = useCallback(async (startVersion = 0) => {
    try {
      const res = await fetch(`${API_BASE}/collab/rooms/${roomId}/history?start_version=${startVersion}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history);
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    }
  }, [roomId]);

  const triggerDetect = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/collab/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, user_id: userIdRef.current })
      });
      return await res.json();
    } catch (e) {
      setError('检测失败: ' + e.message);
      return null;
    }
  }, [roomId]);

  const triggerRewrite = useCallback(async (level = 'medium') => {
    try {
      const res = await fetch(`${API_BASE}/collab/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, user_id: userIdRef.current, level })
      });
      return await res.json();
    } catch (e) {
      setError('改写失败: ' + e.message);
      return null;
    }
  }, [roomId]);

  const connect = useCallback(() => {
    if (!roomId) return;

    if (wsRef.current) {
      try { wsRef.current.close(); } catch (e) {}
    }

    setReconnecting(true);
    const ws = new WebSocket(`${WS_BASE}/${roomId}/${userIdRef.current}`);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setReconnecting(false);
      setConnected(true);
      setError(null);

      const name = userName || getUserName() || `用户${Math.floor(Math.random() * 1000)}`;
      saveUserName(name);
      ws.send(JSON.stringify({ type: 'init', name }));

      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }
      }, 20000);
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
          case 'welcome':
            setCurrentUser(msg.user);
            versionRef.current = msg.snapshot.version;
            setVersion(msg.snapshot.version);
            textRef.current = msg.snapshot.text;
            setText(msg.snapshot.text);
            setUsers(msg.snapshot.users);
            setResults(msg.snapshot.results || {});
            pendingOpsRef.current = [];
            acknowledgedRef.current = true;
            fetchHistory();
            break;
          case 'op':
            handleIncomingOp(msg.op, msg.version);
            break;
          case 'cursor':
            setUsers(prev => prev.map(u =>
              u.user_id === msg.user_id ? { ...u, cursor: msg.cursor } : u
            ));
            break;
          case 'user_join':
            setUsers(prev => {
              const exists = prev.some(u => u.user_id === msg.user.user_id);
              if (exists) return prev.map(u => u.user_id === msg.user.user_id ? { ...msg.user, connected: true } : u);
              return [...prev, { ...msg.user, connected: true }];
            });
            break;
          case 'user_leave':
            setUsers(prev => prev.filter(u => u.user_id !== msg.user_id));
            break;
          case 'result':
            setResults(prev => ({ ...prev, [msg.result_type]: msg.data }));
            if (msg.result_type === 'rewrite' && msg.data && msg.data.rewritten_text !== undefined) {
            }
            break;
          case 'snapshot':
            versionRef.current = msg.data.version;
            setVersion(msg.data.version);
            textRef.current = msg.data.text;
            setText(msg.data.text);
            setUsers(msg.data.users);
            setResults(msg.data.results || {});
            pendingOpsRef.current = [];
            acknowledgedRef.current = true;
            break;
          case 'history':
            setHistory(msg.history);
            break;
          case 'pong':
            break;
          default:
            break;
        }
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    };

    ws.onerror = () => {
      setError('连接错误');
    };

    ws.onclose = () => {
      setConnected(false);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);

      reconnectAttemptsRef.current += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);

      if (reconnectAttemptsRef.current <= 10) {
        setReconnecting(true);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        setReconnecting(false);
        setError('重连失败，请刷新页面重试');
      }
    };
  }, [roomId, userName, handleIncomingOp, fetchHistory]);

  useEffect(() => {
    if (roomId) {
      connect();
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (e) {}
      }
    };
  }, [connect, roomId]);

  const handleLocalInsert = useCallback((position, insertText) => {
    const op = { type: 'insert', position, text: insertText };
    const newText = applyOperation(textRef.current, op);
    textRef.current = newText;
    setText(newText);
    submitOp(op);
  }, [submitOp]);

  const handleLocalDelete = useCallback((position, length) => {
    const op = { type: 'delete', position, length };
    const newText = applyOperation(textRef.current, op);
    textRef.current = newText;
    setText(newText);
    submitOp(op);
  }, [submitOp]);

  const reconnectNow = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    connect();
  }, [connect]);

  return {
    connected,
    reconnecting,
    text,
    version,
    users,
    currentUser,
    results,
    history,
    error,
    userId: userIdRef.current,
    handleLocalInsert,
    handleLocalDelete,
    sendCursor,
    triggerDetect,
    triggerRewrite,
    fetchHistory,
    reconnectNow
  };
}

export async function createRoom() {
  const res = await fetch(`${API_BASE}/collab/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error('创建房间失败');
  return res.json();
}

export async function getRoomInfo(roomId) {
  const res = await fetch(`${API_BASE}/collab/rooms/${roomId}`);
  if (!res.ok) return null;
  return res.json();
}
