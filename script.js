// ---------- Envelope tap-to-open ----------
// Client spec: tap → screen zooms into the envelope → parents' names slide
// appears. So the landing scene is a gate we pass through once, not a
// section people scroll past on their own.
const envelope      = document.getElementById('envelope');
const tapLabel      = document.querySelector('.tap-label');
const landingSection = document.getElementById('landing');

function openEnvelope() {
  if (envelope.classList.contains('opened')) return; // idempotent guard
  envelope.classList.add('opened');       // triggers envelope-zoom keyframes
  tapLabel.classList.add('hide');
  document.documentElement.classList.remove('pre-open'); // unblur bg + unlock scroll
  landingSection.classList.add('exiting');               // whole gate screen dissolves
  startMusic();
  enterFullScreen();

  // Once the zoom + fade have visually finished, remove slide 1 from the
  // document entirely so there is nothing above the Names section to scroll back into.
  setTimeout(() => { landingSection.style.display = 'none'; }, 950);
}

// Mouse / touch click
envelope.addEventListener('click', openEnvelope, { once: true });

// Keyboard: Enter or Space opens the invitation (Bug 1 fix)
envelope.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    openEnvelope();
  }
});

// ---------- Scroll-linked parallax + fade ----------
// Every section's background, garland, and text move and fade at their own
// speed as it passes through the viewport.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sections = Array.from(document.querySelectorAll('.section:not(#landing)')).map((el) => ({
  el,
  bg:         el.querySelector('.section-bg'),
  hang:       el.querySelector('.hang-wrap'),
  content:    el.querySelector('.content'),
  fadeRate:   parseFloat(el.dataset.fadeRate) || 1.6,
  fadeTarget: el.dataset.fadeTarget || 'content', // 'bg' for sections whose text is in the artwork
}));

function updateParallax() {
  const vh     = window.innerHeight;
  const center = vh / 2;

  sections.forEach(({ el, bg, hang, content, fadeRate, fadeTarget }) => {
    const rect     = el.getBoundingClientRect();
    const progress = (center - (rect.top + rect.height / 2)) / (vh / 2 + rect.height / 2);
    const clamped  = Math.max(-1, Math.min(1, progress));
    const bgMoves  = bg && bg.classList.contains('parallax-bg');

    if (!reduceMotion) {
      // Bumped noticeably higher than the first pass — this should read
      // clearly as the slide scrolls, not just on close inspection.
      // Buffer sized in CSS (.section-bg.parallax-bg: 116%/-8% inset)
      // to comfortably cover this amplitude with room to spare.
      if (bgMoves) bg.style.transform   = `translateY(${clamped * -42}px)`;
      if (hang)    hang.style.transform = `translateY(${clamped *  24}px)`;
    }

    const fade = 1 - Math.min(1, Math.abs(clamped) * fadeRate);
    if (fadeTarget === 'none') {
      if (bg) bg.style.opacity = 1;
      if (content) {
        content.style.opacity = 1;
        content.style.transform = 'none';
      }
    } else if (fadeTarget === 'bg' && bg) {
      bg.style.opacity = fade;
    } else if (content) {
      content.style.opacity   = fade;
      content.style.transform = `translateY(${clamped * 60}px)`;
    }
  });
}

