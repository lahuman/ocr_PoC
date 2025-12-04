const API_BASE = "";

// DOM Elements
const imageInput = document.getElementById("imageInput");
const langSelect = document.getElementById("langSelect");
const canvas = document.getElementById("imageCanvas");
const canvasWrapper = document.getElementById("canvasWrapper");
const placeholder = document.getElementById("placeholder");
const runOcrButton = document.getElementById("runOcrButton");
const loadingSpinner = document.getElementById("loadingSpinner");
const statusMessage = document.getElementById("statusMessage");
const ocrText = document.getElementById("ocrText");
const ocrRaw = document.getElementById("ocrRaw");
const copyBtn = document.getElementById("copyBtn");

const ctx = canvas.getContext("2d");
// Elements
const inputGallery = document.getElementById("inputGallery");
const inputNativeCamera = document.getElementById("inputNativeCamera"); // 모바일용
const btnSmartCamera = document.getElementById("btnSmartCamera");

// Modal Elements
const cameraModal = document.getElementById("cameraModal");
const webcamVideo = document.getElementById("webcamVideo");
const btnSnap = document.getElementById("btnSnap");
const btnCloseCamera = document.getElementById("btnCloseCamera");

let mediaStream = null;

// 모바일 감지 (간이 체크)
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

if (inputGallery) inputGallery.addEventListener("change", handleFileSelect);
if (inputNativeCamera) inputNativeCamera.addEventListener("change", handleFileSelect);


// --- [PC 웹캠 로직] ---

// "카메라" 버튼 클릭 시 분기 처리
btnSmartCamera.addEventListener("click", () => {
    if (isMobileDevice()) {
        // 모바일이면: Native Input 클릭 (기본 카메라 앱 실행)
        inputNativeCamera.click();
    } else {
        // PC면: 웹캠 모달 열기
        openWebcamModal();
    }
});

async function openWebcamModal() {
    try {
        // PC 웹캠 요청 (Secure Context 필요)
        mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "environment" }
        });
        webcamVideo.srcObject = mediaStream;
        cameraModal.classList.add("active");
    } catch (err) {
        console.error(err);
        alert("카메라를 실행할 수 없습니다.\n(HTTPS 또는 localhost 환경인지 확인해주세요.)");
    }
}

function closeWebcamModal() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    cameraModal.classList.remove("active");
}

// 촬영 버튼 클릭
btnSnap.addEventListener("click", () => {
    if (!mediaStream) return;

    // 비디오 크기에 맞춰 캔버스 생성 후 캡처
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = webcamVideo.videoWidth;
    captureCanvas.height = webcamVideo.videoHeight;
    const ctx = captureCanvas.getContext("2d");

    // 현재 비디오 프레임 그리기
    ctx.drawImage(webcamVideo, 0, 0);

    // Blob(이미지 파일)으로 변환
    captureCanvas.toBlob((blob) => {
        // 가상의 File 객체 생성
        const file = new File([blob], "webcam_capture.jpg", { type: "image/jpeg" });
        processFile(file); // 공통 처리 함수 호출
        closeWebcamModal(); // 모달 닫기
    }, "image/jpeg", 0.95);
});


if (btnCloseCamera) {
    btnCloseCamera.addEventListener("click", closeWebcamModal);
}

// State
let currentImage = null;   // Image Object
let currentFile = null;    // File Object
let isDragging = false;
let startX = 0, startY = 0;
let selection = { x: 0, y: 0, w: 0, h: 0 };

// 1. 초기화 및 리셋
function resetState() {
    currentImage = null;
    currentFile = null;
    selection = { x: 0, y: 0, w: 0, h: 0 };
    isDragging = false;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'none';
    placeholder.style.display = 'block';

    runOcrButton.disabled = true;
    ocrText.textContent = "";
    ocrRaw.innerHTML = "";
    statusMessage.textContent = "";
}

// 2. 화면 그리기 (이미지 + 선택 영역)
function redraw() {
    if (!currentImage) return;

    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 원본 이미지 그리기
    ctx.drawImage(currentImage, 0, 0);

    // 선택 영역 그리기 (빨간 박스)
    if (selection.w > 0 && selection.h > 0) {
        ctx.save();
        ctx.strokeStyle = "#ef4444"; // Tailwind red-500
        ctx.lineWidth = Math.max(2, currentImage.width / 200); // 이미지 크기에 비례한 두께
        ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);

        ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
        ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
        ctx.restore();
    }
}

