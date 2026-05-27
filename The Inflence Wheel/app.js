/* ════════════════════════════════════════════════════════
   app.js – The Influence Wheel (Vollständig überarbeitet)
   ════════════════════════════════════════════════════════ */

/* ── State ───────────────────────────────────────────── */
const S = {
  view:         'home',
  mode:         null,         // 'alone' | 'group'
  choiceMode:   'single',
  poll:         null,
  counts:       [],
  votes:        [],
  isHost:       false,
  winner:       null,
  spinWheel:    null,
  subs:         [],
  timerSec:     120,
  timerPaused:  false,
  timerInterval: null,
  hostVoted:    false,
  multiSelected: new Set(),   // für Multiple Choice
};

/* ── Init ────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  updateBadge();
  buildSetupRows();
  initLandingWheel();
  route();
  // Keyboard für Join-Modal
  document.getElementById('join-code-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') submitJoin(); });
});

/* ── Badge ───────────────────────────────────────────── */
function updateBadge() {
  // Demo-Badge ist ausgeblendet (per CSS display:none)
  // Kein UI-Hinweis auf Demo/Live-Modus mehr nötig
}

/* ════════════════════════════════════════════════════════
   ROUTER
   ════════════════════════════════════════════════════════ */
function route() {
  const p = new URLSearchParams(location.search);
  if (p.has('addvote'))   { handleAddVoteToken(p); return; }
  if (p.has('poll')) {
    const id = p.get('poll');
    p.get('host') === '1' ? enterHost(id) : enterVote(id);
    return;
  }
  if (p.has('v')) {
    try { enterVoteNoDB(JSON.parse(atob(p.get('v')))); } catch { showView('home'); }
    return;
  }
  showView('home');
}

/* ════════════════════════════════════════════════════════
   VIEW MANAGER + NAV
   ════════════════════════════════════════════════════════ */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(`view-${name}`);
  if (el) {
    el.classList.remove('hidden');
    el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
  }
  S.view = name;
  renderNav(name);
}

function renderNav(view) {
  const L = document.getElementById('nav-left');
  const R = document.getElementById('nav-right');

  const cfg = {
    home:  { l: '',                        r: '+ START' },
    mode:  { l: '',                        r: '+ START',           rDis: () => !S.mode },
    setup: { l: '',                        r: S.mode === 'alone' ? '+ SPIN THE WHEEL' : '+ CREATE LINK' },
    share: { l: '< BACK',              r: '> START VOTING' },
    host:  { l: '< CREATE NEW',       r: 'END VOTING' },
    vote:  { l: '< CLOSE',          r: '' },
    spin:  { l: S.mode === 'alone' ? '< BACK TO OPTIONS' : '< BACK', r: '' },
  }[view] || { l: '', r: '' };

  L.textContent = cfg.l || '';
  R.textContent = typeof cfg.r === 'function' ? cfg.r() : (cfg.r || '');
  L.disabled    = !cfg.l;
  R.disabled    = cfg.rDis ? cfg.rDis() : !R.textContent;
}

function onNavLeft() {
  ({
    mode:  () => goHome(),
    setup: () => showView('mode'),
    share: () => showView('setup'),
    host:  () => { cleanupSubs(); goHome(); },
    vote:  () => { cleanupSubs(); goHome(); },
    spin:  () => {
      if (S.mode === 'alone') {
        // ALONE: zurück zur Setup-Seite (nicht zu Host mit Timer!)
        buildSetupRows();
        showView('setup');
      } else {
        showView(S.isHost ? 'host' : 'vote');
      }
    },
  }[S.view] || (() => {}))();
}

function onNavRight() {
  ({
    home:  () => showView('mode'),
    mode:  () => { if (S.mode) showView('setup'); },
    setup: () => submitSetup(),
    share: () => enterHost(S.poll.id),
    host:  () => endVoting(),
  }[S.view] || (() => {}))();
}

/* ════════════════════════════════════════════════════════
   HOME – Hover-Animation auf Landing-Logo
   ════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════
   LANDING PAGE – Animiertes Wheel-Logo (Canvas)

   Segmente: W-H-E-E-L in bunten Pie-Slices
   Hover:    Rad dreht sich, Segmente fächern nach außen
   Leave:    Alles kehrt smooth zurück
   ════════════════════════════════════════════════════════ */
