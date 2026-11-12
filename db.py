import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "torneio.db"

NIVEIS_PADRAO = [
    {"sb": 100, "bb": 200, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 100, "bb": 300, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 200, "bb": 400, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 200, "bb": 500, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 300, "bb": 600, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 400, "bb": 800, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 500, "bb": 1000, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 600, "bb": 1200, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 700, "bb": 1500, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 1000, "bb": 2000, "ante": 0, "minutes": 12, "isBreak": False},
    {"sb": 0, "bb": 0, "ante": 0, "minutes": 15, "isBreak": True, "closesEntries": True},
    {"sb": 1000, "bb": 2000, "ante": 0, "minutes": 10, "isBreak": False},
    {"sb": 1500, "bb": 3000, "ante": 0, "minutes": 10, "isBreak": False},
    {"sb": 2000, "bb": 4000, "ante": 0, "minutes": 10, "isBreak": False},
    {"sb": 2500, "bb": 5000, "ante": 0, "minutes": 10, "isBreak": False},
    {"sb": 3000, "bb": 6000, "ante": 0, "minutes": 10, "isBreak": False},
    {"sb": 4000, "bb": 8000, "ante": 0, "minutes": 10, "isBreak": False},
    {"sb": 5000, "bb": 10000, "ante": 0, "minutes": 10, "isBreak": False},
]

CHIP_VALUES_PADRAO = "100, 500, 1.000, 5.000, 25.000"


def agora_iso():
    return datetime.now(timezone.utc).isoformat()


def novo_id():
    return uuid.uuid4().hex


def conectar():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def inicializar():
    con = conectar()
    con.executescript(
        """
        CREATE TABLE IF NOT EXISTS tournaments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT NOT NULL,
            levels_json TEXT NOT NULL,
            current_level_index INTEGER NOT NULL DEFAULT 0,
            elapsed_before_ref REAL NOT NULL DEFAULT 0,
            reference_at TEXT,
            muted INTEGER NOT NULL DEFAULT 0,
            entry_value INTEGER NOT NULL,
            reentry_value INTEGER NOT NULL,
            addon_value INTEGER NOT NULL,
            action_price REAL NOT NULL,
            dealer_share REAL NOT NULL,
            chip_values TEXT NOT NULL,
            created_at TEXT NOT NULL,
            finished_at TEXT
        );

        CREATE TABLE IF NOT EXISTS participants (
            id TEXT PRIMARY KEY,
            tournament_id TEXT NOT NULL REFERENCES tournaments(id),
            name TEXT NOT NULL,
            rebuys INTEGER NOT NULL DEFAULT 0,
            addon INTEGER NOT NULL DEFAULT 0,
            paid INTEGER NOT NULL DEFAULT 0,
            eliminated INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            tournament_id TEXT NOT NULL,
            participant_id TEXT,
            type TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );
        """
    )
    con.commit()

    atual = con.execute(
        "SELECT value FROM settings WHERE key = 'current_tournament_id'"
    ).fetchone()
    if atual is None:
        criar_torneio(con, nome="Home Game")
    con.close()


def registrar_evento(con, tournament_id, tipo, participant_id=None, detalhe=""):
    con.execute(
        "INSERT INTO events (id, tournament_id, participant_id, type, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (novo_id(), tournament_id, participant_id, tipo, detalhe, agora_iso()),
    )


def criar_torneio(con, nome, levels=None, entry_value=1000, reentry_value=1000,
                   addon_value=2000, action_price=20.0, dealer_share=5.0,
                   chip_values=CHIP_VALUES_PADRAO):
    tid = novo_id()
    con.execute(
        """
        INSERT INTO tournaments (
            id, name, status, levels_json, current_level_index,
            elapsed_before_ref, reference_at, muted,
            entry_value, reentry_value, addon_value,
            action_price, dealer_share, chip_values,
            created_at, finished_at
        ) VALUES (?, ?, 'paused', ?, 0, 0, NULL, 0, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            tid, nome, json.dumps(levels or NIVEIS_PADRAO),
            entry_value, reentry_value, addon_value,
            action_price, dealer_share, chip_values,
            agora_iso(),
        ),
    )
    con.execute(
        """
        INSERT INTO settings (key, value) VALUES ('current_tournament_id', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (tid,),
    )
    registrar_evento(con, tid, "torneio_criado", None, nome)
    con.commit()
    return tid


def tournament_id_atual(con):
    row = con.execute(
        "SELECT value FROM settings WHERE key = 'current_tournament_id'"
    ).fetchone()
    return row["value"] if row else None