// 3. 좌표 계산 (화면상 좌표 -> 실제 이미지 좌표)
// 모바일/반응형에서는 캔버스가 CSS로 축소되어 보이므로 비율 계산이 필수
function getImgCoords(evt) {
    const rect = canvas.getBoundingClientRect();

    // 마우스 또는 터치 이벤트 좌표 확인
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;

    // 비율 계산 (실제 해상도 / 화면 표시 크기)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

// 4. 이벤트 핸들러 (마우스 + 터치 통합)
function handleStart(e) {
    if (!currentImage) return;
    e.preventDefault(); // 모바일 스크롤 방지
    isDragging = true;

    const coords = getImgCoords(e);
    startX = coords.x;
    startY = coords.y;
    selection = { x: startX, y: startY, w: 0, h: 0 };
    redraw();
}

function handleMove(e) {
    if (!isDragging || !currentImage) return;
    e.preventDefault();

    const coords = getImgCoords(e);
    const currentX = coords.x;
    const currentY = coords.y;

    // 너비, 높이 계산 (음수 처리)
    let w = currentX - startX;
    let h = currentY - startY;

    selection = {
        x: w >= 0 ? startX : currentX,
        y: h >= 0 ? startY : currentY,
        w: Math.abs(w),
        h: Math.abs(h)
    };
    redraw();
}

function handleEnd(e) {
    if (isDragging) {
        isDragging = false;
        // 너무 작은 영역(실수로 찍은 점 등)은 무시하거나 전체 선택으로 간주 가능
        // 여기서는 유지
    }
}

// 이벤트 리스너 등록 (PC Mouse + Mobile Touch)
canvas.addEventListener("mousedown", handleStart);
canvas.addEventListener("mousemove", handleMove);
canvas.addEventListener("mouseup", handleEnd);
canvas.addEventListener("mouseleave", handleEnd);

canvas.addEventListener("touchstart", handleStart, { passive: false });
canvas.addEventListener("touchmove", handleMove, { passive: false });
canvas.addEventListener("touchend", handleEnd);

// [수정 전] 기존 handleFileSelect 함수가 있던 자리...
// [수정 후] 아래와 같이 processFile 함수를 새로 만들고, handleFileSelect에서 이를 호출하도록 변경

// 1) 공통 이미지 처리 함수 (새로 추가)
function processFile(file) {
    if (!file) return;

    currentFile = file;
    const reader = new FileReader();

    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;

            // 캔버스 크기를 이미지 원본 크기로 맞춤
            canvas.width = img.width;
            canvas.height = img.height;

            canvas.style.display = 'block';
            placeholder.style.display = 'none';

            // 초기화: 선택 영역 없음
            selection = { x: 0, y: 0, w: 0, h: 0 };

            redraw();
            
            // 버튼 활성화 및 상태 초기화
            if (runOcrButton) runOcrButton.disabled = false;
            if (statusMessage) {
                statusMessage.textContent = "";
                statusMessage.className = "status";
            }

            // 스크롤 이동
            if (canvasWrapper) {
                canvasWrapper.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// 2) 파일 선택 이벤트 핸들러 (수정됨)
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  // 같은 파일을 다시 선택해도 이벤트가 발생하도록 값 초기화
  e.target.value = '';
  
  // 공통 함수 호출
  processFile(file);
}



// 6. OCR 실행 (대기열 UX 강화)
runOcrButton.addEventListener("click", async () => {
    if (!currentFile) return;

    // 선택 영역 보정
    let finalSel = selection;
    if (selection.w < 1 || selection.h < 1) {
        finalSel = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    }

    // UI 초기화
    runOcrButton.disabled = true;
    loadingSpinner.style.display = "inline-block";
    statusMessage.className = "status";
    ocrText.textContent = "";

    // [UX] 처리 시간이 길어지면 메시지를 변경하는 타이머
    statusMessage.textContent = "서버 전송 중...";

    // 2초 이상 걸리면 "대기 중" 메시지로 변경 (큐에 걸린 것으로 추정)
    const waitTimer = setTimeout(() => {
        statusMessage.textContent = "현재 요청이 많아 대기 중입니다... (순차 처리)";
    }, 2000);

    // 10초 이상 걸리면 추가 안내
    const longWaitTimer = setTimeout(() => {
        statusMessage.textContent = "처리가 지연되고 있습니다. 잠시만 더 기다려주세요...";
    }, 10000);


    const formData = new FormData();
    formData.append("image", currentFile);
    formData.append("x", Math.round(finalSel.x));
    formData.append("y", Math.round(finalSel.y));
    formData.append("w", Math.round(finalSel.w));
    formData.append("h", Math.round(finalSel.h));
    formData.append("lang", langSelect.value);

    try {
        const res = await fetch(`${API_BASE}/api/ocr_region`, {
            method: "POST",
            body: formData
        });

        // 응답이 오면 타이머 해제
        clearTimeout(waitTimer);
        clearTimeout(longWaitTimer);

        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "서버 오류");

        statusMessage.textContent = `완료! (${data.lang_label || data.lang})`;
        statusMessage.className = "status success";

        ocrText.textContent = data.full_text || "(인식된 텍스트 없음)";
        ocrRaw.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;

    } catch (err) {
        clearTimeout(waitTimer);
        clearTimeout(longWaitTimer);

        console.error(err);
        statusMessage.textContent = "에러: " + err.message;
        statusMessage.className = "status error";
        ocrText.textContent = "오류가 발생했습니다.";
    } finally {
        runOcrButton.disabled = false;
        loadingSpinner.style.display = "none";
    }
});
// [수정된 부분] 7. 복사 기능 (호환성 강화)
function copyToClipboard(text) {
    // 1. 최신 방식 (HTTPS / Localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    }

    // 2. 구형 방식 (HTTP / 구형 브라우저 호환용)
    // 임시 텍스트 영역을 만들어 선택 후 복사 명령 실행
    return new Promise((resolve) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;

            // 화면 밖으로 튀지 않게 스타일 설정
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";

            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            resolve(successful);
        } catch (err) {
            console.error("복사 실패:", err);
            resolve(false);
        }
    });
}

copyBtn.addEventListener("click", async () => {
    const text = ocrText.textContent;
    if (!text) return;

    const success = await copyToClipboard(text);

    if (success) {
        const originalText = copyBtn.innerText;
        copyBtn.innerText = "✅ 복사됨!";
        setTimeout(() => copyBtn.innerText = originalText, 1500);
    } else {
        alert("복사에 실패했습니다. 보안 설정이나 브라우저 호환성을 확인해주세요.");
    }
});
