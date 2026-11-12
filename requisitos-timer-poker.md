# Documento de Requisitos — Timer de Torneio de Poker

Nov 12, 2026 · @Lua

## Visão Geral

Timer de torneio de poker para jogos caseiros, publicado como uma aplicação web única, com três telas que compartilham o mesmo estado de torneio em tempo real: Gerente, Timer e Admin. O objetivo é controlar a progressão dos níveis de blind, gerenciar os participantes (buy-in, rebuy, add-on) e o fluxo financeiro (dinheiro coletado, premiação, parte do dealer), de forma simples tanto para quem organiza o torneio quanto para quem só acompanha o relógio num monitor.

## Perfis de Usuário e Interfaces

A aplicação tem uma tela de menu inicial (`#menu`) que direciona para três telas:

| Interface | Rota | Público | Permissões |
| --- | --- | --- | --- |
| Gerente | `#gerente` | Quem cadastra jogadores e controla pagamentos | Adicionar/remover participantes, registrar rebuy/add-on, marcar pagamento; vê totais financeiros (inclusive parte do dealer) |
| Timer | `#timer` | Monitor/TV visível a todos os jogadores | Apenas visualização do relógio e nível atual, com controles de reprodução; **não** mostra a parte do dealer |
| Admin | `#admin` | Organizador do torneio | Controle total: estrutura de blinds, valores de fichas, preço por ação, nome do torneio, mudo, e os mesmos controles de reprodução do Timer |

Existe ainda uma tela de fallback (`#offline`) exibida quando a conexão com o banco de dados não está disponível.

## Requisitos Funcionais — Interface Gerente

1. Cadastrar um novo participante pelo nome.
2. Registrar rebuy (reentrada) para um participante.
3. Registrar add-on para um participante.
4. Marcar/desmarcar participante como eliminado.
5. Marcar/desmarcar pagamento do participante — na prática o pagamento costuma ocorrer no momento do add-on, mas o controle é manual (checkbox), independente da ação.
6. Remover um participante cadastrado por engano.
7. Exibir lista de participantes com: nome, nº de rebuys, status de add-on, status de pagamento, status de eliminado.
8. Exibir totais da sessão: jogadores ativos/eliminados, total em fichas em jogo, stack médio, valores pendentes e já coletados, prêmio acumulado e valor do dealer.
9. Toda alteração deve refletir imediatamente na tela (atualização otimista), mesmo antes da confirmação do servidor, revertendo visualmente caso a gravação falhe.

## Requisitos Funcionais — Interface Timer

1. Exibir o nível atual de blind (small blind / big blind / ante) e o tempo restante no nível, em contagem regressiva.
2. Exibir o próximo nível de blind.
3. Exibir o relógio em formato grande, legível a distância (uso em monitor/TV).
4. Exibir o valor total do prêmio (prize pool) acumulado. **Não exibir o valor destinado ao dealer.**
5. Exibir o número de jogadores ativos e o stack médio.

6. Emitir um alerta sonoro na 30 segundos antes e na troca de nível de blind.
7. Respeitar o estado global de "mudo" definido no Admin.

## Requisitos Funcionais — Interface Admin

1. Todos os controles de reprodução do Timer (play/pausa, próximo/anterior nível, ajuste de ±1 minuto).
2. Editar a estrutura completa de níveis de blind: small blind, big blind, ante e duração (em minutos) de cada nível, incluindo níveis de pausa/intervalo.
3. Editar o nome do torneio.
4. Editar os valores de buy-in (entrada), reentrada (rebuy) e add-on em fichas.
5. Editar o preço em dinheiro cobrado por ação (buy-in, rebuy ou add-on) — valor único aplicado a qualquer uma das três ações.
6. Editar o valor em dinheiro destinado ao dealer por ação (o restante compõe o prêmio).
7. Editar a descrição dos valores de ficha disponíveis (ex.: "100, 500, 1.000, 5.000, 25.000").
8. Ativar/desativar o som de alerta (mudo) globalmente.
9. Exibir os mesmos totais e estatísticas do Timer, acrescidos do valor destinado ao dealer (visível apenas aqui e no Gerente).
10. Alterações de estrutura devem ser salvas com debounce (sem gravar a cada tecla digitada), para não sobrecarregar o banco de dados.

## Estrutura Padrão de Blinds e Fichas

Fichas disponíveis: 100, 500, 1.000, 5.000, 25.000.

Estrutura padrão de 18 níveis (editável pelo Admin):

