/* ========== BeautyCam - 뷰티 카메라 앱 ========== */

// ── 필터 프리셋 ──────────────────────────────────────────
const FILTERS = {
  natural:  { brightness: 1.0,  contrast: 1.0,  saturate: 1.0,  hueRotate: 0,    sepia: 0,    blur: 0   },
  bright:   { brightness: 1.25, contrast: 0.95, saturate: 1.1,  hueRotate: 0,    sepia: 0,    blur: 0   },
  soft:     { brightness: 1.1,  contrast: 0.85, saturate: 0.9,  hueRotate: 0,    sepia: 0.05, blur: 0.5 },
  vivid:    { brightness: 1.05, contrast: 1.15, saturate: 1.5,  hueRotate: 0,    sepia: 0,    blur: 0   },
  warm:     { brightness: 1.1,  contrast: 1.0,  saturate: 1.2,  hueRotate: -10,  sepia: 0.15, blur: 0   },
  cool:     { brightness: 0.95, contrast: 1.05, saturate: 0.85, hueRotate: 190,  sepia: 0,    blur: 0   },
  matte:    { brightness: 0.95, contrast: 0.85, saturate: 0.7,  hueRotate: 0,    sepia: 0.1,  blur: 0   },
  bw:       { brightness: 1.0,  contrast: 1.1,  saturate: 0,    hueRotate: 0,    sepia: 0,    blur: 0   },
};

// 얼굴 윤곽선 랜드마크 인덱스 (MediaPipe 478점 모델)
const FACE_OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];

// ── 앱 상태 ─────────────────────────────────────────────
let stream        = null;
let facingMode    = 'user';
let currentFilter = 'natural';
let beauty        = { smooth: 0, bright: 0, tone: 0 };
let bodyAdjust    = { faceslim: 0, eyeenlarge: 0, leglength: 0, bodyslim: 0 };
let capturedImage = null;
let mode          = 'camera';
let renderTimer   = null;

// ── MediaPipe 상태 ─────────────────────────────────────
let FaceLandmarker = null;
let PoseLandmarker = null;
let faceLandmarker = null;
let poseLandmarker = null;
let mpReady        = false;
let detectedLandmarks = null; // { face: [...] | null, pose: [...] | null }

// ── DOM 참조 ────────────────────────────────────────────
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const videoEl      = $('#video');
const placeholder  = $('#camera-placeholder');
const cameraScreen = $('#camera-mode');
const editScreen   = $('#edit-mode');
const editCanvas   = $('#edit-canvas');
const fileInput    = $('#file-input');

// ── 초기화 ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  startCamera();
  loadMediaPipe(); // 백그라운드 비동기 로드
});

