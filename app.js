/* ════════════════════════════════════════════════════════
   app.js — The Influence Wheel
   
   Flow:
   HOST: Create → Share (see participant count) → Start Voting
         → Vote (see timer) → End Voting → Spin → Winner
   USER: Join → Lobby → (host starts) → Vote + timer synced
         → Auto "Waiting" → Wheel spins live → Winner
   ════════════════════════════════════════════════════════ */

const S = {
  view: 'home', mode: null, choiceMode: 'single',
  poll: null, counts: [], votes: [],
  isHost: false, winner: null,
  spinWheel: null, subs: [],
  hostVoted: false,
  multiSelected: new Set(),
  timerInterval: null,  // client-side countdown
};

window.addEventListener('DOMContentLoaded', () => {
  buildSetupRows();
  initLandingWheel();
  route();
  document.getElementById('join-code-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') submitJoin(); });
});

function route() {
  const p = new URLSearchParams(location.search);
  if (p.has('addvote'))  { handleAddVoteToken(p); return; }
  if (p.has('poll')) {
    p.get('host') === '1' ? enterHost(p.get('poll')) : enterVote(p.get('poll'));
    return;
  }
  if (p.has('v')) {
    try { enterVoteNoDB(JSON.parse(atob(p.get('v')))); } catch { showView('home'); }
    return;
  }
  showView('home');
}

/* ════ VIEW + NAV ════════════════════════════════════════ */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(`view-${name}`);
  if (el) { el.classList.remove('hidden'); el.style.animation='none'; el.offsetHeight; el.style.animation=''; }
  S.view = name;
  renderNav(name);
}
function renderNav(view) {
  const L = document.getElementById('nav-left');
  const R = document.getElementById('nav-right');
  const cfg = {
    home:  { l:'', r:'+ Start' },
    mode:  { l:'', r:'+ Start', rDis: () => !S.mode },
    setup: { l:'← Back', r: S.mode==='alone'?'Spin the Wheel →':'Create Link →' },
    share: { l:'← Back', r:'Start Voting →' },
    host:  { l:'← Create New', r:'End Voting' },
    vote:  { l:'← Close', r:'' },
    spin:  { l: S.mode==='alone'?'← Back to Options':'← Back', r:'' },
  }[view] || { l:'', r:'' };
  L.textContent = cfg.l || '';
  R.textContent = typeof cfg.r === 'function' ? cfg.r() : (cfg.r||'');
  L.disabled = !cfg.l;
  R.disabled = cfg.rDis ? cfg.rDis() : !R.textContent;
}
function onNavLeft() {
  ({
    mode:  () => goHome(),
    setup: () => showView('mode'),
    share: () => showView('setup'),
    host:  () => { cleanupSubs(); goHome(); },
    vote:  () => { cleanupSubs(); goHome(); },
    spin:  () => {
      if (S.mode==='alone') { buildSetupRows(); showView('setup'); }
      else showView(S.isHost ? 'host' : 'vote');
    },
  }[S.view] || (() => {}))();
}
function onNavRight() {
  ({
    home:  () => showView('mode'),
    mode:  () => { if (S.mode) showView('setup'); },
    setup: () => submitSetup(),
    share: () => startVoting(),
    host:  () => endVoting(),
  }[S.view] || (() => {}))();
}

/* ════ HOME ══════════════════════════════════════════════ */
function goHome() {
  cleanupSubs();
  S.mode=null; S.poll=null; S.counts=[]; S.winner=null;
  S.isHost=false; S.hostVoted=false; S.multiSelected.clear();
  document.querySelectorAll('.mode-card').forEach(c=>c.classList.remove('active'));
  buildSetupRows();
  history.replaceState({}, '', location.pathname);
  showView('home');
}

/* ════ MODE ══════════════════════════════════════════════ */
function selectMode(m) {
  S.mode = m;
  document.querySelectorAll('.mode-card').forEach(c=>c.classList.remove('active'));
  document.getElementById(`card-${m}`).classList.add('active');
  document.getElementById('setup-name-box').style.display  = m==='alone'?'none':'block';
  document.getElementById('choice-toggle-wrap').style.display = m==='alone'?'none':'flex';
  setTimeout(() => showView('setup'), 280);
}

/* ════ SETUP ═════════════════════════════════════════════ */
let optRows = 0;
function buildSetupRows() {
  optRows = 0;
  document.getElementById('setup-opts-list').innerHTML = '';
  addOptRow(); addOptRow();
  document.getElementById('btn-more-opts').onclick = addOptRow;
  setChoiceMode('single');
  document.getElementById('setup-question').value = '';
  document.getElementById('setup-name').value = '';
  document.getElementById('setup-error').textContent = '';
}
function addOptRow() {
  if (optRows >= 8) return;
  optRows++;
  const color = OPT_COLORS[(optRows-1) % OPT_COLORS.length];
  const row = document.createElement('div');
  row.className = 'opt-row';
  row.innerHTML = `<span class="opt-dot" style="background:${color}"></span>
    <input class="opt-input" type="text" placeholder="Option ${optRows}…" maxlength="40" autocomplete="off">
    <button class="opt-rm" onclick="removeOptRow(this)">✕</button>`;
  document.getElementById('setup-opts-list').appendChild(row);
  updateOptBtns(); row.querySelector('input').focus();
}
function removeOptRow(btn) {
  if (optRows <= 2) return;
  btn.closest('.opt-row').remove(); optRows--; updateOptBtns();
}
function updateOptBtns() {
  document.querySelectorAll('#setup-opts-list .opt-rm').forEach(b => {
    b.style.visibility = optRows <= 2 ? 'hidden' : 'visible';
  });
  document.getElementById('btn-more-opts').disabled = optRows >= 8;
}
function setChoiceMode(m) {
  S.choiceMode = m;
  document.getElementById('cbtn-single').classList.toggle('active', m==='single');
  document.getElementById('cbtn-multi').classList.toggle('active',  m==='multiple');
}

