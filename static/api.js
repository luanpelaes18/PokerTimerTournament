// api.js centraliza toda comunicação com o backend: o "store" do estado atual
// (o último snapshot recebido), a conexão em tempo real (WebSocket, com
// fallback de polling se a conexão cair) e o helper de ações otimistas usado
// pelo app.js pra mandar POST/PATCH/DELETE. Tudo exposto só através do objeto
// global window.Api, no final do arquivo — o resto das variáveis/funções aqui
// dentro são privadas (fechadas dentro do IIFE).
(function () {
  // ---- store simples: guarda o snapshot mais recente e avisa ouvintes ----

  // estadoAtual: o último snapshot (JSON) recebido do servidor, seja por
  // WebSocket ou por polling — é o que obterEstado() devolve e o que todo
  // "renderizar..." do app.js usa pra desenhar a tela.
  var estadoAtual = null;
  // ouvintesEstado: lista de funções cadastradas via aoAtualizarEstado — toda
  // vez que estadoAtual muda, cada uma delas é chamada com o novo estado
  // (é assim que renderTudo, em app.js, fica sabendo que precisa redesenhar).
  var ouvintesEstado = [];

  function clonarEstado(estado) {
    // Cópia profunda (via serializar/desserializar JSON) — usada antes de uma
    // mutação otimista, pra poder alterar a cópia sem arriscar corromper o
    // estadoAtual original caso a chamada ao servidor falhe depois.
    return estado ? JSON.parse(JSON.stringify(estado)) : estado;
  }

  function definirEstado(novoEstado) {
    // Troca estadoAtual pelo novo valor e avisa todo mundo que está
    // escutando (ouvintesEstado). "__recebidoEm" só serve de informação de
    // debug (não é usado em nenhum cálculo).
    novoEstado.__recebidoEm = Date.now();
    estadoAtual = novoEstado;
    ouvintesEstado.forEach(function (fn) { fn(estadoAtual); });
  }

  function obterEstado() {
    return estadoAtual;
  }

  function aoAtualizarEstado(fn) {
    // Cadastra "fn" pra ser chamada toda vez que o estado mudar. Se já existe
    // um estado carregado agora, chama "fn" imediatamente também — assim quem
    // cadastra o ouvinte depois que a página já carregou não perde a
    // primeira renderização.
    ouvintesEstado.push(fn);
    if (estadoAtual) fn(estadoAtual);
  }

  // ---- conexão: ws com reconexão, fallback de polling, detecção de offline ----
  var statusConexao = "conectando"; // conectando | online | offline
  var ouvintesConexao = [];          // funções cadastradas via aoAtualizarConexao
  var ws = null;                      // a conexão WebSocket ativa (ou null se nenhuma)
  var tentativasWs = 0;                // quantas vezes já tentou reconectar seguidas (cresce o tempo de espera)
  var pollingTimer = null;              // id do setInterval do polling de fallback (ou null se parado)
  var falhasSeguidas = 0;                // quantas vezes o polling falhou em sequência
  var LIMITE_FALHAS_OFFLINE = 3;          // depois de quantas falhas seguidas o status vira "offline"
  var INTERVALO_POLL_MS = 5000;            // de quanto em quanto tempo o polling de fallback roda

  function definirStatusConexao(novo) {
    // Só dispara os ouvintes se o status realmente mudou — evita re-render
    // desnecessário do selo de conexão a cada tick.
    if (statusConexao === novo) return;
    statusConexao = novo;
    ouvintesConexao.forEach(function (fn) { fn(statusConexao); });
  }

  function aoAtualizarConexao(fn) {
    ouvintesConexao.push(fn);
    fn(statusConexao); // avisa logo o status atual, mesmo sem ter mudado ainda
  }

  function conectarWs() {
    // Abre (ou reabre) a conexão WebSocket com o backend. wss:// se a página
    // estiver em https, ws:// caso contrário — precisa bater com o protocolo
    // da página ou o navegador bloqueia a conexão (mixed content).
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
      pararPolling(); // WS funcionando de novo — não precisa mais do polling de fallback
    };
    ws.onmessage = function (ev) {
      // Cada mensagem recebida é um snapshot completo do estado (o mesmo
      // formato de /api/state) — nunca um "diff" parcial.
      try {
        definirEstado(JSON.parse(ev.data));
        falhasSeguidas = 0;
        definirStatusConexao("online");
      } catch (e) { /* mensagem inválida, ignora */ }
    };
    ws.onclose = function () {
      definirStatusConexao("conectando");
      iniciarPolling();       // continua recebendo atualizações (mais devagar) enquanto tenta reconectar
      agendarReconexaoWs();
    };
    ws.onerror = function () {
      try { ws.close(); } catch (e) { /* já fechado */ }
    };
  }

  function agendarReconexaoWs() {
    // Backoff exponencial: espera o dobro a cada tentativa (1s, 2s, 4s...),
    // até um teto de 15s, pra não martelar o servidor se ele estiver fora.
    tentativasWs += 1;
    var espera = Math.min(1000 * Math.pow(2, tentativasWs), 15000);
    setTimeout(conectarWs, espera);
  }

  function iniciarPolling() {
    // Fallback usado enquanto o WebSocket está caído: busca o estado via
    // GET /api/state de tempos em tempos. Se "pollingTimer" já existe, não
    // cria um segundo (evita ficar com dois intervals rodando ao mesmo tempo).
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
    // Mostra uma mensagem curta no "toast" (caixinha no rodapé da tela) por
    // 2.5s — usado pra erros e confirmações rápidas em todo o app.
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = mensagem;
    toast.classList.add("visivel");
    setTimeout(function () { toast.classList.remove("visivel"); }, 2500);
  }

  function enviarAcao(url, metodo, corpo, mutacaoOtimista) {
    // Dispara uma ação (POST/PATCH/DELETE) no torneio AO VIVO (diferente de
    // app.js:executarAcao, que também cobre o caso de um torneio rascunho).
    // Se "mutacaoOtimista" for passada, a tela já atualiza na hora (antes da
    // resposta do servidor chegar) — melhora a sensação de resposta rápida.
    // Se a requisição falhar, o estado anterior ("anterior") é restaurado,
    // desfazendo a mudança otimista, e um aviso aparece.
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
        avisar(window.I18N ? window.I18N.t("admin_erro_salvar") : "Não foi possível salvar. Verifique a conexão e tente novamente.");
        return null;
      });
  }

  // Única coisa exposta fora deste arquivo: todo o resto acima é privado ao
  // IIFE. app.js (e timer.js) usam exclusivamente essas funções via "Api.*".
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