let ticking = false;
function onScroll() {
  if (!ticking) {
    requestAnimationFrame(() => { updateParallax(); ticking = false; });
    ticking = true;
  }
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
updateParallax();

// ---------- Scratch-to-reveal cards ----------
// Rewritten to fix:
//   Bug 2 — uses Pointer Events API (covers mouse, touch, stylus) instead of
//            the old split mousedown/touchstart approach.
//   Bug 3 — DPR (devicePixelRatio) scaling so the canvas is sharp on Retina.
//   Bug 4 — checkThreshold throttled to at most once per rAF frame via a
//            pending flag; no more getImageData on every pointer event.
//   Bug 5 — no per-card window listeners; a single shared resize handler
//            calls all cards' size() functions.
//   Bug 6 — .scratch-reveal-btn wired to revealCard() as accessible fallback.
//
// The external API (initScratchCard(root) → returns size fn) and all
// existing HTML class names / CSS transitions are preserved exactly.

function initScratchCard(root) {
  const canvas    = root.querySelector('.scratch-canvas');
  const card      = root.querySelector('.reveal-card');
  const hint      = root.querySelector('.scratch-hint');
  // Reveal button is a sibling of root (.scratch-wrap) inside .slide-frame
  const revealBtn = root.parentElement
                        ? root.parentElement.querySelector('.scratch-reveal-btn')
                        : null;
  const ctx       = canvas.getContext('2d');

  let done         = false;
  let hasScratched = false;
  let dragging     = false;
  let cachedRect   = null;   // cached at pointerdown — avoids repeated getBCR during drag
  let checkPending = false;  // throttle: at most one getImageData call per rAF
  let dpr          = window.devicePixelRatio || 1;

  // ---- Sizing — scales canvas for device pixel ratio ----
  function size() {
    dpr = window.devicePixelRatio || 1;
    const rect    = root.getBoundingClientRect();
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);
    // Keep CSS display size at logical pixels so the element still
    // occupies the correct space in the layout.
    canvas.style.width  = rect.width  + 'px';
    canvas.style.height = rect.height + 'px';
    if (!done && !hasScratched) paintCover();
  }

  // ---- Cover layer — Opaque Luxury White-Yellowish Creamy Surface ----
  function paintCover() {
    const w = canvas.width  / dpr;   // logical width
    const h = canvas.height / dpr;   // logical height
    ctx.save();
    ctx.scale(dpr, dpr);             // draw in logical pixel space
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    // 1. Solid opaque luxury white-yellowish creamy gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#FCF9F0');   // luminous ivory creamy-white
    grad.addColorStop(0.5, '#F7ECCF'); // warm yellowish cream
    grad.addColorStop(1, '#EDE0C0');   // warm golden champagne cream
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 2. Subtle gold micro-stipple texture
    ctx.fillStyle = 'rgba(197, 160, 89, 0.12)';
    for (let x = 6; x < w; x += 14) {
      for (let y = 6; y < h; y += 14) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }

    // 3. Royal gold border & inner decorative frame
    ctx.strokeStyle = '#C5A059';
    ctx.lineWidth = 1.5;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(4, 4, w - 8, h - 8, 6);
      ctx.stroke();
    } else {
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }

    // Inner dashed gold frame
    ctx.strokeStyle = 'rgba(197, 160, 89, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(8, 8, w - 16, h - 16, 4);
      ctx.stroke();
    } else {
      ctx.strokeRect(8, 8, w - 16, h - 16);
    }
    ctx.setLineDash([]);

    // 4. Corner star embellishments
    ctx.fillStyle = '#B8863F';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', 14, 14);
    ctx.fillText('✦', w - 14, 14);
    ctx.fillText('✦', 14, h - 14);
    ctx.fillText('✦', w - 14, h - 14);

    // 5. Central Typography & Emblem
    const cx = w / 2;
    const cy = h / 2;

    // Small decorative sparkle
    ctx.fillStyle = '#B8863F';
    ctx.font = '11px sans-serif';
    ctx.fillText('✧ ✦ ✧', cx, cy - 16);

    // Title: SCRATCH TO REVEAL
    ctx.fillStyle = '#482D13';
    ctx.font = '700 13px "Jost", "Cinzel", sans-serif';
    ctx.fillText('SCRATCH TO REVEAL', cx, cy + 3);

    // Subtitle: Rub or swipe to unveil details
    ctx.fillStyle = '#7E5A2A';
    ctx.font = 'italic 11px "Cormorant Garamond", Georgia, serif';
    ctx.fillText('Rub or swipe to unveil details', cx, cy + 19);

    ctx.restore();
  }

  let lastPoint = null;

  // ---- Erase a circle at logical coords (lx, ly) ----
  function scratchAt(lx, ly) {
    hasScratched = true;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(lx * dpr, ly * dpr, 24 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Smooth continuous line scratch between points ----
  function scratchLine(x1, y1, x2, y2) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 48 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 * dpr, y1 * dpr);
    ctx.lineTo(x2 * dpr, y2 * dpr);
    ctx.stroke();
  }

  // ---- Reveal sequence: canvas fade out → card fully visible → confetti ----
  function revealCard() {
    if (done) return;
    done = true;
    if (hint)      hint.style.display = 'none';
    if (revealBtn) revealBtn.classList.add('done');  // CSS hides it
    canvas.classList.add('done');   // CSS: opacity 0 over 0.4s
    card.classList.add('revealed');
    burstConfetti(root.getBoundingClientRect());
  }

  // ---- Threshold check — at most once per rAF frame (Bug 4 fix) ----
  function scheduleThresholdCheck() {
    if (checkPending || done) return;
    checkPending = true;
    requestAnimationFrame(() => {
      checkPending = false;
      if (done) return;
      const data    = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let cleared   = 0;
      // Sample every 12th pixel's alpha for speed
      for (let i = 3; i < data.length; i += 4 * 12) {
        if (data[i] < 45) cleared++;
      }
      const sampled = Math.ceil((data.length / 4) / 12);
      if (cleared / sampled > 0.40) revealCard();
    });
  }

  // ---- Pointer Events (Bug 2 fix) ----
  canvas.addEventListener('pointerdown', (e) => {
    if (done) return;
    dragging    = true;
    cachedRect  = canvas.getBoundingClientRect(); // cache once; avoids repeated layout in move
    const lx    = e.clientX - cachedRect.left;
    const ly    = e.clientY - cachedRect.top;
    lastPoint   = { x: lx, y: ly };
    canvas.setPointerCapture(e.pointerId);
    scratchAt(lx, ly);
    scheduleThresholdCheck();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || done || !lastPoint) return;
    const lx = e.clientX - cachedRect.left;
    const ly = e.clientY - cachedRect.top;
    scratchLine(lastPoint.x, lastPoint.y, lx, ly);
    lastPoint = { x: lx, y: ly };
    scheduleThresholdCheck();
  });

  canvas.addEventListener('pointerup',     () => { dragging = false; lastPoint = null; });
  canvas.addEventListener('pointercancel', () => { dragging = false; lastPoint = null; });

  // ---- Accessible reveal button (Bug 6 fix) ----
  if (revealBtn) revealBtn.addEventListener('click', revealCard);

  size(); // initial sizing

  // Return size fn so the caller can wire a single shared resize listener
  return size;
}

