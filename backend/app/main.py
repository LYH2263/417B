from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect, Request, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import time

try:
    from app.parser import extract_text
    from app.paper_metadata import extract_paper_metadata, export_bibtex, export_ris
    from app.rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions
    from app.summarizer import summarize_paper
    from app.collab import room_manager
    from app.api_keys import (
        create_api_key, list_api_keys, revoke_api_key,
        get_api_key_by_hash, update_key_last_used, log_api_usage,
        check_rate_limit, update_rate_limit, get_usage_stats,
        get_dashboard_stats, verify_admin_token,
        CreateApiKeyRequest, UpdateRateLimitRequest, VerifyAdminRequest, ADMIN_TOKEN
    )
    from app.versioning import (
        create_version, get_versions, get_version, get_version_content,
        compare_versions, add_tag, remove_tag, delete_version
    )
    from app.notifications import (
        create_notification, get_notification, get_notifications,
        get_unread_count, mark_as_read, mark_all_as_read, mark_multiple_as_read,
        delete_notification, delete_multiple_notifications, get_notification_stats,
        CreateNotificationRequest, MarkReadRequest, NOTIFICATION_TYPES
    )
    from app.operation_logs import (
        log_operation, get_operation_log, get_operation_logs, get_operation_log_stats,
        LogOperationRequest, OPERATION_TYPES
    )
except ImportError:
    try:
        from .parser import extract_text
        from .paper_metadata import extract_paper_metadata, export_bibtex, export_ris
        from .rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions
        from .summarizer import summarize_paper
        from .collab import room_manager
        from .api_keys import (
            create_api_key, list_api_keys, revoke_api_key,
            get_api_key_by_hash, update_key_last_used, log_api_usage,
            check_rate_limit, update_rate_limit, get_usage_stats,
            get_dashboard_stats, verify_admin_token,
            CreateApiKeyRequest, UpdateRateLimitRequest, VerifyAdminRequest, ADMIN_TOKEN
        )
        from .versioning import (
            create_version, get_versions, get_version, get_version_content,
            compare_versions, add_tag, remove_tag, delete_version
        )
        from .notifications import (
            create_notification, get_notification, get_notifications,
            get_unread_count, mark_as_read, mark_all_as_read, mark_multiple_as_read,
            delete_notification, delete_multiple_notifications, get_notification_stats,
            CreateNotificationRequest, MarkReadRequest, NOTIFICATION_TYPES
        )
        from .operation_logs import (
            log_operation, get_operation_log, get_operation_logs, get_operation_log_stats,
            LogOperationRequest, OPERATION_TYPES
        )
    except ImportError:
        from parser import extract_text
        from paper_metadata import extract_paper_metadata, export_bibtex, export_ris
        from rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions
        from summarizer import summarize_paper
        from collab import room_manager
        from api_keys import (
            create_api_key, list_api_keys, revoke_api_key,
            get_api_key_by_hash, update_key_last_used, log_api_usage,
            check_rate_limit, update_rate_limit, get_usage_stats,
            get_dashboard_stats, verify_admin_token,
            CreateApiKeyRequest, UpdateRateLimitRequest, VerifyAdminRequest, ADMIN_TOKEN
        )
        from versioning import (
            create_version, get_versions, get_version, get_version_content,
            compare_versions, add_tag, remove_tag, delete_version
        )
        from notifications import (
            create_notification, get_notification, get_notifications,
            get_unread_count, mark_as_read, mark_all_as_read, mark_multiple_as_read,
            delete_notification, delete_multiple_notifications, get_notification_stats,
            CreateNotificationRequest, MarkReadRequest, NOTIFICATION_TYPES
        )
        from operation_logs import (
            log_operation, get_operation_log, get_operation_logs, get_operation_log_stats,
            LogOperationRequest, OPERATION_TYPES
        )

