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

# Cor de cada valor nas fichas físicas reais (usada só como palpite ao migrar
# dados antigos — value e color são independentes dali em diante).
COR_POR_VALOR_PADRAO = {100: "cinza", 500: "roxo", 1000: "amarelo", 5000: "azul", 25000: "rosa"}

CHIPS_PADRAO = [
    {"value": 100, "model": "modelo-1", "color": "cinza"},
    {"value": 500, "model": "modelo-1", "color": "roxo"},
    {"value": 1000, "model": "modelo-1", "color": "amarelo"},
    {"value": 5000, "model": "modelo-1", "color": "azul"},
    {"value": 25000, "model": "modelo-1", "color": "rosa"},
]


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
            chips_json TEXT NOT NULL DEFAULT '[]',
            configured INTEGER NOT NULL DEFAULT 0,
            payout_json TEXT NOT NULL DEFAULT '[null, null, null]',
            payout_confirmed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            finished_at TEXT
        );

        CREATE TABLE IF NOT EXISTS participants (
            id TEXT PRIMARY KEY,
            tournament_id TEXT NOT NULL REFERENCES tournaments(id),
            name TEXT NOT NULL,
            rebuys INTEGER NOT NULL DEFAULT 0,
            addon INTEGER NOT NULL DEFAULT 0,
            paid_amount REAL NOT NULL DEFAULT 0,
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
    _migrar(con)

    atual = con.execute(
        "SELECT value FROM settings WHERE key = 'current_tournament_id'"
    ).fetchone()
    if atual is None:
        criar_torneio(con, nome="Home Game")
    con.close()


def _migrar(con):
    # CREATE TABLE IF NOT EXISTS não adiciona colunas a um banco já existente,
    # então bancos criados antes de um novo campo precisam desse ajuste manual.
    colunas_torneios = {row["name"] for row in con.execute("PRAGMA table_info(tournaments)")}
    if "configured" not in colunas_torneios:
        con.execute("ALTER TABLE tournaments ADD COLUMN configured INTEGER NOT NULL DEFAULT 0")
        # Torneios que já existiam antes dessa trava continuam utilizáveis sem re-confirmação.
        con.execute("UPDATE tournaments SET configured = 1")
        con.commit()
    if "payout_json" not in colunas_torneios:
        con.execute("ALTER TABLE tournaments ADD COLUMN payout_json TEXT")
        if {"payout_override_1", "payout_override_2", "payout_override_3"} <= colunas_torneios:
            # Veio do esquema antigo de exatamente 3 posições fixas — migra pra lista.
            for row in con.execute("SELECT id, payout_override_1, payout_override_2, payout_override_3 FROM tournaments"):
                lista = [row["payout_override_1"], row["payout_override_2"], row["payout_override_3"]]
                con.execute("UPDATE tournaments SET payout_json = ? WHERE id = ?", (json.dumps(lista), row["id"]))
        else:
            con.execute("UPDATE tournaments SET payout_json = '[null, null, null]' WHERE payout_json IS NULL")
        con.commit()
    if "payout_confirmed" not in colunas_torneios:
        con.execute("ALTER TABLE tournaments ADD COLUMN payout_confirmed INTEGER NOT NULL DEFAULT 0")
        con.commit()
    if "chips_json" not in colunas_torneios:
        con.execute("ALTER TABLE tournaments ADD COLUMN chips_json TEXT")
        if "chip_values" in colunas_torneios:
            # Veio do esquema antigo (texto livre "100, 500, ...") — migra pra lista
            # de {value, model}, todas com o modelo 1 (único que existia até então).
            for row in con.execute("SELECT id, chip_values FROM tournaments"):
                valores = []
                for pedaco in (row["chip_values"] or "").split(","):
                    digitos = "".join(c for c in pedaco if c.isdigit())
                    if digitos:
                        numero = int(digitos)
                        valores.append({"value": numero, "model": "modelo-1", "color": COR_POR_VALOR_PADRAO.get(numero, "cinza")})
                con.execute(
                    "UPDATE tournaments SET chips_json = ? WHERE id = ?",
                    (json.dumps(valores or CHIPS_PADRAO), row["id"]),
                )
        else:
            con.execute("UPDATE tournaments SET chips_json = ? WHERE chips_json IS NULL", (json.dumps(CHIPS_PADRAO),))
        con.commit()

    # Modelo e cor passaram a ser independentes do valor — bancos de uma versão
    # anterior têm fichas sem "color" (vinha implícito do valor). Preenche com o
    # palpite óbvio (cor que aquele valor tinha nas fichas físicas reais).
    for row in con.execute("SELECT id, chips_json FROM tournaments"):
        fichas = json.loads(row["chips_json"] or "[]")
        se_mudou = False
        for f in fichas:
            if "color" not in f:
                f["color"] = COR_POR_VALOR_PADRAO.get(f.get("value"), "cinza")
                se_mudou = True
            # Modelo passou a ser um nome escolhido pelo usuário (slug), não mais
            # um número fixo de 1 a 3 — bancos antigos ainda guardam o número.
            if isinstance(f.get("model"), int):
                f["model"] = "modelo-" + str(f["model"])
                se_mudou = True
        if se_mudou:
            con.execute("UPDATE tournaments SET chips_json = ? WHERE id = ?", (json.dumps(fichas), row["id"]))
    con.commit()

    # Coluna antiga (substituída por chips_json) ainda tinha NOT NULL sem default —
    # como criar_torneio() não a preenche mais, criar torneio quebrava. Remove de vez.
    if "chip_values" in colunas_torneios:
        con.execute("ALTER TABLE tournaments DROP COLUMN chip_values")
        con.commit()

    colunas_participantes = {row["name"] for row in con.execute("PRAGMA table_info(participants)")}
    if "paid_amount" not in colunas_participantes:
        con.execute("ALTER TABLE participants ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0")
        if "paid" in colunas_participantes:
            # Migra o antigo sim/não: quem estava marcado como pago vira "pagou o valor
            # devido inteiro" (estimado com o preço por ação do próprio torneio).
            participantes = con.execute(
                """
                SELECT p.id, p.rebuys, p.addon, t.action_price
                FROM participants p JOIN tournaments t ON t.id = p.tournament_id
                WHERE p.paid = 1
                """
            ).fetchall()
            for p in participantes:
                acoes = 1 + p["rebuys"] + (1 if p["addon"] else 0)
                con.execute(
                    "UPDATE participants SET paid_amount = ? WHERE id = ?",
                    (acoes * p["action_price"], p["id"]),
                )
        con.commit()


def registrar_evento(con, tournament_id, tipo, participant_id=None, detalhe=""):
    con.execute(
        "INSERT INTO events (id, tournament_id, participant_id, type, details, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (novo_id(), tournament_id, participant_id, tipo, detalhe, agora_iso()),
    )


def criar_torneio(con, nome, levels=None, entry_value=1000, reentry_value=1000,
                   addon_value=2000, action_price=20.0, dealer_share=5.0,
                   chips=None, tornar_atual=True):
    tid = novo_id()
    con.execute(
        """
        INSERT INTO tournaments (
            id, name, status, levels_json, current_level_index,
            elapsed_before_ref, reference_at, muted,
            entry_value, reentry_value, addon_value,
            action_price, dealer_share, chips_json, payout_json,
            created_at, finished_at
        ) VALUES (?, ?, 'paused', ?, 0, 0, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            tid, nome, json.dumps(levels or NIVEIS_PADRAO),
            entry_value, reentry_value, addon_value,
            action_price, dealer_share, json.dumps(chips or CHIPS_PADRAO),
            json.dumps([None, None, None]),
            agora_iso(),
        ),
    )
    if tornar_atual:
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


# Paleta de cores do sistema inteiro (não por torneio) — "default" é o roxo/índigo
# original, sempre disponível mesmo sem linha na tabela settings.
TEMAS_COR_VALIDOS = ["default", "nord", "gruvbox", "solarized", "rose-pine", "one-dark"]


def cor_tema_atual(con):
    row = con.execute("SELECT value FROM settings WHERE key = 'color_theme'").fetchone()
    return row["value"] if row and row["value"] in TEMAS_COR_VALIDOS else "default"


def definir_cor_tema(con, tema):
    con.execute(
        """
        INSERT INTO settings (key, value) VALUES ('color_theme', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (tema,),
    )
    con.commit()
