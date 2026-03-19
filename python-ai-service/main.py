import os
import base64
import json
import tempfile
import re
import asyncio
from pathlib import Path
from typing import Literal, AsyncGenerator

import cv2
from PIL import Image
import io

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="AgriConnect AI Vision Service", version="2.0.0")

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3001").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# ── Helpers ───────────────────────────────────────────────────────────────────

def image_to_base64(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"


def extract_frames_from_video(
    video_bytes: bytes, max_frames: int = 5
) -> list[tuple[bytes, float]]:
    """
    Extract evenly-spaced frames from a video.
    Returns list of (jpeg_bytes, timestamp_seconds).
    """
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    frames = []
    try:
        cap = cv2.VideoCapture(tmp_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        if total_frames == 0:
            raise ValueError("Could not read video frames")

        indices = sorted(set([int(i * total_frames / max_frames) for i in range(max_frames)]))
        frame_idx = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx in indices:
                _, buf = cv2.imencode(".jpg", frame)
                ts = frame_idx / fps
                frames.append((buf.tobytes(), round(ts, 2)))
            frame_idx += 1
        cap.release()
    finally:
        os.unlink(tmp_path)

    return frames


def get_video_duration(video_bytes: bytes) -> float:
    """Return video duration in seconds."""
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name
    try:
        cap = cv2.VideoCapture(tmp_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        cap.release()
        return round(total_frames / fps, 2)
    finally:
        os.unlink(tmp_path)


def resize_image(image_bytes: bytes, max_dimension: int = 1024) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = img.size
    if max(w, h) > max_dimension:
        scale = max_dimension / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def call_groq_vision(prompt: str, image_data_urls: list[str]) -> str:
    content = []
    for url in image_data_urls:
        content.append({"type": "image_url", "image_url": {"url": url}})
    content.append({"type": "text", "text": prompt})

    response = groq_client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert agricultural scientist. "
                    "Always respond with valid JSON only — no markdown, no backticks."
                ),
            },
            {"role": "user", "content": content},
        ],
        temperature=0.2,
        max_tokens=1500,
    )
    return response.choices[0].message.content or ""


