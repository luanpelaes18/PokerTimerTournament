# PokerTimerTournament

*[Read in English](README.en.md)*

Sistema de controle de torneios de poker para home games: cadastro de torneio (fichas, valores, estrutura de blinds, premiação), gerenciamento de jogadores (rebuy, add-on, reentrada, pagamentos) e um relógio de torneio sincronizado em tempo real entre vários dispositivos na mesma rede — ideal pra deixar um celular com o controle e um monitor/TV só com o relógio pros jogadores.

Quatro telas: **Admin** (cadastro de torneios e histórico), **Gerente** (jogadores, timer e finalização), **Timer** (relógio para a TV/monitor) e **Configuração** (logo, modelos de ficha e tema de cores — tudo global, vale pra qualquer torneio).

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

- `http://<ip>:8000/#admin` — cadastrar torneios (nome, valores, fichas, premiação, estrutura de níveis), ver o histórico dos anteriores e excluir torneios criados por engano
- `http://<ip>:8000/#gerente` — escolher/ativar o torneio, cadastrar jogadores, rebuy/add-on/reentrada/pagamento, controlar o timer e finalizar
- `http://<ip>:8000/#timer` — relógio grande para a TV/monitor (só exibição: blinds, fichas, premiação)
- `http://<ip>:8000/#configuracao` — logo do sistema, modelos de ficha e tema de cores (vale pra todos os torneios)

## Fluxo de uso

1. **Admin** cadastra um torneio: nome, fichas de buy-in/rebuy/add-on, preço por ação, parte do dealer, fichas cadastradas (valor + modelo visual + cor), premiação e a estrutura de níveis (blinds/tempo/pausas, com opção de marcar o nível que fecha as entradas). Clica em **Salvar**.
2. Torneios cadastrados e ainda não iniciados ficam disponíveis no **Gerente**, que escolhe um na lista e clica em **Ativar este torneio** (isso finaliza o torneio anterior, se ainda estiver rodando).
3. **Gerente** cadastra os jogadores, toca o timer (play/pause/próximo/anterior/±1min/reiniciar), registra rebuy/add-on/reentrada/pagamento, confirma a divisão da premiação, e ao final clica em **Finalizar torneio**.
4. Torneio finalizado fica travado para edição e aparece no histórico do **Admin**, com relatório de participantes e linha do tempo de eventos — incluindo o nível em que cada jogador foi eliminado e, depois que as entradas fecham, a colocação final dele. Torneios criados por engano podem ser excluídos ali mesmo (menos o que estiver ativo no momento).
5. A tela **Timer** só exibe (relógio, blinds, fichas físicas da mesa, premiação, prêmio acumulado) — pensada para ficar aberta numa TV/monitor.

Só o torneio **ativo** pode ter o timer tocado — dá pra cadastrar/editar outros torneios em paralelo (Admin) ou só visualizar jogadores de um torneio salvo (Gerente) sem mexer no que está rodando.

## Funcionalidades

- Estrutura de níveis editável (SB/BB/ante/tempo/pausa), com opção de marcar o nível que fecha as entradas (sem reentrada depois dele) e propagar um valor editado para os níveis seguintes.
- Campos de fichas/valores aceitam abreviações (`2k` = 2000, `1.5m` = 1.500.000).
- Controle financeiro: valor devido por jogador, prêmio acumulado, parte do dealer, total recebido/pendente, pagamento lançado como incremento sobre o que já foi pago.
- Rebuy, add-on (bloqueado pra quem já está eliminado) e reentrada (jogador eliminado que volta a pagar, só liberada enquanto as entradas não fecharem) com log de eventos por torneio.
- **Premiação**: número livre de posições pagas (não só 1º/2º/3º), cada uma com percentual independente do prêmio acumulado (padrão 45%/35%/20% nas 3 primeiras); "Confirmar divisão de premiação" trava a edição e troca o rótulo de "Previsão" pra "Premiação" também no Timer.
- **Histórico de eliminação**: cada jogador eliminado registra o nível/blind em que caiu; depois que as entradas fecham, registra também a colocação final (ex: "8º lugar"), calculada pela quantidade de jogadores ainda ativos no momento.
- **Fichas físicas cadastráveis**: cada ficha tem valor, modelo visual e cor escolhidos independentemente — a combinação define a foto exibida na coluna de fichas do Timer.
- Exclusão de torneios no Admin (pra desfazer cadastro feito por engano) — bloqueada apenas para o torneio atualmente ativo.
- Alarme sonoro (bipes crescentes) na troca de nível e aviso 30s antes — só dispara quando o nível avança sozinho (tempo esgotado), nunca em clique manual nos botões do timer — e toca apenas em quem está olhando o relógio (Timer/Gerente).
- Interruptor claro/escuro (ícone flutuante no canto superior direito, em todas as telas) e seleção de torneio persistente entre recargas da página.
- **Tema de cores** selecionável globalmente (ver seção abaixo).

## Primeiro uso

Antes de começar o torneio de verdade, entre em **Admin**, cadastre o torneio e confira:

- Nome do torneio
- Fichas de buy-in / rebuy / add-on
- Preço em R$ por ação e quanto dela vai para o dealer
- Fichas cadastradas (valor, modelo e cor de cada uma)
- Premiação (percentual de cada posição paga)
- Estrutura de níveis (vem pré-carregada com 18 níveis de exemplo ao criar um torneio novo)

Esses valores vêm com números de exemplo e precisam ser revisados antes de cobrar dinheiro de verdade.

## Configuração do sistema

A tela **Configuração** reúne ajustes globais, que valem pra qualquer torneio (passado, atual ou futuro) e são vistos por todos os dispositivos conectados:

- **Logo**: envie um PNG (de preferência quadrado, com fundo transparente) pra substituir a logo usada no menu e como marca d'água de fundo em todas as telas.
- **Modelos de ficha**: cada modelo tem um nome livre e quantas cores você quiser, cada cor com seu próprio nome e foto (uma ficha por foto — fotos com várias fichas juntas não são separadas automaticamente). Dá pra adicionar cor a um modelo existente, remover uma cor específica ou remover o modelo inteiro.
- **Tema de cores**: além do tema "Padrão" (identidade "LK", violeta/índigo/ciano), tem mais 5 esquemas de cor conhecidos pra escolher — cada um com variante clara e escura, seguindo o interruptor claro/escuro normalmente:
  - **Nord** — ártico, azulado e frio
  - **Gruvbox Dark/Light** — retrô, terroso e quente
  - **Solarized Dark/Light** — baixo contraste, verde-azulado (único cujos acentos não mudam entre claro e escuro, por design da paleta original)
  - **Rosé Pine / Dawn** — rosa empoeirado, discreto
  - **One Dark Pro / Atom One Light** — azul-acinzentado clássico

  A troca de tema é instantânea em todas as telas conectadas (mesmo mecanismo de tempo real usado pro resto do app).

## Identidade visual

O tema "Padrão" segue a marca "LK" definida em [`lk-poker-identidade-visual/SKILL.md`](lk-poker-identidade-visual/SKILL.md) (tokens de cor violeta/índigo/ciano, compartilhados com o portfólio). Os demais temas de cor (ver "Configuração do sistema") são esquemas de terceiros, de uso livre, usados aqui como alternativas visuais.

## Observação de segurança

Não há login — qualquer pessoa com o endereço IP na rede local pode acessar e editar os dados. Aceitável para uso doméstico entre amigos; não exponha esse servidor na internet.