async function submitSetup() {
  const name     = (document.getElementById('setup-name')?.value||'').trim();
  const question = document.getElementById('setup-question').value.trim();
  const options  = Array.from(document.querySelectorAll('#setup-opts-list .opt-input'))
                     .map(i=>i.value.trim()).filter(Boolean);
  const errEl    = document.getElementById('setup-error');
  if (!question)        { errEl.textContent='Please enter a question.'; return; }
  if (options.length<2) { errEl.textContent='At least 2 options required.'; return; }
  errEl.textContent = '';
  const R = document.getElementById('nav-right');
  R.disabled=true; R.textContent='…';
  try {
    if (S.mode==='alone') {
      S.poll = { id:'ALONE', name:'Solo', question, options, choice_mode:'single', status:'voting', timer_end_at: Date.now()+120000 };
      S.counts = new Array(options.length).fill(0);
      S.isHost = true;
      renderSpinView(); showView('spin');
    } else {
      S.poll   = await db.createPoll(name||'Vote', question, options, S.choiceMode);
      S.isHost = true; S.counts = new Array(options.length).fill(0);
      localStorage.setItem('iw_myPoll', S.poll.id);
      renderShareView(); showView('share');
    }
  } catch(e) { errEl.textContent='Error: '+e.message; }
  finally { R.disabled=false; renderNav(S.view); }
}

/* ════ SHARE VIEW (HOST lobby) ════════════════════════════
   Host waits here, sees participant count, then clicks
   "Start Voting →" to begin the synchronized countdown.
   ═══════════════════════════════════════════════════════ */
function renderShareView() {
  const poll = S.poll;
  const base = location.origin + location.pathname;
  const voteUrl = db.isLive ? `${base}?poll=${poll.id}`
    : `${base}?v=${btoa(JSON.stringify({ id:poll.id, name:poll.name, question:poll.question,
        options:poll.options, choice_mode:poll.choice_mode }))}`;
  document.getElementById('share-name-display').textContent = poll.name.toUpperCase();
  document.getElementById('share-code-display').textContent = poll.id;
  const qrWrap = document.getElementById('share-qr-wrap');
  if (typeof QRCode !== 'undefined') {
    qrWrap.style.display='block';
    QRCode.toCanvas(document.getElementById('share-qr-canvas'), voteUrl,
      { width:160, margin:1, color:{dark:'#000',light:'#fff'} });
  }
  document.getElementById('btn-copy-share').onclick = () => {
    navigator.clipboard.writeText(voteUrl).then(() => {
      document.getElementById('btn-copy-share').textContent='✓ Copied!';
      setTimeout(()=>{document.getElementById('btn-copy-share').textContent='+ Copy Link';}, 2200);
    });
  };
  document.getElementById('btn-share-native').onclick = () =>
    navigator.share?.({title:poll.question, url:voteUrl}) || navigator.clipboard.writeText(voteUrl);

  // Live participant counter
  updateParticipantUI(0);
  const sub = db.subscribeParticipants(poll.id, count => updateParticipantUI(count));
  S.subs.push(sub);
  // Initial count
  db.getParticipantCount(poll.id).then(n => updateParticipantUI(n));

  // Fallback: alle 3 Sekunden neu abfragen
  const pollInterval = setInterval(async () => {
    const n = await db.getParticipantCount(poll.id);
    updateParticipantUI(n);
  }, 3000);
  S.subs.push({ unsubscribe: () => clearInterval(pollInterval) });
}
function updateParticipantUI(count) {
  const dot  = document.querySelector('.participant-dot');
  const text = document.getElementById('participant-count-text');
  if (!text) return;
  if (count === 0) {
    if (dot) dot.className = 'participant-dot';
    text.textContent = 'Waiting for participants…';
  } else {
    if (dot) dot.className = 'participant-dot ready';
    text.textContent = `${count} participant${count!==1?'s':''} ready`;
  }
}

/* ════ HOST starts voting (synchronized) ═════════════════ */
async function startVoting() {
  const R = document.getElementById('nav-right');
  R.disabled=true; R.textContent='Starting…';
  try {
    const timer_end_at = await db.startVoting(S.poll.id, 120000);
    S.poll.status     = 'voting';
    S.poll.timer_end_at = timer_end_at;
    await enterHost(S.poll.id);
  } catch(e) {
    alert('Error starting vote: '+e.message);
    R.disabled=false; R.textContent='Start Voting →';
  }
}

