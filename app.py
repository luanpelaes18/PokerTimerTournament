import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db

app = FastAPI(title="Poker Timer Tournament")

STATIC_DIR = Path(__file__).parent / "static"


@app.middleware("http")
async def sem_cache_em_estaticos(request, call_next):
    # Em desenvolvimento os arquivos mudam o tempo todo; sem isso o navegador
    # às vezes reaproveita uma versão antiga do HTML/CSS/JS mesmo com F5.
    response = await call_next(request)
    if request.url.path.startswith("/api") or request.url.path == "/ws":
        return response
    response.headers["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------- modelos --

class NovoParticipante(BaseModel):
    name: str
    tournamentId: Optional[str] = None


class ParticipanteUpdate(BaseModel):
    paidAmount: Optional[float] = None
    eliminated: Optional[bool] = None


class AdminUpdate(BaseModel):
    name: Optional[str] = None
    levels: Optional[List[dict]] = None
    entryValue: Optional[int] = None
    reentryValue: Optional[int] = None
    addonValue: Optional[int] = None
    actionPrice: Optional[float] = None
    dealerShare: Optional[float] = None
    chipValues: Optional[str] = None
    muted: Optional[bool] = None
    configured: Optional[bool] = None
    payout: Optional[List[Optional[float]]] = None
    payoutConfirmed: Optional[bool] = None
    tournamentId: Optional[str] = None


class AjusteTimer(BaseModel):
    deltaMinutes: float


class AvancoNivel(BaseModel):
    expectedIndex: Optional[int] = None


class NovoTorneio(BaseModel):
    name: str = "Home Game"


# ------------------------------------------------------------- ws manager --

class GerenciadorWS:
    def __init__(self):
        self.conexoes: List[WebSocket] = []

    async def conectar(self, ws: WebSocket):
        await ws.accept()
        self.conexoes.append(ws)

    def desconectar(self, ws: WebSocket):
        if ws in self.conexoes:
            self.conexoes.remove(ws)

    async def broadcast(self, dados: dict):
        mortas = []
        for ws in self.conexoes:
            try:
                await ws.send_json(dados)
            except Exception:
                mortas.append(ws)
        for ws in mortas:
            self.desconectar(ws)


ws_manager = GerenciadorWS()


async def publicar_estado(tournament_id: Optional[str] = None, level_change_reason: Optional[str] = None):
    con = db.conectar()
    try:
        tid_atual = db.tournament_id_atual(con)
        alvo = tournament_id or tid_atual
        snapshot = montar_snapshot(con, alvo)
    finally:
        con.close()
    if level_change_reason:
        # "auto" = avançou sozinho por ter zerado o tempo (deve tocar o alarme);
        # "manual" = alguém clicou num botão (não deve tocar).
        snapshot["tournament"]["levelChangeReason"] = level_change_reason
    # Só transmite por WS quando a mutação foi no torneio ao vivo — editar um
    # rascunho não deve mexer no que telas (Timer/TV) de outros estão vendo.
    if alvo == tid_atual:
        await ws_manager.broadcast(snapshot)
    return snapshot


# --------------------------------------------------------- lógica de negócio --

def _torneio_atual_row(con):
    tid = db.tournament_id_atual(con)
    if tid is None:
        raise HTTPException(500, "Nenhum torneio ativo")
    row = con.execute("SELECT * FROM tournaments WHERE id = ?", (tid,)).fetchone()
    if row is None:
        raise HTTPException(500, "Torneio ativo não encontrado")
    return row


def _elapsed_seconds(row, agora: datetime) -> float:
    elapsed = row["elapsed_before_ref"]
    if row["status"] == "running" and row["reference_at"]:
        ref = datetime.fromisoformat(row["reference_at"])
        elapsed += (agora - ref).total_seconds()
    return elapsed


def _entradas_fechadas(levels: list, current_level_index: int) -> bool:
    indices_fechamento = [i for i, nivel in enumerate(levels) if nivel.get("closesEntries")]
    if not indices_fechamento:
        return False
    return current_level_index >= min(indices_fechamento)


def _tournament_row(con, tournament_id: str):
    row = con.execute("SELECT * FROM tournaments WHERE id = ?", (tournament_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Torneio não encontrado")
    return row


def _garantir_editavel(row):
    if row["status"] == "finished":
        raise HTTPException(400, "Este torneio já foi finalizado e não pode mais ser alterado")


def _participante_row(con, participant_id: str):
    row = con.execute("SELECT * FROM participants WHERE id = ?", (participant_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Participante não encontrado")
    return row


def montar_snapshot(con, tournament_id: Optional[str] = None) -> dict:
    row = _tournament_row(con, tournament_id) if tournament_id else _torneio_atual_row(con)
    participantes = con.execute(
        "SELECT * FROM participants WHERE tournament_id = ? ORDER BY created_at",
        (row["id"],),
    ).fetchall()

    agora = datetime.now(timezone.utc)
    elapsed = _elapsed_seconds(row, agora)

    entry_value = row["entry_value"]
    reentry_value = row["reentry_value"]
    addon_value = row["addon_value"]
    action_price = row["action_price"]
    dealer_share = row["dealer_share"]

    total_chips = 0
    total_actions = 0
    collected = 0.0
    pending = 0.0
    active_count = 0
    eliminated_count = 0

    participantes_json = []
    for p in participantes:
        acoes = 1 + p["rebuys"] + (1 if p["addon"] else 0)
        chips_p = entry_value + p["rebuys"] * reentry_value + (addon_value if p["addon"] else 0)
        total_chips += chips_p
        total_actions += acoes
        devido = acoes * action_price
        pago = p["paid_amount"]
        collected += pago
        pending += max(0.0, devido - pago)
        if p["eliminated"]:
            eliminated_count += 1
        else:
            active_count += 1
        participantes_json.append({
            "id": p["id"],
            "name": p["name"],
            "rebuys": p["rebuys"],
            "addon": bool(p["addon"]),
            "paidAmount": pago,
            "pendingAmount": max(0.0, devido - pago),
            "eliminated": bool(p["eliminated"]),
            "owed": devido,
            "createdAt": p["created_at"],
        })

    prize_pool = total_actions * (action_price - dealer_share)
    dealer_total = total_actions * dealer_share
    avg_stack = (total_chips / active_count) if active_count > 0 else 0
    levels = json.loads(row["levels_json"])

    return {
        "tournament": {
            "id": row["id"],
            "name": row["name"],
            "status": row["status"],
            "levels": levels,
            "currentLevelIndex": row["current_level_index"],
            "entriesClosed": _entradas_fechadas(levels, row["current_level_index"]),
            "elapsedSeconds": elapsed,
            "muted": bool(row["muted"]),
            "configured": bool(row["configured"]),
            "payout": json.loads(row["payout_json"]),
            "payoutConfirmed": bool(row["payout_confirmed"]),
            "entryValue": entry_value,
            "reentryValue": reentry_value,
            "addonValue": addon_value,
            "actionPrice": action_price,
            "dealerShare": dealer_share,
            "chipValues": row["chip_values"],
            "createdAt": row["created_at"],
        },
        "participants": participantes_json,
        "totals": {
            "activeCount": active_count,
            "eliminatedCount": eliminated_count,
            "totalChips": total_chips,
            "avgStack": avg_stack,
            "prizePool": prize_pool,
            "dealerTotal": dealer_total,
            "collected": collected,
            "pending": pending,
            "totalActions": total_actions,
        },
        "serverTime": agora.isoformat(),
    }


# -------------------------------------------------------------- endpoints --

@app.on_event("startup")
def startup():
    db.inicializar()


@app.get("/api/state")
def obter_estado(tournament_id: Optional[str] = None):
    con = db.conectar()
    try:
        return montar_snapshot(con, tournament_id)
    finally:
        con.close()


@app.post("/api/participants")
async def criar_participante(body: NovoParticipante):
    con = db.conectar()
    try:
        tid = body.tournamentId or db.tournament_id_atual(con)
        torneio = _tournament_row(con, tid)
        _garantir_editavel(torneio)
        pid = db.novo_id()
        nome = body.name.strip()
        con.execute(
            "INSERT INTO participants (id, tournament_id, name, created_at) VALUES (?, ?, ?, ?)",
            (pid, tid, nome, db.agora_iso()),
        )
        db.registrar_evento(con, tid, "entrada", pid, nome)
        con.commit()
    finally:
        con.close()
    return await publicar_estado(tid)


@app.delete("/api/participants/{participant_id}")
async def remover_participante(participant_id: str):
    con = db.conectar()
    try:
        p = _participante_row(con, participant_id)
        torneio = _tournament_row(con, p["tournament_id"])
        _garantir_editavel(torneio)
        con.execute("DELETE FROM participants WHERE id = ?", (participant_id,))
        db.registrar_evento(con, torneio["id"], "removido", participant_id, p["name"])
        con.commit()
    finally:
        con.close()
    return await publicar_estado(torneio["id"])


@app.post("/api/participants/{participant_id}/rebuy")
async def registrar_rebuy(participant_id: str):
    con = db.conectar()
    try:
        p = _participante_row(con, participant_id)
        torneio = _tournament_row(con, p["tournament_id"])
        _garantir_editavel(torneio)
        con.execute(
            "UPDATE participants SET rebuys = rebuys + 1 WHERE id = ?", (participant_id,)
        )
        db.registrar_evento(con, torneio["id"], "rebuy", participant_id, p["name"])
        con.commit()
    finally:
        con.close()
    return await publicar_estado(torneio["id"])


@app.post("/api/participants/{participant_id}/reentry")
async def registrar_reentrada(participant_id: str):
    # Mesmo custo/fichas de um rebuy, mas usado após o jogador já ter sido
    # marcado como eliminado (reentrada tardia) — por isso também reativa.
    con = db.conectar()
    try:
        p = _participante_row(con, participant_id)
        torneio = _tournament_row(con, p["tournament_id"])
        _garantir_editavel(torneio)
        levels = json.loads(torneio["levels_json"])
        if _entradas_fechadas(levels, torneio["current_level_index"]):
            raise HTTPException(400, "As entradas já foram encerradas para este torneio")
        con.execute(
            "UPDATE participants SET rebuys = rebuys + 1, eliminated = 0 WHERE id = ?",
            (participant_id,),
        )
        db.registrar_evento(con, torneio["id"], "reentrada", participant_id, p["name"])
        con.commit()
    finally:
        con.close()
    return await publicar_estado(torneio["id"])


@app.post("/api/participants/{participant_id}/addon")
async def registrar_addon(participant_id: str):
    con = db.conectar()
    try:
        p = _participante_row(con, participant_id)
        torneio = _tournament_row(con, p["tournament_id"])
        _garantir_editavel(torneio)
        if p["eliminated"]:
            raise HTTPException(400, "Jogador eliminado não pode fazer add-on — faça a reentrada primeiro")
        con.execute(
            "UPDATE participants SET addon = 1 WHERE id = ?", (participant_id,)
        )
        db.registrar_evento(con, torneio["id"], "addon", participant_id, p["name"])
        con.commit()
    finally:
        con.close()
    return await publicar_estado(torneio["id"])


@app.patch("/api/participants/{participant_id}")
async def atualizar_participante(participant_id: str, body: ParticipanteUpdate):
    campos = []
    valores = []
    if body.paidAmount is not None:
        campos.append("paid_amount = ?")
        valores.append(max(0.0, body.paidAmount))
    if body.eliminated is not None:
        campos.append("eliminated = ?")
        valores.append(1 if body.eliminated else 0)
    torneio_id = None
    if campos:
        con = db.conectar()
        try:
            p = _participante_row(con, participant_id)
            torneio = _tournament_row(con, p["tournament_id"])
            _garantir_editavel(torneio)
            torneio_id = torneio["id"]
            valores.append(participant_id)
            con.execute(
                f"UPDATE participants SET {', '.join(campos)} WHERE id = ?", valores
            )
            if body.eliminated is True:
                db.registrar_evento(con, torneio_id, "saida", participant_id, p["name"])
            con.commit()
        finally:
            con.close()
    return await publicar_estado(torneio_id)


@app.patch("/api/admin")
async def atualizar_admin(body: AdminUpdate):
    mapa = {
        "name": "name",
        "levels": "levels_json",
        "entryValue": "entry_value",
        "reentryValue": "reentry_value",
        "addonValue": "addon_value",
        "actionPrice": "action_price",
        "dealerShare": "dealer_share",
        "chipValues": "chip_values",
        "muted": "muted",
        "configured": "configured",
        "payout": "payout_json",
        "payoutConfirmed": "payout_confirmed",
    }
    campos = []
    valores = []
    dados = body.model_dump(exclude_unset=True)
    for chave, coluna in mapa.items():
        if chave in dados:
            valor = dados[chave]
            if chave in ("levels", "payout"):
                valor = json.dumps(valor)
            if chave in ("muted", "configured", "payoutConfirmed"):
                valor = 1 if valor else 0
            campos.append(f"{coluna} = ?")
            valores.append(valor)
    con = db.conectar()
    try:
        tid = body.tournamentId or db.tournament_id_atual(con)
        torneio = _tournament_row(con, tid)
        _garantir_editavel(torneio)
        if campos:
            valores.append(tid)
            con.execute(
                f"UPDATE tournaments SET {', '.join(campos)} WHERE id = ?", valores
            )
            con.commit()
    finally:
        con.close()
    return await publicar_estado(tid)


def _aplicar_timer(con, row, **mudancas):
    campos = []
    valores = []
    for coluna, valor in mudancas.items():
        campos.append(f"{coluna} = ?")
        valores.append(valor)
    valores.append(row["id"])
    con.execute(f"UPDATE tournaments SET {', '.join(campos)} WHERE id = ?", valores)
    con.commit()


@app.post("/api/timer/play")
async def timer_play():
    con = db.conectar()
    try:
        row = _torneio_atual_row(con)
        _garantir_editavel(row)
        if not row["configured"]:
            raise HTTPException(400, "Confirme a configuração do torneio no Admin antes de iniciar")
        if row["status"] != "running":
            _aplicar_timer(con, row, status="running", reference_at=db.agora_iso())
    finally:
        con.close()
    return await publicar_estado()


@app.post("/api/timer/pause")
async def timer_pause():
    con = db.conectar()
    try:
        row = _torneio_atual_row(con)
        _garantir_editavel(row)
        if row["status"] == "running":
            elapsed = _elapsed_seconds(row, datetime.now(timezone.utc))
            _aplicar_timer(con, row, status="paused", elapsed_before_ref=elapsed, reference_at=None)
    finally:
        con.close()
    return await publicar_estado()


@app.post("/api/timer/next")
async def timer_next(body: AvancoNivel = AvancoNivel()):
    # expectedIndex só vem preenchido quando é o avanço automático (tick do timer.js
    # detectando que o tempo zerou) — usamos isso pra saber se toca o alarme ou não.
    motivo = "auto" if body.expectedIndex is not None else "manual"
    con = db.conectar()
    try:
        row = _torneio_atual_row(con)
        _garantir_editavel(row)
        if body.expectedIndex is None or body.expectedIndex == row["current_level_index"]:
            niveis = json.loads(row["levels_json"])
            novo_index = min(row["current_level_index"] + 1, len(niveis) - 1)
            ref = db.agora_iso() if row["status"] == "running" else None
            _aplicar_timer(con, row, current_level_index=novo_index, elapsed_before_ref=0, reference_at=ref)
    finally:
        con.close()
    return await publicar_estado(level_change_reason=motivo)


@app.post("/api/timer/prev")
async def timer_prev():
    con = db.conectar()
    try:
        row = _torneio_atual_row(con)
        _garantir_editavel(row)
        novo_index = max(row["current_level_index"] - 1, 0)
        ref = db.agora_iso() if row["status"] == "running" else None
        _aplicar_timer(con, row, current_level_index=novo_index, elapsed_before_ref=0, reference_at=ref)
    finally:
        con.close()
    return await publicar_estado(level_change_reason="manual")


@app.post("/api/timer/reset")
async def timer_reset():
    con = db.conectar()
    try:
        row = _torneio_atual_row(con)
        _garantir_editavel(row)
        ref = db.agora_iso() if row["status"] == "running" else None
        _aplicar_timer(con, row, current_level_index=0, elapsed_before_ref=0, reference_at=ref)
    finally:
        con.close()
    return await publicar_estado(level_change_reason="manual")


@app.post("/api/timer/adjust")
async def timer_adjust(body: AjusteTimer):
    con = db.conectar()
    try:
        row = _torneio_atual_row(con)
        _garantir_editavel(row)
        agora = datetime.now(timezone.utc)
        elapsed = _elapsed_seconds(row, agora)
        elapsed_novo = max(0.0, elapsed - body.deltaMinutes * 60)
        if row["status"] == "running":
            _aplicar_timer(con, row, elapsed_before_ref=elapsed_novo, reference_at=agora.isoformat())
        else:
            _aplicar_timer(con, row, elapsed_before_ref=elapsed_novo)
    finally:
        con.close()
    return await publicar_estado()


def _finalizar_torneio(con, tournament_id: str):
    con.execute(
        "UPDATE tournaments SET status = 'finished', finished_at = ? WHERE id = ?",
        (db.agora_iso(), tournament_id),
    )
    db.registrar_evento(con, tournament_id, "torneio_finalizado")


@app.post("/api/tournaments/finalizar")
async def finalizar_torneio():
    con = db.conectar()
    try:
        row = _torneio_atual_row(con)
        if row["status"] == "finished":
            raise HTTPException(400, "Este torneio já está finalizado")
        _finalizar_torneio(con, row["id"])
        con.commit()
    finally:
        con.close()
    return await publicar_estado()


@app.post("/api/tournaments/novo")
async def novo_torneio(body: NovoTorneio):
    con = db.conectar()
    try:
        tid_atual = db.tournament_id_atual(con)
        if tid_atual:
            row = _torneio_atual_row(con)
            if row["status"] != "finished":
                _finalizar_torneio(con, tid_atual)
            con.commit()
        db.criar_torneio(con, nome=body.name)
    finally:
        con.close()
    return await publicar_estado()


class NovoRascunho(BaseModel):
    name: str = "Novo torneio"


@app.post("/api/tournaments")
async def criar_rascunho(body: NovoRascunho):
    # Cria um torneio "de lado", sem mexer no que está ao vivo — serve para
    # preparar a estrutura/valores do próximo jogo com antecedência.
    con = db.conectar()
    try:
        tid = db.criar_torneio(con, nome=body.name, tornar_atual=False)
    finally:
        con.close()
    return await publicar_estado(tid)


@app.post("/api/tournaments/{tournament_id}/ativar")
async def ativar_torneio(tournament_id: str):
    con = db.conectar()
    try:
        alvo = _tournament_row(con, tournament_id)
        if alvo["status"] == "finished":
            raise HTTPException(400, "Este torneio já foi finalizado")
        tid_atual = db.tournament_id_atual(con)
        if tid_atual and tid_atual != tournament_id:
            atual = _tournament_row(con, tid_atual)
            if atual["status"] != "finished":
                _finalizar_torneio(con, tid_atual)
        con.execute(
            """
            INSERT INTO settings (key, value) VALUES ('current_tournament_id', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (tournament_id,),
        )
        con.commit()
    finally:
        con.close()
    return await publicar_estado(tournament_id)


@app.get("/api/tournaments")
def listar_torneios():
    con = db.conectar()
    try:
        rows = con.execute(
            "SELECT id, name, status, created_at, finished_at FROM tournaments ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


@app.get("/api/tournaments/{tournament_id}")
def relatorio_torneio(tournament_id: str):
    con = db.conectar()
    try:
        row = con.execute(
            "SELECT * FROM tournaments WHERE id = ?", (tournament_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Torneio não encontrado")
        participantes = con.execute(
            "SELECT * FROM participants WHERE tournament_id = ? ORDER BY created_at",
            (tournament_id,),
        ).fetchall()

        action_price = row["action_price"]
        dealer_share = row["dealer_share"]
        total_actions = 0
        itens = []
        for p in participantes:
            acoes = 1 + p["rebuys"] + (1 if p["addon"] else 0)
            total_actions += acoes
            devido_p = acoes * action_price
            itens.append({
                "id": p["id"],
                "name": p["name"],
                "rebuys": p["rebuys"],
                "addon": bool(p["addon"]),
                "owed": devido_p,
                "paidAmount": p["paid_amount"],
                "pendingAmount": max(0.0, devido_p - p["paid_amount"]),
                "eliminated": bool(p["eliminated"]),
            })

        eventos = con.execute(
            "SELECT type, details, created_at FROM events WHERE tournament_id = ? ORDER BY created_at",
            (tournament_id,),
        ).fetchall()

        return {
            "id": row["id"],
            "name": row["name"],
            "status": row["status"],
            "createdAt": row["created_at"],
            "finishedAt": row["finished_at"],
            "participants": itens,
            "totals": {
                "totalActions": total_actions,
                "prizePool": total_actions * (action_price - dealer_share),
                "dealerTotal": total_actions * dealer_share,
            },
            "events": [
                {"type": e["type"], "detail": e["details"], "createdAt": e["created_at"]}
                for e in eventos
            ],
        }
    finally:
        con.close()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.conectar(ws)
    con = db.conectar()
    try:
        await ws.send_json(montar_snapshot(con))
    finally:
        con.close()
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.desconectar(ws)


# --------------------------------------------------------------- estáticos --
# Este mount fica depois de todas as rotas de API/WS para não "engolir" essas rotas.

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
