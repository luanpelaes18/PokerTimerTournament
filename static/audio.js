(function () {
  var ctx = null;

  function obterContexto() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        console.warn("Web Audio API não suportada neste navegador.");
        return null;
      }
      try {
        ctx = new AC();
      } catch (e) {
        console.error("Falha ao criar AudioContext:", e);
        return null;
      }
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

  // Troca de nível: "Pii ... piiii ... piiiiiiiiiiiiiii" — mesmo tom, cada bipe
  // mais longo que o anterior, com a pausa entre eles também crescendo.
  function bipar(mudo) {
    if (mudo) return;
    tocarTom(880, 0, 0.1);
    tocarTom(880, 0.4, 0.5);
    tocarTom(880, 1.3, 1.2);
    if (navigator.vibrate) navigator.vibrate([100, 300, 500, 400, 1200]);
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
