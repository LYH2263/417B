import sqlite3
import os
import uuid
import secrets
import time
import threading
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from collections import defaultdict

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ratings.db")

ADMIN_TOKEN = "paperwise-admin-secret-token-2024"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_api_db():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_hash TEXT UNIQUE NOT NULL,
                key_prefix TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                revoked_at TIMESTAMP,
                last_used_at TIMESTAMP,
                total_requests INTEGER DEFAULT 0
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS api_usage_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_key_id INTEGER NOT NULL,
                endpoint TEXT NOT NULL,
                method TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                response_time_ms INTEGER NOT NULL,
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS rate_limit_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                api_key_id INTEGER UNIQUE,
                requests_per_minute INTEGER DEFAULT 60,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
            )
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_usage_logs_key_time 
            ON api_usage_logs(api_key_id, created_at)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at 
            ON api_usage_logs(created_at)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_api_keys_status 
            ON api_keys(status)
        """)

        conn.commit()
    finally:
        conn.close()


init_api_db()


class TokenBucket:
    def __init__(self, capacity: int, refill_rate_per_minute: float):
        self.capacity = capacity
        self.tokens = float(capacity)
        self.refill_rate = refill_rate_per_minute / 60.0
        self.last_refill = time.time()
        self._lock = threading.Lock()

    def consume(self, tokens_needed: int = 1) -> bool:
        with self._lock:
            now = time.time()
            elapsed = now - self.last_refill
            self.tokens = min(
                self.capacity,
                self.tokens + elapsed * self.refill_rate
            )
            self.last_refill = now

            if self.tokens >= tokens_needed:
                self.tokens -= tokens_needed
                return True
            return False

    def get_tokens(self) -> float:
        with self._lock:
            now = time.time()
            elapsed = now - self.last_refill
            return min(
                self.capacity,
                self.tokens + elapsed * self.refill_rate
            )


_buckets: Dict[int, TokenBucket] = {}
_buckets_lock = threading.Lock()
_default_rpm = 60


def get_bucket(api_key_id: int, rpm: Optional[int] = None) -> TokenBucket:
    with _buckets_lock:
        if api_key_id not in _buckets:
            rate = rpm if rpm is not None else _default_rpm
            _buckets[api_key_id] = TokenBucket(capacity=rate, refill_rate_per_minute=rate)
        return _buckets[api_key_id]


def reset_bucket(api_key_id: int):
    with _buckets_lock:
        _buckets.pop(api_key_id, None)


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = ""
    expires_in_days: Optional[int] = Field(None, ge=1, le=3650)


class UpdateRateLimitRequest(BaseModel):
    api_key_id: int
    requests_per_minute: int = Field(..., ge=1, le=10000)


class VerifyAdminRequest(BaseModel):
    admin_token: str


def generate_api_key() -> tuple[str, str, str]:
    raw_key = "pw_" + secrets.token_urlsafe(32)
    prefix = raw_key[:8]
    key_hash = hash_key(raw_key)
    return raw_key, prefix, key_hash


def hash_key(key: str) -> str:
    import hashlib
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def verify_admin_token(token: str) -> bool:
    return token == ADMIN_TOKEN


def create_api_key(req: CreateApiKeyRequest) -> Dict[str, Any]:
    raw_key, prefix, key_hash = generate_api_key()
    expires_at = None
    if req.expires_in_days:
        expires_at = (datetime.now() + timedelta(days=req.expires_in_days)).isoformat()

    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO api_keys 
               (key_hash, key_prefix, name, description, expires_at)
               VALUES (?, ?, ?, ?, ?)""",
            (key_hash, prefix, req.name, req.description or "", expires_at)
        )
        key_id = cursor.lastrowid

        conn.execute(
            """INSERT INTO rate_limit_config (api_key_id, requests_per_minute)
               VALUES (?, ?)""",
            (key_id, _default_rpm)
        )

        conn.commit()

        return {
            "id": key_id,
            "key": raw_key,
            "key_prefix": prefix,
            "name": req.name,
            "description": req.description or "",
            "status": "active",
            "created_at": datetime.now().isoformat(),
            "expires_at": expires_at,
            "requests_per_minute": _default_rpm
        }
    finally:
        conn.close()


