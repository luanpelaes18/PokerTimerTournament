(function () {
  // ---------------------------------------------------------- utilidades --

  // Valores em R$ são sempre inteiros neste app (sem centavos).
  function fmtMoeda(valor) {
    return "R$ " + Math.round(valor || 0).toLocaleString("pt-BR");
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
    var container = document.getElementById("admin-lista-torneios");
    if (!container) return;
    var atual = Api.obterEstado();
    var idAtual = atual ? atual.tournament.id : null;
    container.textContent = "";
    if (!lista.length) {
      container.appendChild(el("p", "rotulo", "Nenhum torneio cadastrado ainda."));
      return;
    }
    lista.forEach(function (t) {
      var linha = el("div", "linha-torneio" + (t.id === adminTorneioId ? " selecionado" : ""));
      // "atual" é o torneio ativo agora (o Gerente que ativa/troca) — sem ele não dá
      // pra excluir, então deixar isso visível aqui evita a confusão de "por que não excluiu".
      var sufixo = t.id === idAtual ? " (atual)" : (t.status === "finished" ? " (finalizado)" : "");
      linha.appendChild(el("span", "nome", t.name + sufixo));
      linha.appendChild(el("span", "rotulo", t.status + " — " + new Date(t.created_at).toLocaleDateString("pt-BR")));
      linha.addEventListener("click", function () { selecionarAdminTorneio(t.id, t.status); });
      container.appendChild(linha);
    });
  }

  // Excluir só fica disponível depois de abrir o torneio (editável ou relatório),
  // não na listinha — evita clique acidental em algo que não pode ser desfeito.
  function excluirTorneioComConfirmacao(id, nome) {
    if (!confirm("Excluir o torneio \"" + nome + "\"? Essa ação não pode ser desfeita — apaga jogadores e histórico junto.")) return;
    fetch("/api/tournaments/" + encodeURIComponent(id), { method: "DELETE" })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (erro) { throw new Error(erro.detail || "falha"); });
        adminTorneioId = null;
        gravarStorage("adminTorneioId", null);
        mostrarPainelAdmin("admin-detalhe-vazio");
        atualizarListaAdmin();
      })
      .catch(function (erro) { Api.avisar(erro.message || "Não foi possível excluir o torneio."); });
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

    renderizarFichasAdmin(estado.tournament.chips, forcar);
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
    ["Jogador", "Rebuys", "Add-on", "Devido", "Pago", "Falta", "Eliminado"].forEach(function (titulo) { trh.appendChild(el("th", null, titulo)); });
    thead.appendChild(trh);
    tabela.appendChild(thead);
    var tbody = el("tbody");
    rel.participants.forEach(function (p) {
      var tr = el("tr");
      tr.appendChild(el("td", null, p.name));
      tr.appendChild(el("td", null, String(p.rebuys)));
      tr.appendChild(el("td", null, p.addon ? "sim" : "não"));
      tr.appendChild(el("td", null, fmtMoeda(p.owed)));
      tr.appendChild(el("td", null, fmtMoeda(p.paidAmount)));
      tr.appendChild(el("td", null, fmtMoeda(p.pendingAmount)));
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

    var botaoExcluir = el("button", "botao perigo", "Excluir torneio");
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
    return fetch("/api/chip-models")
      .then(function (r) { return r.json(); })
      .then(function (lista) { modelosFichaDisponiveis = lista; return lista; });
  }

  function coresDoModelo(modelo) {
    var achado = modelosFichaDisponiveis.filter(function (m) { return m.model === modelo; })[0];
    return achado ? achado.colors : [];
  }

  function caminhoImagemFicha(modelo, cor) {
    return "img/fichas/" + modelo + "/" + cor + ".png";
  }

  function construirLinhaFicha(indice) {
    var linha = el("div", "linha-ficha");

    var preview = document.createElement("img");
    preview.className = "ficha-preview-admin";
    linha.appendChild(preview);

    var input = el("input");
    input.type = "text";
    input.placeholder = "ex: 100";
    linha.appendChild(input);

    var selectModelo = document.createElement("select");
    var selectCor = document.createElement("select");
    linha.appendChild(selectModelo);
    linha.appendChild(selectCor);

    var botaoRemover = el("button", "botao perigo", "x");
    botaoRemover.type = "button";
    botaoRemover.title = "Remover esta ficha";
    botaoRemover.addEventListener("click", function () {
      var novasFichas = adminEstado.tournament.chips.filter(function (_, idx) { return idx !== indice; });
      salvarFichasAdmin(novasFichas);
    });
    linha.appendChild(botaoRemover);

    function salvarEstaLinha() {
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
    salvarAdmin({ chips: novasFichas });
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
    nome.placeholder = "Nome da nova cor";
    form.appendChild(nome);

    var arquivo = document.createElement("input");
    arquivo.type = "file";
    arquivo.accept = "image/*";
    arquivo.title = "Foto de uma única ficha — não envie uma foto com várias fichas juntas.";
    form.appendChild(arquivo);

    var botao = el("button", "botao", "+ Adicionar cor");
    botao.type = "button";
    botao.addEventListener("click", function () {
      var nomeCor = nome.value.trim();
      var arquivoCor = arquivo.files[0];
      if (!nomeCor || !arquivoCor) { Api.avisar("Preencha o nome e a foto da cor."); return; }
      var corpo = new FormData();
      corpo.append("nome", nomeCor);
      corpo.append("arquivo", arquivoCor);
      fetch("/api/config/chip-model/" + encodeURIComponent(slugModelo) + "/colors", { method: "POST", body: corpo })
        .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
        .then(function () {
          carregarModelosFicha().then(renderizarModelosConfig);
          Api.avisar("Cor \"" + nomeCor + "\" adicionada.");
        })
        .catch(function () { Api.avisar("Não foi possível adicionar a cor. Tente novamente."); });
    });
    form.appendChild(botao);

    return form;
  }

  function renderizarModelosConfig(lista) {
    var container = document.getElementById("config-lista-modelos");
    if (!container) return;
    container.textContent = "";
    if (!lista.length) {
      container.appendChild(el("p", "rotulo", "Nenhum modelo cadastrado ainda."));
      return;
    }
    lista.forEach(function (m) {
      var bloco = el("div", "bloco-modelo-config");

      var cabecalho = el("div", "linha-ficha");
      cabecalho.appendChild(el("span", null, m.label + ":"));
      var botaoRemoverModelo = el("button", "botao perigo", "Remover modelo");
      botaoRemoverModelo.type = "button";
      botaoRemoverModelo.style.marginLeft = "auto";
      botaoRemoverModelo.addEventListener("click", function () {
        if (!confirm("Remover o modelo \"" + m.label + "\" e todas as suas cores? Essa ação não pode ser desfeita.")) return;
        fetch("/api/config/chip-model/" + encodeURIComponent(m.model), { method: "DELETE" })
          .then(function (r) { if (!r.ok) throw new Error("falha"); })
          .then(function () { carregarModelosFicha().then(renderizarModelosConfig); })
          .catch(function () { Api.avisar("Não foi possível remover o modelo. Tente novamente."); });
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
        botaoRemoverCor.title = "Remover a cor \"" + cor.label + "\"";
        botaoRemoverCor.addEventListener("click", function () {
          if (!confirm("Remover a cor \"" + cor.label + "\" do modelo \"" + m.label + "\"?")) return;
          fetch("/api/config/chip-model/" + encodeURIComponent(m.model) + "/colors/" + encodeURIComponent(cor.id), { method: "DELETE" })
            .then(function (r) { if (!r.ok) throw new Error("falha"); })
            .then(function () { carregarModelosFicha().then(renderizarModelosConfig); })
            .catch(function () { Api.avisar("Não foi possível remover a cor. Tente novamente."); });
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
    carregarModelosFicha().then(renderizarModelosConfig);
  }

  // Linha avulsa de "nome da cor + foto" no formulário de novo modelo — não tem
  // estado próprio sincronizado com o servidor, só existe até o clique em Salvar.
  function criarLinhaCorNova() {
    var linha = el("div", "linha-ficha");

    var nome = el("input");
    nome.type = "text";
    nome.placeholder = "Nome da cor (ex: vermelha)";
    linha.appendChild(nome);

    var arquivo = document.createElement("input");
    arquivo.type = "file";
    arquivo.accept = "image/*";
    arquivo.title = "Foto de uma única ficha — não envie uma foto com várias fichas juntas.";
    linha.appendChild(arquivo);

    var botaoRemover = el("button", "botao perigo", "x");
    botaoRemover.type = "button";
    botaoRemover.title = "Remover esta cor";
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
    document.getElementById("config-botao-enviar-logo").addEventListener("click", function () {
      var input = document.getElementById("config-input-logo");
      var arquivo = input.files[0];
      if (!arquivo) { Api.avisar("Escolha um arquivo antes de enviar."); return; }
      var corpo = new FormData();
      corpo.append("arquivo", arquivo);
      fetch("/api/config/logo", { method: "POST", body: corpo })
        .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
        .then(function () {
          document.getElementById("config-logo-atual").src = "img/lk-logo.png?t=" + Date.now();
          input.value = "";
        })
        .catch(function () { Api.avisar("Não foi possível enviar a logo. Tente novamente."); });
    });

    var listaCores = document.getElementById("config-cores-lista");
    listaCores.appendChild(criarLinhaCorNova());
    listaCores.appendChild(criarLinhaCorNova());

    document.getElementById("config-botao-add-cor").addEventListener("click", function () {
      listaCores.appendChild(criarLinhaCorNova());
    });

    document.getElementById("config-botao-add-modelo").addEventListener("click", function () {
      var nomeModelo = document.getElementById("config-modelo-nome").value.trim();
      if (!nomeModelo) { Api.avisar("Dê um nome ao modelo."); return; }

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
      if (algumaFaltando || !linhas.length) { Api.avisar("Preencha o nome e a foto de cada cor."); return; }

      fetch("/api/config/chip-model", { method: "POST", body: corpo })
        .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
        .then(function (novo) {
          document.getElementById("config-modelo-nome").value = "";
          listaCores.textContent = "";
          listaCores.appendChild(criarLinhaCorNova());
          listaCores.appendChild(criarLinhaCorNova());
          carregarModelosFicha().then(renderizarModelosConfig);
          Api.avisar("Modelo \"" + novo.label + "\" salvo.");
        })
        .catch(function () { Api.avisar("Não foi possível salvar o modelo. Tente novamente."); });
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

  // Previsão de premiação: lista de posições é dinâmica (torneio.payout é um array,
  // uma posição por colocado). As 3 primeiras vêm com padrão 45%/35%/20% do prêmio,
  // as demais com 0% — cada posição é independente e pode ser sobrescrita livremente
  // (inclusive para 0). Os valores ficam salvos no torneio (servidor), pra aparecer
  // sincronizado também no Timer.
  var PREMIO_PADRAO = [0.45, 0.35, 0.20];

  function percentualPadraoPremio(indice) {
    return PREMIO_PADRAO[indice] || 0;
  }

  function valorOuVazio(v) {
    return v > 0 ? String(Math.round(v)) : "";
  }

  function calcularValoresPremio(estado) {
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
    label.appendChild(el("span", null, (indice + 1) + "º lugar"));

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
    botaoRemover.title = "Remover esta posição";
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
      rotuloTotal.textContent = "Total alocado: " + fmtMoeda(total) + " de " + fmtMoeda(estado.totals.prizePool) +
        (diferenca !== 0 ? (diferenca > 0 ? " (falta " + fmtMoeda(diferenca) + ")" : " (" + fmtMoeda(-diferenca) + " acima do prêmio)") : " ✓");
      rotuloTotal.classList.toggle("premio-total-alerta", diferenca !== 0);
    }

    var titulo = document.getElementById("gerente-premio-titulo");
    if (titulo) titulo.textContent = confirmada ? "Premiação (confirmada)" : "Previsão de premiação";

    var botaoConfirmar = document.getElementById("gerente-botao-confirmar-premiacao");
    if (botaoConfirmar) {
      botaoConfirmar.textContent = confirmada ? "🔓 Destravar premiação" : "Confirmar divisão de premiação";
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
        caixa.appendChild(el("div", "rotulo", (indice + 1) + "º lugar"));
        lista.appendChild(caixa);
      });
    }
    var titulo = document.getElementById("timer-premio-titulo");
    if (titulo) titulo.textContent = estado.tournament.payoutConfirmed ? "Premiação" : "Previsão de premiação";
  }

  function wirePremiacao() {
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
    document.getElementById("gerente-nome-torneio").textContent = estado.tournament.name;
    renderizarTotais("gerente-totais", estado.tournament, estado.totals, true);
    renderizarPremiacaoGerente(estado);

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
      } else if (p.eliminated) {
        // Eliminado não pode fazer add-on — só volta a poder depois de uma reentrada.
        tdAddon.appendChild(el("span", "rotulo", "—"));
      } else {
        var botaoAddon = el("button", "botao", "Add-on");
        botaoAddon.type = "button";
        botaoAddon.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id + "/addon", "POST", {}, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.addon = true; alvo.owed += rascunho.tournament.actionPrice; alvo.pendingAmount = Math.max(0, alvo.owed - alvo.paidAmount); }
          });
        });
        tdAddon.appendChild(botaoAddon);
      }
      tr.appendChild(tdAddon);

      tr.appendChild(el("td", null, fmtMoeda(p.owed)));
      tr.appendChild(el("td", null, fmtMoeda(p.paidAmount)));

      var tdPago = el("td");

      if (p.pendingAmount > 0) {
        var inputPago = el("input", "input-pago");
        inputPago.type = "text";
        inputPago.value = "";
        inputPago.placeholder = "novo pag.";
        inputPago.title = "Valor do pagamento que a pessoa está fazendo agora (soma ao que já foi pago) — aceita abreviações (2k = 2000)";
        function salvarPagamento() {
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

        var botaoPagar = el("button", "botao", "Pagar");
        botaoPagar.type = "button";
        botaoPagar.addEventListener("click", salvarPagamento);
        tdPago.appendChild(botaoPagar);

        var botaoPagarTudo = el("button", "botao", "Pagar tudo");
        botaoPagarTudo.type = "button";
        botaoPagarTudo.addEventListener("click", function () {
          executarAcao("/api/participants/" + p.id, "PATCH", { paidAmount: p.owed }, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.paidAmount = p.owed; alvo.pendingAmount = 0; }
          });
        });
        tdPago.appendChild(botaoPagarTudo);
        tdPago.appendChild(el("div", "rotulo", "falta " + fmtMoeda(p.pendingAmount)));
      } else {
        tdPago.appendChild(el("span", "chip ok", "quitado"));
      }
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
              if (alvo) { alvo.rebuys += 1; alvo.eliminated = false; alvo.owed += rascunho.tournament.actionPrice; alvo.pendingAmount = Math.max(0, alvo.owed - alvo.paidAmount); }
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
            if (alvo) { alvo.rebuys += 1; alvo.owed += rascunho.tournament.actionPrice; alvo.pendingAmount = Math.max(0, alvo.owed - alvo.paidAmount); }
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
    renderizarFichasTimer(estado.tournament.chips);
    renderizarPremiacaoTimer(estado);
  }

  var ultimoChipsRenderizado = null;

  function renderizarFichasTimer(chips) {
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
      img.alt = "Ficha " + fmtNumero(ficha.value);
      img.onerror = function () { img.style.display = "none"; }; // combinação sem foto cadastrada: só o texto
      item.appendChild(img);
      item.appendChild(el("span", null, fmtNumero(ficha.value)));
      container.appendChild(item);
    });
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

    ["gerente-botao-playpause"].forEach(function (id) {
      var botao = document.getElementById(id);
      if (!botao) return;
      botao.textContent = torneio.status === "running" ? "⏸ Pausar" : "▶ Tocar";
      var bloqueado = emRascunho || (!torneio.configured && torneio.status !== "running");
      botao.disabled = bloqueado;
      botao.title = emRascunho ? tituloRascunho : (bloqueado ? "Confirme a configuração do torneio no Admin antes de iniciar" : "");
    });

    ["gerente-botao-prev", "gerente-botao-next", "gerente-botao-mais1", "gerente-botao-menos1", "gerente-botao-reiniciar"].forEach(function (id) {
      var botao = document.getElementById(id);
      if (!botao) return;
      botao.disabled = emRascunho;
      botao.title = emRascunho ? tituloRascunho : "";
    });
  };

  function renderTudo(estado) {
    aplicarTemaCor(estado.colorTheme);
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

  function temaEfetivoAtual() {
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
    botao.title = escuro ? "Tema escuro — clique para mudar pro claro" : "Tema claro — clique para mudar pro escuro";
  }

  function aplicarTemaSalvo() {
    var salvo = null;
    try { salvo = localStorage.getItem("tema"); } catch (e) { /* sem storage */ }
    if (salvo) document.documentElement.setAttribute("data-theme", salvo);
    atualizarIconeTema();
  }

  function alternarTema() {
    var novo = temaEfetivoAtual() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("tema", novo); } catch (e) { /* sem storage */ }
    atualizarIconeTema();
  }

  // --------------------------------------------------------------- tema de cor --
  // Esquema de cores (Nord, Gruvbox...) é global ao sistema — diferente do claro/
  // escuro, que é por aparelho. Sincroniza pelo mesmo snapshot/WS de sempre.

  var TEMAS_COR = [
    { id: "default", label: "Padrão (LK)", bg: "#13152a", destaque: "#8f7bd9" },
    { id: "nord", label: "Nord", bg: "#2e3440", destaque: "#88c0d0" },
    { id: "gruvbox", label: "Gruvbox Dark", bg: "#282828", destaque: "#fe8019" },
    { id: "solarized", label: "Solarized Dark", bg: "#002b36", destaque: "#268bd2" },
    { id: "rose-pine", label: "Rosé Pine", bg: "#191724", destaque: "#c4a7e7" },
    { id: "one-dark", label: "One Dark Pro", bg: "#282c34", destaque: "#61afef" },
  ];

  function renderizarTemasConfig(temaAtual) {
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
      card.appendChild(el("span", "linha-tema-nome", t.label));

      card.addEventListener("click", function () {
        fetch("/api/config/theme", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: t.id }),
        })
          .then(function (r) { if (!r.ok) throw new Error("falha"); return r.json(); })
          .then(function () { aplicarTemaCor(t.id); })
          .catch(function () { Api.avisar("Não foi possível trocar o tema. Tente novamente."); });
      });
      container.appendChild(card);
    });
  }

  function aplicarTemaCor(tema) {
    if (!tema || tema === "default") document.documentElement.removeAttribute("data-color-theme");
    else document.documentElement.setAttribute("data-color-theme", tema);
    renderizarTemasConfig(tema || "default");
  }

  // --------------------------------------------------------------- wiring --

  function wirePlayPauseButtons() {
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
        if (!confirm("Reiniciar o timer? Volta para o nível 1 e zera o tempo decorrido do torneio atual.")) return;
        Api.enviarAcao("/api/timer/reset", "POST", {});
      });
    }
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
    document.getElementById("botao-tema").addEventListener("click", alternarTema);
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
  wirePremiacao();
  wireSeletorTorneio();
  wireConfiguracao();

  Api.aoAtualizarEstado(renderTudo);
  Api.aoAtualizarConexao(atualizarSeloConexao);
  Api.conectarWs();

  TimerEngine.iniciar();
  aplicarRota();
})();
