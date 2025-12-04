# [변경] 라즈베리파이 아키텍처 명시 (선택사항이나 권장)
FROM --platform=linux/arm64 python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=1

WORKDIR /app

# [추가] build-essential은 이미 있지만, python3-dev, libatlas-base-dev 추가 필수
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    build-essential \
    gcc \
    g++ \
    python3-dev \
    libatlas-base-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# [팁] pip 업그레이드 및 설치 시간 단축을 위한 미러 사이트 활용 고려 가능
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY server.py .
COPY static ./static

# [변경] 메모리 절약을 위해 worker 수나 limit 관련 환경변수 주입 고려
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]