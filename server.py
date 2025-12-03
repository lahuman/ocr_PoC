import io
import logging
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from paddleocr import PaddleOCR
from PIL import Image

# 로깅 설정
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static 파일 서빙
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", include_in_schema=False)
def root():
    return FileResponse("static/index.html")


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
        # 수정됨: show_log 파라미터 삭제
        ocr_models[lang] = PaddleOCR(
            lang=lang,
            use_angle_cls=True
        )
    return ocr_models[lang]


def flatten_paddle_result(result: Any) -> List[Dict[str, Any]]:
    """
    PaddleOCR 최신 버전(Pipeline 구조)의 딕셔너리 형태 결과를 파싱합니다.
    """
    lines: List[Dict[str, Any]] = []
    
    if not result:
        return lines

    # result가 리스트이고, 첫 번째 요소가 딕셔너리인 경우 (최신 버전 포맷)
    # 포맷 예: [{'rec_texts': ['글자1', '글자2'], 'rec_scores': [0.99, 0.88], 'dt_polys': [numpy_array, ...]}]
    if isinstance(result, list) and len(result) > 0 and isinstance(result[0], dict):
        data = result[0]
        
        texts = data.get('rec_texts', [])
        scores = data.get('rec_scores', [])
        # 'dt_polys'가 텍스트 박스 좌표입니다. (없으면 'rec_polys' 확인)
        boxes = data.get('dt_polys', []) 
        
        # 텍스트, 점수, 박스 리스트를 순서대로 묶어서 처리
        for i, text in enumerate(texts):
            try:
                score = scores[i] if i < len(scores) else 0.0
                box = boxes[i] if i < len(boxes) else []

                # Numpy Array를 리스트로 변환 (JSON 직렬화 오류 방지)
                if hasattr(box, 'tolist'):
                    box = box.tolist()

                lines.append({
                    "text": text,
                    "confidence": round(float(score), 4),
                    "bbox": box,
                })
            except Exception as e:
                logger.warning(f"Error parsing item index {i}: {e}")
                continue
                
        return lines

    # (혹시 모를 구버전 호환용) 기존 리스트-오브-리스트 구조 처리
    for img_result in result:
        if not img_result:
            continue
        if isinstance(img_result, dict): # 구조가 섞여있을 경우 대비
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

@app.post("/api/ocr_region")
def api_ocr_region(
    image: UploadFile = File(...),
    x: int = Form(...),
    y: int = Form(...),
    w: int = Form(...),
    h: int = Form(...),
    lang: str = Form("korean"),
):
    """
    NOTE: PaddleOCR은 CPU Bound 작업이므로 async def가 아닌 def를 사용합니다.
    FastAPI는 일반 def 함수를 별도 스레드풀에서 실행하여 메인 루프 블로킹을 방지합니다.
    """
    try:
        # 이미지 읽기
        image_bytes = image.file.read()
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        width, height = img.size

        # 좌표 유효성 검사 및 보정
        x0 = max(0, min(x, width))
        y0 = max(0, min(y, height))
        x1 = max(0, min(x + w, width))
        y1 = max(0, min(y + h, height))

        if x1 <= x0 or y1 <= y0:
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid region: w={x1-x0}, h={y1-y0}"}
            )

        # 크롭 및 Numpy 변환
        crop = img.crop((x0, y0, x1, y1))
        crop_np = np.array(crop)

        # OCR 실행
        ocr = get_ocr(lang)
        
        # cls=True 등 옵션은 필요에 따라 조정
        result = ocr.ocr(crop_np)
        
        # # [디버깅용 로그 추가] ----------------------------
        # print("=== DEBUG: OCR RAW RESULT ===")
        # print(f"Type: {type(result)}")
        # print(f"Data: {result}")
        # # -----------------------------------------------
        
        lines = flatten_paddle_result(result)
        full_text = "\n".join(line["text"] for line in lines)

        return {
            "lang": lang,
            "full_text": full_text,
            "lines": lines,
            "region": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0},
        }

    except Exception as e:
        logger.exception("OCR Processing Failed")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )