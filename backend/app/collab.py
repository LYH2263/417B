import asyncio
import json
import time
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from fastapi import WebSocket, WebSocketDisconnect


ROOM_EXPIRY_MINUTES = 30
CURSOR_COLORS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#14b8a6"
]
DEFAULT_AVATARS = ["🦊", "🐼", "🦁", "🐯", "🐸", "🦄", "🐙", "🦉", "🐢", "🐝"]


def transform_insert(op_a: dict, op_b: dict) -> dict:
    pos = op_b["position"]
    if op_a["type"] == "insert":
        if op_a["position"] <= pos:
            return {**op_b, "position": pos + len(op_a["text"])}
    elif op_a["type"] == "delete":
        if op_a["position"] + op_a["length"] <= pos:
            return {**op_b, "position": pos - op_a["length"]}
        elif op_a["position"] < pos:
            return {**op_b, "position": op_a["position"]}
    return op_b


def transform_delete(op_a: dict, op_b: dict) -> dict:
    pos = op_b["position"]
    length = op_b["length"]
    if op_a["type"] == "insert":
        if op_a["position"] <= pos:
            return {**op_b, "position": pos + len(op_a["text"])}
        elif op_a["position"] < pos + length:
            return {**op_b, "length": length + len(op_a["text"])}
    elif op_a["type"] == "delete":
        a_start = op_a["position"]
        a_end = a_start + op_a["length"]
        b_start = pos
        b_end = pos + length
        if a_end <= b_start:
            return {**op_b, "position": b_start - op_a["length"]}
        elif b_end <= a_start:
            return op_b
        elif a_start <= b_start and a_end >= b_end:
            return {**op_b, "position": a_start, "length": 0}
        elif a_start <= b_start < a_end < b_end:
            return {**op_b, "position": a_start, "length": b_end - a_end}
        elif b_start < a_start and b_end > a_end:
            return {**op_b, "length": length - op_a["length"]}
        elif b_start < a_start < b_end <= a_end:
            return {**op_b, "length": a_start - b_start}
    return op_b


def transform_operation(op_a: dict, op_b: dict) -> dict:
    if op_b["type"] == "insert":
        return transform_insert(op_a, op_b)
    elif op_b["type"] == "delete":
        return transform_delete(op_a, op_b)
    return op_b


def apply_operation(text: str, op: dict) -> str:
    if op["type"] == "insert":
        pos = max(0, min(op["position"], len(text)))
        return text[:pos] + op["text"] + text[pos:]
    elif op["type"] == "delete":
        pos = max(0, min(op["position"], len(text)))
        end = max(pos, min(pos + op["length"], len(text)))
        return text[:pos] + text[end:]
    return text


@dataclass
class User:
    user_id: str
    name: str
    avatar: str
    color: str
    cursor: Optional[Dict] = None
    connected: bool = True
    last_active: float = field(default_factory=time.time)


@dataclass
class Operation:
    op_id: str
    user_id: str
    timestamp: float
    version: int
    op_type: str
    data: dict
    text_snapshot: Optional[str] = None


