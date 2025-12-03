// 같은 서버/포트에서 쓰면 빈 문자열이면 됨.
// 다른 서버에서 API를 쓰면 예: "http://192.168.0.10:8000"
const API_BASE = "";

const imageInput = document.getElementById("imageInput");
const langSelect = document.getElementById("langSelect");
const canvas = document.getElementById("imageCanvas");
const canvasWrapper = document.getElementById("canvasWrapper");
const runOcrButton = document.getElementById("runOcrButton");
const statusMessage = document.getElementById("statusMessage");
const selectionInfo = document.getElementById("selectionInfo");
const ocrText = document.getElementById("ocrText");
const ocrRaw = document.getElementById("ocrRaw");

const ctx = canvas.getContext("2d");

let currentImage = null;   // HTMLImageElement
let currentFile = null;    // 업로드된 File
let isDragging = false;
let startX = 0;
let startY = 0;
let selection = null;      // { x, y, w, h }

// JSON pretty print helper
function formatJson(obj) {
  return `<pre>${JSON.stringify(obj, null, 2)}</pre>`;
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// 이미지와 선택 영역 다시 그리기
function redraw() {
  if (!currentImage) {
    clearCanvas();
    return;
  }
  clearCanvas();
  ctx.drawImage(currentImage, 0, 0);

  if (selection && selection.w > 0 && selection.h > 0) {
    ctx.save();
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);

    ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
    ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
    ctx.restore();
  }
}

// 좌표 변환: 마우스 이벤트 → canvas 좌표
function getCanvasCoords(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

// 이미지 업로드 시
imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) {
    currentImage = null;
    currentFile = null;
    runOcrButton.disabled = true;
    clearCanvas();
    selection = null;
    selectionInfo.textContent = "이미지를 선택해 주세요.";
    return;
  }

  currentFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      currentImage = img;
      // 캔버스를 이미지 원본 크기로 맞춤
      canvas.width = img.width;
      canvas.height = img.height;
      redraw();
      selection = null;
      runOcrButton.disabled = false;
      selectionInfo.textContent = `이미지가 로드되었습니다. 마우스로 드래그해서 영역을 선택하세요. (원본 크기: ${img.width} x ${img.height})`;
      ocrText.textContent = "";
      ocrRaw.innerHTML = "";
      statusMessage.textContent = "";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// 캔버스 드래그로 영역 선택
canvas.addEventListener("mousedown", (e) => {
  if (!currentImage) return;
  isDragging = true;
  const { x, y } = getCanvasCoords(e);
  startX = x;
  startY = y;
  selection = { x, y, w: 0, h: 0 };
  redraw();
});

canvas.addEventListener("mousemove", (e) => {
  if (!isDragging || !currentImage) return;
  const { x, y } = getCanvasCoords(e);
  const w = x - startX;
  const h = y - startY;

  // selection.x, y는 좌상단, w, h는 폭/높이
  selection = {
    x: w >= 0 ? startX : x,
    y: h >= 0 ? startY : y,
    w: Math.abs(w),
    h: Math.abs(h),
  };
  redraw();

  selectionInfo.textContent = `선택 영역: x=${Math.round(selection.x)}, y=${Math.round(selection.y)}, w=${Math.round(selection.w)}, h=${Math.round(selection.h)}`;
});

function endDrag() {
  if (isDragging) {
    isDragging = false;
  }
}

canvas.addEventListener("mouseup", endDrag);
canvas.addEventListener("mouseleave", endDrag);

// OCR 실행 버튼
runOcrButton.addEventListener("click", async () => {
  if (!currentFile) {
    alert("이미지를 먼저 업로드해 주세요.");
    return;
  }

  let sel = selection;
  if (!sel || sel.w <= 0 || sel.h <= 0) {
    // 선택 영역이 없으면 전체 이미지 사용
    sel = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  }

  const x = Math.round(sel.x);
  const y = Math.round(sel.y);
  const w = Math.round(sel.w);
  const h = Math.round(sel.h);
  const lang = langSelect.value;

  statusMessage.textContent = "OCR 처리 중입니다...";
  statusMessage.className = "";
  ocrText.textContent = "";
  ocrRaw.innerHTML = "";

  runOcrButton.disabled = true;

  try {
    const formData = new FormData();
    formData.append("image", currentFile);
    formData.append("x", String(x));
    formData.append("y", String(y));
    formData.append("w", String(w));
    formData.append("h", String(h));
    formData.append("lang", lang);

    const res = await fetch(`${API_BASE}/api/ocr_region`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      statusMessage.innerHTML = `<span class="error">에러: ${data.error || "알 수 없는 오류"}</span>`;
      ocrRaw.innerHTML = formatJson(data);
      return;
    }

    statusMessage.innerHTML = `<span class="success">OCR 완료 (언어: ${data.lang_label || data.lang})</span>`;

    if (data.full_text) {
      ocrText.textContent = data.full_text;
    } else {
      ocrText.textContent = "(인식된 텍스트가 없습니다.)";
    }

    ocrRaw.innerHTML = formatJson(data);

  } catch (err) {
    console.error(err);
    statusMessage.innerHTML = `<span class="error">에러: ${err.message}</span>`;
  } finally {
    runOcrButton.disabled = false;
  }
});