// ---------- Envelope tap-to-open ----------
// Client spec: tap → screen zooms into the envelope → parents' names slide
// appears. So the landing scene is a gate we pass through once, not a
// section people scroll past on their own.
const envelope = document.getElementById('envelope');
const tapLabel = document.querySelector('.tap-label');
const landingSection = document.getElementById('landing');

envelope.addEventListener('click', () => {
  if (envelope.classList.contains('opened')) return;
  envelope.classList.add('opened');       // triggers the envelope-zoom keyframes
  tapLabel.classList.add('hide');
  document.documentElement.classList.remove('pre-open'); // unblur bg + unlock scroll
  landingSection.classList.add('exiting'); // whole gate screen dissolves with it
  startMusic();

  // once the zoom + fade have visually finished, remove slide 1 from the
  // document entirely — not just scroll past it, actually gone — so there
  // is nothing above the Names section to scroll back up into.
  setTimeout(() => {
    landingSection.style.display = 'none';
  }, 950);
}, { once: true });

// ---------- Scroll-linked parallax + fade ----------
// Every section's background, garland, and text move and fade at their own
// speed as it passes through the viewport — background slowest (feels far
// away), garland mid-speed, text fades fastest so it doesn't linger.
// Individual sections can override how gradually their text fades via
// data-fade-rate (lower = slower, more gradual reveal while scrolling).
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const sections = Array.from(document.querySelectorAll('.section:not(#landing)')).map((el) => ({
  el,
  bg: el.querySelector('.section-bg'),
  hang: el.querySelector('.hang-wrap'),
  content: el.querySelector('.content'),
  fadeRate: parseFloat(el.dataset.fadeRate) || 1.6,
  fadeTarget: el.dataset.fadeTarget || 'content', // 'bg' for sections whose text is baked into the artwork
}));

function updateParallax() {
  const vh = window.innerHeight;
  const center = vh / 2;

  sections.forEach(({ el, bg, hang, content, fadeRate, fadeTarget }) => {
    const rect = el.getBoundingClientRect();
    // -1 when section-top is fully below viewport top edge worth of travel,
    // 0 when section is centered, +1 when it has fully passed upward.
    const progress = (center - (rect.top + rect.height / 2)) / (vh / 2 + rect.height / 2);
    const clamped = Math.max(-1, Math.min(1, progress));
    // only backgrounds explicitly marked .parallax-bg drift on scroll --
    // event sections keep their background locked so the scratch-card
    // rectangle never separates from the artwork underneath it
    const bgMoves = bg && bg.classList.contains('parallax-bg');

    if (!reduceMotion) {
      if (bgMoves) bg.style.transform = `translateY(${clamped * -34}px)`;
      if (hang) hang.style.transform = `translateY(${clamped * 46}px)`;
    }

    const fade = 1 - Math.min(1, Math.abs(clamped) * fadeRate);
    if (fadeTarget === 'bg' && bg) {
      bg.style.opacity = fade;
    } else if (content) {
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
// Spec: the info card is visible faintly through a light (10% opacity) tint
// while scratching. Once cleared, the tint disappears completely as one
// piece, and a beat later — not simultaneously — the card "arrives" with
// its own pop, confetti firing on that arrival, not on the scratching itself.
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(184, 134, 63, 0.1)'; // 10% opacity gold tint per spec
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(90, 58, 26, 0.55)';
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
      hint.style.display = 'none';
      canvas.classList.add('done'); // tint fades out whole (0.4s, see CSS)
      // wait for the tint to be fully gone, then let the card "arrive"
      setTimeout(() => {
        card.classList.add('revealed');
        burstConfetti(root.getBoundingClientRect());
      }, 400);
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

// ---------- Background music ----------
// Spec: same ambient track as the reference site. We have no way to lift
// audio off someone else's site (copyright, plus it's just not fetchable
// the way the PDF/PNGs were) — so this is wired and ready to go the moment
// you drop a licensed mp3 at assets/bg-music.mp3. Starts on the envelope
// tap, which conveniently is also the user gesture browsers require before
// they'll allow audio to play at all.
const bgMusic = document.getElementById('bg-music');
const muteBtn = document.getElementById('mute-toggle');
let musicStarted = false;

function startMusic() {
  if (musicStarted || !bgMusic) return;
  musicStarted = true;
  bgMusic.volume = 0.55;
  bgMusic.play().catch(() => { /* no file yet, or browser blocked it — fail quietly */ });
}

if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    bgMusic.muted = !bgMusic.muted;
    muteBtn.textContent = bgMusic.muted ? '\u{1F507}' : '\u{1F50A}';
  });
}

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
