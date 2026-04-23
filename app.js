/* ========== BeautyCam - 뷰티 카메라 앱 ========== */

// ── 필터 프리셋 ──────────────────────────────────────────
const FILTERS = {
  natural:  { label: '자연',   brightness: 1.0,  contrast: 1.0,  saturate: 1.0,  hueRotate: 0,    sepia: 0,    blur: 0   },
  bright:   { label: '밝음',   brightness: 1.25, contrast: 0.95, saturate: 1.1,  hueRotate: 0,    sepia: 0,    blur: 0   },
  soft:     { label: '부드럽', brightness: 1.1,  contrast: 0.85, saturate: 0.9,  hueRotate: 0,    sepia: 0.05, blur: 0.5 },
  vivid:    { label: '선명',   brightness: 1.05, contrast: 1.15, saturate: 1.5,  hueRotate: 0,    sepia: 0,    blur: 0   },
  warm:     { label: '따뜻',   brightness: 1.1,  contrast: 1.0,  saturate: 1.2,  hueRotate: -10,  sepia: 0.15, blur: 0   },
  cool:     { label: '차가운', brightness: 0.95, contrast: 1.05, saturate: 0.85, hueRotate: 190,  sepia: 0,    blur: 0   },
  matte:    { label: '매트',   brightness: 0.95, contrast: 0.85, saturate: 0.7,  hueRotate: 0,    sepia: 0.1,  blur: 0   },
  bw:       { label: '흑백',   brightness: 1.0,  contrast: 1.1,  saturate: 0,    hueRotate: 0,    sepia: 0,    blur: 0   },
};

// ── 앱 상태 ─────────────────────────────────────────────
let stream = null;
let facingMode = 'user';
let currentFilter = 'natural';
let beauty = { smooth: 0, bright: 0, tone: 0 };
let capturedImage = null;  // HTMLImageElement
let mode = 'camera';       // 'camera' | 'edit'

// ── DOM 참조 ────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const videoEl       = $('#video');
const liveCanvas    = $('#live-canvas');
const placeholder   = $('#camera-placeholder');
const cameraScreen  = $('#camera-mode');
const editScreen    = $('#edit-mode');
const editCanvas    = $('#edit-canvas');
const fileInput     = $('#file-input');

// ── 초기화 ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

function init() {
  bindEvents();
  startCamera();
}

function bindEvents() {
  // 카메라 모드
  $('#btn-import').addEventListener('click', () => fileInput.click());
  $('#btn-import-fallback').addEventListener('click', () => fileInput.click());
  $('#btn-flip').addEventListener('click', switchCamera);
  $('#btn-capture').addEventListener('click', capture);
  fileInput.addEventListener('change', handleFileImport);

  // 편집 모드
  $('#btn-retake').addEventListener('click', goBackToCamera);
  $('#btn-download').addEventListener('click', download);

  // 뷰티 슬라이더 (카메라 모드)
  $('#slider-smooth').addEventListener('input', (e) => setBeauty('smooth', e.target.value));
  $('#slider-bright').addEventListener('input', (e) => setBeauty('bright', e.target.value));
  $('#slider-tone').addEventListener('input', (e) => setBeauty('tone', e.target.value));

  // 뷰티 슬라이더 (편집 모드)
  $('#edit-slider-smooth').addEventListener('input', (e) => setBeauty('smooth', e.target.value));
  $('#edit-slider-bright').addEventListener('input', (e) => setBeauty('bright', e.target.value));
  $('#edit-slider-tone').addEventListener('input', (e) => setBeauty('tone', e.target.value));

  // 필터 캐러셀 (카메라 모드)
  $$('#filter-carousel .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => setFilter(chip.dataset.filter, '#filter-carousel'));
  });

  // 필터 캐러셀 (편집 모드)
  $$('#edit-filter-carousel .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => setFilter(chip.dataset.filter, '#edit-filter-carousel'));
  });
}

// ── 카메라 ──────────────────────────────────────────────
async function startCamera() {
  try {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });

    videoEl.srcObject = stream;
    videoEl.style.display = 'block';
    placeholder.style.display = 'none';

    applyLiveFilter();
  } catch (err) {
    console.warn('카메라 접근 실패:', err);
    videoEl.style.display = 'none';
    placeholder.style.display = 'flex';
  }
}

async function switchCamera() {
  facingMode = facingMode === 'user' ? 'environment' : 'user';

  // 미러링: 전면은 좌우반전, 후면은 정상
  videoEl.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none';

  await startCamera();
}

// ── 실시간 필터 (CSS filter on video) ───────────────────
function applyLiveFilter() {
  videoEl.style.filter = getFilterString();
}

