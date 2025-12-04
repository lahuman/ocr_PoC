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

// --- [핵심 수정] 브라우저 기본 동작(파일 열기) 전역 차단 ---
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    window.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}
// -------------------------------------------------------

// --- 드래그 앤 드롭 UI 처리 ---
if (canvasWrapper) {
    // 드래그 들어왔을 때 스타일 효과
    ['dragenter', 'dragover'].forEach(eventName => {
        canvasWrapper.addEventListener(eventName, highlight, false);
    });

    // 드래그 나갔거나 드롭했을 때 스타일 해제
    ['dragleave', 'drop'].forEach(eventName => {
        canvasWrapper.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        canvasWrapper.classList.add('drag-over');
    }

    function unhighlight(e) {
        canvasWrapper.classList.remove('drag-over');
    }

    // 파일 드롭 시 처리
    canvasWrapper.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files && files.length > 0) {
            if (files[0].type.startsWith('image/')) {
                processFile(files[0]);
            } else {
                alert("이미지 파일만 업로드 가능합니다.");
            }
        }
    }
}
// ----------------------------------------

// 모바일 감지 (간이 체크)
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

if (inputGallery) inputGallery.addEventListener("change", handleFileSelect);
if (inputNativeCamera) inputNativeCamera.addEventListener("change", handleFileSelect);


// --- [PC 웹캠 로직] ---
btnSmartCamera.addEventListener("click", () => {
    if (isMobileDevice()) {
        inputNativeCamera.click();
    } else {
        openWebcamModal();
    }
});

async function openWebcamModal() {
    try {
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

btnSnap.addEventListener("click", () => {
    if (!mediaStream) return;
    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = webcamVideo.videoWidth;
    captureCanvas.height = webcamVideo.videoHeight;
    const ctx = captureCanvas.getContext("2d");
    ctx.drawImage(webcamVideo, 0, 0);

    captureCanvas.toBlob((blob) => {
        const file = new File([blob], "webcam_capture.jpg", { type: "image/jpeg" });
        processFile(file); 
        closeWebcamModal(); 
    }, "image/jpeg", 0.95);
});

if (btnCloseCamera) {
    btnCloseCamera.addEventListener("click", closeWebcamModal);
}

// State
let currentImage = null;   
let currentFile = null;    
let isDragging = false;
let startX = 0, startY = 0;
let selection = { x: 0, y: 0, w: 0, h: 0 };

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

function redraw() {
    if (!currentImage) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(currentImage, 0, 0);
    if (selection.w > 0 && selection.h > 0) {
        ctx.save();
        ctx.strokeStyle = "#ef4444"; 
        ctx.lineWidth = Math.max(2, currentImage.width / 200); 
        ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
        ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
        ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
        ctx.restore();
    }
}

function getImgCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function handleStart(e) {
    if (!currentImage) return;
    // 마우스 왼쪽 버튼만 허용
    if (e.type === 'mousedown' && e.button !== 0) return;
    
    e.preventDefault(); 
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
    }
}

canvas.addEventListener("mousedown", handleStart);
canvas.addEventListener("mousemove", handleMove);
canvas.addEventListener("mouseup", handleEnd);
canvas.addEventListener("mouseleave", handleEnd);
canvas.addEventListener("touchstart", handleStart, { passive: false });
canvas.addEventListener("touchmove", handleMove, { passive: false });
canvas.addEventListener("touchend", handleEnd);

function processFile(file) {
    if (!file) return;
    currentFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.style.display = 'block';
            placeholder.style.display = 'none';
            selection = { x: 0, y: 0, w: 0, h: 0 };
            redraw();
            if (runOcrButton) runOcrButton.disabled = false;
            if (statusMessage) {
                statusMessage.textContent = "";
                statusMessage.className = "status";
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  processFile(file);
}

const loadingMessages = [
    "AI가 안경을 닦고 있습니다... 👓",
    "글씨가 좀 작네요... 돋보기 찾는 중 🔍",
    "이건 무슨 글자일까요? 열심히 해독 중... 🤔",
    "잠시만요, AI가 한글 공부를 다시 하고 있어요 📚",
    "서버 고양이가 케이블을 건드려서 확인 중... 🐈",
    "개발자가 커피 마시는 동안 AI가 일하고 있습니다 ☕",
    "거의 다 됐어요! (아마도요) 🚀",
    "악필도 척척 읽어내는 중입니다... 💦",
    "OCR 요정들이 글자를 나르고 있어요 🧚",
    "지금 뇌를 풀가동하고 있습니다 🧠",
    "혹시 이 글씨... 의사 선생님이 쓰신 건가요? 👨‍⚕️",
    "0과 1의 세계에서 글자를 건져올리는 중 🎣",
    "로딩 바를 믿지 마세요, 마음으로 기다려주세요 🙏",
    "AI: '이거 뭐라고 쓴 거지?' (농담입니다) 😜",
    "데이터 고속도로를 달리는 중입니다 🏎️",
    "텍스트 추출 마법을 시전하고 있습니다 🧙‍♂️",
    "잠시 명상의 시간을 가져보세요 🧘",
    "눈을 깜빡이면 완료될 수도 있습니다 👀",
    "서버가 열심히 달리고 있어요! 🏃‍♂️",
    "조금만 참으세요, 멋진 결과가 기다립니다 ✨",
    "정확도를 높이기 위해 눈에 힘주는 중 😠",
    "픽셀 하나하나 장인정신으로 분석 중 💎",
    "혹시 외계어는 아니겠죠? 번역기 돌리는 중 👽",
    "OCR 엔진 예열 완료! 전속력으로 읽는 중 🔥",
    "텍스트들이 줄을 서서 기다리고 있어요 🚶‍♂️🚶‍♀️",
    "오타가 없는지 꼼꼼히 확인하고 있습니다 ✅",
    "이 이미지, 왠지 느낌이 좋은데요? 👍",
    "배가 고파서 글자를 먹는 건 아닙니다 🍔",
    "인내심은 쓰지만 그 열매는 달콤합니다 (결과는 텍스트로!) 🍇",
    "짜잔~ 하고 나타나기 3초 전... (반복) ⏱️"
];

let msgTimer = null;

runOcrButton.addEventListener("click", async () => {
    if (!currentFile) return;
    let finalSel = selection;
    if (selection.w < 1 || selection.h < 1) {
        finalSel = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    }
    runOcrButton.disabled = true;
    loadingSpinner.style.display = "inline-block";
    statusMessage.className = "status";
    ocrText.textContent = "";
    statusMessage.textContent = "서버로 전송 중...";
    
    msgTimer = setInterval(() => {
        const randomIndex = Math.floor(Math.random() * loadingMessages.length);
        statusMessage.textContent = loadingMessages[randomIndex];
    }, 5000);

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
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "서버 오류");
        statusMessage.textContent = `완료! (${data.lang_label || data.lang})`;
        statusMessage.className = "status success";
        ocrText.textContent = data.full_text || "(인식된 텍스트 없음)";
        ocrRaw.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    } catch (err) {
        console.error(err);
        statusMessage.textContent = "에러: " + err.message;
        statusMessage.className = "status error";
        ocrText.textContent = "오류가 발생했습니다.";
    } finally {
        runOcrButton.disabled = false;
        loadingSpinner.style.display = "none";
        if(msgTimer) clearInterval(msgTimer);
    }
});

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
    }
    return new Promise((resolve) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
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