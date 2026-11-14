// app.js é o arquivo principal do frontend: roteamento por hash (#menu,
// #gerente, #timer, #admin, #configuracao), toda a renderização das telas a
// partir do estado vindo de api.js, e o "wiring" (ligar cada botão/input da
// página a uma ação). Não usa nenhum framework — tudo é DOM puro, manipulado
// via document.getElementById/createElement. O arquivo inteiro roda dentro de
// uma IIFE (function(){ ... })() pra não vazar nenhuma variável/função pro
// escopo global (só window.Api, window.Audio30, window.I18N, window.TimerEngine
// e window.renderizarRelogio, que vêm de fora ou são expostas de propósito).
(function () {
  // ---------------------------------------------------------- utilidades --

  // Atalho pra I18N.t (tradução) — chamado "tr" (e não "t") porque "t" já é
  // usado em várias partes deste arquivo como nome de variável de loop (ex:
  // "torneios.forEach(function (t) {...})"), e usar o mesmo nome pra duas
  // coisas diferentes causaria bugs difíceis de notar.
  var tr = I18N.t;

  function fmtMoeda(valor) {
    // Formata um número como dinheiro: "R$ 1.234" (sempre em reais e sempre
    // sem casas decimais — este app nunca trabalha com centavos). O separador
    // de milhar (ponto ou vírgula) muda conforme o idioma ativo
    // (I18N.localeAtual), mas o símbolo "R$" fica fixo — é a moeda real sendo
    // usada no jogo, não teria sentido virar "$" só por trocar o idioma da tela.
    return "R$ " + Math.round(valor || 0).toLocaleString(I18N.localeAtual());
  }

  function fmtNumero(valor) {
    // Mesma formatação de fmtMoeda, mas sem o prefixo de moeda — usado pra
    // contagem de fichas, stack médio, etc.
    return Math.round(valor || 0).toLocaleString(I18N.localeAtual());
  }

  function fmtMMSS(segundos) {
    // Formata segundos como "mm:ss" (ex: 125 segundos -> "02:05") — usado no
    // relógio grande do Timer/Gerente.
    var s = Math.max(0, Math.round(segundos));
    var m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function fmtBlind(nivel) {
    // Texto de um nível de blind pra exibição: "100 / 200", "100 / 200 (ante
    // 25)", ou a palavra traduzida de "intervalo" se for um nível de pausa.
    if (!nivel) return "—";
    if (nivel.isBreak) return tr("blind_intervalo");
    var txt = fmtNumero(nivel.sb) + " / " + fmtNumero(nivel.bb);
    if (nivel.ante) txt += tr("blind_ante", { valor: fmtNumero(nivel.ante) });
    return txt;
  }

  // Aceita abreviações tipo "2k" (2000) e "1.5m" (1500000) nos campos numéricos.
  function parseNumeroAbreviado(valor) {
    if (valor === null || valor === undefined) return 0;
    var texto = String(valor).trim().toLowerCase().replace(",", ".");
    if (!texto) return 0;
    var combinado = texto.match(/^(-?\d+(?:\.\d+)?)\s*(k|m)$/);
    if (combinado) {
      var numero = parseFloat(combinado[1]);
      return combinado[2] === "k" ? numero * 1000 : numero * 1000000;
    }
    var simples = Number(texto);
    return isNaN(simples) ? 0 : simples;
  }

  function el(tag, classe, texto) {
    // Atalho usado em CENTENAS de lugares neste arquivo pra criar um elemento
    // DOM (document.createElement) já com classe CSS e texto definidos, numa
    // linha só — em vez de 3 linhas repetidas toda vez (createElement, depois
    // className, depois textContent).
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function lerStorage(chave) {
    // Lê uma chave do localStorage (preferência salva no navegador, só
    // naquele aparelho) — devolve null se não existir ou se o localStorage
    // estiver bloqueado (ex: aba anônima em alguns navegadores).
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }

  function gravarStorage(chave, valor) {
    // Salva (ou remove, se "valor" for algo falsy) uma chave no localStorage.
    // Usado pra lembrar qual torneio estava selecionado no Admin/Gerente, e o
    // tema claro/escuro, entre uma visita e outra na mesma aba/aparelho.
    try {
      if (valor) localStorage.setItem(chave, valor);
      else localStorage.removeItem(chave);
    } catch (e) { /* sem storage */ }
  }

  // Liga cada tipo de evento (o que fica gravado no banco, em inglês/snake_case)
  // à chave de tradução correspondente em i18n.js — usado por fmtEvento, abaixo.
  var CHAVES_EVENTO = {
    torneio_criado: "evento_torneio_criado",
    torneio_finalizado: "evento_torneio_finalizado",
    entrada: "evento_entrada",
    rebuy: "evento_rebuy",
    addon: "evento_addon",
    reentrada: "evento_reentrada",
    saida: "evento_saida",
    removido: "evento_removido",
  };

  // O detalhe de "saida" vem estruturado (JSON) desde que o histórico de nível/
  // colocação foi adicionado — formata aqui pra poder traduzir. Eventos de antes
  // dessa mudança guardam texto solto (não-JSON) e continuam exibidos como vieram.
  function fmtDetalheSaida(detalheBruto) {
    var dados;
    try { dados = JSON.parse(detalheBruto); } catch (e) { return detalheBruto; }
    if (!dados || typeof dados !== "object") return detalheBruto;
    var texto = dados.isBreak
      ? tr("evento_saida_detalhe_pausa", { nome: dados.name, nivel: dados.level })
      : tr("evento_saida_detalhe", { nome: dados.name, nivel: dados.level, sb: fmtNumero(dados.sb), bb: fmtNumero(dados.bb) });
    if (dados.position) texto += tr("evento_saida_detalhe_lugar", { posicao: I18N.ordinal(dados.position) });
    return texto;
  }

  function fmtEvento(ev) {
    // Monta a linha de texto de um evento da linha do tempo: o rótulo
    // traduzido do tipo (ex: "Rebuy") seguido do detalhe, se houver (ex:
    // "Rebuy: Fulano"). Eventos "saida" passam primeiro por
    // fmtDetalheSaida pra virar texto legível (os outros tipos já guardam o
    // detalhe como texto simples — normalmente só o nome do jogador).
    var rotulo = tr(CHAVES_EVENTO[ev.type]) || ev.type;
    var detalhe = ev.type === "saida" ? fmtDetalheSaida(ev.detail) : ev.detail;
    return detalhe ? (rotulo + ": " + detalhe) : rotulo;
  }

  // --------------------------------------------------- torneio ao vivo (Gerente) --
  // No Gerente dá pra escolher um torneio salvo diferente do que está "ao vivo"
  // (ex: conferir/ajustar jogadores de um torneio preparado com antecedência).
  // Só o torneio atual (torneioSelecionadoId === null ou igual ao id ao vivo)
  // tem os controles de timer liberados — "só um pode ser tocado".

  var torneioSelecionadoId = null; // null = segue o torneio atual; senão, o id do rascunho sendo visto
  var estadoRascunho = null;        // snapshot do torneio rascunho selecionado (quando torneioSelecionadoId != null)
  var BOTOES_ATIVAR = ["gerente-botao-ativar"]; // ids dos botões "Ativar este torneio" (lista, caso haja mais de um no layout)

  function emModoRascunho() {
    // True quando o Gerente está olhando um torneio diferente do que está "ao
    // vivo" agora (torneioSelecionadoId aponta pra outro id) — nesse modo, os
    // controles de timer ficam desabilitados (só o torneio ao vivo pode rodar).
    var atual = Api.obterEstado();
    return !!(torneioSelecionadoId && (!atual || torneioSelecionadoId !== atual.tournament.id));
  }

  function estadoExibido() {
    // Qual snapshot usar pra desenhar a tela do Gerente agora: o do rascunho
    // selecionado (se em modo rascunho) ou o estado ao vivo normal.
    return emModoRascunho() ? estadoRascunho : Api.obterEstado();
  }

  function executarAcao(url, metodo, corpo, mutacaoOtimista) {
    // Wrapper usado por quase toda ação do Gerente (rebuy, add-on, pagamento,
    // premiação...): se NÃO estiver em modo rascunho, delega direto pra
    // Api.enviarAcao (que atualiza o torneio ao vivo, com mutação otimista e
    // broadcast via WS pra todo mundo). Se ESTIVER em modo rascunho, em vez
    // disso manda a requisição direto com um "tournamentId" no corpo (pra
    // mexer só naquele torneio específico, sem afetar o que está ao vivo) e
    // atualiza apenas a cópia local (estadoRascunho), sem broadcast.
    if (!emModoRascunho()) return Api.enviarAcao(url, metodo, corpo, mutacaoOtimista);
    var corpoFinal = Object.assign({}, corpo || {});
    if (torneioSelecionadoId) corpoFinal.tournamentId = torneioSelecionadoId;
    return fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpoFinal),
    })
      .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
      .then(function (novo) {
        estadoRascunho = novo;
        renderizarGerente(novo);
        atualizarBotaoAtivar();
        return novo;
      })
      .catch(function () { Api.avisar(tr("admin_erro_salvar")); });
  }

  function atualizarBotaoAtivar() {
    // Mostra/esconde o botão "Ativar este torneio" (só aparece quando um
    // rascunho não-finalizado está selecionado) e trava o botão "Finalizar
    // torneio" enquanto esse modo estiver ativo.
    var rascunho = emModoRascunho();
    var mostrar = rascunho && estadoRascunho && estadoRascunho.tournament.status !== "finished";
    BOTOES_ATIVAR.forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.style.display = mostrar ? "" : "none";
    });
    // Finalizar sempre age no torneio ao vivo — travar enquanto se está olhando
    // um rascunho evita finalizar o torneio errado sem querer.
    var botaoFinalizar = document.getElementById("gerente-botao-finalizar-torneio");
    if (botaoFinalizar) {
      botaoFinalizar.disabled = rascunho;
      botaoFinalizar.title = rascunho ? tr("gerente_bloqueio_rascunho_titulo") : "";
    }
  }

  // Liga o status cru do torneio (como vem do banco: paused/running/finished)
  // à chave de tradução — usado por toda lista de torneios (Gerente e Admin).
  var CHAVES_STATUS = { paused: "status_paused", running: "status_running", finished: "status_finished" };
  function rotuloStatus(status) { return tr(CHAVES_STATUS[status]) || status; }

  function renderizarListaGerente(lista) {
    // Desenha a lista de torneios à esquerda, na tela Gerente — só os ainda
    // não finalizados (ver "disponiveis" abaixo), já que torneios finalizados
    // só podem ser consultados no Admin. Marca "(atual)" no que estiver ao
    // vivo e destaca visualmente o que estiver selecionado agora.
    var container = document.getElementById("gerente-lista-torneios");
    if (!container) return;
    var atual = Api.obterEstado();
    var idAtual = atual ? atual.tournament.id : null;
    var idSelecionado = torneioSelecionadoId || idAtual;
    // Gerente só trabalha com torneios ainda não finalizados — ver histórico é tarefa do Admin.
    var disponiveis = lista.filter(function (t) { return t.status !== "finished"; });

    container.textContent = "";
    if (!disponiveis.length) {
      container.appendChild(el("p", "rotulo", tr("gerente_nenhum_torneio")));
      return;
    }
    disponiveis.forEach(function (t) {
      var linha = el("button", "linha-torneio" + (t.id === idSelecionado ? " selecionado" : ""));
      linha.type = "button";
      linha.appendChild(el("span", "nome", t.name + (t.id === idAtual ? tr("sufixo_atual") : "")));
      linha.appendChild(el("span", "rotulo", rotuloStatus(t.status)));
      linha.addEventListener("click", function () { selecionarTorneio(t.id === idAtual ? null : t.id); });
      container.appendChild(linha);
    });
  }

  function carregarListaTorneios() {
    // Busca a lista resumida de todos os torneios (GET /api/tournaments) —
    // devolve uma Promise com o array já decodificado de JSON.
    return fetch("/api/tournaments").then(function (r) { return r.json(); });
  }

  function atualizarListaTorneios() {
    // Busca a lista de novo e redesenha (versão do Gerente). Chamado toda vez
    // que algo pode ter mudado a lista (torneio criado, ativado, selecionado).
    carregarListaTorneios().then(renderizarListaGerente);
  }

  var gerenteRestaurado = false;

  // Ao entrar no Gerente pela primeira vez na sessão, tenta reabrir o torneio
  // (se diferente do atual) que estava selecionado antes de recarregar a página.
  function entrarGerente() {
    if (gerenteRestaurado) { atualizarListaTorneios(); return; }
    gerenteRestaurado = true;
    var salvo = lerStorage("gerenteTorneioId");
    if (!salvo) { atualizarListaTorneios(); return; }
    carregarListaTorneios().then(function (lista) {
      renderizarListaGerente(lista);
      var achado = lista.some(function (t) { return t.id === salvo; });
      if (achado) selecionarTorneio(salvo);
      else gravarStorage("gerenteTorneioId", null);
    });
  }

  function selecionarTorneio(id) {
    // Chamado ao clicar numa linha da lista do Gerente. id=null significa
    // "voltar a seguir o torneio ao vivo"; qualquer outro id entra em modo
    // rascunho, buscando o snapshot daquele torneio específico pra exibir
    // (sem tocar no que está ao vivo em paralelo).
    torneioSelecionadoId = id || null;
    gravarStorage("gerenteTorneioId", torneioSelecionadoId);
    atualizarListaTorneios(); // reflete o destaque de selecionado na lista
    if (emModoRascunho()) {
      fetch("/api/state?tournament_id=" + encodeURIComponent(torneioSelecionadoId))
        .then(function (r) { return r.json(); })
        .then(function (novo) {
          estadoRascunho = novo;
          renderizarGerente(novo);
          atualizarBotaoAtivar();
        });
    } else {
      estadoRascunho = null;
      var atual = Api.obterEstado();
      if (atual) renderizarGerente(atual);
      atualizarBotaoAtivar();
    }
  }

  function wireSeletorTorneio() {
    // Liga o clique do botão "Ativar este torneio": confirma com o usuário,
    // chama o endpoint de ativação (que finaliza o torneio anterior por trás
    // dos panos) e, se der certo, volta a seguir o novo torneio ao vivo
    // (selecionarTorneio(null) sai do modo rascunho).
    BOTOES_ATIVAR.forEach(function (idBotao) {
      var botao = document.getElementById(idBotao);
      if (!botao) return;
      botao.addEventListener("click", function () {
        if (!torneioSelecionadoId) return;
        if (!confirm(tr("gerente_confirmar_ativar"))) return;
        fetch("/api/tournaments/" + torneioSelecionadoId + "/ativar", { method: "POST" })
          .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
          .then(function () {
            atualizarListaTorneios();
            selecionarTorneio(null);
          })
          .catch(function () { Api.avisar(tr("gerente_erro_ativar")); });
      });
    });
  }

  // ------------------------------------------------------- Admin: cadastro --
  // Tela separada do torneio "ao vivo": lista à esquerda com todos os torneios
  // (qualquer status), clicar abre o cadastro (editável) ou o relatório
  // (se já finalizado) à direita. Sem WebSocket aqui — é só cadastro.

  var adminTorneioId = null;    // id do torneio selecionado agora no Admin (ou null se nenhum)
  var adminEstado = null;        // snapshot do torneio selecionado (só preenchido quando ele é editável, não finalizado)
  var adminRestaurado = false;     // já tentou restaurar a seleção salva (lerStorage) nesta sessão?

  function atualizarListaAdmin() {
    // Busca a lista de torneios de novo e redesenha (versão do Admin).
    carregarListaTorneios().then(renderizarListaAdminTorneios);
  }

  // Ao entrar no Admin pela primeira vez na sessão, tenta reabrir o torneio
  // que estava selecionado antes de recarregar a página.
  function entrarAdmin() {
    // Recarrega a lista de modelos de ficha a cada visita (pode ter subido um novo
    // modelo na Configuração desde a última vez) e atualiza a seleção já renderizada.
    carregarModelosFicha().then(function () {
      if (adminEstado) renderizarFichasAdmin(adminEstado.tournament.chips, true);
    });
    if (adminRestaurado) { atualizarListaAdmin(); return; }
    adminRestaurado = true;
    var salvo = lerStorage("adminTorneioId");
    if (!salvo) { atualizarListaAdmin(); return; }
    carregarListaTorneios().then(function (lista) {
      renderizarListaAdminTorneios(lista);
      var achado = lista.filter(function (t) { return t.id === salvo; })[0];
      if (achado) selecionarAdminTorneio(achado.id, achado.status);
      else gravarStorage("adminTorneioId", null);
    });
  }

  function renderizarListaAdminTorneios(lista) {
    // Desenha a lista de torneios à esquerda, na tela Admin — ao contrário da
    // versão do Gerente, aqui aparecem TODOS os torneios (inclusive os já
    // finalizados, marcados com o sufixo correspondente).
    var container = document.getElementById("admin-lista-torneios");
    if (!container) return;
    var atual = Api.obterEstado();
    var idAtual = atual ? atual.tournament.id : null;
    container.textContent = "";
    if (!lista.length) {
      container.appendChild(el("p", "rotulo", tr("admin_nenhum_cadastrado")));
      return;
    }
    lista.forEach(function (t) {
      var linha = el("div", "linha-torneio" + (t.id === adminTorneioId ? " selecionado" : ""));
      // "atual" é o torneio ativo agora (o Gerente que ativa/troca) — sem ele não dá
      // pra excluir, então deixar isso visível aqui evita a confusão de "por que não excluiu".
      var sufixo = t.id === idAtual ? tr("sufixo_atual") : (t.status === "finished" ? tr("sufixo_finalizado") : "");
      linha.appendChild(el("span", "nome", t.name + sufixo));
      linha.appendChild(el("span", "rotulo", rotuloStatus(t.status) + " — " + new Date(t.created_at).toLocaleDateString(I18N.localeAtual())));
      linha.addEventListener("click", function () { selecionarAdminTorneio(t.id, t.status); });
      container.appendChild(linha);
    });
  }

  // Excluir só fica disponível depois de abrir o torneio (editável ou relatório),
  // não na listinha — evita clique acidental em algo que não pode ser desfeito.
  function excluirTorneioComConfirmacao(id, nome) {
    if (!confirm(tr("admin_confirmar_excluir", { nome: nome }))) return;
    fetch("/api/tournaments/" + encodeURIComponent(id), { method: "DELETE" })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (erro) { throw new Error(erro.detail || "falha"); });
        adminTorneioId = null;
        gravarStorage("adminTorneioId", null);
        mostrarPainelAdmin("admin-detalhe-vazio");
        atualizarListaAdmin();
      })
      .catch(function (erro) {
        Api.avisar(erro.message === "torneio_atual" ? tr("admin_erro_excluir_atual") : tr("admin_erro_excluir"));
      });
  }

  function selecionarAdminTorneio(id, status) {
    // Chamado ao clicar numa linha da lista do Admin. Decide qual painel
    // buscar: relatório (read-only) se o torneio já foi finalizado, ou o
    // formulário editável caso contrário.
    adminTorneioId = id;
    gravarStorage("adminTorneioId", id);
    atualizarListaAdmin();
    if (status === "finished") {
      fetch("/api/tournaments/" + id)
        .then(function (r) { return r.json(); })
        .then(renderizarRelatorioAdmin);
    } else {
      fetch("/api/state?tournament_id=" + encodeURIComponent(id))
        .then(function (r) { return r.json(); })
        .then(function (novo) {
          adminEstado = novo;
          renderizarFormAdmin(novo);
        });
    }
  }

  function mostrarPainelAdmin(nomePainel) {
    // Troca qual dos 3 painéis do Admin fica visível: o aviso de "nada
    // selecionado", o formulário de edição, ou o relatório read-only — só um
    // por vez (os outros dois ficam com display:none).
    ["admin-detalhe-vazio", "admin-detalhe-editar", "admin-detalhe-relatorio"].forEach(function (id) {
      var painel = document.getElementById(id);
      if (painel) painel.style.display = id === nomePainel ? "block" : "none";
    });
  }

  // Liga cada campo de input do formulário geral do Admin (id do elemento) ao
  // nome do campo correspondente no snapshot/AdminUpdate — usado tanto pra
  // preencher os campos (renderizarFormAdmin) quanto pra lê-los de volta
  // (lerCamposGeraisAdmin).
  var CAMPOS_ADMIN = {
    "admin-input-nome": "name",
    "admin-input-entry": "entryValue",
    "admin-input-reentry": "reentryValue",
    "admin-input-addon": "addonValue",
    "admin-input-preco": "actionPrice",
    "admin-input-dealer": "dealerShare",
  };

  function renderizarFormAdmin(estado, forcar) {
    // Preenche o formulário editável do Admin a partir do snapshot. "forcar"
    // (true só depois que o PRÓPRIO Admin acabou de salvar algo) ignora a
    // checagem de foco abaixo — nos outros casos, um campo que o usuário está
    // digitando agora não é sobrescrito por uma atualização chegando (via WS)
    // de outro dispositivo.
    mostrarPainelAdmin("admin-detalhe-editar");
    document.getElementById("admin-detalhe-titulo").textContent = estado.tournament.name || tr("admin_torneio_titulo_padrao");

    Object.keys(CAMPOS_ADMIN).forEach(function (idCampo) {
      var input = document.getElementById(idCampo);
      if (!input || (!forcar && document.activeElement === input)) return; // não sobrescreve o que o usuário está digitando
      var valor = estado.tournament[CAMPOS_ADMIN[idCampo]];
      input.value = valor === undefined || valor === null ? "" : valor;
    });

    var selo = document.getElementById("admin-selo-configurado");
    selo.textContent = estado.tournament.configured ? tr("admin_salvo") : tr("admin_nao_salvo");
    selo.className = "selo-conexao " + (estado.tournament.configured ? "online" : "offline");

    renderizarFichasAdmin(estado.tournament.chips, forcar);
    renderizarNiveisAdmin(estado.tournament.levels, forcar);
  }

  function renderizarRelatorioAdmin(rel) {
    // Desenha o relatório read-only de um torneio já finalizado: tabela de
    // participantes, totais financeiros e a linha do tempo completa de
    // eventos (histórico de entradas, rebuys, eliminações...). "rel" vem de
    // GET /api/tournaments/{id} (não é o mesmo formato do snapshot normal).
    mostrarPainelAdmin("admin-detalhe-relatorio");
    var caixa = document.getElementById("admin-detalhe-relatorio");
    caixa.textContent = "";
    caixa.appendChild(el("h3", null, rel.name));
    caixa.appendChild(el("p", "rotulo", tr("relatorio_finalizado_em", { data: rel.finishedAt ? new Date(rel.finishedAt).toLocaleString(I18N.localeAtual()) : "—" })));
    caixa.appendChild(el("p", null, tr("relatorio_premio_dealer", { premio: fmtMoeda(rel.totals.prizePool), dealer: fmtMoeda(rel.totals.dealerTotal) })));

    var tabela = el("table", "lista");
    var thead = el("thead");
    var linhaCabecalho = el("tr");
    [tr("coluna_jogador"), tr("coluna_rebuys"), tr("coluna_addon"), tr("relatorio_coluna_devido"), tr("relatorio_coluna_pago"), tr("relatorio_coluna_falta"), tr("relatorio_coluna_eliminado")]
      .forEach(function (titulo) { linhaCabecalho.appendChild(el("th", null, titulo)); });
    thead.appendChild(linhaCabecalho);
    tabela.appendChild(thead);
    var tbody = el("tbody");
    rel.participants.forEach(function (p) {
      var linha = el("tr");
      linha.appendChild(el("td", null, p.name));
      linha.appendChild(el("td", null, String(p.rebuys)));
      linha.appendChild(el("td", null, p.addon ? tr("relatorio_sim") : tr("relatorio_nao")));
      linha.appendChild(el("td", null, fmtMoeda(p.owed)));
      linha.appendChild(el("td", null, fmtMoeda(p.paidAmount)));
      linha.appendChild(el("td", null, fmtMoeda(p.pendingAmount)));
      linha.appendChild(el("td", null, p.eliminated ? tr("relatorio_sim") : tr("relatorio_nao")));
      tbody.appendChild(linha);
    });
    tabela.appendChild(tbody);
    caixa.appendChild(tabela);

    caixa.appendChild(el("h3", null, tr("relatorio_linha_do_tempo")));
    if (!rel.events || !rel.events.length) {
      caixa.appendChild(el("p", "rotulo", tr("relatorio_sem_eventos")));
    } else {
      var listaEventos = el("ul", "tags");
      listaEventos.style.flexDirection = "column";
      listaEventos.style.alignItems = "flex-start";
      listaEventos.style.gap = "6px";
      rel.events.forEach(function (ev) {
        var hora = new Date(ev.createdAt).toLocaleString(I18N.localeAtual());
        listaEventos.appendChild(el("li", null, hora + " — " + fmtEvento(ev)));
      });
      caixa.appendChild(listaEventos);
    }

    var botaoExcluir = el("button", "botao perigo", tr("admin_excluir_torneio"));
    botaoExcluir.type = "button";
    botaoExcluir.style.marginTop = "20px";
    botaoExcluir.addEventListener("click", function () { excluirTorneioComConfirmacao(rel.id, rel.name); });
    caixa.appendChild(botaoExcluir);
  }

  // Modelos/cores de ficha disponíveis (fotos em static/img/fichas/{modelo}/{cor}.png).
  // Nome do modelo e de cada cor são escolhidos por quem sobe o arquivo (tela
  // Configuração) — "modelo"/"cor" aqui são os slugs (ids), "label" é o nome exibido.
  // Carregado do servidor; valor (dinheiro) e aparência (modelo+cor) são independentes.
  var modelosFichaDisponiveis = [];

  function carregarModelosFicha() {
    // Busca a lista atualizada de modelos/cores (GET /api/chip-models) e
    // guarda em modelosFichaDisponiveis, pra popular os <select> das fichas
    // cadastradas no Admin. Devolve a Promise pra quem chamar poder
    // encadear mais alguma coisa depois (ex: re-renderizar a lista de fichas).
    return fetch("/api/chip-models")
      .then(function (r) { return r.json(); })
      .then(function (lista) { modelosFichaDisponiveis = lista; return lista; });
  }

  function coresDoModelo(modelo) {
    // Devolve a lista de cores (objetos {id, label}) de um modelo específico,
    // a partir do que já foi carregado em modelosFichaDisponiveis — usado pra
    // popular o <select> de cor depois que um modelo é escolhido.
    var achado = modelosFichaDisponiveis.filter(function (m) { return m.model === modelo; })[0];
    return achado ? achado.colors : [];
  }

  function caminhoImagemFicha(modelo, cor) {
    // Monta o caminho da foto de uma ficha a partir do slug do modelo e da
    // cor — precisa bater exatamente com o que o backend grava em disco
    // (static/img/fichas/{modelo}/{cor}.png).
    return "img/fichas/" + modelo + "/" + cor + ".png";
  }

  function construirLinhaFicha(indice) {
    // Monta UMA vez a linha editável de uma posição da lista de fichas
    // cadastradas (preview da imagem + campo de valor + select de modelo +
    // select de cor + botão de remover), já com os listeners amarrados ao
    // índice "indice" daquela posição na lista. Quem atualiza o CONTEÚDO
    // dessa linha depois (toda vez que o estado mudar) é renderizarFichasAdmin.
    var linha = el("div", "linha-ficha");

    var preview = document.createElement("img");
    preview.className = "ficha-preview-admin";
    linha.appendChild(preview);

    var input = el("input");
    input.type = "text";
    input.placeholder = tr("admin_ficha_valor_placeholder");
    linha.appendChild(input);

    var selectModelo = document.createElement("select");
    var selectCor = document.createElement("select");
    linha.appendChild(selectModelo);
    linha.appendChild(selectCor);

    var botaoRemover = el("button", "botao perigo", "x");
    botaoRemover.type = "button";
    botaoRemover.title = tr("admin_ficha_remover_titulo");
    botaoRemover.addEventListener("click", function () {
      var novasFichas = adminEstado.tournament.chips.filter(function (_, idx) { return idx !== indice; });
      salvarFichasAdmin(novasFichas);
    });
    linha.appendChild(botaoRemover);

    function salvarEstaLinha() {
      // Lê os valores atuais dos campos dessa linha (valor/modelo/cor) e
      // manda o array de fichas inteiro de volta pro servidor (ver
      // salvarFichasAdmin) — só a posição "indice" muda, as outras ficam
      // como estavam.
      var novasFichas = adminEstado.tournament.chips.map(function (f, idx) {
        return idx === indice
          ? { value: parseNumeroAbreviado(input.value), model: selectModelo.value, color: selectCor.value }
          : f;
      });
      salvarFichasAdmin(novasFichas);
    }
    input.addEventListener("change", salvarEstaLinha);
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") input.blur(); });
    selectModelo.addEventListener("change", salvarEstaLinha);
    selectCor.addEventListener("change", salvarEstaLinha);

    return linha;
  }

  function renderizarFichasAdmin(chips, forcar) {
    // Sincroniza a lista de linhas de ficha com o array "chips" do snapshot:
    // adiciona/remove linhas DOM até bater em quantidade (construirLinhaFicha
    // só é chamada pras linhas que ainda não existem) e depois atualiza o
    // conteúdo (valor/modelo/cor) de cada uma a partir dos dados atuais.
    var lista = document.getElementById("admin-lista-fichas");
    if (!lista) return;
    if (!forcar && document.activeElement && lista.contains(document.activeElement)) return; // evita piscar enquanto edita

    while (lista.children.length > chips.length) lista.removeChild(lista.lastChild);
    while (lista.children.length < chips.length) lista.appendChild(construirLinhaFicha(lista.children.length));

    chips.forEach(function (ficha, indice) {
      var linha = lista.children[indice];
      if (!linha) return;
      linha.querySelector("input").value = ficha.value;

      var selects = linha.querySelectorAll("select");
      var selectModelo = selects[0], selectCor = selects[1];

      selectModelo.textContent = "";
      modelosFichaDisponiveis.forEach(function (m) {
        var opt = document.createElement("option");
        opt.value = m.model;
        opt.textContent = m.label;
        selectModelo.appendChild(opt);
      });
      selectModelo.value = ficha.model;

      selectCor.textContent = "";
      coresDoModelo(selectModelo.value).forEach(function (cor) {
        var opt = document.createElement("option");
        opt.value = cor.id;
        opt.textContent = cor.label;
        selectCor.appendChild(opt);
      });
      selectCor.value = ficha.color;

      linha.querySelector("img").src = caminhoImagemFicha(ficha.model, ficha.color);
    });
  }

  function salvarFichasAdmin(novasFichas) {
    // Atalho: manda o array de fichas inteiro pro endpoint genérico de
    // edição do Admin (PATCH /api/admin).
    salvarAdmin({ chips: novasFichas });
  }

  function renderizarNiveisAdmin(levels, forcar) {
    // Desenha a tabela de estrutura de níveis do Admin — uma linha <tr> por
    // nível, reconstruída do zero a cada chamada (diferente da lista de
    // fichas, que reaproveita as linhas DOM). "forcar" tem o mesmo papel de
    // renderizarFormAdmin: ignora a checagem de foco quando é o próprio
    // Admin que acabou de salvar algo.
    var tbody = document.getElementById("admin-lista-niveis");
    if (!forcar && document.activeElement && tbody.contains(document.activeElement)) return; // evita piscar enquanto edita
    tbody.textContent = "";
    levels.forEach(function (nivel, i) {
      var linhaNivel = document.createElement("tr");

      function campoNumero(chave, rotulo, valor) {
        // Monta uma célula <td> com um input de texto pra um campo numérico
        // do nível (SB, BB, ante ou tempo). "chave" é o nome do campo no
        // objeto do nível; "rotulo" é o nome traduzido, usado só na pergunta
        // de "aplicar aos próximos níveis também?" quando o valor muda.
        var td = el("td");
        var input = el("input");
        input.type = "text";
        input.value = valor;
        input.title = tr("admin_nivel_titulo_abreviacao");
        // Só salva ao sair do campo (change), não a cada tecla — assim dá pra digitar
        // números com mais de um dígito sem disparar a confirmação antes de terminar.
        input.addEventListener("change", function () {
          var novoValor = parseNumeroAbreviado(input.value);
          var haProximos = i < adminEstado.tournament.levels.length - 1;
          var aplicarProximos = haProximos && confirm(tr("admin_nivel_confirmar_propagar", { campo: rotulo, valor: novoValor }));
          salvarNiveisAdmin(mutarNivelAdmin(i, chave, novoValor, aplicarProximos));
        });
        input.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") input.blur();
        });
        td.appendChild(input);
        return td;
      }

      linhaNivel.appendChild(el("td", null, String(i + 1)));
      linhaNivel.appendChild(campoNumero("sb", tr("coluna_sb"), nivel.sb));
      linhaNivel.appendChild(campoNumero("bb", tr("coluna_bb"), nivel.bb));
      linhaNivel.appendChild(campoNumero("ante", tr("coluna_ante"), nivel.ante || 0));
      linhaNivel.appendChild(campoNumero("minutes", tr("coluna_tempo"), nivel.minutes));

      var tdPausa = el("td");
      var checkPausa = el("input");
      checkPausa.type = "checkbox";
      checkPausa.checked = !!nivel.isBreak;
      checkPausa.addEventListener("change", function () {
        salvarNiveisAdmin(mutarNivelAdmin(i, "isBreak", checkPausa.checked));
      });
      tdPausa.appendChild(checkPausa);
      linhaNivel.appendChild(tdPausa);

      var tdFechaEntradas = el("td");
      var checkFechaEntradas = el("input");
      checkFechaEntradas.type = "checkbox";
      checkFechaEntradas.checked = !!nivel.closesEntries;
      checkFechaEntradas.title = tr("admin_nivel_fecha_entradas_titulo");
      checkFechaEntradas.addEventListener("change", function () {
        salvarNiveisAdmin(mutarNivelAdmin(i, "closesEntries", checkFechaEntradas.checked));
      });
      tdFechaEntradas.appendChild(checkFechaEntradas);
      linhaNivel.appendChild(tdFechaEntradas);

      var tdRemover = el("td");
      var botaoRemover = el("button", "botao perigo", "x");
      botaoRemover.type = "button";
      botaoRemover.addEventListener("click", function () {
        var novosNiveis = adminEstado.tournament.levels.filter(function (_, idx) { return idx !== i; });
        salvarNiveisAdmin(novosNiveis);
      });
      tdRemover.appendChild(botaoRemover);
      linhaNivel.appendChild(tdRemover);

      tbody.appendChild(linhaNivel);
    });
  }

  function mutarNivelAdmin(indice, chave, valor, aplicarProximos) {
    // Devolve uma CÓPIA do array de níveis com o campo "chave" alterado pra
    // "valor" — só no nível "indice", ou nele e em todos os seguintes se
    // aplicarProximos for true (o "aplicar aos próximos níveis também?" da
    // pergunta de confirmação). Nunca modifica o array original na mão —
    // sempre monta uma lista nova, que depois é mandada inteira pro servidor.
    return adminEstado.tournament.levels.map(function (n, idx) {
      if (idx !== indice && !(aplicarProximos && idx > indice)) return n;
      var copia = Object.assign({}, n);
      copia[chave] = valor;
      return copia;
    });
  }

  function salvarAdmin(corpoParcial) {
    // Função central de gravação do Admin: todo "salvarXAdmin" (fichas,
    // níveis, campos gerais) passa por aqui. Sempre inclui o id do torneio
    // sendo editado (adminTorneioId) no corpo, já que o Admin pode estar
    // editando um rascunho diferente do torneio ao vivo.
    var corpo = Object.assign({ tournamentId: adminTorneioId }, corpoParcial);
    return fetch("/api/admin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    })
      .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
      .then(function (novo) {
        adminEstado = novo;
        renderizarFormAdmin(novo, true); // força a atualização mesmo com o campo recém-editado ainda em foco
        atualizarListaAdmin();
        return novo;
      })
      .catch(function () { Api.avisar(tr("admin_erro_salvar")); });
  }

  function salvarNiveisAdmin(novosNiveis) {
    // Atalho: manda o array de níveis inteiro pra salvarAdmin.
    salvarAdmin({ levels: novosNiveis });
  }

  function lerCamposGeraisAdmin() {
    // Lê os valores atuais dos campos do formulário geral (nome, fichas,
    // preços) e devolve no formato esperado pelo corpo de PATCH /api/admin —
    // usado só quando o botão "Salvar" é clicado (os outros campos do Admin,
    // como fichas/níveis, salvam sozinhos ao perder o foco).
    return {
      name: document.getElementById("admin-input-nome").value,
      entryValue: parseNumeroAbreviado(document.getElementById("admin-input-entry").value),
      reentryValue: parseNumeroAbreviado(document.getElementById("admin-input-reentry").value),
      addonValue: parseNumeroAbreviado(document.getElementById("admin-input-addon").value),
      actionPrice: parseNumeroAbreviado(document.getElementById("admin-input-preco").value),
      dealerShare: parseNumeroAbreviado(document.getElementById("admin-input-dealer").value),
    };
  }

  function wireAdminPainel() {
    // Liga todos os botões fixos do Admin (os que já existem no HTML, ao
    // contrário dos botões de ficha/nível/modelo, que são criados
    // dinamicamente e têm os listeners ligados no próprio "construir...").
    document.getElementById("admin-botao-novo-torneio").addEventListener("click", function () {
      var nome = prompt(tr("admin_novo_torneio_prompt"), "Home Game");
      if (!nome) return;
      fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome }),
      })
        .then(function (r) { return r.json(); })
        .then(function (novo) {
          adminEstado = novo;
          atualizarListaAdmin();
          selecionarAdminTorneio(novo.tournament.id, novo.tournament.status);
        });
    });

    document.getElementById("admin-botao-salvar").addEventListener("click", function () {
      var corpo = lerCamposGeraisAdmin();
      corpo.configured = true;
      salvarAdmin(corpo);
    });

    document.getElementById("admin-botao-add-nivel").addEventListener("click", function () {
      var novosNiveis = adminEstado.tournament.levels.concat([{ sb: 0, bb: 0, ante: 0, minutes: 10, isBreak: false }]);
      salvarNiveisAdmin(novosNiveis);
    });

    document.getElementById("admin-botao-add-ficha").addEventListener("click", function () {
      var primeiroModelo = modelosFichaDisponiveis[0];
      var primeiraCor = primeiroModelo && primeiroModelo.colors[0];
      var novasFichas = adminEstado.tournament.chips.concat([{
        value: 0,
        model: primeiroModelo ? primeiroModelo.model : "",
        color: primeiraCor ? primeiraCor.id : "",
      }]);
      salvarFichasAdmin(novasFichas);
    });

    document.getElementById("admin-botao-excluir-torneio").addEventListener("click", function () {
      excluirTorneioComConfirmacao(adminTorneioId, adminEstado.tournament.name);
    });
  }

  // ---------------------------------------------------------- configuração --
  // Logo e modelos de ficha são globais (não por torneio) — moram direto em
  // static/img, então "salvar" aqui é só mandar o arquivo pro servidor.

  // Mini formulário "nome da cor + foto" pra acrescentar uma cor a um modelo que
  // já existe (sem precisar recriar o modelo do zero).
  function construirFormAddCorModelo(slugModelo) {
    var form = el("div", "linha-ficha");

    var nome = el("input");
    nome.type = "text";
    nome.placeholder = tr("config_nome_nova_cor_placeholder");
    form.appendChild(nome);

    var arquivo = document.createElement("input");
    arquivo.type = "file";
    arquivo.accept = "image/*";
    arquivo.title = tr("config_foto_unica_ficha_titulo");
    form.appendChild(arquivo);

    var botao = el("button", "botao", tr("config_adicionar_cor"));
    botao.type = "button";
    botao.addEventListener("click", function () {
      var nomeCor = nome.value.trim();
      var arquivoCor = arquivo.files[0];
      if (!nomeCor || !arquivoCor) { Api.avisar(tr("config_erro_preencher_cor")); return; }
      var corpo = new FormData();
      corpo.append("nome", nomeCor);
      corpo.append("arquivo", arquivoCor);
      fetch("/api/config/chip-model/" + encodeURIComponent(slugModelo) + "/colors", { method: "POST", body: corpo })
        .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
        .then(function () {
          carregarModelosFicha().then(renderizarModelosConfig);
          Api.avisar(tr("config_cor_adicionada", { nome: nomeCor }));
        })
        .catch(function () { Api.avisar(tr("config_erro_adicionar_cor")); });
    });
    form.appendChild(botao);

    return form;
  }

  function renderizarModelosConfig(lista) {
    // Desenha, na tela Configuração, a galeria de modelos já cadastrados:
    // nome do modelo, miniatura de cada cor (com botão de remover) e o
    // mini-formulário de "+ Adicionar cor" pra esse modelo (construído por
    // construirFormAddCorModelo). Reconstrói tudo do zero a cada chamada.
    var container = document.getElementById("config-lista-modelos");
    if (!container) return;
    container.textContent = "";
    if (!lista.length) {
      container.appendChild(el("p", "rotulo", tr("config_modelos_nenhum")));
      return;
    }
    lista.forEach(function (m) {
      var bloco = el("div", "bloco-modelo-config");

      var cabecalho = el("div", "linha-ficha");
      cabecalho.appendChild(el("span", null, m.label + ":"));
      var botaoRemoverModelo = el("button", "botao perigo", tr("config_remover_modelo"));
      botaoRemoverModelo.type = "button";
      botaoRemoverModelo.style.marginLeft = "auto";
      botaoRemoverModelo.addEventListener("click", function () {
        if (!confirm(tr("config_confirmar_remover_modelo", { nome: m.label }))) return;
        fetch("/api/config/chip-model/" + encodeURIComponent(m.model), { method: "DELETE" })
          .then(function (r) { if (!r.ok) throw new Error("falha"); })
          .then(function () { carregarModelosFicha().then(renderizarModelosConfig); })
          .catch(function () { Api.avisar(tr("config_erro_remover_modelo")); });
      });
      cabecalho.appendChild(botaoRemoverModelo);
      bloco.appendChild(cabecalho);

      var linhaCores = el("div", "linha-ficha");
      m.colors.forEach(function (cor) {
        var item = el("div", "ficha-item-config");

        var img = document.createElement("img");
        img.className = "ficha-preview-admin";
        img.src = caminhoImagemFicha(m.model, cor.id);
        img.title = cor.label;
        item.appendChild(img);

        var botaoRemoverCor = el("button", "botao perigo", "x");
        botaoRemoverCor.type = "button";
        botaoRemoverCor.title = tr("config_remover_cor_titulo", { nome: cor.label });
        botaoRemoverCor.addEventListener("click", function () {
          if (!confirm(tr("config_confirmar_remover_cor", { cor: cor.label, modelo: m.label }))) return;
          fetch("/api/config/chip-model/" + encodeURIComponent(m.model) + "/colors/" + encodeURIComponent(cor.id), { method: "DELETE" })
            .then(function (r) { if (!r.ok) throw new Error("falha"); })
            .then(function () { carregarModelosFicha().then(renderizarModelosConfig); })
            .catch(function () { Api.avisar(tr("config_erro_remover_cor")); });
        });
        item.appendChild(botaoRemoverCor);

        linhaCores.appendChild(item);
      });
      bloco.appendChild(linhaCores);
      bloco.appendChild(construirFormAddCorModelo(m.model));
      container.appendChild(bloco);
    });
  }

  function entrarConfiguracao() {
    // Chamado toda vez que se navega pra tela Configuração (ver aplicarRota)
    // — busca a lista de modelos atualizada e desenha a galeria.
    carregarModelosFicha().then(renderizarModelosConfig);
  }

  // Linha avulsa de "nome da cor + foto" no formulário de novo modelo — não tem
  // estado próprio sincronizado com o servidor, só existe até o clique em Salvar.
  function criarLinhaCorNova() {
    var linha = el("div", "linha-ficha");

    var nome = el("input");
    nome.type = "text";
    nome.placeholder = tr("config_nome_cor_placeholder");
    linha.appendChild(nome);

    var arquivo = document.createElement("input");
    arquivo.type = "file";
    arquivo.accept = "image/*";
    arquivo.title = tr("config_foto_unica_ficha_titulo");
    linha.appendChild(arquivo);

    var botaoRemover = el("button", "botao perigo", "x");
    botaoRemover.type = "button";
    botaoRemover.title = tr("config_remover_cor_nova_titulo");
    botaoRemover.addEventListener("click", function () {
      var lista = document.getElementById("config-cores-lista");
      if (lista.children.length <= 1) return; // precisa sobrar ao menos 1 cor
      linha.remove();
    });
    linha.appendChild(botaoRemover);

    linha._nomeInput = nome;
    linha._arquivoInput = arquivo;
    return linha;
  }

  function wireConfiguracao() {
    // Liga os controles fixos da tela Configuração: upload de logo e o
    // formulário de "Adicionar modelo" (que usa uma lista dinâmica de linhas
    // de cor, criadas via criarLinhaCorNova).
    document.getElementById("config-botao-enviar-logo").addEventListener("click", function () {
      var input = document.getElementById("config-input-logo");
      var arquivo = input.files[0];
      if (!arquivo) { Api.avisar(tr("config_erro_escolher_arquivo")); return; }
      var corpo = new FormData();
      corpo.append("arquivo", arquivo);
      fetch("/api/config/logo", { method: "POST", body: corpo })
        .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
        .then(function () {
          document.getElementById("config-logo-atual").src = "img/lk-logo.png?t=" + Date.now();
          input.value = "";
        })
        .catch(function () { Api.avisar(tr("config_erro_enviar_logo")); });
    });

    var listaCores = document.getElementById("config-cores-lista");
    listaCores.appendChild(criarLinhaCorNova());
    listaCores.appendChild(criarLinhaCorNova());

    document.getElementById("config-botao-add-cor").addEventListener("click", function () {
      listaCores.appendChild(criarLinhaCorNova());
    });

    document.getElementById("config-botao-add-modelo").addEventListener("click", function () {
      var nomeModelo = document.getElementById("config-modelo-nome").value.trim();
      if (!nomeModelo) { Api.avisar(tr("config_erro_nome_modelo")); return; }

      var linhas = Array.prototype.slice.call(listaCores.children);
      var corpo = new FormData();
      corpo.append("nome", nomeModelo);
      var algumaFaltando = false;
      linhas.forEach(function (linha) {
        var nomeCor = linha._nomeInput.value.trim();
        var arquivoCor = linha._arquivoInput.files[0];
        if (!nomeCor || !arquivoCor) { algumaFaltando = true; return; }
        corpo.append("cor_nome", nomeCor);
        corpo.append("cor_arquivo", arquivoCor);
      });
      if (algumaFaltando || !linhas.length) { Api.avisar(tr("config_erro_preencher_cada_cor")); return; }

      fetch("/api/config/chip-model", { method: "POST", body: corpo })
        .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
        .then(function (novo) {
          document.getElementById("config-modelo-nome").value = "";
          listaCores.textContent = "";
          listaCores.appendChild(criarLinhaCorNova());
          listaCores.appendChild(criarLinhaCorNova());
          carregarModelosFicha().then(renderizarModelosConfig);
          Api.avisar(tr("config_modelo_salvo", { nome: novo.label }));
        })
        .catch(function () { Api.avisar(tr("config_erro_salvar_modelo")); });
    });
  }

  // ------------------------------------------------------------- roteador --

  var statusConexaoAtual = "conectando"; // último status recebido de Api.aoAtualizarConexao
  var rotaDesejada = (location.hash.replace("#", "") || "menu"); // a rota que a URL pede (#gerente vira "gerente")

  function aplicarRota() {
    // Mostra a seção (.tela) correspondente à rota atual e esconde as
    // outras — é assim que a "navegação" funciona nesta SPA sem framework
    // nenhum, só hash da URL + display:none/block via CSS. Se a conexão
    // estiver "offline", qualquer rota pedida é ignorada e a tela de "sem
    // conexão" aparece no lugar. Cada tela que precisa buscar dados ao ser
    // aberta (Gerente, Admin, Configuração) tem sua função "entrar..."
    // chamada aqui.
    var alvo = statusConexaoAtual === "offline" ? "offline" : rotaDesejada;
    document.querySelectorAll(".tela").forEach(function (sec) { sec.classList.remove("ativa"); });
    var secao = document.getElementById("tela-" + alvo);
    if (secao) secao.classList.add("ativa");
    else document.getElementById("tela-menu").classList.add("ativa");
    if (alvo === "gerente") entrarGerente();
    if (alvo === "admin") entrarAdmin();
    if (alvo === "configuracao") entrarConfiguracao();
    // O alarme sonoro só deve tocar em quem está olhando o relógio (Timer/Gerente) —
    // sem isso, toda aba aberta tocaria junto e fora de sincronia.
    window.ROTA_ATUAL = alvo;
  }

  window.addEventListener("hashchange", function () {
    rotaDesejada = location.hash.replace("#", "") || "menu";
    aplicarRota();
  });

  // ------------------------------------------------------------ renderização --

  function renderizarTotais(containerId, torneio, totais, mostrarDealer) {
    // Desenha a grade de totais (jogadores ativos, prêmio, recebido...) tanto
    // no Gerente quanto no Timer — "mostrarDealer" é a diferença entre as
    // duas chamadas: o valor do dealer só aparece pra quem está gerenciando
    // o dinheiro (Gerente/Admin), nunca na tela aberta pros jogadores (Timer).
    var cont = document.getElementById(containerId);
    if (!cont) return;
    cont.textContent = "";
    var itens = [
      [tr("totais_jogadores_ativos"), totais.activeCount],
      [tr("totais_eliminados"), totais.eliminatedCount],
      [tr("totais_fichas_em_jogo"), fmtNumero(totais.totalChips)],
      [tr("totais_stack_medio"), fmtNumero(totais.avgStack)],
      [tr("totais_premio_acumulado"), fmtMoeda(totais.prizePool)],
      [tr("totais_recebido"), fmtMoeda(totais.collected)],
      [tr("totais_pendente"), fmtMoeda(totais.pending)],
    ];
    if (mostrarDealer) itens.push([tr("totais_parte_dealer"), fmtMoeda(totais.dealerTotal)]);
    itens.forEach(function (par) {
      var caixa = el("div");
      caixa.appendChild(el("div", "valor", String(par[1])));
      caixa.appendChild(el("div", "rotulo", par[0]));
      cont.appendChild(caixa);
    });
  }

  // Previsão de premiação: lista de posições é dinâmica (torneio.payout é um array,
  // uma posição por colocado). As 3 primeiras vêm com padrão 45%/35%/20% do prêmio,
  // as demais com 0% — cada posição é independente e pode ser sobrescrita livremente
  // (inclusive para 0). Os valores ficam salvos no torneio (servidor), pra aparecer
  // sincronizado também no Timer.
  var PREMIO_PADRAO = [0.45, 0.35, 0.20]; // índice 0 = 1º lugar, índice 1 = 2º lugar, etc.

  function percentualPadraoPremio(indice) {
    // Percentual padrão de uma posição (0%, pra 0-indexado, se não houver
    // padrão definido pra ela — ou seja, da 4ª posição em diante).
    return PREMIO_PADRAO[indice] || 0;
  }

  function valorOuVazio(v) {
    // Formata um valor numérico pro campo de premiação: string arredondada se
    // for positivo, ou string vazia se for zero/negativo — campo vazio no
    // input significa "use o percentual padrão" (ver construirLinhaPremio).
    return v > 0 ? String(Math.round(v)) : "";
  }

  function calcularValoresPremio(estado) {
    // Calcula o valor em dinheiro de cada posição premiada: usa o valor
    // sobrescrito manualmente (payout[indice]) se houver, senão aplica o
    // percentual padrão daquela posição sobre o prêmio acumulado atual.
    var pool = estado.totals.prizePool;
    var payout = estado.tournament.payout || [];
    return payout.map(function (override, indice) {
      return (override !== null && override !== undefined) ? override : pool * percentualPadraoPremio(indice);
    });
  }

  // Monta (uma única vez por posição) a linha editável do Gerente, já com os
  // listeners de edição e remoção amarrados ao índice daquela posição.
  function construirLinhaPremio(indice) {
    var label = el("label", "campo");
    label.appendChild(el("span", null, tr("posicao_lugar", { n: I18N.ordinal(indice + 1) })));

    var linha = el("div");
    linha.style.display = "flex";
    linha.style.gap = "4px";

    var input = el("input");
    input.type = "text";
    input.inputMode = "text";
    input.id = "gerente-premio-" + indice;
    linha.appendChild(input);

    var botaoRemover = el("button", "botao perigo", "x");
    botaoRemover.type = "button";
    botaoRemover.id = "gerente-premio-remover-" + indice;
    botaoRemover.title = tr("premiacao_remover_posicao");
    botaoRemover.addEventListener("click", function () {
      var estadoAtual = estadoExibido();
      var payoutAtual = estadoAtual && estadoAtual.tournament.payout;
      if (!payoutAtual || payoutAtual.length <= 1) return;
      var novoPayout = payoutAtual.filter(function (_, idx) { return idx !== indice; });
      executarAcao("/api/admin", "PATCH", { payout: novoPayout }, function (rascunho) {
        rascunho.tournament.payout = novoPayout;
      });
    });
    linha.appendChild(botaoRemover);

    label.appendChild(linha);

    input.addEventListener("change", function () {
      var estadoAtual = estadoExibido();
      if (!estadoAtual) return;
      var texto = input.value.trim();
      var novoPayout = (estadoAtual.tournament.payout || []).slice();
      novoPayout[indice] = texto === "" ? null : parseNumeroAbreviado(texto);
      executarAcao("/api/admin", "PATCH", { payout: novoPayout }, function (rascunho) {
        rascunho.tournament.payout = novoPayout;
      });
    });
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") input.blur(); });

    return label;
  }

  // Painel editável (Gerente) — respeita o modo rascunho como os outros campos do torneio.
  function renderizarPremiacaoGerente(estado) {
    var payout = estado.tournament.payout || [];
    var valores = calcularValoresPremio(estado);
    var total = valores.reduce(function (soma, v) { return soma + v; }, 0);
    var confirmada = !!estado.tournament.payoutConfirmed;

    var lista = document.getElementById("gerente-premio-lista");
    if (lista) {
      while (lista.children.length > payout.length) lista.removeChild(lista.lastChild);
      while (lista.children.length < payout.length) lista.appendChild(construirLinhaPremio(lista.children.length));

      payout.forEach(function (_, indice) {
        var input = document.getElementById("gerente-premio-" + indice);
        if (!input) return;
        input.disabled = confirmada;
        var botaoRemover = document.getElementById("gerente-premio-remover-" + indice);
        if (botaoRemover) botaoRemover.disabled = confirmada || payout.length <= 1;
        if (document.activeElement === input) return;
        input.value = valorOuVazio(valores[indice]);
        input.placeholder = "0";
      });
    }

    var rotuloTotal = document.getElementById("gerente-premio-total");
    if (rotuloTotal) {
      var diferenca = Math.round(estado.totals.prizePool - total);
      var sufixoDiferenca = diferenca !== 0
        ? (diferenca > 0 ? tr("premiacao_falta", { valor: fmtMoeda(diferenca) }) : tr("premiacao_acima", { valor: fmtMoeda(-diferenca) }))
        : tr("premiacao_ok");
      rotuloTotal.textContent = tr("premiacao_total_alocado", { total: fmtMoeda(total), pool: fmtMoeda(estado.totals.prizePool) }) + sufixoDiferenca;
      rotuloTotal.classList.toggle("premio-total-alerta", diferenca !== 0);
    }

    var titulo = document.getElementById("gerente-premio-titulo");
    if (titulo) titulo.textContent = confirmada ? tr("premiacao_titulo_confirmada") : tr("premiacao_titulo_previsao");

    var botaoConfirmar = document.getElementById("gerente-botao-confirmar-premiacao");
    if (botaoConfirmar) {
      botaoConfirmar.textContent = confirmada ? tr("premiacao_destravar") : tr("premiacao_confirmar");
      botaoConfirmar.className = confirmada ? "botao" : "botao primario";
    }

    var botaoAdicionar = document.getElementById("gerente-botao-add-premiado");
    if (botaoAdicionar) botaoAdicionar.disabled = confirmada;
  }

  // Painel só de exibição (Timer) — sempre reflete o torneio ao vivo, sem edição,
  // então pode simplesmente reconstruir as células a cada atualização.
  function renderizarPremiacaoTimer(estado) {
    var valores = calcularValoresPremio(estado);
    var lista = document.getElementById("timer-premio-lista");
    if (lista) {
      lista.textContent = "";
      valores.forEach(function (valor, indice) {
        var caixa = el("div");
        caixa.appendChild(el("div", "valor", fmtMoeda(valor)));
        caixa.appendChild(el("div", "rotulo", tr("posicao_lugar", { n: I18N.ordinal(indice + 1) })));
        lista.appendChild(caixa);
      });
    }
    var titulo = document.getElementById("timer-premio-titulo");
    if (titulo) titulo.textContent = estado.tournament.payoutConfirmed ? tr("premiacao_titulo_timer_confirmada") : tr("premiacao_titulo_previsao");
  }

  function wirePremiacao() {
    // Liga os dois botões fixos da premiação: "+ Adicionar premiado" (acrescenta
    // uma posição null — "use o padrão" — ao fim do array payout) e
    // "Confirmar/Destravar divisão de premiação" (alterna payoutConfirmed).
    var botaoAdicionar = document.getElementById("gerente-botao-add-premiado");
    if (botaoAdicionar) {
      botaoAdicionar.addEventListener("click", function () {
        var estadoAtual = estadoExibido();
        if (!estadoAtual) return;
        var novoPayout = (estadoAtual.tournament.payout || []).slice();
        novoPayout.push(null);
        executarAcao("/api/admin", "PATCH", { payout: novoPayout }, function (rascunho) {
          rascunho.tournament.payout = novoPayout;
        });
      });
    }

    var botaoConfirmar = document.getElementById("gerente-botao-confirmar-premiacao");
    if (botaoConfirmar) {
      botaoConfirmar.addEventListener("click", function () {
        var estado = estadoExibido();
        if (!estado) return;
        var novoValor = !estado.tournament.payoutConfirmed;
        executarAcao("/api/admin", "PATCH", { payoutConfirmed: novoValor }, function (rascunho) {
          rascunho.tournament.payoutConfirmed = novoValor;
        });
      });
    }
  }

  function renderizarGerente(estado) {
    // Desenha a tela Gerente inteira (exceto timer/relógio, que é
    // renderizarRelogio): nome do torneio, totais, premiação, e a tabela de
    // jogadores completa — reconstruída do zero a cada chamada, uma linha
    // <tr> por participante, com os botões de ação certos pra cada status
    // (ativo/eliminado, pagamento pendente/quitado).
    document.getElementById("gerente-nome-torneio").textContent = estado.tournament.name;
    renderizarTotais("gerente-totais", estado.tournament, estado.totals, true);
    renderizarPremiacaoGerente(estado);

    var tbody = document.getElementById("gerente-lista-jogadores");
    tbody.textContent = "";
    estado.participants.forEach(function (p) {
      var linhaJogador = document.createElement("tr");

      var tdNome = el("td", null, p.name);
      linhaJogador.appendChild(tdNome);
      linhaJogador.appendChild(el("td", null, String(p.rebuys)));

      var tdAddon = el("td");
      if (p.addon) {
        tdAddon.appendChild(el("span", "chip ok", tr("jogador_feito")));
      } else if (p.eliminated) {
        // Eliminado não pode fazer add-on — só volta a poder depois de uma reentrada.
        tdAddon.appendChild(el("span", "rotulo", "—"));
      } else {
        var botaoAddon = el("button", "botao", tr("jogador_addon_btn"));
        botaoAddon.type = "button";
        botaoAddon.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id + "/addon", "POST", {}, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.addon = true; alvo.owed += rascunho.tournament.actionPrice; alvo.pendingAmount = Math.max(0, alvo.owed - alvo.paidAmount); }
          });
        });
        tdAddon.appendChild(botaoAddon);
      }
      linhaJogador.appendChild(tdAddon);

      linhaJogador.appendChild(el("td", null, fmtMoeda(p.owed)));
      linhaJogador.appendChild(el("td", null, fmtMoeda(p.paidAmount)));

      var tdPago = el("td");

      if (p.pendingAmount > 0) {
        var inputPago = el("input", "input-pago");
        inputPago.type = "text";
        inputPago.value = "";
        inputPago.placeholder = tr("jogador_pago_placeholder");
        inputPago.title = tr("jogador_pago_titulo");
        function salvarPagamento() {
          // O campo representa um pagamento NOVO (incremento), não o total —
          // soma ao que a pessoa já tinha pago (p.paidAmount) antes de mandar
          // pro servidor, que sempre espera receber o total atualizado.
          var incremento = parseNumeroAbreviado(inputPago.value);
          if (!incremento) return;
          var novoTotal = p.paidAmount + incremento;
          executarAcao("/api/participants/" + p.id, "PATCH", { paidAmount: novoTotal }, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.paidAmount = novoTotal; alvo.pendingAmount = Math.max(0, alvo.owed - novoTotal); }
          });
          inputPago.value = "";
        }
        inputPago.addEventListener("keydown", function (ev) { if (ev.key === "Enter") salvarPagamento(); });
        tdPago.appendChild(inputPago);

        var botaoPagar = el("button", "botao", tr("jogador_pagar_btn"));
        botaoPagar.type = "button";
        botaoPagar.addEventListener("click", salvarPagamento);
        tdPago.appendChild(botaoPagar);

        var botaoPagarTudo = el("button", "botao", tr("jogador_pagar_tudo_btn"));
        botaoPagarTudo.type = "button";
        botaoPagarTudo.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id, "PATCH", { paidAmount: p.owed }, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.paidAmount = p.owed; alvo.pendingAmount = 0; }
          });
        });
        tdPago.appendChild(botaoPagarTudo);
        tdPago.appendChild(el("div", "rotulo", tr("jogador_falta", { valor: fmtMoeda(p.pendingAmount) })));
      } else {
        tdPago.appendChild(el("span", "chip ok", tr("jogador_quitado")));
      }
      linhaJogador.appendChild(tdPago);

      var tdStatus = el("td");
      tdStatus.appendChild(el("span", "chip " + (p.eliminated ? "eliminado" : "ok"), p.eliminated ? tr("jogador_eliminado") : tr("jogador_ativo")));
      linhaJogador.appendChild(tdStatus);

      var tdAcoes = el("td");

      if (p.eliminated) {
        if (estado.tournament.entriesClosed) {
          // Depois do nível marcado como "fecha entradas" no Admin, não é mais possível reentrar.
          tdAcoes.appendChild(el("span", "chip eliminado", tr("jogador_entradas_encerradas")));
        } else {
          // Reentrada: jogador já marcado como eliminado volta pagando de novo (mesmo valor/fichas do rebuy).
          var botaoReentrada = el("button", "botao", tr("jogador_reentrada_btn"));
          botaoReentrada.type = "button";
          botaoReentrada.addEventListener("click", function () {
            executarAcao("/api/participants/" + p.id + "/reentry", "POST", {}, function (rascunho) {
              var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
              if (alvo) { alvo.rebuys += 1; alvo.eliminated = false; alvo.owed += rascunho.tournament.actionPrice; alvo.pendingAmount = Math.max(0, alvo.owed - alvo.paidAmount); }
            });
          });
          tdAcoes.appendChild(botaoReentrada);
        }
        // Enquanto eliminado, só a reentrada fica disponível — sem botão de remover por engano.
      } else {
        // Rebuy: jogador ainda ativo compra fichas de novo sem nunca ter saído da lista de ativos.
        var botaoRebuy = el("button", "botao", tr("jogador_rebuy_btn"));
        botaoRebuy.type = "button";
        botaoRebuy.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id + "/rebuy", "POST", {}, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.rebuys += 1; alvo.owed += rascunho.tournament.actionPrice; alvo.pendingAmount = Math.max(0, alvo.owed - alvo.paidAmount); }
          });
        });
        var botaoElim = el("button", "botao", tr("jogador_eliminar_btn"));
        botaoElim.type = "button";
        botaoElim.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id, "PATCH", { eliminated: true }, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) alvo.eliminated = true;
          });
        });
        tdAcoes.appendChild(botaoRebuy);
        tdAcoes.appendChild(botaoElim);

        var botaoRemover = el("button", "botao perigo", tr("jogador_remover_btn"));
        botaoRemover.type = "button";
        botaoRemover.addEventListener("click", function () {
          if (!confirm(tr("jogador_confirmar_remover", { nome: p.name }))) return;
          executarAcao("/api/participants/" + p.id, "DELETE", null, function (rascunho) {
            rascunho.participants = rascunho.participants.filter(function (x) { return x.id !== p.id; });
          });
        });
        tdAcoes.appendChild(botaoRemover);
      }
      linhaJogador.appendChild(tdAcoes);

      tbody.appendChild(linhaJogador);
    });
  }

  function renderizarTimerEstatico(estado) {
    // Desenha as partes da tela Timer que NÃO são o relógio/blind em si
    // (esses são responsabilidade de window.renderizarRelogio, chamada a
    // cada tick por timer.js) — nome do torneio, totais, fichas e premiação.
    // Chamada só quando o snapshot muda, não a cada tick do relógio.
    document.getElementById("timer-nome-torneio").textContent = estado.tournament.name;
    document.getElementById("timer-prize-pool").textContent = fmtMoeda(estado.totals.prizePool);
    document.getElementById("timer-jogadores-ativos").textContent = String(estado.totals.activeCount);
    document.getElementById("timer-stack-medio").textContent = fmtNumero(estado.totals.avgStack);
    renderizarFichasTimer(estado.tournament.chips);
    renderizarPremiacaoTimer(estado);
  }

  var ultimoChipsRenderizado = null; // versão (JSON) das fichas desenhadas da última vez

  function renderizarFichasTimer(chips) {
    // Desenha a coluna de fotos de ficha na tela Timer. "ultimoChipsRenderizado"
    // guarda uma versão serializada do array anterior — como são sempre as
    // mesmas fotos enquanto ninguém mexe no cadastro, evita refazer esse
    // trabalho em TODO tick do relógio (a cada 250ms), só quando os dados de
    // fato mudaram.
    var chave = JSON.stringify(chips || []);
    if (chave === ultimoChipsRenderizado) return; // são sempre as mesmas fotos, não precisa refazer a cada tick
    ultimoChipsRenderizado = chave;

    var container = document.getElementById("timer-fichas");
    if (!container) return;
    container.textContent = "";
    (chips || []).forEach(function (ficha) {
      var item = el("div", "ficha-item");
      var img = document.createElement("img");
      img.src = caminhoImagemFicha(ficha.model, ficha.color);
      img.alt = fmtNumero(ficha.value);
      img.onerror = function () { img.style.display = "none"; }; // combinação sem foto cadastrada: só o texto
      item.appendChild(img);
      item.appendChild(el("span", null, fmtNumero(ficha.value)));
      container.appendChild(item);
    });
  }

  function renderizarMenu(estado) {
    // A tela de menu praticamente não tem nada dinâmico — só o nome do
    // torneio atual, mostrado embaixo do título.
    document.getElementById("menu-nome-torneio").textContent = tr("menu_torneio_atual", { nome: estado.tournament.name });
  }

  // Exposta em window pra timer.js poder chamar a cada tick (250ms) sem
  // precisar importar nada — desenha o relógio grande, os blinds, o rótulo
  // de nível e os botões de play/pause/navegação do timer (habilitados ou
  // não conforme o torneio exibido é o ao vivo, está configurado, etc.).
  window.renderizarRelogio = function (estado, restante) {
    var torneio = estado.tournament;
    var nivel = torneio.levels[torneio.currentLevelIndex];
    var proximo = torneio.levels[torneio.currentLevelIndex + 1];
    var textoRelogio = fmtMMSS(restante);
    var alerta = restante <= 30;

    ["timer-relogio", "gerente-relogio"].forEach(function (id) {
      var elRelogio = document.getElementById(id);
      if (elRelogio) { elRelogio.textContent = textoRelogio; elRelogio.classList.toggle("alerta", alerta); }
    });
    ["timer-blinds", "gerente-blinds"].forEach(function (id) {
      var elBlind = document.getElementById(id);
      if (elBlind) elBlind.textContent = fmtBlind(nivel);
    });
    var rotulo = tr("nivel_label", { atual: torneio.currentLevelIndex + 1, total: torneio.levels.length });
    ["timer-rotulo-nivel", "gerente-rotulo-nivel"].forEach(function (id) {
      var elRotulo = document.getElementById(id);
      if (elRotulo) elRotulo.textContent = rotulo;
    });
    var elProx = document.getElementById("timer-proximo-nivel");
    if (elProx) elProx.textContent = proximo ? tr("nivel_proximo", { blind: fmtBlind(proximo) }) : tr("nivel_ultimo");

    var emRascunho = emModoRascunho();
    var tituloRascunho = tr("timer_bloqueado_rascunho_titulo");

    ["gerente-botao-playpause"].forEach(function (id) {
      var botao = document.getElementById(id);
      if (!botao) return;
      botao.textContent = torneio.status === "running" ? tr("timer_pausar") : tr("timer_tocar");
      var bloqueado = emRascunho || (!torneio.configured && torneio.status !== "running");
      botao.disabled = bloqueado;
      botao.title = emRascunho ? tituloRascunho : (bloqueado ? tr("timer_bloqueado_nao_configurado_titulo") : "");
    });

    ["gerente-botao-prev", "gerente-botao-next", "gerente-botao-mais1", "gerente-botao-menos1", "gerente-botao-reiniciar"].forEach(function (id) {
      var botao = document.getElementById(id);
      if (!botao) return;
      botao.disabled = emRascunho;
      botao.title = emRascunho ? tituloRascunho : "";
    });
  };

  function renderTudo(estado) {
    // Ouvinte principal, cadastrado em Api.aoAtualizarEstado — chamado toda
    // vez que chega um snapshot novo (por WS, polling, ou logo após
    // qualquer ação otimista). Aplica idioma/tema (que podem ter mudado em
    // outro dispositivo) e redesenha menu, Timer e, se não estiver em modo
    // rascunho, o Gerente.
    aplicarIdioma(estado.language);
    aplicarTemaCor(estado.colorTheme);
    renderizarMenu(estado);
    renderizarTimerEstatico(estado);
    if (!emModoRascunho()) renderizarGerente(estado);
  }

  // ---------------------------------------------------------------- conexão --

  function atualizarSeloConexao(status) {
    // Ouvinte cadastrado em Api.aoAtualizarConexao — atualiza o selinho
    // "online"/"sem conexão"/"conectando…" no menu e força aplicarRota() de
    // novo (que troca pra tela de offline se for o caso).
    statusConexaoAtual = status;
    var selo = document.getElementById("selo-conexao");
    if (selo) {
      selo.className = "selo-conexao " + status;
      selo.textContent = status === "online" ? tr("online") : status === "offline" ? tr("offline") : tr("conectando");
    }
    aplicarRota();
  }

  // ------------------------------------------------------------------- tema --

  function temaEfetivoAtual() {
    // Claro ou escuro, considerando: 1) o que a pessoa escolheu manualmente
    // nesse aparelho (atributo data-theme no <html>, se existir), ou 2) a
    // preferência do sistema operacional (prefers-color-scheme), se não
    // houver escolha manual salva.
    var atual = document.documentElement.getAttribute("data-theme");
    return atual || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  }

  // Bolinha desliza pro lado da lua (escuro) ou do sol (claro) — a classe "escuro"
  // controla a cor do trilho e a posição via CSS.
  function atualizarIconeTema() {
    var botao = document.getElementById("botao-tema");
    if (!botao) return;
    var escuro = temaEfetivoAtual() === "dark";
    botao.classList.toggle("escuro", escuro);
    botao.title = escuro ? tr("tema_escuro_titulo") : tr("tema_claro_titulo");
  }

  function aplicarTemaSalvo() {
    // Chamado uma vez no boot: se essa pessoa já tinha escolhido claro/escuro
    // antes nesse aparelho (salvo no localStorage), aplica de novo agora —
    // senão, fica valendo a preferência do sistema (via temaEfetivoAtual).
    var salvo = null;
    try { salvo = localStorage.getItem("tema"); } catch (e) { /* sem storage */ }
    if (salvo) document.documentElement.setAttribute("data-theme", salvo);
    atualizarIconeTema();
  }

  function alternarTema() {
    // Clique no interruptor sol/lua: inverte claro<->escuro e salva a
    // escolha (só nesse aparelho — isso NÃO é sincronizado entre
    // dispositivos, ao contrário do tema de cor e do idioma).
    var novo = temaEfetivoAtual() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("tema", novo); } catch (e) { /* sem storage */ }
    atualizarIconeTema();
  }

  // --------------------------------------------------------------- tema de cor --
  // Esquema de cores (Nord, Gruvbox...) é global ao sistema — diferente do claro/
  // escuro, que é por aparelho. Sincroniza pelo mesmo snapshot/WS de sempre.

  // "label" é null pro tema "default" — o nome vem de tr("tema_destaque_padrao")
  // no momento de montar a tela, pra acompanhar o idioma. Os outros são nomes
  // próprios de paleta (Nord, Gruvbox...) e não são traduzidos.
  var TEMAS_COR = [
    { id: "default", label: null, bg: "#13152a", destaque: "#8f7bd9" },
    { id: "nord", label: "Nord", bg: "#2e3440", destaque: "#88c0d0" },
    { id: "gruvbox", label: "Gruvbox Dark", bg: "#282828", destaque: "#fe8019" },
    { id: "solarized", label: "Solarized Dark", bg: "#002b36", destaque: "#268bd2" },
    { id: "rose-pine", label: "Rosé Pine", bg: "#191724", destaque: "#c4a7e7" },
    { id: "one-dark", label: "One Dark Pro", bg: "#282c34", destaque: "#61afef" },
  ];

  function renderizarTemasConfig(temaAtual) {
    // Desenha os "cartões" de tema de cor na tela Configuração — um botão
    // por tema, com uma amostra visual (cor de fundo + bolinha de destaque)
    // e marcando o atualmente ativo. Clicar manda a troca pro servidor e já
    // aplica localmente (aplicarTemaCor) sem esperar o broadcast voltar.
    var container = document.getElementById("config-lista-temas");
    if (!container) return;
    container.textContent = "";
    TEMAS_COR.forEach(function (t) {
      var card = el("button", "linha-tema" + (t.id === temaAtual ? " selecionado" : ""));
      card.type = "button";

      var amostra = el("span", "linha-tema-amostra");
      amostra.style.background = t.bg;
      var bolinha = el("span", "linha-tema-bolinha");
      bolinha.style.background = t.destaque;
      amostra.appendChild(bolinha);
      card.appendChild(amostra);
      card.appendChild(el("span", "linha-tema-nome", t.label || tr("tema_destaque_padrao")));

      card.addEventListener("click", function () {
        fetch("/api/config/theme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: t.id }),
        })
          .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
          .then(function () { aplicarTemaCor(t.id); })
          .catch(function () { Api.avisar(tr("config_erro_trocar_tema")); });
      });
      container.appendChild(card);
    });
  }

  function aplicarTemaCor(tema) {
    // Aplica o tema de cor no <html> via atributo data-color-theme (o CSS
    // tem um bloco de variáveis pra cada valor possível desse atributo —
    // ver style.css) e redesenha os cartões da Configuração pra refletir
    // qual está selecionado agora. Chamada tanto pelo clique direto (acima)
    // quanto por renderTudo, toda vez que chega um snapshot novo — assim,
    // se outra pessoa trocar o tema em outro aparelho, aqui também atualiza.
    if (!tema || tema === "default") document.documentElement.removeAttribute("data-color-theme");
    else document.documentElement.setAttribute("data-color-theme", tema);
    renderizarTemasConfig(tema || "default");
  }

  // ----------------------------------------------------------------- idioma --
  // Igual ao tema de cor: global ao sistema, trocado na Configuração, sincronizado
  // por WS. "idioma" aqui é sempre um dos valores de I18N.idiomasValidos.

  var IDIOMAS_UI = [
    { id: "pt-BR", chaveLabel: "config_idioma_pt" },
    { id: "en-US", chaveLabel: "config_idioma_en" },
  ];

  function renderizarIdiomasConfig(idiomaAtual) {
    // Mesma ideia de renderizarTemasConfig, só que pros botões de idioma
    // (sem amostra visual, só o nome do idioma mesmo).
    var container = document.getElementById("config-lista-idiomas");
    if (!container) return;
    container.textContent = "";
    IDIOMAS_UI.forEach(function (opcao) {
      var card = el("button", "linha-tema" + (opcao.id === idiomaAtual ? " selecionado" : ""));
      card.type = "button";
      card.appendChild(el("span", "linha-tema-nome", tr(opcao.chaveLabel)));
      card.addEventListener("click", function () {
        fetch("/api/config/language", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: opcao.id }),
        })
          .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
          .then(function () { aplicarIdioma(opcao.id); })
          .catch(function () { Api.avisar(tr("config_erro_idioma")); });
      });
      container.appendChild(card);
    });
  }

  // Troca o idioma ativo: atualiza o texto fixo da página (via i18n.js) e a
  // lista de idiomas na Configuração. Quem chama de novo com os dados dinâmicos
  // (totais, jogadores, etc.) é o renderTudo, do mesmo jeito que aplicarTemaCor.
  function aplicarIdioma(idioma) {
    I18N.definirIdioma(idioma || "pt-BR");
    renderizarIdiomasConfig(idioma || "pt-BR");
  }

  // --------------------------------------------------------------- wiring --

  function wirePlayPauseButtons() {
    // Liga os botões de controle do timer, todos no Gerente (a tela Timer é
    // só exibição — não tem mais esses botões). play/pause decide qual dos
    // dois endpoints chamar conforme o status atual do torneio.
    document.getElementById("gerente-botao-playpause").addEventListener("click", function () {
      var estado = Api.obterEstado();
      var rodando = estado && estado.tournament.status === "running";
      var url = rodando ? "/api/timer/pause" : "/api/timer/play";
      Api.enviarAcao(url, "POST", {});
    });
    document.getElementById("gerente-botao-next").addEventListener("click", function () { Api.enviarAcao("/api/timer/next", "POST", {}); });
    document.getElementById("gerente-botao-prev").addEventListener("click", function () { Api.enviarAcao("/api/timer/prev", "POST", {}); });
    [["gerente-botao-mais1", 1], ["gerente-botao-menos1", -1]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (botao) botao.addEventListener("click", function () { Api.enviarAcao("/api/timer/adjust", "POST", { deltaMinutes: arr[1] }); });
    });
    var botaoReiniciar = document.getElementById("gerente-botao-reiniciar");
    if (botaoReiniciar) {
      botaoReiniciar.addEventListener("click", function () {
        if (!confirm(tr("gerente_confirmar_reiniciar"))) return;
        Api.enviarAcao("/api/timer/reset", "POST", {});
      });
    }
  }

  function confirmarFinalizacao(url) {
    // Pede confirmação antes de finalizar o torneio (ação irreversível —
    // trava o torneio pra edição) e só então chama o endpoint.
    if (!confirm(tr("gerente_confirmar_finalizar"))) return;
    Api.enviarAcao(url, "POST", {});
  }

  function wireGerenteForm() {
    // Liga o formulário de cadastrar jogador novo, o botão de finalizar
    // torneio e o botão de mudo (áudio do alarme).
    var form = document.getElementById("form-novo-participante");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = document.getElementById("input-novo-participante");
      var nome = input.value.trim();
      if (!nome) return;
      var idTemp = "tmp-" + Date.now();
      executarAcao("/api/participants", "POST", { name: nome }, function (rascunho) {
        rascunho.participants.push({ id: idTemp, name: nome, rebuys: 0, addon: false, paidAmount: 0, pendingAmount: rascunho.tournament.actionPrice, eliminated: false, owed: rascunho.tournament.actionPrice, createdAt: new Date().toISOString() });
      });
      input.value = "";
    });

    document.getElementById("gerente-botao-finalizar-torneio").addEventListener("click", function () {
      confirmarFinalizacao("/api/tournaments/finalizar");
    });

    document.getElementById("gerente-botao-mudo").addEventListener("click", function () {
      var estado = estadoExibido();
      var novoMudo = !estado.tournament.muted;
      executarAcao("/api/admin", "PATCH", { muted: novoMudo }, function (rascunho) { rascunho.tournament.muted = novoMudo; });
    });
  }

  function wireTema() {
    // Liga o clique no interruptor sol/lua (flutuante, visível em toda tela).
    document.getElementById("botao-tema").addEventListener("click", alternarTema);
  }

  // ------------------------------------------------------------------ boot --
  // Tudo abaixo roda uma vez só, assim que o navegador termina de executar
  // este arquivo (não precisa de DOMContentLoaded porque o <script> está no
  // fim do <body>, depois de todo o HTML já ter sido parseado).

  // Navegadores bloqueiam áudio até a pessoa interagir com a página de algum
  // jeito — esse listener "destrava" o áudio no primeiríssimo clique em
  // qualquer lugar da página, e depois se remove (não precisa mais rodar).
  document.addEventListener("click", function destravarUmaVez() {
    Audio30.destravar();
    document.removeEventListener("click", destravarUmaVez);
  });

  aplicarTemaSalvo();       // aplica claro/escuro salvo neste aparelho
  wirePlayPauseButtons();    // liga os botões do timer (Gerente)
  wireGerenteForm();          // liga cadastro de jogador, finalizar, mudo
  wireAdminPainel();           // liga os botões fixos do Admin
  wireTema();                   // liga o interruptor sol/lua
  wirePremiacao();                // liga os botões de premiação
  wireSeletorTorneio();             // liga o botão "Ativar este torneio"
  wireConfiguracao();                 // liga upload de logo e "Adicionar modelo"

  // A partir daqui a página passa a reagir a dados: toda vez que chegar um
  // snapshot novo (WS ou polling) ou o status de conexão mudar, as funções
  // certas são chamadas pra redesenhar a tela.
  Api.aoAtualizarEstado(renderTudo);
  Api.aoAtualizarConexao(atualizarSeloConexao);
  Api.conectarWs();

  TimerEngine.iniciar(); // começa o loop de 250ms do relógio
  aplicarRota();           // mostra a tela certa, conforme o hash (#...) da URL agora
})();
