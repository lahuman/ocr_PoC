# OCR Region Select Service (PoC)

[![Live Demo](https://img.shields.io/badge/Live%20Demo-ocr2go.duckdns.org-blue?style=for-the-badge&logo=firefox)](https://ocr2go.duckdns.org/)

FastAPI와 PaddleOCR을 활용한 **영역 선택 기반 텍스트 추출(OCR) 서비스**입니다.
사용자가 이미지 내에서 특정 영역을 드래그하여 선택하면, 해당 좌표의 이미지를 서버에서 크롭(Crop)한 후 텍스트를 인식하여 반환합니다.

## ✨ 주요 기능

* **영역 지정 OCR**: 전체 이미지가 아닌, 사용자가 지정한(x, y, w, h) 영역만 정밀하게 인식합니다.
* **다국어 지원**: 한국어, 영어, 중국어, 일본어 인식을 지원합니다.
* **직관적인 UI/UX**:
  * **드래그 앤 드롭**: 이미지를 캔버스에 끌어다 놓아 바로 업로드할 수 있습니다.
  * **반응형 디자인**: PC와 모바일 환경에 최적화된 레이아웃을 제공합니다.
  * **대기 안내**: 분석 중 지루하지 않도록 재미있는 로딩 문구를 보여줍니다.
* **보안 강화**:
  * **업로드 제한**: 10MB 이상의 파일 업로드를 차단하여 서버 자원을 보호합니다.
  * **에러 은닉**: 내부 서버 에러 메시지를 숨겨 보안성을 높였습니다.
* **Docker 지원**: 복잡한 설정 없이 Docker 컨테이너로 즉시 실행 가능합니다 (ARM64/Raspberry Pi 호환).

---

## 🛠 기술 스택 (Tech Stack)

* **Language**: Python 3.10
* **Framework**: FastAPI (Asynchronous Web Framework)
* **OCR Engine**: PaddleOCR (v2.7+ / Pipeline 구조 호환)
* **Frontend**: Vanilla JS + HTML5 Canvas
* **Deploy**: Docker

---

## 🚀 설치 및 실행 가이드 (Local)

### 1. 사전 요구 사항
* Python 3.8 ~ 3.10 (3.12는 호환성 이슈가 있을 수 있음)
* `git`

### 2. 프로젝트 클론
```bash
git clone https://github.com/lahuman/ocr_PoC.git
cd ocr_PoC
```

### 3. 가상환경 생성 및 패키지 설치
PaddleOCR과 의존성 충돌 방지를 위해 **가상환경 사용을 권장**합니다.

```bash
# 가상환경 생성
python -m venv venv

# 가상환경 활성화 (Mac/Linux)
source venv/bin/activate
# 가상환경 활성화 (Windows)
venv\Scripts\activate

# 패키지 설치
pip install -r requirements.txt
```

> **⚠️ 주의 (Dependency)**: `requirements.txt`에는 호환성을 위해 다음 버전이 고정되어 있습니다.
> * `numpy<2.0.0`
> * `paddleocr==2.7.3`
> * `paddlepaddle==2.6.2`

### 4. 서버 실행
**Mac(macOS) 사용자**는 라이브러리 충돌 방지를 위해 환경변수 설정이 필요할 수 있습니다.

```bash
# (옵션) Mac 사용자 OpenMP 충돌 방지
export KMP_DUPLICATE_LIB_OK=TRUE

# 서버 실행 (기본 포트: 8000)
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

### 5. 테스트
브라우저에서 [http://localhost:8000](http://localhost:8000) 으로 접속하여 테스트 페이지를 확인하세요.

---

## 🐳 Docker로 실행하기

로컬 환경 설정이 번거롭거나 라즈베리파이(ARM64) 환경이라면 Docker를 사용하세요.

```bash
# 1. 이미지 빌드
docker build -t ocr-poc .

# 2. 컨테이너 실행
# -d: 백그라운드 실행
# -p: 포트 연결 (호스트:컨테이너)
docker run -d -p 8000:8000 --name ocr-server ocr-poc
```
실행 후 [http://localhost:8000](http://localhost:8000) 접속.

---

## 📡 API 명세

### `POST /api/ocr_region`

이미지의 특정 영역을 잘라내어 OCR을 수행합니다.

**Request (Multipart/Form-Data)**

| Key | Type | Description | 제한 사항 |
| :--- | :--- | :--- | :--- |
| `image` | File | 업로드할 이미지 파일 | **Max 10MB** (jpg, png 등) |
| `x` | Integer | 선택 영역의 시작 X 좌표 | |
| `y` | Integer | 선택 영역의 시작 Y 좌표 | |
| `w` | Integer | 선택 영역의 너비 (Width) | |
| `h` | Integer | 선택 영역의 높이 (Height) | |
| `lang` | String | 언어 코드 | `korean`, `en`, `ch`, `japan` |

**Response (JSON)**

```json
{
  "lang": "korean",
  "full_text": "인식된 전체 텍스트 내용\n두 번째 줄",
  "lines": [
    {
      "text": "인식된 텍스트",
      "confidence": 0.9876,
      "bbox": [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
    }
  ],
  "region": {
    "x": 100, "y": 200, "w": 300, "h": 50
  }
}
```

**Error Response**
* `413 Payload Too Large`: 파일 크기가 10MB를 초과한 경우
* `500 Internal Server Error`: 서버 내부 오류 (보안을 위해 상세 내용은 숨겨짐)

---

## ⚠️ 트러블슈팅 (Troubleshooting)

### 1. `OMP: Error #15: Initializing libiomp5.dylib`
* **원인**: Mac 환경에서 OpenMP 라이브러리가 중복 로드되어 발생.
* **해결**: 터미널에서 `export KMP_DUPLICATE_LIB_OK=TRUE` 실행 후 서버 재시작.

### 2. 결과값이 비어있음
* **원인**: PaddleOCR v2.7+ 파이프라인 버전의 반환값 구조 차이.
* **해결**: `server.py`의 `flatten_paddle_result` 함수가 최신 구조를 처리하도록 구현되어 있습니다.

---

## 📂 프로젝트 구조

```
.
├── Dockerfile              # Docker 빌드 설정 (Linux/ARM64 지원)
├── README.md               # 프로젝트 설명서
├── requirements.txt        # 의존성 패키지 목록
├── server.py               # FastAPI 서버 (보안/설정 적용)
└── static/
    ├── index.html          # 웹 UI (반응형, 드래그앤드롭)
    └── script.js           # 프론트엔드 로직
```
