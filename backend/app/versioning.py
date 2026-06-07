import sqlite3
import os
import json
import difflib
import zlib
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ratings.db")

OPERATION_TYPES = ["detect", "rewrite_low", "rewrite_medium", "rewrite_high"]

OPERATION_LABELS = {
    "detect": "AI率检测",
    "rewrite_low": "轻微改写",
    "rewrite_medium": "中度改写",
    "rewrite_high": "深度改写"
}

FULL_SNAPSHOT_INTERVAL = 10


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS document_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_number INTEGER NOT NULL,
                operation_type TEXT NOT NULL,
                ai_score REAL DEFAULT 0,
                previous_version_id INTEGER,
                is_full_snapshot INTEGER DEFAULT 0,
                content_data TEXT NOT NULL,
                content_length INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_versions_created_at ON document_versions(created_at)
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_versions_number ON document_versions(version_number)
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS version_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_id INTEGER NOT NULL,
                tag_name TEXT NOT NULL,
                tag_color TEXT DEFAULT '#6366f1',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (version_id) REFERENCES document_versions(id) ON DELETE CASCADE
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tags_version ON version_tags(version_id)
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS version_meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        conn.commit()
    finally:
        conn.close()


init_db()


def _compress_text(text: str) -> str:
    compressed = zlib.compress(text.encode("utf-8"), level=9)
    import base64
    return base64.b64encode(compressed).decode("ascii")


def _decompress_text(compressed: str) -> str:
    import base64
    decoded = base64.b64decode(compressed.encode("ascii"))
    return zlib.decompress(decoded).decode("utf-8")


def _compute_line_diff(old_text: str, new_text: str) -> Dict[str, Any]:
    old_lines = old_text.splitlines(keepends=True)
    new_lines = new_text.splitlines(keepends=True)
    sm = difflib.SequenceMatcher(None, old_lines, new_lines)
    operations = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            operations.append({"op": "equal", "old_start": i1, "old_end": i2, "new_start": j1, "new_end": j2})
        elif tag == "insert":
            operations.append({
                "op": "insert",
                "new_start": j1,
                "new_end": j2,
                "lines": new_lines[j1:j2]
            })
        elif tag == "delete":
            operations.append({
                "op": "delete",
                "old_start": i1,
                "old_end": i2
            })
        elif tag == "replace":
            operations.append({
                "op": "replace",
                "old_start": i1,
                "old_end": i2,
                "new_start": j1,
                "new_end": j2,
                "old_lines": old_lines[i1:i2],
                "new_lines": new_lines[j1:j2]
            })
    return {"operations": operations}


def _apply_line_diff(base_text: str, diff_data: Dict[str, Any]) -> str:
    base_lines = base_text.splitlines(keepends=True)
    result_lines = list(base_lines)
    operations = diff_data.get("operations", [])
    offset = 0
    for op in sorted(operations, key=lambda x: x.get("old_start", x.get("new_start", 0))):
        if op["op"] == "equal":
            continue
        elif op["op"] == "insert":
            insert_pos = op["new_start"] + offset
            for i, line in enumerate(op["lines"]):
                result_lines.insert(insert_pos + i, line)
            offset += len(op["lines"])
        elif op["op"] == "delete":
            start = op["old_start"] + offset
            end = op["old_end"] + offset
            del result_lines[start:end]
            offset -= (end - start)
        elif op["op"] == "replace":
            start = op["old_start"] + offset
            end = op["old_end"] + offset
            old_len = end - start
            new_len = len(op["new_lines"])
            result_lines[start:end] = op["new_lines"]
            offset += (new_len - old_len)
    return "".join(result_lines)


def _get_next_version_number() -> int:
    conn = get_db()
    try:
        row = conn.execute("SELECT MAX(version_number) as max_v FROM document_versions").fetchone()
        if row and row["max_v"]:
            return row["max_v"] + 1
        return 1
    finally:
        conn.close()


