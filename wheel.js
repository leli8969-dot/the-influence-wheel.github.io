/* ════════════════════════════════════════════════════════
   wheel.js – Lucky Wheel (Flat Design, No Letters)
   Landing page: yellow minimal palette, fan-out on hover
   Voting wheel: colorful per-option segments
   ════════════════════════════════════════════════════════ */

const OPT_COLORS = [
  '#FF85C8','#ADFF70','#8FD4F5','#FFD35C',
  '#90EE90','#FF7070','#C58BF2','#FFB347',
];

class InfluenceWheel {
  constructor(canvas, opts = {}) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.rotation = 0;
    this.segments = [];
    this.spinning = false;
    this.velocity = 0;
    this.idleAnim = null;
    this.spinAnim = null;
  }

  setData(options, votes) {
    const total = votes.reduce((a, b) => a + b, 0);
    const equal = (Math.PI * 2) / options.length;
    this.segments = options.map((label, i) => ({
      label, votes: votes[i] || 0,
      arc:   total > 0 ? ((votes[i] || 0) / total) * Math.PI * 2 : equal,
      color: OPT_COLORS[i % OPT_COLORS.length],
    }));
  }

  // ── Draw – flat, no strokes, no center circle ────────
  draw() {
    const { ctx, canvas, rotation, segments } = this;
    if (!segments.length) return;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const r  = Math.min(cx, cy) - 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let angle = rotation - Math.PI / 2;
    segments.forEach(seg => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + seg.arc);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      angle += seg.arc;
    });
  }

  startFastSpin() {
    if (this.spinning) return;
    this.spinning = true; this.velocity = 0.18;
    const tick = () => {
      if (!this.spinning) return;
      this.rotation += this.velocity; this.draw();
      this.spinAnim = requestAnimationFrame(tick);
    };
    this.spinAnim = requestAnimationFrame(tick);
  }

  stopAndDetect(onComplete) {
    if (!this.spinning) return;
    this.spinning = false; cancelAnimationFrame(this.spinAnim);
    const startRot = this.rotation;
    const extraRot = (1.5 + Math.random() * 2.5) * Math.PI * 2;
    const duration = 2800 + Math.random() * 1400;
    const startTime = performance.now();
    const decel = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      this.rotation = startRot + extraRot * (1 - Math.pow(1 - t, 4));
      this.draw();
      if (t < 1) this.spinAnim = requestAnimationFrame(decel);
      else if (onComplete) onComplete(this.detectWinner());
    };
    this.spinAnim = requestAnimationFrame(decel);
  }

  detectWinner() {
    if (!this.segments.length) return 0;
    const TWO_PI = Math.PI * 2;
    const norm   = ((-this.rotation) % TWO_PI + TWO_PI) % TWO_PI;
    let cum = 0;
    for (let i = 0; i < this.segments.length; i++) {
      if (norm >= cum && norm < cum + this.segments[i].arc) return i;
      cum += this.segments[i].arc;
    }
    return this.segments.length - 1;
  }

  stopFastSpin() {
    this.spinning = false;
    cancelAnimationFrame(this.spinAnim);
  }

  spinToWinner(winnerIdx) {
    return new Promise(resolve => {
      if (!this.segments.length) return resolve(winnerIdx);
      this.spinning = false; cancelAnimationFrame(this.spinAnim);
      const TWO_PI   = Math.PI * 2;
      const startRot = this.rotation;
      let cum = 0;
      for (let i = 0; i < winnerIdx; i++) cum += this.segments[i].arc;
      const winnerMid = cum + this.segments[winnerIdx].arc / 2;
      const extraSpins  = (4 + Math.random() * 3) * TWO_PI;
      const normalised  = ((-winnerMid - startRot) % TWO_PI + TWO_PI) % TWO_PI;
      const targetRot   = startRot + normalised + extraSpins;
      const duration    = 4000 + Math.random() * 1200;
      const startTime   = performance.now();
      this.spinning     = true;
      const animate = (now) => {
        const t      = Math.min((now - startTime) / duration, 1);
        this.rotation = startRot + (targetRot - startRot) * (1 - Math.pow(1 - t, 4));
        this.draw();
        if (t < 1) this.spinAnim = requestAnimationFrame(animate);
        else { this.spinning = false; resolve(winnerIdx); }
      };
      this.spinAnim = requestAnimationFrame(animate);
    });
  }
}

/* ════════════════════════════════════════════════════════
   Landing Page Wheel
   Minimalist, yellow palette, NO letters
   Fan-out + rotation on hover
   ════════════════════════════════════════════════════════ */
function initLandingWheel() {
  const canvas = document.getElementById('landing-wheel-canvas');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const SIZE = canvas.width, CX = SIZE/2, CY = SIZE/2;
  const R    = SIZE/2 - 35;

  // Yellow tones – minimalist, no letters
  const SEGS = [
    { arc: 1.45, color: '#FFF500' },
    { arc: 0.50, color: '#FFF500' },
    { arc: 1.18, color: '#FFF500' },
    { arc: 0.30, color: '#FFF500' },
    { arc: 1.20, color: '#FFF500' },
    { arc: 0.88, color: '#FFF500' },
    { arc: 0.77, color: '#FFF500' },
  ];

  let rotation = -0.5, explode = 0, rotSpeed = 0;
  let hovering = false, animId = null;

  function draw(rot, exp) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    let angle = rot;
    SEGS.forEach(seg => {
      const mid = angle + seg.arc / 2;
      const ox  = Math.cos(mid) * exp;
      const oy  = Math.sin(mid) * exp;
      ctx.beginPath();
      ctx.moveTo(CX + ox, CY + oy);
      ctx.arc(CX + ox, CY + oy, R, angle, angle + seg.arc);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      // Thin 1px black divider between segments
      ctx.fillStyle = seg.color;
      ctx.fill();
      // ← hier keine stroke-Zeilen mehr
      angle += seg.arc;
    });
  }

  function tick() {
    rotSpeed = hovering
      ? Math.min(rotSpeed + 0.0003, 0.009)
      : rotSpeed * 0.93;
    rotation += rotSpeed;
    const et = hovering ? 20 : 0;
    explode  += (et - explode) * 0.1;
    draw(rotation, explode);
    const active = hovering || Math.abs(rotSpeed) > 0.0003 || Math.abs(et - explode) > 0.3;
    animId = active ? requestAnimationFrame(tick) : null;
  }

  draw(rotation, 0);

  const wrapper = document.getElementById('home-logo-col');
  const rows    = document.querySelectorAll('#home-bubbles .home-text-row');

  wrapper.addEventListener('mouseenter', () => {
    hovering = true;
    rows.forEach((r, i) => {
      r.style.transition = 'transform .4s ease';
      r.style.transform  = `translateX(${i % 2 === 0 ? 8 : -6}px)`;
    });
    if (!animId) animId = requestAnimationFrame(tick);
  });
  wrapper.addEventListener('mouseleave', () => {
    hovering = false;
    rows.forEach(r => { r.style.transition = 'transform .5s ease'; r.style.transform = ''; });
    if (!animId) animId = requestAnimationFrame(tick);
  });
}
const initLandingHover = initLandingWheel;
