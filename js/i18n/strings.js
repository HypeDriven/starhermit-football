/* StarHermit Football — translation tables (see js/i18n/i18n.js).
 * Each row: [English key, es-419, de-DE, fr-FR, pt-BR, it-IT]. en-GB, es-ES and
 * fr-CA list only where they differ from en-US, es-419 and fr-FR. Menu buttons
 * keep the game's UPPERCASE style. "StarHermit Football", player names and key
 * names stay as they are. Settings → Graphics strings live in js/settings.js,
 * the StarHermit account strings in js/platform-i18n.js.
 */
(function (root) {
  'use strict';
  var ROWS = [
    // ---- main menu
    ['SIGN IN WITH STARHERMIT', 'INICIAR SESIÓN CON STARHERMIT', 'MIT STARHERMIT ANMELDEN', 'SE CONNECTER AVEC STARHERMIT', 'ENTRAR COM STARHERMIT', 'ACCEDI CON STARHERMIT'],
    ['REJOIN MATCH', 'VOLVER AL PARTIDO', 'ZURÜCK INS SPIEL', 'REJOINDRE LE MATCH', 'VOLTAR À PARTIDA', 'RIENTRA IN PARTITA'],
    ['RETURN TO LOBBY', 'VOLVER A LA SALA', 'ZURÜCK ZUR LOBBY', 'RETOUR AU SALON', 'VOLTAR À SALA', 'TORNA ALLA LOBBY'],
    ['QUICK PLAY', 'PARTIDA RÁPIDA', 'SCHNELLSPIEL', 'PARTIE RAPIDE', 'PARTIDA RÁPIDA', 'PARTITA RAPIDA'],
    ['CREATE LOBBY', 'CREAR SALA', 'LOBBY ERSTELLEN', 'CRÉER UN SALON', 'CRIAR SALA', 'CREA LOBBY'],
    ['PRACTICE vs AI', 'PRÁCTICA vs IA', 'TRAINING vs KI', 'ENTRAÎNEMENT vs IA', 'TREINO vs IA', 'ALLENAMENTO vs IA'],
    ['RANKED vs AI', 'CLASIFICATORIA vs IA', 'GEWERTET vs KI', 'CLASSÉ vs IA', 'RANQUEADA vs IA', 'CLASSIFICATA vs IA'],
    ['CONTROLS', 'CONTROLES', 'STEUERUNG', 'COMMANDES', 'CONTROLES', 'COMANDI'],
    ['LEADERBOARD', 'CLASIFICACIÓN', 'BESTENLISTE', 'CLASSEMENT', 'RANKING', 'CLASSIFICA'],
    ['REPLAYS', 'REPETICIONES', 'WIEDERHOLUNGEN', 'REPLAYS', 'REPLAYS', 'REPLAY'],
    ['ACHIEVEMENTS', 'LOGROS', 'ERFOLGE', 'SUCCÈS', 'CONQUISTAS', 'OBIETTIVI'],
    ['INVITE A FRIEND', 'INVITAR A UN AMIGO', 'FREUND EINLADEN', 'INVITER UN AMI', 'CONVIDAR UM AMIGO', 'INVITA UN AMICO'],
    ['SETTINGS', 'AJUSTES', 'EINSTELLUNGEN', 'PARAMÈTRES', 'CONFIGURAÇÕES', 'IMPOSTAZIONI'],
    ['Team size', 'Tamaño del equipo', 'Teamgröße', 'Taille d’équipe', 'Tamanho do time', 'Giocatori'],
    ['per side', 'por lado', 'pro Seite', 'par camp', 'por lado', 'per squadra'],
    ['In-match voice chat — nearby players sound nearby', 'Chat de voz en el partido: los jugadores cercanos se oyen cerca', 'Sprachchat im Spiel – nahe Spieler klingen nah', 'Chat vocal en match — les joueurs proches s’entendent de près', 'Chat de voz na partida — jogadores próximos soam próximos', 'Chat vocale in partita: i giocatori vicini si sentono vicini'],
    ['Voice chat', 'Chat de voz', 'Sprachchat', 'Chat vocal', 'Chat de voz', 'Chat vocale'],
    ['Signed in as {name}', 'Sesión iniciada como {name}', 'Angemeldet als {name}', 'Connecté en tant que {name}', 'Conectado como {name}', 'Accesso come {name}'],
    ['Offline mode — practice only (launch via StarHermit for multiplayer)', 'Modo sin conexión: solo práctica (abre desde StarHermit para multijugador)', 'Offline-Modus – nur Training (über StarHermit starten für Mehrspieler)', 'Mode hors ligne — entraînement seulement (lancez via StarHermit pour le multijoueur)', 'Modo offline — só treino (abra pelo StarHermit para multijogador)', 'Modalità offline: solo allenamento (avvia da StarHermit per il multigiocatore)'],
    ['{name} invited you to a match', '{name} te invitó a un partido', '{name} hat dich zu einem Spiel eingeladen', '{name} vous invite à un match', '{name} convidou você para uma partida', '{name} ti ha invitato a una partita'],
    ['A friend', 'Un amigo', 'Ein Freund', 'Un ami', 'Um amigo', 'Un amico'],
    ['JOIN', 'UNIRSE', 'BEITRETEN', 'REJOINDRE', 'ENTRAR', 'UNISCITI'],
    ['Could not start match: {error}', 'No se pudo iniciar el partido: {error}', 'Spiel konnte nicht gestartet werden: {error}', 'Impossible de lancer le match : {error}', 'Não foi possível iniciar a partida: {error}', 'Impossibile avviare la partita: {error}'],
    ['Could not create lobby: {error}', 'No se pudo crear la sala: {error}', 'Lobby konnte nicht erstellt werden: {error}', 'Impossible de créer le salon : {error}', 'Não foi possível criar a sala: {error}', 'Impossibile creare la lobby: {error}'],
    ['Quick play failed: {error}', 'Falló la partida rápida: {error}', 'Schnellspiel fehlgeschlagen: {error}', 'Échec de la partie rapide : {error}', 'Falha na partida rápida: {error}', 'Partita rapida non riuscita: {error}'],

    // ---- confirm dialogs
    ['LEAVE MATCH?', '¿SALIR DEL PARTIDO?', 'SPIEL VERLASSEN?', 'QUITTER LE MATCH ?', 'SAIR DA PARTIDA?', 'LASCIARE LA PARTITA?'],
    ['You are in a match right now. An AI player will take over your footballer.', 'Estás en un partido ahora. Un jugador de la IA tomará el control de tu futbolista.', 'Du bist gerade in einem Spiel. Ein KI-Spieler übernimmt deinen Fußballer.', 'Vous êtes en plein match. Un joueur IA prendra le contrôle de votre footballeur.', 'Você está numa partida agora. Um jogador da IA vai assumir seu jogador.', 'Sei in partita in questo momento. Un giocatore IA prenderà il controllo del tuo calciatore.'],
    ['LEAVE MATCH', 'SALIR DEL PARTIDO', 'SPIEL VERLASSEN', 'QUITTER LE MATCH', 'SAIR DA PARTIDA', 'LASCIA LA PARTITA'],
    ['CANCEL', 'CANCELAR', 'ABBRECHEN', 'ANNULER', 'CANCELAR', 'ANNULLA'],
    ['LEAVE LOBBY?', '¿SALIR DE LA SALA?', 'LOBBY VERLASSEN?', 'QUITTER LE SALON ?', 'SAIR DA SALA?', 'LASCIARE LA LOBBY?'],
    ['You already have a lobby open. Leave it and continue?', 'Ya tienes una sala abierta. ¿Salir de ella y continuar?', 'Du hast schon eine Lobby offen. Verlassen und fortfahren?', 'Vous avez déjà un salon ouvert. Le quitter et continuer ?', 'Você já tem uma sala aberta. Sair dela e continuar?', 'Hai già una lobby aperta. Lasciarla e continuare?'],
    ['LEAVE LOBBY', 'SALIR DE LA SALA', 'LOBBY VERLASSEN', 'QUITTER LE SALON', 'SAIR DA SALA', 'LASCIA LA LOBBY'],

    // ---- lobby / invites
    ['LOBBY', 'SALA', 'LOBBY', 'SALON', 'SALA', 'LOBBY'],
    ['INVITE FRIENDS', 'INVITAR AMIGOS', 'FREUNDE EINLADEN', 'INVITER DES AMIS', 'CONVIDAR AMIGOS', 'INVITA AMICI'],
    ['COPY INVITE LINK', 'COPIAR ENLACE', 'EINLADUNGSLINK KOPIEREN', 'COPIER LE LIEN', 'COPIAR LINK', 'COPIA LINK INVITO'],
    ['FIND MATCH', 'BUSCAR PARTIDO', 'SPIEL SUCHEN', 'TROUVER UN MATCH', 'BUSCAR PARTIDA', 'TROVA PARTITA'],
    ['LEAVE', 'SALIR', 'VERLASSEN', 'QUITTER', 'SAIR', 'ESCI'],
    ['BACK', 'VOLVER', 'ZURÜCK', 'RETOUR', 'VOLTAR', 'INDIETRO'],
    ['Starting match…', 'Iniciando partido…', 'Spiel startet …', 'Lancement du match…', 'Iniciando partida…', 'Avvio della partita…'],
    ['Searching for a match…', 'Buscando partido…', 'Suche ein Spiel …', 'Recherche d’un match…', 'Procurando partida…', 'Ricerca di una partita…'],
    ['Loading friends…', 'Cargando amigos…', 'Freunde werden geladen …', 'Chargement des amis…', 'Carregando amigos…', 'Caricamento amici…'],
    ['No friends yet — add friends on StarHermit first.', 'Aún no tienes amigos: agrégalos primero en StarHermit.', 'Noch keine Freunde – füge zuerst auf StarHermit welche hinzu.', 'Pas encore d’amis — ajoutez-en d’abord sur StarHermit.', 'Nenhum amigo ainda — adicione amigos no StarHermit primeiro.', 'Ancora nessun amico: aggiungili prima su StarHermit.'],
    ['online', 'en línea', 'online', 'en ligne', 'online', 'online'],
    ['INVITE', 'INVITAR', 'EINLADEN', 'INVITER', 'CONVIDAR', 'INVITA'],
    ['SENT', 'ENVIADO', 'GESENDET', 'ENVOYÉ', 'ENVIADO', 'INVIATO'],
    ['ERROR', 'ERROR', 'FEHLER', 'ERREUR', 'ERRO', 'ERRORE'],
    ['Sign in via StarHermit to share an invite link.', 'Inicia sesión con StarHermit para compartir un enlace de invitación.', 'Melde dich über StarHermit an, um einen Einladungslink zu teilen.', 'Connectez-vous via StarHermit pour partager un lien d’invitation.', 'Entre pelo StarHermit para compartilhar um link de convite.', 'Accedi con StarHermit per condividere un link di invito.'],
    ['Invite link copied — send it to anyone to play together.', 'Enlace copiado: envíalo a quien quieras para jugar juntos.', 'Einladungslink kopiert – schick ihn an alle, mit denen du spielen willst.', 'Lien d’invitation copié — envoyez-le à qui vous voulez pour jouer ensemble.', 'Link de convite copiado — envie para quem quiser jogar junto.', 'Link di invito copiato: mandalo a chi vuoi per giocare insieme.'],
    ['Could not copy the invite link.', 'No se pudo copiar el enlace de invitación.', 'Einladungslink konnte nicht kopiert werden.', 'Impossible de copier le lien d’invitation.', 'Não foi possível copiar o link de convite.', 'Impossibile copiare il link di invito.'],
    ['Finding players…', 'Buscando jugadores…', 'Suche Spieler …', 'Recherche de joueurs…', 'Procurando jogadores…', 'Ricerca giocatori…'],
    ['Finding players… {n}s', 'Buscando jugadores… {n} s', 'Suche Spieler … {n} s', 'Recherche de joueurs… {n} s', 'Procurando jogadores… {n} s', 'Ricerca giocatori… {n} s'],
    ['Only the lobby host can start matchmaking', 'Solo el anfitrión de la sala puede buscar partido', 'Nur der Lobby-Gastgeber kann die Spielsuche starten', 'Seul l’hôte du salon peut lancer la recherche', 'Só o anfitrião da sala pode iniciar a busca', 'Solo l’host della lobby può avviare la ricerca'],
    ['BLUE', 'AZUL', 'BLAU', 'BLEU', 'AZUL', 'BLU'],
    ['RED', 'ROJO', 'ROT', 'ROUGE', 'VERMELHO', 'ROSSO'],
    ['{name} (AI)', '{name} (IA)', '{name} (KI)', '{name} (IA)', '{name} (IA)', '{name} (IA)'],
    ['— open —', '— libre —', '– frei –', '— libre —', '— livre —', '— libero —'],
    ['Move me here to play {role}', 'Muéveme aquí para jugar de {role}', 'Hierher wechseln und als {role} spielen', 'Me placer ici pour jouer {role}', 'Me mover para cá para jogar de {role}', 'Spostami qui per giocare da {role}'],
    ['Goalkeeper', 'Portero', 'Torwart', 'Gardien', 'Goleiro', 'Portiere'],
    ['Defender', 'Defensa', 'Verteidiger', 'Défenseur', 'Zagueiro', 'Difensore'],
    ['Midfielder', 'Mediocampista', 'Mittelfeldspieler', 'Milieu', 'Meio-campista', 'Centrocampista'],
    ['Forward', 'Delantero', 'Stürmer', 'Attaquant', 'Atacante', 'Attaccante'],
    ['{n} player in lobby', '{n} jugador en la sala', '{n} Spieler in der Lobby', '{n} joueur dans le salon', '{n} jogador na sala', '{n} giocatore nella lobby'],
    ['{n} players in lobby', '{n} jugadores en la sala', '{n} Spieler in der Lobby', '{n} joueurs dans le salon', '{n} jogadores na sala', '{n} giocatori nella lobby'],

    // ---- controls screen
    ['SAVE', 'GUARDAR', 'SPEICHERN', 'ENREGISTRER', 'SALVAR', 'SALVA'],
    ['RESET ALL', 'RESTABLECER TODO', 'ALLES ZURÜCKSETZEN', 'TOUT RÉINITIALISER', 'REDEFINIR TUDO', 'RIPRISTINA TUTTO'],
    ['Loading controls…', 'Cargando controles…', 'Steuerung wird geladen …', 'Chargement des commandes…', 'Carregando controles…', 'Caricamento comandi…'],
    ['Click a key to rebind it. Esc cancels. In a match, click the pitch for mouse camera; left mouse shoots, right passes, middle tackles.', 'Haz clic en una tecla para reasignarla. Esc cancela. En el partido, haz clic en la cancha para la cámara con ratón; clic izquierdo dispara, derecho pasa, central entra.', 'Klicke eine Taste an, um sie neu zu belegen. Esc bricht ab. Im Spiel: Spielfeld anklicken für die Mauskamera; links schießt, rechts passt, Mitte grätscht.', 'Cliquez sur une touche pour la réaffecter. Échap annule. En match, cliquez sur le terrain pour la caméra souris ; clic gauche tire, droit passe, milieu tacle.', 'Clique numa tecla para remapear. Esc cancela. Na partida, clique no campo para a câmera do mouse; botão esquerdo chuta, direito passa, do meio dá carrinho.', 'Fai clic su un tasto per riassegnarlo. Esc annulla. In partita, clicca sul campo per la visuale col mouse; sinistro tira, destro passa, centrale contrasta.'],
    ['Remapping is not available for this game on this platform. These are the built-in controls.', 'La reasignación no está disponible para este juego en esta plataforma. Estos son los controles integrados.', 'Neubelegung ist für dieses Spiel auf dieser Plattform nicht verfügbar. Das ist die Standardsteuerung.', 'La réaffectation n’est pas disponible pour ce jeu sur cette plateforme. Voici les commandes intégrées.', 'O remapeamento não está disponível para este jogo nesta plataforma. Estes são os controles padrão.', 'La riassegnazione non è disponibile per questo gioco su questa piattaforma. Questi sono i comandi predefiniti.'],
    ['Move forward', 'Avanzar', 'Vorwärts', 'Avancer', 'Avançar', 'Avanti'],
    ['Move back', 'Retroceder', 'Rückwärts', 'Reculer', 'Recuar', 'Indietro'],
    ['Turn left', 'Girar a la izquierda', 'Links drehen', 'Tourner à gauche', 'Virar à esquerda', 'Gira a sinistra'],
    ['Turn right', 'Girar a la derecha', 'Rechts drehen', 'Tourner à droite', 'Virar à direita', 'Gira a destra'],
    ['Shoot (hold to charge)', 'Disparar (mantén para cargar)', 'Schießen (halten zum Aufladen)', 'Tirer (maintenir pour charger)', 'Chutar (segure para carregar)', 'Tira (tieni premuto per caricare)'],
    ['Pass', 'Pasar', 'Passen', 'Passe', 'Passe', 'Passaggio'],
    ['Tackle', 'Entrar', 'Grätschen', 'Tacle', 'Carrinho', 'Contrasto'],
    ['PRESS A KEY…', 'PULSA UNA TECLA…', 'TASTE DRÜCKEN …', 'APPUYEZ SUR UNE TOUCHE…', 'PRESSIONE UMA TECLA…', 'PREMI UN TASTO…'],
    ['default', 'predeterminado', 'Standard', 'par défaut', 'padrão', 'predefinito'],
    ['Two actions share a key — rebind one of them to save.', 'Dos acciones comparten una tecla: reasigna una para guardar.', 'Zwei Aktionen teilen sich eine Taste – belege eine neu, um zu speichern.', 'Deux actions partagent une touche — réaffectez-en une pour enregistrer.', 'Duas ações usam a mesma tecla — remapeie uma para salvar.', 'Due azioni usano lo stesso tasto: riassegnane una per salvare.'],
    ['Click a key to rebind it. Esc cancels. Mouse: left shoots, right passes, middle tackles.', 'Haz clic en una tecla para reasignarla. Esc cancela. Ratón: izquierdo dispara, derecho pasa, central entra.', 'Klicke eine Taste an, um sie neu zu belegen. Esc bricht ab. Maus: links schießt, rechts passt, Mitte grätscht.', 'Cliquez sur une touche pour la réaffecter. Échap annule. Souris : gauche tire, droit passe, milieu tacle.', 'Clique numa tecla para remapear. Esc cancela. Mouse: esquerdo chuta, direito passa, meio dá carrinho.', 'Fai clic su un tasto per riassegnarlo. Esc annulla. Mouse: sinistro tira, destro passa, centrale contrasta.'],
    ['Saving…', 'Guardando…', 'Wird gespeichert …', 'Enregistrement…', 'Salvando…', 'Salvataggio…'],
    ['Saved.', 'Guardado.', 'Gespeichert.', 'Enregistré.', 'Salvo.', 'Salvato.'],
    ['Could not save: {error}', 'No se pudo guardar: {error}', 'Speichern fehlgeschlagen: {error}', 'Impossible d’enregistrer : {error}', 'Não foi possível salvar: {error}', 'Impossibile salvare: {error}'],
    ['Resetting…', 'Restableciendo…', 'Wird zurückgesetzt …', 'Réinitialisation…', 'Redefinindo…', 'Ripristino…'],
    ['Reset to defaults.', 'Restablecido a los valores predeterminados.', 'Auf Standard zurückgesetzt.', 'Valeurs par défaut rétablies.', 'Padrões restaurados.', 'Ripristinati i valori predefiniti.'],
    ['Could not reset: {error}', 'No se pudo restablecer: {error}', 'Zurücksetzen fehlgeschlagen: {error}', 'Impossible de réinitialiser : {error}', 'Não foi possível redefinir: {error}', 'Impossibile ripristinare: {error}'],

    // ---- leaderboard / replays
    ['Friends only', 'Solo amigos', 'Nur Freunde', 'Amis seulement', 'Só amigos', 'Solo amici'],
    ['PREV', 'ANTERIOR', 'ZURÜCK', 'PRÉC.', 'ANTERIOR', 'PREC.'],
    ['NEXT', 'SIGUIENTE', 'WEITER', 'SUIV.', 'PRÓXIMO', 'SUCC.'],
    ['Loading…', 'Cargando…', 'Wird geladen …', 'Chargement…', 'Carregando…', 'Caricamento…'],
    ['Could not load leaderboard: {error}', 'No se pudo cargar la clasificación: {error}', 'Bestenliste konnte nicht geladen werden: {error}', 'Impossible de charger le classement : {error}', 'Não foi possível carregar o ranking: {error}', 'Impossibile caricare la classifica: {error}'],
    ['MY RATING', 'MI PUNTUACIÓN', 'MEINE WERTUNG', 'MON CLASSEMENT', 'MINHA PONTUAÇÃO', 'IL MIO PUNTEGGIO'],
    ['Unrated — finish a match to get a rating.', 'Sin puntuación: termina un partido para obtenerla.', 'Ohne Wertung – beende ein Spiel, um eine zu bekommen.', 'Non classé — terminez un match pour obtenir un classement.', 'Sem pontuação — termine uma partida para ganhar uma.', 'Senza punteggio: completa una partita per ottenerne uno.'],
    ['{w}W · {l}L · {d}D', '{w}G · {l}P · {d}E', '{w}S · {l}N · {d}U', '{w}V · {l}D · {d}N', '{w}V · {l}D · {d}E', '{w}V · {l}S · {d}P'],
    ['No rated players yet.', 'Aún no hay jugadores con puntuación.', 'Noch keine gewerteten Spieler.', 'Aucun joueur classé pour l’instant.', 'Nenhum jogador pontuado ainda.', 'Ancora nessun giocatore classificato.'],
    ['Could not load entries: {error}', 'No se pudieron cargar las entradas: {error}', 'Einträge konnten nicht geladen werden: {error}', 'Impossible de charger les entrées : {error}', 'Não foi possível carregar as entradas: {error}', 'Impossibile caricare le voci: {error}'],
    ['Could not load replays: {error}', 'No se pudieron cargar las repeticiones: {error}', 'Wiederholungen konnten nicht geladen werden: {error}', 'Impossible de charger les replays : {error}', 'Não foi possível carregar os replays: {error}', 'Impossibile caricare i replay: {error}'],
    ['No replays yet — finish an online match.', 'Aún no hay repeticiones: termina un partido en línea.', 'Noch keine Wiederholungen – beende ein Online-Spiel.', 'Pas encore de replays — terminez un match en ligne.', 'Nenhum replay ainda — termine uma partida online.', 'Ancora nessun replay: completa una partita online.'],
    ['WATCH', 'VER', 'ANSEHEN', 'REGARDER', 'ASSISTIR', 'GUARDA'],
    ['Loading replay…', 'Cargando repetición…', 'Wiederholung wird geladen …', 'Chargement du replay…', 'Carregando replay…', 'Caricamento replay…'],
    ['Replay unavailable.', 'Repetición no disponible.', 'Wiederholung nicht verfügbar.', 'Replay indisponible.', 'Replay indisponível.', 'Replay non disponibile.'],
    ['replay truncated', 'repetición truncada', 'Wiederholung gekürzt', 'replay tronqué', 'replay truncado', 'replay troncato'],
    ['PAUSE', 'PAUSA', 'PAUSE', 'PAUSE', 'PAUSAR', 'PAUSA'],
    ['PLAY', 'REPRODUCIR', 'ABSPIELEN', 'LECTURE', 'REPRODUZIR', 'RIPRODUCI'],
    ['EXIT', 'SALIR', 'BEENDEN', 'QUITTER', 'SAIR', 'ESCI'],

    // ---- HUD / match
    ['You', 'Tú', 'Du', 'Vous', 'Você', 'Tu'],
    ['HOME', 'LOCAL', 'HEIM', 'DOMICILE', 'CASA', 'CASA'],
    ['AWAY', 'VISITA', 'GAST', 'EXTÉRIEUR', 'FORA', 'OSPITI'],
    ['1st {time}', '1T {time}', '1. HZ {time}', '1re {time}', '1º T {time}', '1° T {time}'],
    ['2nd {time}', '2T {time}', '2. HZ {time}', '2e {time}', '2º T {time}', '2° T {time}'],
    ['Match menu', 'Menú del partido', 'Spielmenü', 'Menu du match', 'Menu da partida', 'Menu partita'],
    ['Menu (Esc)', 'Menú (Esc)', 'Menü (Esc)', 'Menu (Échap)', 'Menu (Esc)', 'Menu (Esc)'],
    ['CLICK THE PITCH FOR MOUSE CAMERA · LEFT SHOOT · RIGHT PASS · MIDDLE TACKLE', 'HAZ CLIC EN LA CANCHA PARA LA CÁMARA CON RATÓN · IZQ. DISPARO · DER. PASE · CENTRAL ENTRADA', 'SPIELFELD ANKLICKEN FÜR MAUSKAMERA · LINKS SCHUSS · RECHTS PASS · MITTE GRÄTSCHE', 'CLIQUEZ SUR LE TERRAIN POUR LA CAMÉRA SOURIS · GAUCHE TIR · DROIT PASSE · MILIEU TACLE', 'CLIQUE NO CAMPO PARA A CÂMERA DO MOUSE · ESQ. CHUTE · DIR. PASSE · MEIO CARRINHO', 'CLICCA SUL CAMPO PER LA VISUALE COL MOUSE · SINISTRO TIRO · DESTRO PASSAGGIO · CENTRALE CONTRASTO'],
    ['TACKLE', 'ENTRADA', 'GRÄTSCHE', 'TACLE', 'CARRINHO', 'CONTRASTO'],
    ['PASS', 'PASE', 'PASS', 'PASSE', 'PASSE', 'PASSA'],
    ['SHOOT', 'DISPARO', 'SCHUSS', 'TIR', 'CHUTE', 'TIRA'],
    ['{team} KICKS OFF', 'SACA {team}', '{team} HAT ANSTOSS', 'COUP D’ENVOI POUR {team}', '{team} DÁ A SAÍDA', 'CALCIO D’INIZIO {team}'],
    ['GOAL!', '¡GOL!', 'TOR!', 'BUT !', 'GOL!', 'GOL!'],
    ['OWN GOAL!', '¡AUTOGOL!', 'EIGENTOR!', 'BUT CONTRE SON CAMP !', 'GOL CONTRA!', 'AUTOGOL!'],
    ['HALF TIME', 'MEDIO TIEMPO', 'HALBZEIT', 'MI-TEMPS', 'INTERVALO', 'INTERVALLO'],
    ['FULL TIME', 'FINAL DEL PARTIDO', 'ABPFIFF', 'FIN DU MATCH', 'FIM DE JOGO', 'FINE PARTITA'],
    ["INJURY — {name} CAN'T CONTINUE", 'LESIÓN: {name} NO PUEDE SEGUIR', 'VERLETZUNG – {name} KANN NICHT WEITERSPIELEN', 'BLESSURE — {name} NE PEUT PAS CONTINUER', 'LESÃO — {name} NÃO PODE CONTINUAR', 'INFORTUNIO — {name} NON PUÒ CONTINUARE'],
    ['{name} IS BACK', '{name} REGRESA', '{name} IST ZURÜCK', '{name} EST DE RETOUR', '{name} VOLTOU', '{name} È TORNATO'],
    ['{name} COMES ON', 'ENTRA {name}', '{name} KOMMT INS SPIEL', '{name} ENTRE EN JEU', '{name} ENTRA EM CAMPO', 'ENTRA {name}'],
    ['MATCH ABANDONED — DRAW', 'PARTIDO ABANDONADO: EMPATE', 'SPIEL ABGEBROCHEN – UNENTSCHIEDEN', 'MATCH ABANDONNÉ — NUL', 'PARTIDA ABANDONADA — EMPATE', 'PARTITA ABBANDONATA — PAREGGIO'],
    ['Achievement unlocked: {name}', 'Logro desbloqueado: {name}', 'Erfolg freigeschaltet: {name}', 'Succès débloqué : {name}', 'Conquista desbloqueada: {name}', 'Obiettivo sbloccato: {name}'],
    ['Connection lost', 'Se perdió la conexión', 'Verbindung verloren', 'Connexion perdue', 'Conexão perdida', 'Connessione persa'],
    ['Could not connect: {error}', 'No se pudo conectar: {error}', 'Verbindung fehlgeschlagen: {error}', 'Connexion impossible : {error}', 'Não foi possível conectar: {error}', 'Impossibile connettersi: {error}'],
    ['Match session unavailable — the server could not start the game.', 'Sesión de partido no disponible: el servidor no pudo iniciar el juego.', 'Spielsitzung nicht verfügbar – der Server konnte das Spiel nicht starten.', 'Session de match indisponible — le serveur n’a pas pu lancer la partie.', 'Sessão da partida indisponível — o servidor não conseguiu iniciar o jogo.', 'Sessione di partita non disponibile: il server non è riuscito ad avviare il gioco.'],
    ['This match is no longer available.', 'Este partido ya no está disponible.', 'Dieses Spiel ist nicht mehr verfügbar.', 'Ce match n’est plus disponible.', 'Esta partida não está mais disponível.', 'Questa partita non è più disponibile.'],
    ['MIC OFF · M', 'MIC APAGADO · M', 'MIKRO AUS · M', 'MICRO COUPÉ · M', 'MIC DESLIGADO · M', 'MIC SPENTO · M'],
    ['MIC ON · M', 'MIC ENCENDIDO · M', 'MIKRO AN · M', 'MICRO ACTIVÉ · M', 'MIC LIGADO · M', 'MIC ACCESO · M'],
    ['Press T to chat', 'Pulsa T para chatear', 'T drücken zum Chatten', 'Appuyez sur T pour discuter', 'Aperte T para conversar', 'Premi T per chattare'],
    ['chat unavailable', 'chat no disponible', 'Chat nicht verfügbar', 'chat indisponible', 'chat indisponível', 'chat non disponibile'],
    ['slow down…', 'más despacio…', 'langsamer …', 'doucement…', 'mais devagar…', 'rallenta…'],
    ['slow down — chat rate limit', 'más despacio: límite del chat', 'langsamer – Chat-Limit', 'doucement — limite du chat', 'mais devagar — limite do chat', 'rallenta: limite della chat'],
    ['message not sent', 'mensaje no enviado', 'Nachricht nicht gesendet', 'message non envoyé', 'mensagem não enviada', 'messaggio non inviato'],

    // ---- match menu
    ['MATCH MENU', 'MENÚ DEL PARTIDO', 'SPIELMENÜ', 'MENU DU MATCH', 'MENU DA PARTIDA', 'MENU PARTITA'],
    ['PRACTICE PAUSED', 'PRÁCTICA EN PAUSA', 'TRAINING PAUSIERT', 'ENTRAÎNEMENT EN PAUSE', 'TREINO PAUSADO', 'ALLENAMENTO IN PAUSA'],
    ['Practice is paused while this menu is open.', 'La práctica está en pausa mientras este menú está abierto.', 'Das Training pausiert, solange dieses Menü offen ist.', 'L’entraînement est en pause tant que ce menu est ouvert.', 'O treino fica pausado enquanto este menu está aberto.', 'L’allenamento è in pausa finché questo menu è aperto.'],
    ['The practice match waits while this menu is open.', 'El partido de práctica espera mientras este menú está abierto.', 'Das Trainingsspiel wartet, solange dieses Menü offen ist.', 'Le match d’entraînement attend tant que ce menu est ouvert.', 'A partida de treino espera enquanto este menu está aberto.', 'La partita di allenamento attende finché questo menu è aperto.'],
    ['Online play continues; an AI player takes over if you leave.', 'El juego en línea continúa; un jugador de la IA te reemplaza si sales.', 'Das Online-Spiel läuft weiter; verlässt du es, übernimmt ein KI-Spieler.', 'Le jeu en ligne continue ; un joueur IA prend le relais si vous partez.', 'O jogo online continua; um jogador da IA assume se você sair.', 'Il gioco online continua; se esci subentra un giocatore IA.'],
    ['Move: WASD / arrows or the joystick · Shoot: left mouse or SHOOT · Pass: right mouse or PASS · Tackle: middle mouse or TACKLE · Click the pitch for mouse camera.', 'Mover: WASD / flechas o el joystick · Disparo: clic izquierdo o DISPARO · Pase: clic derecho o PASE · Entrada: clic central o ENTRADA · Haz clic en la cancha para la cámara con ratón.', 'Bewegen: WASD / Pfeiltasten oder Joystick · Schuss: linke Maustaste oder SCHUSS · Pass: rechte Maustaste oder PASS · Grätsche: mittlere Maustaste oder GRÄTSCHE · Spielfeld anklicken für Mauskamera.', 'Déplacement : ZQSD/WASD / flèches ou joystick · Tir : clic gauche ou TIR · Passe : clic droit ou PASSE · Tacle : clic milieu ou TACLE · Cliquez sur le terrain pour la caméra souris.', 'Mover: WASD / setas ou o joystick · Chute: botão esquerdo ou CHUTE · Passe: botão direito ou PASSE · Carrinho: botão do meio ou CARRINHO · Clique no campo para a câmera do mouse.', 'Movimento: WASD / frecce o joystick · Tiro: sinistro o TIRA · Passaggio: destro o PASSA · Contrasto: centrale o CONTRASTO · Clicca sul campo per la visuale col mouse.'],
    ['KEEP PLAYING', 'SEGUIR JUGANDO', 'WEITERSPIELEN', 'CONTINUER', 'CONTINUAR JOGANDO', 'CONTINUA A GIOCARE'],
    ['RESTART PRACTICE', 'REINICIAR PRÁCTICA', 'TRAINING NEU STARTEN', 'RECOMMENCER L’ENTRAÎNEMENT', 'REINICIAR TREINO', 'RICOMINCIA ALLENAMENTO'],
    ['SOUND: ON', 'SONIDO: SÍ', 'TON: AN', 'SON : ACTIVÉ', 'SOM: LIGADO', 'AUDIO: ON'],
    ['SOUND: OFF', 'SONIDO: NO', 'TON: AUS', 'SON : COUPÉ', 'SOM: DESLIGADO', 'AUDIO: OFF'],
    ['BACK TO MENU', 'VOLVER AL MENÚ', 'ZUM MENÜ', 'RETOUR AU MENU', 'VOLTAR AO MENU', 'TORNA AL MENU'],
    ['Graphics', 'Gráficos', 'Grafik', 'Graphismes', 'Gráficos', 'Grafica'],

    // ---- result
    ['DRAW', 'EMPATE', 'UNENTSCHIEDEN', 'MATCH NUL', 'EMPATE', 'PAREGGIO'],
    ['VICTORY', 'VICTORIA', 'SIEG', 'VICTOIRE', 'VITÓRIA', 'VITTORIA'],
    ['DEFEAT', 'DERROTA', 'NIEDERLAGE', 'DÉFAITE', 'DERROTA', 'SCONFITTA'],
    ['Possession: {a}% – {b}%', 'Posesión: {a} % – {b} %', 'Ballbesitz: {a} % – {b} %', 'Possession : {a} % – {b} %', 'Posse de bola: {a}% – {b}%', 'Possesso palla: {a}% – {b}%'],
    ['Shots: {a} – {b}', 'Tiros: {a} – {b}', 'Schüsse: {a} – {b}', 'Tirs : {a} – {b}', 'Chutes: {a} – {b}', 'Tiri: {a} – {b}'],
    ['MAIN MENU', 'MENÚ PRINCIPAL', 'HAUPTMENÜ', 'MENU PRINCIPAL', 'MENU PRINCIPAL', 'MENU PRINCIPALE']
  ];

  var FULL = ['es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT'];
  var S = root.FB_STRINGS = root.FB_STRINGS || {};
  S['en-US'] = {};
  S['en-GB'] = {};
  S['es-ES'] = {
    'HALF TIME': 'DESCANSO',
    'AWAY': 'VISITANTE',
    'Tackle': 'Entrada',
    'online': 'conectado'
  };
  S['fr-CA'] = {
    'Press T to chat': 'Appuyez sur T pour clavarder',
    'chat unavailable': 'clavardage indisponible'
  };
  FULL.forEach(function (l, i) {
    var t = S[l] = {};
    ROWS.forEach(function (r) { t[r[0]] = r[i + 1]; });
  });
})(typeof self !== 'undefined' ? self : this);