def list_api_keys() -> List[Dict[str, Any]]:
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT k.*, COALESCE(r.requests_per_minute, ?) as requests_per_minute
               FROM api_keys k 
               LEFT JOIN rate_limit_config r ON k.id = r.api_key_id
               ORDER BY k.created_at DESC""",
            (_default_rpm,)
        ).fetchall()

        result = []
        for row in rows:
            d = dict(row)
            is_expired = d["expires_at"] and datetime.fromisoformat(d["expires_at"]) < datetime.now()
            d["is_expired"] = is_expired
            d["effective_status"] = "revoked" if d["status"] == "revoked" else (
                "expired" if is_expired else d["status"]
            )
            result.append(d)
        return result
    finally:
        conn.close()


def revoke_api_key(key_id: int) -> bool:
    conn = get_db()
    try:
        cursor = conn.execute(
            """UPDATE api_keys 
               SET status = 'revoked', revoked_at = ?
               WHERE id = ? AND status != 'revoked'""",
            (datetime.now().isoformat(), key_id)
        )
        conn.commit()
        if cursor.rowcount > 0:
            reset_bucket(key_id)
            return True
        return False
    finally:
        conn.close()


def get_api_key_by_hash(key_hash: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    try:
        row = conn.execute(
            """SELECT k.*, COALESCE(r.requests_per_minute, ?) as requests_per_minute
               FROM api_keys k
               LEFT JOIN rate_limit_config r ON k.id = r.api_key_id
               WHERE k.key_hash = ?""",
            (_default_rpm, key_hash)
        ).fetchone()

        if not row:
            return None

        d = dict(row)
        is_expired = d["expires_at"] and datetime.fromisoformat(d["expires_at"]) < datetime.now()
        d["is_expired"] = is_expired
        d["is_valid"] = d["status"] == "active" and not is_expired
        return d
    finally:
        conn.close()


def update_key_last_used(key_id: int):
    conn = get_db()
    try:
        conn.execute(
            "UPDATE api_keys SET last_used_at = ?, total_requests = total_requests + 1 WHERE id = ?",
            (datetime.now().isoformat(), key_id)
        )
        conn.commit()
    finally:
        conn.close()


def log_api_usage(api_key_id: int, endpoint: str, method: str,
                 status_code: int, response_time_ms: int, error_message: Optional[str] = None):
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO api_usage_logs 
               (api_key_id, endpoint, method, status_code, response_time_ms, error_message)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (api_key_id, endpoint, method, status_code, response_time_ms, error_message)
        )
        conn.commit()
    finally:
        conn.close()


def check_rate_limit(api_key_id: int, rpm: int) -> Dict[str, Any]:
    bucket = get_bucket(api_key_id, rpm)
    allowed = bucket.consume(1)
    return {
        "allowed": allowed,
        "remaining_tokens": bucket.get_tokens(),
        "limit": rpm
    }


def update_rate_limit(api_key_id: int, requests_per_minute: int) -> bool:
    conn = get_db()
    try:
        conn.execute(
            """INSERT INTO rate_limit_config (api_key_id, requests_per_minute, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(api_key_id) DO UPDATE SET 
                   requests_per_minute = excluded.requests_per_minute,
                   updated_at = excluded.updated_at""",
            (api_key_id, requests_per_minute, datetime.now().isoformat())
        )
        conn.commit()
        reset_bucket(api_key_id)
        return True
    finally:
        conn.close()


def get_usage_stats(api_key_id: Optional[int] = None,
                    period: str = "day") -> Dict[str, Any]:
    conn = get_db()
    try:
        now = datetime.now()
        if period == "day":
            start = now - timedelta(days=1)
            group_format = "%Y-%m-%d %H:00"
        elif period == "week":
            start = now - timedelta(days=7)
            group_format = "%Y-%m-%d"
        elif period == "month":
            start = now - timedelta(days=30)
            group_format = "%Y-%m-%d"
        else:
            start = now - timedelta(days=1)
            group_format = "%Y-%m-%d %H:00"

        params: list = [start.isoformat()]
        sql_where = "WHERE l.created_at >= ?"
        if api_key_id:
            sql_where += " AND l.api_key_id = ?"
            params.append(api_key_id)

        total_requests = conn.execute(
            f"SELECT COUNT(*) FROM api_usage_logs l {sql_where}", params
        ).fetchone()[0]

        error_count = conn.execute(
            f"SELECT COUNT(*) FROM api_usage_logs l {sql_where} AND l.status_code >= 400", params
        ).fetchone()[0]

        avg_response_time = conn.execute(
            f"SELECT AVG(l.response_time_ms) FROM api_usage_logs l {sql_where}", params
        ).fetchone()[0] or 0

        trend_rows = conn.execute(
            f"""SELECT 
                   strftime(?, l.created_at) as bucket,
                   COUNT(*) as request_count,
                   AVG(l.response_time_ms) as avg_response_time,
                   SUM(CASE WHEN l.status_code >= 400 THEN 1 ELSE 0 END) as error_count
                FROM api_usage_logs l
                {sql_where}
                GROUP BY bucket
                ORDER BY bucket ASC""",
            [group_format] + params
        ).fetchall()

        trend_data = []
        for row in trend_rows:
            d = dict(row)
            total = d["request_count"] or 0
            errors = d["error_count"] or 0
            d["error_rate"] = round((errors / total * 100), 2) if total > 0 else 0
            d["avg_response_time"] = round(d["avg_response_time"] or 0, 2)
            trend_data.append(d)

        return {
            "total_requests": total_requests,
            "error_count": error_count,
            "error_rate": round((error_count / total_requests * 100), 2) if total_requests > 0 else 0,
            "avg_response_time_ms": round(avg_response_time, 2),
            "trend_data": trend_data,
            "period": period
        }
    finally:
        conn.close()


def get_dashboard_stats() -> Dict[str, Any]:
    conn = get_db()
    try:
        today = datetime.now().date().isoformat()

        total_requests = conn.execute(
            "SELECT COUNT(*) FROM api_usage_logs"
        ).fetchone()[0]

        today_requests = conn.execute(
            "SELECT COUNT(*) FROM api_usage_logs WHERE date(created_at) = date(?)",
            (today,)
        ).fetchone()[0]

        active_keys_today = conn.execute(
            """SELECT COUNT(DISTINCT api_key_id) 
               FROM api_usage_logs 
               WHERE date(created_at) = date(?)""",
            (today,)
        ).fetchone()[0]

        total_active_keys = conn.execute(
            "SELECT COUNT(*) FROM api_keys WHERE status = 'active' AND (expires_at IS NULL OR expires_at > ?)",
            (datetime.now().isoformat(),)
        ).fetchone()[0]

        one_min_ago = (datetime.now() - timedelta(minutes=1)).isoformat()
        current_concurrency = conn.execute(
            "SELECT COUNT(*) FROM api_usage_logs WHERE created_at >= ?",
            (one_min_ago,)
        ).fetchone()[0]

        total_errors = conn.execute(
            "SELECT COUNT(*) FROM api_usage_logs WHERE status_code >= 400"
        ).fetchone()[0]

        avg_response = conn.execute(
            "SELECT AVG(response_time_ms) FROM api_usage_logs"
        ).fetchone()[0] or 0

        endpoint_stats = conn.execute(
            """SELECT endpoint, 
                      COUNT(*) as count,
                      AVG(response_time_ms) as avg_response,
                      SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
               FROM api_usage_logs
               GROUP BY endpoint
               ORDER BY count DESC
               LIMIT 10"""
        ).fetchall()

        return {
            "total_requests": total_requests,
            "today_requests": today_requests,
            "active_keys_today": active_keys_today,
            "total_active_keys": total_active_keys,
            "current_concurrency": current_concurrency,
            "total_errors": total_errors,
            "avg_response_time_ms": round(avg_response, 2),
            "error_rate": round((total_errors / total_requests * 100), 2) if total_requests > 0 else 0,
            "top_endpoints": [dict(r) for r in endpoint_stats]
        }
    finally:
        conn.close()
