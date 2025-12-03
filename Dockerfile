# 라즈베리파이 64bit OS 기준: python:3.10-slim 이미지는 arm64 지원
FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 필수 OS 패키지 설치
# - libglib2.0-0, libsm6, libxext6, libxrender1 : Pillow/OpenCV 등 이미지 처리 관련
# - libgomp1 : PaddleOCR/PaddlePaddle에서 필요
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# 파이썬 패키지 설치
COPY requirements.txt .

# (선택) 중국 Tsinghua 미러를 쓰면 Paddle 관련 설치가 더 안정적인 경우도 있음.
# 필요 없으면 -i 부분은 삭제해도 됩니다.
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

# 애플리케이션 코드 복사
COPY server.py .

COPY static ./static

# 컨테이너가 뜰 때 FastAPI 서버 실행
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]