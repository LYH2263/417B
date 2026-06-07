import sqlite3
import os
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ratings.db")

NOTIFICATION_TYPES = {
    "system": "系统公告",
    "rewrite_complete": "改写完成",
    "quota_warning": "额度预警",
    "feature_update": "功能更新",
    "error_alert": "异常告警"
}

NOTIFICATION_TYPE_ICONS = {
    "system": "📢",
    "rewrite_complete": "✅",
    "quota_warning": "⚠️",
    "feature_update": "🚀",
    "error_alert": "🔴"
}

NOTIFICATION_TYPE_COLORS = {
    "system": "bg-sky-500/20 text-sky-400 border-sky-500/30",
    "rewrite_complete": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    "quota_warning": "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "feature_update": "bg-violet-500/20 text-violet-400 border-violet-500/30",
    "error_alert": "bg-rose-500/20 text-rose-400 border-rose-500/30"
}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_notifications_db():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL DEFAULT 'system',
                title TEXT NOT NULL,
                content TEXT,
                is_read INTEGER DEFAULT 0,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                read_at TIMESTAMP
            )
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_notifications_type 
            ON notifications(type)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_notifications_is_read 
            ON notifications(is_read)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
            ON notifications(created_at)
        """)

        conn.commit()
    finally:
        conn.close()


init_notifications_db()


class CreateNotificationRequest(BaseModel):
    type: str = Field(default="system")
    title: str = Field(..., min_length=1, max_length=200)
    content: Optional[str] = ""
    metadata: Optional[Dict[str, Any]] = {}


class MarkReadRequest(BaseModel):
    notification_ids: Optional[List[int]] = None


def _row_to_dict(row) -> Dict[str, Any]:
    d = dict(row)
    metadata_str = d.pop("metadata", "{}") or "{}"
    try:
        d["metadata"] = json.loads(metadata_str)
    except (json.JSONDecodeError, TypeError):
        d["metadata"] = {}
    d["is_read"] = bool(d.get("is_read", 0))
    d["type_label"] = NOTIFICATION_TYPES.get(d["type"], d["type"])
    d["type_icon"] = NOTIFICATION_TYPE_ICONS.get(d["type"], "📌")
    d["type_color"] = NOTIFICATION_TYPE_COLORS.get(d["type"], "bg-slate-500/20 text-slate-400 border-slate-500/30")
    return d


def create_notification(
    type: str = "system",
    title: str = "",
    content: str = "",
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    if type not in NOTIFICATION_TYPES:
        type = "system"
    if not title:
        raise ValueError("Title is required")

    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO notifications (type, title, content, metadata)
               VALUES (?, ?, ?, ?)""",
            (type, title, content or "", json.dumps(metadata or {}, ensure_ascii=False))
        )
        conn.commit()
        return get_notification(cursor.lastrowid)
    finally:
        conn.close()


def get_notification(notification_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM notifications WHERE id = ?",
            (notification_id,)
        ).fetchone()
        if not row:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()


def get_notifications(
    page: int = 1,
    page_size: int = 20,
    type: Optional[str] = None,
    is_read: Optional[bool] = None
) -> Dict[str, Any]:
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 20

    conn = get_db()
    try:
        conditions = []
        params: list = []

        if type:
            conditions.append("type = ?")
            params.append(type)
        if is_read is not None:
            conditions.append("is_read = ?")
            params.append(1 if is_read else 0)

        where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        total = conn.execute(
            f"SELECT COUNT(*) as cnt FROM notifications {where_sql}", params
        ).fetchone()["cnt"]

        offset = (page - 1) * page_size
        rows = conn.execute(
            f"""SELECT * FROM notifications {where_sql}
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?""",
            params + [page_size, offset]
        ).fetchall()

        return {
            "notifications": [_row_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }
    finally:
        conn.close()


def get_unread_count() -> int:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0"
        ).fetchone()
        return row["cnt"] if row else 0
    finally:
        conn.close()


def mark_as_read(notification_id: int) -> bool:
    conn = get_db()
    try:
        cursor = conn.execute(
            """UPDATE notifications 
               SET is_read = 1, read_at = ?
               WHERE id = ? AND is_read = 0""",
            (datetime.now().isoformat(), notification_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def mark_all_as_read(type: Optional[str] = None) -> int:
    conn = get_db()
    try:
        if type:
            cursor = conn.execute(
                """UPDATE notifications 
                   SET is_read = 1, read_at = ?
                   WHERE is_read = 0 AND type = ?""",
                (datetime.now().isoformat(), type)
            )
        else:
            cursor = conn.execute(
                """UPDATE notifications 
                   SET is_read = 1, read_at = ?
                   WHERE is_read = 0""",
                (datetime.now().isoformat(),)
            )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def mark_multiple_as_read(notification_ids: List[int]) -> int:
    if not notification_ids:
        return 0
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(notification_ids))
        cursor = conn.execute(
            f"""UPDATE notifications 
               SET is_read = 1, read_at = ?
               WHERE id IN ({placeholders}) AND is_read = 0""",
            [datetime.now().isoformat()] + notification_ids
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def delete_notification(notification_id: int) -> bool:
    conn = get_db()
    try:
        cursor = conn.execute(
            "DELETE FROM notifications WHERE id = ?",
            (notification_id,)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def delete_multiple_notifications(notification_ids: List[int]) -> int:
    if not notification_ids:
        return 0
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(notification_ids))
        cursor = conn.execute(
            f"DELETE FROM notifications WHERE id IN ({placeholders})",
            notification_ids
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def get_notification_stats() -> Dict[str, Any]:
    conn = get_db()
    try:
        unread = conn.execute(
            "SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0"
        ).fetchone()["cnt"]

        total = conn.execute(
            "SELECT COUNT(*) as cnt FROM notifications"
        ).fetchone()["cnt"]

        today = datetime.now().date().isoformat()
        today_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM notifications WHERE date(created_at) = date(?)",
            (today,)
        ).fetchone()["cnt"]

        by_type = conn.execute(
            """SELECT type, COUNT(*) as cnt, 
                      SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread_cnt
               FROM notifications
               GROUP BY type
               ORDER BY cnt DESC"""
        ).fetchall()

        type_stats = {}
        for row in by_type:
            type_stats[row["type"]] = {
                "label": NOTIFICATION_TYPES.get(row["type"], row["type"]),
                "count": row["cnt"],
                "unread": row["unread_cnt"] or 0
            }

        for t in NOTIFICATION_TYPES:
            if t not in type_stats:
                type_stats[t] = {
                    "label": NOTIFICATION_TYPES[t],
                    "count": 0,
                    "unread": 0
                }

        return {
            "total": total,
            "unread": unread,
            "today": today_count,
            "by_type": type_stats
        }
    finally:
        conn.close()
