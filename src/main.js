import QRCode from 'qrcode';
import jsQR from 'jsqr';
import './styles.css';
import { fileToFrames, parseFrame, HEADER_TYPE, DATA_TYPE, sha256hex } from './protocol.js';

const app = document.getElementById('app');
let mode = 'send';
let sendState = null;
let recvState = null;
let timer = null;
let stream = null;

function fmtSize(n) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(2)} МБ`;
}

function render() {
  app.innerHTML = `
    <div class="app">
      <header class="top">
        <div class="brand">
          <div class="logo">V</div>
          <div>
            <h1>Vizex</h1>
            <p class="sub">Файлы через экран и камеру · без Wi‑Fi и Bluetooth</p>
          </div>
        </div>
      </header>
      <div class="modes">
        <button class="mode ${mode === 'send' ? 'active' : ''}" data-mode="send">
          <b>Отправить</b>
          <span>Файл превращается в поток QR на экране</span>
        </button>
        <button class="mode ${mode === 'recv' ? 'active' : ''}" data-mode="recv">
          <b>Принять</b>
          <span>Наведите камеру на экран второго телефона</span>
        </button>
      </div>
      <section class="card" id="panel"></section>
    </div>
  `;
  app.querySelectorAll('[data-mode]').forEach((el) => {
    el.onclick = () => switchMode(el.dataset.mode);
  });
  if (mode === 'send') renderSend();
  else renderRecv();
}

function switchMode(next) {
  stopSend();
  stopRecv();
  mode = next;
  render();
}

function renderSend() {
  const panel = document.getElementById('panel');
  panel.innerHTML = `
    <p class="hint">Выберите небольшой файл (лучше до 80–150 КБ). Телефон-получатель должен смотреть камерой на этот экран при максимальной яркости.</p>
    <div class="filepick">
      <label class="btn">Выбрать файл<input id="file" type="file" /></label>
    </div>
    <div id="sendBody"></div>
  `;
  panel.querySelector('#file').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) {
      alert('Слишком большой файл для оптического канала. Возьмите до ~400 КБ, лучше меньше 100 КБ.');
      return;
    }
    const pack = await fileToFrames(file);
    sendState = { ...pack, i: 0, fps: 6, playing: true };
    paintSend();
    startLoop();
  };
}

function paintSend() {
  const body = document.getElementById('sendBody');
  if (!body || !sendState) return;
  const { name, size, chunkCount, i, fps, playing } = sendState;
  const total = sendState.frames.length;
  body.innerHTML = `
    <p class="meta" style="margin-top:14px">
      <strong>${escapeHtml(name)}</strong> · ${fmtSize(size)} · ${chunkCount} блоков + заголовок
    </p>
    <div class="stage"><canvas id="qr"></canvas></div>
    <div class="progress"><div class="bar" style="width:${((i % total) / total) * 100}%"></div></div>
    <div class="stats"><span>Кадр ${ (i % total) + 1 } / ${total}</span><span>${fps} кадр/с</span></div>
    <label class="small">Скорость показа — если плохо считывается, замедлите</label>
    <input class="range" id="fps" type="range" min="2" max="12" value="${fps}" />
    <div class="row" style="margin-top:12px">
      <button class="btn" id="toggle">${playing ? 'Пауза' : 'Продолжить'}</button>
      <button class="btn ghost" id="reset">С начала</button>
    </div>
  `;
  drawFrame();
  body.querySelector('#fps').oninput = (e) => {
    sendState.fps = Number(e.target.value);
    startLoop();
    paintSend();
  };
  body.querySelector('#toggle').onclick = () => {
    sendState.playing = !sendState.playing;
    startLoop();
    paintSend();
  };
  body.querySelector('#reset').onclick = () => {
    sendState.i = 0;
    paintSend();
  };
}

async function drawFrame() {
  if (!sendState) return;
  const canvas = document.getElementById('qr');
  if (!canvas) return;
  const text = sendState.frames[sendState.i % sendState.frames.length];
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 512,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

function startLoop() {
  clearInterval(timer);
  if (!sendState?.playing) return;
  timer = setInterval(async () => {
    sendState.i += 1;
    const bar = document.querySelector('.bar');
    const stats = document.querySelector('.stats span');
    const total = sendState.frames.length;
    if (bar) bar.style.width = `${((sendState.i % total) / total) * 100}%`;
    if (stats) stats.textContent = `Кадр ${(sendState.i % total) + 1} / ${total}`;
    await drawFrame();
  }, Math.round(1000 / sendState.fps));
}

function stopSend() {
  clearInterval(timer);
  timer = null;
  sendState = null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRecv() {
  const panel = document.getElementById('panel');
  panel.innerHTML = `
    <p class="hint">Разрешите камеру, наведите на QR на втором экране и держите ровно. Кадры можно ловить в любом порядке — приложение само соберёт файл.</p>
    <div class="preview">
      <video id="cam" playsinline autoplay muted></video>
      <div class="overlay"></div>
    </div>
    <canvas id="work" hidden></canvas>
    <div class="progress"><div class="bar" id="rbar"></div></div>
    <div class="stats"><span id="rstat">Ожидание заголовка…</span><span id="rgot">0 / ?</span></div>
    <p class="status" id="rst"></p>
    <div class="row" style="margin-top:8px">
      <button class="btn ghost" id="stopc">Стоп камеры</button>
      <button class="btn" id="startc">Камера</button>
    </div>
  `;
  recvState = { header: null, parts: new Map(), done: false, last: '' };
  panel.querySelector('#startc').onclick = startCam;
  panel.querySelector('#stopc').onclick = stopRecv;
  startCam();
}

async function startCam() {
  stopStreamOnly();
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (err) {
    document.getElementById('rst').innerHTML = `<span class="err">Нет доступа к камере: ${escapeHtml(err.message)}</span>`;
    return;
  }
  const video = document.getElementById('cam');
  video.srcObject = stream;
  await video.play();
  scanLoop();
}

function stopStreamOnly() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

function stopRecv() {
  stopStreamOnly();
  recvState = null;
}

function scanLoop() {
  const video = document.getElementById('cam');
  const work = document.getElementById('work');
  if (!video || !work || !recvState || recvState.done) return;
  if (video.readyState >= 2) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h) {
      work.width = w;
      work.height = h;
      const ctx = work.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (code?.data) consume(code.data);
    }
  }
  requestAnimationFrame(scanLoop);
}

function consume(text) {
  if (!recvState || text === recvState.last) return;
  recvState.last = text;
  const frame = parseFrame(text);
  if (!frame) return;
  if (frame.type === HEADER_TYPE) {
    if (!recvState.header || recvState.header.id !== frame.id) {
      recvState.header = frame;
      recvState.parts = new Map();
    }
    updateRecvUi();
    return;
  }
  if (frame.type === DATA_TYPE) {
    if (!recvState.header) {
      document.getElementById('rst').textContent = 'Сначала поймайте заголовок (первый кадр). Держите камеру, пока отправитель крутит цикл.';
      return;
    }
    if (frame.id !== recvState.header.id) return;
    recvState.parts.set(frame.index, frame.data);
    updateRecvUi();
    maybeFinish();
  }
}

function updateRecvUi() {
  const h = recvState.header;
  const got = recvState.parts.size;
  const total = h ? h.chunks : 0;
  const bar = document.getElementById('rbar');
  const stat = document.getElementById('rstat');
  const rgot = document.getElementById('rgot');
  if (bar && h) bar.style.width = `${(got / total) * 100}%`;
  if (stat) stat.textContent = h ? `${escapeHtml(h.name)} · ${fmtSize(h.size)}` : 'Ожидание заголовка…';
  if (rgot) rgot.textContent = h ? `${got} / ${total}` : '0 / ?';
}

async function maybeFinish() {
  const h = recvState.header;
  if (!h || recvState.parts.size < h.chunks || recvState.done) return;
  const out = new Uint8Array(h.size);
  let offset = 0;
  for (let i = 0; i < h.chunks; i++) {
    const part = recvState.parts.get(i);
    if (!part) return;
    out.set(part, offset);
    offset += part.length;
  }
  const hash = await sha256hex(out);
  const rst = document.getElementById('rst');
  if (hash !== h.hash) {
    rst.innerHTML = '<span class="err">Контрольная сумма не совпала. Прокрутите ещё раз.</span>';
    return;
  }
  recvState.done = true;
  stopStreamOnly();
  const blob = new Blob([out], { type: h.mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  rst.innerHTML = `<span class="ok">Файл собран.</span> <a class="btn ok" style="display:inline-block;margin-top:8px" href="${url}" download="${encodeURIComponent(h.name)}">Скачать ${escapeHtml(h.name)}</a>`;
}

try {
  render();
} catch (err) {
  app.textContent = 'Ошибка: ' + (err && err.message ? err.message : String(err));
}