// ── 필터 문자열 생성 ────────────────────────────────────
function getFilterString() {
  const f = FILTERS[currentFilter];
  const b = beauty;

  const brightness = f.brightness + (b.bright / 100) * 0.4;
  const contrast   = f.contrast;
  const saturate   = f.saturate + (b.tone / 100) * 0.3;
  const hueRotate  = f.hueRotate;
  const sepia      = f.sepia + (b.tone / 100) * 0.25;
  const blur       = f.blur + (b.smooth / 100) * 2.5;

  let filterStr = `brightness(${brightness.toFixed(2)}) `;
  filterStr += `contrast(${contrast.toFixed(2)}) `;
  filterStr += `saturate(${saturate.toFixed(2)}) `;
  if (hueRotate !== 0) filterStr += `hue-rotate(${hueRotate}deg) `;
  if (sepia > 0) filterStr += `sepia(${sepia.toFixed(2)}) `;
  if (blur > 0) filterStr += `blur(${blur.toFixed(1)}px) `;

  return filterStr.trim();
}

// ── 필터 선택 ───────────────────────────────────────────
function setFilter(name, carouselSelector) {
  currentFilter = name;

  // UI 업데이트 - 두 캐러셀 모두 동기화
  ['#filter-carousel', '#edit-filter-carousel'].forEach(sel => {
    $$(sel + ' .filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.filter === name);
    });
  });

  if (mode === 'camera') {
    applyLiveFilter();
  } else {
    renderEditCanvas();
  }
}

// ── 뷰티 설정 ──────────────────────────────────────────
function setBeauty(key, value) {
  beauty[key] = Number(value);

  // 두 모드의 슬라이더 & 값 표시 동기화
  const prefixes = ['', 'edit-'];
  prefixes.forEach(prefix => {
    const slider = $(`#${prefix}slider-${key}`);
    const valEl = $(`#${prefix}val-${key}`);
    if (slider) slider.value = beauty[key];
    if (valEl) valEl.textContent = beauty[key];
  });

  if (mode === 'camera') {
    applyLiveFilter();
  } else {
    renderEditCanvas();
  }
}

// ── 촬영 ───────────────────────────────────────────────
function capture() {
  if (!stream) return;

  // 플래시 애니메이션
  const flash = document.createElement('div');
  flash.className = 'flash-overlay';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());

  // video → canvas → Image
  const vw = videoEl.videoWidth;
  const vh = videoEl.videoHeight;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = vw;
  tempCanvas.height = vh;
  const ctx = tempCanvas.getContext('2d');

  // 전면 카메라 미러링 처리
  if (facingMode === 'user') {
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(videoEl, 0, 0, vw, vh);

  const img = new Image();
  img.onload = () => {
    capturedImage = img;
    enterEditMode();
  };
  img.src = tempCanvas.toDataURL('image/png');
}

// ── 사진 불러오기 ───────────────────────────────────────
function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      capturedImage = img;
      enterEditMode();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);

  // 같은 파일 재선택 가능하도록 초기화
  fileInput.value = '';
}

// ── 편집 모드 진입 ──────────────────────────────────────
function enterEditMode() {
  mode = 'edit';
  cameraScreen.classList.add('hidden');
  editScreen.classList.remove('hidden');

  // 편집 슬라이더를 현재 뷰티 값으로 동기화
  ['smooth', 'bright', 'tone'].forEach(key => {
    const slider = $(`#edit-slider-${key}`);
    const valEl = $(`#edit-val-${key}`);
    if (slider) slider.value = beauty[key];
    if (valEl) valEl.textContent = beauty[key];
  });

  // 편집 필터 칩 동기화
  $$('#edit-filter-carousel .filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === currentFilter);
  });

  renderEditCanvas();
}

// ── 편집 캔버스 렌더링 ─────────────────────────────────
function renderEditCanvas() {
  if (!capturedImage) return;

  const canvas = editCanvas;
  const ctx = canvas.getContext('2d');

  canvas.width = capturedImage.naturalWidth;
  canvas.height = capturedImage.naturalHeight;

  ctx.filter = getFilterString();
  ctx.drawImage(capturedImage, 0, 0, canvas.width, canvas.height);
  ctx.filter = 'none';
}

// ── 카메라 모드로 복귀 ─────────────────────────────────
function goBackToCamera() {
  mode = 'camera';
  editScreen.classList.add('hidden');
  cameraScreen.classList.remove('hidden');
  capturedImage = null;

  // 카메라 슬라이더를 현재 뷰티 값으로 동기화
  ['smooth', 'bright', 'tone'].forEach(key => {
    const slider = $(`#slider-${key}`);
    const valEl = $(`#val-${key}`);
    if (slider) slider.value = beauty[key];
    if (valEl) valEl.textContent = beauty[key];
  });

  applyLiveFilter();
}

// ── 다운로드 ───────────────────────────────────────────
function download() {
  if (!capturedImage) return;

  // offscreen canvas에 필터 적용 후 export
  const offscreen = document.createElement('canvas');
  offscreen.width = capturedImage.naturalWidth;
  offscreen.height = capturedImage.naturalHeight;
  const ctx = offscreen.getContext('2d');

  ctx.filter = getFilterString();
  ctx.drawImage(capturedImage, 0, 0, offscreen.width, offscreen.height);

  offscreen.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beautycam_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
