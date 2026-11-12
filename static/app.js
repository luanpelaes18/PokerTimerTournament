(function () {
  // ---------------------------------------------------------- utilidades --

  function fmtMoeda(valor) {
    return "R$ " + (valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtNumero(valor) {
    return Math.round(valor || 0).toLocaleString("pt-BR");
  }

  function fmtMMSS(segundos) {
    var s = Math.max(0, Math.round(segundos));
    var m = Math.floor(s / 60), r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function fmtBlind(nivel) {
    if (!nivel) return "—";
    if (nivel.isBreak) return "Intervalo";
    var txt = fmtNumero(nivel.sb) + " / " + fmtNumero(nivel.bb);
    if (nivel.ante) txt += " (ante " + fmtNumero(nivel.ante) + ")";
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
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  function lerStorage(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }

  function gravarStorage(chave, valor) {
    try {
      if (valor) localStorage.setItem(chave, valor);
      else localStorage.removeItem(chave);
    } catch (e) { /* sem storage */ }
  }

  var ROTULOS_EVENTO = {
    torneio_criado: "Torneio criado",
    torneio_finalizado: "Torneio finalizado",
    entrada: "Entrada",
    rebuy: "Rebuy",
    addon: "Add-on",
    reentrada: "Reentrada",
    saida: "Saída (eliminado)",
    removido: "Removido",
  };

  function fmtEvento(ev) {
    var rotulo = ROTULOS_EVENTO[ev.type] || ev.type;
    return ev.detail ? (rotulo + ": " + ev.detail) : rotulo;
  }

  // --------------------------------------------------- torneio ao vivo (Gerente) --
  // No Gerente dá pra escolher um torneio salvo diferente do que está "ao vivo"
  // (ex: conferir/ajustar jogadores de um torneio preparado com antecedência).
  // Só o torneio atual (torneioSelecionadoId === null ou igual ao id ao vivo)
  // tem os controles de timer liberados — "só um pode ser tocado".

  var torneioSelecionadoId = null; // null = segue o torneio atual
  var estadoRascunho = null;
  var BOTOES_ATIVAR = ["gerente-botao-ativar"];

  function emModoRascunho() {
    var atual = Api.obterEstado();
    return !!(torneioSelecionadoId && (!atual || torneioSelecionadoId !== atual.tournament.id));
  }

  function estadoExibido() {
    return emModoRascunho() ? estadoRascunho : Api.obterEstado();
  }

  function executarAcao(url, metodo, corpo, mutacaoOtimista) {
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
      .catch(function () { Api.avisar("Não foi possível salvar. Tente novamente."); });
  }

  function atualizarBotaoAtivar() {
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
      botaoFinalizar.title = rascunho ? "Selecione o torneio atual para usar este controle" : "";
    }
  }

  function renderizarListaGerente(lista) {
    var container = document.getElementById("gerente-lista-torneios");
    if (!container) return;
    var atual = Api.obterEstado();
    var idAtual = atual ? atual.tournament.id : null;
    var idSelecionado = torneioSelecionadoId || idAtual;
    // Gerente só trabalha com torneios ainda não finalizados — ver histórico é tarefa do Admin.
    var disponiveis = lista.filter(function (t) { return t.status !== "finished"; });

    container.textContent = "";
    if (!disponiveis.length) {
      container.appendChild(el("p", "rotulo", "Nenhum torneio disponível. Cadastre um no Admin."));
      return;
    }
    disponiveis.forEach(function (t) {
      var linha = el("button", "linha-torneio" + (t.id === idSelecionado ? " selecionado" : ""));
      linha.type = "button";
      linha.appendChild(el("span", "nome", t.name + (t.id === idAtual ? " (atual)" : "")));
      linha.appendChild(el("span", "rotulo", t.status));
      linha.addEventListener("click", function () { selecionarTorneio(t.id === idAtual ? null : t.id); });
      container.appendChild(linha);
    });
  }

  function carregarListaTorneios() {
    return fetch("/api/tournaments").then(function (r) { return r.json(); });
  }

  function atualizarListaTorneios() {
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
    BOTOES_ATIVAR.forEach(function (idBotao) {
      var botao = document.getElementById(idBotao);
      if (!botao) return;
      botao.addEventListener("click", function () {
        if (!torneioSelecionadoId) return;
        if (!confirm("Ativar este torneio como o atual? Isso finaliza o torneio que está rodando agora (se ainda não estiver finalizado).")) return;
        fetch("/api/tournaments/" + torneioSelecionadoId + "/ativar", { method: "POST" })
          .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
          .then(function () {
            atualizarListaTorneios();
            selecionarTorneio(null);
          })
          .catch(function () { Api.avisar("Não foi possível ativar este torneio."); });
      });
    });
  }

  // ------------------------------------------------------- Admin: cadastro --
  // Tela separada do torneio "ao vivo": lista à esquerda com todos os torneios
  // (qualquer status), clicar abre o cadastro (editável) ou o relatório
  // (se já finalizado) à direita. Sem WebSocket aqui — é só cadastro.

  var adminTorneioId = null;
  var adminEstado = null;
  var adminRestaurado = false;

  function atualizarListaAdmin() {
    carregarListaTorneios().then(renderizarListaAdminTorneios);
  }

  // Ao entrar no Admin pela primeira vez na sessão, tenta reabrir o torneio
  // que estava selecionado antes de recarregar a página.
  function entrarAdmin() {
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
    var container = document.getElementById("admin-lista-torneios");
    if (!container) return;
    container.textContent = "";
    if (!lista.length) {
      container.appendChild(el("p", "rotulo", "Nenhum torneio cadastrado ainda."));
      return;
    }
    lista.forEach(function (t) {
      var linha = el("button", "linha-torneio" + (t.id === adminTorneioId ? " selecionado" : ""));
      linha.type = "button";
      linha.appendChild(el("span", "nome", t.name + (t.status === "finished" ? " (finalizado)" : "")));
      linha.appendChild(el("span", "rotulo", t.status + " — " + new Date(t.created_at).toLocaleDateString("pt-BR")));
      linha.addEventListener("click", function () { selecionarAdminTorneio(t.id, t.status); });
      container.appendChild(linha);
    });
  }

  function selecionarAdminTorneio(id, status) {
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
    ["admin-detalhe-vazio", "admin-detalhe-editar", "admin-detalhe-relatorio"].forEach(function (id) {
      var painel = document.getElementById(id);
      if (painel) painel.style.display = id === nomePainel ? "block" : "none";
    });
  }

  var CAMPOS_ADMIN = {
    "admin-input-nome": "name",
    "admin-input-entry": "entryValue",
    "admin-input-reentry": "reentryValue",
    "admin-input-addon": "addonValue",
    "admin-input-preco": "actionPrice",
    "admin-input-dealer": "dealerShare",
    "admin-input-fichas": "chipValues",
  };

  function renderizarFormAdmin(estado, forcar) {
    mostrarPainelAdmin("admin-detalhe-editar");
    document.getElementById("admin-detalhe-titulo").textContent = estado.tournament.name || "Torneio";

    Object.keys(CAMPOS_ADMIN).forEach(function (idCampo) {
      var input = document.getElementById(idCampo);
      if (!input || (!forcar && document.activeElement === input)) return; // não sobrescreve o que o usuário está digitando
      var valor = estado.tournament[CAMPOS_ADMIN[idCampo]];
      input.value = valor === undefined || valor === null ? "" : valor;
    });

    var selo = document.getElementById("admin-selo-configurado");
    selo.textContent = estado.tournament.configured ? "salvo ✓" : "não salvo";
    selo.className = "selo-conexao " + (estado.tournament.configured ? "online" : "offline");

    renderizarNiveisAdmin(estado.tournament.levels, forcar);
  }

  function renderizarRelatorioAdmin(rel) {
    mostrarPainelAdmin("admin-detalhe-relatorio");
    var caixa = document.getElementById("admin-detalhe-relatorio");
    caixa.textContent = "";
    caixa.appendChild(el("h3", null, rel.name));
    caixa.appendChild(el("p", "rotulo", "Finalizado em " + (rel.finishedAt ? new Date(rel.finishedAt).toLocaleString("pt-BR") : "—")));
    caixa.appendChild(el("p", null, "Prêmio: " + fmtMoeda(rel.totals.prizePool) + " · Dealer: " + fmtMoeda(rel.totals.dealerTotal)));

    var tabela = el("table", "lista");
    var thead = el("thead");
    var trh = el("tr");
    ["Jogador", "Rebuys", "Add-on", "Pago", "Eliminado"].forEach(function (titulo) { trh.appendChild(el("th", null, titulo)); });
    thead.appendChild(trh);
    tabela.appendChild(thead);
    var tbody = el("tbody");
    rel.participants.forEach(function (p) {
      var tr = el("tr");
      tr.appendChild(el("td", null, p.name));
      tr.appendChild(el("td", null, String(p.rebuys)));
      tr.appendChild(el("td", null, p.addon ? "sim" : "não"));
      tr.appendChild(el("td", null, p.paid ? "sim" : "não"));
      tr.appendChild(el("td", null, p.eliminated ? "sim" : "não"));
      tbody.appendChild(tr);
    });
    tabela.appendChild(tbody);
    caixa.appendChild(tabela);

    caixa.appendChild(el("h3", null, "Linha do tempo"));
    if (!rel.events || !rel.events.length) {
      caixa.appendChild(el("p", "rotulo", "Sem eventos registrados."));
    } else {
      var listaEventos = el("ul", "tags");
      listaEventos.style.flexDirection = "column";
      listaEventos.style.alignItems = "flex-start";
      listaEventos.style.gap = "6px";
      rel.events.forEach(function (ev) {
        var hora = new Date(ev.createdAt).toLocaleString("pt-BR");
        listaEventos.appendChild(el("li", null, hora + " — " + fmtEvento(ev)));
      });
      caixa.appendChild(listaEventos);
    }
  }

  function renderizarNiveisAdmin(levels, forcar) {
    var tbody = document.getElementById("admin-lista-niveis");
    if (!forcar && document.activeElement && tbody.contains(document.activeElement)) return; // evita piscar enquanto edita
    tbody.textContent = "";
    levels.forEach(function (nivel, i) {
      var tr = document.createElement("tr");

      function campoNumero(chave, rotulo, valor) {
        var td = el("td");
        var input = el("input");
        input.type = "text";
        input.value = valor;
        input.title = 'Aceita abreviações: "2k" = 2000. Salva ao sair do campo (clique fora ou Enter).';
        // Só salva ao sair do campo (change), não a cada tecla — assim dá pra digitar
        // números com mais de um dígito sem disparar a confirmação antes de terminar.
        input.addEventListener("change", function () {
          var novoValor = parseNumeroAbreviado(input.value);
          var haProximos = i < adminEstado.tournament.levels.length - 1;
          var aplicarProximos = haProximos && confirm(
            "Aplicar " + rotulo + " = " + novoValor + " também aos próximos níveis?\n\n" +
            "OK = aplica a este e a todos os níveis seguintes.\n" +
            "Cancelar = altera só este nível."
          );
          salvarNiveisAdmin(mutarNivelAdmin(i, chave, novoValor, aplicarProximos));
        });
        input.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") input.blur();
        });
        td.appendChild(input);
        return td;
      }

      tr.appendChild(el("td", null, String(i + 1)));
      tr.appendChild(campoNumero("sb", "SB", nivel.sb));
      tr.appendChild(campoNumero("bb", "BB", nivel.bb));
      tr.appendChild(campoNumero("ante", "Ante", nivel.ante || 0));
      tr.appendChild(campoNumero("minutes", "Tempo", nivel.minutes));

      var tdPausa = el("td");
      var checkPausa = el("input");
      checkPausa.type = "checkbox";
      checkPausa.checked = !!nivel.isBreak;
      checkPausa.addEventListener("change", function () {
        salvarNiveisAdmin(mutarNivelAdmin(i, "isBreak", checkPausa.checked));
      });
      tdPausa.appendChild(checkPausa);
      tr.appendChild(tdPausa);

      var tdFechaEntradas = el("td");
      var checkFechaEntradas = el("input");
      checkFechaEntradas.type = "checkbox";
      checkFechaEntradas.checked = !!nivel.closesEntries;
      checkFechaEntradas.title = "A partir deste nível, não é mais possível fazer reentrada";
      checkFechaEntradas.addEventListener("change", function () {
        salvarNiveisAdmin(mutarNivelAdmin(i, "closesEntries", checkFechaEntradas.checked));
      });
      tdFechaEntradas.appendChild(checkFechaEntradas);
      tr.appendChild(tdFechaEntradas);

      var tdRemover = el("td");
      var botaoRemover = el("button", "botao perigo", "x");
      botaoRemover.type = "button";
      botaoRemover.addEventListener("click", function () {
        var novosNiveis = adminEstado.tournament.levels.filter(function (_, idx) { return idx !== i; });
        salvarNiveisAdmin(novosNiveis);
      });
      tdRemover.appendChild(botaoRemover);
      tr.appendChild(tdRemover);

      tbody.appendChild(tr);
    });
  }

  function mutarNivelAdmin(indice, chave, valor, aplicarProximos) {
    return adminEstado.tournament.levels.map(function (n, idx) {
      if (idx !== indice && !(aplicarProximos && idx > indice)) return n;
      var copia = Object.assign({}, n);
      copia[chave] = valor;
      return copia;
    });
  }

  function salvarAdmin(corpoParcial) {
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
      .catch(function () { Api.avisar("Não foi possível salvar. Tente novamente."); });
  }

  function salvarNiveisAdmin(novosNiveis) {
    salvarAdmin({ levels: novosNiveis });
  }

  function lerCamposGeraisAdmin() {
    return {
      name: document.getElementById("admin-input-nome").value,
      entryValue: parseNumeroAbreviado(document.getElementById("admin-input-entry").value),
      reentryValue: parseNumeroAbreviado(document.getElementById("admin-input-reentry").value),
      addonValue: parseNumeroAbreviado(document.getElementById("admin-input-addon").value),
      actionPrice: parseNumeroAbreviado(document.getElementById("admin-input-preco").value),
      dealerShare: parseNumeroAbreviado(document.getElementById("admin-input-dealer").value),
      chipValues: document.getElementById("admin-input-fichas").value,
    };
  }

  function wireAdminPainel() {
    document.getElementById("admin-botao-novo-torneio").addEventListener("click", function () {
      var nome = prompt("Nome do novo torneio:", "Home Game");
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
  }

  // ------------------------------------------------------------- roteador --

  var statusConexaoAtual = "conectando";
  var rotaDesejada = (location.hash.replace("#", "") || "menu");

  function aplicarRota() {
    var alvo = statusConexaoAtual === "offline" ? "offline" : rotaDesejada;
    document.querySelectorAll(".tela").forEach(function (sec) { sec.classList.remove("ativa"); });
    var secao = document.getElementById("tela-" + alvo);
    if (secao) secao.classList.add("ativa");
    else document.getElementById("tela-menu").classList.add("ativa");
    if (alvo === "gerente") entrarGerente();
    if (alvo === "admin") entrarAdmin();
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
    var cont = document.getElementById(containerId);
    if (!cont) return;
    cont.textContent = "";
    var itens = [
      ["Jogadores ativos", totais.activeCount],
      ["Eliminados", totais.eliminatedCount],
      ["Fichas em jogo", fmtNumero(totais.totalChips)],
      ["Stack médio", fmtNumero(totais.avgStack)],
      ["Prêmio acumulado", fmtMoeda(totais.prizePool)],
      ["Recebido", fmtMoeda(totais.collected)],
      ["Pendente", fmtMoeda(totais.pending)],
    ];
    if (mostrarDealer) itens.push(["Parte do dealer", fmtMoeda(totais.dealerTotal)]);
    itens.forEach(function (par) {
      var caixa = el("div");
      caixa.appendChild(el("div", "valor", String(par[1])));
      caixa.appendChild(el("div", "rotulo", par[0]));
      cont.appendChild(caixa);
    });
  }

  function renderizarGerente(estado) {
    document.getElementById("gerente-nome-torneio").textContent = estado.tournament.name;
    renderizarTotais("gerente-totais", estado.tournament, estado.totals, true);

    var tbody = document.getElementById("gerente-lista-jogadores");
    tbody.textContent = "";
    estado.participants.forEach(function (p) {
      var tr = document.createElement("tr");

      var tdNome = el("td", null, p.name);
      tr.appendChild(tdNome);
      tr.appendChild(el("td", null, String(p.rebuys)));

      var tdAddon = el("td");
      if (p.addon) {
        tdAddon.appendChild(el("span", "chip ok", "feito"));
      } else {
        var botaoAddon = el("button", "botao", "Add-on");
        botaoAddon.type = "button";
        botaoAddon.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id + "/addon", "POST", {}, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.addon = true; alvo.owed += rascunho.tournament.actionPrice; }
          });
        });
        tdAddon.appendChild(botaoAddon);
      }
      tr.appendChild(tdAddon);

      tr.appendChild(el("td", null, fmtMoeda(p.owed)));

      var tdPago = el("td");
      var checkPago = el("input");
      checkPago.type = "checkbox";
      checkPago.checked = p.paid;
      checkPago.addEventListener("change", function () {
        var novoValor = checkPago.checked;
        executarAcao("/api/participants/" + p.id, "PATCH", { paid: novoValor }, function (rascunho) {
          var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
          if (alvo) alvo.paid = novoValor;
        });
      });
      tdPago.appendChild(checkPago);
      tr.appendChild(tdPago);

      var tdStatus = el("td");
      tdStatus.appendChild(el("span", "chip " + (p.eliminated ? "eliminado" : "ok"), p.eliminated ? "eliminado" : "ativo"));
      tr.appendChild(tdStatus);

      var tdAcoes = el("td");

      if (p.eliminated) {
        if (estado.tournament.entriesClosed) {
          // Depois do nível marcado como "fecha entradas" no Admin, não é mais possível reentrar.
          tdAcoes.appendChild(el("span", "chip eliminado", "entradas encerradas"));
        } else {
          // Reentrada: jogador já marcado como eliminado volta pagando de novo (mesmo valor/fichas do rebuy).
          var botaoReentrada = el("button", "botao", "Reentrada");
          botaoReentrada.type = "button";
          botaoReentrada.addEventListener("click", function () {
            executarAcao("/api/participants/" + p.id + "/reentry", "POST", {}, function (rascunho) {
              var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
              if (alvo) { alvo.rebuys += 1; alvo.eliminated = false; alvo.owed += rascunho.tournament.actionPrice; }
            });
          });
          tdAcoes.appendChild(botaoReentrada);
        }
        // Enquanto eliminado, só a reentrada fica disponível — sem botão de remover por engano.
      } else {
        // Rebuy: jogador ainda ativo compra fichas de novo sem nunca ter saído da lista de ativos.
        var botaoRebuy = el("button", "botao", "Rebuy");
        botaoRebuy.type = "button";
        botaoRebuy.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id + "/rebuy", "POST", {}, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.rebuys += 1; alvo.owed += rascunho.tournament.actionPrice; }
          });
        });
        var botaoElim = el("button", "botao", "Eliminar");
        botaoElim.type = "button";
        botaoElim.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id, "PATCH", { eliminated: true }, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) alvo.eliminated = true;
          });
        });
        tdAcoes.appendChild(botaoRebuy);
        tdAcoes.appendChild(botaoElim);

        var botaoRemover = el("button", "botao perigo", "Remover");
        botaoRemover.type = "button";
        botaoRemover.addEventListener("click", function () {
          if (!confirm("Remover " + p.name + "?")) return;
          executarAcao("/api/participants/" + p.id, "DELETE", null, function (rascunho) {
            rascunho.participants = rascunho.participants.filter(function (x) { return x.id !== p.id; });
          });
        });
        tdAcoes.appendChild(botaoRemover);
      }
      tr.appendChild(tdAcoes);

      tbody.appendChild(tr);
    });
  }

  function renderizarTimerEstatico(estado) {
    document.getElementById("timer-nome-torneio").textContent = estado.tournament.name;
    document.getElementById("timer-prize-pool").textContent = fmtMoeda(estado.totals.prizePool);
    document.getElementById("timer-jogadores-ativos").textContent = String(estado.totals.activeCount);
    document.getElementById("timer-stack-medio").textContent = fmtNumero(estado.totals.avgStack);
  }

  function renderizarMenu(estado) {
    document.getElementById("menu-nome-torneio").textContent = "Torneio atual: " + estado.tournament.name;
  }

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
    var rotulo = "Nível " + (torneio.currentLevelIndex + 1) + " de " + torneio.levels.length;
    ["timer-rotulo-nivel", "gerente-rotulo-nivel"].forEach(function (id) {
      var elRotulo = document.getElementById(id);
      if (elRotulo) elRotulo.textContent = rotulo;
    });
    var elProx = document.getElementById("timer-proximo-nivel");
    if (elProx) elProx.textContent = proximo ? ("Próximo: " + fmtBlind(proximo)) : "Último nível";

    var emRascunho = emModoRascunho();
    var tituloRascunho = "Selecione o torneio atual (não um rascunho) para controlar o timer";

    ["timer-botao-playpause", "gerente-botao-playpause"].forEach(function (id) {
      var botao = document.getElementById(id);
      if (!botao) return;
      botao.textContent = torneio.status === "running" ? "⏸ Pausar" : "▶ Tocar";
      var bloqueadoRascunho = id.indexOf("gerente-") === 0 && emRascunho;
      var bloqueado = bloqueadoRascunho || (!torneio.configured && torneio.status !== "running");
      botao.disabled = bloqueado;
      botao.title = bloqueadoRascunho ? tituloRascunho : (bloqueado ? "Confirme a configuração do torneio no Admin antes de iniciar" : "");
    });

    ["gerente-botao-prev", "gerente-botao-next", "gerente-botao-mais1", "gerente-botao-menos1"].forEach(function (id) {
      var botao = document.getElementById(id);
      if (!botao) return;
      botao.disabled = emRascunho;
      botao.title = emRascunho ? tituloRascunho : "";
    });
  };

  function renderTudo(estado) {
    renderizarMenu(estado);
    renderizarTimerEstatico(estado);
    if (!emModoRascunho()) renderizarGerente(estado);
  }

  // ---------------------------------------------------------------- conexão --

  function atualizarSeloConexao(status) {
    statusConexaoAtual = status;
    var selo = document.getElementById("selo-conexao");
    if (selo) {
      selo.className = "selo-conexao " + status;
      selo.textContent = status === "online" ? "online" : status === "offline" ? "sem conexão" : "conectando…";
    }
    aplicarRota();
  }

  // ------------------------------------------------------------------- tema --

  function aplicarTemaSalvo() {
    var salvo = null;
    try { salvo = localStorage.getItem("tema"); } catch (e) { /* sem storage */ }
    if (salvo) document.documentElement.setAttribute("data-theme", salvo);
  }

  function alternarTema() {
    var atual = document.documentElement.getAttribute("data-theme");
    var atualEfetivo = atual || (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    var novo = atualEfetivo === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("tema", novo); } catch (e) { /* sem storage */ }
  }

  // --------------------------------------------------------------- wiring --

  function wirePlayPauseButtons() {
    [["timer-botao-playpause"], ["gerente-botao-playpause"]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (!botao) return;
      botao.addEventListener("click", function () {
        var estado = Api.obterEstado();
        var rodando = estado && estado.tournament.status === "running";
        var url = rodando ? "/api/timer/pause" : "/api/timer/play";
        Api.enviarAcao(url, "POST", {});
      });
    });
    [["timer-botao-next"], ["gerente-botao-next"]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (botao) botao.addEventListener("click", function () { Api.enviarAcao("/api/timer/next", "POST", {}); });
    });
    [["timer-botao-prev"], ["gerente-botao-prev"]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (botao) botao.addEventListener("click", function () { Api.enviarAcao("/api/timer/prev", "POST", {}); });
    });
    [["timer-botao-mais1", 1], ["gerente-botao-mais1", 1], ["timer-botao-menos1", -1], ["gerente-botao-menos1", -1]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (botao) botao.addEventListener("click", function () { Api.enviarAcao("/api/timer/adjust", "POST", { deltaMinutes: arr[1] }); });
    });
  }

  function confirmarFinalizacao(url) {
    if (!confirm("Finalizar o torneio atual? Ele vai para o histórico (aba Admin) e os controles de timer/jogadores param de valer até você iniciar um novo.")) return;
    Api.enviarAcao(url, "POST", {});
  }

  function wireGerenteForm() {
    var form = document.getElementById("form-novo-participante");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = document.getElementById("input-novo-participante");
      var nome = input.value.trim();
      if (!nome) return;
      var idTemp = "tmp-" + Date.now();
      executarAcao("/api/participants", "POST", { name: nome }, function (rascunho) {
        rascunho.participants.push({ id: idTemp, name: nome, rebuys: 0, addon: false, paid: false, eliminated: false, owed: rascunho.tournament.actionPrice, createdAt: new Date().toISOString() });
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
    document.getElementById("botao-tema").addEventListener("click", alternarTema);
  }

  function wireBotaoAtivarSom() {
    // Um clique no Admin (outro aparelho) não libera o áudio na tela do Timer (TV) —
    // cada carregamento de página precisa do próprio gesto do usuário, por causa da
    // política de autoplay do navegador. Por isso não fica "lembrado" entre reloads.
    var botao = document.getElementById("timer-botao-ativar-som");
    if (!botao) return;
    botao.addEventListener("click", function () {
      Audio30.destravar();
      botao.style.display = "none";
    });
  }

  // ------------------------------------------------------------------ boot --

  document.addEventListener("click", function destravarUmaVez() {
    Audio30.destravar();
    document.removeEventListener("click", destravarUmaVez);
  });

  aplicarTemaSalvo();
  wirePlayPauseButtons();
  wireGerenteForm();
  wireAdminPainel();
  wireTema();
  wireBotaoAtivarSom();
  wireSeletorTorneio();

  Api.aoAtualizarEstado(renderTudo);
  Api.aoAtualizarConexao(atualizarSeloConexao);
  Api.conectarWs();

  TimerEngine.iniciar();
  aplicarRota();
})();
