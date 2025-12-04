import io
import logging
import os
import asyncio
from typing import Any, Dict, List

import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from paddleocr import PaddleOCR
from PIL import Image

# 로깅 설정
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()

# [보안 1] 파일 크기 제한 설정 (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 운영 시 특정 도메인으로 변경 권장
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static 파일 서빙
app.mount("/static", StaticFiles(directory="static"), name="static")

# 동시 처리 제한
OCR_LIMIT = int(os.getenv("OCR_LIMIT", 2))
ocr_semaphore = asyncio.Semaphore(OCR_LIMIT)
ocr_execution_lock = asyncio.Lock()

logger.info(f"Server initialized with MAX_CONCURRENT_OCR = {OCR_LIMIT}")


# --- PaddleOCR 설정 ---
SUPPORTED_LANGS = {
    "korean": "한국어",
    "en": "영어",
    "ch": "중국어",
    "japan": "일본어",
}

ocr_models: Dict[str, PaddleOCR] = {}

def get_ocr(lang: str) -> PaddleOCR:
    if lang not in SUPPORTED_LANGS:
        lang = "korean"
    
    if lang not in ocr_models:
        logger.info(f"Loading PaddleOCR model for lang='{lang}'...")
        ocr_models[lang] = PaddleOCR(lang=lang, use_angle_cls=True, show_log=False)
    return ocr_models[lang]

def flatten_paddle_result(result: Any) -> List[Dict[str, Any]]:
    lines: List[Dict[str, Any]] = []
    if not result:
        return lines

    if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
        data = result[0]
        texts = data.get('rec_texts', [])
        scores = data.get('rec_scores', [])
        boxes = data.get('dt_polys', []) 
        
        for i, text in enumerate(texts):
            try:
                score = scores[i] if i < len(scores) else 0.0
                box = boxes[i] if i < len(boxes) else []
                if hasattr(box, 'tolist'):
                    box = box.tolist()

                lines.append({
                    "text": text,
                    "confidence": round(float(score), 4),
                    "bbox": box,
                })
            except Exception as e:
                logger.warning(f"Error parsing item: {e}") # 로그에는 남김
                continue
        return lines

    for img_result in result:
        if not img_result or isinstance(img_result, dict):
             continue
        for line in img_result:
            try:
                bbox, (text, conf) = line
                lines.append({
                    "text": text,
                    "confidence": float(conf),
                    "bbox": bbox,
                })
            except Exception:
                continue
    return lines


@app.get("/", include_in_schema=False)
def root():
    return FileResponse("static/index.html")


@app.post("/api/ocr_region")
async def api_ocr_region(
    image: UploadFile = File(...),
    x: int = Form(...),
    y: int = Form(...),
    w: int = Form(...),
    h: int = Form(...),
    lang: str = Form("korean"),
):
    try:
        # [보안 1] 파일 크기 제한 검사
        # 1. Content-Length 헤더 확인 (빠른 거절)
        if image.size and image.size > MAX_FILE_SIZE:
             raise HTTPException(status_code=413, detail="File too large (Max 10MB)")
        
        # 2. 실제 읽으면서 크기 확인 (헤더 조작 방지)
        image_bytes = await image.read()
        if len(image_bytes) > MAX_FILE_SIZE:
             raise HTTPException(status_code=413, detail="File too large (Max 10MB)")

        # PIL 이미지 로드
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        width, height = img.size

        # 좌표 유효성 검사
        x0 = max(0, min(x, width))
        y0 = max(0, min(y, height))
        x1 = max(0, min(x + w, width))
        y1 = max(0, min(y + h, height))

        if x1 <= x0 or y1 <= y0:
            return JSONResponse(status_code=400, content={"error": "Invalid region"})

        crop = img.crop((x0, y0, x1, y1))
        crop_np = np.array(crop)
        
        ocr = get_ocr(lang)

        async with ocr_semaphore:
            async with ocr_execution_lock:
                logger.info("Starting OCR processing...")
                result = await run_in_threadpool(ocr.ocr, crop_np)
                logger.info("OCR processing finished.")

        lines = flatten_paddle_result(result)
        full_text = "\n".join(line["text"] for line in lines)

        return {
            "lang": lang,
            "full_text": full_text,
            "lines": lines,
            "region": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0},
        }

    except HTTPException as he:
        # HTTP 예외는 그대로 전달 (413 Payload Too Large 등)
        raise he
    except Exception as e:
        # [보안 2] 에러 메시지 숨기기
        # 실제 에러는 서버 로그에만 기록
        logger.exception("Internal Server Error during OCR")
        
        # 사용자에게는 일반적인 메시지만 반환
        return JSONResponse(
            status_code=500,
            content={"error": "Internal Server Error. Please try again later."}
        )