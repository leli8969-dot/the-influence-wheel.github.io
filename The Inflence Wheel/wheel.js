/* ════════════════════════════════════════════════════════
   wheel.js – Glücksrad (FLAT DESIGN)

   Design:
   • KEIN Stroke zwischen Segmenten (flat)
   • KEIN Center-Kreis
   • Pointer: weißes SVG-Dreieck mit 4px schwarzem Stroke
   • Gewinner-Erkennung aus tatsächlicher Position
   ════════════════════════════════════════════════════════ */

const OPT_COLORS = [
  '#FF85C8', // Pink
  '#ADFF70', // Lime
  '#8FD4F5', // Sky Blue
  '#FFD35C', // Gold
  '#90EE90', // Pale Green
  '#FF7070', // Coral
  '#C58BF2', // Lavender
  '#FFB347', // Peach
];

class InfluenceWheel {
  constructor(canvas, opts = {}) {
    this.canvas     = canvas;
    this.ctx        = canvas.getContext('2d');
    this.rotation   = 0;
    this.segments   = [];
    this.spinning   = false;
    this.velocity   = 0;
    this.idleAnim   = null;
    this.spinAnim   = null;
    this.showLabels = opts.showLabels ?? false;
  }

  setData(options, votes) {
    const total = votes.reduce((a, b) => a + b, 0);
    const equal = (Math.PI * 2) / options.length;
    this.segments = options.map((label, i) => ({
      label,
      votes: votes[i] || 0,
      arc:   total > 0 ? ((votes[i] || 0) / total) * Math.PI * 2 : equal,
      color: OPT_COLORS[i % OPT_COLORS.length],
    }));
  }

  /* ── Zeichnen: FLAT – kein Stroke, kein Center-Kreis ── */
  draw() {
    const { ctx, canvas, rotation, segments } = this;
    if (!segments.length) return;

    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    const r  = Math.min(cx, cy) - 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Pointer oben → Segmente starten bei -π/2 + rotation
    let angle = rotation - Math.PI / 2;

    segments.forEach(seg => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + seg.arc);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      // ← KEIN ctx.stroke() → Flat Design

      // Optionale Labels
      if (this.showLabels && seg.label) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle + seg.arc / 2);
        ctx.textAlign  = 'right';
        ctx.fillStyle  = 'rgba(0,0,0,0.6)';
        ctx.font       = `bold ${r > 150 ? 16 : 12}px Inter, sans-serif`;
        const txt      = seg.label.length > 12 ? seg.label.slice(0, 11) + '…' : seg.label;
        ctx.fillText(txt, r - 16, 6);
        ctx.restore();
      }

      angle += seg.arc;
    });
    // ← KEIN Center-Kreis → Flat Design
  }

  /* ── Idle-Rotation (sanft) ───────────────────────────── */
  startIdle() {
    const tick = () => {
      if (this.spinning) return;
      this.rotation += 0.004;
      this.draw();
      this.idleAnim = requestAnimationFrame(tick);
    };
    this.idleAnim = requestAnimationFrame(tick);
  }
  stopIdle() { cancelAnimationFrame(this.idleAnim); }

  /* ══ START – frei und schnell drehen ════════════════════ */
  startFastSpin() {
    if (this.spinning) return;
    this.spinning = true;
    this.velocity = 0.18; // rad/Frame

    const tick = () => {
      if (!this.spinning) return;
      this.rotation += this.velocity;
      this.draw();
      this.spinAnim = requestAnimationFrame(tick);
    };
    this.spinAnim = requestAnimationFrame(tick);
  }

  /* ══ STOP – abbremsen, dann Gewinner bestimmen ══════════
     callback(winnerIndex) wird nach dem Abbremsen aufgerufen
  ════════════════════════════════════════════════════════ */
  stopAndDetect(onComplete) {
    if (!this.spinning) return;
    this.spinning = false;
    cancelAnimationFrame(this.spinAnim);

    const startRot  = this.rotation;
    const extraRot  = (1.5 + Math.random() * 2.5) * Math.PI * 2;
    const targetRot = startRot + extraRot;
    const duration  = 2800 + Math.random() * 1400;
    const startTime = performance.now();

    const decel = (now) => {
      const t      = Math.min((now - startTime) / duration, 1);
      const eased  = 1 - Math.pow(1 - t, 4); // easeOutQuart
      this.rotation = startRot + extraRot * eased;
      this.draw();

      if (t < 1) {
        this.spinAnim = requestAnimationFrame(decel);
      } else {
        if (onComplete) onComplete(this.detectWinner());
      }
    };
    this.spinAnim = requestAnimationFrame(decel);
  }

  /* ══ Gewinner aus aktueller Rotation bestimmen ══════════
     Mathematik: Pointer oben → norm = (-rotation) mod 2π
  ════════════════════════════════════════════════════════ */
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

  pickWinner() {
    const total = this.segments.reduce((s, seg) => s + seg.arc, 0);
    let rand = Math.random() * total;
    for (let i = 0; i < this.segments.length; i++) {
      rand -= this.segments[i].arc;
      if (rand <= 0) return i;
    }
    return this.segments.length - 1;
  }

  stopFastSpin() {
    this.spinning = false;
    cancelAnimationFrame(this.spinAnim);
  }
}
