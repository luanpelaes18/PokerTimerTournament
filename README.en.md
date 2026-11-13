# PokerTimerTournament

*[Ler em português](README.md)*

A poker tournament control system for home games: tournament setup (chip values, prices, blind structure), player management (rebuy, add-on, re-entry, payments), and a tournament clock kept in sync in real time across multiple devices on the same network — great for keeping a phone as the control and a TV/monitor showing only the clock for the players.

Three screens: **Admin** (tournament setup and history), **Manager** (players, timer and finalization), and **Timer** (clock display for the TV/monitor).

Stack: Python (FastAPI + WebSocket) + SQLite, plain HTML/CSS/JS frontend served by the backend itself. No cloud, no external account — it runs locally on your network during the game.

## Running it

```bash
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn app:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000` on the computer running the server (it lands on `#menu`).

For other devices (the manager's phone, the timer's TV) on the **same Wi-Fi network**, find the local IP of the machine running the server:

- macOS/Linux: `ipconfig getifaddr en0` (or `hostname -I` on Linux)
- Windows: `ipconfig` ("IPv4 Address" field)

Then open `http://<that-ip>:8000` on the other devices. Direct routes:

- `http://<ip>:8000/#admin` — set up tournaments (name, values, level structure) and view past ones
- `http://<ip>:8000/#gerente` — pick/activate the tournament, register players, rebuy/add-on/re-entry/payment, control the timer and finalize
- `http://<ip>:8000/#timer` — big clock for the TV/monitor (display only)

## Usage flow

1. **Admin** sets up a tournament: name, buy-in/rebuy/add-on chips, price per action, dealer's share, chip denominations, and the level structure (blinds/duration/breaks). Click **Save**.
2. Tournaments that are saved and not yet started show up in **Manager**, who picks one from the list and clicks **Activate this tournament** (this finalizes the previous one, if it's still running).
3. **Manager** registers players, runs the timer (play/pause/next/previous/±1min), logs rebuy/add-on/re-entry/payment, and clicks **Finalize tournament** at the end.
4. A finalized tournament becomes locked for editing and shows up in the **Admin** history, with a participant report and an event timeline.
5. The **Timer** screen is display-only (clock, blinds, next level, prize pool) — meant to stay open on a TV/monitor.

Only the **active** tournament can have its timer run — you can set up/edit other tournaments in parallel (Admin), or just view a saved tournament's players (Manager) without touching the one in progress.

## Features

- Editable level structure (SB/BB/ante/duration/break), with an option to mark the level that closes entries (no re-entry after it) and to propagate an edited value to the following levels.
- Chip/value fields accept shorthand (`2k` = 2000, `1.5m` = 1,500,000).
- Financial tracking: amount owed per player, accumulated prize pool, dealer's share, total collected/pending.
- Rebuy, add-on and re-entry (an eliminated player paying back in) with a per-tournament event log (entry, rebuy, add-on, re-entry, elimination, finalization).
- Sound alarm (escalating beeps) on level change and a 30s warning, playing only for whoever is looking at the clock (Timer/Manager).
- Light/dark theme and tournament selection that persists across page reloads.

## First use

Before starting a real tournament, go to **Admin**, set up the tournament and double-check:

- Tournament name
- Buy-in / rebuy / add-on chips
- Price in your currency per action and how much of it goes to the dealer
- Level structure (comes pre-loaded with 18 example levels when you create a new tournament)

Those come with example numbers and need to be reviewed before charging real money.

## Visual identity

Palette and logo follow the "LK" brand defined in [`lk-poker-identidade-visual/SKILL.md`](lk-poker-identidade-visual/SKILL.md) (violet/indigo/cyan color tokens, shared with the portfolio site).

## Security note

There's no login — anyone with the IP address on the local network can access and edit the data. Fine for home use among friends; don't expose this server to the internet.