def _lazy_import(name):
    if name == "detect_ai_content":
        try:
            from app.detector import detect_ai_content
        except ImportError:
            try:
                from .detector import detect_ai_content
            except ImportError:
                from detector import detect_ai_content
        return detect_ai_content
    if name == "rewrite_text":
        try:
            from app.rewriter import rewrite_text
        except ImportError:
            try:
                from .rewriter import rewrite_text
            except ImportError:
                from rewriter import rewrite_text
        return rewrite_text
    if name == "continuation":
        try:
            from app.continuation import generate_continuations, generate_continuations_stream
        except ImportError:
            try:
                from .continuation import generate_continuations, generate_continuations_stream
            except ImportError:
                from continuation import generate_continuations, generate_continuations_stream
        return generate_continuations, generate_continuations_stream
    if name == "style_analyzer":
        try:
            from app.style_analyzer import analyze_writing_style
        except ImportError:
            try:
                from .style_analyzer import analyze_writing_style
            except ImportError:
                from style_analyzer import analyze_writing_style
        return analyze_writing_style
    if name == "internal_plagiarism":
        try:
            from app.internal_plagiarism import (
                detect_internal_plagiarism,
                generate_dedup_suggestion,
                get_whitelist_info
            )
        except ImportError:
            try:
                from .internal_plagiarism import (
                    detect_internal_plagiarism,
                    generate_dedup_suggestion,
                    get_whitelist_info
                )
            except ImportError:
                from internal_plagiarism import (
                    detect_internal_plagiarism,
                    generate_dedup_suggestion,
                    get_whitelist_info
                )
        return detect_internal_plagiarism, generate_dedup_suggestion, get_whitelist_info

