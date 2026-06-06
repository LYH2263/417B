from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

try:
    from app.parser import extract_text
    from app.detector import detect_ai_content
    from app.rewriter import rewrite_text
    from app.continuation import generate_continuations, generate_continuations_stream
    from app.rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions
except ImportError:
    try:
        from .parser import extract_text
        from .detector import detect_ai_content
        from .rewriter import rewrite_text
        from .continuation import generate_continuations, generate_continuations_stream
        from .rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions
    except ImportError:
        from parser import extract_text
        from detector import detect_ai_content
        from rewriter import rewrite_text
        from continuation import generate_continuations, generate_continuations_stream
        from rating import RatingSubmit, submit_rating, get_statistics, generate_suggestions

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

@app.post("/api/rewrite")
async def rewrite(payload: RewritePayload):
    if not payload.text:
        raise HTTPException(status_code=400, detail="No text provided")
    
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
    result = detect_ai_content(payload.text)
    return result

@app.post("/api/detect-file")
async def detect_file(file: UploadFile = File(...)):
    content = await file.read()
    try:
        text = extract_text(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8417)
