import sqlite3
import os
import json
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ratings.db")

RATING_DIMENSIONS = [
    "semantic_fidelity",
    "academic_norm",
    "fluency",
    "terminology_accuracy",
    "ai_reduction"
]

DIMENSION_LABELS = {
    "semantic_fidelity": "语义保真度",
    "academic_norm": "学术规范性",
    "fluency": "流畅度",
    "terminology_accuracy": "术语准确性",
    "ai_reduction": "AI率降低效果"
}

DIMENSION_SUGGESTIONS = {
    "semantic_fidelity": {
        "action": "开启语义保护模式",
        "desc": "检测到您对语义保真度评分较低，建议开启更严格的语义保护模式，改写时将最大程度保留原文核心含义。"
    },
    "academic_norm": {
        "action": "增强学术规范处理",
        "desc": "检测到您对学术规范性评分较低，建议增强学术规范处理，改写时将采用更严谨的学术表达风格。"
    },
    "fluency": {
        "action": "启用深度流畅优化",
        "desc": "检测到您对流畅度评分较低，建议启用深度流畅优化，改写时将优先优化语句衔接和自然度。"
    },
    "terminology_accuracy": {
        "action": "开启更严格的术语保护模式",
        "desc": "检测到您对术语准确性评分较低，建议开启更严格的术语保护模式，改写时将最大程度保留专业术语不变。"
    },
    "ai_reduction": {
        "action": "提升改写深度等级",
        "desc": "检测到您对AI率降低效果评分较低，建议提升改写深度等级，系统将采用更激进的降AI策略。"
    }
}


class RatingSubmit(BaseModel):
    rewrite_level: str = "medium"
    semantic_fidelity: int = Field(..., ge=1, le=5)
    academic_norm: int = Field(..., ge=1, le=5)
    fluency: int = Field(..., ge=1, le=5)
    terminology_accuracy: int = Field(..., ge=1, le=5)
    ai_reduction: int = Field(..., ge=1, le=5)
    comment: Optional[str] = ""
    original_length: Optional[int] = 0
    rewritten_length: Optional[int] = 0
    ai_score_before: Optional[float] = 0
    ai_score_after: Optional[float] = 0


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS rewrite_ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                rewrite_level TEXT,
                semantic_fidelity INTEGER,
                academic_norm INTEGER,
                fluency INTEGER,
                terminology_accuracy INTEGER,
                ai_reduction INTEGER,
                comment TEXT,
                original_length INTEGER,
                rewritten_length INTEGER,
                ai_score_before REAL,
                ai_score_after REAL
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON rewrite_ratings(created_at)
        """)
        conn.commit()
    finally:
        conn.close()


init_db()


def submit_rating(data: RatingSubmit) -> Dict[str, Any]:
    conn = get_db()
    try:
        cursor = conn.execute(
            """INSERT INTO rewrite_ratings 
               (rewrite_level, semantic_fidelity, academic_norm, fluency, terminology_accuracy, 
                ai_reduction, comment, original_length, rewritten_length, ai_score_before, ai_score_after)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.rewrite_level,
                data.semantic_fidelity,
                data.academic_norm,
                data.fluency,
                data.terminology_accuracy,
                data.ai_reduction,
                data.comment,
                data.original_length,
                data.rewritten_length,
                data.ai_score_before,
                data.ai_score_after
            )
        )
        conn.commit()
        rating_id = cursor.lastrowid

        suggestions = generate_suggestions()

        return {
            "success": True,
            "rating_id": rating_id,
            "suggestions": suggestions
        }
    finally:
        conn.close()


def get_statistics() -> Dict[str, Any]:
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT * FROM rewrite_ratings ORDER BY created_at ASC"""
        ).fetchall()

        if not rows:
            return {
                "total_count": 0,
                "dimension_averages": {dim: 0 for dim in RATING_DIMENSIONS},
                "overall_average": 0,
                "trend_data": [],
                "score_distribution": {str(i): 0 for i in range(1, 6)},
                "dimension_labels": DIMENSION_LABELS
            }

        total_count = len(rows)

        dimension_sums = {dim: 0 for dim in RATING_DIMENSIONS}
        score_distribution = {str(i): 0 for i in range(1, 6)}
        trend_data = []

        for row in rows:
            row_dict = dict(row)
            overall = sum(row_dict[d] for d in RATING_DIMENSIONS) / len(RATING_DIMENSIONS)
            for dim in RATING_DIMENSIONS:
                dimension_sums[dim] += row_dict[dim]
            score_bucket = round(overall)
            if 1 <= score_bucket <= 5:
                score_distribution[str(score_bucket)] += 1

            created_at = row_dict["created_at"]
            trend_data.append({
                "timestamp": created_at,
                "overall": round(overall, 2),
                "semantic_fidelity": row_dict["semantic_fidelity"],
                "academic_norm": row_dict["academic_norm"],
                "fluency": row_dict["fluency"],
                "terminology_accuracy": row_dict["terminology_accuracy"],
                "ai_reduction": row_dict["ai_reduction"]
            })

        dimension_averages = {
            dim: round(dimension_sums[dim] / total_count, 2) for dim in RATING_DIMENSIONS
        }
        overall_average = round(sum(dimension_averages.values()) / len(RATING_DIMENSIONS), 2)

        return {
            "total_count": total_count,
            "dimension_averages": dimension_averages,
            "overall_average": overall_average,
            "trend_data": trend_data,
            "score_distribution": score_distribution,
            "dimension_labels": DIMENSION_LABELS
        }
    finally:
        conn.close()


def generate_suggestions() -> List[Dict[str, Any]]:
    conn = get_db()
    try:
        recent_rows = conn.execute(
            """SELECT * FROM rewrite_ratings ORDER BY created_at DESC LIMIT 10"""
        ).fetchall()

        if len(recent_rows) < 3:
            return []

        suggestions = []

        for dim in RATING_DIMENSIONS:
            recent_3 = [dict(r)[dim] for r in recent_rows[:3]]
            if all(score <= 2 for score in recent_3):
                info = DIMENSION_SUGGESTIONS[dim]
                suggestions.append({
                    "dimension": dim,
                    "dimension_label": DIMENSION_LABELS[dim],
                    "action": info["action"],
                    "description": info["desc"],
                    "severity": "high" if all(score == 1 for score in recent_3) else "medium"
                })

        return suggestions
    finally:
        conn.close()
