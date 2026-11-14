// timer.js é o "motor" do relógio: a cada 250ms recalcula quanto tempo falta
// no nível atual (sem nunca gravar essa contagem regressiva em lugar nenhum,
// nem no servidor nem aqui — ela é sempre recalculada a partir de quando o
// nível começou) e decide se precisa tocar algum som ou avançar de nível
// sozinho. Quem desenha o relógio na tela é window.renderizarRelogio, definida
// em app.js e chamada por aqui a cada tick.
(function () {
  var ultimoNivelVisto = null;   // currentLevelIndex do tick anterior — usado pra detectar troca de nível
  var alerta30Disparado = false;  // já tocou o aviso de 30s restantes neste nível?
  var avancando = false;           // true enquanto espera a resposta do POST /api/timer/next (evita mandar duas vezes)

  function calcularRestante(estado) {
    // Quanto tempo falta no nível atual, em segundos. elapsedSeconds vem do
    // servidor (calculado em _elapsed_seconds, no app.py) relativo ao momento
    // em que esse snapshot foi montado (estado.__recebidoEm, gravado pelo
    // api.js) — se o timer está rodando, soma também o tempo que passou
    // DESDE então até agora, no próprio navegador, sem precisar perguntar de
    // novo pro servidor a cada tick.
    var torneio = estado.tournament;
    var nivel = torneio.levels[torneio.currentLevelIndex] || { minutes: 0 };
    var duracao = nivel.minutes * 60;
    var elapsed = torneio.elapsedSeconds;
    if (torneio.status === "running") {
      elapsed += (Date.now() - estado.__recebidoEm) / 1000;
    }
    return Math.max(0, duracao - elapsed);
  }

  function tick() {
    // Chamada a cada 250ms (ver iniciar, mais abaixo). Lê o estado mais
    // recente (sem fazer nenhuma requisição — só usa o que já está em
    // memória via Api.obterEstado), recalcula o tempo restante e decide: (1)
    // se troca de nível aconteceu e deve tocar o alarme, (2) se deve tocar o
    // aviso de 30s, (3) se o tempo zerou e precisa avançar de nível sozinho,
    // e por fim (4) sempre redesenha o relógio na tela.
    var estado = Api.obterEstado();
    if (!estado || !estado.tournament) return;
    var torneio = estado.tournament;
    var idx = torneio.currentLevelIndex;
    var restante = calcularRestante(estado);

    // Só quem está olhando o relógio (Timer ou Gerente) toca o alarme — Admin/Menu
    // ficam mudos, e abas esquecidas nessas telas não tocam junto fora de sincronia.
    var exibindoTimer = window.ROTA_ATUAL === "timer" || window.ROTA_ATUAL === "gerente";

    if (ultimoNivelVisto !== idx) {
      // Só toca quando o nível avançou sozinho (tempo zerou) — mudanças manuais
      // (botões Próximo/Anterior/Reiniciar) não devem disparar o alarme.
      var foiAutomatico = torneio.levelChangeReason === "auto";
      if (ultimoNivelVisto !== null && exibindoTimer && foiAutomatico) Audio30.bipar(torneio.muted);
      ultimoNivelVisto = idx;
      alerta30Disparado = false;
    }

    if (!alerta30Disparado && restante <= 30 && restante > 0 && torneio.status === "running") {
      alerta30Disparado = true;
      if (exibindoTimer) Audio30.alertaCurto(torneio.muted);
    }

    if (restante <= 0 && torneio.status === "running" && !avancando) {
      avancando = true;
      Api.enviarAcao("/api/timer/next", "POST", { expectedIndex: idx })
        .catch(function () { /* erro já notificado pelo api.js */ })
        .then(function () { avancando = false; });
    }

    if (window.renderizarRelogio) window.renderizarRelogio(estado, restante);
  }

  function iniciar() {
    // Chamado uma vez no boot do app (ver o final de app.js). Roda um tick
    // imediatamente (pra não esperar 250ms pra primeira renderização) e
    // depois agenda os ticks seguintes.
    setInterval(tick, 250);
    tick();
  }

  // Exposto globalmente só pra app.js chamar TimerEngine.iniciar() no boot.
  window.TimerEngine = { iniciar: iniciar, calcularRestante: calcularRestante };
})();