// ── 이벤트 바인딩 ────────────────────────────────────────
function bindEvents() {
  $('#btn-import').addEventListener('click', () => fileInput.click());
  $('#btn-import-fallback').addEventListener('click', () => fileInput.click());
  $('#btn-flip').addEventListener('click', switchCamera);
  $('#btn-capture').addEventListener('click', capture);
  $('#btn-retake').addEventListener('click', goBackToCamera);
  $('#btn-download').addEventListener('click', download);
  fileInput.addEventListener('change', handleFileImport);

  // 뷰티 슬라이더 (카메라)
  ['smooth','bright','tone'].forEach(k => {
    $(`#slider-${k}`).addEventListener('input', e => setBeauty(k, e.target.value));
  });
  // 뷰티 슬라이더 (편집)
  ['smooth','bright','tone'].forEach(k => {
    $(`#edit-slider-${k}`).addEventListener('input', e => setBeauty(k, e.target.value));
  });

  // 체형 슬라이더 (편집)
  ['faceslim','eyeenlarge','leglength','bodyslim'].forEach(k => {
    $(`#body-slider-${k}`).addEventListener('input', e => setBodyAdjust(k, e.target.value));
  });

  // 필터 캐러셀
  $$('#filter-carousel .filter-chip').forEach(c =>
    c.addEventListener('click', () => setFilter(c.dataset.filter)));
  $$('#edit-filter-carousel .filter-chip').forEach(c =>
    c.addEventListener('click', () => setFilter(c.dataset.filter)));

  // 탭 전환 (편집)
  $$('.adj-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.adj-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.adj-panel').forEach(p => p.classList.add('hidden'));
      $(`#tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });
}

// ── MediaPipe 로드 (동적 import, 실패해도 앱 동작) ──────
async function loadMediaPipe() {
  try {
    const vision = await import(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs'
    );
    FaceLandmarker = vision.FaceLandmarker;
    PoseLandmarker = vision.PoseLandmarker;
    const FR = vision.FilesetResolver;

    const resolver = await FR.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    );

    [faceLandmarker, poseLandmarker] = await Promise.all([
      FaceLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
      }),
      PoseLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
      }),
    ]);

    mpReady = true;
  } catch (e) {
    console.warn('MediaPipe 로드 실패 (일반 보정으로 동작):', e);
  }
}

// ── 랜드마크 감지 ────────────────────────────────────────
async function detectLandmarks(img) {
  detectedLandmarks = null;

  if (!mpReady) {
    showDetectBadge(faceLandmarker ? 'detecting' : 'loading');
    return;
  }

  showDetectBadge('detecting');

  try {
    const faceResult = faceLandmarker.detect(img);
    const poseResult = poseLandmarker ? poseLandmarker.detect(img) : null;

    detectedLandmarks = {
      face: faceResult?.faceLandmarks?.[0] ?? null,
      pose: poseResult?.landmarks?.[0]     ?? null,
    };

    showDetectBadge(detectedLandmarks.face ? 'found' : 'notfound');
  } catch (e) {
    console.warn('감지 실패:', e);
    showDetectBadge('error');
  }
}

function showDetectBadge(state) {
  const badge   = $('#detect-badge');
  const text    = $('#detect-text');
  const spinner = badge?.querySelector('.detect-spinner');
  if (!badge) return;

  badge.className = 'detect-badge';
  spinner?.classList.add('hidden');

  const MAP = {
    loading:   ['', true,  'AI 모델 로딩 중...'],
    detecting: ['', true,  '얼굴/신체 분석 중...'],
    found:     ['found',    false, '얼굴 인식됨 ✓'],
    notfound:  ['notfound', false, '얼굴 미감지 (자동 보정)'],
    error:     ['notfound', false, '분석 오류'],
  };
  const [cls, spin, msg] = MAP[state] ?? MAP.error;
  if (cls) badge.classList.add(cls);
  if (spin) spinner?.classList.remove('hidden');
  text.textContent = msg;
}

// ── 카메라 ───────────────────────────────────────────────
async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    videoEl.srcObject = stream;
    videoEl.style.display = 'block';
    placeholder.style.display = 'none';
    applyLiveFilter();
  } catch {
    videoEl.style.display = 'none';
    placeholder.style.display = 'flex';
  }
}

async function switchCamera() {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  videoEl.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none';
  await startCamera();
}

// ── CSS 필터 문자열 ──────────────────────────────────────
function getFilterString() {
  const f = FILTERS[currentFilter];
  const b = beauty;
  const brightness = f.brightness + (b.bright / 100) * 0.4;
  const saturate   = f.saturate   + (b.tone  / 100) * 0.3;
  const sepia      = f.sepia      + (b.tone  / 100) * 0.25;
  const blur       = f.blur       + (b.smooth / 100) * 2.5;

  let s = `brightness(${brightness.toFixed(2)}) contrast(${f.contrast.toFixed(2)}) saturate(${saturate.toFixed(2)})`;
  if (f.hueRotate) s += ` hue-rotate(${f.hueRotate}deg)`;
  if (sepia  > 0)  s += ` sepia(${sepia.toFixed(2)})`;
  if (blur   > 0)  s += ` blur(${blur.toFixed(1)}px)`;
  return s;
}

function applyLiveFilter() {
  videoEl.style.filter = getFilterString();
}

// ── 필터 선택 ────────────────────────────────────────────
function setFilter(name) {
  currentFilter = name;
  ['#filter-carousel','#edit-filter-carousel'].forEach(sel =>
    $$(sel + ' .filter-chip').forEach(c =>
      c.classList.toggle('active', c.dataset.filter === name)));
  mode === 'camera' ? applyLiveFilter() : scheduleRender();
}

// ── 뷰티 슬라이더 ────────────────────────────────────────
function setBeauty(key, value) {
  beauty[key] = Number(value);
  ['', 'edit-'].forEach(p => {
    const s = $(`#${p}slider-${key}`); if (s) s.value = beauty[key];
    const v = $(`#${p}val-${key}`);    if (v) v.textContent = beauty[key];
  });
  mode === 'camera' ? applyLiveFilter() : scheduleRender();
}

