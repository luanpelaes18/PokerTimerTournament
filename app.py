import json
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db

# "app" é a aplicação FastAPI inteira — cada @app.get/post/patch/delete abaixo
# registra uma rota nela; no fim do arquivo, app.mount("/") serve os arquivos
# estáticos (HTML/CSS/JS) que não batem com nenhuma rota de API.
app = FastAPI(title="Poker Timer Tournament")

# Pasta com os arquivos servidos ao navegador (index.html, app.js, imagens...).
STATIC_DIR = Path(__file__).parent / "static"


@app.middleware("http")
async def sem_cache_em_estaticos(request, call_next):
    """Roda em toda requisição HTTP, antes de chegar na rota. Em desenvolvimento
    os arquivos estáticos mudam o tempo todo; sem isso o navegador às vezes
    reaproveita uma versão antiga do HTML/CSS/JS mesmo depois de um F5."""
    response = await call_next(request)
    if request.url.path.startswith("/api") or request.url.path == "/ws":
        return response
    response.headers["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------- modelos --
# Classes Pydantic: descrevem o formato esperado do corpo (JSON) de cada
# request. FastAPI valida automaticamente contra elas e rejeita (erro 422) um
# corpo que não bata — por isso os endpoints abaixo não precisam validar "na
# mão" os tipos desses campos. Campos Optional (a maioria) podem vir ausentes
# no JSON; nesse caso o valor do atributo fica None.

class NovoParticipante(BaseModel):
    """Corpo de POST /api/participants — cadastrar um jogador novo."""
    name: str
    tournamentId: Optional[str] = None  # só enviado quando o alvo é um torneio rascunho (não o "atual")


class ParticipanteUpdate(BaseModel):
    """Corpo de PATCH /api/participants/{id} — atualizar um jogador existente.
    Os dois campos são independentes: dá pra mandar só um dos dois."""
    paidAmount: Optional[float] = None  # novo TOTAL pago (não o incremento) — ver atualizar_participante
    eliminated: Optional[bool] = None


class AdminUpdate(BaseModel):
    """Corpo de PATCH /api/admin — cobre toda edição feita no Admin ou no
    Gerente sobre a configuração de um torneio (nome, fichas, níveis, premiação,
    etc.). Cada campo aqui vira uma coluna da tabela tournaments (ver o dict
    "mapa" dentro de atualizar_admin) — por isso quase tudo é Optional: cada
    chamada normalmente só manda os campos que realmente mudaram."""
    name: Optional[str] = None
    levels: Optional[List[dict]] = None
    entryValue: Optional[int] = None
    reentryValue: Optional[int] = None
    addonValue: Optional[int] = None
    actionPrice: Optional[float] = None
    dealerShare: Optional[float] = None
    chips: Optional[List[dict]] = None
    muted: Optional[bool] = None
    configured: Optional[bool] = None
    payout: Optional[List[Optional[float]]] = None
    payoutConfirmed: Optional[bool] = None
    tournamentId: Optional[str] = None  # só enviado quando o alvo é um torneio rascunho


class TemaCorUpdate(BaseModel):
    """Corpo de POST /api/config/theme — trocar o tema de cor global."""
    theme: str  # precisa ser um dos db.TEMAS_COR_VALIDOS


class IdiomaUpdate(BaseModel):
    """Corpo de POST /api/config/language — trocar o idioma global."""
    language: str  # precisa ser um dos db.IDIOMAS_VALIDOS


class AjusteTimer(BaseModel):
    """Corpo de POST /api/timer/adjust — ajuste manual de ±1 minuto no timer."""
    deltaMinutes: float


class AvancoNivel(BaseModel):
    """Corpo de POST /api/timer/next. expectedIndex vem preenchido só quando é
    o próprio relógio do cliente avançando sozinho (tempo esgotado) — é como o
    backend diferencia esse avanço "automático" de um clique manual no botão
    Próximo, pra decidir se o alarme sonoro deve tocar ou não (levelChangeReason)."""
    expectedIndex: Optional[int] = None


class NovoTorneio(BaseModel):
    """Corpo de POST /api/tournaments — criar um torneio rascunho novo pelo Admin."""
    name: str = "Home Game"


# ------------------------------------------------------------- ws manager --

class GerenciadorWS:
    """Mantém a lista de conexões WebSocket abertas (uma por aba/dispositivo
    conectado) e sabe mandar uma mensagem pra todas elas de uma vez
    (broadcast) — é assim que uma mudança feita no Gerente aparece, em tempo
    real, no Timer e em qualquer outra aba aberta."""

    def __init__(self):
        self.conexoes: List[WebSocket] = []  # uma entrada por conexão WS ativa

    async def conectar(self, ws: WebSocket):
        """Aceita uma conexão WS nova e passa a incluí-la nos broadcasts futuros."""
        await ws.accept()
        self.conexoes.append(ws)

    def desconectar(self, ws: WebSocket):
        """Remove uma conexão da lista (chamado quando a aba fecha/perde conexão)."""
        if ws in self.conexoes:
            self.conexoes.remove(ws)

    async def broadcast(self, dados: dict):
        """Manda o mesmo payload (o snapshot do estado) pra todas as conexões
        abertas. Se o envio falhar pra alguma (aba já fechada mas ainda não
        notificou o desconectar), ela é marcada em "mortas" e removida da lista
        no final — sem isso a lista cresceria pra sempre com conexões mortas."""
        mortas = []
        for ws in self.conexoes:
            try:
                await ws.send_json(dados)
            except Exception:
                mortas.append(ws)
        for ws in mortas:
            self.desconectar(ws)


# Instância única (singleton) do gerenciador de WebSocket — compartilhada por
# todas as rotas que precisam fazer broadcast (praticamente todo endpoint que
# muda algo chama publicar_estado, que usa essa variável).
ws_manager = GerenciadorWS()


async def publicar_estado(tournament_id: Optional[str] = None, level_change_reason: Optional[str] = None):
    """Função central chamada depois de QUALQUER mutação (cadastrar jogador,
    mexer no timer, editar o Admin, etc.): monta o snapshot atualizado do
    torneio afetado e, se for o torneio "atual" (o que está ao vivo), manda
    esse snapshot por WebSocket pra todo mundo conectado. Retorna o snapshot
    pra quem chamou poder devolver na resposta HTTP também (REST e WS sempre
    recebem o mesmo formato de dados)."""
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
# Funções com "_" na frente são helpers internos (não são rotas) usados pelos
# endpoints abaixo.

def _torneio_atual_row(con):
    """Busca a linha (sqlite3.Row) do torneio atual na tabela tournaments. Erro
    500 (não 404) se não houver torneio atual definido — isso não deveria
    acontecer nunca em uso normal, já que inicializar() sempre garante um."""
    tid = db.tournament_id_atual(con)
    if tid is None:
        raise HTTPException(500, "Nenhum torneio ativo")
    row = con.execute("SELECT * FROM tournaments WHERE id = ?", (tid,)).fetchone()
    if row is None:
        raise HTTPException(500, "Torneio ativo não encontrado")
    return row


def _elapsed_seconds(row, agora: datetime) -> float:
    """Quanto tempo (em segundos) já passou no nível atual. O timer NUNCA grava
    uma contagem regressiva no banco — em vez disso guarda elapsed_before_ref
    (tempo acumulado até a última pausa) e reference_at (quando o timer foi
    tocado pela última vez); o tempo decorrido real é sempre recalculado na
    hora, somando os dois quando o status é "running". Isso evita ter que
    atualizar o banco a cada segundo."""
    elapsed = row["elapsed_before_ref"]
    if row["status"] == "running" and row["reference_at"]:
        ref = datetime.fromisoformat(row["reference_at"])
        elapsed += (agora - ref).total_seconds()
    return elapsed


def _entradas_fechadas(levels: list, current_level_index: int) -> bool:
    """True se o nível atual já passou do primeiro nível marcado com
    closesEntries=True na lista de níveis — a partir daí, reentrada deixa de
    ser permitida (ver endpoint de reentry) e as eliminações passam a contar
    colocação final (ver atualizar_participante)."""
    indices_fechamento = [i for i, nivel in enumerate(levels) if nivel.get("closesEntries")]
    if not indices_fechamento:
        return False
    return current_level_index >= min(indices_fechamento)


def _tournament_row(con, tournament_id: str):
    """Busca um torneio específico por id. Erro 404 se não existir — usado
    sempre que o id vem de fora (parâmetro de rota ou corpo da requisição),
    ao contrário de _torneio_atual_row (que não depende de entrada externa)."""
    row = con.execute("SELECT * FROM tournaments WHERE id = ?", (tournament_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Torneio não encontrado")
    return row


def _garantir_editavel(row):
    """Barra qualquer mutação (cadastrar jogador, mexer no timer, editar Admin...)
    num torneio já finalizado — o histórico fica travado pra sempre depois de
    finalizado. Chamada no início de todo endpoint que modifica dados."""
    if row["status"] == "finished":
        raise HTTPException(400, "Este torneio já foi finalizado e não pode mais ser alterado")


def _participante_row(con, participant_id: str):
    """Busca um participante por id. Erro 404 se não existir."""
    row = con.execute("SELECT * FROM participants WHERE id = ?", (participant_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Participante não encontrado")
    return row


def montar_snapshot(con, tournament_id: Optional[str] = None) -> dict:
    """Monta o dicionário completo que vira JSON na resposta de /api/state (e
    em todo broadcast WS): dados do torneio, lista de participantes (com os
    totais financeiros já calculados por participante) e os totais gerais do
    torneio. tournament_id é opcional — se omitido, usa o torneio atual
    (_torneio_atual_row); se informado, monta o snapshot de QUALQUER torneio
    (usado pelo Admin pra ver/editar um rascunho sem mexer no que está ao vivo)."""
    row = _tournament_row(con, tournament_id) if tournament_id else _torneio_atual_row(con)
    participantes = con.execute(
        "SELECT * FROM participants WHERE tournament_id = ? ORDER BY created_at",
        (row["id"],),
    ).fetchall()

    agora = datetime.now(timezone.utc)
    elapsed = _elapsed_seconds(row, agora)

    # Valores de configuração do torneio (fichas por ação, preço, parte do
    # dealer) — lidos uma vez aqui e reusados no loop de participantes abaixo.
    entry_value = row["entry_value"]
    reentry_value = row["reentry_value"]
    addon_value = row["addon_value"]
    action_price = row["action_price"]
    dealer_share = row["dealer_share"]

    # Acumuladores somados a cada participante no loop abaixo, pra virar os
    # totais do torneio (seção "totals" do snapshot, no final da função).
    total_chips = 0       # soma de fichas físicas de todos os participantes (stack médio)
    total_actions = 0     # soma de "ações" (buy-in + rebuys + add-on) de todos
    collected = 0.0        # soma do que já foi efetivamente pago
    pending = 0.0           # soma do que ainda falta pagar
    active_count = 0        # quantos jogadores ainda não foram eliminados
    eliminated_count = 0     # quantos já foram eliminados

    # participantes_json: a versão de cada participante que vai pro front —
    # cada "acoes"/"chips_p"/"devido"/"pago" abaixo é calculado por jogador e
    # também somado nos acumuladores acima.
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

    # prize_pool: dinheiro que vai pro vencedor/colocados (preço por ação menos
    # a parte do dealer, vezes o total de ações). dealer_total: o que sobra pro
    # dealer. avg_stack: fichas médias por jogador ainda ativo (0 se não houver
    # nenhum ativo, pra não dividir por zero).
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
            "chips": json.loads(row["chips_json"]),
            "createdAt": row["created_at"],
        },
        "colorTheme": db.cor_tema_atual(con),
        "language": db.idioma_atual(con),
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
    """Roda uma vez quando o processo do servidor sobe (uvicorn chama isso
    automaticamente) — garante que o banco e as tabelas existam antes do
    primeiro request chegar."""
    db.inicializar()


@app.get("/api/state")
def obter_estado(tournament_id: Optional[str] = None):
    """GET /api/state — devolve o snapshot atual. Sem tournament_id, devolve o
    torneio ao vivo; com tournament_id (query string, ex: ?tournament_id=abc),
    devolve o snapshot de QUALQUER torneio (usado pelo Admin/Gerente pra olhar
    um rascunho). É o mesmo formato que chega por WebSocket — o front usa os
    dois caminhos (REST aqui pra carregar sob demanda, WS pra tempo real)."""
    con = db.conectar()
    try:
        return montar_snapshot(con, tournament_id)
    finally:
        con.close()


@app.post("/api/participants")
async def criar_participante(body: NovoParticipante):
    """Cadastra um jogador novo no torneio (ao vivo, ou um rascunho se
    body.tournamentId vier preenchido). Dá pra qualquer dispositivo conectado
    ver o jogador aparecer na hora, já que publicar_estado faz o broadcast."""
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
    """Apaga um participante por completo (diferente de "eliminar", que só
    marca eliminated=1 e mantém o histórico dele) — usado quando alguém foi
    cadastrado por engano, por exemplo. Fica um evento "removido" registrado."""
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
    """Rebuy: jogador AINDA ATIVO compra fichas de novo (sem nunca ter sido
    eliminado) — só incrementa o contador de rebuys, que entra nas contas de
    fichas/valor devido em montar_snapshot."""
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
    """Reentrada: jogador JÁ ELIMINADO paga de novo pra voltar ao jogo — mesmo
    custo/fichas de um rebuy (incrementa rebuys), mas também marca
    eliminated=0 de novo. Só é permitida enquanto as entradas não tiverem
    fechado (ver _entradas_fechadas) — depois disso, quem é eliminado fica
    eliminado pra sempre naquele torneio."""
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
    """Add-on: compra única de fichas extra (sem virar um "rebuy" contado à
    parte), bloqueada pra quem já está eliminado — a pessoa precisa fazer a
    reentrada primeiro antes de poder comprar add-on de novo."""
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
    """Atualiza paidAmount e/ou eliminated de um participante — os dois únicos
    campos editáveis nele. "campos"/"valores" montam dinamicamente o SQL
    UPDATE: só entra na lista o que realmente veio preenchido no corpo da
    requisição (ex: só eliminated, sem mexer em paidAmount), então o UPDATE
    final (mais abaixo) só toca nas colunas que de fato mudaram.

    paidAmount aqui é o TOTAL pago (não um incremento) — quem soma o valor
    novo ao que já tinha sido pago é o próprio frontend, antes de mandar essa
    requisição (ver salvarPagamento em app.js)."""
    campos = []   # pedaços tipo "coluna = ?" que entram no UPDATE
    valores = []  # valores na mesma ordem de "campos" (os "?" do SQL)
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

            # Captura quantos jogadores ainda estão ativos (incluindo este) ANTES de
            # aplicar a eliminação — com entradas fechadas, ninguém mais entra nem sai
            # do jogo além de eliminações, então esse número É a colocação final dele.
            eliminando_agora = body.eliminated is True and not p["eliminated"]
            ativos_antes = None
            if eliminando_agora:
                ativos_antes = con.execute(
                    "SELECT COUNT(*) AS n FROM participants WHERE tournament_id = ? AND eliminated = 0",
                    (torneio_id,),
                ).fetchone()["n"]

            valores.append(participant_id)
            con.execute(
                f"UPDATE participants SET {', '.join(campos)} WHERE id = ?", valores
            )
            if eliminando_agora:
                levels = json.loads(torneio["levels_json"])
                idx = torneio["current_level_index"]
                nivel = levels[idx] if idx < len(levels) else {}
                # Guarda estruturado (JSON) em vez de texto já formatado, pra dar pra
                # traduzir na tela conforme o idioma escolhido (ver fmtDetalheSaida no app.js).
                detalhe = {
                    "name": p["name"],
                    "level": idx + 1,
                    "isBreak": bool(nivel.get("isBreak")),
                    "sb": nivel.get("sb", 0),
                    "bb": nivel.get("bb", 0),
                    "position": ativos_antes if _entradas_fechadas(levels, idx) else None,
                }
                db.registrar_evento(con, torneio_id, "saida", participant_id, json.dumps(detalhe))
            con.commit()
        finally:
            con.close()
    return await publicar_estado(torneio_id)


@app.patch("/api/admin")
async def atualizar_admin(body: AdminUpdate):
    """Endpoint "faz-tudo" pra editar a configuração de um torneio — nome,
    valores, estrutura de níveis, fichas cadastradas, premiação... tudo que
    não seja ação de jogador ou controle de timer passa por aqui. "mapa" liga
    o nome do campo no JSON (lado esquerdo, como o AdminUpdate e o app.js
    chamam) à coluna real da tabela tournaments (lado direito)."""
    mapa = {
        "name": "name",
        "levels": "levels_json",
        "entryValue": "entry_value",
        "reentryValue": "reentry_value",
        "addonValue": "addon_value",
        "actionPrice": "action_price",
        "dealerShare": "dealer_share",
        "chips": "chips_json",
        "muted": "muted",
        "configured": "configured",
        "payout": "payout_json",
        "payoutConfirmed": "payout_confirmed",
    }
    campos = []  # pedaços "coluna = ?" do UPDATE (só os campos que vieram no corpo)
    valores = []  # valores na mesma ordem de "campos"
    # exclude_unset=True: só entram em "dados" os campos que o cliente mandou de
    # fato no JSON (campos Optional que ficaram de fora nem aparecem aqui) —
    # assim um PATCH parcial (ex: só {"muted": true}) não sobrescreve o resto.
    dados = body.model_dump(exclude_unset=True)
    for chave, coluna in mapa.items():
        if chave in dados:
            valor = dados[chave]
            if chave in ("levels", "payout", "chips"):
                valor = json.dumps(valor)  # esses campos são listas/objetos — o SQLite guarda como texto JSON
            if chave in ("muted", "configured", "payoutConfirmed"):
                valor = 1 if valor else 0  # SQLite não tem tipo boolean nativo
            campos.append(f"{coluna} = ?")
            valores.append(valor)
    con = db.conectar()
    try:
        # tid: id do torneio alvo — o "atual" (ao vivo) se tournamentId não foi
        # informado, ou um torneio específico (rascunho) se foi.
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
    """Helper usado por todos os endpoints de /api/timer/* pra montar e rodar um
    UPDATE na tabela tournaments. "mudancas" é um dict arbitrário de
    coluna->valor passado via **kwargs (ex: _aplicar_timer(con, row,
    status="running", reference_at=...)) — evita repetir a montagem do SQL em
    cada endpoint de timer."""
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
    """Toca o timer: muda status pra "running" e marca reference_at = agora —
    é a partir desse instante que _elapsed_seconds soma tempo decorrido."""
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
    """Pausa o timer: calcula quanto tempo já tinha decorrido até agora
    (_elapsed_seconds) e "congela" esse valor em elapsed_before_ref, limpando
    reference_at — assim o relógio para exatamente onde estava."""
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
    """Avança pro próximo nível (sem passar do último). motivo="auto"/"manual"
    decide se o front toca o alarme sonoro (só em avanço automático)."""
    # expectedIndex só vem preenchido quando é o avanço automático (tick do timer.js
    # detectando que o tempo zerou) — usamos isso pra saber se toca o alarme ou não.
    motivo = "auto" if body.expectedIndex is not None else "manual"
    con = db.conectar()
    try:
        row = _torneio_atual_row(con)
        _garantir_editavel(row)
        # Se for avanço automático, só aplica se o índice que o cliente esperava
        # bater com o atual no servidor — evita avançar duas vezes caso dois
        # ticks cheguem quase juntos (idempotência).
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
    """Volta pro nível anterior (sem passar do primeiro) — sempre manual, por
    isso nunca toca alarme (level_change_reason="manual")."""
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
    """Reinicia o torneio: volta pro nível 1 e zera o tempo decorrido (mas
    mantém o status rodando/pausado como estava, e os jogadores/pagamentos
    intactos — só mexe no relógio)."""
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
    """Ajusta o tempo decorrido em ±deltaMinutes (os botões -1min/+1min) sem
    trocar de nível. elapsed_novo nunca fica negativo (max com 0.0)."""
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
    """Marca um torneio como "finished" (status final, fica travado pra edição
    — ver _garantir_editavel) e registra o evento correspondente na linha do
    tempo. Não dá commit nem chama publicar_estado — quem chama decide isso,
    já que normalmente essa função roda como parte de uma troca maior (ex:
    finalizar o anterior ao ativar outro torneio)."""
    con.execute(
        "UPDATE tournaments SET status = 'finished', finished_at = ? WHERE id = ?",
        (db.agora_iso(), tournament_id),
    )
    db.registrar_evento(con, tournament_id, "torneio_finalizado")


@app.post("/api/tournaments/finalizar")
async def finalizar_torneio():
    """Finaliza o torneio ao vivo (botão "Finalizar torneio" no Gerente) — a
    partir daí ele vira histórico, travado pra edição, e o Gerente/Timer
    ficam sem um torneio ativo até alguém ativar outro."""
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
    """Finaliza o torneio atual (se ainda não tiver sido finalizado) e já cria
    um torneio novo em seguida, tornando-o o atual — um atalho pra "virar a
    página" sem passar pela tela de rascunho."""
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
    """Corpo de POST /api/tournaments — criar um torneio rascunho pelo Admin."""
    name: str = "Novo torneio"


@app.post("/api/tournaments")
async def criar_rascunho(body: NovoRascunho):
    """Cria um torneio "de lado" (rascunho), sem mexer no que está ao vivo —
    serve pra preparar a estrutura/valores do próximo jogo com antecedência.
    Vira o torneio atual só quando alguém clicar em "Ativar este torneio"
    (ver ativar_torneio, abaixo)."""
    con = db.conectar()
    try:
        tid = db.criar_torneio(con, nome=body.name, tornar_atual=False)
    finally:
        con.close()
    return await publicar_estado(tid)


@app.post("/api/tournaments/{tournament_id}/ativar")
async def ativar_torneio(tournament_id: str):
    """Torna um torneio (normalmente um rascunho) o torneio atual — finaliza o
    que estava ativo antes (se ainda não tivesse sido finalizado) e atualiza
    settings.current_tournament_id pra apontar pro novo. É assim que o
    Gerente troca de torneio "ao vivo"."""
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
    """Lista todos os torneios (qualquer status) com um resumo só — usado pra
    montar a lista lateral do Admin/Gerente. Pra ver os detalhes completos de
    UM torneio específico, veja /api/state (ao vivo/rascunho) ou
    /api/tournaments/{id} (relatório, pra torneio finalizado)."""
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
    """Relatório completo de UM torneio (participantes + totais + linha do
    tempo de eventos) — usado pelo Admin pra exibir o histórico de um torneio
    já finalizado. Diferente de montar_snapshot/api/state: esse endpoint não
    depende do torneio ser o "atual" nem calcula coisas como fichas em jogo
    (não faz mais sentido pra um torneio que já acabou)."""
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


@app.delete("/api/tournaments/{tournament_id}")
async def excluir_torneio(tournament_id: str):
    """Apaga um torneio por completo (e seus participantes/eventos junto) —
    usado pra desfazer um cadastro feito por engano no Admin. Bloqueado para o
    torneio atual: se fosse permitido, o app ficaria sem nenhum torneio ativo
    (ver tournament_id_atual) de um jeito que quebraria o resto do sistema."""
    con = db.conectar()
    try:
        _tournament_row(con, tournament_id)  # 404 se não existir
        if tournament_id == db.tournament_id_atual(con):
            # Código estável (não texto solto) pra dar pra traduzir no front — ver
            # excluirTorneioComConfirmacao no app.js.
            raise HTTPException(400, "torneio_atual")
        con.execute("DELETE FROM participants WHERE tournament_id = ?", (tournament_id,))
        con.execute("DELETE FROM events WHERE tournament_id = ?", (tournament_id,))
        con.execute("DELETE FROM tournaments WHERE id = ?", (tournament_id,))
        con.commit()
    finally:
        con.close()
    return {"ok": True}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """Canal WebSocket usado pelo front pra receber atualizações em tempo real.
    Ao conectar, manda o snapshot atual uma vez (pra tela já abrir com dado
    certo, sem esperar a próxima mutação de alguém). Depois disso, essa
    conexão só fica esperando — ela nunca recebe nada de volta do cliente;
    quem a alimenta com novos snapshots é ws_manager.broadcast, chamado por
    publicar_estado(). O loop "while True: receive_text()" existe só pra
    manter a conexão aberta e detectar quando o cliente desconecta
    (WebSocketDisconnect), pra então tirar essa conexão da lista."""
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


# ------------------------------------------------------- configuração global --
# Logo e modelos de ficha não são por torneio — vivem direto em static/img. O nome
# de exibição de cada modelo/cor é escolhido por quem sobe o arquivo e fica guardado
# num manifesto (modelos.json); a pasta/arquivo em si usa uma versão "slug" do nome.

FICHAS_DIR = STATIC_DIR / "img" / "fichas"       # pasta com uma subpasta por modelo de ficha
MANIFESTO_FICHAS = FICHAS_DIR / "modelos.json"   # nomes de exibição de cada modelo/cor (ver abaixo)
NOME_LOGO = "lk-logo.png"                         # nome fixo do arquivo da logo dentro de static/img


def _slugificar(texto, padrao="sem-nome"):
    """Transforma um texto livre (nome de modelo ou de cor, digitado por quem
    sobe o arquivo) num "slug": só letras/números ASCII e hífen, em minúsculo
    — usado como nome de pasta/arquivo no disco e como id nas URLs da API,
    já que nomes de arquivo não podem ter acento, espaço ou símbolo com
    segurança. "padrao" é o que volta se o texto ficar vazio depois de
    limpo (ex: alguém digitou só emojis)."""
    texto = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii")
    texto = re.sub(r"[^a-zA-Z0-9]+", "-", texto).strip("-").lower()
    return texto or padrao


def _slug_disponivel(slug, existentes):
    """Se "slug" já está em uso (dentro do conjunto "existentes"), acrescenta
    um número (-2, -3, ...) até achar um que não colida — ex: dois modelos
    chamados "Clássico" viram "classico" e "classico-2"."""
    if slug not in existentes:
        return slug
    i = 2
    while f"{slug}-{i}" in existentes:
        i += 1
    return f"{slug}-{i}"


def _ler_manifesto_fichas():
    """Lê modelos.json (o "banco de dados" dos modelos/cores de ficha — não
    fica na tabela SQLite porque é global e simples o bastante pra só um
    arquivo JSON). Se o arquivo ainda não existe (nenhum modelo cadastrado
    ainda), devolve um dict vazio em vez de dar erro."""
    if MANIFESTO_FICHAS.exists():
        return json.loads(MANIFESTO_FICHAS.read_text())
    return {}


def _salvar_manifesto_fichas(manifesto):
    """Grava o dict de volta em modelos.json, criando a pasta de fichas se for
    a primeira vez (mkdir com exist_ok=True não reclama se ela já existir)."""
    FICHAS_DIR.mkdir(parents=True, exist_ok=True)
    MANIFESTO_FICHAS.write_text(json.dumps(manifesto, ensure_ascii=False, indent=2))


@app.get("/api/chip-models")
async def listar_modelos_ficha():
    """Lista todos os modelos de ficha cadastrados e as cores de cada um, no
    formato que o front usa pra montar os <select> de modelo/cor no Admin e
    pra montar a galeria de modelos na tela Configuração."""
    manifesto = _ler_manifesto_fichas()
    resultado = []
    for slug, dados in manifesto.items():
        cores = [{"id": cor_slug, "label": cor_label} for cor_slug, cor_label in dados.get("colors", {}).items()]
        resultado.append({"model": slug, "label": dados.get("label", slug), "colors": cores})
    return resultado


def _validar_imagem(arquivo: UploadFile):
    """Confere, pelo content-type enviado pelo navegador, que o arquivo
    enviado é algum tipo de imagem — chamado antes de salvar qualquer upload
    (logo, foto de ficha)."""
    if not (arquivo.content_type or "").startswith("image/"):
        raise HTTPException(400, "Envie um arquivo de imagem.")


@app.post("/api/config/logo")
async def enviar_logo(arquivo: UploadFile = File(...)):
    """Recebe um upload de imagem e sobrescreve a logo do sistema (sempre o
    mesmo arquivo, NOME_LOGO) — usada no menu e como marca d'água de fundo
    em todas as telas."""
    _validar_imagem(arquivo)
    conteudo = await arquivo.read()
    (STATIC_DIR / "img" / NOME_LOGO).write_bytes(conteudo)
    return {"ok": True}


@app.post("/api/config/theme")
async def definir_tema_cor(body: TemaCorUpdate):
    """Troca o tema de cor global (Configuração) e avisa todo mundo conectado
    via WebSocket, pra trocar a paleta em tempo real sem precisar recarregar
    a página."""
    if body.theme not in db.TEMAS_COR_VALIDOS:
        raise HTTPException(400, "Tema inválido.")
    con = db.conectar()
    try:
        db.definir_cor_tema(con, body.theme)
    finally:
        con.close()
    # Broadcast pra toda tela conectada trocar de tema junto, sem precisar recarregar.
    return await publicar_estado()


@app.post("/api/config/language")
async def definir_idioma(body: IdiomaUpdate):
    """Mesma ideia de definir_tema_cor, só que pro idioma da interface."""
    if body.language not in db.IDIOMAS_VALIDOS:
        raise HTTPException(400, "Idioma inválido.")
    con = db.conectar()
    try:
        db.definir_idioma(con, body.language)
    finally:
        con.close()
    # Mesmo mecanismo do tema de cor: broadcast pra todo mundo trocar de idioma junto.
    return await publicar_estado()


@app.post("/api/config/chip-model")
async def adicionar_modelo_ficha(
    nome: str = Form(...),
    cor_nome: List[str] = Form(...),
    cor_arquivo: List[UploadFile] = File(...),
):
    """Cria um modelo de ficha novo (upload feito na tela Configuração).
    cor_nome e cor_arquivo chegam como duas listas PARALELAS — a cor na
    posição 0 de cor_nome usa a foto na posição 0 de cor_arquivo, e assim por
    diante (é assim que um formulário HTML manda múltiplos campos repetidos
    de uma vez). Salva uma foto por cor dentro de uma pasta nova (nomeada a
    partir do nome do modelo) e registra tudo em modelos.json."""
    if not nome.strip():
        raise HTTPException(400, "Dê um nome ao modelo.")
    if not cor_nome or len(cor_nome) != len(cor_arquivo):
        raise HTTPException(400, "Envie ao menos uma cor, cada uma com nome e imagem.")
    if any(not c.strip() for c in cor_nome):
        raise HTTPException(400, "Dê um nome a cada cor.")
    for arquivo in cor_arquivo:
        _validar_imagem(arquivo)

    manifesto = _ler_manifesto_fichas()
    slug_modelo = _slug_disponivel(_slugificar(nome, "modelo"), set(manifesto.keys()))

    pasta_modelo = FICHAS_DIR / slug_modelo
    pasta_modelo.mkdir(parents=True, exist_ok=True)

    cores_slugs = set()
    cores = {}
    for nome_cor, arquivo in zip(cor_nome, cor_arquivo):
        slug_cor = _slug_disponivel(_slugificar(nome_cor, "cor"), cores_slugs)
        cores_slugs.add(slug_cor)
        cores[slug_cor] = nome_cor.strip()
        conteudo = await arquivo.read()
        (pasta_modelo / f"{slug_cor}.png").write_bytes(conteudo)

    manifesto[slug_modelo] = {"label": nome.strip(), "colors": cores}
    _salvar_manifesto_fichas(manifesto)

    return {
        "model": slug_modelo,
        "label": manifesto[slug_modelo]["label"],
        "colors": [{"id": cs, "label": cl} for cs, cl in cores.items()],
    }


@app.post("/api/config/chip-model/{slug_modelo}/colors")
async def adicionar_cor_ao_modelo(slug_modelo: str, nome: str = Form(...), arquivo: UploadFile = File(...)):
    """Acrescenta UMA cor a um modelo de ficha que já existe — diferente de
    adicionar_modelo_ficha (que cria o modelo inteiro do zero, com várias
    cores de uma vez)."""
    if not nome.strip():
        raise HTTPException(400, "Dê um nome à cor.")
    _validar_imagem(arquivo)

    manifesto = _ler_manifesto_fichas()
    if slug_modelo not in manifesto:
        raise HTTPException(404, "Modelo não encontrado.")

    cores = manifesto[slug_modelo].setdefault("colors", {})
    slug_cor = _slug_disponivel(_slugificar(nome, "cor"), set(cores.keys()))
    cores[slug_cor] = nome.strip()

    pasta_modelo = FICHAS_DIR / slug_modelo
    pasta_modelo.mkdir(parents=True, exist_ok=True)
    conteudo = await arquivo.read()
    (pasta_modelo / f"{slug_cor}.png").write_bytes(conteudo)

    _salvar_manifesto_fichas(manifesto)

    return {
        "model": slug_modelo,
        "label": manifesto[slug_modelo]["label"],
        "colors": [{"id": cs, "label": cl} for cs, cl in cores.items()],
    }


@app.delete("/api/config/chip-model/{slug_modelo}/colors/{slug_cor}")
async def remover_cor_do_modelo(slug_modelo: str, slug_cor: str):
    """Remove uma cor específica de um modelo (mantendo o modelo e as outras
    cores dele intactos) — apaga a entrada no manifesto e o arquivo de imagem
    correspondente."""
    manifesto = _ler_manifesto_fichas()
    if slug_modelo not in manifesto:
        raise HTTPException(404, "Modelo não encontrado.")
    cores = manifesto[slug_modelo].get("colors", {})
    if slug_cor not in cores:
        raise HTTPException(404, "Cor não encontrada.")

    del cores[slug_cor]
    _salvar_manifesto_fichas(manifesto)

    arquivo = FICHAS_DIR / slug_modelo / f"{slug_cor}.png"
    if arquivo.exists():
        arquivo.unlink()

    return {
        "model": slug_modelo,
        "label": manifesto[slug_modelo]["label"],
        "colors": [{"id": cs, "label": cl} for cs, cl in cores.items()],
    }


@app.delete("/api/config/chip-model/{slug_modelo}")
async def remover_modelo_ficha(slug_modelo: str):
    """Remove um modelo de ficha inteiro — apaga a entrada no manifesto e a
    pasta inteira de imagens dele (shutil.rmtree apaga a pasta mesmo não
    estando vazia)."""
    manifesto = _ler_manifesto_fichas()
    if slug_modelo not in manifesto:
        raise HTTPException(404, "Modelo não encontrado.")

    del manifesto[slug_modelo]
    _salvar_manifesto_fichas(manifesto)

    pasta_modelo = FICHAS_DIR / slug_modelo
    if pasta_modelo.exists():
        shutil.rmtree(pasta_modelo)

    return {"ok": True}


# --------------------------------------------------------------- estáticos --
# Este mount fica depois de todas as rotas de API/WS para não "engolir" essas rotas.

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
