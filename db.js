/* ════════════════════════════════════════════════════════
   db.js – Datenbank-Abstraktion
   Unterstützt:
     • Supabase (Echtzeit, Level 3)
     • localStorage Demo-Modus (Level 2 – kein Server)
   ════════════════════════════════════════════════════════ */

class InfluenceDB {
  constructor() {
    this.sb    = null;
    this.isLive = false;
    this._chans = [];

    const ok =
      typeof SUPABASE_URL !== 'undefined' &&
      SUPABASE_URL &&
      SUPABASE_URL.startsWith('https://');

    if (ok) {
      try {
        this.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.isLive = true;
        console.log('✅ Supabase verbunden – Live-Modus');
      } catch (e) {
        console.warn('⚠️ Supabase-Fehler, Demo-Modus aktiv:', e);
      }
    } else {
      console.log('⚡ Demo-Modus (localStorage)');
    }
  }

  // ── ID generieren ────────────────────────────────────
  _id() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  // ── Poll erstellen ───────────────────────────────────
  async createPoll(name, question, options, choiceMode) {
    const poll = {
      id:          this._id(),
      name,
      question,
      options,          // string[]
      choice_mode:  choiceMode,  // 'single' | 'multiple'
      status:      'voting',      // 'voting' | 'closed' | 'done'
      winner:       null,
      created_at:   new Date().toISOString(),
    };

    if (this.isLive) {
      const { data, error } = await this.sb
        .from('polls').insert(poll).select().single();
      if (error) throw error;
      return data;
    }

    localStorage.setItem(`iw_poll_${poll.id}`, JSON.stringify(poll));
    return poll;
  }

  // ── Poll laden ───────────────────────────────────────
  async getPoll(id) {
    if (this.isLive) {
      const { data } = await this.sb
        .from('polls').select('*').eq('id', id).single();
      return data;
    }
    const raw = localStorage.getItem(`iw_poll_${id}`);
    return raw ? JSON.parse(raw) : null;
  }

  // ── Poll aktualisieren ───────────────────────────────
  async updatePoll(id, patch) {
    if (this.isLive) {
      const { error } = await this.sb
        .from('polls').update(patch).eq('id', id);
      if (error) throw error;
      return;
    }
    const poll = await this.getPoll(id);
    if (poll) {
      Object.assign(poll, patch);
      localStorage.setItem(`iw_poll_${id}`, JSON.stringify(poll));
    }
  }

  // ── Stimme abgeben ───────────────────────────────────
  async submitVote(pollId, optionIndices) {
    // optionIndices: number[] (für single choice immer length=1)
    if (this.isLive) {
      const rows = optionIndices.map(i => ({
        poll_id: pollId, option_index: i
      }));
      const { error } = await this.sb.from('votes').insert(rows);
      if (error) throw error;
      return;
    }
    const key  = `iw_votes_${pollId}`;
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    optionIndices.forEach(i =>
      prev.push({ poll_id: pollId, option_index: i, id: Date.now() + Math.random() })
    );
    localStorage.setItem(key, JSON.stringify(prev));
  }

  // ── Stimmen laden ────────────────────────────────────
  async getVotes(pollId) {
    if (this.isLive) {
      const { data } = await this.sb
        .from('votes').select('option_index').eq('poll_id', pollId);
      return data || [];
    }
    return JSON.parse(localStorage.getItem(`iw_votes_${pollId}`) || '[]');
  }

  // ── Stimme lokal hinzufügen (No-DB Level 2) ──────────
  addVoteLocal(pollId, optionIndex, nonce) {
    const nonceKey = `iw_nonces_${pollId}`;
    const nonces = JSON.parse(localStorage.getItem(nonceKey) || '[]');
    if (nonces.includes(nonce)) return false; // Duplikat
    nonces.push(nonce);
    localStorage.setItem(nonceKey, JSON.stringify(nonces));

    const key  = `iw_votes_${pollId}`;
    const prev = JSON.parse(localStorage.getItem(key) || '[]');
    prev.push({ poll_id: pollId, option_index: optionIndex, id: nonce });
    localStorage.setItem(key, JSON.stringify(prev));
    return true;
  }

  // ── Echtzeit-Subscription: Stimmen ──────────────────
  subscribeVotes(pollId, cb) {
    if (this.isLive) {
      const ch = this.sb.channel(`votes:${pollId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public',
          table: 'votes', filter: `poll_id=eq.${pollId}`
        }, async () => {
          const votes = await this.getVotes(pollId);
          cb(votes);
        })
        .subscribe();
      this._chans.push(ch);
      return { unsubscribe: () => this.sb.removeChannel(ch) };
    }
    const t = setInterval(async () => cb(await this.getVotes(pollId)), 1500);
    return { unsubscribe: () => clearInterval(t) };
  }

  // ── Echtzeit-Subscription: Poll-Status ──────────────
  subscribePoll(pollId, cb) {
    if (this.isLive) {
      const ch = this.sb.channel(`poll:${pollId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public',
          table: 'polls', filter: `id=eq.${pollId}`
        }, ({ new: p }) => cb(p))
        .subscribe();
      this._chans.push(ch);
      return { unsubscribe: () => this.sb.removeChannel(ch) };
    }
    let lastStatus = null;
    const t = setInterval(async () => {
      const p = await this.getPoll(pollId);
      if (p && p.status !== lastStatus) { lastStatus = p.status; cb(p); }
    }, 1500);
    return { unsubscribe: () => clearInterval(t) };
  }

  cleanup() {
    this._chans.forEach(c => this.sb?.removeChannel(c));
    this._chans = [];
  }
}

const db = new InfluenceDB();
