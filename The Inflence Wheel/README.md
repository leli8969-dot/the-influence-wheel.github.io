# 🎡 The Influence Wheel
**Abstimmungs-App mit gewichtetem Glücksrad**

---

## Schnellstart

### Demo-Modus (Level 2 – kein Server nötig)
Einfach `index.html` im Browser öffnen – fertig!

- Abstimmungen werden im Browser (localStorage) gespeichert
- Mehrere Geräte: Teilnehmer öffnen den vollständigen Voting-Link
- Vote-Tokens (QR-Codes) werden für die manuelle Stimm-Sammlung generiert

### Supabase-Modus (Level 3 – Echtzeit über Internet)

1. **Supabase-Projekt anlegen:** https://app.supabase.com
2. **Tabellen erstellen:** SQL aus `setup.sql` im SQL-Editor ausführen
3. **Keys kopieren:** Settings → API → URL + anon public key
4. **In `config.js` einfügen:**
   ```js
   const SUPABASE_URL      = 'https://DEIN-PROJEKT.supabase.co';
   const SUPABASE_ANON_KEY = 'dein-anon-key-hier';
   ```

---

## GitHub Pages (Level 2 Bewertung)

1. Repository auf GitHub erstellen (Public)
2. Alle Dateien hochladen
3. Settings → Pages → Source: `main` Branch, `/ (root)`
4. Deine App läuft unter `https://USERNAME.github.io/REPO-NAME`

---

## App-Fluss

```
Home → ALONE/GROUP wählen → Frage + Optionen eingeben
     → Link/Code teilen → Abstimmung läuft → Rad drehen → Gewinner!
```

### Level 2 – Gleiches Netzwerk (No-DB Prozess)

Der Host erstellt die Abstimmung. Der Voting-Link enthält **alle Poll-Daten codiert** (Base64 in URL), sodass kein Server benötigt wird.

**Stimmen sammeln:**
- Jeder Wähler öffnet den Link, stimmt ab, erhält einen **QR-Code (Vote-Token)**
- Der Host scannt diesen QR-Code mit der Kamera → Browser öffnet `?addvote=...`
- Die Stimme wird im localStorage des Host-Geräts registriert
- Das Host-Dashboard aktualisiert sich automatisch

### Level 3 – Supabase Echtzeit

- Alle Stimmen werden in Supabase gespeichert
- Live-Updates via PostgreSQL Realtime Subscriptions
- Funktioniert von überall auf der Welt

---

## Dateistruktur

```
spinvote/
├── index.html     ← Einzige HTML-Datei (Single Page App)
├── style.css      ← Alle Styles
├── config.js      ← Supabase-Keys (hier eintragen)
├── db.js          ← Datenbank-Abstraktion
├── wheel.js       ← Glücksrad Canvas-Rendering
├── app.js         ← Haupt-Anwendungslogik
├── setup.sql      ← Supabase Tabellen (im SQL-Editor ausführen)
└── README.md      ← Diese Anleitung
```

---

## Warum Single Page App (SPA)?

- ✅ Zustand (Votes, Poll-Daten) kann über alle Screens geteilt werden
- ✅ Keine Page-Reloads → flüssige Übergänge
- ✅ Einfachstes Deployment auf GitHub Pages (nur eine `index.html`)
- ✅ Kein State-Verlust beim Navigieren
- ✅ URL-Parameter für direkte Links (`?poll=ABC123`)
