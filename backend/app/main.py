from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import json

try:
    from app.parser import extract_text
    from app.rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions
    from app.summarizer import summarize_paper
    from app.collab import room_manager
except ImportError:
    try:
        from .parser import extract_text
        from .rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions
        from .summarizer import summarize_paper
        from .collab import room_manager
    except ImportError:
        from parser import extract_text
        from rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions
        from summarizer import summarize_paper
        from collab import room_manager

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
        
        # If AI score is below 10%, we are done
        if detection_after["overall_ai_score"] < 10:
            break
            
    return {
        "original_text": payload.text,
        "rewritten_text": current_text,
        "detection_after": detection_after,
        "iterations": i + 1
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
    return result

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8417)
