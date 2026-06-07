import sqlite3
import os
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ratings.db")

OPERATION_TYPES = {
    "file_upload": "上传文件",
    "detect": "执行检测",
    "rewrite": "触发改写",
    "summarize": "智能摘要",
    "continuation": "智能续写",
    "style_analyze": "风格诊断",
    "self_plagiarism": "内部查重",
    "version_create": "创建版本",
    "version_restore": "恢复版本",
    "collab_join": "加入协作",
    "rating": "提交评分",
    "api_call": "API调用"
}

OPERATION_TYPE_COLORS = {
    "file_upload": "bg-sky-500/20 text-sky-400",
    "detect": "bg-emerald-500/20 text-emerald-400",
    "rewrite": "bg-indigo-500/20 text-indigo-400",
    "summarize": "bg-purple-500/20 text-purple-400",
    "continuation": "bg-fuchsia-500/20 text-fuchsia-400",
    "style_analyze": "bg-amber-500/20 text-amber-400",
    "self_plagiarism": "bg-rose-500/20 text-rose-400",
    "version_create": "bg-teal-500/20 text-teal-400",
    "version_restore": "bg-cyan-500/20 text-cyan-400",
    "collab_join": "bg-violet-500/20 text-violet-400",
    "rating": "bg-pink-500/20 text-pink-400",
    "api_call": "bg-slate-500/20 text-slate-400"
}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_operation_logs_db():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS operation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_type TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'success',
                details TEXT DEFAULT '{}',
                user_id TEXT DEFAULT 'anonymous',
                session_id TEXT,
                ip_address TEXT,
                user_agent TEXT,
                duration_ms INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_op_logs_type 
            ON operation_logs(operation_type)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_op_logs_created_at 
            ON operation_logs(created_at)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_op_logs_status 
            ON operation_logs(status)
        """)

        conn.commit()
    finally:
        conn.close()


init_operation_logs_db()


class LogOperationRequest(BaseModel):
    operation_type: str = Field(...)
    description: Optional[str] = ""
    status: Optional[str] = "success"
    details: Optional[Dict[str, Any]] = {}
    user_id: Optional[str] = "anonymous"
    session_id: Optional[str] = None
    duration_ms: Optional[int] = 0


def _row_to_dict(row) -> Dict[str, Any]:
    d = dict(row)
    details_str = d.pop("details", "{}") or "{}"
    try:
        d["details"] = json.loads(details_str)
    except (json.JSONDecodeError, TypeError):
        d["details"] = {}
    d["type_label"] = OPERATION_TYPES.get(d["operation_type"], d["operation_type"])
    d["type_color"] = OPERATION_TYPE_COLORS.get(d["operation_type"], "bg-slate-500/20 text-slate-400")
    return d


def log_operation(
    operation_type: str,
    description: str = "",
    status: str = "success",
    details: Optional[Dict[str, Any]] = None,
    user_id: str = "anonymous",
    session_id: Optional[str] = None,
    duration_ms: int = 0
) -> Dict[str, Any]:
    if operation_type not in OPERATION_TYPES:
        operation_type = "api_call"

    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO operation_logs 
               (operation_type, description, status, details, user_id, session_id, duration_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                operation_type,
                description or "",
                status or "success",
                json.dumps(details or {}, ensure_ascii=False),
                user_id or "anonymous",
                session_id,
                duration_ms or 0
            )
        )
        conn.commit()
        return get_operation_log(cursor.lastrowid)
    finally:
        conn.close()


def get_operation_log(log_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM operation_logs WHERE id = ?",
            (log_id,)
        ).fetchone()
        if not row:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()


def get_operation_logs(
    page: int = 1,
    page_size: int = 20,
    operation_type: Optional[str] = None,
    status: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 200:
        page_size = 20

    conn = get_db()
    try:
        conditions = []
        params: list = []

        if operation_type:
            conditions.append("operation_type = ?")
            params.append(operation_type)
        if status:
            conditions.append("status = ?")
            params.append(status)
        if start_time:
            conditions.append("created_at >= ?")
            params.append(start_time)
        if end_time:
            conditions.append("created_at <= ?")
            params.append(end_time)
        if user_id:
            conditions.append("user_id = ?")
            params.append(user_id)

        where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        total = conn.execute(
            f"SELECT COUNT(*) as cnt FROM operation_logs {where_sql}", params
        ).fetchone()["cnt"]

        offset = (page - 1) * page_size
        rows = conn.execute(
            f"""SELECT * FROM operation_logs {where_sql}
               ORDER BY created_at DESC
               LIMIT ? OFFSET ?""",
            params + [page_size, offset]
        ).fetchall()

        return {
            "logs": [_row_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }
    finally:
        conn.close()


def get_operation_log_stats(
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
) -> Dict[str, Any]:
    conn = get_db()
    try:
        conditions = []
        params: list = []

        if start_time:
            conditions.append("created_at >= ?")
            params.append(start_time)
        if end_time:
            conditions.append("created_at <= ?")
            params.append(end_time)

        where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        total = conn.execute(
            f"SELECT COUNT(*) as cnt FROM operation_logs {where_sql}", params
        ).fetchone()["cnt"]

        success_count = conn.execute(
            f"SELECT COUNT(*) as cnt FROM operation_logs {where_sql} AND status = 'success'",
            params
        ).fetchone()["cnt"] if conditions else conn.execute(
            "SELECT COUNT(*) as cnt FROM operation_logs WHERE status = 'success'"
        ).fetchone()["cnt"]

        avg_duration = conn.execute(
            f"SELECT AVG(duration_ms) as avg FROM operation_logs {where_sql}",
            params
        ).fetchone()["avg"] or 0

        by_type = conn.execute(
            f"""SELECT operation_type, COUNT(*) as cnt
               FROM operation_logs {where_sql}
               GROUP BY operation_type
               ORDER BY cnt DESC""",
            params
        ).fetchall()

        type_stats = {}
        for row in by_type:
            type_stats[row["operation_type"]] = {
                "label": OPERATION_TYPES.get(row["operation_type"], row["operation_type"]),
                "count": row["cnt"]
            }

        for t in OPERATION_TYPES:
            if t not in type_stats:
                type_stats[t] = {
                    "label": OPERATION_TYPES[t],
                    "count": 0
                }

        today = datetime.now().date().isoformat()
        today_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM operation_logs WHERE date(created_at) = date(?)",
            (today,)
        ).fetchone()["cnt"]

        return {
            "total": total,
            "success": success_count,
            "failed": total - success_count,
            "success_rate": round((success_count / total * 100), 2) if total > 0 else 0,
            "avg_duration_ms": round(avg_duration, 2),
            "today": today_count,
            "by_type": type_stats
        }
    finally:
        conn.close()