class CollabRoom:
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.users: Dict[str, User] = {}
        self.text: str = ""
        self.version: int = 0
        self.history: List[Operation] = []
        self.last_activity: float = time.time()
        self.created_at: float = time.time()
        self.lock = asyncio.Lock()
        self.connections: Dict[str, WebSocket] = {}
        self.result_cache: Dict[str, Any] = {}

    def is_expired(self) -> bool:
        return (time.time() - self.last_activity) > (ROOM_EXPIRY_MINUTES * 60)

    def touch(self):
        self.last_activity = time.time()

    def assign_color(self) -> str:
        used = {u.color for u in self.users.values() if u.connected}
        for c in CURSOR_COLORS:
            if c not in used:
                return c
        return CURSOR_COLORS[len(self.users) % len(CURSOR_COLORS)]

    def assign_avatar(self) -> str:
        used = {u.avatar for u in self.users.values() if u.connected}
        for a in DEFAULT_AVATARS:
            if a not in used:
                return a
        return DEFAULT_AVATARS[len(self.users) % len(DEFAULT_AVATARS)]

    def add_user(self, user_id: str, name: Optional[str] = None) -> User:
        if user_id in self.users:
            user = self.users[user_id]
            user.connected = True
            user.last_active = time.time()
        else:
            color = self.assign_color()
            avatar = self.assign_avatar()
            user = User(
                user_id=user_id,
                name=name or f"用户{len(self.users) + 1}",
                avatar=avatar,
                color=color,
                connected=True,
                last_active=time.time()
            )
            self.users[user_id] = user
        self.touch()
        return user

    def remove_user(self, user_id: str):
        if user_id in self.users:
            self.users[user_id].connected = False
            self.users[user_id].last_active = time.time()
        self.touch()

    def get_online_users(self) -> List[Dict]:
        return [
            {
                "user_id": u.user_id,
                "name": u.name,
                "avatar": u.avatar,
                "color": u.color,
                "cursor": u.cursor
            }
            for u in self.users.values() if u.connected
        ]

    def apply_op(self, user_id: str, op: dict, base_version: int) -> dict:
        op_id = op.get("op_id", str(uuid.uuid4()))
        op_data = {k: v for k, v in op.items() if k != "op_id"}

        while self.version > base_version:
            transform_target = self.history[base_version]
            op_data = transform_operation(transform_target.data, op_data)
            base_version += 1

        self.text = apply_operation(self.text, op_data)
        self.version += 1

        operation = Operation(
            op_id=op_id,
            user_id=user_id,
            timestamp=time.time(),
            version=self.version,
            op_type=op_data.get("type", "unknown"),
            data=op_data,
            text_snapshot=self.text
        )
        self.history.append(operation)
        self.touch()

        return {
            "op_id": op_id,
            "version": self.version,
            "data": op_data,
            "user_id": user_id
        }

    def set_cursor(self, user_id: str, cursor: dict):
        if user_id in self.users:
            self.users[user_id].cursor = cursor
            self.users[user_id].last_active = time.time()
        self.touch()

    async def broadcast(self, message: dict, exclude: Optional[str] = None):
        message_str = json.dumps(message, ensure_ascii=False)
        dead = []
        for uid, ws in self.connections.items():
            if uid == exclude:
                continue
            try:
                await ws.send_text(message_str)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.connections.pop(uid, None)
            if uid in self.users:
                self.users[uid].connected = False

    def get_snapshot(self) -> dict:
        return {
            "text": self.text,
            "version": self.version,
            "users": self.get_online_users(),
            "results": self.result_cache
        }

    def get_history_range(self, start_version: int, end_version: Optional[int] = None) -> List[dict]:
        if end_version is None:
            end_version = self.version
        return [
            {
                "op_id": h.op_id,
                "user_id": h.user_id,
                "user_name": self.users.get(h.user_id, User(user_id=h.user_id, name="未知", avatar="❓", color="#888")).name,
                "timestamp": h.timestamp,
                "version": h.version,
                "op_type": h.op_type,
                "data": h.data,
                "text_snapshot": h.text_snapshot
            }
            for h in self.history
            if start_version < h.version <= end_version
        ]

    def set_result(self, result_type: str, data: Any):
        self.result_cache[result_type] = data
        self.touch()


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, CollabRoom] = {}
        self.cleanup_task: Optional[asyncio.Task] = None

    async def start(self):
        if self.cleanup_task is None:
            self.cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        while True:
            await asyncio.sleep(60)
            now = time.time()
            expired = []
            for rid, room in self.rooms.items():
                if room.is_expired():
                    expired.append(rid)
            for rid in expired:
                self.rooms.pop(rid, None)

    def create_room(self) -> str:
        room_id = str(uuid.uuid4())[:8]
        while room_id in self.rooms:
            room_id = str(uuid.uuid4())[:8]
        self.rooms[room_id] = CollabRoom(room_id)
        return room_id

    def get_room(self, room_id: str) -> Optional[CollabRoom]:
        return self.rooms.get(room_id)

    def get_or_create_room(self, room_id: Optional[str] = None) -> CollabRoom:
        if room_id and room_id in self.rooms:
            return self.rooms[room_id]
        rid = room_id or self.create_room()
        if rid not in self.rooms:
            self.rooms[rid] = CollabRoom(rid)
        return self.rooms[rid]


room_manager = RoomManager()
