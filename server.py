# server.py
import os
import base64
import logging
import sentry_sdk
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from celery.result import AsyncResult
from tasks import run_ocr_task  # 분리된 Task 임포트

# 1. [운영] Sentry 모니터링 설정 (환경변수로 DSN 관리)
if os.getenv("SENTRY_DSN"):
    sentry_sdk.init(dsn=os.getenv("SENTRY_DSN"), traces_sample_rate=1.0)

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("OCR_API")

app = FastAPI(title="OCR Service Pro", version="1.0.0")

# 2. [보안] CORS: 실제 운영 시에는 구체적인 도메인으로 제한 권장
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 배포 시 ["https://mydomain.com"] 등으로 변경
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

# 3. [운영] 헬스 체크 엔드포인트 (로드밸런서용)
@app.get("/health")
def health_check():
    return {"status": "ok", "worker": "connected" if run_ocr_task else "unknown"}

# 4. [보안] 파일 크기 제한 상수 (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024 

@app.post("/api/ocr_region")
async def request_ocr(
    image: UploadFile = File(...),
    x: int = Form(...), y: int = Form(...),
    w: int = Form(...), h: int = Form(...),
    lang: str = Form("korean")
):
    # [보안] 파일 크기 검증
    image.file.seek(0, 2)
    file_size = image.file.tell()
    image.file.seek(0)
    
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (Max 10MB)")

    # 이미지 읽기 (메모리 처리 - 저장 안 함)
    contents = await image.read()
    
    # Celery로 넘기기 위해 Base64 인코딩
    image_b64 = base64.b64encode(contents).decode('utf-8')

    # 5. [아키텍처] 작업 큐에 등록 (비동기)
    task = run_ocr_task.delay(image_b64, x, y, w, h)
    
    return {"task_id": task.id, "status": "processing"}

# 6. [아키텍처] 작업 상태 조회 (Polling용)
@app.get("/api/ocr_status/{task_id}")
def get_status(task_id: str):
    task_result = AsyncResult(task_id)
    
    if task_result.state == 'PENDING':
        return {"status": "processing"}
    elif task_result.state == 'SUCCESS':
        return task_result.result  # 결과 반환
    elif task_result.state == 'FAILURE':
        return {"status": "failed", "error": str(task_result.info)}
    
    return {"status": task_result.state}