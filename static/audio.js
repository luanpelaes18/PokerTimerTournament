(function () {
  var ctx = null;

  function obterContexto() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    return ctx;
  }

  function tocarTom(freq, inicioSeg, duracaoSeg) {
    var audioCtx = obterContexto();
    if (!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    var t0 = audioCtx.currentTime + inicioSeg;
    osc.start(t0);
    osc.stop(t0 + duracaoSeg);
  }

  // Dois tons alternados, como um bipe de forno/alarme.
  function bipar(mudo) {
    if (mudo) return;
    tocarTom(880, 0, 0.15);
    tocarTom(660, 0.2, 0.15);
    tocarTom(880, 0.4, 0.15);
    tocarTom(660, 0.6, 0.15);
    if (navigator.vibrate) navigator.vibrate([150, 80, 150, 80, 150]);
  }

  // Alerta mais curto para o aviso de 30 segundos.
  function alertaCurto(mudo) {
    if (mudo) return;
    tocarTom(770, 0, 0.12);
    tocarTom(770, 0.18, 0.12);
    if (navigator.vibrate) navigator.vibrate([100, 60, 100]);
  }

  // Navegadores bloqueiam áudio sem gesto do usuário; chamar isso no primeiro clique da página.
  function destravar() {
    var audioCtx = obterContexto();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  window.Audio30 = { bipar: bipar, alertaCurto: alertaCurto, destravar: destravar };
})();
