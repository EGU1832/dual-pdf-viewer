console.log("v1.3.1 — hybrid sync + manual offset control");

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

let topFile, bottomFile;
let scale = 1.2;
const minScale = 0.5;
const maxScale = 3.0;

const OFFSET_STEP = 5; // px

let syncing = true;
let isSyncing = false;
let lastScrollTop = { top: 0, bottom: 0 };

let scrollOffset = 0; // top-bottom 간 수동 offset (px)

const topView = document.getElementById("top");
const bottomView = document.getElementById("bottom");
const zoomLabel = document.getElementById("zoomLabel");
const offsetLabel = document.getElementById("offsetLabel"); // 추가

// -------- PDF 렌더링 --------
async function renderPDF(file, container, scale, keepPosition = true) {
  if (!file) return;

  const prevScroll = container.scrollTop;
  const prevHeight = container.scrollHeight;
  const prevRatio = keepPosition
    ? prevScroll / (prevHeight - container.clientHeight)
    : 0;

  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = "100%";
  overlay.style.background = "inherit";
  overlay.style.opacity = "0";
  overlay.style.transition = "opacity 0.25s ease";
  overlay.style.pointerEvents = "none";
  overlay.style.zIndex = "2";

  container.style.position = "relative";
  container.appendChild(overlay);

  const url = URL.createObjectURL(file);
  const pdf = await pdfjsLib.getDocument({ url, useWorker: true }).promise;

  const fragment = document.createDocumentFragment();
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.display = "block";
    canvas.style.margin = "10px auto";
    await page.render({ canvasContext: ctx, viewport }).promise;
    fragment.appendChild(canvas);
  }

  overlay.appendChild(fragment);

  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
    setTimeout(() => {
      Array.from(container.children).forEach(c => {
        if (c !== overlay) c.remove();
      });
      overlay.style.position = "static";
      overlay.style.pointerEvents = "auto";
      overlay.style.zIndex = "1";
      overlay.style.transition = "none";
      container.scrollTop =
        prevRatio * (container.scrollHeight - container.clientHeight);
    }, 250);
  });
}

// -------- PDF 렌더링 (양쪽) --------
function renderBoth(keepPosition = true) {
  if (topFile) renderPDF(topFile, topView, scale, keepPosition);
  if (bottomFile) renderPDF(bottomFile, bottomView, scale, keepPosition);
  zoomLabel.textContent = Math.round(scale * 100) + "%";

  setTimeout(syncScrollRatio, 400);
}

// -------- 파일 업로드 --------
document.getElementById("topFile").addEventListener("change", e => {
  topFile = e.target.files[0];
  renderBoth(false);
});
document.getElementById("bottomFile").addEventListener("change", e => {
  bottomFile = e.target.files[0];
  renderBoth(false);
});

// -------- 확대/축소 --------
function adjustZoom(factor) {
  const newScale = Math.min(maxScale, Math.max(minScale, scale * factor));
  if (newScale === scale) return;
  scale = newScale;
  renderBoth(true);
}

document.getElementById("zoomIn").addEventListener("click", () => adjustZoom(1.2));
document.getElementById("zoomOut").addEventListener("click", () => adjustZoom(1 / 1.2));
document.getElementById("resetZoom").addEventListener("click", () => {
  scale = 1.2;
  renderBoth(true);
});

// -------- 수동 오프셋 조정 --------
function updateOffsetLabel() {
  if (offsetLabel)
    offsetLabel.textContent = `Offset: ${scrollOffset > 0 ? "+" : ""}${scrollOffset}px`;
}

function moveBottomView(delta) {
  // 스크롤 이벤트 일시 무시
  isSyncing = true;
  bottomView.scrollTop += delta;
  setTimeout(() => (isSyncing = false), 50);
}

document.getElementById("offsetUp").addEventListener("click", () => {
  scrollOffset += OFFSET_STEP;
  moveBottomView(OFFSET_STEP);
  updateOffsetLabel();
});

document.getElementById("offsetDown").addEventListener("click", () => {
  scrollOffset -= OFFSET_STEP;
  moveBottomView(-OFFSET_STEP);
  updateOffsetLabel();
});

document.getElementById("resetOffset").addEventListener("click", () => {
  const diff = scrollOffset;
  moveBottomView(-diff);
  scrollOffset = 0;
  updateOffsetLabel();
});

updateOffsetLabel();

// -------- 스크롤 동기화 (Hybrid) --------
function handleScroll(src, dest, srcKey, destKey) {
  if (!syncing || isSyncing) {
    lastScrollTop[srcKey] = src.scrollTop;
    return;
  }

  const delta = src.scrollTop - lastScrollTop[srcKey];
  if (Math.abs(delta) < 1) return;

  isSyncing = true;

  const srcRatio = src.scrollTop / (src.scrollHeight - src.clientHeight);

  // 호출 방향에 따라 offset 부호 조정
  const offsetAdjust = srcKey === "top" ? scrollOffset : -scrollOffset;

  const destTarget =
    srcRatio * (dest.scrollHeight - dest.clientHeight) + offsetAdjust;

  dest.scrollTop = destTarget;

  lastScrollTop[srcKey] = src.scrollTop;
  lastScrollTop[destKey] = dest.scrollTop;

  setTimeout(() => (isSyncing = false), 10);
}

// -------- 비율 보정 (렌더링 후) --------
function syncScrollRatio() {
  if (!syncing) return;
  const ratio = topView.scrollTop / (topView.scrollHeight - topView.clientHeight);
  bottomView.scrollTop =
    ratio * (bottomView.scrollHeight - bottomView.clientHeight) + scrollOffset; // offset 반영
}

// -------- 이벤트 연결 --------
topView.addEventListener("scroll", () =>
  handleScroll(topView, bottomView, "top", "bottom")
);
bottomView.addEventListener("scroll", () =>
  handleScroll(bottomView, topView, "bottom", "top")
);

// -------- 동기화 토글 --------
document.getElementById("toggleSync").addEventListener("click", e => {
  syncing = !syncing;
  e.target.style.color = syncing ? "#fff" : "#777";
  if (syncing) {
    lastScrollTop.top = topView.scrollTop;
    lastScrollTop.bottom = bottomView.scrollTop;
    console.log(`🔄 동기화 켜짐 (offset=${scrollOffset}px)`);
  } else {
    console.log("⏸️ 동기화 꺼짐 (각자 독립)");
  }
});