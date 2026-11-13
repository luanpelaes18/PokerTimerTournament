(function () {
  var ultimoNivelVisto = null;
  var alerta30Disparado = false;
  var avancando = false;

  function calcularRestante(estado) {
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
    setInterval(tick, 250);
    tick();
  }

  window.TimerEngine = { iniciar: iniciar, calcularRestante: calcularRestante };
})();
