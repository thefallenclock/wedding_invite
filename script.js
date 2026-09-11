// ---------- Envelope tap-to-open ----------
const envelope = document.getElementById('envelope');
const tapLabel = document.querySelector('.tap-label');
const scrollCue = document.getElementById('scroll-cue');

envelope.addEventListener('click', () => {
  if (envelope.classList.contains('opened')) return;
  envelope.classList.add('opened');
  tapLabel.classList.add('hide');
  document.documentElement.classList.remove('pre-open');
  burstConfetti(envelope.getBoundingClientRect());
  setTimeout(() => scrollCue.classList.add('show'), 500);
}, { once: true });

// ---------- Scroll-linked parallax + fade ----------
// Every section's background, garland, and text move and fade at their own
// speed as it passes through the viewport — background slowest (feels far
// away), garland mid-speed, text fades fastest so it doesn't linger.
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sections = Array.from(document.querySelectorAll('.section')).map((el) => ({
  el,
  bg: el.querySelector('.section-bg'),
  hang: el.querySelector('.hang-wrap'),
  content: el.querySelector('.content'),
}));

function updateParallax() {
  const vh = window.innerHeight;
  const center = vh / 2;

  sections.forEach(({ el, bg, hang, content }) => {
    const rect = el.getBoundingClientRect();
    // -1 when section-top is fully below viewport top edge worth of travel,
    // 0 when section is centered, +1 when it has fully passed upward.
    const progress = (center - (rect.top + rect.height / 2)) / (vh / 2 + rect.height / 2);
    const clamped = Math.max(-1, Math.min(1, progress));

    if (!reduceMotion) {
      if (bg) bg.style.transform = `translateY(${clamped * -34}px)`;
      if (hang) hang.style.transform = `translateY(${clamped * 46}px)`;
    }

    if (content) {
      // fades out faster than it fades in: full opacity only near center
      const fade = 1 - Math.min(1, Math.abs(clamped) * 1.6);
      content.style.opacity = fade;
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
function initScratchCard(root) {
  const canvas = root.querySelector('.scratch-canvas');
  const card = root.querySelector('.reveal-card');
  const hint = root.querySelector('.scratch-hint');
  const ctx = canvas.getContext('2d');
  let done = false;

  function size() {
    const rect = root.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    paintCover();
  }

  function paintCover() {
    ctx.globalCompositeOperation = 'source-over';
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#caa15c');
    grad.addColorStop(1, '#8a5a2b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 15px Jost, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('scratch to reveal', canvas.width / 2, canvas.height / 2);
  }

  function scratchAt(x, y) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }

  function checkThreshold() {
    if (done) return;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let cleared = 0;
    const total = data.length / 4;
    for (let i = 3; i < data.length; i += 4 * 12) { // sample every 12th pixel for speed
      if (data[i] < 40) cleared++;
    }
    const sampled = Math.ceil(total / 12);
    if (cleared / sampled > 0.45) {
      done = true;
      canvas.classList.add('done');
      canvas.style.transition = 'opacity 0.5s ease';
      canvas.style.opacity = '0';
      card.classList.add('show');
      hint.style.display = 'none';
      burstConfetti(root.getBoundingClientRect());
    }
  }

  let dragging = false;
  const start = (e) => { dragging = true; const p = pos(e); scratchAt(p.x, p.y); };
  const move = (e) => {
    if (!dragging) return;
    e.preventDefault();
    const p = pos(e);
    scratchAt(p.x, p.y);
    checkThreshold();
  };
  const end = () => { dragging = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  window.addEventListener('resize', size);
  size();
}

document.querySelectorAll('.scratch-wrap').forEach(initScratchCard);

// ---------- Lightweight confetti burst ----------
// Canvas is pinned to the same width/position as the invite card (not the
// full browser window) so bursts stay inside the card on wide screens.
const confettiCanvas = document.getElementById('confetti-canvas');
const cctx = confettiCanvas.getContext('2d');
const invite = document.querySelector('.invite');
let particles = [];
let confettiOffsetX = 0;
const colors = ['#b8863f', '#6d1f2e', '#e6c88a', '#fbf4e8', '#2c1f3d'];

function resizeConfettiCanvas() {
  const rect = invite.getBoundingClientRect();
  confettiCanvas.style.left = rect.left + 'px';
  confettiCanvas.style.width = rect.width + 'px';
  confettiCanvas.width = rect.width;
  confettiCanvas.height = window.innerHeight;
  confettiOffsetX = rect.left;
}
window.addEventListener('resize', resizeConfettiCanvas);
resizeConfettiCanvas();

function burstConfetti(rect) {
  const originX = rect.left + rect.width / 2 - confettiOffsetX;
  const originY = rect.top + rect.height / 2;
  for (let i = 0; i < 70; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 0,
    });
  }
  if (!animating) { animating = true; requestAnimationFrame(tick); }
}

let animating = false;
function tick() {
  cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  particles.forEach((p) => {
    p.vy += 0.12;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life += 1;
    cctx.save();
    cctx.translate(p.x, p.y);
    cctx.rotate(p.rot);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    cctx.restore();
  });
  particles = particles.filter((p) => p.life < 140 && p.y < confettiCanvas.height + 40);
  if (particles.length) {
    requestAnimationFrame(tick);
  } else {
    animating = false;
  }
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
  let closest = null;
  let closestDist = Infinity;
  sections.forEach(({ el }) => {
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top + rect.height / 2 - center);
    if (dist < closestDist) { closestDist = dist; closest = el.id; }
  });
  navButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.target === closest));
}
window.addEventListener('scroll', () => requestAnimationFrame(updateNav), { passive: true });
updateNav();