// ── 체형 슬라이더 ────────────────────────────────────────
function setBodyAdjust(key, value) {
  bodyAdjust[key] = Number(value);
  const v = $(`#body-val-${key}`); if (v) v.textContent = bodyAdjust[key];
  scheduleRender();
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderEditCanvas, 80);
}

// ── 촬영 ─────────────────────────────────────────────────
function capture() {
  if (!stream) return;
  const flash = document.createElement('div');
  flash.className = 'flash-overlay';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());

  const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
  const tmp = document.createElement('canvas');
  tmp.width = vw; tmp.height = vh;
  const ctx = tmp.getContext('2d');
  if (facingMode === 'user') { ctx.translate(vw, 0); ctx.scale(-1, 1); }
  ctx.drawImage(videoEl, 0, 0, vw, vh);

  const img = new Image();
  img.onload = () => { capturedImage = img; enterEditMode(); };
  img.src = tmp.toDataURL('image/png');
}

// ── 사진 불러오기 ────────────────────────────────────────
function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => { capturedImage = img; enterEditMode(); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  fileInput.value = '';
}

// ── 편집 모드 진입 ───────────────────────────────────────
async function enterEditMode() {
  mode = 'edit';
  detectedLandmarks = null;
  cameraScreen.classList.add('hidden');
  editScreen.classList.remove('hidden');

  // 슬라이더 동기화
  ['smooth','bright','tone'].forEach(k => {
    const s = $(`#edit-slider-${k}`); if (s) s.value = beauty[k];
    const v = $(`#edit-val-${k}`);    if (v) v.textContent = beauty[k];
  });
  ['faceslim','eyeenlarge','leglength','bodyslim'].forEach(k => {
    bodyAdjust[k] = 0;
    const s = $(`#body-slider-${k}`); if (s) s.value = 0;
    const v = $(`#body-val-${k}`);    if (v) v.textContent = 0;
  });

  // 탭 초기화
  $$('.adj-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'beauty'));
  $('#tab-beauty').classList.remove('hidden');
  $('#tab-body').classList.add('hidden');

  // 필터 칩 동기화
  $$('#edit-filter-carousel .filter-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.filter === currentFilter));

  renderEditCanvas(); // 1차 렌더 (랜드마크 없이)

  await detectLandmarks(capturedImage); // AI 감지 (비동기)

  // 체형 슬라이더가 활성화되어 있으면 감지 후 재렌더
  if (Object.values(bodyAdjust).some(v => v > 0)) scheduleRender();
}

// ── 카메라로 복귀 ────────────────────────────────────────
function goBackToCamera() {
  mode = 'camera';
  editScreen.classList.add('hidden');
  cameraScreen.classList.remove('hidden');
  capturedImage = null;
  detectedLandmarks = null;
  const badge = $('#detect-badge');
  if (badge) badge.classList.add('hidden');

  ['smooth','bright','tone'].forEach(k => {
    const s = $(`#slider-${k}`); if (s) s.value = beauty[k];
    const v = $(`#val-${k}`);    if (v) v.textContent = beauty[k];
  });
  applyLiveFilter();
}

// ── 편집 캔버스 렌더링 ───────────────────────────────────
const MAX_PREVIEW = 960;

function renderEditCanvas(forDownload = false) {
  if (!capturedImage) return null;

  const iw = capturedImage.naturalWidth, ih = capturedImage.naturalHeight;
  let rw = iw, rh = ih;
  if (!forDownload && Math.max(iw, ih) > MAX_PREVIEW) {
    const s = MAX_PREVIEW / Math.max(iw, ih);
    rw = Math.round(iw * s); rh = Math.round(ih * s);
  }

  // Step 1: CSS 필터(뷰티+색감)
  const tmp = document.createElement('canvas');
  tmp.width = rw; tmp.height = rh;
  const tmpCtx = tmp.getContext('2d');
  tmpCtx.filter = getFilterString();
  tmpCtx.drawImage(capturedImage, 0, 0, rw, rh);
  tmpCtx.filter = 'none';

  // Step 2: 체형 워프 (슬라이더 값 있을 때만)
  if (Object.values(bodyAdjust).some(v => v > 0)) {
    applyBodyWarp(tmp);
  }

  // Step 3: 대상 캔버스에 복사
  const dst = forDownload ? document.createElement('canvas') : editCanvas;
  dst.width = rw; dst.height = rh;
  dst.getContext('2d').drawImage(tmp, 0, 0);
  return dst;
}

// ── 다운로드 (원본 해상도) ───────────────────────────────
function download() {
  if (!capturedImage) return;
  const full = renderEditCanvas(true);
  full.toBlob(blob => {
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

// ════════════════════════════════════════════════════════
//  체형 워프 엔진 (랜드마크 기반 + 휴리스틱 폴백)
// ════════════════════════════════════════════════════════

function applyBodyWarp(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, w, h);
  const dst = new ImageData(w, h);
  const sd = src.data, dd = dst.data;

  const fs = bodyAdjust.faceslim   / 100;
  const el = bodyAdjust.eyeenlarge / 100;
  const ll = bodyAdjust.leglength  / 100;
  const bs = bodyAdjust.bodyslim   / 100;

  // 랜드마크 → 픽셀 좌표 변환
  const faceInfo = (fs > 0 || el > 0) && detectedLandmarks?.face
    ? buildFaceInfo(w, h, detectedLandmarks.face) : null;
  const poseInfo = (ll > 0 || bs > 0) && detectedLandmarks?.pose
    ? buildPoseInfo(w, h, detectedLandmarks.pose) : null;

  const hw = w / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx = x, sy = y;

      // ① 얼굴 슬림
      if (fs > 0) {
        sx = faceInfo
          ? warpFaceSlim(x, y, faceInfo, fs)
          : hw + (x - hw) / (1 - Math.min(fs * 0.32 * Math.max(0, 1 - (y/h)*1.7), 0.55));
      }

      // ② 몸 슬림
      if (bs > 0) {
        sx = poseInfo
          ? warpBodySlim(x, y, h, poseInfo, bs, sx)
          : hw + (sx - hw) / (1 - Math.min(bs * 0.18, 0.35));
      }

      // ③ 눈 크게
      if (el > 0) {
        const r = faceInfo
          ? warpEyeEnlarge(x, y, faceInfo, el)
          : warpEyeHeuristic(x, y, w, h, el);
        if (r) { sx = r.sx; sy = r.sy; }
      }

      // ④ 다리 길게
      if (ll > 0) {
        const splitY = poseInfo ? poseInfo.hipY : h * 0.55;
        if (y > splitY) {
          const t = (y - splitY) / (h - splitY);
          sy = splitY + (t / (1 + ll * 0.35)) * (h - splitY);
        }
      }

      // 클램프 + 쌍선형 보간
      sx = Math.max(0, Math.min(w - 1.001, sx));
      sy = Math.max(0, Math.min(h - 1.001, sy));

      const x0 = sx|0, y0 = sy|0;
      const x1 = Math.min(x0+1, w-1), y1 = Math.min(y0+1, h-1);
      const fx = sx-x0, fy = sy-y0;
      const w00=(1-fx)*(1-fy), w10=fx*(1-fy), w01=(1-fx)*fy, w11=fx*fy;
      const i00=(y0*w+x0)*4, i10=(y0*w+x1)*4, i01=(y1*w+x0)*4, i11=(y1*w+x1)*4;
      const di=(y*w+x)*4;
      dd[di]  =sd[i00]  *w00+sd[i10]  *w10+sd[i01]  *w01+sd[i11]  *w11;
      dd[di+1]=sd[i00+1]*w00+sd[i10+1]*w10+sd[i01+1]*w01+sd[i11+1]*w11;
      dd[di+2]=sd[i00+2]*w00+sd[i10+2]*w10+sd[i01+2]*w01+sd[i11+2]*w11;
      dd[di+3]=sd[i00+3]*w00+sd[i10+3]*w10+sd[i01+3]*w01+sd[i11+3]*w11;
    }
  }
  ctx.putImageData(dst, 0, 0);
}

// ── 랜드마크 → 구조체 변환 ──────────────────────────────

function buildFaceInfo(w, h, lms) {
  const pts = lms.map(p => ({ x: p.x * w, y: p.y * h }));
  const oval = FACE_OVAL.map(i => pts[i]);
  const xs = oval.map(p => p.x), ys = oval.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);

  // 눈 중심: 각 눈의 inner/outer/top/bottom 평균
  const eyeCenter = (a, b, c, d) => ({
    x: (pts[a].x + pts[b].x) / 2,
    y: (pts[c].y + pts[d].y) / 2,
    r: Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) * 0.85,
  });
  return {
    minX, maxX, minY, maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    hw: (maxX - minX) / 2,
    hh: (maxY - minY) / 2,
    eyes: [
      eyeCenter(33, 133, 159, 145),   // 왼쪽 눈
      eyeCenter(263, 362, 386, 374),  // 오른쪽 눈
    ],
  };
}

