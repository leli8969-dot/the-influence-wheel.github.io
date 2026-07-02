# 🎡 The Influence Wheel

> *Sometimes the best decisions are the ones you don't fully control.*

**The Influence Wheel** ist eine interaktive Web-Abstimmungs-App die Entscheidungen in Gruppen demokratisch und spielerisch gestaltet. Nutzer:innen erstellen eine Frage, laden andere per Link ein, alle stimmen gleichzeitig ab — und ein gewichtetes Glücksrad trifft die finale Entscheidung.

🔗 **Live Demo:** [the-influence-wheel.github.io](https://leli8969-dot.github.io/the-influence-wheel.github.io/)

---

## ✨ Features

### Alone-Modus
- Frage + Antwortoptionen erstellen
- Direkt zum Glücksrad — kein Teilen nötig
- START / STOP — das Rad entscheidet

### Group-Modus (Echtzeit)
- Host erstellt eine Abstimmung mit einzigartigem **Vote-ID-Code**
- Link per QR-Code oder direkt teilen
- Host sieht live wie viele Personen im Raum sind
- **"Start Voting"** → Countdown startet **synchron auf allen Geräten gleichzeitig**
- Alle stimmen zur gleichen Zeit ab — fair und demokratisch
- Host beendet Voting → alle Geräte werden automatisch gesperrt
- Ergebnisse mit Prozentwerten erscheinen auf allen Geräten
- Host dreht das **gewichtete Glücksrad** (mehr Stimmen = größeres Segment)
- Gewinner erscheint live auf allen Geräten gleichzeitig
- Ergebnisse als **PNG-Screenshot** teilen


## 📁 Dateistruktur

```
/
├── index.html        # Komplette App (Single Page)
├── style.css         # Alle Styles
├── app.js            # Haupt-Logik
├── db.js             # Datenbank-Abstraktion (Supabase + Demo)
├── wheel.js          # Glücksrad (Canvas)
├── config.js         # Supabase-Keys (hier eintragen)
├── setup.sql         # Supabase-Tabellen
└── assets/
    ├── WHEEL.png
    ├── alone_icon.svg
    └── group_icon.svg
```

---

## 📋 Ablauf einer Gruppen-Abstimmung

```
Host erstellt Frage + Optionen
        ↓
Link / QR-Code teilen
        ↓
Teilnehmer öffnen den Link → "You're in!"
        ↓
Host sieht: "3 Participants Ready"
        ↓
Host klickt "Start Voting"
        ↓
⏱ Timer läuft synchron auf allen Geräten
        ↓
Alle stimmen gleichzeitig ab
        ↓
Host beendet Voting → alle gesperrt
        ↓
Ergebnisse mit % erscheinen
        ↓
Host dreht das Glücksrad (START / STOP)
        ↓
🏆 Gewinner auf allen Geräten sichtbar
        ↓
Screenshot teilen
```