function initLandingWheel() {
  const canvas = document.getElementById('landing-wheel-canvas');
  if (!canvas) return;

  const ctx  = canvas.getContext('2d');
  const SIZE = canvas.width;   // 440
  const CX   = SIZE / 2;
  const CY   = SIZE / 2;
  const R    = SIZE / 2 - 12; // Radius

  // Segmente passend zum Original-Logo
  // arc-Summe = 6.28 ≈ 2π
  const SEGS = [
    { arc: 1.45, color: '#ADFF70', letter: 'W', tilt:  0.55 }, // Lime Green
    { arc: 0.50, color: '#8FD4F5', letter: null              }, // Sky Blue (filler)
    { arc: 1.18, color: '#FFD35C', letter: 'H', tilt: -0.25 }, // Gold
    { arc: 0.30, color: '#C58BF2', letter: null              }, // Lavender (filler)
    { arc: 1.20, color: '#FF85C8', letter: 'E', tilt:  0.35 }, // Pink
    { arc: 0.88, color: '#90EE90', letter: 'E', tilt: -0.55 }, // Green
    { arc: 0.77, color: '#FF7070', letter: 'L', tilt:  0.15 }, // Coral/Red
    // total: 1.45+0.5+1.18+0.3+1.2+0.88+0.77 = 6.28 ✓
  ];

  let rotation = -0.5;   // Startwert: W links, schöne Positionierung
  let explode  = 0;      // Segmente nach außen verschieben
  let rotSpeed = 0;      // aktuelle Rotationsgeschwindigkeit
  let hovering = false;
  let animId   = null;

  function drawWheel(rot, exp) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    let angle = rot;

    SEGS.forEach(seg => {
      const mid = angle + seg.arc / 2;
      const ox  = Math.cos(mid) * exp;  // Offset X
      const oy  = Math.sin(mid) * exp;  // Offset Y

      // Segment zeichnen
      ctx.beginPath();
      ctx.moveTo(CX + ox, CY + oy);
      ctx.arc(CX + ox, CY + oy, R, angle, angle + seg.arc);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      // Flat Design: kein Stroke

      // Buchstabe zeichnen
      if (seg.letter) {
        const fSize  = Math.max(52, Math.min(96, seg.arc * 64));
        const dist   = R * 0.52;
        const lx     = CX + ox + Math.cos(mid) * dist;
        const ly     = CY + oy + Math.sin(mid) * dist;

        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate(mid + Math.PI / 2 + (seg.tilt || 0));
        ctx.font         = `900 ${fSize}px Inter, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // Schwarzer Outline (stroke zuerst)
        ctx.strokeStyle = 'rgba(0,0,0,0.88)';
        ctx.lineWidth   = fSize * 0.11;
        ctx.lineJoin    = 'round';
        ctx.strokeText(seg.letter, 0, 0);

        // Weißes Fill
        ctx.fillStyle = '#ffffff';
        ctx.fillText(seg.letter, 0, 0);

        ctx.restore();
      }

      angle += seg.arc;
    });
  }

  function tick() {
    // Rotationsgeschwindigkeit anpassen
    if (hovering) {
      rotSpeed = Math.min(rotSpeed + 0.00035, 0.009); // Beschleunigen
    } else {
      rotSpeed *= 0.93; // Abbremsen
    }

    rotation += rotSpeed;

    // Explode-Faktor smooth interpolieren
    const explodeTarget = hovering ? 18 : 0;
    explode += (explodeTarget - explode) * 0.1;

    drawWheel(rotation, explode);

    const stillMoving =
      hovering ||
      Math.abs(rotSpeed) > 0.0003 ||
      Math.abs(explodeTarget - explode) > 0.3;

    animId = stillMoving ? requestAnimationFrame(tick) : null;
  }

  // Erstes statisches Zeichnen
  drawWheel(rotation, 0);

  // Hover-Events auf dem Canvas-Container
  const wrapper = document.getElementById('home-logo-col');
  const bubbles = document.querySelectorAll('#home-bubbles .bubble');

  wrapper.addEventListener('mouseenter', () => {
    hovering = true;
    // Bubbles leicht verschieben
    bubbles.forEach((b, i) => {
      b.style.transition = 'transform 0.4s ease';
      b.style.transform  = `translateX(${i % 2 === 0 ? 8 : -6}px) translateY(-4px)`;
    });
    if (!animId) animId = requestAnimationFrame(tick);
  });

  wrapper.addEventListener('mouseleave', () => {
    hovering = false;
    // Bubbles zurücksetzen
    bubbles.forEach(b => {
      b.style.transition = 'transform 0.5s ease';
      b.style.transform  = '';
    });
    if (!animId) animId = requestAnimationFrame(tick);
  });
}
// Alias für alten Aufruf
const initLandingHover = initLandingWheel;

function goHome() {
  cleanupSubs();
  S.mode = null; S.poll = null; S.counts = [];
  S.winner = null; S.isHost = false; S.hostVoted = false;
  S.multiSelected.clear();
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
  buildSetupRows();
  history.replaceState({}, '', location.pathname);
  showView('home');
}

/* ════════════════════════════════════════════════════════
   MODE
   ════════════════════════════════════════════════════════ */
function selectMode(m) {
  S.mode = m;
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
  document.getElementById(`card-${m}`).classList.add('active');

  // ALONE: Name-Feld + Choice-Toggle ausblenden
  document.getElementById('setup-name-box').classList.toggle('hidden', m === 'alone');
  document.getElementById('choice-toggle-wrap').classList.toggle('hidden', m === 'alone');

  setTimeout(() => showView('setup'), 280);
}

/* ════════════════════════════════════════════════════════
   SETUP
   ════════════════════════════════════════════════════════ */
let optRows = 0;

function buildSetupRows() {
  optRows = 0;
  document.getElementById('setup-opts-list').innerHTML = '';
  addOptRow(); addOptRow();
  document.getElementById('btn-more-opts').onclick = addOptRow;
  setChoiceMode('single');
  // Reset question if going back
  document.getElementById('setup-question').value = '';
  document.getElementById('setup-name').value = '';
  document.getElementById('setup-error').textContent = '';
}

function addOptRow() {
  if (optRows >= 8) return;
  optRows++;
  const color = OPT_COLORS[(optRows - 1) % OPT_COLORS.length];
  const row   = document.createElement('div');
  row.className = 'option-row';
  row.innerHTML = `
    <span class="option-dot" style="background:${color}"></span>
    <input class="option-input" type="text"
      placeholder="Option ${optRows}…" maxlength="40" autocomplete="off">
    <button class="option-rm" onclick="removeOptRow(this)" title="Entfernen">✕</button>`;
  document.getElementById('setup-opts-list').appendChild(row);
  updateOptBtns();
  row.querySelector('input').focus();
}

function removeOptRow(btn) {
  if (optRows <= 2) return;
  btn.closest('.option-row').remove();
  optRows--;
  updateOptBtns();
}

function updateOptBtns() {
  document.querySelectorAll('#setup-opts-list .option-rm').forEach(b => {
    b.style.visibility = optRows <= 2 ? 'hidden' : 'visible';
  });
  document.getElementById('btn-more-opts').disabled = optRows >= 8;
}

function setChoiceMode(m) {
  S.choiceMode = m;
  document.getElementById('cbtn-single').classList.toggle('active', m === 'single');
  document.getElementById('cbtn-multi').classList.toggle('active',  m === 'multiple');
}

async function submitSetup() {
  const name     = (document.getElementById('setup-name')?.value || '').trim();
  const question = document.getElementById('setup-question').value.trim();
  const options  = Array.from(document.querySelectorAll('#setup-opts-list .option-input'))
                     .map(i => i.value.trim()).filter(Boolean);
  const errEl    = document.getElementById('setup-error');

  if (!question) { errEl.textContent = 'Please enter a question.'; return; }
  if (options.length < 2) { errEl.textContent = 'At least 2 options required.'; return; }
  errEl.textContent = '';

  const R = document.getElementById('nav-right');
  R.disabled = true; R.textContent = '…';

  try {
    if (S.mode === 'alone') {
      // ALONE: direkt zum Spin, kein DB-Eintrag
      S.poll   = { id: 'ALONE', name: 'Solo', question, options, choice_mode: 'single' };
      S.counts = new Array(options.length).fill(0);
      S.isHost = true;
      renderSpinView();
      showView('spin');
    } else {
      S.poll   = await db.createPoll(name || 'Vote', question, options, S.choiceMode);
      S.isHost = true;
      S.counts = new Array(options.length).fill(0);
      localStorage.setItem('iw_myPoll', S.poll.id);
      renderShareView();
      showView('share');
    }
  } catch (e) {
    errEl.textContent = 'Error: ' + e.message;
  } finally {
    R.disabled = false;
    renderNav(S.view);
  }
}

/* ════════════════════════════════════════════════════════
   SHARE
   ════════════════════════════════════════════════════════ */
function renderShareView() {
  const poll    = S.poll;
  const base    = location.origin + location.pathname;
  const voteUrl = db.isLive
    ? `${base}?poll=${poll.id}`
    : `${base}?v=${btoa(JSON.stringify({
        id: poll.id, name: poll.name, question: poll.question,
        options: poll.options, choice_mode: poll.choice_mode
      }))}`;

  document.getElementById('share-name-display').textContent = poll.name.toUpperCase();
  document.getElementById('share-code-display').textContent = poll.id;

  const qrWrap = document.getElementById('share-qr-wrap');
  if (typeof QRCode !== 'undefined') {
    qrWrap.style.display = 'flex';
    QRCode.toCanvas(document.getElementById('share-qr-canvas'), voteUrl,
      { width: 180, margin: 1, color: { dark: '#000', light: '#fff' } });
  }

  document.getElementById('btn-copy-share').onclick = () => {
    navigator.clipboard.writeText(voteUrl).then(() => {
      document.getElementById('btn-copy-share').textContent = '✓ COPIED!';
      setTimeout(() => { document.getElementById('btn-copy-share').textContent = '+ COPY LINK'; }, 2200);
    });
  };
  document.getElementById('btn-share-native').onclick = () => {
    navigator.share?.({ title: poll.question, url: voteUrl }) ||
      navigator.clipboard.writeText(voteUrl);
  };
}

/* ════════════════════════════════════════════════════════
   HOST VIEW
   ════════════════════════════════════════════════════════ */
async function enterHost(pollId) {
  const poll = await db.getPoll(pollId);
  if (!poll) { alert('Session not found. Please check the code.'); showView('home'); return; }

  S.poll = poll; S.isHost = true;
  S.counts = new Array(poll.options.length).fill(0);
  S.hostVoted = localStorage.getItem(`iw_voted_${poll.id}`) === '1';

  // Host-Kopier-Button
  const base    = location.origin + location.pathname;
  const voteUrl = db.isLive ? `${base}?poll=${poll.id}`
    : `${base}?v=${btoa(JSON.stringify({ id:poll.id, name:poll.name, question:poll.question,
        options:poll.options, choice_mode:poll.choice_mode }))}`;
  document.getElementById('host-code-chip').textContent = poll.id;
  document.getElementById('host-copy-btn').onclick = () => {
    navigator.clipboard.writeText(voteUrl).then(() => {
      document.getElementById('host-copy-btn').textContent = '✓ Copied!';
      setTimeout(() => { document.getElementById('host-copy-btn').textContent = '🔗 Copy link'; }, 2000);
    });
  };

  document.getElementById('host-question-text').textContent = poll.question;
  document.getElementById('host-info-line').textContent =
    poll.choice_mode === 'multiple' ? 'INFO: MULTIPLE CHOICES ALLOWED' : 'INFO: JUST A SINGLE CHOICE';

  const existing = await db.getVotes(poll.id);
  S.votes = existing;
  computeCounts();
  renderHostOpts();

  showView('host');
  startTimer();

  const sub = db.subscribeVotes(poll.id, votes => {
    S.votes = votes;
    computeCounts();
    renderHostOpts();
  });
  S.subs.push(sub);
  history.replaceState({}, '', `?poll=${poll.id}&host=1`);
}

function renderHostOpts() {
  const poll  = S.poll;
  const total = S.counts.reduce((a, b) => a + b, 0);
  document.getElementById('host-total').textContent = total;

  const list = document.getElementById('host-opts-list');
  list.innerHTML = poll.options.map((opt, i) => {
    const color   = OPT_COLORS[i % OPT_COLORS.length];
    const cnt     = S.counts[i];
    const isVoted = S.hostVoted && localStorage.getItem(`iw_voted_${poll.id}_choice`) === String(i);
    return `
      <div class="host-opt-row${isVoted ? ' voted' : ''}" onclick="hostVote(${i})">
        <span class="host-opt-left">
          <span class="opt-color-dot" style="background:${color}"></span>
          <span style="color:${color}">${opt}</span>
        </span>
        <span class="host-opt-right">
          <span class="live-count-badge${cnt > 0 ? ' has-votes' : ''}">${cnt}</span>
          <div class="opt-checkbox${isVoted ? ' checked' : ''}"></div>
        </span>
      </div>`;
  }).join('');
}

async function hostVote(optIdx) {
  if (S.hostVoted) return;
  S.hostVoted = true;
  try {
    await db.submitVote(S.poll.id, [optIdx]);
    localStorage.setItem(`iw_voted_${S.poll.id}`, '1');
    localStorage.setItem(`iw_voted_${S.poll.id}_choice`, String(optIdx));
    renderHostOpts();
  } catch (e) {
    S.hostVoted = false;
    alert('Error submitting vote: ' + e.message);
  }
}

/* ── Timer ────────────────────────────────────────────── */
function startTimer() {
  S.timerSec = 120; S.timerPaused = false;
  renderTimerDisplay();
  S.timerInterval = setInterval(() => {
    if (S.timerPaused) return;
    S.timerSec = Math.max(0, S.timerSec - 1);
    renderTimerDisplay();
    if (S.timerSec === 0) { clearInterval(S.timerInterval); endVoting(); }
  }, 1000);
}

function renderTimerDisplay() {
  const m  = String(Math.floor(S.timerSec / 60)).padStart(2, '0');
  const s  = String(S.timerSec % 60).padStart(2, '0');
  const el = document.getElementById('host-timer');
  if (el) el.textContent = `${m}:${s}`;
}

function toggleTimer() {
  S.timerPaused = !S.timerPaused;
  const btn = document.getElementById('btn-pause-timer');
  const el  = document.getElementById('host-timer');
  if (btn) btn.textContent = S.timerPaused ? '▶ CONTINUE' : '⏸ PAUSE';
  el?.classList.toggle('paused', S.timerPaused);
}

async function endVoting() {
  clearInterval(S.timerInterval);
  if (S.poll?.id !== 'ALONE') {
    await db.updatePoll(S.poll.id, { status: 'closed' }).catch(() => {});
    const votes = await db.getVotes(S.poll.id).catch(() => []);
    S.votes = votes; computeCounts();
  }
  renderSpinView();
  showView('spin');
}

/* ════════════════════════════════════════════════════════
   VOTE VIEW (Teilnehmer)
   ════════════════════════════════════════════════════════ */
async function enterVote(pollId) {
  const poll = await db.getPoll(pollId);
  if (!poll) { alert('Session not found. Please check the code.'); showView('home'); return; }
  if (poll.status === 'done')   { await showWinnerFromPoll(poll); return; }
  if (poll.status === 'closed') { showVoteClosed(); return; }

  S.poll = poll; S.isHost = false;
  renderVoteOpts(poll, false);
  showView('vote');

  const sub = db.subscribePoll(pollId, async updated => {
    if (updated.status === 'closed' || updated.status === 'done') showVoteClosed();
  });
  S.subs.push(sub);
}

function enterVoteNoDB(cfg) {
  S.poll = cfg; S.isHost = false;
  renderVoteOpts(cfg, true);
  showView('vote');

  const sub = db.subscribePoll(cfg.id, updated => {
    if (updated.status === 'closed' || updated.status === 'done') showVoteClosed();
  });
  S.subs.push(sub);
}

function renderVoteOpts(poll, isNoDB) {
  document.getElementById('vote-question-text').textContent = poll.question;
  document.getElementById('vote-info-line').textContent =
    poll.choice_mode === 'multiple'
      ? 'INFO: MULTIPLE CHOICES ALLOWED'
      : 'INFO: JUST A SINGLE CHOICE';

  if (localStorage.getItem(`iw_voted_${poll.id}`) === '1') {
    showAlreadyVoted(poll, isNoDB);
    return;
  }

  // Reset multiple-choice state
  S.multiSelected.clear();

  const list = document.getElementById('vote-opts-list');
  list.innerHTML = poll.options.map((opt, i) => {
    const color = OPT_COLORS[i % OPT_COLORS.length];
    return `
      <div class="vote-opt-row" id="vrow-${i}" onclick="castVote(${i})">
        <span class="vote-opt-label">
          <span class="opt-color-dot" style="background:${color}"></span>
          <span style="color:${color}">${opt}</span>
        </span>
        <div class="opt-checkbox" id="vchk-${i}"></div>
      </div>`;
  }).join('');
}

async function castVote(idx) {
  const poll = S.poll;
  if (!poll) return;

  if (poll.choice_mode === 'single') {
    /* ── SINGLE CHOICE: direkt abschicken ── */
    disableVoteRows();
    // Kurz Checkbox anzeigen vor Submit
    document.getElementById(`vchk-${idx}`)?.classList.add('checked');
    document.getElementById(`vrow-${idx}`)?.classList.add('selected');
    try {
      await db.submitVote(poll.id, [idx]);
      localStorage.setItem(`iw_voted_${poll.id}`, '1');
      setTimeout(() => showAlreadyVoted(poll, !db.isLive), 400);
    } catch (e) {
      enableVoteRows();
      document.getElementById(`vchk-${idx}`)?.classList.remove('checked');
      document.getElementById(`vrow-${idx}`)?.classList.remove('selected');
      alert('Error: ' + e.message);
    }
  } else {
    /* ── MULTIPLE CHOICE: toggle, dann explizit submitten ── */
    const chk = document.getElementById(`vchk-${idx}`);
    const row = document.getElementById(`vrow-${idx}`);
    if (S.multiSelected.has(idx)) {
      S.multiSelected.delete(idx);
      chk?.classList.remove('checked');
      row?.classList.remove('selected');
    } else {
      S.multiSelected.add(idx);
      chk?.classList.add('checked');
      row?.classList.add('selected');
    }
    renderMultiSubmitBtn(poll);
  }
}

function renderMultiSubmitBtn(poll) {
  let btn = document.getElementById('multi-submit-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id        = 'multi-submit-btn';
    btn.className = 'multi-submit-btn';
    document.getElementById('vote-opts-list').after(btn);
  }
  const count = S.multiSelected.size;
  btn.textContent = count > 0
    ? `✓ ABSTIMMEN (${count} ausgewählt)`
    : 'PLEASE SELECT';
  btn.disabled = count === 0;

  btn.onclick = async () => {
    if (!S.multiSelected.size) return;
    disableVoteRows();
    btn.disabled = true;
    try {
      await db.submitVote(poll.id, [...S.multiSelected]);
      localStorage.setItem(`iw_voted_${poll.id}`, '1');
      btn.remove();
      showAlreadyVoted(poll, !db.isLive);
    } catch (e) {
      enableVoteRows();
      btn.disabled = false;
      alert('Error: ' + e.message);
    }
  };
}

function disableVoteRows() {
  document.querySelectorAll('.vote-opt-row').forEach(r => r.classList.add('disabled'));
}
function enableVoteRows() {
  document.querySelectorAll('.vote-opt-row').forEach(r => r.classList.remove('disabled'));
}

function showAlreadyVoted(poll, showToken) {
  document.getElementById('vote-opts-list').style.display = 'none';
  document.getElementById('vote-success-box').classList.remove('hidden');

  if (showToken) {
    const nonce   = Math.random().toString(36).slice(2, 10).toUpperCase();
    const optIdx  = S.multiSelected.size ? [...S.multiSelected][0] : 0;
    const payload = btoa(JSON.stringify({ p: poll.id, o: optIdx, n: nonce }));
    const url     = `${location.origin}${location.pathname}?addvote=1&d=${payload}`;
    document.getElementById('vote-token-wrap').classList.remove('hidden');
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(document.getElementById('vote-token-canvas'), url,
        { width: 200, margin: 1, color: { dark: '#000', light: '#fff' } });
    }
  }
}

function showVoteClosed() {
  document.getElementById('vote-opts-list').style.display = 'none';
  const vSucc = document.getElementById('vote-success-box');
  if (vSucc) vSucc.classList.add('hidden');
  document.getElementById('vote-closed-box').classList.remove('hidden');
}

async function showWinnerFromPoll(poll) {
  S.poll = poll;
  const votes = await db.getVotes(poll.id).catch(() => []);
  S.votes = votes; computeCounts();
  renderSpinView();
  showView('spin');
  if (poll.winner !== null) {
    const wi = poll.options.indexOf(poll.winner);
    if (wi >= 0) revealWinner(wi);
  }
}

/* ════════════════════════════════════════════════════════
   ADD VOTE TOKEN (No-DB)
   ════════════════════════════════════════════════════════ */
function handleAddVoteToken(params) {
  try {
    const { p: pollId, o: optIdx, n: nonce } = JSON.parse(atob(params.get('d')));
    const poll = JSON.parse(localStorage.getItem(`iw_poll_${pollId}`) || 'null');
    if (!poll) { renderTokenResult(false, 'Session not found on this device.'); return; }
    const added = db.addVoteLocal(pollId, Number(optIdx), nonce);
    renderTokenResult(added,
      added ? `✓ Stimme für „${poll.options[optIdx]}" erfasst!`
            : 'This vote was already counted.');
  } catch { renderTokenResult(false, 'Invalid token.'); }
}

function renderTokenResult(ok, msg) {
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:100vh;font-family:Inter,sans-serif;background:#EBEBEB;text-align:center;padding:40px 20px">
      <div style="font-size:5rem;margin-bottom:20px">${ok ? '✅' : '⚠️'}</div>
      <h2 style="font-weight:900;font-size:1.5rem;margin-bottom:12px">${msg}</h2>
      <p style="color:#666;margin-bottom:28px">Du kannst dieses Fenster schließen.</p>
      <button onclick="history.back()" style="border:4px solid #000;border-radius:999px;
        padding:12px 32px;background:#FFF500;font-family:Inter,sans-serif;
        font-weight:900;font-size:1rem;cursor:pointer;">← BACK</button>
    </div>`;
}

/* ════════════════════════════════════════════════════════
   SPIN VIEW
   ════════════════════════════════════════════════════════ */
function computeCounts() {
  if (!S.poll) return;
  S.counts = new Array(S.poll.options.length).fill(0);
  S.votes.forEach(v => {
    const i = Number(v.option_index);
    if (i >= 0 && i < S.counts.length) S.counts[i]++;
  });
}

function renderSpinView() {
  const poll  = S.poll;
  const total = S.counts.reduce((a, b) => a + b, 0);
  const isAlone = S.mode === 'alone';

  document.getElementById('spin-question-text').textContent = poll.question;

  // Optionen (ALONE: kein Prozent, GROUP: mit Prozent)
  const pctEl = document.getElementById('spin-options-pct');
  pctEl.innerHTML = poll.options.map((opt, i) => {
    const pct   = (!isAlone && total > 0) ? Math.round((S.counts[i] / total) * 100) : null;
    const color = OPT_COLORS[i % OPT_COLORS.length];
    return `
      <div class="pct-row">
        <span class="pct-label">
          <span class="opt-color-dot" style="background:${color}"></span>
          <span style="color:${color}">${opt}</span>
        </span>
        ${!isAlone ? `
        <div class="pct-bar-wrap">
          <div class="pct-bar" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="pct-val">${pct}%</span>` : ''}
      </div>`;
  }).join('');

  // Wheel
  const canvas = document.getElementById('spin-wheel-canvas');
  canvas.width = 400; canvas.height = 400;
  S.spinWheel  = new InfluenceWheel(canvas);
  const weights = total > 0 ? S.counts : new Array(poll.options.length).fill(1);
  S.spinWheel.setData(poll.options, weights);
  S.spinWheel.draw();

  // Winner-Box zurücksetzen
  const wBox = document.getElementById('winner-box');
  wBox.classList.add('hidden');
  wBox.textContent = '';

  // Stars zurücksetzen
  document.getElementById('stars-container').innerHTML = '';

  // Spin-Buttons nur für Host / ALONE
  const spinBtns = document.getElementById('spin-btns');
  spinBtns.style.display = S.isHost ? 'flex' : 'none';
  document.getElementById('btn-spin-start').disabled = false;
  document.getElementById('btn-spin-stop').disabled  = true;

  S.winner = null;
  renderNav('spin');
}

/* ── Spin Start / Stop ────────────────────────────────── */
function onSpinStart() {
  if (!S.spinWheel) return;
  S.spinWheel.startFastSpin();
  document.getElementById('btn-spin-start').disabled = true;
  document.getElementById('btn-spin-stop').disabled  = false;
}

function onSpinStop() {
  if (!S.spinWheel) return;
  document.getElementById('btn-spin-stop').disabled = true;
  S.spinWheel.stopAndDetect(winnerIdx => revealWinner(winnerIdx));
}

async function revealWinner(winnerIdx) {
  S.winner = winnerIdx;
  const winLabel = S.poll.options[winnerIdx];
  const winColor = OPT_COLORS[winnerIdx % OPT_COLORS.length];

  // Gewinner-Box MIT POSITION mittig im Wheel
  const box = document.getElementById('winner-box');
  box.textContent = winLabel.toUpperCase();
  box.style.color = winColor;
  box.classList.remove('hidden');

  // ★ Sterne-Animation
  launchStars();

  // In DB speichern
  if (S.poll.id !== 'ALONE') {
    await db.updatePoll(S.poll.id, { status: 'done', winner: winLabel }).catch(() => {});
  }

  // Nav button: share results
  const R = document.getElementById('nav-right');
  R.textContent = 'SHARE RESULTS';
  R.disabled    = false;
  R.onclick     = buildAndShowScreenshot;
}

/* ════════════════════════════════════════════════════════
   ★ STERNE-ANIMATION
   Langsame CSS-Sterne (kein Emoji), bleiben lange sichtbar
   ════════════════════════════════════════════════════════ */
function launchStars() {
  const container = document.getElementById('stars-container');
  if (!container) return;
  container.innerHTML = '';

  function spawnStar(delay) {
    const star = document.createElement('span');
    star.className   = 'flying-star';
    star.textContent = '★';   // normaler Stern, kein Emoji

    const startX = 5  + Math.random() * 90;   // % horizontal
    const startY = 10 + Math.random() * 80;   // % vertikal
    const size   = 22 + Math.random() * 28;   // 22-50px
    const dur    = 3.5 + Math.random() * 2.5; // 3.5-6s (langsam!)
    const dx     = (Math.random() - 0.5) * 120;
    const dy     = -(80 + Math.random() * 200);
    const rot    = (Math.random() - 0.5) * 540;

    star.style.cssText = `
      left: ${startX}%;
      top:  ${startY}%;
      font-size: ${size}px;
      animation-duration: ${dur}s;
      animation-delay: ${delay}s;
      --dx: ${dx}px;
      --dy: ${dy}px;
      --rot: ${rot}deg;
    `;
    container.appendChild(star);
    setTimeout(() => star.remove(), (dur + delay) * 1000 + 300);
  }

  // Erste Welle: 20 Sterne
  for (let i = 0; i < 20; i++) spawnStar(Math.random() * 0.6);
  // Zweite Welle: nach 1s noch 12 Sterne
  setTimeout(() => {
    for (let i = 0; i < 12; i++) spawnStar(Math.random() * 0.8);
  }, 1000);
  // Dritte Welle: nach 3s noch 8 Sterne
  setTimeout(() => {
    for (let i = 0; i < 8; i++) spawnStar(Math.random() * 0.5);
  }, 3000);
}

/* ════════════════════════════════════════════════════════
   SCREENSHOT – sieht aus wie der Ergebnis-Screen
   Nutzt html2canvas um den tatsächlichen View zu erfassen
   ════════════════════════════════════════════════════════ */
async function buildAndShowScreenshot() {
  openModal('screenshot');

  const target = document.getElementById('view-spin');
  const prevStars = document.getElementById('stars-container').innerHTML;
  document.getElementById('stars-container').innerHTML = ''; // Sterne kurz ausblenden

  try {
    let canvas;
    if (typeof html2canvas !== 'undefined') {
      canvas = await html2canvas(target, {
        backgroundColor: '#EBEBEB',
        scale: 1.5,
        useCORS: true,
        logging: false,
      });
    } else {
      // Fallback: manuell zeichnen
      canvas = buildFallbackCanvas();
    }

    const wrap = document.querySelector('.screenshot-preview-wrap');
    wrap.innerHTML = '';
    canvas.id    = 'screenshot-canvas';
    canvas.style.cssText = 'display:block;width:100%;height:auto;';
    wrap.appendChild(canvas);

  } catch (e) {
    console.error('Screenshot error:', e);
    const wrap = document.querySelector('.screenshot-preview-wrap');
    wrap.innerHTML = '<p style="padding:20px;color:#888">Screenshot konnte nicht erstellt werden.</p>';
  }

  document.getElementById('stars-container').innerHTML = prevStars;
}

function buildFallbackCanvas() {
  const poll  = S.poll;
  const total = S.counts.reduce((a, b) => a + b, 0);
  const W = 900, H = 520;
  const card = document.createElement('canvas');
  card.width = W; card.height = H;
  const ctx = card.getContext('2d');

  ctx.fillStyle = '#EBEBEB';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = '#fff';
  ctx.font = '900 20px Inter, sans-serif';
  ctx.fillText('THE INFLUENCE WHEEL', 22, 40);
  ctx.fillStyle = '#FFF500';
  ctx.font = '700 14px Inter, sans-serif';
  ctx.fillText(db.isLive ? '● LIVE' : '⚡ DEMO', W - 90, 40);

  ctx.fillStyle = '#000';
  ctx.font = '600 18px Inter, sans-serif';
  wrapText(ctx, poll.question, 24, 92, 360, 24);

  poll.options.forEach((opt, i) => {
    const pct = total > 0 ? Math.round(S.counts[i] / total * 100) : 0;
    const color = OPT_COLORS[i % OPT_COLORS.length];
    const y = 136 + i * 42;
    if (y > H - 80) return;
    ctx.beginPath();
    ctx.arc(28, y - 6, 8, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '700 16px Inter, sans-serif';
    ctx.fillText(opt.length > 20 ? opt.slice(0,19)+'…' : opt, 44, y);
    if (S.mode !== 'alone') {
      ctx.fillStyle = '#000'; ctx.font = '900 16px Inter, sans-serif';
      ctx.fillText(`${pct}%`, 310, y);
    }
  });

  const wc = document.getElementById('spin-wheel-canvas');
  const wSize = 380;
  ctx.drawImage(wc, W - wSize - 20, (H - wSize) / 2, wSize, wSize);

  if (S.winner !== null) {
    const wL = poll.options[S.winner];
    const wC = OPT_COLORS[S.winner % OPT_COLORS.length];
    const bW = 220, bH = 50;
    const bX = W - wSize - 20 + (wSize - bW) / 2;
    const bY = (H - bH) / 2;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    roundRect(ctx, bX, bY, bW, bH, 25);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = wC; ctx.font = '900 20px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(wL.toUpperCase(), bX + bW/2, bY + bH/2 + 7);
    ctx.textAlign = 'left';
  }

  ctx.fillStyle = '#000'; ctx.fillRect(0, H-48, W, 48);
  ctx.fillStyle = '#888'; ctx.font = '500 12px Inter, sans-serif';
  ctx.fillText('THE INFLUENCE WHEEL', 22, H-18);
  return card;
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  text.split(' ').reduce((acc, word) => {
    const test = acc + (acc ? ' ' : '') + word;
    if (ctx.measureText(test).width > maxW && acc) {
      ctx.fillText(acc, x, y); y += lineH; return word;
    }
    return test;
  }, '');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function downloadScreenshot() {
  const canvas = document.querySelector('.screenshot-preview-wrap canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `influence-wheel-${S.poll?.id || 'result'}.png`;
  a.click();
}

async function shareScreenshot() {
  const canvas = document.querySelector('.screenshot-preview-wrap canvas');
  if (!canvas) return;
  try {
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'influence-wheel.png', { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'The Influence Wheel' });
    } else { downloadScreenshot(); }
  } catch { downloadScreenshot(); }
}

/* ════════════════════════════════════════════════════════
   MODALS
   ════════════════════════════════════════════════════════ */
function openModal(id) { document.getElementById(`modal-${id}`).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(`modal-${id}`).classList.add('hidden'); }

function openJoinModal() {
  document.getElementById('join-code-input').value = '';
  document.getElementById('join-error').textContent = '';
  openModal('join');
  setTimeout(() => document.getElementById('join-code-input').focus(), 50);
}

async function submitJoin() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (code.length < 4) { document.getElementById('join-error').textContent = 'Please enter a code.'; return; }
  closeModal('join');
  if (db.isLive) { await enterVote(code); }
  else {
    const poll = await db.getPoll(code);
    if (poll) enterVoteNoDB(poll);
    else alert('Session not found.\n(In demo mode: please use the full link)');
  }
}

function processCollectUrl() {
  const raw = document.getElementById('collect-url').value.trim();
  try {
    const url   = new URL(raw);
    const pars  = new URLSearchParams(url.search);
    if (!pars.has('d')) throw new Error();
    const { p: pollId, o: optIdx, n: nonce } = JSON.parse(atob(pars.get('d')));
    const added = db.addVoteLocal(pollId, Number(optIdx), nonce);
    if (added) {
      document.getElementById('collect-ok').classList.remove('hidden');
      document.getElementById('collect-error').textContent = '';
      document.getElementById('collect-url').value = '';
      setTimeout(() => closeModal('collect'), 1500);
    } else {
      document.getElementById('collect-error').textContent = 'Duplicate – already counted.';
    }
  } catch { document.getElementById('collect-error').textContent = 'Invalid URL.'; }
}

/* ════════════════════════════════════════════════════════
   CLEANUP
   ════════════════════════════════════════════════════════ */
function cleanupSubs() {
  clearInterval(S.timerInterval);
  S.subs.forEach(s => s?.unsubscribe?.());
  S.subs = [];
  db.cleanup();
  S.spinWheel?.stopFastSpin?.();
}