| Nível | Small Blind | Big Blind | Duração |
| --- | --- | --- | --- |
| 1 | 100 | 200 | 12 min |
| 2 | 100 | 300 | 12 min |
| 3 | 200 | 400 | 12 min |
| 4 | 200 | 500 | 12 min |
| 5 | 300 | 600 | 12 min |
| 6 | 400 | 800 | 12 min |
| 7 | 500 | 1.000 | 12 min |
| 8 | 600 | 1.200 | 12 min |
| 9 | 700 | 1.500 | 12 min |
| 10 | 1.000 | 2.000 | 12 min (fim das entradas / add-on) |
| Intervalo | — | — | 15 min |
| 11 | 1.000 | 2.000 | 10 min |
| 12 | 1.500 | 3.000 | 10 min |
| 13 | 2.000 | 4.000 | 10 min |
| 14 | 2.500 | 5.000 | 10 min |
| 15 | 3.000 | 6.000 | 10 min |
| 16 | 4.000 | 8.000 | 10 min |
| 17 | 5.000 | 10.000 | 10 min |

Regra de duração: níveis antes do intervalo de add-on duram 12 minutos; níveis depois do intervalo duram 10 minutos.

## Regras de Negócio Financeiras


- **Fichas por ação**:
  - Buy-in (entrada): xxxx fichas
  - Rebuy (reentrada): xxxxx fichas
  - Add-on: xxxxxx fichas
- **Pagamento**: o controle de pagamento é feito por participante (status pago/pendente); na prática o pagamento costuma ser feito apenas no momento do add-on, mas o sistema permite marcar o status manualmente a qualquer momento.
- **Divisão do dinheiro por ação**: dos R$ xxxx de cada ação, R$ yyyyy vão para o prêmio (prize pool) e R$ zzzzzz vão para o dealer.
- **Visibilidade**: o valor total do prêmio é visível em todas as telas (inclusive Timer). O valor total destinado ao dealer é visível **somente** nas telas Gerente e Admin — nunca no Timer.
- **Cálculo de totais**: prize pool = (total de ações realizadas) × R$ yyyyy; valor do dealer = (total de ações realizadas) × R$ xxxxx. Ações de um participante = 1 (buy-in) + nº de rebuys + 1 se houver add-on.


## Modelo de Dados

Documento único do torneio (`tournament/state`):

| Campo | Tipo | Descrição |
| --- | --- | --- |
| name | string | Nome do torneio |
| levels | array | Lista de níveis `{sb, bb, ante, minutes, isBreak}` |
| status | string | `"running"` ou `"paused"` |
| elapsedBeforeRef | number | Segundos acumulados antes da referência atual |
| referenceAt | string ou null | Timestamp ISO do início da contagem atual (null quando pausado) |
| muted | boolean | Som desativado globalmente |
| entryValue / reentryValue / addonValue | number | Fichas entregues por buy-in / rebuy / add-on |
| actionPrice | number | Preço em R$ cobrado por qualquer ação |
| dealerShare | number | Parte em R$, por ação, destinada ao dealer |
| chipValues | string | Descrição textual dos valores de ficha disponíveis |

Coleção de participantes (`participants/{id}`):

| Campo | Tipo | Descrição |
| --- | --- | --- |
| name | string | Nome do jogador |
| rebuys | number | Quantidade de reentradas |
| addon | boolean | Se já fez o add-on |
| paid | boolean | Status de pagamento |
| eliminated | boolean | Se já foi eliminado |
| createdAt | string | Timestamp ISO de criação (ordenação da lista) |

O tempo restante do nível é sempre calculado no cliente a partir de `elapsedBeforeRef` + tempo decorrido desde `referenceAt`, nunca armazenado como contagem regressiva — evita gravações a cada segundo.

## Requisitos Não-Funcionais

- **Tempo real**: alterações feitas em qualquer tela (ex.: Admin mudando a estrutura) devem refletir nas demais telas abertas (ex.: Timer em um monitor) sem necessidade de recarregar a página.
- **Resiliência**: em caso de falha temporária na sincronização em tempo real, a aplicação deve reconsultar os dados periodicamente (polling de segurança) para garantir consistência eventual.
- **Atualização otimista**: ações do usuário (adicionar jogador, marcar pagamento etc.) devem aparecer na tela imediatamente, revertendo visualmente caso a gravação falhe.
- **Responsivo**: deve funcionar bem tanto em tela de celular (uso do Gerente) quanto em TV/monitor grande (uso do Timer).
- **Tema claro/escuro**: suporte a ambos os temas.
- **Áudio e vibração**: alerta sonoro perceptível (padrão de bipes em onda quadrada, dois tons alternados) e vibração ao trocar de nível, respeitando o estado de mudo.
- **Independência de instalação**: aplicação autocontida (uma única página), sem necessidade de backend próprio além do armazenamento de dados em tempo real.

## Geracao de relatorio
- Cada torneio deve ter seu historico completo e armazenado.

## Observações e Fora de Escopo

- Não há autenticação/login de usuários — o controle de acesso às telas é apenas por URL/rota.**a ser estudada para proxima versao

- Não há suporte a múltiplas mesas/torneios simultâneos no mesmo documento.

- A entrada de dados financeiros é manual pelo Gerente; não há integração com meios de pagamento.
