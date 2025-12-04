# tasks.py
import os
import numpy as np
from celery import Celery
from paddleocr import PaddleOCR
from PIL import Image
import io
import base64

# Redis 연결 설정 (Docker 환경 기준)
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

app = Celery("ocr_tasks", broker=REDIS_URL, backend=REDIS_URL)

# PaddleOCR 모델 로드 (워커 프로세스 시작 시 한 번만 로드)
ocr_model = PaddleOCR(lang="korean", use_angle_cls=True, show_log=False)

@app.task(bind=True)
def run_ocr_task(self, image_data_b64, x, y, w, h):
    """
    OCR 작업을 비동기로 수행하는 Celery Task
    """
    try:
        # Base64 디코딩
        image_bytes = base64.b64decode(image_data_b64)
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        
        # 좌표 보정 및 Crop
        width, height = img.size
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(x + w, width), min(y + h, height)
        
        crop = img.crop((x0, y0, x1, y1))
        crop_np = np.array(crop)

        # OCR 실행
        result = ocr_model.ocr(crop_np, cls=True)
        
        # 결과 파싱 (flatten_paddle_result 로직 내장)
        lines = []
        if result and isinstance(result, list) and len(result) > 0:
            data = result[0]
            if isinstance(data, list): # 구버전 호환
                 for line in data:
                    lines.append({
                        "text": line[1][0],
                        "confidence": float(line[1][1]),
                        "bbox": line[0]
                    })
            elif isinstance(data, dict): # 신버전 Pipeline
                texts = data.get('rec_texts', [])
                scores = data.get('rec_scores', [])
                boxes = data.get('dt_polys', [])
                for i, text in enumerate(texts):
                    lines.append({
                        "text": text,
                        "confidence": float(scores[i]) if i < len(scores) else 0.0,
                        "bbox": boxes[i].tolist() if hasattr(boxes[i], 'tolist') else boxes[i]
                    })

        full_text = "\n".join([line['text'] for line in lines])
        
        return {
            "status": "completed",
            "full_text": full_text,
            "lines": lines
        }

    except Exception as e:
        return {"status": "failed", "error": str(e)}