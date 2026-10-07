// platform-i18n.js — localized strings for the StarHermit account surface
// (sign-in, invite link, sign-out notice, session-expired prompt,
// achievements screen), picked from
// navigator.language like the Settings panel.
import { pickLocale } from './settings.js?v=10';

const STRINGS = {
  'en-US': {
    expiredTitle: 'Session expired', expiredText: 'Your StarHermit session has expired, so online play stopped. Go back to StarHermit to start a fresh session, or keep playing practice offline.',
    relaunch: 'Back to StarHermit', playOffline: 'Play offline', relaunchFailed: 'Could not open StarHermit — reopen the game from the StarHermit library.',
    signIn: 'Sign in with StarHermit', invite: 'Invite a friend',
    inviteCopied: 'Invite link copied — send it to anyone to play together.', inviteFailed: 'Could not copy the invite link.',
    signedOut: 'Signed out of StarHermit — practice is still available.',
    achievements: 'Achievements', achLoading: 'Loading…', achEmpty: 'No achievements are available yet.',
    achFailed: 'Could not load achievements.', achUnlocked: 'Unlocked', achLocked: 'Locked', back: 'Back',
    lbPosting: 'Posting to the leaderboard…', lbRank: 'Leaderboard rank: #{rank}', lbPosted: 'Score posted to the leaderboard.', lbNotPosted: 'Score not posted to the leaderboard.',
  },
  'en-GB': {},
  'es-419': {
    expiredTitle: 'Sesión vencida', expiredText: 'Tu sesión de StarHermit venció y el juego en línea se detuvo. Vuelve a StarHermit para iniciar una sesión nueva o sigue jugando la práctica sin conexión.',
    relaunch: 'Volver a StarHermit', playOffline: 'Jugar sin conexión', relaunchFailed: 'No se pudo abrir StarHermit: vuelve a abrir el juego desde la biblioteca de StarHermit.',
    signIn: 'Iniciar sesión con StarHermit', invite: 'Invitar a un amigo',
    inviteCopied: 'Enlace de invitación copiado: envíalo a quien quieras para jugar juntos.', inviteFailed: 'No se pudo copiar el enlace de invitación.',
    signedOut: 'Se cerró la sesión de StarHermit; la práctica sigue disponible.',
    achievements: 'Logros', achLoading: 'Cargando…', achEmpty: 'Todavía no hay logros disponibles.',
    achFailed: 'No se pudieron cargar los logros.', achUnlocked: 'Desbloqueado', achLocked: 'Bloqueado', back: 'Volver',
    lbPosting: 'Publicando en la clasificación…', lbRank: 'Puesto en la clasificación: #{rank}', lbPosted: 'Resultado publicado en la clasificación.', lbNotPosted: 'El resultado no se publicó en la clasificación.',
  },
  'es-ES': {
    expiredTitle: 'Sesión caducada', expiredText: 'Tu sesión de StarHermit ha caducado y el juego en línea se ha detenido. Vuelve a StarHermit para iniciar una sesión nueva o sigue jugando al modo práctica sin conexión.',
    relaunch: 'Volver a StarHermit', playOffline: 'Jugar sin conexión', relaunchFailed: 'No se ha podido abrir StarHermit: vuelve a abrir el juego desde la biblioteca de StarHermit.',
    signIn: 'Iniciar sesión con StarHermit', invite: 'Invitar a un amigo',
    inviteCopied: 'Enlace de invitación copiado: envíaselo a quien quieras para jugar juntos.', inviteFailed: 'No se ha podido copiar el enlace de invitación.',
    signedOut: 'Se ha cerrado la sesión de StarHermit; el modo práctica sigue disponible.',
    achievements: 'Logros', achLoading: 'Cargando…', achEmpty: 'Todavía no hay logros disponibles.',
    achFailed: 'No se han podido cargar los logros.', achUnlocked: 'Desbloqueado', achLocked: 'Bloqueado', back: 'Volver',
    lbPosting: 'Publicando en la clasificación…', lbRank: 'Puesto en la clasificación: #{rank}', lbPosted: 'Resultado publicado en la clasificación.', lbNotPosted: 'El resultado no se ha publicado en la clasificación.',
  },
  'de-DE': {
    expiredTitle: 'Sitzung abgelaufen', expiredText: 'Deine StarHermit-Sitzung ist abgelaufen, daher wurde das Online-Spiel beendet. Kehre zu StarHermit zurück, um eine neue Sitzung zu starten, oder spiele offline im Training weiter.',
    relaunch: 'Zurück zu StarHermit', playOffline: 'Offline spielen', relaunchFailed: 'StarHermit konnte nicht geöffnet werden – starte das Spiel erneut aus der StarHermit-Bibliothek.',
    signIn: 'Mit StarHermit anmelden', invite: 'Freund einladen',
    inviteCopied: 'Einladungslink kopiert – schick ihn an alle, mit denen du spielen willst.', inviteFailed: 'Einladungslink konnte nicht kopiert werden.',
    signedOut: 'Von StarHermit abgemeldet – das Training ist weiterhin verfügbar.',
    achievements: 'Erfolge', achLoading: 'Wird geladen…', achEmpty: 'Noch keine Erfolge verfügbar.',
    achFailed: 'Erfolge konnten nicht geladen werden.', achUnlocked: 'Freigeschaltet', achLocked: 'Gesperrt', back: 'Zurück',
    lbPosting: 'Wird in die Bestenliste eingetragen …', lbRank: 'Platz in der Bestenliste: #{rank}', lbPosted: 'Ergebnis in die Bestenliste eingetragen.', lbNotPosted: 'Ergebnis nicht in die Bestenliste eingetragen.',
  },
  'fr-FR': {
    expiredTitle: 'Session expirée', expiredText: 'Ta session StarHermit a expiré et le jeu en ligne s’est arrêté. Retourne sur StarHermit pour ouvrir une nouvelle session, ou continue l’entraînement hors ligne.',
    relaunch: 'Retour à StarHermit', playOffline: 'Jouer hors ligne', relaunchFailed: 'Impossible d’ouvrir StarHermit : relance le jeu depuis la bibliothèque StarHermit.',
    signIn: 'Se connecter avec StarHermit', invite: 'Inviter un ami',
    inviteCopied: 'Lien d’invitation copié : envoie-le à qui tu veux pour jouer ensemble.', inviteFailed: 'Impossible de copier le lien d’invitation.',
    signedOut: 'Déconnecté de StarHermit : l’entraînement reste disponible.',
    achievements: 'Succès', achLoading: 'Chargement…', achEmpty: 'Aucun succès disponible pour le moment.',
    achFailed: 'Impossible de charger les succès.', achUnlocked: 'Débloqué', achLocked: 'Verrouillé', back: 'Retour',
    lbPosting: 'Envoi au classement…', lbRank: 'Rang au classement : #{rank}', lbPosted: 'Score inscrit au classement.', lbNotPosted: 'Score non inscrit au classement.',
  },
  'fr-CA': {
    expiredTitle: 'Session expirée', expiredText: 'Ta session StarHermit a expiré et le jeu en ligne s’est arrêté. Retourne sur StarHermit pour ouvrir une nouvelle session, ou continue la pratique hors ligne.',
    relaunch: 'Retour à StarHermit', playOffline: 'Jouer hors ligne', relaunchFailed: 'Impossible d’ouvrir StarHermit : relance le jeu à partir de la bibliothèque StarHermit.',
    signIn: 'Se connecter avec StarHermit', invite: 'Inviter un ami',
    inviteCopied: 'Lien d’invitation copié : envoie-le à qui tu veux pour jouer ensemble.', inviteFailed: 'Impossible de copier le lien d’invitation.',
    signedOut: 'Déconnecté de StarHermit : la pratique reste disponible.',
    achievements: 'Succès', achLoading: 'Chargement…', achEmpty: 'Aucun succès disponible pour l’instant.',
    achFailed: 'Impossible de charger les succès.', achUnlocked: 'Débloqué', achLocked: 'Verrouillé', back: 'Retour',
    lbPosting: 'Envoi au classement…', lbRank: 'Rang au classement : #{rank}', lbPosted: 'Pointage inscrit au classement.', lbNotPosted: 'Pointage non inscrit au classement.',
  },
  'pt-BR': {
    expiredTitle: 'Sessão expirada', expiredText: 'Sua sessão do StarHermit expirou e o jogo online parou. Volte ao StarHermit para iniciar uma nova sessão ou continue treinando offline.',
    relaunch: 'Voltar ao StarHermit', playOffline: 'Jogar offline', relaunchFailed: 'Não foi possível abrir o StarHermit — abra o jogo novamente pela biblioteca do StarHermit.',
    signIn: 'Entrar com StarHermit', invite: 'Convidar um amigo',
    inviteCopied: 'Link de convite copiado — envie para quem quiser jogar junto.', inviteFailed: 'Não foi possível copiar o link de convite.',
    signedOut: 'Você saiu do StarHermit — o treino continua disponível.',
    achievements: 'Conquistas', achLoading: 'Carregando…', achEmpty: 'Ainda não há conquistas disponíveis.',
    achFailed: 'Não foi possível carregar as conquistas.', achUnlocked: 'Desbloqueada', achLocked: 'Bloqueada', back: 'Voltar',
    lbPosting: 'Enviando para o ranking…', lbRank: 'Posição no ranking: #{rank}', lbPosted: 'Placar registrado no ranking.', lbNotPosted: 'Placar não registrado no ranking.',
  },
  'it-IT': {
    expiredTitle: 'Sessione scaduta', expiredText: 'La tua sessione StarHermit è scaduta e il gioco online si è interrotto. Torna su StarHermit per avviare una nuova sessione o continua ad allenarti offline.',
    relaunch: 'Torna a StarHermit', playOffline: 'Gioca offline', relaunchFailed: 'Impossibile aprire StarHermit: riapri il gioco dalla libreria di StarHermit.',
    signIn: 'Accedi con StarHermit', invite: 'Invita un amico',
    inviteCopied: 'Link d’invito copiato: invialo a chi vuoi per giocare insieme.', inviteFailed: 'Impossibile copiare il link d’invito.',
    signedOut: 'Disconnesso da StarHermit: l’allenamento resta disponibile.',
    achievements: 'Obiettivi', achLoading: 'Caricamento…', achEmpty: 'Nessun obiettivo ancora disponibile.',
    achFailed: 'Impossibile caricare gli obiettivi.', achUnlocked: 'Sbloccato', achLocked: 'Bloccato', back: 'Indietro',
    lbPosting: 'Invio alla classifica…', lbRank: 'Posizione in classifica: #{rank}', lbPosted: 'Punteggio registrato in classifica.', lbNotPosted: 'Punteggio non registrato in classifica.',
  },
};

export const PLATFORM_LOCALES = Object.keys(STRINGS);

/** Strings for the browser's locale (en-US fallback per key). */
export function platformStrings(tag = (typeof navigator !== 'undefined' ? (navigator.languages?.[0] || navigator.language) : 'en-US')) {
  return { ...STRINGS['en-US'], ...STRINGS[pickLocale(tag)] };
}
