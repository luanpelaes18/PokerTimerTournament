# PokerTimerTournament

Timer de torneio de poker para home games, com 3 telas (Gerente, Timer, Admin) sincronizadas em tempo real pela rede local. Veja os requisitos completos em [`requisitos-timer-poker.md`](requisitos-timer-poker.md) e o plano de implementação em [`/Users/lua/.claude/plans/serene-stirring-curry.md`](/Users/lua/.claude/plans/serene-stirring-curry.md).

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

- `http://<ip>:8000/#gerente` — cadastro de jogadores, rebuy, add-on, pagamento
- `http://<ip>:8000/#timer` — relógio para a TV/monitor
- `http://<ip>:8000/#admin` — estrutura de blinds, valores, controle total
- `http://<ip>:8000/#historico` — torneios anteriores e relatório

## Primeiro uso

Antes de começar o torneio de verdade, entre em **Admin** e confira/ajuste:

- Nome do torneio
- Fichas de buy-in / rebuy / add-on
- Preço em R$ por ação e quanto dela vai para o dealer
- Estrutura de níveis (vem pré-carregada com 18 níveis de exemplo)

Esses valores vêm com números de exemplo e precisam ser revisados antes de cobrar dinheiro de verdade.

## Observação de segurança

Não há login — qualquer pessoa com o endereço IP na rede local pode acessar e editar os dados. Aceitável para uso doméstico entre amigos; não exponha esse servidor na internet.
