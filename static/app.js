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

  function debounce(fn, ms) {
    var temporizador;
    return function () {
      var args = arguments;
      clearTimeout(temporizador);
      temporizador = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function el(tag, classe, texto) {
    var e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
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
    if (alvo === "historico") carregarHistorico();
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
          Api.enviarAcao("/api/participants/" + p.id + "/addon", "POST", {}, function (rascunho) {
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
        Api.enviarAcao("/api/participants/" + p.id, "PATCH", { paid: novoValor }, function (rascunho) {
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
            Api.enviarAcao("/api/participants/" + p.id + "/reentry", "POST", {}, function (rascunho) {
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
          Api.enviarAcao("/api/participants/" + p.id + "/rebuy", "POST", {}, function (rascunho) {
            var alvo = rascunho.participants.find(function (x) { return x.id === p.id; });
            if (alvo) { alvo.rebuys += 1; alvo.owed += rascunho.tournament.actionPrice; }
          });
        });
        var botaoElim = el("button", "botao", "Eliminar");
        botaoElim.type = "button";
        botaoElim.addEventListener("click", function () {
          Api.enviarAcao("/api/participants/" + p.id, "PATCH", { eliminated: true }, function (rascunho) {
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
          Api.enviarAcao("/api/participants/" + p.id, "DELETE", null, function (rascunho) {
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

  var CAMPOS_ADMIN = {
    "admin-input-nome": "name",
    "admin-input-entry": "entryValue",
    "admin-input-reentry": "reentryValue",
    "admin-input-addon": "addonValue",
    "admin-input-preco": "actionPrice",
    "admin-input-dealer": "dealerShare",
    "admin-input-fichas": "chipValues",
  };

  function renderizarAdmin(estado) {
    renderizarTotais("admin-totais", estado.tournament, estado.totals, true);

    Object.keys(CAMPOS_ADMIN).forEach(function (idCampo) {
      var input = document.getElementById(idCampo);
      if (!input || document.activeElement === input) return; // não sobrescreve o que o usuário está digitando
      var valor = estado.tournament[CAMPOS_ADMIN[idCampo]];
      input.value = valor === undefined || valor === null ? "" : valor;
    });

    var botaoMudo = document.getElementById("admin-botao-mudo");
    botaoMudo.textContent = estado.tournament.muted ? "🔇 Mudo" : "🔈 Som";

    renderizarNiveis(estado.tournament.levels);
  }

  function renderizarNiveis(levels) {
    var tbody = document.getElementById("admin-lista-niveis");
    if (document.activeElement && tbody.contains(document.activeElement)) return; // evita piscar enquanto edita
    tbody.textContent = "";
    levels.forEach(function (nivel, i) {
      var tr = document.createElement("tr");

      function campoNumero(chave, valor) {
        var td = el("td");
        var input = el("input");
        input.type = "text";
        input.value = valor;
        input.title = 'Aceita abreviações: "2k" = 2000';
        input.addEventListener("input", debounce(function () {
          salvarNiveis(mutarNivel(i, chave, parseNumeroAbreviado(input.value)));
        }, 500));
        td.appendChild(input);
        return td;
      }

      tr.appendChild(el("td", null, String(i + 1)));
      tr.appendChild(campoNumero("sb", nivel.sb));
      tr.appendChild(campoNumero("bb", nivel.bb));
      tr.appendChild(campoNumero("ante", nivel.ante || 0));
      tr.appendChild(campoNumero("minutes", nivel.minutes));

      var tdPausa = el("td");
      var checkPausa = el("input");
      checkPausa.type = "checkbox";
      checkPausa.checked = !!nivel.isBreak;
      checkPausa.addEventListener("change", function () {
        salvarNiveis(mutarNivel(i, "isBreak", checkPausa.checked));
      });
      tdPausa.appendChild(checkPausa);
      tr.appendChild(tdPausa);

      var tdFechaEntradas = el("td");
      var checkFechaEntradas = el("input");
      checkFechaEntradas.type = "checkbox";
      checkFechaEntradas.checked = !!nivel.closesEntries;
      checkFechaEntradas.title = "A partir deste nível, não é mais possível fazer reentrada";
      checkFechaEntradas.addEventListener("change", function () {
        salvarNiveis(mutarNivel(i, "closesEntries", checkFechaEntradas.checked));
      });
      tdFechaEntradas.appendChild(checkFechaEntradas);
      tr.appendChild(tdFechaEntradas);

      var tdRemover = el("td");
      var botaoRemover = el("button", "botao perigo", "x");
      botaoRemover.type = "button";
      botaoRemover.addEventListener("click", function () {
        var estado = Api.obterEstado();
        var novosNiveis = estado.tournament.levels.filter(function (_, idx) { return idx !== i; });
        salvarNiveisDireto(novosNiveis);
      });
      tdRemover.appendChild(botaoRemover);
      tr.appendChild(tdRemover);

      tbody.appendChild(tr);
    });
  }

  function mutarNivel(indice, chave, valor) {
    var estado = Api.obterEstado();
    var novosNiveis = estado.tournament.levels.map(function (n, idx) {
      if (idx !== indice) return n;
      var copia = Object.assign({}, n);
      copia[chave] = valor;
      return copia;
    });
    return novosNiveis;
  }

  var salvarNiveisDireto = function (novosNiveis) {
    Api.enviarAcao("/api/admin", "PATCH", { levels: novosNiveis }, function (rascunho) {
      rascunho.tournament.levels = novosNiveis;
    });
  };
  var salvarNiveis = salvarNiveisDireto;

  function renderizarMenu(estado) {
    document.getElementById("menu-nome-torneio").textContent = estado.tournament.name;
  }

  window.renderizarRelogio = function (estado, restante) {
    var torneio = estado.tournament;
    var nivel = torneio.levels[torneio.currentLevelIndex];
    var proximo = torneio.levels[torneio.currentLevelIndex + 1];
    var textoRelogio = fmtMMSS(restante);
    var alerta = restante <= 30;

    ["timer-relogio", "admin-relogio"].forEach(function (id) {
      var elRelogio = document.getElementById(id);
      if (elRelogio) { elRelogio.textContent = textoRelogio; elRelogio.classList.toggle("alerta", alerta); }
    });
    ["timer-blinds", "admin-blinds"].forEach(function (id) {
      var elBlind = document.getElementById(id);
      if (elBlind) elBlind.textContent = fmtBlind(nivel);
    });
    var rotulo = "Nível " + (torneio.currentLevelIndex + 1) + " de " + torneio.levels.length;
    ["timer-rotulo-nivel", "admin-rotulo-nivel"].forEach(function (id) {
      var elRotulo = document.getElementById(id);
      if (elRotulo) elRotulo.textContent = rotulo;
    });
    var elProx = document.getElementById("timer-proximo-nivel");
    if (elProx) elProx.textContent = proximo ? ("Próximo: " + fmtBlind(proximo)) : "Último nível";

    ["timer-botao-playpause", "admin-botao-playpause"].forEach(function (id) {
      var botao = document.getElementById(id);
      if (botao) botao.textContent = torneio.status === "running" ? "⏸ Pausar" : "▶ Tocar";
    });
  };

  function renderTudo(estado) {
    renderizarMenu(estado);
    renderizarGerente(estado);
    renderizarTimerEstatico(estado);
    renderizarAdmin(estado);
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

  // --------------------------------------------------------------- histórico --

  function carregarHistorico() {
    fetch("/api/tournaments")
      .then(function (r) { return r.json(); })
      .then(function (lista) {
        var tbody = document.getElementById("historico-lista");
        tbody.textContent = "";
        lista.forEach(function (t) {
          var tr = document.createElement("tr");
          tr.appendChild(el("td", null, t.name));
          tr.appendChild(el("td", null, t.status));
          tr.appendChild(el("td", null, new Date(t.created_at).toLocaleString("pt-BR")));
          var tdBotao = el("td");
          var botao = el("button", "botao", "Ver relatório");
          botao.type = "button";
          botao.addEventListener("click", function () { mostrarRelatorio(t.id); });
          tdBotao.appendChild(botao);
          tr.appendChild(tdBotao);
          tbody.appendChild(tr);
        });
      });
  }

  function mostrarRelatorio(id) {
    fetch("/api/tournaments/" + id)
      .then(function (r) { return r.json(); })
      .then(function (rel) {
        var caixa = document.getElementById("historico-relatorio");
        caixa.style.display = "block";
        caixa.textContent = "";
        caixa.appendChild(el("h3", null, rel.name));
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
      });
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
    [["timer-botao-playpause"], ["admin-botao-playpause"]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (!botao) return;
      botao.addEventListener("click", function () {
        var estado = Api.obterEstado();
        var rodando = estado && estado.tournament.status === "running";
        var url = rodando ? "/api/timer/pause" : "/api/timer/play";
        Api.enviarAcao(url, "POST", {});
      });
    });
    [["timer-botao-next"], ["admin-botao-next"]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (botao) botao.addEventListener("click", function () { Api.enviarAcao("/api/timer/next", "POST", {}); });
    });
    [["timer-botao-prev"], ["admin-botao-prev"]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (botao) botao.addEventListener("click", function () { Api.enviarAcao("/api/timer/prev", "POST", {}); });
    });
    [["timer-botao-mais1", 1], ["admin-botao-mais1", 1], ["timer-botao-menos1", -1], ["admin-botao-menos1", -1]].forEach(function (arr) {
      var botao = document.getElementById(arr[0]);
      if (botao) botao.addEventListener("click", function () { Api.enviarAcao("/api/timer/adjust", "POST", { deltaMinutes: arr[1] }); });
    });
  }

  function wireGerenteForm() {
    var form = document.getElementById("form-novo-participante");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = document.getElementById("input-novo-participante");
      var nome = input.value.trim();
      if (!nome) return;
      var idTemp = "tmp-" + Date.now();
      Api.enviarAcao("/api/participants", "POST", { name: nome }, function (rascunho) {
        rascunho.participants.push({ id: idTemp, name: nome, rebuys: 0, addon: false, paid: false, eliminated: false, owed: rascunho.tournament.actionPrice, createdAt: new Date().toISOString() });
      });
      input.value = "";
    });
  }

  function wireAdminForm() {
    var salvarGeral = debounce(function () {
      var corpo = {
        name: document.getElementById("admin-input-nome").value,
        entryValue: parseNumeroAbreviado(document.getElementById("admin-input-entry").value),
        reentryValue: parseNumeroAbreviado(document.getElementById("admin-input-reentry").value),
        addonValue: parseNumeroAbreviado(document.getElementById("admin-input-addon").value),
        actionPrice: parseNumeroAbreviado(document.getElementById("admin-input-preco").value),
        dealerShare: parseNumeroAbreviado(document.getElementById("admin-input-dealer").value),
        chipValues: document.getElementById("admin-input-fichas").value,
      };
      Api.enviarAcao("/api/admin", "PATCH", corpo);
    }, 600);

    document.getElementById("form-admin-geral").addEventListener("input", salvarGeral);

    document.getElementById("admin-botao-mudo").addEventListener("click", function () {
      var estado = Api.obterEstado();
      var novoMudo = !estado.tournament.muted;
      Api.enviarAcao("/api/admin", "PATCH", { muted: novoMudo }, function (rascunho) { rascunho.tournament.muted = novoMudo; });
    });

    document.getElementById("admin-botao-add-nivel").addEventListener("click", function () {
      var estado = Api.obterEstado();
      var novosNiveis = estado.tournament.levels.concat([{ sb: 0, bb: 0, ante: 0, minutes: 10, isBreak: false }]);
      salvarNiveisDireto(novosNiveis);
    });

    document.getElementById("admin-botao-novo-torneio").addEventListener("click", function () {
      if (!confirm("Isso finaliza o torneio atual e começa um novo (zera jogadores). Continuar?")) return;
      var nome = prompt("Nome do novo torneio:", "Home Game") || "Home Game";
      Api.enviarAcao("/api/tournaments/novo", "POST", { name: nome });
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
  wireAdminForm();
  wireTema();

  Api.aoAtualizarEstado(renderTudo);
  Api.aoAtualizarConexao(atualizarSeloConexao);
  Api.conectarWs();

  TimerEngine.iniciar();
  aplicarRota();
})();