/* ════ HOST VIEW ═════════════════════════════════════════ */
async function enterHost(pollId) {
  const poll = S.poll.id === pollId ? S.poll : await db.getPoll(pollId);
  if (!poll) { alert('Session not found.'); showView('home'); return; }
  S.poll = poll; S.isHost = true;
  S.counts = new Array(poll.options.length).fill(0);
  S.hostVoted = localStorage.getItem(`iw_voted_${poll.id}`) === '1';

  const base = location.origin + location.pathname;
  const voteUrl = db.isLive ? `${base}?poll=${poll.id}`
    : `${base}?v=${btoa(JSON.stringify({id:poll.id,name:poll.name,question:poll.question,
        options:poll.options,choice_mode:poll.choice_mode}))}`;
  document.getElementById('host-code-chip').textContent = poll.id;
  document.getElementById('host-copy-btn').onclick = () =>
    navigator.clipboard.writeText(voteUrl).then(()=>{
      document.getElementById('host-copy-btn').textContent='✓ Copied!';
      setTimeout(()=>{document.getElementById('host-copy-btn').textContent='Copy link';}, 2000);
    });

  document.getElementById('host-question-text').textContent = poll.question;
  document.getElementById('host-info-line').textContent =
    poll.choice_mode==='multiple' ? 'Multiple choices allowed' : 'Just a single choice';

  // Start synced timer display
  if (poll.timer_end_at) startSyncedTimer(poll.timer_end_at, 'host');

  const existing = await db.getVotes(poll.id);
  S.votes = existing; computeCounts(); renderHostOpts();

  // Live participant count in header
  db.getParticipantCount(poll.id).then(n => {
    const el = document.getElementById('host-participant-mini');
    if (el) el.textContent = n > 0 ? `${n} participant${n!==1?'s':''}` : '';
  });

  showView('host');

  // Subscribe to live votes
  const sub1 = db.subscribeVotes(poll.id, votes => {
    S.votes=votes; computeCounts(); renderHostOpts();
  });
  S.subs.push(sub1);

  history.replaceState({}, '', `?poll=${poll.id}&host=1`);
}

