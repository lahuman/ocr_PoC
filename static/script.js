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


// 5. 이미지 업로드 처리
imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  currentFile = file;
  const reader = new FileReader();
  
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      
      // 캔버스 크기를 이미지 원본 크기로 맞춤 (중요)
      canvas.width = img.width;
      canvas.height = img.height;
      
      canvas.style.display = 'block';
      placeholder.style.display = 'none';
      
      redraw();
      runOcrButton.disabled = false;
      statusMessage.textContent = "";
      statusMessage.className = "status";
      
      // 스크롤을 캔버스 쪽으로 부드럽게 이동
      canvasWrapper.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});


// 6. OCR 실행
runOcrButton.addEventListener("click", async () => {
  if (!currentFile) return;

  // 선택 영역 없으면 전체 영역 사용
  let finalSel = selection;
  if (selection.w < 1 || selection.h < 1) {
    finalSel = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  }

  // UI 상태 변경 (로딩 중)
  runOcrButton.disabled = true;
  loadingSpinner.style.display = "inline-block";
  statusMessage.textContent = "서버에서 텍스트 인식 중...";
  statusMessage.className = "status";
  ocrText.textContent = "";

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

    // 성공 처리
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