function buildPoseInfo(w, h, lms) {
  const p = lms.map(l => ({ x: l.x * w, y: l.y * h }));
  return {
    shoulderY:    (p[11].y + p[12].y) / 2,
    shoulderMidX: (p[11].x + p[12].x) / 2,
    shoulderW:    Math.abs(p[12].x - p[11].x),
    hipY:         (p[23].y + p[24].y) / 2,
    hipMidX:      (p[23].x + p[24].x) / 2,
    hipW:         Math.abs(p[24].x - p[23].x),
  };
}

// ── 워프 함수들 ──────────────────────────────────────────

// 얼굴 윤곽 기준 가로 수축
function warpFaceSlim(x, y, fi, amount) {
  const { cx, cy, hw, hh, minX, maxX, minY, maxY } = fi;
  const margin = hw * 0.4;
  if (x < minX-margin || x > maxX+margin || y < minY-margin || y > maxY+margin) return x;

  const nx = (x - cx) / hw; // 정규화 위치 (-1~1)
  const ny = (y - cy) / hh;
  const dist = Math.sqrt(nx*nx + ny*ny);
  const influence = Math.max(0, 1 - Math.pow(Math.max(0, dist-0.15)/0.85, 0.6));
  const squeeze = Math.min(amount * 0.38 * influence, 0.6);
  return cx + (x - cx) / (1 - squeeze);
}

