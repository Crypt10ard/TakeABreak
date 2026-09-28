# Atem

**Dein ruhiger Pausen-Begleiter für Windows und macOS.**
Atem läuft still im Tray (Windows) bzw. in der Menüleiste (macOS), zählt deine Fokuszeit
und holt dich zur richtigen Zeit aus dem Tunnel – mit einer geführten Pause aus
Atmung, Augenübungen, Dehnen und Bewegung.

---

## Was Atem kann

| | |
|---|---|
| **Rhythmus** | Fokus- und Pausenlänge frei einstellbar (z. B. 55 / 5, Pomodoro 25 / 5, Tiefenarbeit 90 / 15). |
| **Vorwarnung** | Eine Kapsel oben am Bildschirm kündigt die Pause an (Standard 60 s), mit „Jetzt“ und „+5 Min.“. |
| **Geführte Pause** | Vollbild auf allen Monitoren. Ein atmender 3D-Orb führt durch das Programm: Atmung (Ruhig 4·6, Box, 4·7·8), Fernblick, Augen kreisen, Palming, Blinzeln, Schultern, Nacken, Strecken, Bewegen. Das Programm wird exakt auf deine Pausenlänge zugeschnitten. |
| **Mikropausen** | 20-20-20-Regel für die Augen: alle 20 Min. für 20 s in die Ferne schauen – als dezente Kapsel oder im Vollbild. |
| **Konsequenz** | *Sanft* (Klick zum Überspringen), *Ausgewogen* (gedrückt halten, max. 2× verschieben), *Strikt* (nur Notausstieg, 5 s halten). |
| **Abwesenheit** | Bist du länger weg (Mittag, Meeting, Bildschirm gesperrt, Laptop zugeklappt), zählt das als Pause und der Zähler beginnt neu. |
| **Tray / Menüleiste** | Ein Ring im Symbol füllt sich bis zur nächsten Pause (orange kurz davor). Klick öffnet das Mini-Panel, Rechtsklick das Menü. Auf dem Mac optional mit Minuten-Countdown. |
| **Bilanz** | Eingehaltene Pausen, Fokuszeit, Mikropausen, Serie und die letzten 7 Tage. |
| **Autostart** | Startet beim Anmelden automatisch und unsichtbar im Hintergrund. |
| **Klang** | Synthetisierte Klangschale und ein Meeresrauschen, das mit deinem Atem kommt und geht. |

---

## Installieren

### Windows
1. `release\Atem-Setup-1.0.0.exe` doppelklicken. Atem installiert sich für deinen Benutzer (kein Admin nötig) und startet danach.
2. Windows SmartScreen meldet evtl. „Unbekannter Herausgeber“ (die App ist nicht signiert):
   **Weitere Informationen → Trotzdem ausführen**.
3. **Tipp:** Windows 11 versteckt neue Tray-Symbole oft unter dem **^**-Pfeil unten rechts.
   Zieh das Atem-Symbol in die Taskleiste, dann siehst du den Pausen-Ring immer.

### macOS
Einen Mac-Installer kann man nicht unter Windows bauen. Zwei Wege:

- **Auf dem Mac bauen:** Projektordner auf den Mac kopieren, dann
  ```bash
  npm install
  npm run dist:mac
  ```
  → `release/Atem-1.0.0.dmg` (Universal: Apple Silicon + Intel). Öffnen, Atem in *Programme* ziehen.
- **Von GitHub bauen lassen:** Projekt in ein GitHub-Repository pushen, unter *Actions* den Workflow
  **Build** starten. Nach ein paar Minuten liegen `.dmg` und `.exe` als Artefakte bereit.

Die App ist ad hoc signiert (nicht notarisiert). Beim ersten Start einer heruntergeladenen Version:
**Rechtsklick auf Atem → Öffnen → Öffnen**. Falls macOS meldet, die App sei beschädigt:
```bash
xattr -dr com.apple.quarantine /Applications/Atem.app
```
Falls der Autostart auf dem Mac nicht greift: *Systemeinstellungen → Allgemein → Anmeldeobjekte → Atem hinzufügen*.

---

## Bedienung

- **Einstellungen öffnen:** Klick aufs Tray-Symbol → *Einstellungen*, oder Atem nochmals starten.
  Alles speichert sich sofort („Gespeichert ✓“ oben rechts).
- **Pause sofort:** Tray-Panel → *Jetzt Pause machen*.
- **In Ruhe gelassen werden:** Tray-Panel → *Pausieren* (30 Min., 1 Std., 2 Std., bis morgen früh).
- **Pause testen:** In den Einstellungen unter *Pausenprogramm* → *Pause testen* (60 s Vorschau, zählt nicht zur Statistik).
- **Beenden:** Tray-Panel → *Beenden* (zweimal klicken) oder Rechtsklick aufs Symbol → *Atem beenden*.

Daten liegen lokal und nur bei dir:
Windows `%APPDATA%\Atem\` · macOS `~/Library/Application Support/Atem/`
(`settings.json`, `stats.json` – 90 Tage Verlauf).

---

## Entwicklung

Voraussetzung: Node.js 20+.

```bash
npm install
npm start          # App starten (baut vorher die Oberfläche)
npm run dev        # dasselbe mit DevTools (F12) und Konsolen-Ausgaben
npm test           # Unit-Tests: Pausen-Logik und Programm-Generator
npm run preview    # Oberflächen im Browser ansehen: http://localhost:5178/settings/
npm run dist:win   # Windows-Installer nach release/
npm run icons      # App-Icons aus SVG neu erzeugen
```

Browser-Vorschau mit Parametern, z. B.:
`/break/?kind=long&duration=300&t=110` (Pause, bei Sekunde 110) ·
`/island/?kind=warn` · `/popover/?mode=paused`.

Nützliche Umgebungsvariablen:
`ATEM_PROFILE=test` (separates Profil, kein Autostart-Eintrag) ·
`ATEM_WINDOWED=1` (Pausen als normales Fenster statt Vollbild).

Falls Electron nach `npm install` nicht startet: `node node_modules/electron/install.js`.

### Aufbau

```
src/main/         Electron-Hauptprozess
  main.js         Start, Autostart, IPC, Aktionen
  scheduler.js    Die Pausen-Uhr (reine Logik, getestet)
  windows.js      Einstellungen, Tray-Panel, Kapsel, Vollbild-Overlays
  tray.js         Tray-Menü; tray-icon.js zeichnet den Fortschrittsring (eigener PNG-Encoder)
  store.js/stats.js  Einstellungen & Statistik (JSON, atomar geschrieben)
src/preload/      Sichere Brücke (contextIsolation, sandbox)
src/renderer/
  settings/       Einstellungen: GSAP ScrollSmoother, SplitText, Draggable + Inertia, three.js-Orb
  break/          Pausen-Overlay; program.js baut das geführte Programm
  island/         Kapsel für Vorwarnung, Mikropause, Hinweise
  popover/        Mini-Panel am Tray-Symbol
  shared/         Design-Tokens, Orb-Shader, Klang (WebAudio), UI-Bausteine, Browser-Mock
```

Technik: Electron 44 · GSAP 3.15 (ScrollTrigger, ScrollSmoother, SplitText, Draggable, Inertia) ·
three.js (eigene GLSL-Shader: Simplex-Noise-Verformung, Fresnel-Glow, Partikel) · esbuild ·
Schriften Instrument Serif, Geist, Geist Mono (lokal eingebunden, funktioniert offline).