// Initialise all scratch cards and collect their size() functions.
// Bug 5 fix: one shared resize listener instead of 3×window.addEventListener.
const scratchResizeFns = [];
document.querySelectorAll('.scratch-wrap').forEach((root) => {
  scratchResizeFns.push(initScratchCard(root));
});
function onCardResize() {
  scratchResizeFns.forEach((fn) => fn());
}
window.addEventListener('resize', onCardResize);
window.addEventListener('orientationchange', onCardResize);

// ---------- Dynamic Viewport Height Sync (for Mobile Safari/Chrome/iOS/Android) ----------
function syncViewportHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}
window.addEventListener('resize', syncViewportHeight, { passive: true });
window.addEventListener('orientationchange', syncViewportHeight, { passive: true });
syncViewportHeight();

// ---------- Fullscreen API Management (Cross-device: Windows, Mac, Phone) ----------
function enterFullScreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
    return;
  }
  const docEl = document.documentElement;
  const requestFn = docEl.requestFullscreen || 
                    docEl.webkitRequestFullscreen || 
                    docEl.webkitRequestFullScreen || 
                    docEl.mozRequestFullScreen || 
                    docEl.msRequestFullscreen;
  if (requestFn) {
    try {
      const p = requestFn.call(docEl);
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (err) {}
  }
}

function exitFullScreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
    return;
  }
  const exitFn = document.exitFullscreen || 
                 document.webkitExitFullscreen || 
                 document.mozCancelFullScreen || 
                 document.msExitFullscreen;
  if (exitFn) {
    try {
      const p = exitFn.call(document);
      if (p && typeof p.catch === 'function') {
        p.catch(() => {});
      }
    } catch (err) {}
  }
}

function toggleFullScreen() {
  const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
  if (isFs) {
    exitFullScreen();
  } else {
    enterFullScreen();
  }
}

// 1. Attempt fullscreen on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enterFullScreen);
} else {
  enterFullScreen();
}
window.addEventListener('load', enterFullScreen);

// 2. Browser safeguard: any first touch, pointerdown, click or scroll triggers fullscreen
const triggerFullscreenEvents = ['click', 'touchstart', 'pointerdown'];
function triggerFullscreenOnFirstAction() {
  enterFullScreen();
  triggerFullscreenEvents.forEach((evt) => {
    window.removeEventListener(evt, triggerFullscreenOnFirstAction, { passive: true });
    document.removeEventListener(evt, triggerFullscreenOnFirstAction, { passive: true });
  });
}
triggerFullscreenEvents.forEach((evt) => {
  window.addEventListener(evt, triggerFullscreenOnFirstAction, { once: true, passive: true });
  document.addEventListener(evt, triggerFullscreenOnFirstAction, { once: true, passive: true });
});

// 3. Fullscreen toggle button wiring & icon state update
const fullscreenBtn = document.getElementById('fullscreen-toggle');
if (fullscreenBtn) {
  fullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullScreen();
  });
}