function renderHostOpts() {
  const poll=S.poll, total=S.counts.reduce((a,b)=>a+b,0);
  document.getElementById('host-total').textContent = total;
  document.getElementById('host-opts-list').innerHTML = poll.options.map((opt,i) => {
    const color=OPT_COLORS[i%OPT_COLORS.length], cnt=S.counts[i];
    const isV=S.hostVoted && localStorage.getItem(`iw_voted_${poll.id}_choice`)===String(i);
    return `<div class="host-opt-row${isV?' voted':''}" onclick="hostVote(${i})">
      <span class="host-opt-left">
        <span style="background:${color};width:10px;height:10px;border-radius:50%;display:inline-block;flex-shrink:0"></span>
        <span style="color:${color}">${opt}</span>
      </span>
      <span class="host-opt-right">
        <span class="live-count${cnt>0?' hot':''}">${cnt}</span>
        <div class="opt-check${isV?' checked':''}"></div>
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
  } catch(e) { S.hostVoted=false; alert('Error: '+e.message); }
}

async function endVoting() {
  clearInterval(S.timerInterval);
  const bar = document.getElementById('host-timer-bar');
  if (bar) { bar.querySelector('.timer-bar-fill').style.width='0%'; }
  if (S.poll?.id !== 'ALONE') {
    await db.updatePoll(S.poll.id, {status:'closed'}).catch(()=>{});
    const votes = await db.getVotes(S.poll.id).catch(()=>[]);
    S.votes=votes; computeCounts();
  }
  renderSpinView(); showView('spin');
}

/* ════════════════════════════════════════════════════════
   SYNCED TIMER
   Uses timer_end_at timestamp from DB so all clients
   count down identically without any message passing.
   ═══════════════════════════════════════════════════════ */
function startSyncedTimer(timerEndAt, role = 'vote') {
  clearInterval(S.timerInterval);
  const totalMs     = 120000; // 2 minutes default
  const barId       = role==='host' ? 'host-timer-bar' : 'vote-timer-bar';
  const fillId      = role==='host' ? 'host-timer-fill' : 'vote-timer-fill';
  const textId      = role==='host' ? 'host-timer-text' : 'vote-timer-text';
  const barEl       = document.getElementById(barId);
  if (barEl) barEl.classList.remove('hidden');

  const tick = () => {
    const remaining = Math.max(0, timerEndAt - Date.now());
    const m = String(Math.floor(remaining/60000)).padStart(2,'0');
    const s = String(Math.floor((remaining%60000)/1000)).padStart(2,'0');
    const pct = (remaining / totalMs) * 100;

    const textEl = document.getElementById(textId);
    const fillEl = document.getElementById(fillId);
    const bar    = document.getElementById(barId);

    if (textEl) textEl.textContent = `${m}:${s}`;
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (bar) {
      bar.classList.toggle('urgent', remaining < 20000);
    }

    if (remaining === 0) {
      clearInterval(S.timerInterval);
      if (role==='host') endVoting();
    }
  };
  tick();
  S.timerInterval = setInterval(tick, 1000);
}

/* ════ PARTICIPANT VOTE VIEW ══════════════════════════════ */
async function enterVote(pollId) {
  const poll = await db.getPoll(pollId);
  if (!poll) { alert('Session not found.'); showView('home'); return; }

  // Register participant presence
  await db.participantJoin(pollId).catch(()=>{});

  if (poll.status==='done')    { await showWinnerFromPoll(poll); return; }
  if (poll.status==='spinning') {
    S.poll=poll; S.isHost=false;
    await loadVotesForSpin(poll); showView('spin');
    document.getElementById('spin-btns').style.display='none';
    document.getElementById('participant-spin-overlay').classList.remove('hidden');
    if (S.spinWheel) S.spinWheel.startFastSpin();
    startParticipantSpinWatch(pollId); return;
  }
  if (poll.status==='closed') {
    S.poll=poll; S.isHost=false;
    await loadVotesForSpin(poll); showView('spin');
    document.getElementById('spin-btns').style.display='none';
    document.getElementById('participant-spin-overlay').classList.remove('hidden');
    startParticipantSpinWatch(pollId); return;
  }

  S.poll=poll; S.isHost=false;

  if (poll.status==='lobby') {
    // Show waiting screen
    renderVoteOpts(poll, false, true /* lobby mode */);
    showView('vote');
    // Subscribe for voting to start
    const sub = db.subscribePoll(pollId, async updated => {
      S.poll = updated;
      if (updated.status==='voting') {
        // Voting started! Show form + synced timer
        showVotingForm(updated, false);
      } else if (updated.status==='closed') {
        showVoteClosed();
      } else if (updated.status==='spinning') {
        await loadVotesForSpin(updated); showView('spin');
        document.getElementById('spin-btns').style.display='none';
        document.getElementById('participant-spin-overlay').classList.remove('hidden');
        if (S.spinWheel) S.spinWheel.startFastSpin();
        startParticipantSpinWatch(pollId);
      } else if (updated.status==='done') {
        await showWinnerFromPoll(updated);
      }
    });
    S.subs.push(sub);
    return;
  }

  if (poll.status==='voting') {
    renderVoteOpts(poll, false, false);
    // Start synced timer
    if (poll.timer_end_at) startSyncedTimer(poll.timer_end_at, 'vote');
    showView('vote');
    const sub = db.subscribePoll(pollId, async updated => {
      S.poll = updated;
      if (updated.status==='closed') showVoteClosed();
      else if (updated.status==='spinning') {
        await loadVotesForSpin(updated); showView('spin');
        document.getElementById('spin-btns').style.display='none';
        document.getElementById('participant-spin-overlay').classList.remove('hidden');
        if (S.spinWheel) S.spinWheel.startFastSpin();
        startParticipantSpinWatch(pollId);
      } else if (updated.status==='done') await showWinnerFromPoll(updated);
    });
    S.subs.push(sub);
  }
}

function enterVoteNoDB(cfg) {
  S.poll=cfg; S.isHost=false;
  if (cfg.status==='lobby') {
    renderVoteOpts(cfg, true, true);
    showView('vote');
    const sub = db.subscribePoll(cfg.id, updated => {
      if (updated.status==='voting') showVotingForm(updated, true);
      else if (updated.status==='closed' || updated.status==='done') showVoteClosed();
    });
    S.subs.push(sub);
  } else {
    renderVoteOpts(cfg, true, false);
    if (cfg.timer_end_at) startSyncedTimer(cfg.timer_end_at, 'vote');
    showView('vote');
  }
}

function showVotingForm(poll, isNoDB) {
  clearInterval(S.timerInterval);
  // Update UI to show voting form
  document.getElementById('vote-lobby-box').classList.add('hidden');
  document.getElementById('vote-q-head').style.display = 'block';
  document.getElementById('vote-question-text').textContent = poll.question;
  document.getElementById('vote-info-line').style.display = 'block';
  document.getElementById('vote-info-line').textContent =
    poll.choice_mode==='multiple' ? 'Multiple choices allowed' : 'Just a single choice';
  document.getElementById('vote-timer-bar').classList.remove('hidden');
  if (poll.timer_end_at) startSyncedTimer(poll.timer_end_at, 'vote');
  renderVoteOptionsOnly(poll);
}

function renderVoteOpts(poll, isNoDB, isLobby = false) {
  // Reset all state boxes
  document.getElementById('vote-lobby-box').classList.add('hidden');
  document.getElementById('vote-success-box').classList.add('hidden');
  document.getElementById('vote-closed-box').classList.add('hidden');
  document.getElementById('vote-opts-list').innerHTML = '';
  document.getElementById('vote-timer-bar').classList.add('hidden');

  if (isLobby) {
    document.getElementById('vote-q-head').style.display = 'none';
    document.getElementById('vote-question-text').textContent = '';
    document.getElementById('vote-info-line').style.display = 'none';
    document.getElementById('vote-lobby-box').classList.remove('hidden');
    return;
  }

  // Voting is open
  document.getElementById('vote-q-head').style.display = 'block';
  document.getElementById('vote-question-text').textContent = poll.question;
  document.getElementById('vote-info-line').style.display = 'block';
  document.getElementById('vote-info-line').textContent =
    poll.choice_mode==='multiple' ? 'Multiple choices allowed' : 'Just a single choice';

  if (localStorage.getItem(`iw_voted_${poll.id}`)==='1') {
    showAlreadyVoted(poll, isNoDB); return;
  }
  S.multiSelected.clear();
  renderVoteOptionsOnly(poll);
}

function renderVoteOptionsOnly(poll) {
  const isNoDB = !db.isLive;
  if (localStorage.getItem(`iw_voted_${poll.id}`)==='1') {
    showAlreadyVoted(poll, isNoDB); return;
  }
  S.multiSelected.clear();
  const list = document.getElementById('vote-opts-list');
  list.innerHTML = poll.options.map((opt, i) => {
    const color = OPT_COLORS[i%OPT_COLORS.length];
    return `<div class="vote-opt-row" id="vrow-${i}" onclick="castVote(${i})">
      <span class="opt-label">
        <span class="opt-color-dot" style="background:${color}"></span>
        <span style="color:${color}">${opt}</span>
      </span>
      <div class="opt-check" id="vchk-${i}"></div>
    </div>`;
  }).join('');
}

async function castVote(idx) {
  const poll = S.poll;
  if (!poll) return;
  if (poll.choice_mode==='single') {
    disableVoteRows();
    document.getElementById(`vchk-${idx}`)?.classList.add('checked');
    document.getElementById(`vrow-${idx}`)?.classList.add('selected');
    try {
      await db.submitVote(poll.id, [idx]);
      localStorage.setItem(`iw_voted_${poll.id}`, '1');
      clearInterval(S.timerInterval);
      setTimeout(() => showAlreadyVoted(poll, !db.isLive), 300);
    } catch(e) {
      enableVoteRows();
      document.getElementById(`vchk-${idx}`)?.classList.remove('checked');
      document.getElementById(`vrow-${idx}`)?.classList.remove('selected');
      alert('Error: '+e.message);
    }
  } else {
    const chk=document.getElementById(`vchk-${idx}`);
    const row=document.getElementById(`vrow-${idx}`);
    if (S.multiSelected.has(idx)) {
      S.multiSelected.delete(idx); chk?.classList.remove('checked'); row?.classList.remove('selected');
    } else {
      S.multiSelected.add(idx); chk?.classList.add('checked'); row?.classList.add('selected');
    }
    renderMultiSubmitBtn(poll);
  }
}

function renderMultiSubmitBtn(poll) {
  let btn = document.getElementById('multi-submit-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id='multi-submit-btn'; btn.className='multi-submit-btn';
    document.getElementById('vote-opts-list').after(btn);
  }
  const count = S.multiSelected.size;
  btn.textContent = count>0 ? `✓ Vote (${count} selected)` : 'Please select an option';
  btn.disabled = count===0;
  btn.onclick = async () => {
    if (!S.multiSelected.size) return;
    disableVoteRows(); btn.disabled=true;
    try {
      await db.submitVote(poll.id, [...S.multiSelected]);
      localStorage.setItem(`iw_voted_${poll.id}`, '1');
      clearInterval(S.timerInterval);
      btn.remove(); showAlreadyVoted(poll, !db.isLive);
    } catch(e) { enableVoteRows(); btn.disabled=false; alert('Error: '+e.message); }
  };
}

function disableVoteRows() { document.querySelectorAll('.vote-opt-row').forEach(r=>r.classList.add('disabled')); }
function enableVoteRows()  { document.querySelectorAll('.vote-opt-row').forEach(r=>r.classList.remove('disabled')); }

/* Show "Vote submitted! Waiting…" immediately after voting */
function showAlreadyVoted(poll, showToken) {
  document.getElementById('vote-opts-list').style.display='none';
  document.getElementById('vote-q-head').style.display='none';
  document.getElementById('vote-info-line').style.display='none';
  document.getElementById('vote-timer-bar').classList.add('hidden');
  document.getElementById('vote-success-box').classList.remove('hidden');

  if (showToken) {
    const nonce   = Math.random().toString(36).slice(2,10).toUpperCase();
    const optIdx  = S.multiSelected.size ? [...S.multiSelected][0] : 0;
    const payload = btoa(JSON.stringify({p:poll.id, o:optIdx, n:nonce}));
    const url     = `${location.origin}${location.pathname}?addvote=1&d=${payload}`;
    document.getElementById('vote-token-wrap').classList.remove('hidden');
    if (typeof QRCode !== 'undefined') {
      QRCode.toCanvas(document.getElementById('vote-token-canvas'), url,
        {width:180, margin:1, color:{dark:'#000',light:'#fff'}});
    }
  }
}

function showVoteClosed() {
  document.getElementById('vote-opts-list').style.display='none';
  document.getElementById('vote-success-box').classList.add('hidden');
  document.getElementById('vote-timer-bar').classList.add('hidden');
  document.getElementById('vote-closed-box').classList.remove('hidden');
}

/* ════ REAL-TIME PARTICIPANT SPIN WATCH ══════════════════ */
function startParticipantSpinWatch(pollId) {
  const sub = db.subscribePoll(pollId, async updated => {
    if (updated.status==='spinning') {
      document.getElementById('participant-spin-overlay').classList.remove('hidden');
      document.getElementById('spin-btns').style.display='none';
      if (S.spinWheel && !S.spinWheel.spinning) S.spinWheel.startFastSpin();
    } else if (updated.status==='done' && updated.winner) {
      document.getElementById('participant-spin-overlay').classList.add('hidden');
      const winnerIdx = S.poll.options.indexOf(updated.winner);
      if (winnerIdx >= 0 && S.spinWheel) {
        S.spinWheel.stopFastSpin();
        await S.spinWheel.spinToWinner(winnerIdx);
        revealWinner(winnerIdx);
      }
    }
  });
  S.subs.push(sub);
}

async function loadVotesForSpin(poll) {
  const votes = await db.getVotes(poll.id).catch(()=>[]);
  S.votes=votes; computeCounts();
  renderSpinView();
  if (!S.isHost) document.getElementById('spin-btns').style.display='none';
}

async function showWinnerFromPoll(poll) {
  S.poll=poll;
  const votes=await db.getVotes(poll.id).catch(()=>[]); S.votes=votes; computeCounts();
  renderSpinView(); showView('spin');
  if (poll.winner) {
    const wi=poll.options.indexOf(poll.winner);
    if (wi>=0) revealWinner(wi);
  }
}

/* ════ VOTE TOKEN (No-DB) ════════════════════════════════ */
function handleAddVoteToken(params) {
  try {
    const {p:pollId, o:optIdx, n:nonce} = JSON.parse(atob(params.get('d')));
    const poll = JSON.parse(localStorage.getItem(`iw_poll_${pollId}`)||'null');
    if (!poll) { renderTokenResult(false,'Session not found on this device.'); return; }
    const added = db.addVoteLocal(pollId, Number(optIdx), nonce);
    renderTokenResult(added,
      added ? `✓ Vote for "${poll.options[optIdx]}" collected!` : 'This vote was already counted.');
  } catch { renderTokenResult(false,'Invalid token.'); }
}
function renderTokenResult(ok, msg) {
  document.body.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;
    justify-content:center;min-height:100vh;font-family:'Space Mono',monospace;background:#fff;
    text-align:center;padding:40px 20px;border-top:1px solid #000">
    <div style="font-size:4rem;margin-bottom:20px">${ok?'✓':'✗'}</div>
    <h2 style="font-weight:700;font-size:1rem;margin-bottom:12px;text-transform:uppercase;
      letter-spacing:.08em">${msg}</h2>
    <p style="color:#888;font-size:.8rem;margin-bottom:28px">You can close this window.</p>
    <button onclick="history.back()" style="border:1px solid #000;padding:10px 28px;
      background:#FFF500;font-family:'Space Mono',monospace;font-weight:700;font-size:.8rem;
      letter-spacing:.1em;text-transform:uppercase;cursor:pointer">← Back</button></div>`;
}

/* ════ SPIN VIEW ═════════════════════════════════════════ */
function computeCounts() {
  if (!S.poll) return;
  S.counts = new Array(S.poll.options.length).fill(0);
  S.votes.forEach(v => {
    const i=Number(v.option_index);
    if (i>=0 && i<S.counts.length) S.counts[i]++;
  });
}

function renderSpinView() {
  const poll=S.poll, total=S.counts.reduce((a,b)=>a+b,0), isAlone=S.mode==='alone';
  document.getElementById('spin-question-text').textContent = poll.question;
  document.getElementById('spin-options-pct').innerHTML = poll.options.map((opt,i) => {
    const pct=(!isAlone&&total>0)?Math.round((S.counts[i]/total)*100):null;
    const color=OPT_COLORS[i%OPT_COLORS.length];
    return `<div class="pct-row" id="prow-${i}">
      <span class="pct-label">
        <span style="background:${color};width:10px;height:10px;border-radius:50%;display:inline-block;flex-shrink:0"></span>
        <span style="color:${color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${opt}</span>
      </span>
      ${!isAlone?`<div class="pct-bar-wrap"><div class="pct-bar" style="width:${pct}%;background:${color}"></div></div>
      <span class="pct-val">${pct}%</span>`:''}
    </div>`;
  }).join('');

  const canvas=document.getElementById('spin-wheel-canvas');
  canvas.width=400; canvas.height=400;
  S.spinWheel=new InfluenceWheel(canvas);
  const weights=total>0?S.counts:new Array(poll.options.length).fill(1);
  S.spinWheel.setData(poll.options, weights);
  S.spinWheel.draw();

  document.getElementById('winner-box').classList.add('hidden');
  document.getElementById('winner-box').textContent='';
  document.getElementById('stars-container').innerHTML='';
  document.getElementById('participant-spin-overlay').classList.add('hidden');

  const spinBtns=document.getElementById('spin-btns');
  spinBtns.style.display=S.isHost?'flex':'none';
  document.getElementById('btn-spin-start').disabled=false;
  document.getElementById('btn-spin-stop').disabled=true;

  S.winner=null;
  renderNav('spin');
}

async function onSpinStart() {
  if (!S.spinWheel) return;
  S.spinWheel.startFastSpin();
  document.getElementById('btn-spin-start').disabled=true;
  document.getElementById('btn-spin-stop').disabled=false;
  if (S.poll?.id!=='ALONE') await db.updatePoll(S.poll.id,{status:'spinning'}).catch(()=>{});
}

async function onSpinStop() {
  if (!S.spinWheel) return;
  document.getElementById('btn-spin-stop').disabled=true;
  S.spinWheel.stopAndDetect(async winnerIdx => {
    revealWinner(winnerIdx);
    const winnerLabel=S.poll.options[winnerIdx];
    if (S.poll?.id!=='ALONE') await db.updatePoll(S.poll.id,{status:'done',winner:winnerLabel}).catch(()=>{});
  });
}

async function revealWinner(winnerIdx) {
  S.winner=winnerIdx;
  const winLabel=S.poll.options[winnerIdx], winColor=OPT_COLORS[winnerIdx%OPT_COLORS.length];

  document.querySelectorAll('.pct-row').forEach(r=>r.classList.remove('winner-row'));
  document.getElementById(`prow-${winnerIdx}`)?.classList.add('winner-row');

  const box=document.getElementById('winner-box');
  box.textContent=winLabel.toUpperCase(); box.style.color=winColor;
  box.classList.remove('hidden');

  launchStars();

  const R=document.getElementById('nav-right');
  R.textContent='Share Results →'; R.disabled=false;
  R.onclick=buildAndShowScreenshot;
}

/* ════ STARS ═════════════════════════════════════════════ */
function launchStars() {
  const c=document.getElementById('stars-container'); if (!c) return;
  c.innerHTML='';
  function spawn(delay) {
    const s=document.createElement('span'); s.className='flying-star'; s.textContent='★';
    const sx=5+Math.random()*90, sy=10+Math.random()*80;
    const sz=16+Math.random()*24, dur=3.5+Math.random()*2.5;
    const dx=(Math.random()-.5)*120, dy=-(80+Math.random()*200), rot=(Math.random()-.5)*540;
    s.style.cssText=`left:${sx}%;top:${sy}%;font-size:${sz}px;animation-duration:${dur}s;animation-delay:${delay}s;--dx:${dx}px;--dy:${dy}px;--rot:${rot}deg`;
    c.appendChild(s);
    setTimeout(()=>s.remove(),(dur+delay)*1000+300);
  }
  for(let i=0;i<20;i++) spawn(Math.random()*.6);
  setTimeout(()=>{for(let i=0;i<12;i++) spawn(Math.random()*.8);}, 1000);
  setTimeout(()=>{for(let i=0;i<8;i++)  spawn(Math.random()*.5);}, 3000);
}

/* ════ SCREENSHOT (programmatic – vivid colors + stars) ══ */
async function buildAndShowScreenshot() {
  openModal('screenshot');
  // Draw a clean result card programmatically (more reliable than html2canvas)
  const canvas = drawResultCard();
  canvas.id    = 'screenshot-canvas';
  canvas.style.cssText = 'display:block;width:100%;height:auto;';
  const wrap = document.getElementById('screenshot-preview-wrap');
  wrap.innerHTML = ''; wrap.appendChild(canvas);
}

function drawResultCard() {
  const poll=S.poll, total=S.counts.reduce((a,b)=>a+b,0), isAlone=S.mode==='alone';
  const W=960, H=540;
  const card=document.createElement('canvas'); card.width=W; card.height=H;
  const ctx=card.getContext('2d');

  // Background
  ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,W,H);

  // Black header
  ctx.fillStyle='#000'; ctx.fillRect(0,0,W,52);
  ctx.fillStyle='#fff'; ctx.font='700 11px "Space Mono",monospace';
  ctx.letterSpacing='0.1em';
  ctx.fillText('THE INFLUENCE WHEEL', 20, 32);

  // Left panel
  const LW = 380;
  ctx.fillStyle='#000'; ctx.fillRect(LW, 52, 1, H-52); // divider

  // Question label
  ctx.fillStyle='#888'; ctx.font='700 9px "Space Mono",monospace';
  ctx.fillText('QUESTION', 20, 82);
  ctx.fillStyle='#000'; ctx.fillRect(20, 87, LW-40, 1);

  // Question text
  ctx.fillStyle='#000'; ctx.font='700 18px "Playfair Display",serif';
  const qLines = wrapTextArr(ctx, poll.question, LW-40, 18);
  qLines.forEach((line,i) => ctx.fillText(line, 20, 114+i*26));

  // Results label
  const resultsY = 114 + qLines.length*26 + 20;
  ctx.fillStyle='#888'; ctx.font='700 9px "Space Mono",monospace';
  ctx.fillText('RESULTS', 20, resultsY);
  ctx.fillStyle='#000'; ctx.fillRect(20, resultsY+5, LW-40, 1);

  // Option rows with vivid colors
  poll.options.forEach((opt,i) => {
    const pct=total>0?Math.round(S.counts[i]/total*100):0;
    const color=OPT_COLORS[i%OPT_COLORS.length];
    const y=resultsY+26+i*38;
    if (y > H-60) return;

    // Winner highlight
    if (i===S.winner) {
      ctx.fillStyle='#FFF500'; ctx.fillRect(16, y-18, LW-32, 36);
    }

    // Color dot
    ctx.beginPath(); ctx.arc(30, y, 6, 0, Math.PI*2);
    ctx.fillStyle=color; ctx.fill();

    // Option label
    ctx.fillStyle=color; ctx.font='700 14px "Space Mono",monospace';
    const label=opt.length>22?opt.slice(0,21)+'…':opt;
    ctx.fillText(label, 44, y+5);

    // Percentage bar + value (GROUP only)
    if (!isAlone) {
      const barX=44, barY=y+10, barW=LW-100, barH=3;
      ctx.fillStyle='#eee'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle=color;  ctx.fillRect(barX, barY, barW*pct/100, barH);
      ctx.fillStyle='#000'; ctx.font='700 11px "Space Mono",monospace';
      ctx.fillText(`${pct}%`, LW-56, y+5);
    }
  });

  // Right panel: WHEEL
  const wc=document.getElementById('spin-wheel-canvas');
  const RX=LW+20, wSize=Math.min(W-LW-40, H-100);
  const wY=(H-wSize)/2+10;
  ctx.drawImage(wc, RX, wY, wSize, wSize);

  // Pointer triangle
  const pX=RX+wSize/2, pY=wY-6;
  ctx.beginPath(); ctx.moveTo(pX,pY); ctx.lineTo(pX-14,pY-22); ctx.lineTo(pX+14,pY-22);
  ctx.fillStyle='#fff'; ctx.fill();
  ctx.strokeStyle='#000'; ctx.lineWidth=2; ctx.stroke();

  // Winner box on wheel
  if (S.winner !== null) {
    const wL=poll.options[S.winner], wC=OPT_COLORS[S.winner%OPT_COLORS.length];
    const bW=Math.min(200, wSize*0.55), bH=44;
    const bX=RX+(wSize-bW)/2, bY=wY+(wSize-bH)/2;
    ctx.fillStyle='#FFF500'; ctx.fillRect(bX, bY, bW, bH);
    ctx.strokeStyle='#000'; ctx.lineWidth=1.5; ctx.strokeRect(bX, bY, bW, bH);
    ctx.fillStyle=wC; ctx.font=`700 ${Math.max(12,bW/14)}px "Space Mono",monospace`;
    ctx.textAlign='center';
    ctx.fillText(wL.toUpperCase().slice(0,18), bX+bW/2, bY+bH/2+5);
    ctx.textAlign='left';
  }

  // Yellow stars scattered
  ctx.fillStyle='#FFF500'; ctx.font='bold 22px sans-serif';
  const starPositions=[[RX+wSize*0.15,wY+wSize*0.1],[RX+wSize*0.9,wY+wSize*0.15],
    [RX+wSize*0.05,wY+wSize*0.85],[RX+wSize*0.88,wY+wSize*0.82],[RX+wSize*0.5,wY-30]];
  starPositions.forEach(([sx,sy]) => {
    ctx.strokeStyle='rgba(0,0,0,0.3)'; ctx.lineWidth=1;
    ctx.strokeText('★', sx, sy);
    ctx.fillText('★', sx, sy);
  });

  // Footer
  ctx.fillStyle='#F5F5F5'; ctx.fillRect(0, H-36, W, 36);
  ctx.fillStyle='#000'; ctx.fillRect(0, H-36, W, 1);
  ctx.fillStyle='#888'; ctx.font='400 10px "Space Mono",monospace';
  ctx.fillText('THE INFLUENCE WHEEL', 20, H-14);

  return card;
}

function wrapTextArr(ctx, text, maxW, fontSize) {
  const words = text.split(' '), lines = [];
  let line = '';
  words.forEach(word => {
    const test = line+(line?' ':'')+word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line=word; }
    else line=test;
  });
  if (line) lines.push(line);
  return lines;
}

