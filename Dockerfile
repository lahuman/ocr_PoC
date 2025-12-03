# 라즈베리파이는 python:3.10-slim (Debian Bullseye/Bookworm 기반) 사용 권장
FROM python:3.10-slim

# 메모리/캐시 최적화 환경변수
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    # PaddleOCR 병렬 처리 관련 경고 방지
    OMP_NUM_THREADS=1

WORKDIR /app

# 시스템 패키지 설치
# libgomp1: PaddlePaddle 구동 필수
# libglib2.0-0, libsm6, libxrender1: OpenCV 구동 필수
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 패키지 설치
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 코드 복사
COPY server.py .
COPY static ./static

# 서버 실행
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]