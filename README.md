# PokerTimerTournament

Sistema de controle de torneios de poker para home games: cadastro de torneio (fichas, valores, estrutura de blinds), gerenciamento de jogadores (rebuy, add-on, reentrada, pagamentos) e um relógio de torneio sincronizado em tempo real entre vários dispositivos na mesma rede — ideal pra deixar um celular com o controle e um monitor/TV só com o relógio pros jogadores.

Três telas: **Admin** (cadastro de torneios e histórico), **Gerente** (jogadores, timer e finalização) e **Timer** (relógio para a TV/monitor).

Stack: Python (FastAPI + WebSocket) + SQLite, frontend em HTML/CSS/JS puro servido pelo próprio backend. Sem nuvem, sem conta externa — roda local na sua rede durante a partida.

## Como rodar

```bash
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn app:app --host 0.0.0.0 --port 8000
```

Abra `http://localhost:8000` no computador que está rodando o servidor (ele cai em `#menu`).

Para os outros dispositivos (celular do gerente, TV do timer) na **mesma rede Wi-Fi**, descubra o IP local do computador que está rodando o servidor:

- macOS/Linux: `ipconfig getifaddr en0` (ou `hostname -I` no Linux)
- Windows: `ipconfig` (campo "Endereço IPv4")

E acesse `http://<esse-ip>:8000` nos outros dispositivos. Rotas diretas:

- `http://<ip>:8000/#admin` — cadastrar torneios (nome, valores, estrutura de níveis) e ver o histórico dos anteriores
- `http://<ip>:8000/#gerente` — escolher/ativar o torneio, cadastrar jogadores, rebuy/add-on/reentrada/pagamento, controlar o timer e finalizar
- `http://<ip>:8000/#timer` — relógio grande para a TV/monitor (só exibição)

## Fluxo de uso

1. **Admin** cadastra um torneio: nome, fichas de buy-in/rebuy/add-on, preço por ação, parte do dealer, valores de ficha e a estrutura de níveis (blinds/tempo/pausas). Clica em **Salvar**.
2. Torneios cadastrados e ainda não iniciados ficam disponíveis no **Gerente**, que escolhe um na lista e clica em **Ativar este torneio** (isso finaliza o torneio anterior, se ainda estiver rodando).
3. **Gerente** cadastra os jogadores, toca o timer (play/pause/próximo/anterior/±1min), registra rebuy/add-on/reentrada/pagamento, e ao final clica em **Finalizar torneio**.
4. Torneio finalizado fica travado para edição e aparece no histórico do **Admin**, com relatório de participantes e linha do tempo de eventos.
5. A tela **Timer** só exibe (relógio, blinds, próximo nível, prêmio acumulado) — pensada para ficar aberta numa TV/monitor.

Só o torneio **ativo** pode ter o timer tocado — dá pra cadastrar/editar outros torneios em paralelo (Admin) ou só visualizar jogadores de um torneio salvo (Gerente) sem mexer no que está rodando.

## Funcionalidades

- Estrutura de níveis editável (SB/BB/ante/tempo/pausa), com opção de marcar o nível que fecha as entradas (sem reentrada depois dele) e propagar um valor editado para os níveis seguintes.
- Campos de fichas/valores aceitam abreviações (`2k` = 2000, `1.5m` = 1.500.000).
- Controle financeiro: valor devido por jogador, prêmio acumulado, parte do dealer, total recebido/pendente.
- Rebuy, add-on e reentrada (jogador eliminado que volta a pagar) com log de eventos por torneio (entrada, rebuy, add-on, reentrada, saída, finalização).
- Alarme sonoro (bipes crescentes) na troca de nível e aviso 30s antes, tocando apenas em quem está olhando o relógio (Timer/Gerente).
- Tema claro/escuro e seleção de torneio persistente entre recargas da página.

## Primeiro uso

Antes de começar o torneio de verdade, entre em **Admin**, cadastre o torneio e confira:

- Nome do torneio
- Fichas de buy-in / rebuy / add-on
- Preço em R$ por ação e quanto dela vai para o dealer
- Estrutura de níveis (vem pré-carregada com 18 níveis de exemplo ao criar um torneio novo)

Esses valores vêm com números de exemplo e precisam ser revisados antes de cobrar dinheiro de verdade.

## Identidade visual

Paleta e logo seguem a marca "LK" definida em [`lk-poker-identidade-visual/SKILL.md`](lk-poker-identidade-visual/SKILL.md) (tokens de cor violeta/índigo/ciano, compartilhados com o portfólio).

## Observação de segurança

Não há login — qualquer pessoa com o endereço IP na rede local pode acessar e editar os dados. Aceitável para uso doméstico entre amigos; não exponha esse servidor na internet.
