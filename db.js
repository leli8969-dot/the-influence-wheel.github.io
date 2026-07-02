/* ════════════════════════════════════════════════════════
   db.js – Database abstraction
   Supports Supabase (live) + localStorage (demo)
   
   New: lobby state, timer_end_at, participant tracking
   ════════════════════════════════════════════════════════ */

class InfluenceDB {
  constructor() {
    this.sb = null; this.isLive = false; this._chans = [];
    const ok = typeof SUPABASE_URL !== 'undefined' && SUPABASE_URL?.startsWith('https://');
    if (ok) {
      try {
        this.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.isLive = true;
        console.log('✅ Supabase connected – Live mode');
      } catch(e) { console.warn('⚠️ Supabase error, demo mode:', e); }
    } else {
      console.log('⚡ Demo mode (localStorage)');
    }
  }

  _id() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:6}, () => c[Math.floor(Math.random()*c.length)]).join('');
  }

  // ── Session ID for participant tracking ──────────────
  getSessionId() {
    let sid = sessionStorage.getItem('iw_session');
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      sessionStorage.setItem('iw_session', sid);
    }
    return sid;
  }

  // ── Create poll (starts in 'lobby' state) ────────────
  async createPoll(name, question, options, choiceMode) {
    const poll = {
      id: this._id(), name, question, options,
      choice_mode: choiceMode,
      status: 'lobby',         // ← lobby first, not voting
      timer_end_at: null,      // ← set when host starts voting
      winner: null,
      created_at: new Date().toISOString(),
    };
    if (this.isLive) {
      const { data, error } = await this.sb.from('polls').insert(poll).select().single();
      if (error) throw error;
      return data;
    }
    localStorage.setItem(`iw_poll_${poll.id}`, JSON.stringify(poll));
    return poll;
  }

  async getPoll(id) {
    if (this.isLive) {
      const { data } = await this.sb.from('polls').select('*').eq('id', id).single();
      return data;
    }
    const raw = localStorage.getItem(`iw_poll_${id}`);
    return raw ? JSON.parse(raw) : null;
  }

  async updatePoll(id, patch) {
    if (this.isLive) {
      const { error } = await this.sb.from('polls').update(patch).eq('id', id);
      if (error) throw error; return;
    }
    const poll = await this.getPoll(id);
    if (poll) {
      Object.assign(poll, patch);
      localStorage.setItem(`iw_poll_${id}`, JSON.stringify(poll));
    }
  }

  // ── Start voting (sets timer_end_at for all clients) ─
  async startVoting(pollId, durationMs = 120000) {
    const timer_end_at = Date.now() + durationMs;
    await this.updatePoll(pollId, { status: 'voting', timer_end_at });
    return timer_end_at;
  }

  // ── Votes ────────────────────────────────────────────
  async submitVote(pollId, optionIndices) {
    if (this.isLive) {
      const rows = optionIndices.map(i => ({ poll_id: pollId, option_index: i }));
      const { error } = await this.sb.from('votes').insert(rows);
      if (error) throw error; return;
    }
    const key  = `iw_votes_${pollId}`;
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    optionIndices.forEach(i => prev.push({ poll_id: pollId, option_index: i, id: Date.now() + Math.random() }));
    localStorage.setItem(key, JSON.stringify(prev));
  }

  async getVotes(pollId) {
    if (this.isLive) {
      const { data } = await this.sb.from('votes').select('option_index').eq('poll_id', pollId);
      return data || [];
    }
    return JSON.parse(localStorage.getItem(`iw_votes_${pollId}`) || '[]');
  }

  addVoteLocal(pollId, optionIndex, nonce) {
    const nonceKey = `iw_nonces_${pollId}`;
    const nonces   = JSON.parse(localStorage.getItem(nonceKey) || '[]');
    if (nonces.includes(nonce)) return false;
    nonces.push(nonce);
    localStorage.setItem(nonceKey, JSON.stringify(nonces));
    const key  = `iw_votes_${pollId}`;
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    prev.push({ poll_id: pollId, option_index: optionIndex, id: nonce });
    localStorage.setItem(key, JSON.stringify(prev));
    return true;
  }

  // ── Participant tracking ──────────────────────────────
  async participantJoin(pollId) {
  const sessionId = this.getSessionId();
  if (this.isLive) {
    const { error } = await this.sb.from('participants').upsert(
      { poll_id: pollId, session_id: sessionId },
      { onConflict: 'poll_id,session_id' }
    );
    if (error) console.error('participantJoin error:', error);
   
      // Demo: track locally (simulated)
      const key  = `iw_participants_${pollId}`;
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!list.includes(sessionId)) {
        list.push(sessionId);
        localStorage.setItem(key, JSON.stringify(list));
      }
    }
  }

  async getParticipantCount(pollId) {
    if (this.isLive) {
      const { count } = await this.sb.from('participants')
        .select('*', { count: 'exact', head: true }).eq('poll_id', pollId);
      return count || 0;
    }
    const key = `iw_participants_${pollId}`;
    return JSON.parse(localStorage.getItem(key) || '[]').length;
  }

  // ── Subscriptions ────────────────────────────────────
  subscribeVotes(pollId, cb) {
    if (this.isLive) {
      const ch = this.sb.channel(`votes:${pollId}`)
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'votes', filter:`poll_id=eq.${pollId}` },
          async () => cb(await this.getVotes(pollId)))
        .subscribe();
      this._chans.push(ch);
      return { unsubscribe: () => this.sb.removeChannel(ch) };
    }
    const t = setInterval(async () => cb(await this.getVotes(pollId)), 1500);
    return { unsubscribe: () => clearInterval(t) };
  }

  subscribePoll(pollId, cb) {
    if (this.isLive) {
      const ch = this.sb.channel(`poll:${pollId}`)
        .on('postgres_changes', { event:'UPDATE', schema:'public', table:'polls', filter:`id=eq.${pollId}` },
          ({ new: p }) => cb(p))
        .subscribe();
      this._chans.push(ch);
      return { unsubscribe: () => this.sb.removeChannel(ch) };
    }
    let last = null;
    const t = setInterval(async () => {
      const p = await this.getPoll(pollId);
      const sig = p ? `${p.status}${p.winner}${p.timer_end_at}` : null;
      if (sig !== last) { last = sig; if (p) cb(p); }
    }, 1200);
    return { unsubscribe: () => clearInterval(t) };
  }

  subscribeParticipants(pollId, cb) {
    if (this.isLive) {
      const ch = this.sb.channel(`participants:${pollId}`)
        .on('postgres_changes', { event:'INSERT', schema:'public', table:'participants', filter:`poll_id=eq.${pollId}` },
          async () => cb(await this.getParticipantCount(pollId)))
        .subscribe();
      this._chans.push(ch);
      return { unsubscribe: () => this.sb.removeChannel(ch) };
    }
    // Demo: poll participant count
    const t = setInterval(async () => cb(await this.getParticipantCount(pollId)), 2000);
    return { unsubscribe: () => clearInterval(t) };
  }

  cleanup() {
    this._chans.forEach(c => this.sb?.removeChannel(c));
    this._chans = [];
  }
}

const db = new InfluenceDB();