def parse_json_response(raw: str) -> dict:
    cleaned = re.sub(r"```json|```", "", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError("Could not parse AI response as JSON")


# ── Prompts ───────────────────────────────────────────────────────────────────

FRAME_QUICK_PROMPT = """
Look at this single frame from a crop video. Identify:
1. What crop is visible (if any)
2. Any immediately visible issues (disease spots, discoloration, pest damage, wilting)
3. Overall appearance (healthy / concerning / critical)

Respond ONLY with JSON:
{
  "crop_identified": "string or null",
  "status": "healthy|concerning|critical|unclear",
  "observations": ["observation1", "observation2"],
  "confidence": number (0-100)
}
"""

DISEASE_FULL_PROMPT = """
Analyze all provided crop frames comprehensively for disease and health assessment.

Respond ONLY with this exact JSON structure:
{
  "crop_identified": "string",
  "is_healthy": boolean,
  "conditions": [
    {
      "name": "string",
      "type": "disease|pest|deficiency|fungal|bacterial|viral|other",
      "severity": "mild|moderate|severe",
      "symptoms_observed": ["symptom1"],
      "affected_area_percent": number,
      "confidence": number
    }
  ],
  "remedies": [
    {
      "condition": "string",
      "remedy_type": "chemical|biological|cultural|organic",
      "treatment": "string",
      "dosage": "string",
      "timing": "string",
      "estimated_cost_inr": "string",
      "effectiveness": "high|medium|low"
    }
  ],
  "preventive_measures": ["measure1"],
  "urgency": "immediate|within_week|monitor|none",
  "overall_assessment": "string"
}
"""

GRADE_FULL_PROMPT = """
Analyze all provided crop frames comprehensively for quality grading.

Respond ONLY with this exact JSON structure:
{
  "crop_identified": "string",
  "grade": "A|B|C|D",
  "grade_label": "string",
  "score": number,
  "assessment": {
    "color": { "rating": "excellent|good|fair|poor", "notes": "string" },
    "size_uniformity": { "rating": "excellent|good|fair|poor", "notes": "string" },
    "surface_quality": { "rating": "excellent|good|fair|poor", "notes": "string" },
    "ripeness": { "rating": "optimal|early|overripe|variable", "notes": "string" },
    "defects": { "present": boolean, "description": "string", "severity": "none|minor|moderate|major" }
  },
  "price_range": {
    "min_inr_per_kg": number,
    "max_inr_per_kg": number,
    "market_type": "string",
    "basis": "string"
  },
  "marketability": {
    "export_suitable": boolean,
    "wholesale_suitable": boolean,
    "retail_suitable": boolean,
    "processing_suitable": boolean
  },
  "improvement_suggestions": ["suggestion1"],
  "overall_assessment": "string"
}
"""


# ── SSE helper ────────────────────────────────────────────────────────────────

def sse_event(event: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# ── Streaming analysis generator ──────────────────────────────────────────────

async def stream_analysis(
    file_bytes: bytes,
    filename: str,
    content_type: str,
    mode: str,
) -> AsyncGenerator[str, None]:
    """
    Generator that yields SSE events:
      - progress  : scanning status updates
      - frame     : per-frame quick result
      - final     : complete analysis result
      - error     : if something fails
    """
    is_video = (
        content_type.startswith("video/")
        or filename.lower().endswith((".mp4", ".mov", ".avi", ".mkv", ".webm"))
    )

    try:
        # ── Step 1: Notify start ─────────────────────────────────────────────
        yield sse_event("progress", {
            "stage": "loading",
            "message": "Loading your file…",
            "percent": 5,
        })
        await asyncio.sleep(0.1)

        # ── Step 2: Extract frames ───────────────────────────────────────────
        if is_video:
            yield sse_event("progress", {
                "stage": "extracting",
                "message": "Extracting key frames from video…",
                "percent": 15,
            })
            await asyncio.sleep(0.1)

            try:
                duration = get_video_duration(file_bytes)
                frames_with_ts = extract_frames_from_video(file_bytes, max_frames=5)
            except Exception as e:
                yield sse_event("error", {"message": f"Could not process video: {str(e)}"})
                return

            yield sse_event("progress", {
                "stage": "extracting",
                "message": f"Extracted {len(frames_with_ts)} frames from {duration:.1f}s video",
                "percent": 25,
                "duration": duration,
                "frame_count": len(frames_with_ts),
            })
        else:
            # Single image — treat as one "frame" at ts=0
            try:
                resized = resize_image(file_bytes)
                frames_with_ts = [(resized, 0.0)]
            except Exception as e:
                yield sse_event("error", {"message": f"Could not process image: {str(e)}"})
                return

            yield sse_event("progress", {
                "stage": "extracting",
                "message": "Image loaded, starting analysis…",
                "percent": 25,
                "frame_count": 1,
            })

        await asyncio.sleep(0.2)

        # ── Step 3: Quick per-frame scan ─────────────────────────────────────
        all_data_urls = []
        frame_results = []
        total = len(frames_with_ts)

        for i, (frame_bytes, ts) in enumerate(frames_with_ts):
            resized = resize_image(frame_bytes)
            data_url = image_to_base64(resized)
            all_data_urls.append(data_url)

            pct = 25 + int((i / total) * 40)
            yield sse_event("progress", {
                "stage": "scanning",
                "message": f"Scanning frame {i+1} of {total}…",
                "percent": pct,
                "current_frame": i + 1,
                "total_frames": total,
                "timestamp": ts,
            })

            # Quick per-frame analysis
            try:
                raw = call_groq_vision(FRAME_QUICK_PROMPT, [data_url])
                frame_data = parse_json_response(raw)
            except Exception:
                frame_data = {
                    "crop_identified": None,
                    "status": "unclear",
                    "observations": [],
                    "confidence": 0,
                }

            frame_results.append({
                "frame_index": i,
                "timestamp": ts,
                **frame_data,
            })

            yield sse_event("frame", {
                "frame_index": i,
                "timestamp": ts,
                "total_frames": total,
                **frame_data,
            })

            await asyncio.sleep(0.05)

        # ── Step 4: Full comprehensive analysis ──────────────────────────────
        yield sse_event("progress", {
            "stage": "analyzing",
            "message": "Running comprehensive AI analysis…",
            "percent": 70,
        })
        await asyncio.sleep(0.1)

        full_prompt = DISEASE_FULL_PROMPT if mode == "disease" else GRADE_FULL_PROMPT

        try:
            raw_full = call_groq_vision(full_prompt, all_data_urls[:5])
            full_result = parse_json_response(raw_full)
        except Exception as e:
            yield sse_event("error", {"message": f"AI analysis failed: {str(e)}"})
            return

        yield sse_event("progress", {
            "stage": "complete",
            "message": "Analysis complete!",
            "percent": 100,
        })
        await asyncio.sleep(0.1)

        # ── Step 5: Emit final result ────────────────────────────────────────
        yield sse_event("final", {
            "mode": mode,
            "file_type": "video" if is_video else "image",
            "frames_analyzed": total,
            "frame_results": frame_results,
            "result": full_result,
        })

    except Exception as e:
        yield sse_event("error", {"message": f"Unexpected error: {str(e)}"})


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "AgriConnect AI Vision v2"}


@app.post("/analyze/stream")
async def analyze_stream(
    file: UploadFile = File(...),
    mode: str = Form(...),
):
    """Streaming SSE endpoint — yields real-time analysis events."""
    if mode not in ("disease", "grade"):
        raise HTTPException(status_code=400, detail="mode must be 'disease' or 'grade'")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    return StreamingResponse(
        stream_analysis(file_bytes, file.filename or "", file.content_type or "", mode),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# Keep the original non-streaming endpoint as fallback
@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    mode: str = Form(...),
):
    """Non-streaming analysis — single response."""
    file_bytes = await file.read()
    content_type = file.content_type or ""
    is_video = (
        content_type.startswith("video/")
        or (file.filename or "").lower().endswith((".mp4", ".mov", ".avi", ".mkv", ".webm"))
    )

    if is_video:
        frames_with_ts = extract_frames_from_video(file_bytes, max_frames=5)
        data_urls = [image_to_base64(resize_image(f)) for f, _ in frames_with_ts]
    else:
        resized = resize_image(file_bytes)
        data_urls = [image_to_base64(resized, content_type if content_type.startswith("image/") else "image/jpeg")]

    prompt = DISEASE_FULL_PROMPT if mode == "disease" else GRADE_FULL_PROMPT
    raw = call_groq_vision(prompt, data_urls[:5])
    result = parse_json_response(raw)

    return {
        "mode": mode,
        "file_type": "video" if is_video else "image",
        "frames_analyzed": len(data_urls),
        "result": result,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)