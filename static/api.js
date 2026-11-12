(function () {
  // ---- store simples: guarda o snapshot mais recente e avisa ouvintes ----
  var estadoAtual = null;
  var ouvintesEstado = [];

  function clonarEstado(estado) {
    return estado ? JSON.parse(JSON.stringify(estado)) : estado;
  }

  function definirEstado(novoEstado) {
    novoEstado.__recebidoEm = Date.now();
    estadoAtual = novoEstado;
    ouvintesEstado.forEach(function (fn) { fn(estadoAtual); });
  }

  function obterEstado() {
    return estadoAtual;
  }

  function aoAtualizarEstado(fn) {
    ouvintesEstado.push(fn);
    if (estadoAtual) fn(estadoAtual);
  }

  // ---- conexão: ws com reconexão, fallback de polling, detecção de offline ----
  var statusConexao = "conectando"; // conectando | online | offline
  var ouvintesConexao = [];
  var ws = null;
  var tentativasWs = 0;
  var pollingTimer = null;
  var falhasSeguidas = 0;
  var LIMITE_FALHAS_OFFLINE = 3;
  var INTERVALO_POLL_MS = 5000;

  function definirStatusConexao(novo) {
    if (statusConexao === novo) return;
    statusConexao = novo;
    ouvintesConexao.forEach(function (fn) { fn(statusConexao); });
  }

  function aoAtualizarConexao(fn) {
    ouvintesConexao.push(fn);
    fn(statusConexao);
  }

  function conectarWs() {
    var protocolo = location.protocol === "https:" ? "wss" : "ws";
    try {
      ws = new WebSocket(protocolo + "://" + location.host + "/ws");
    } catch (e) {
      agendarReconexaoWs();
      return;
    }

    ws.onopen = function () {
      tentativasWs = 0;
      falhasSeguidas = 0;
      definirStatusConexao("online");
      pararPolling();
    };
    ws.onmessage = function (ev) {
      try {
        definirEstado(JSON.parse(ev.data));
        falhasSeguidas = 0;
        definirStatusConexao("online");
      } catch (e) { /* mensagem inválida, ignora */ }
    };
    ws.onclose = function () {
      definirStatusConexao("conectando");
      iniciarPolling();
      agendarReconexaoWs();
    };
    ws.onerror = function () {
      try { ws.close(); } catch (e) { /* já fechado */ }
    };
  }

  function agendarReconexaoWs() {
    tentativasWs += 1;
    var espera = Math.min(1000 * Math.pow(2, tentativasWs), 15000);
    setTimeout(conectarWs, espera);
  }

  function iniciarPolling() {
    if (pollingTimer) return;
    pollingTimer = setInterval(function () {
      fetch("/api/state")
        .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
        .then(function (dados) {
          falhasSeguidas = 0;
          definirEstado(dados);
          if (statusConexao !== "online") definirStatusConexao("conectando");
        })
        .catch(function () {
          falhasSeguidas += 1;
          if (falhasSeguidas >= LIMITE_FALHAS_OFFLINE) definirStatusConexao("offline");
        });
    }, INTERVALO_POLL_MS);
  }

  function pararPolling() {
    if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
  }

  // ---- chamadas de ação: aplicam mutação otimista local e revertem se falhar ----
  function avisar(mensagem) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = mensagem;
    toast.classList.add("visivel");
    setTimeout(function () { toast.classList.remove("visivel"); }, 2500);
  }

  function enviarAcao(url, metodo, corpo, mutacaoOtimista) {
    var anterior = estadoAtual;
    if (mutacaoOtimista) {
      var rascunho = clonarEstado(estadoAtual);
      mutacaoOtimista(rascunho);
      definirEstado(rascunho);
    }
    return fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo || {}),
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error("Falha na requisição (" + resp.status + ")");
        return resp.json();
      })
      .then(function (novoEstado) { definirEstado(novoEstado); return novoEstado; })
      .catch(function () {
        definirEstado(anterior);
        avisar("Não foi possível salvar. Verifique a conexão e tente novamente.");
        return null;
      });
  }

  window.Api = {
    conectarWs: conectarWs,
    aoAtualizarEstado: aoAtualizarEstado,
    obterEstado: obterEstado,
    aoAtualizarConexao: aoAtualizarConexao,
    enviarAcao: enviarAcao,
    avisar: avisar,
    clonarEstado: clonarEstado,
  };
})();