// 감지된 눈 위치 기준 확대
function warpEyeEnlarge(x, y, fi, amount) {
  for (const eye of fi.eyes) {
    const dx = x - eye.x, dy = y - eye.y;
    const r = Math.sqrt(dx*dx + dy*dy);
    const R = eye.r * 2.8;
    if (r < R) {
      const t = r / R;
      const mag = 1 + amount * 0.5 * (1-t) * (1-t);
      return { sx: eye.x + dx/mag, sy: eye.y + dy/mag };
    }
  }
  return null;
}

// 눈 위치 미감지 시 화면 비율 기반 휴리스틱
function warpEyeHeuristic(x, y, w, h, amount) {
  const ecx = w*0.5, ecy = h*0.28, R = Math.min(w,h)*0.21;
  const dx = x-ecx, dy = y-ecy;
  const r = Math.sqrt(dx*dx+dy*dy);
  if (r >= R) return null;
  const t = r/R;
  const mag = 1 + amount*0.45*(1-t)*(1-t);
  return { sx: ecx+dx/mag, sy: ecy+dy/mag };
}

// 포즈 기반 몸통 가로 수축
function warpBodySlim(x, y, h, pi, amount, sx) {
  const { shoulderY, hipY, shoulderMidX, hipMidX, shoulderW, hipW } = pi;
  const topY    = shoulderY - (hipY - shoulderY) * 0.1;
  const bottomY = hipY      + (hipY - shoulderY) * 0.15;
  if (y < topY || y > bottomY) return sx;

  const t = (y - topY) / (bottomY - topY);
  const bodyCx = shoulderMidX + (hipMidX - shoulderMidX) * t;
  const halfW  = ((shoulderW + hipW) / 2) * 0.55;
  const dsx = sx - bodyCx;
  const norm = Math.min(1, Math.abs(dsx) / halfW);
  const squeeze = Math.min(amount * 0.28 * norm, 0.5);
  return bodyCx + dsx / (1 - squeeze);
}