def create_version(
    text: str,
    operation_type: str,
    ai_score: float = 0.0,
    previous_version_id: Optional[int] = None
) -> Dict[str, Any]:
    if operation_type not in OPERATION_TYPES:
        raise ValueError(f"Invalid operation_type: {operation_type}")

    version_number = _get_next_version_number()
    is_full_snapshot = (version_number == 1) or (version_number % FULL_SNAPSHOT_INTERVAL == 0)

    conn = get_db()
    try:
        previous_text = ""
        if previous_version_id and not is_full_snapshot:
            prev = conn.execute(
                "SELECT * FROM document_versions WHERE id = ?",
                (previous_version_id,)
            ).fetchone()
            if prev:
                previous_text = reconstruct_version_text(prev["id"])

        if is_full_snapshot or not previous_text:
            content_data = json.dumps({"type": "full", "text": _compress_text(text)}, ensure_ascii=False)
            is_full = 1
        else:
            diff = _compute_line_diff(previous_text, text)
            diff_json = json.dumps(diff, ensure_ascii=False)
            if len(diff_json) > len(text) * 0.8:
                content_data = json.dumps({"type": "full", "text": _compress_text(text)}, ensure_ascii=False)
                is_full = 1
            else:
                content_data = json.dumps({"type": "diff", "diff": _compress_text(diff_json)}, ensure_ascii=False)
                is_full = 0

        cursor = conn.execute(
            """INSERT INTO document_versions
               (version_number, operation_type, ai_score, previous_version_id, is_full_snapshot, content_data, content_length)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (version_number, operation_type, ai_score, previous_version_id, is_full, content_data, len(text))
        )
        conn.commit()
        version_id = cursor.lastrowid

        return {
            "id": version_id,
            "version_number": version_number,
            "operation_type": operation_type,
            "operation_label": OPERATION_LABELS.get(operation_type, operation_type),
            "ai_score": ai_score,
            "content_length": len(text),
            "created_at": datetime.now().isoformat(),
            "tags": []
        }
    finally:
        conn.close()


def reconstruct_version_text(version_id: int) -> str:
    conn = get_db()
    try:
        chain = []
        current_id = version_id
        while current_id:
            row = conn.execute(
                "SELECT id, version_number, content_data, is_full_snapshot, previous_version_id FROM document_versions WHERE id = ?",
                (current_id,)
            ).fetchone()
            if not row:
                break
            chain.append(dict(row))
            if row["is_full_snapshot"]:
                break
            current_id = row["previous_version_id"]

        chain.reverse()
        text = ""
        for node in chain:
            content = json.loads(node["content_data"])
            if content["type"] == "full":
                text = _decompress_text(content["text"])
            else:
                diff_json = _decompress_text(content["diff"])
                diff_data = json.loads(diff_json)
                text = _apply_line_diff(text, diff_data)
        return text
    finally:
        conn.close()


def get_version(version_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM document_versions WHERE id = ?",
            (version_id,)
        ).fetchone()
        if not row:
            return None
        tags_rows = conn.execute(
            "SELECT * FROM version_tags WHERE version_id = ? ORDER BY created_at ASC",
            (version_id,)
        ).fetchall()
        tags = [{"id": t["id"], "tag_name": t["tag_name"], "tag_color": t["tag_color"]} for t in tags_rows]
        data = dict(row)
        return {
            "id": data["id"],
            "version_number": data["version_number"],
            "operation_type": data["operation_type"],
            "operation_label": OPERATION_LABELS.get(data["operation_type"], data["operation_type"]),
            "ai_score": data["ai_score"],
            "content_length": data["content_length"],
            "created_at": data["created_at"],
            "is_full_snapshot": bool(data["is_full_snapshot"]),
            "previous_version_id": data["previous_version_id"],
            "tags": tags
        }
    finally:
        conn.close()


def get_versions(page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) as cnt FROM document_versions").fetchone()["cnt"]
        offset = (page - 1) * page_size
        rows = conn.execute(
            """SELECT v.* FROM document_versions v
               ORDER BY v.version_number DESC
               LIMIT ? OFFSET ?""",
            (page_size, offset)
        ).fetchall()

        version_ids = [r["id"] for r in rows]
        tags_map: Dict[int, List[Dict[str, Any]]] = {}
        if version_ids:
            placeholders = ",".join("?" * len(version_ids))
            tag_rows = conn.execute(
                f"SELECT * FROM version_tags WHERE version_id IN ({placeholders}) ORDER BY created_at ASC",
                version_ids
            ).fetchall()
            for t in tag_rows:
                vid = t["version_id"]
                if vid not in tags_map:
                    tags_map[vid] = []
                tags_map[vid].append({"id": t["id"], "tag_name": t["tag_name"], "tag_color": t["tag_color"]})

        versions = []
        prev_ai_score = None
        sorted_rows = sorted(rows, key=lambda r: r["version_number"])
        for row in sorted_rows:
            d = dict(row)
            ai_change = None
            if prev_ai_score is not None:
                ai_change = round(d["ai_score"] - prev_ai_score, 2)
            versions.append({
                "id": d["id"],
                "version_number": d["version_number"],
                "operation_type": d["operation_type"],
                "operation_label": OPERATION_LABELS.get(d["operation_type"], d["operation_type"]),
                "ai_score": d["ai_score"],
                "ai_change": ai_change,
                "content_length": d["content_length"],
                "created_at": d["created_at"],
                "is_full_snapshot": bool(d["is_full_snapshot"]),
                "tags": tags_map.get(d["id"], [])
            })
            prev_ai_score = d["ai_score"]

        versions.reverse()

        return {
            "versions": versions,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }
    finally:
        conn.close()


def get_version_content(version_id: int) -> Dict[str, Any]:
    version = get_version(version_id)
    if not version:
        raise ValueError(f"Version {version_id} not found")
    text = reconstruct_version_text(version_id)
    return {
        **version,
        "content": text
    }


def compare_versions(version_a_id: int, version_b_id: int) -> Dict[str, Any]:
    text_a = reconstruct_version_text(version_a_id)
    text_b = reconstruct_version_text(version_b_id)
    version_a = get_version(version_a_id)
    version_b = get_version(version_b_id)

    a_lines = text_a.splitlines(keepends=True)
    b_lines = text_b.splitlines(keepends=True)

    sm = difflib.SequenceMatcher(None, a_lines, b_lines)

    diff_lines_left = []
    diff_lines_right = []

    line_num_left = 1
    line_num_right = 1

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                diff_lines_left.append({
                    "type": "equal",
                    "line_num": line_num_left + k,
                    "content": a_lines[i1 + k]
                })
                diff_lines_right.append({
                    "type": "equal",
                    "line_num": line_num_right + k,
                    "content": b_lines[j1 + k]
                })
            line_num_left += (i2 - i1)
            line_num_right += (j2 - j1)
        elif tag == "insert":
            for k in range(j2 - j1):
                diff_lines_left.append({
                    "type": "empty",
                    "line_num": None,
                    "content": ""
                })
                diff_lines_right.append({
                    "type": "insert",
                    "line_num": line_num_right + k,
                    "content": b_lines[j1 + k]
                })
            line_num_right += (j2 - j1)
        elif tag == "delete":
            for k in range(i2 - i1):
                diff_lines_left.append({
                    "type": "delete",
                    "line_num": line_num_left + k,
                    "content": a_lines[i1 + k]
                })
                diff_lines_right.append({
                    "type": "empty",
                    "line_num": None,
                    "content": ""
                })
            line_num_left += (i2 - i1)
        elif tag == "replace":
            max_len = max(i2 - i1, j2 - j1)
            for k in range(max_len):
                if k < (i2 - i1):
                    diff_lines_left.append({
                        "type": "replace",
                        "line_num": line_num_left + k,
                        "content": a_lines[i1 + k]
                    })
                else:
                    diff_lines_left.append({
                        "type": "empty",
                        "line_num": None,
                        "content": ""
                    })
                if k < (j2 - j1):
                    diff_lines_right.append({
                        "type": "replace",
                        "line_num": line_num_right + k,
                        "content": b_lines[j1 + k]
                    })
                else:
                    diff_lines_right.append({
                        "type": "empty",
                        "line_num": None,
                        "content": ""
                    })
            line_num_left += (i2 - i1)
            line_num_right += (j2 - j1)

    stats = {
        "equal": 0,
        "insert": 0,
        "delete": 0,
        "replace": 0
    }
    for line in diff_lines_left:
        if line["type"] in stats:
            stats[line["type"]] += 1

    return {
        "version_a": version_a,
        "version_b": version_b,
        "lines_left": diff_lines_left,
        "lines_right": diff_lines_right,
        "stats": stats
    }


def add_tag(version_id: int, tag_name: str, tag_color: str = "#6366f1") -> Dict[str, Any]:
    version = get_version(version_id)
    if not version:
        raise ValueError(f"Version {version_id} not found")
    if not tag_name or len(tag_name.strip()) == 0:
        raise ValueError("Tag name cannot be empty")

    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT * FROM version_tags WHERE version_id = ? AND tag_name = ?",
            (version_id, tag_name.strip())
        ).fetchone()
        if existing:
            return {"id": existing["id"], "tag_name": existing["tag_name"], "tag_color": existing["tag_color"]}

        cursor = conn.execute(
            "INSERT INTO version_tags (version_id, tag_name, tag_color) VALUES (?, ?, ?)",
            (version_id, tag_name.strip(), tag_color)
        )
        conn.commit()
        return {"id": cursor.lastrowid, "tag_name": tag_name.strip(), "tag_color": tag_color}
    finally:
        conn.close()


def remove_tag(tag_id: int) -> bool:
    conn = get_db()
    try:
        conn.execute("DELETE FROM version_tags WHERE id = ?", (tag_id,))
        conn.commit()
        return True
    finally:
        conn.close()


def get_all_tags() -> List[Dict[str, Any]]:
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT vt.*, v.version_number
               FROM version_tags vt
               JOIN document_versions v ON vt.version_id = v.id
               ORDER BY vt.created_at DESC"""
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def delete_version(version_id: int) -> bool:
    conn = get_db()
    try:
        conn.execute("DELETE FROM version_tags WHERE version_id = ?", (version_id,))
        conn.execute("DELETE FROM document_versions WHERE id = ?", (version_id,))
        conn.commit()
        return True
    finally:
        conn.close()