function updateFullscreenIcon() {
  const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
  const iconExpand = document.querySelector('.fs-icon-expand');
  const iconCompress = document.querySelector('.fs-icon-compress');
  if (iconExpand && iconCompress) {
    iconExpand.style.display = isFs ? 'none' : 'block';
    iconCompress.style.display = isFs ? 'block' : 'none';
  }
}
['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach((evt) => {
  document.addEventListener(evt, updateFullscreenIcon);
});

// ---------- Background Music: Ekadantaya Vakratundaya Instrumental ONLY ----------
const bgMusic    = document.getElementById('bg-music');
const muteBtn    = document.getElementById('mute-toggle');
let musicStarted = false;

if (bgMusic) {
  bgMusic.loop = true;
  bgMusic.volume = 0.75;

  // Ensure continuous looping across all browsers (Chrome, Safari, iOS, Android, Edge)
  bgMusic.addEventListener('ended', () => {
    bgMusic.currentTime = 0;
    bgMusic.play().catch(() => {});
  });

  bgMusic.addEventListener('play', () => {
    document.body.classList.add('music-playing');
  });

  bgMusic.addEventListener('pause', () => {
    if (bgMusic.muted || bgMusic.paused) {
      document.body.classList.remove('music-playing');
    }
  });
}

function startMusic() {
  if (!bgMusic) return;
  musicStarted = true;
  bgMusic.loop = true;
  bgMusic.muted = false;

  const playPromise = bgMusic.play();
  if (playPromise !== undefined) {
    playPromise.then(() => {
      document.body.classList.add('music-playing');
    }).catch(() => {
      // Browser autoplay policy requires user interaction first.
      // Handled seamlessly by the first touch/click/scroll listeners below.
    });
  }
}

// 1. Attempt immediate playback when user opens the webpage
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMusic);
} else {
  startMusic();
}
window.addEventListener('load', startMusic);

// 2. Browser autoplay safeguard: any first touch, click, scroll or keypress starts music immediately
const unlockAudioEvents = ['click', 'touchstart', 'pointerdown', 'scroll', 'keydown', 'wheel'];
function unlockAudioOnFirstAction() {
  startMusic();
  unlockAudioEvents.forEach((evt) => {
    window.removeEventListener(evt, unlockAudioOnFirstAction, { passive: true });
    document.removeEventListener(evt, unlockAudioOnFirstAction, { passive: true });
  });
}
unlockAudioEvents.forEach((evt) => {
  window.addEventListener(evt, unlockAudioOnFirstAction, { once: true, passive: true });
  document.addEventListener(evt, unlockAudioOnFirstAction, { once: true, passive: true });
});

// 3. Tab visibility change: resume audio if user switches back to the tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && musicStarted && bgMusic && !bgMusic.muted && bgMusic.paused) {
    bgMusic.play().catch(() => {});
  }
});

// 4. Mute / Unmute toggle button
if (muteBtn && bgMusic) {
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!musicStarted || bgMusic.paused) {
      startMusic();
      return;
    }
    bgMusic.muted = !bgMusic.muted;
    document.body.classList.toggle('music-playing', !bgMusic.muted);
  });
}

// ---------- Copy Address to Clipboard with Toast Notification ----------
const btnCopyAddress = document.getElementById('btnCopyAddress');
const toastEl        = document.getElementById('toast');
let toastTimer       = null;

function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2800);
}

if (btnCopyAddress) {
  btnCopyAddress.addEventListener('click', () => {
    const venueAddress = 'Courtyard by Marriott, Fatehabad Road, Tajganj, Agra, Uttar Pradesh 282001 (Haldi venue — wedding venue TBC)';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(venueAddress).then(() => {
        showToast('✓ Haldi venue address copied!');
      }).catch(() => {
        showToast('📍 Courtyard by Marriott, Agra (Haldi venue)');
      });
    } else {
      showToast('📍 Courtyard by Marriott, Agra (Haldi venue)');
    }
  });
}

// ---------- Lightweight confetti burst ----------
// Canvas is pinned to the same width/position as the invite card (not the
// full browser window) so bursts stay inside the card on wide screens.
const confettiCanvas = document.getElementById('confetti-canvas');
const cctx           = confettiCanvas.getContext('2d');
const invite         = document.querySelector('.invite');
let particles        = [];
let confettiOffsetX  = 0;
const colors = ['#b8863f', '#6d1f2e', '#e6c88a', '#fbf4e8', '#2c1f3d'];

