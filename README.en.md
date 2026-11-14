# PokerTimerTournament

*[Ler em português](README.md)*

A poker tournament control system for home games: tournament setup (chip values, prices, blind structure, payouts), player management (rebuy, add-on, re-entry, payments), and a tournament clock kept in sync in real time across multiple devices on the same network — great for keeping a phone as the control and a TV/monitor showing only the clock for the players.

Four screens: **Admin** (tournament setup and history), **Manager** (players, timer and finalization), **Timer** (clock display for the TV/monitor), and **Settings** (logo, chip models and color theme — all global, shared across every tournament).

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

- `http://<ip>:8000/#admin` — set up tournaments (name, values, chips, payouts, level structure), view past ones, and delete tournaments created by mistake
- `http://<ip>:8000/#gerente` — pick/activate the tournament, register players, rebuy/add-on/re-entry/payment, control the timer and finalize
- `http://<ip>:8000/#timer` — big clock for the TV/monitor (display only: blinds, chips, payouts)
- `http://<ip>:8000/#configuracao` — system logo, chip models and color theme (applies to every tournament)

## Usage flow

1. **Admin** sets up a tournament: name, buy-in/rebuy/add-on chips, price per action, dealer's share, registered chips (value + visual model + color), payouts, and the level structure (blinds/duration/breaks, with the option to mark the level that closes entries). Click **Save**.
2. Tournaments that are saved and not yet started show up in **Manager**, who picks one from the list and clicks **Activate this tournament** (this finalizes the previous one, if it's still running).
3. **Manager** registers players, runs the timer (play/pause/next/previous/±1min/restart), logs rebuy/add-on/re-entry/payment, confirms the payout split, and clicks **Finalize tournament** at the end.
4. A finalized tournament becomes locked for editing and shows up in the **Admin** history, with a participant report and an event timeline — including the level each player was eliminated at and, once entries have closed, their final finishing position. Tournaments created by mistake can be deleted right there (except the one currently active).
5. The **Timer** screen is display-only (clock, blinds, table chips, payouts, prize pool) — meant to stay open on a TV/monitor.

Only the **active** tournament can have its timer run — you can set up/edit other tournaments in parallel (Admin), or just view a saved tournament's players (Manager) without touching the one in progress.

## Features

- Editable level structure (SB/BB/ante/duration/break), with an option to mark the level that closes entries (no re-entry after it) and to propagate an edited value to the following levels.
- Chip/value fields accept shorthand (`2k` = 2000, `1.5m` = 1,500,000).
- Financial tracking: amount owed per player, accumulated prize pool, dealer's share, total collected/pending, with each payment logged as an increment on top of what was already paid.
- Rebuy, add-on (blocked for already-eliminated players) and re-entry (an eliminated player paying back in, only available while entries haven't closed yet) with a per-tournament event log.
- **Payouts**: any number of paid positions (not just 1st/2nd/3rd), each with its own independent percentage of the prize pool (45%/35%/20% defaults for the first three); "Confirm payout split" locks editing and switches the label from "Payout preview" to "Payouts" on the Timer screen too.
- **Elimination history**: every eliminated player's entry logs the level/blinds they were knocked out at; once entries have closed, it also logs their final finishing position (e.g. "8th place"), computed from how many players were still active at that exact moment.
- **Registerable physical chips**: each chip has a value, visual model and color chosen independently — the combination determines the photo shown in the Timer's chip column.
- Tournament deletion in Admin (to undo a mistaken setup) — blocked only for the tournament that's currently active.
- Sound alarm (escalating beeps) on level change and a 30s warning — only fires when the level advances on its own (time ran out), never on a manual click of the timer buttons — and plays only for whoever is looking at the clock (Timer/Manager).
- Light/dark switch (floating icon in the top-right corner, on every screen) and tournament selection that persists across page reloads.
- **Color theme**, selectable globally (see the section below).

## First use

Before starting a real tournament, go to **Admin**, set up the tournament and double-check:

- Tournament name
- Buy-in / rebuy / add-on chips
- Price in your currency per action and how much of it goes to the dealer
- Registered chips (value, model and color of each one)
- Payouts (percentage of each paid position)
- Level structure (comes pre-loaded with 18 example levels when you create a new tournament)

Those come with example numbers and need to be reviewed before charging real money.

## System settings

The **Settings** screen groups global options, which apply to every tournament (past, current or future) and are seen by every connected device:

- **Logo**: upload a PNG (preferably square, with a transparent background) to replace the logo used in the menu and as the background watermark on every screen.
- **Chip models**: each model has a free-form name and as many colors as you want, each color with its own name and photo (one chip per photo — a photo with several chips side by side isn't split automatically). You can add a color to an existing model, remove a single color, or remove an entire model.
- **Color theme**: besides the "Default" theme (the "LK" brand, violet/indigo/cyan), there are 5 more well-known color schemes to pick from — each with a light and a dark variant, following the light/dark switch normally:
  - **Nord** — arctic, blue-toned and cool
  - **Gruvbox Dark/Light** — retro, earthy and warm
  - **Solarized Dark/Light** — low contrast, teal-toned (the only one whose accents don't change between light and dark, by the original palette's own design)
  - **Rosé Pine / Dawn** — dusty rose, understated
  - **One Dark Pro / Atom One Light** — classic blue-grey

  Switching themes is instant across every connected screen (the same real-time mechanism used for the rest of the app).

## Visual identity

The "Default" theme follows the "LK" brand defined in [`lk-poker-identidade-visual/SKILL.md`](lk-poker-identidade-visual/SKILL.md) (violet/indigo/cyan color tokens, shared with the portfolio site). The other color themes (see "System settings") are freely-usable third-party schemes, offered here as visual alternatives.

## Security note

There's no login — anyone with the IP address on the local network can access and edit the data. Fine for home use among friends; don't expose this server to the internet.
