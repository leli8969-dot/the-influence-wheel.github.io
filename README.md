# The Influence Wheel
**Abstimmungs-App mit gewichtetem Glücksrad**
# App-Fluss

Home → ALONE/GROUP wählen → Frage + Optionen eingeben
     → Link/Code teilen → Abstimmung läuft → Rad drehen → Gewinner!
     
### Gleiches Netzwerk (No-DB Prozess)

Der Host erstellt die Abstimmung. Der Voting-Link enthält **alle Poll-Daten codiert** (Base64 in URL), sodass kein Server benötigt wird.

**Stimmen sammeln:**
- Jeder Wähler öffnet den Link, stimmt ab, erhält einen **QR-Code (Vote-Token)**
- Der Host scannt diesen QR-Code mit der Kamera → Browser öffnet `?addvote=...`
- Die Stimme wird im localStorage des Host-Geräts registriert
- Das Host-Dashboard aktualisiert sich automatisch

### Supabase Echtzeit

- Alle Stimmen werden in Supabase gespeichert
- Live-Updates via PostgreSQL Realtime Subscriptions
- Funktioniert von überall auf der Welt