app = FastAPI(title="Academic AIGC Helper API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TextPayload(BaseModel):
    text: str

class RewritePayload(BaseModel):
    text: str
    level: str = "medium"

class ContinuationPayload(BaseModel):
    text: str
    direction: str = "continue"

class StyleAnalysisPayload(BaseModel):
    text: str
    journal_level: str = "sci_q2"

from typing import List, Optional

class InternalPlagiarismPayload(BaseModel):
    text: str
    threshold: float = 0.8
    window_size: int = 50
    custom_whitelist: Optional[List[str]] = None
    enabled_categories: Optional[List[str]] = None

class DedupSuggestionPayload(BaseModel):
    text: str
    group: dict
    sentences: List[dict]


class CreateVersionPayload(BaseModel):
    text: str
    operation_type: str
    ai_score: Optional[float] = 0.0
    previous_version_id: Optional[int] = None


class AddTagPayload(BaseModel):
    version_id: int
    tag_name: str
    tag_color: Optional[str] = "#6366f1"


class RemoveTagPayload(BaseModel):
    tag_id: int


class CompareVersionsPayload(BaseModel):
    version_a_id: int
    version_b_id: int

@app.post("/api/rewrite")
async def rewrite(payload: RewritePayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    detect_ai_content = _lazy_import("detect_ai_content")
    rewrite_text = _lazy_import("rewrite_text")
    current_text = payload.text
    max_retries = 3
    detection_after = None

    for i in range(max_retries):
        current_text = rewrite_text(current_text, payload.level)
        detection_after = detect_ai_content(current_text)

        if detection_after["overall_ai_score"] < 10:
            break

    op_type = f"rewrite_{payload.level}" if payload.level in ["low", "medium", "high"] else "rewrite_medium"
    ai_score = detection_after["overall_ai_score"] if detection_after else 0.0
    saved_version = None
    try:
        prev_versions = get_versions(page=1, page_size=1)
        prev_id = prev_versions["versions"][0]["id"] if prev_versions["versions"] else None
        saved_version = create_version(current_text, op_type, ai_score, prev_id)
    except Exception:
        pass

    return {
        "original_text": payload.text,
        "rewritten_text": current_text,
        "detection_after": detection_after,
        "iterations": i + 1,
        "saved_version": saved_version
    }

@app.get("/")
async def root():
    return {"message": "Welcome to the Academic AIGC Helper API"}

@app.post("/api/detect-text")
async def detect_text(payload: TextPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    detect_ai_content = _lazy_import("detect_ai_content")
    result = detect_ai_content(payload.text)
    ai_score = result.get("overall_ai_score", 0.0)
    saved_version = None
    try:
        prev_versions = get_versions(page=1, page_size=1)
        prev_id = prev_versions["versions"][0]["id"] if prev_versions["versions"] else None
        saved_version = create_version(payload.text, "detect", ai_score, prev_id)
    except Exception:
        pass
    return {**result, "saved_version": saved_version}

@app.post("/api/detect-file")
async def detect_file(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = extract_text(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    detect_ai_content = _lazy_import("detect_ai_content")
    result = detect_ai_content(text)
    return {
        "filename": file.filename,
        "text": text,
        **result
    }

@app.post("/api/continuation")
async def create_continuation(payload: ContinuationPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    if len(payload.text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Context text is too short")
    
    valid_directions = ["continue", "contrast", "summary", "data"]
    if payload.direction not in valid_directions:
        raise HTTPException(status_code=400, detail=f"Invalid direction. Must be one of: {valid_directions}")

    context = payload.text
    if len(context) > 1000:
        context = context[-1000:]

    generate_continuations, _ = _lazy_import("continuation")
    detect_ai_content = _lazy_import("detect_ai_content")
    candidates = generate_continuations(context, payload.direction)

    for cand in candidates:
        ai_result = detect_ai_content(cand["text"])
        cand["ai_score"] = ai_result["overall_ai_score"]

    return {
        "context_used": len(context),
        "direction": payload.direction,
        "candidates": candidates
    }

@app.post("/api/continuation/stream")
async def create_continuation_stream(payload: ContinuationPayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    if len(payload.text.strip()) < 10:
        raise HTTPException(status_code=400, detail="Context text is too short")

    valid_directions = ["continue", "contrast", "summary", "data"]
    if payload.direction not in valid_directions:
        raise HTTPException(status_code=400, detail=f"Invalid direction. Must be one of: {valid_directions}")

    context = payload.text
    if len(context) > 1000:
        context = context[-1000:]

    _, generate_continuations_stream = _lazy_import("continuation")
    detect_ai_content = _lazy_import("detect_ai_content")

    async def event_generator():
        final_candidates = {}
        async for chunk in generate_continuations_stream(context, payload.direction):
            yield chunk
            if chunk.startswith("data: "):
                try:
                    import json as _json
                    data_str = chunk[6:].strip()
                    if data_str != "[DONE]":
                        data = _json.loads(data_str)
                        if data.get("done") and data.get("id"):
                            final_candidates[data["id"]] = data
                except Exception:
                    pass

        import json as _json
        for cand_id, cand in final_candidates.items():
            ai_result = detect_ai_content(cand["text"])
            score_data = {
                "id": cand_id,
                "ai_score": ai_result["overall_ai_score"],
                "type": "ai_score"
            }
            yield f"data: {_json.dumps(score_data, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        }
    )

@app.post("/api/ratings")
async def create_rating(payload: RatingSubmit):
    result = submit_rating(payload)
    return result

@app.get("/api/ratings/statistics")
async def get_rating_statistics():
    stats = get_statistics()
    return stats

@app.get("/api/ratings/suggestions")
async def get_rating_suggestions():
    suggestions = generate_suggestions()
    return {"suggestions": suggestions}

MAX_TEXT_LENGTH = 20000

@app.post("/api/summarize-text")
async def summarize_text_endpoint(payload: TextPayload):
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    if len(payload.text.strip()) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters. Current length: {len(payload.text.strip())}"
        )

    summary_result = summarize_paper(payload.text, max_len=MAX_TEXT_LENGTH)

    full_summary_text = "\n".join([
        summary_result["structured_summary"].get("background", ""),
        summary_result["structured_summary"].get("purpose", ""),
        summary_result["structured_summary"].get("methods", ""),
        summary_result["structured_summary"].get("results", ""),
        summary_result["structured_summary"].get("conclusion", "")
    ])

    detect_ai_content = _lazy_import("detect_ai_content")
    ai_detection = detect_ai_content(full_summary_text)

    return {
        **summary_result,
        "summary_ai_detection": ai_detection
    }

@app.post("/api/summarize-file")
async def summarize_file_endpoint(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = extract_text(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Extracted text is empty")

    if len(text.strip()) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length of {MAX_TEXT_LENGTH} characters. Current length: {len(text.strip())}"
        )

    summary_result = summarize_paper(text, max_len=MAX_TEXT_LENGTH)

    full_summary_text = "\n".join([
        summary_result["structured_summary"].get("background", ""),
        summary_result["structured_summary"].get("purpose", ""),
        summary_result["structured_summary"].get("methods", ""),
        summary_result["structured_summary"].get("results", ""),
        summary_result["structured_summary"].get("conclusion", "")
    ])

    detect_ai_content = _lazy_import("detect_ai_content")
    ai_detection = detect_ai_content(full_summary_text)

    return {
        "filename": file.filename,
        **summary_result,
        "summary_ai_detection": ai_detection
    }

MAX_STYLE_LENGTH = 30000

@app.post("/api/style-analyze")
async def style_analyze_endpoint(payload: StyleAnalysisPayload):
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    if len(payload.text.strip()) > MAX_STYLE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length of {MAX_STYLE_LENGTH} characters. Current length: {len(payload.text.strip())}"
        )
    valid_levels = ["sci_q1", "sci_q2", "sci_q3"]
    if payload.journal_level not in valid_levels:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid journal_level. Must be one of: {valid_levels}"
        )
    analyze_writing_style = _lazy_import("style_analyzer")
    result = analyze_writing_style(payload.text, payload.journal_level)
    return result


@app.on_event("startup")
async def startup_event():
    await room_manager.start()


@app.post("/api/collab/rooms")
async def create_collab_room():
    room_id = room_manager.create_room()
    return {"room_id": room_id, "share_url": f"/collab/{room_id}"}


@app.get("/api/collab/rooms/{room_id}")
async def get_room_info(room_id: str):
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return {
        "room_id": room.room_id,
        "user_count": len([u for u in room.users.values() if u.connected]),
        "version": room.version,
        "created_at": room.created_at
    }


@app.get("/api/collab/rooms/{room_id}/history")
async def get_room_history(room_id: str, start_version: int = 0, end_version: Optional[int] = None):
    room = room_manager.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    history = room.get_history_range(start_version, end_version)
    return {"history": history, "current_version": room.version}


class CollabDetectPayload(BaseModel):
    room_id: str
    user_id: str


class CollabRewritePayload(BaseModel):
    room_id: str
    user_id: str
    level: str = "medium"


@app.post("/api/collab/detect")
async def collab_detect(payload: CollabDetectPayload):
    room = room_manager.get_room(payload.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    detect_ai_content = _lazy_import("detect_ai_content")
    result = detect_ai_content(room.text)
    room.set_result("detection", result)
    await room.broadcast({
        "type": "result",
        "result_type": "detection",
        "data": result,
        "triggered_by": payload.user_id
    })
    return result


@app.post("/api/collab/rewrite")
async def collab_rewrite(payload: CollabRewritePayload):
    room = room_manager.get_room(payload.room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if not room.text.strip():
        raise HTTPException(status_code=400, detail="No text to rewrite")

    detect_ai_content = _lazy_import("detect_ai_content")
    rewrite_text = _lazy_import("rewrite_text")
    current_text = room.text
    max_retries = 3
    detection_after = None

    for i in range(max_retries):
        current_text = rewrite_text(current_text, payload.level)
        detection_after = detect_ai_content(current_text)
        if detection_after["overall_ai_score"] < 10:
            break

    rewrite_result = {
        "original_text": room.text,
        "rewritten_text": current_text,
        "detection_after": detection_after,
        "iterations": i + 1
    }

    import uuid as _uuid
    op_id = str(_uuid.uuid4())
    delete_op = {"type": "delete", "position": 0, "length": len(room.text)}
    insert_op = {"type": "insert", "position": 0, "text": current_text}

    async with room.lock:
        v1 = room.apply_op(payload.user_id, {**delete_op, "op_id": op_id + "_d"}, room.version)
        v2 = room.apply_op(payload.user_id, {**insert_op, "op_id": op_id + "_i"}, room.version)

    room.set_result("rewrite", rewrite_result)

    await room.broadcast({
        "type": "op",
        "version": v1["version"],
        "op": v1,
        "user_id": payload.user_id
    })
    await room.broadcast({
        "type": "op",
        "version": v2["version"],
        "op": v2,
        "user_id": payload.user_id
    })
    await room.broadcast({
        "type": "result",
        "result_type": "rewrite",
        "data": rewrite_result,
        "triggered_by": payload.user_id
    })

    return rewrite_result


@app.websocket("/ws/collab/{room_id}/{user_id}")
async def websocket_collab(websocket: WebSocket, room_id: str, user_id: str):
    await websocket.accept()
    room = room_manager.get_or_create_room(room_id)

    user_name = None
    try:
        first_msg = await websocket.receive_text()
        try:
            init_data = json.loads(first_msg)
            if init_data.get("type") == "init":
                user_name = init_data.get("name")
        except Exception:
            pass

        async with room.lock:
            user = room.add_user(user_id, user_name)
            room.connections[user_id] = websocket

        await websocket.send_text(json.dumps({
            "type": "welcome",
            "room_id": room_id,
            "user_id": user_id,
            "user": {
                "user_id": user.user_id,
                "name": user.name,
                "avatar": user.avatar,
                "color": user.color
            },
            "snapshot": room.get_snapshot()
        }, ensure_ascii=False))

        await room.broadcast({
            "type": "user_join",
            "user": {
                "user_id": user.user_id,
                "name": user.name,
                "avatar": user.avatar,
                "color": user.color,
                "cursor": None
            }
        }, exclude=user_id)

        while True:
            try:
                data = await websocket.receive_text()
                msg = json.loads(data)
                msg_type = msg.get("type")

                async with room.lock:
                    if msg_type == "op":
                        op = msg.get("op", {})
                        base_version = msg.get("base_version", 0)
                        applied = room.apply_op(user_id, op, base_version)
                        await room.broadcast({
                            "type": "op",
                            "version": applied["version"],
                            "op": applied,
                            "user_id": user_id
                        })
                    elif msg_type == "cursor":
                        cursor = msg.get("cursor")
                        room.set_cursor(user_id, cursor)
                        await room.broadcast({
                            "type": "cursor",
                            "user_id": user_id,
                            "cursor": cursor
                        }, exclude=user_id)
                    elif msg_type == "ping":
                        room.touch()
                        await websocket.send_text(json.dumps({"type": "pong", "timestamp": msg.get("timestamp")}))
                    elif msg_type == "get_snapshot":
                        await websocket.send_text(json.dumps({
                            "type": "snapshot",
                            "data": room.get_snapshot()
                        }, ensure_ascii=False))
                    elif msg_type == "get_history":
                        start_v = msg.get("start_version", 0)
                        end_v = msg.get("end_version")
                        history = room.get_history_range(start_v, end_v)
                        await websocket.send_text(json.dumps({
                            "type": "history",
                            "history": history,
                            "current_version": room.version
                        }, ensure_ascii=False))

            except WebSocketDisconnect:
                break
            except Exception:
                break

    finally:
        async with room.lock:
            room.connections.pop(user_id, None)
            room.remove_user(user_id)
        await room.broadcast({
            "type": "user_leave",
            "user_id": user_id
        })


MAX_PLAGIARISM_LENGTH = 50000

@app.post("/api/internal-plagiarism/detect")
async def internal_plagiarism_detect(payload: InternalPlagiarismPayload):
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="No text provided")
    if len(payload.text.strip()) > MAX_PLAGIARISM_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text exceeds maximum length of {MAX_PLAGIARISM_LENGTH} characters. Current length: {len(payload.text.strip())}"
        )
    if not (0.0 < payload.threshold <= 1.0):
        raise HTTPException(status_code=400, detail="Threshold must be between 0 and 1")
    if payload.window_size < 2 or payload.window_size > 500:
        raise HTTPException(status_code=400, detail="Window size must be between 2 and 500")

    detect_internal_plagiarism, _, _ = _lazy_import("internal_plagiarism")
    result = detect_internal_plagiarism(
        text=payload.text,
        threshold=payload.threshold,
        window_size=payload.window_size,
        custom_whitelist=payload.custom_whitelist,
        enabled_categories=payload.enabled_categories
    )
    return result


@app.post("/api/internal-plagiarism/suggest")
async def internal_plagiarism_suggest(payload: DedupSuggestionPayload):
    if not payload.group or not payload.sentences:
        raise HTTPException(status_code=400, detail="Missing group or sentences data")

    _, generate_dedup_suggestion, _ = _lazy_import("internal_plagiarism")
    result = generate_dedup_suggestion(payload.sentences, payload.group)
    return result


@app.get("/api/internal-plagiarism/whitelist")
async def internal_plagiarism_whitelist():
    _, _, get_whitelist = _lazy_import("internal_plagiarism")
    return get_whitelist()


PUBLIC_PATHS = {"/", "/docs", "/openapi.json", "/redoc", "/health"}
ADMIN_API_PATHS = {"/api/admin"}
COLLAB_WS_PATH = "/ws/collab"


def _is_api_path(path: str) -> bool:
    return path.startswith("/api/") and not any(path.startswith(p) for p in ADMIN_API_PATHS)


def _is_admin_path(path: str) -> bool:
    return any(path.startswith(p) for p in ADMIN_API_PATHS)


@app.middleware("http")
async def api_gateway_middleware(request: Request, call_next):
    path = request.url.path

    if path in PUBLIC_PATHS or not _is_api_path(path):
        response = await call_next(request)
        return response

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        response = await call_next(request)
        return response

    start_time = time.time()
    api_key_data = None
    status_code = 500
    error_msg = None

    try:
        raw_key = auth_header[7:].strip()
        import hashlib
        key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

        api_key_data = get_api_key_by_hash(key_hash)
        if not api_key_data:
            status_code = 401
            raise HTTPException(status_code=401, detail="Invalid API key")

        if not api_key_data.get("is_valid"):
            status_code = 403
            if api_key_data.get("status") == "revoked":
                raise HTTPException(status_code=403, detail="API key has been revoked")
            raise HTTPException(status_code=403, detail="API key has expired")

        rpm = api_key_data.get("requests_per_minute", 60)
        rate_result = check_rate_limit(api_key_data["id"], rpm)
        if not rate_result["allowed"]:
            status_code = 429
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Limit: {rate_result['limit']} requests/minute"
            )

        update_key_last_used(api_key_data["id"])

        response = await call_next(request)
        status_code = response.status_code

        response.headers["X-RateLimit-Limit"] = str(rate_result["limit"])
        response.headers["X-RateLimit-Remaining"] = str(int(rate_result["remaining_tokens"]))

        return response

    except HTTPException as he:
        status_code = he.status_code
        error_msg = he.detail
        return JSONResponse(
            status_code=he.status_code,
            content={"detail": he.detail}
        )
    except Exception as e:
        status_code = 500
        error_msg = str(e)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"}
        )
    finally:
        elapsed_ms = int((time.time() - start_time) * 1000)
        if api_key_data:
            try:
                log_api_usage(
                    api_key_id=api_key_data["id"],
                    endpoint=path,
                    method=request.method,
                    status_code=status_code,
                    response_time_ms=elapsed_ms,
                    error_message=error_msg
                )
            except Exception:
                pass


@app.post("/api/admin/verify")
async def admin_verify(payload: VerifyAdminRequest):
    if not verify_admin_token(payload.admin_token):
        raise HTTPException(status_code=401, detail="Invalid admin token")
    return {"valid": True}


def _require_admin(x_admin_token: str = Header(None)):
    if not x_admin_token or not verify_admin_token(x_admin_token):
        raise HTTPException(status_code=401, detail="Admin authorization required")
    return True


@app.post("/api/admin/keys")
async def admin_create_key(req: CreateApiKeyRequest, _: bool = Depends(_require_admin)):
    return create_api_key(req)


@app.get("/api/admin/keys")
async def admin_list_keys(_: bool = Depends(_require_admin)):
    return {"keys": list_api_keys()}


@app.post("/api/admin/keys/{key_id}/revoke")
async def admin_revoke_key(key_id: int, _: bool = Depends(_require_admin)):
    ok = revoke_api_key(key_id)
    if not ok:
        raise HTTPException(status_code=404, detail="API key not found or already revoked")
    return {"success": True}


@app.get("/api/admin/stats/usage")
async def admin_usage_stats(
    api_key_id: Optional[int] = None,
    period: str = "day",
    _: bool = Depends(_require_admin)
):
    if period not in {"day", "week", "month"}:
        raise HTTPException(status_code=400, detail="Invalid period. Use day, week, or month")
    return get_usage_stats(api_key_id, period)


@app.get("/api/admin/stats/dashboard")
async def admin_dashboard(_: bool = Depends(_require_admin)):
    return get_dashboard_stats()


@app.put("/api/admin/rate-limit")
async def admin_update_rate_limit(req: UpdateRateLimitRequest, _: bool = Depends(_require_admin)):
    ok = update_rate_limit(req.api_key_id, req.requests_per_minute)
    if not ok:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"success": True, "api_key_id": req.api_key_id, "requests_per_minute": req.requests_per_minute}


@app.get("/api/versions")
async def list_versions(page: int = 1, page_size: int = 20):
    if page < 1:
        page = 1
    if page_size < 1 or page_size > 100:
        page_size = 20
    return get_versions(page, page_size)


@app.get("/api/versions/{version_id}")
async def get_version_detail(version_id: int):
    version = get_version(version_id)
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")
    return version


@app.get("/api/versions/{version_id}/content")
async def get_version_full_content(version_id: int):
    try:
        return get_version_content(version_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/versions/compare")
async def compare_two_versions(payload: CompareVersionsPayload):
    try:
        return compare_versions(payload.version_a_id, payload.version_b_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/versions")
async def create_new_version(payload: CreateVersionPayload):
    try:
        return create_version(
            text=payload.text,
            operation_type=payload.operation_type,
            ai_score=payload.ai_score or 0.0,
            previous_version_id=payload.previous_version_id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/versions/{version_id}")
async def delete_version_endpoint(version_id: int):
    ok = delete_version(version_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"success": True}


@app.post("/api/versions/tags")
async def add_version_tag(payload: AddTagPayload):
    try:
        return add_tag(payload.version_id, payload.tag_name, payload.tag_color or "#6366f1")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/versions/tags/{tag_id}")
async def remove_version_tag(tag_id: int):
    ok = remove_tag(tag_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"success": True}


@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": time.time()}


class ExportMetadataPayload(BaseModel):
    metadata: dict
    format: str = "bibtex"


@app.post("/api/paper-metadata/extract")
async def extract_paper_metadata_endpoint(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    content = await file.read()
    try:
        metadata = extract_paper_metadata(content)
        return {
            "filename": file.filename,
            "metadata": metadata
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract metadata: {str(e)}")


@app.post("/api/paper-metadata/export")
async def export_paper_metadata_endpoint(payload: ExportMetadataPayload):
    if not payload.metadata:
        raise HTTPException(status_code=400, detail="No metadata provided")
    fmt = payload.format.lower()
    if fmt not in {"bibtex", "ris"}:
        raise HTTPException(status_code=400, detail="Unsupported format. Use 'bibtex' or 'ris'.")
    try:
        if fmt == "bibtex":
            output = export_bibtex(payload.metadata)
        else:
            output = export_ris(payload.metadata)
        return {
            "format": fmt,
            "content": output
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export: {str(e)}")


class DeleteNotificationsRequest(BaseModel):
    notification_ids: List[int] = []


@app.get("/api/notifications/types")
async def list_notification_types():
    return {
        "types": [
            {"key": k, "label": v} for k, v in NOTIFICATION_TYPES.items()
        ]
    }


@app.get("/api/notifications")
async def list_notifications(
    page: int = 1,
    page_size: int = 20,
    type: Optional[str] = None,
    is_read: Optional[str] = None
):
    is_read_bool = None
    if is_read is not None:
        is_read_bool = is_read.lower() in ("true", "1", "yes")
    return get_notifications(page=page, page_size=page_size, type=type, is_read=is_read_bool)


@app.get("/api/notifications/{notification_id}")
async def get_single_notification(notification_id: int):
    notification = get_notification(notification_id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@app.post("/api/notifications")
async def create_new_notification(req: CreateNotificationRequest):
    try:
        return create_notification(
            type=req.type,
            title=req.title,
            content=req.content or "",
            metadata=req.metadata or {}
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/notifications/unread/count")
async def get_unread_notification_count():
    return {"count": get_unread_count()}


@app.post("/api/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: int):
    ok = mark_as_read(notification_id)
    if not ok:
        notification = get_notification(notification_id)
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@app.post("/api/notifications/read/all")
async def mark_all_notifications_read(type: Optional[str] = None):
    count = mark_all_as_read(type)
    return {"success": True, "marked_count": count}


@app.post("/api/notifications/read/multiple")
async def mark_multiple_notifications_read(req: MarkReadRequest):
    ids = req.notification_ids or []
    count = mark_multiple_as_read(ids)
    return {"success": True, "marked_count": count}


@app.delete("/api/notifications/{notification_id}")
async def delete_single_notification(notification_id: int):
    ok = delete_notification(notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@app.post("/api/notifications/delete/multiple")
async def delete_batch_notifications(req: DeleteNotificationsRequest):
    count = delete_multiple_notifications(req.notification_ids or [])
    return {"success": True, "deleted_count": count}


@app.get("/api/notifications/stats/summary")
async def get_notifications_stats():
    return get_notification_stats()


@app.get("/api/operation-logs/types")
async def list_operation_types():
    return {
        "types": [
            {"key": k, "label": v} for k, v in OPERATION_TYPES.items()
        ]
    }


@app.post("/api/operation-logs")
async def create_operation_log(req: LogOperationRequest):
    return log_operation(
        operation_type=req.operation_type,
        description=req.description or "",
        status=req.status or "success",
        details=req.details or {},
        user_id=req.user_id or "anonymous",
        session_id=req.session_id,
        duration_ms=req.duration_ms or 0
    )


@app.get("/api/operation-logs")
async def list_operation_logs(
    page: int = 1,
    page_size: int = 20,
    operation_type: Optional[str] = None,
    status: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    user_id: Optional[str] = None
):
    return get_operation_logs(
        page=page,
        page_size=page_size,
        operation_type=operation_type,
        status=status,
        start_time=start_time,
        end_time=end_time,
        user_id=user_id
    )


@app.get("/api/operation-logs/{log_id}")
async def get_single_operation_log(log_id: int):
    log = get_operation_log(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Operation log not found")
    return log


@app.get("/api/operation-logs/stats/summary")
async def get_operation_stats(
    start_time: Optional[str] = None,
    end_time: Optional[str] = None
):
    return get_operation_log_stats(start_time=start_time, end_time=end_time)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8417)