function resizeConfettiCanvas() {
  const rect                  = invite.getBoundingClientRect();
  confettiCanvas.style.left   = rect.left  + 'px';
  confettiCanvas.style.width  = rect.width + 'px';
  confettiCanvas.width        = rect.width;
  confettiCanvas.height       = window.innerHeight;
  confettiOffsetX             = rect.left;
}
window.addEventListener('resize', resizeConfettiCanvas);
window.addEventListener('orientationchange', resizeConfettiCanvas);
resizeConfettiCanvas();

function burstConfetti(rect) {
  const originX = rect.left + rect.width  / 2 - confettiOffsetX;
  const originY = rect.top  + rect.height / 2;
  for (let i = 0; i < 70; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x: originX, y: originY,
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed - 2,
      size:  4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot:   Math.random() * Math.PI,
      vr:    (Math.random() - 0.5) * 0.3,
      life:  0,
    });
  }
  // Single animating flag prevents duplicate RAF loops (existing behaviour preserved)
  if (!animating) { animating = true; requestAnimationFrame(tick); }
}

let animating = false;
function tick() {
  cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  particles.forEach((p) => {
    p.vy += 0.12; p.x += p.vx; p.y += p.vy;
    p.rot += p.vr; p.life++;
    cctx.save();
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    cctx.restore();
  });
  particles = particles.filter((p) => p.life < 140 && p.y < confettiCanvas.height + 40);
  if (particles.length) { requestAnimationFrame(tick); }
  else                  { animating = false; }
}

// ---------- Progress dots: click to jump, highlight current section ----------
const navButtons = Array.from(document.querySelectorAll('.progress-nav button'));
navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.target).scrollIntoView({ behavior: 'smooth' });
  });
});

function updateNav() {
  const center = window.innerHeight / 2;
  let closest = null, closestDist = Infinity;
  sections.forEach(({ el }) => {
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - center);
    if (dist < closestDist) { closestDist = dist; closest = el.id; }
  });
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.target === closest));
}
window.addEventListener('scroll', () => requestAnimationFrame(updateNav), { passive: true });
updateNav();

// ---------- CSS Wedding Particles (spec §16) ----------
// Injects <span class="particle"> elements into event slide frames.
// JS only sets per-particle CSS custom properties; all animation is
// driven by the @keyframes float-particle in style.css.
// Skipped entirely when prefers-reduced-motion is set.
(function injectParticles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Palette: gold dots, gold-light dots, rose sparkles, ivory dust, petal-shapes
  const PALETTE = [
    { color: 'rgba(184,134,63,0.40)',  radius: '50%',                                    opacity: 0.50 },
    { color: 'rgba(240,217,168,0.50)', radius: '50%',                                    opacity: 0.55 },
    { color: 'rgba(109,31,46,0.28)',   radius: '2px',                                    opacity: 0.38 },
    { color: 'rgba(246,236,217,0.60)', radius: '50%',                                    opacity: 0.65 },
    { color: 'rgba(184,134,63,0.30)',  radius: '60% 40% 60% 40% / 40% 60% 40% 60%',    opacity: 0.42 },
  ];

  // Inject into every event section and the RSVP closing slide
  const targets = [
    '#names .slide-frame',
    '#sangeet .slide-frame',
    '#haldi .slide-frame',
    '#wedding .slide-frame',
    '#compliments .slide-frame',
    '#rsvp .slide-frame',
  ];

  targets.forEach((sel) => {
    const frame = document.querySelector(sel);
    if (!frame) return;

    for (let i = 0; i < 10; i++) {
      const type = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      const p    = document.createElement('span');
      p.className = 'particle';
      p.setAttribute('aria-hidden', 'true'); // decorative — invisible to screen readers
      p.style.setProperty('--p-x',       `${5  + Math.random() * 88}%`);
      p.style.setProperty('--p-y',       `${10 + Math.random() * 78}%`);
      p.style.setProperty('--p-size',    `${2  + Math.random() *  5}px`);
      p.style.setProperty('--p-color',   type.color);
      p.style.setProperty('--p-radius',  type.radius);
      p.style.setProperty('--p-opacity', type.opacity);
      p.style.setProperty('--p-dur',     `${7  + Math.random() *  9}s`);
      p.style.setProperty('--p-delay',   `${    Math.random()  *  7}s`);
      p.style.setProperty('--p-drift',   `${(Math.random() - 0.5) * 28}px`);
      p.style.setProperty('--p-spin',    `${    Math.random()  * 360}deg`);
      frame.appendChild(p);
    }
  });
}());
