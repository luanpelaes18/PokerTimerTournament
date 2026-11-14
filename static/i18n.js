// Dicionário de traduções da interface. "idioma" é global ao sistema (igual ao
// tema de cores) — escolhido na tela Configuração, sincronizado por WS pra todo
// mundo. Textos que são dados do próprio usuário (nome de torneio, de modelo de
// ficha, de cor, de jogador) nunca passam por aqui — só o texto fixo da interface.
(function () {
  var TEXTOS = {
    "pt-BR": {
      app_nome: "Poker Timer Tournament",
      conectando: "conectando…",
      online: "online",
      offline: "sem conexão",

      menu_gerente_titulo: "Gerente",
      menu_gerente_desc: "Jogadores, timer, pagamentos e finalização",
      menu_timer_titulo: "Timer",
      menu_timer_desc: "Relógio para a TV/monitor",
      menu_admin_titulo: "Admin",
      menu_admin_desc: "Cadastro de torneios e histórico",
      menu_config_titulo: "Configuração",
      menu_config_desc: "Logo, modelos de ficha e tema de cores do sistema",
      menu_torneio_atual: "Torneio atual: {nome}",
      menu_voltar: "← Menu",

      gerente_titulo: "Gerente",
      gerente_ativar_torneio: "Ativar este torneio",
      gerente_finalizar_torneio: "Finalizar torneio",
      gerente_confirmar_ativar: "Ativar este torneio como o atual? Isso finaliza o torneio que está rodando agora (se ainda não estiver finalizado).",
      gerente_erro_ativar: "Não foi possível ativar este torneio.",
      gerente_bloqueio_rascunho_titulo: "Selecione o torneio atual para usar este controle",
      gerente_nenhum_torneio: "Nenhum torneio disponível. Cadastre um no Admin.",
      gerente_nome_jogador_placeholder: "Nome do jogador",
      gerente_adicionar: "Adicionar",
      gerente_confirmar_finalizar: "Finalizar o torneio atual? Ele vai para o histórico (aba Admin) e os controles de timer/jogadores param de valer até você iniciar um novo.",
      gerente_confirmar_reiniciar: "Reiniciar o timer? Volta para o nível 1 e zera o tempo decorrido do torneio atual.",

      premiacao_titulo_previsao: "Previsão de premiação",
      premiacao_titulo_confirmada: "Premiação (confirmada)",
      premiacao_titulo_timer_confirmada: "Premiação",
      premiacao_instrucoes: "Os 3 primeiros vêm com padrão 45% / 35% / 20% do prêmio acumulado. Cada campo é independente — edite qualquer um (inclusive pra zero). Limpe o campo pra voltar ao padrão. Adicione mais posições se pagar mais colocados.",
      premiacao_adicionar: "+ Adicionar premiado",
      premiacao_confirmar: "Confirmar divisão de premiação",
      premiacao_destravar: "🔓 Destravar premiação",
      premiacao_remover_posicao: "Remover esta posição",
      premiacao_total_alocado: "Total alocado: {total} de {pool}",
      premiacao_falta: " (falta {valor})",
      premiacao_acima: " ({valor} acima do prêmio)",
      premiacao_ok: " ✓",
      posicao_lugar: "{n} lugar",

      nivel_label: "Nível {atual} de {total}",
      nivel_proximo: "Próximo: {blind}",
      nivel_ultimo: "Último nível",
      blind_intervalo: "Intervalo",
      blind_ante: " (ante {valor})",

      timer_anterior: "⏮ Anterior",
      timer_tocar: "▶ Tocar",
      timer_pausar: "⏸ Pausar",
      timer_proximo: "Próximo ⏭",
      timer_menos1: "-1 min",
      timer_mais1: "+1 min",
      timer_reiniciar: "⟲ Reiniciar",
      timer_som: "🔈 Som",
      timer_bloqueado_rascunho_titulo: "Selecione o torneio atual (não um rascunho) para controlar o timer",
      timer_bloqueado_nao_configurado_titulo: "Confirme a configuração do torneio no Admin antes de iniciar",

      coluna_jogador: "Jogador",
      coluna_rebuys: "Rebuys",
      coluna_addon: "Add-on",
      coluna_valor_devido: "Valor devido",
      coluna_valor_pago: "Valor pago",
      coluna_pagamento: "Pagamento",
      coluna_status: "Status",
      coluna_acoes: "Ações",

      jogador_feito: "feito",
      jogador_quitado: "quitado",
      jogador_eliminado: "eliminado",
      jogador_ativo: "ativo",
      jogador_entradas_encerradas: "entradas encerradas",
      jogador_addon_btn: "Add-on",
      jogador_rebuy_btn: "Rebuy",
      jogador_eliminar_btn: "Eliminar",
      jogador_reentrada_btn: "Reentrada",
      jogador_remover_btn: "Remover",
      jogador_confirmar_remover: "Remover {nome}?",
      jogador_pago_placeholder: "novo pag.",
      jogador_pago_titulo: "Valor do pagamento que a pessoa está fazendo agora (soma ao que já foi pago) — aceita abreviações (2k = 2000)",
      jogador_pagar_btn: "Pagar",
      jogador_pagar_tudo_btn: "Pagar tudo",
      jogador_falta: "falta {valor}",

      timer_prize_pool: "Prêmio acumulado",
      timer_jogadores_ativos: "Jogadores ativos",
      timer_stack_medio: "Stack médio",

      totais_jogadores_ativos: "Jogadores ativos",
      totais_eliminados: "Eliminados",
      totais_fichas_em_jogo: "Fichas em jogo",
      totais_stack_medio: "Stack médio",
      totais_premio_acumulado: "Prêmio acumulado",
      totais_recebido: "Recebido",
      totais_pendente: "Pendente",
      totais_parte_dealer: "Parte do dealer",

      admin_titulo: "Admin",
      admin_novo_torneio: "+ Novo torneio",
      admin_novo_torneio_prompt: "Nome do novo torneio:",
      admin_nenhum_cadastrado: "Nenhum torneio cadastrado ainda.",
      admin_selecione_torneio: "Selecione um torneio à esquerda, ou crie um novo para começar o cadastro.",
      admin_torneio_titulo_padrao: "Torneio",
      admin_salvo: "salvo ✓",
      admin_nao_salvo: "não salvo",
      admin_nome_torneio: "Nome do torneio",
      admin_fichas_buyin: "Fichas do buy-in",
      admin_fichas_rebuy: "Fichas do rebuy",
      admin_fichas_addon: "Fichas do add-on",
      admin_preco_acao: "Preço por ação (R$)",
      admin_parte_dealer: "Parte do dealer por ação (R$)",
      admin_salvar: "Salvar",
      admin_fichas_cadastradas_titulo: "Fichas cadastradas",
      admin_fichas_cadastradas_desc: "Valor e modelo visual de cada ficha física que você tem em casa — define o que aparece na coluna de fichas da tela Timer.",
      admin_adicionar_ficha: "+ Adicionar ficha",
      admin_ficha_valor_placeholder: "ex: 100",
      admin_ficha_remover_titulo: "Remover esta ficha",
      admin_estrutura_niveis: "Estrutura de níveis",
      admin_adicionar_nivel: "+ Adicionar nível",
      admin_excluir_torneio: "Excluir torneio",
      admin_confirmar_excluir: "Excluir o torneio \"{nome}\"? Essa ação não pode ser desfeita — apaga jogadores e histórico junto.",
      admin_erro_excluir: "Não foi possível excluir o torneio.",
      admin_erro_excluir_atual: "Não é possível excluir o torneio atual. Na aba Gerente, selecione outro torneio e clique em \"Ativar este torneio\" primeiro.",
      admin_erro_salvar: "Não foi possível salvar. Tente novamente.",
      admin_nivel_titulo_abreviacao: 'Aceita abreviações: "2k" = 2000. Salva ao sair do campo (clique fora ou Enter).',
      admin_nivel_fecha_entradas_titulo: "A partir deste nível, não é mais possível fazer reentrada",
      admin_nivel_confirmar_propagar: "Aplicar {campo} = {valor} também aos próximos níveis?\n\nOK = aplica a este e a todos os níveis seguintes.\nCancelar = altera só este nível.",
      coluna_nivel_num: "#",
      coluna_sb: "SB",
      coluna_bb: "BB",
      coluna_ante: "Ante",
      coluna_tempo: "Tempo",
      coluna_pausa: "Pausa",
      coluna_fecha_entradas: "Fecha entradas",

      relatorio_finalizado_em: "Finalizado em {data}",
      relatorio_premio_dealer: "Prêmio: {premio} · Dealer: {dealer}",
      relatorio_coluna_devido: "Devido",
      relatorio_coluna_pago: "Pago",
      relatorio_coluna_falta: "Falta",
      relatorio_coluna_eliminado: "Eliminado",
      relatorio_sim: "sim",
      relatorio_nao: "não",
      relatorio_linha_do_tempo: "Linha do tempo",
      relatorio_sem_eventos: "Sem eventos registrados.",

      evento_torneio_criado: "Torneio criado",
      evento_torneio_finalizado: "Torneio finalizado",
      evento_entrada: "Entrada",
      evento_rebuy: "Rebuy",
      evento_addon: "Add-on",
      evento_reentrada: "Reentrada",
      evento_saida: "Saída (eliminado)",
      evento_removido: "Removido",
      evento_saida_detalhe: "{nome} — nível {nivel} (SB {sb}/BB {bb})",
      evento_saida_detalhe_pausa: "{nome} — nível {nivel} (pausa)",
      evento_saida_detalhe_lugar: " — {posicao} lugar",

      status_paused: "pausado",
      status_running: "rodando",
      status_finished: "finalizado",
      sufixo_atual: " (atual)",
      sufixo_finalizado: " (finalizado)",

      config_titulo: "Configuração",
      config_tema_titulo: "Tema de cores",
      config_tema_desc: "Esquema de cores do sistema inteiro (separado do interruptor claro/escuro). \"Padrão\" é o roxo/índigo original — todos os temas têm variante clara e escura, e continuam respeitando o interruptor de cada tela.",
      config_idioma_titulo: "Idioma",
      config_idioma_desc: "Idioma da interface, pra todo mundo conectado.",
      config_idioma_pt: "Português",
      config_idioma_en: "English",
      config_erro_idioma: "Não foi possível trocar o idioma. Tente novamente.",
      config_logo_titulo: "Logo do sistema",
      config_logo_desc: "Usada no menu e como marca d'água de fundo em todas as telas. Envie um PNG com fundo transparente, de preferência quadrado (ex: 512×512px), com a arte bem enquadrada e sem muita margem em branco ao redor — senão a marca d'água fica pequena ou apagada.",
      config_logo_alt: "Logo atual",
      config_enviar_logo: "Enviar logo",
      config_erro_escolher_arquivo: "Escolha um arquivo antes de enviar.",
      config_erro_enviar_logo: "Não foi possível enviar a logo. Tente novamente.",
      config_modelos_titulo: "Modelos de ficha",
      config_modelos_desc: "Cada modelo tem o nome e as cores que você quiser — dê um nome ao modelo, depois um nome e uma foto pra cada cor. {forte}Cada foto deve conter uma única ficha{fimforte} — a tela já recorta em círculo na exibição, então não precisa recortar antes, mas se a foto tiver várias fichas juntas (lado a lado, por exemplo) ela não separa sozinha: vai aparecer tudo junto numa \"cor\" só. Tirando foto, fotografe uma ficha por vez; se já tiver uma imagem com várias, recorte-a em fotos separadas antes de enviar.",
      config_modelos_nenhum: "Nenhum modelo cadastrado ainda.",
      config_remover_modelo: "Remover modelo",
      config_confirmar_remover_modelo: "Remover o modelo \"{nome}\" e todas as suas cores? Essa ação não pode ser desfeita.",
      config_erro_remover_modelo: "Não foi possível remover o modelo. Tente novamente.",
      config_remover_cor_titulo: "Remover a cor \"{nome}\"",
      config_confirmar_remover_cor: "Remover a cor \"{cor}\" do modelo \"{modelo}\"?",
      config_erro_remover_cor: "Não foi possível remover a cor. Tente novamente.",
      config_nome_nova_cor_placeholder: "Nome da nova cor",
      config_foto_unica_ficha_titulo: "Foto de uma única ficha — não envie uma foto com várias fichas juntas.",
      config_adicionar_cor: "+ Adicionar cor",
      config_erro_preencher_cor: "Preencha o nome e a foto da cor.",
      config_erro_adicionar_cor: "Não foi possível adicionar a cor. Tente novamente.",
      config_cor_adicionada: "Cor \"{nome}\" adicionada.",
      config_adicionar_modelo_titulo: "Adicionar modelo",
      config_nome_modelo: "Nome do modelo",
      config_nome_modelo_placeholder: "ex: LKpoker",
      config_nome_cor_placeholder: "Nome da cor (ex: vermelha)",
      config_remover_cor_nova_titulo: "Remover esta cor",
      config_erro_nome_modelo: "Dê um nome ao modelo.",
      config_erro_preencher_cada_cor: "Preencha o nome e a foto de cada cor.",
      config_modelo_salvo: "Modelo \"{nome}\" salvo.",
      config_erro_salvar_modelo: "Não foi possível salvar o modelo. Tente novamente.",
      config_salvar_novo_modelo: "Salvar novo modelo",
      config_erro_trocar_tema: "Não foi possível trocar o tema. Tente novamente.",

      tema_destaque_padrao: "Padrão (LK)",
      tema_escuro_titulo: "Tema escuro — clique para mudar pro claro",
      tema_claro_titulo: "Tema claro — clique para mudar pro escuro",
      interruptor_tema_titulo: "Alternar tema claro/escuro",

      offline_titulo: "Sem conexão com o servidor",
      offline_desc: "Verifique se o servidor do torneio está rodando na rede local. Tentando reconectar automaticamente…",
    },

    "en-US": {
      app_nome: "Poker Timer Tournament",
      conectando: "connecting…",
      online: "online",
      offline: "offline",

      menu_gerente_titulo: "Manager",
      menu_gerente_desc: "Players, timer, payments and finalization",
      menu_timer_titulo: "Timer",
      menu_timer_desc: "Clock for the TV/monitor",
      menu_admin_titulo: "Admin",
      menu_admin_desc: "Tournament setup and history",
      menu_config_titulo: "Settings",
      menu_config_desc: "System logo, chip models and color theme",
      menu_torneio_atual: "Current tournament: {nome}",
      menu_voltar: "← Menu",

      gerente_titulo: "Manager",
      gerente_ativar_torneio: "Activate this tournament",
      gerente_finalizar_torneio: "Finalize tournament",
      gerente_confirmar_ativar: "Activate this tournament as the current one? This finalizes whichever tournament is running now (if it isn't finalized yet).",
      gerente_erro_ativar: "Couldn't activate this tournament.",
      gerente_bloqueio_rascunho_titulo: "Select the current tournament to use this control",
      gerente_nenhum_torneio: "No tournament available. Set one up in Admin.",
      gerente_nome_jogador_placeholder: "Player name",
      gerente_adicionar: "Add",
      gerente_confirmar_finalizar: "Finalize the current tournament? It moves to the history (Admin tab) and the timer/player controls stop working until you start a new one.",
      gerente_confirmar_reiniciar: "Restart the timer? This goes back to level 1 and resets the elapsed time of the current tournament.",

      premiacao_titulo_previsao: "Payout preview",
      premiacao_titulo_confirmada: "Payouts (confirmed)",
      premiacao_titulo_timer_confirmada: "Payouts",
      premiacao_instrucoes: "The first 3 come with a 45% / 35% / 20% default of the prize pool. Each field is independent — edit any of them (even down to zero). Clear a field to go back to the default. Add more positions to pay more places.",
      premiacao_adicionar: "+ Add paid position",
      premiacao_confirmar: "Confirm payout split",
      premiacao_destravar: "🔓 Unlock payouts",
      premiacao_remover_posicao: "Remove this position",
      premiacao_total_alocado: "Total allocated: {total} of {pool}",
      premiacao_falta: " ({valor} short)",
      premiacao_acima: " ({valor} over the prize pool)",
      premiacao_ok: " ✓",
      posicao_lugar: "{n} place",
      // (sem sufixo próprio — "{n}" já vem pronto de I18N.ordinal(), que decide
      // "8º"/"8th" conforme o idioma)

      nivel_label: "Level {atual} of {total}",
      nivel_proximo: "Next: {blind}",
      nivel_ultimo: "Last level",
      blind_intervalo: "Break",
      blind_ante: " (ante {valor})",

      timer_anterior: "⏮ Previous",
      timer_tocar: "▶ Play",
      timer_pausar: "⏸ Pause",
      timer_proximo: "Next ⏭",
      timer_menos1: "-1 min",
      timer_mais1: "+1 min",
      timer_reiniciar: "⟲ Restart",
      timer_som: "🔈 Sound",
      timer_bloqueado_rascunho_titulo: "Select the current tournament (not a draft) to control the timer",
      timer_bloqueado_nao_configurado_titulo: "Confirm the tournament setup in Admin before starting",

      coluna_jogador: "Player",
      coluna_rebuys: "Rebuys",
      coluna_addon: "Add-on",
      coluna_valor_devido: "Amount owed",
      coluna_valor_pago: "Amount paid",
      coluna_pagamento: "Payment",
      coluna_status: "Status",
      coluna_acoes: "Actions",

      jogador_feito: "done",
      jogador_quitado: "paid up",
      jogador_eliminado: "eliminated",
      jogador_ativo: "active",
      jogador_entradas_encerradas: "entries closed",
      jogador_addon_btn: "Add-on",
      jogador_rebuy_btn: "Rebuy",
      jogador_eliminar_btn: "Eliminate",
      jogador_reentrada_btn: "Re-entry",
      jogador_remover_btn: "Remove",
      jogador_confirmar_remover: "Remove {nome}?",
      jogador_pago_placeholder: "new payment",
      jogador_pago_titulo: "Amount this person is paying right now (added to what's already been paid) — accepts shorthand (2k = 2000)",
      jogador_pagar_btn: "Pay",
      jogador_pagar_tudo_btn: "Pay in full",
      jogador_falta: "{valor} left",

      timer_prize_pool: "Prize pool",
      timer_jogadores_ativos: "Active players",
      timer_stack_medio: "Average stack",

      totais_jogadores_ativos: "Active players",
      totais_eliminados: "Eliminated",
      totais_fichas_em_jogo: "Chips in play",
      totais_stack_medio: "Average stack",
      totais_premio_acumulado: "Prize pool",
      totais_recebido: "Collected",
      totais_pendente: "Pending",
      totais_parte_dealer: "Dealer's share",

      admin_titulo: "Admin",
      admin_novo_torneio: "+ New tournament",
      admin_novo_torneio_prompt: "New tournament name:",
      admin_nenhum_cadastrado: "No tournament set up yet.",
      admin_selecione_torneio: "Select a tournament on the left, or create a new one to start setting it up.",
      admin_torneio_titulo_padrao: "Tournament",
      admin_salvo: "saved ✓",
      admin_nao_salvo: "not saved",
      admin_nome_torneio: "Tournament name",
      admin_fichas_buyin: "Buy-in chips",
      admin_fichas_rebuy: "Rebuy chips",
      admin_fichas_addon: "Add-on chips",
      admin_preco_acao: "Price per action",
      admin_parte_dealer: "Dealer's share per action",
      admin_salvar: "Save",
      admin_fichas_cadastradas_titulo: "Registered chips",
      admin_fichas_cadastradas_desc: "Value and visual model of each physical chip you have at home — this sets what shows up in the Timer screen's chip column.",
      admin_adicionar_ficha: "+ Add chip",
      admin_ficha_valor_placeholder: "e.g. 100",
      admin_ficha_remover_titulo: "Remove this chip",
      admin_estrutura_niveis: "Level structure",
      admin_adicionar_nivel: "+ Add level",
      admin_excluir_torneio: "Delete tournament",
      admin_confirmar_excluir: "Delete the tournament \"{nome}\"? This can't be undone — it also erases its players and history.",
      admin_erro_excluir: "Couldn't delete the tournament.",
      admin_erro_excluir_atual: "The current tournament can't be deleted. In the Manager tab, pick another tournament and click \"Activate this tournament\" first.",
      admin_erro_salvar: "Couldn't save. Please try again.",
      admin_nivel_titulo_abreviacao: 'Accepts shorthand: "2k" = 2000. Saves when you leave the field (click away or press Enter).',
      admin_nivel_fecha_entradas_titulo: "From this level on, re-entry is no longer allowed",
      admin_nivel_confirmar_propagar: "Apply {campo} = {valor} to the following levels too?\n\nOK = applies to this level and every level after it.\nCancel = changes only this level.",
      coluna_nivel_num: "#",
      coluna_sb: "SB",
      coluna_bb: "BB",
      coluna_ante: "Ante",
      coluna_tempo: "Time",
      coluna_pausa: "Break",
      coluna_fecha_entradas: "Closes entries",

      relatorio_finalizado_em: "Finalized on {data}",
      relatorio_premio_dealer: "Prize pool: {premio} · Dealer: {dealer}",
      relatorio_coluna_devido: "Owed",
      relatorio_coluna_pago: "Paid",
      relatorio_coluna_falta: "Left",
      relatorio_coluna_eliminado: "Eliminated",
      relatorio_sim: "yes",
      relatorio_nao: "no",
      relatorio_linha_do_tempo: "Timeline",
      relatorio_sem_eventos: "No events logged.",

      evento_torneio_criado: "Tournament created",
      evento_torneio_finalizado: "Tournament finalized",
      evento_entrada: "Entry",
      evento_rebuy: "Rebuy",
      evento_addon: "Add-on",
      evento_reentrada: "Re-entry",
      evento_saida: "Elimination",
      evento_removido: "Removed",
      evento_saida_detalhe: "{nome} — level {nivel} (SB {sb}/BB {bb})",
      evento_saida_detalhe_pausa: "{nome} — level {nivel} (break)",
      evento_saida_detalhe_lugar: " — {posicao} place",

      status_paused: "paused",
      status_running: "running",
      status_finished: "finished",
      sufixo_atual: " (current)",
      sufixo_finalizado: " (finished)",

      config_titulo: "Settings",
      config_tema_titulo: "Color theme",
      config_tema_desc: "Color scheme for the whole system (separate from the light/dark switch). \"Default\" is the original violet/indigo — every theme has a light and a dark variant, and still follows each screen's own switch.",
      config_idioma_titulo: "Language",
      config_idioma_desc: "Interface language, for everyone connected.",
      config_idioma_pt: "Português",
      config_idioma_en: "English",
      config_erro_idioma: "Couldn't change the language. Please try again.",
      config_logo_titulo: "System logo",
      config_logo_desc: "Used in the menu and as the background watermark on every screen. Upload a PNG with a transparent background, preferably square (e.g. 512×512px), with the artwork well framed and without too much blank margin around it — otherwise the watermark comes out small or faded.",
      config_logo_alt: "Current logo",
      config_enviar_logo: "Upload logo",
      config_erro_escolher_arquivo: "Choose a file before uploading.",
      config_erro_enviar_logo: "Couldn't upload the logo. Please try again.",
      config_modelos_titulo: "Chip models",
      config_modelos_desc: "Each model has whatever name and colors you want — give the model a name, then a name and a photo for each color. {forte}Each photo must show a single chip{fimforte} — the screen already crops it into a circle for display, so you don't need to crop it beforehand, but if the photo has several chips together (side by side, for example) it won't split them on its own: they'll all show up as a single \"color\". When taking photos, shoot one chip at a time; if you already have an image with several, crop it into separate photos before uploading.",
      config_modelos_nenhum: "No model set up yet.",
      config_remover_modelo: "Remove model",
      config_confirmar_remover_modelo: "Remove the model \"{nome}\" and all of its colors? This can't be undone.",
      config_erro_remover_modelo: "Couldn't remove the model. Please try again.",
      config_remover_cor_titulo: "Remove the color \"{nome}\"",
      config_confirmar_remover_cor: "Remove the color \"{cor}\" from the model \"{modelo}\"?",
      config_erro_remover_cor: "Couldn't remove the color. Please try again.",
      config_nome_nova_cor_placeholder: "New color name",
      config_foto_unica_ficha_titulo: "Photo of a single chip — don't upload a photo with several chips together.",
      config_adicionar_cor: "+ Add color",
      config_erro_preencher_cor: "Fill in the color's name and photo.",
      config_erro_adicionar_cor: "Couldn't add the color. Please try again.",
      config_cor_adicionada: "Color \"{nome}\" added.",
      config_adicionar_modelo_titulo: "Add model",
      config_nome_modelo: "Model name",
      config_nome_modelo_placeholder: "e.g. LKpoker",
      config_nome_cor_placeholder: "Color name (e.g. red)",
      config_remover_cor_nova_titulo: "Remove this color",
      config_erro_nome_modelo: "Give the model a name.",
      config_erro_preencher_cada_cor: "Fill in the name and photo of each color.",
      config_modelo_salvo: "Model \"{nome}\" saved.",
      config_erro_salvar_modelo: "Couldn't save the model. Please try again.",
      config_salvar_novo_modelo: "Save new model",
      config_erro_trocar_tema: "Couldn't change the theme. Please try again.",

      tema_destaque_padrao: "Default (LK)",
      tema_escuro_titulo: "Dark theme — click to switch to light",
      tema_claro_titulo: "Light theme — click to switch to dark",
      interruptor_tema_titulo: "Switch light/dark theme",

      offline_titulo: "No connection to the server",
      offline_desc: "Check that the tournament server is running on the local network. Trying to reconnect automatically…",
    },
  };

  var IDIOMAS_VALIDOS = Object.keys(TEXTOS);
  var idiomaAtual = "pt-BR";

  function t(chave, vars) {
    var dicionario = TEXTOS[idiomaAtual] || TEXTOS["pt-BR"];
    var texto = dicionario[chave];
    if (texto === undefined) texto = TEXTOS["pt-BR"][chave];
    if (texto === undefined) return chave;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        texto = texto.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return texto;
  }

  // Monta um número ordinal ("8º"/"8th") — usado na colocação final e nas
  // posições de premiação, que em inglês têm sufixo irregular (1st/2nd/3rd/4th).
  function ordinal(n) {
    if (idiomaAtual !== "en-US") return n + "º";
    var resto100 = n % 100;
    if (resto100 >= 11 && resto100 <= 13) return n + "th";
    switch (n % 10) {
      case 1: return n + "st";
      case 2: return n + "nd";
      case 3: return n + "rd";
      default: return n + "th";
    }
  }

  function localeAtual() {
    return idiomaAtual === "en-US" ? "en-US" : "pt-BR";
  }

  // Troca o idioma ativo e reaplica toda tradução estática da página marcada
  // com data-i18n — quem tem texto dinâmico (gerado via JS) escuta separadamente.
  function aplicarIdiomaEstatico() {
    document.documentElement.setAttribute("lang", idiomaAtual === "en-US" ? "en" : "pt-BR");
    document.querySelectorAll("[data-i18n]").forEach(function (elemento) {
      elemento.textContent = t(elemento.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (elemento) {
      var chave = elemento.getAttribute("data-i18n-html");
      elemento.innerHTML = t(chave).replace(/\{forte\}/g, "<strong>").replace(/\{fimforte\}/g, "</strong>");
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (elemento) {
      elemento.placeholder = t(elemento.getAttribute("data-i18n-placeholder"));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (elemento) {
      elemento.title = t(elemento.getAttribute("data-i18n-title"));
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (elemento) {
      elemento.alt = t(elemento.getAttribute("data-i18n-alt"));
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach(function (elemento) {
      elemento.setAttribute("aria-label", t(elemento.getAttribute("data-i18n-aria-label")));
    });
  }

  function definirIdioma(idioma) {
    if (IDIOMAS_VALIDOS.indexOf(idioma) === -1) return;
    idiomaAtual = idioma;
    aplicarIdiomaEstatico();
  }

  window.I18N = {
    t: t,
    ordinal: ordinal,
    localeAtual: localeAtual,
    definirIdioma: definirIdioma,
    aplicarIdiomaEstatico: aplicarIdiomaEstatico,
    idiomasValidos: IDIOMAS_VALIDOS,
  };
})();
