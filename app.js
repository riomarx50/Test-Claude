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
let bodyAdjust = { faceslim: 0, eyeenlarge: 0, leglength: 0, bodyslim: 0 };
let capturedImage = null;  // HTMLImageElement
let mode = 'camera';       // 'camera' | 'edit'
let renderTimer = null;    // 편집 모드 디바운스용

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

  // 탭 전환 (편집 모드)
  $$('.adj-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.adj-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetId = 'tab-' + tab.dataset.tab;
      $$('.adj-panel').forEach(p => p.classList.add('hidden'));
      $('#' + targetId).classList.remove('hidden');
    });
  });

  // 체형 슬라이더 (편집 모드)
  ['faceslim', 'eyeenlarge', 'leglength', 'bodyslim'].forEach(key => {
    $(`#body-slider-${key}`).addEventListener('input', (e) => setBodyAdjust(key, e.target.value));
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
    scheduleRender();
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
    scheduleRender();
  }
}

// ── 체형 조정 ───────────────────────────────────────────
function setBodyAdjust(key, value) {
  bodyAdjust[key] = Number(value);
  const valEl = $(`#body-val-${key}`);
  if (valEl) valEl.textContent = bodyAdjust[key];
  scheduleRender();
}

// ── 렌더링 디바운스 ────────────────────────────────────
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => renderEditCanvas(), 80);
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

  // 체형 슬라이더 초기화
  ['faceslim', 'eyeenlarge', 'leglength', 'bodyslim'].forEach(key => {
    bodyAdjust[key] = 0;
    const slider = $(`#body-slider-${key}`);
    const valEl = $(`#body-val-${key}`);
    if (slider) slider.value = 0;
    if (valEl) valEl.textContent = 0;
  });

  // 탭을 뷰티로 초기화
  $$('.adj-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'beauty'));
  $('#tab-beauty').classList.remove('hidden');
  $('#tab-body').classList.add('hidden');

  // 편집 필터 칩 동기화
  $$('#edit-filter-carousel .filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.filter === currentFilter);
  });

  renderEditCanvas();
}

// ── 편집 캔버스 렌더링 ─────────────────────────────────
const MAX_PREVIEW_PX = 960; // 프리뷰 최대 해상도 (성능 최적화)

function renderEditCanvas(forDownload = false) {
  if (!capturedImage) return null;

  const iw = capturedImage.naturalWidth;
  const ih = capturedImage.naturalHeight;

  let rw = iw, rh = ih;
  if (!forDownload && Math.max(iw, ih) > MAX_PREVIEW_PX) {
    const s = MAX_PREVIEW_PX / Math.max(iw, ih);
    rw = Math.round(iw * s);
    rh = Math.round(ih * s);
  }

  // Step 1: CSS 필터(뷰티+색감) 적용 → 임시 캔버스
  const tmp = document.createElement('canvas');
  tmp.width = rw;
  tmp.height = rh;
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.filter = getFilterString();
  tmpCtx.drawImage(capturedImage, 0, 0, rw, rh);
  tmpCtx.filter = 'none';

  // Step 2: 체형 워프 (값이 있을 때만)
  const hasWarp = Object.values(bodyAdjust).some(v => v > 0);
  if (hasWarp) {
    showProcessing(true);
    applyBodyWarp(tmp);
    showProcessing(false);
  }

  // Step 3: 결과를 editCanvas 또는 오프스크린에 복사
  const dst = forDownload ? document.createElement('canvas') : editCanvas;
  dst.width = rw;
  dst.height = rh;
  dst.getContext('2d').drawImage(tmp, 0, 0);

  return dst;
}

function showProcessing(visible) {
  let overlay = $('#processing-overlay');
  if (visible && !overlay) {
    overlay = document.createElement('div');
    overlay.id = 'processing-overlay';
    overlay.className = 'processing-overlay';
    overlay.innerHTML = '<div class="spinner"></div><span>처리 중...</span>';
    $('.edit-preview').appendChild(overlay);
  } else if (!visible && overlay) {
    overlay.remove();
  }
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

// ── 체형 워프 (Canvas 픽셀 역방향 매핑 + 쌍선형 보간) ──
function applyBodyWarp(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, w, h);
  const dst = new ImageData(w, h);
  const sd = src.data, dd = dst.data;

  const fs = bodyAdjust.faceslim  / 100; // 얼굴 슬림
  const el = bodyAdjust.eyeenlarge / 100; // 눈 크게
  const ll = bodyAdjust.leglength  / 100; // 다리 길게
  const bs = bodyAdjust.bodyslim   / 100; // 몸 슬림

  const hw = w / 2, hh = h / 2;

  for (let y = 0; y < h; y++) {
    const relY = y / h;

    for (let x = 0; x < w; x++) {
      let sx = x, sy = y;

      // 1. 얼굴 슬림: 상단 집중 가로 수축
      if (fs > 0) {
        const weight = Math.max(0, 1 - relY * 1.7);
        const f = fs * 0.32 * weight;
        sx = hw + (x - hw) / (1 - Math.min(f, 0.55));
      }

      // 2. 몸 슬림: 전체 가로 수축
      if (bs > 0) {
        const f = bs * 0.18;
        sx = hw + (sx - hw) / (1 - Math.min(f, 0.35));
      }

      // 3. 눈 크게: 상단 중앙 영역 확대
      if (el > 0) {
        const ecx = w * 0.5;
        const ecy = h * 0.28;
        const eyeR = Math.min(w, h) * 0.21;
        const dx = x - ecx, dy = y - ecy;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < eyeR) {
          const t = r / eyeR;
          const mag = 1 + el * 0.45 * (1 - t) * (1 - t);
          sx = ecx + dx / mag;
          sy = ecy + dy / mag;
        }
      }

      // 4. 다리 길게: 하단 55% 구간 세로 신장
      if (ll > 0) {
        const split = h * 0.55;
        if (y > split) {
          const t = (y - split) / (h - split);
          sy = split + (t / (1 + ll * 0.35)) * (h - split);
        }
      }

      // 클램프
      sx = Math.max(0, Math.min(w - 1.001, sx));
      sy = Math.max(0, Math.min(h - 1.001, sy));

      // 쌍선형 보간
      const x0 = sx | 0, y0 = sy | 0;
      const x1 = Math.min(x0 + 1, w - 1);
      const y1 = Math.min(y0 + 1, h - 1);
      const fx = sx - x0, fy = sy - y0;

      const i00 = (y0 * w + x0) * 4;
      const i10 = (y0 * w + x1) * 4;
      const i01 = (y1 * w + x0) * 4;
      const i11 = (y1 * w + x1) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx       * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx       * fy;

      const di = (y * w + x) * 4;
      dd[di]     = sd[i00]   * w00 + sd[i10]   * w10 + sd[i01]   * w01 + sd[i11]   * w11;
      dd[di + 1] = sd[i00+1] * w00 + sd[i10+1] * w10 + sd[i01+1] * w01 + sd[i11+1] * w11;
      dd[di + 2] = sd[i00+2] * w00 + sd[i10+2] * w10 + sd[i01+2] * w01 + sd[i11+2] * w11;
      dd[di + 3] = sd[i00+3] * w00 + sd[i10+3] * w10 + sd[i01+3] * w01 + sd[i11+3] * w11;
    }
  }

  ctx.putImageData(dst, 0, 0);
}

// ── 다운로드 (원본 해상도로 재렌더) ────────────────────
function download() {
  if (!capturedImage) return;

  const fullCanvas = renderEditCanvas(true);
  fullCanvas.toBlob((blob) => {
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