function downloadScreenshot() {
  const c=document.querySelector('.screenshot-preview-wrap canvas'); if (!c) return;
  const a=document.createElement('a'); a.href=c.toDataURL('image/png');
  a.download=`influence-wheel-${S.poll?.id||'result'}.png`; a.click();
}
async function shareScreenshot() {
  const c=document.querySelector('.screenshot-preview-wrap canvas'); if (!c) return;
  try {
    const blob=await new Promise(r=>c.toBlob(r,'image/png'));
    const file=new File([blob],'influence-wheel.png',{type:'image/png'});
    if (navigator.canShare?.({files:[file]})) await navigator.share({files:[file],title:'The Influence Wheel'});
    else downloadScreenshot();
  } catch { downloadScreenshot(); }
}

/* ════ MODALS ════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(`modal-${id}`).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(`modal-${id}`).classList.add('hidden'); }
async function submitJoin() {
  const code=document.getElementById('join-code-input').value.trim().toUpperCase();
  if (code.length<4) { document.getElementById('join-error').textContent='Please enter a code.'; return; }
  closeModal('join');
  if (db.isLive) await enterVote(code);
  else {
    const poll=await db.getPoll(code);
    if (poll) enterVoteNoDB(poll); else alert('Session not found.\n(Demo mode: please use the full link)');
  }
}
function processCollectUrl() {
  const raw=document.getElementById('collect-url').value.trim();
  try {
    const url=new URL(raw), pars=new URLSearchParams(url.search);
    if (!pars.has('d')) throw new Error();
    const {p:pollId, o:optIdx, n:nonce}=JSON.parse(atob(pars.get('d')));
    const added=db.addVoteLocal(pollId, Number(optIdx), nonce);
    if (added) {
      document.getElementById('collect-ok').classList.remove('hidden');
      document.getElementById('collect-error').textContent='';
      document.getElementById('collect-url').value='';
      setTimeout(()=>closeModal('collect'), 1500);
    } else document.getElementById('collect-error').textContent='Duplicate – already counted.';
  } catch { document.getElementById('collect-error').textContent='Invalid URL.'; }
}

/* ════ CLEANUP ═══════════════════════════════════════════ */
function cleanupSubs() {
  clearInterval(S.timerInterval);
  S.subs.forEach(s=>s?.unsubscribe?.());
  S.subs=[]; db.cleanup();
  S.spinWheel?.stopFastSpin?.();
}
