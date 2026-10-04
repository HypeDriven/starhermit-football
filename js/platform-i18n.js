// platform-i18n.js — localized strings for the StarHermit account surface
// (sign-in, invite link, sign-out notice, achievements screen), picked from
// navigator.language like the Settings panel.
import { pickLocale } from './settings.js?v=9';

const STRINGS = {
  'en-US': {
    signIn: 'Sign in with StarHermit', invite: 'Invite a friend',
    inviteCopied: 'Invite link copied — send it to anyone to play together.', inviteFailed: 'Could not copy the invite link.',
    signedOut: 'Signed out of StarHermit — practice is still available.',
    achievements: 'Achievements', achLoading: 'Loading…', achEmpty: 'No achievements are available yet.',
    achFailed: 'Could not load achievements.', achUnlocked: 'Unlocked', achLocked: 'Locked', back: 'Back',
  },
  'en-GB': {},
  'es-419': {
    signIn: 'Iniciar sesión con StarHermit', invite: 'Invitar a un amigo',
    inviteCopied: 'Enlace de invitación copiado: envíalo a quien quieras para jugar juntos.', inviteFailed: 'No se pudo copiar el enlace de invitación.',
    signedOut: 'Se cerró la sesión de StarHermit; la práctica sigue disponible.',
    achievements: 'Logros', achLoading: 'Cargando…', achEmpty: 'Todavía no hay logros disponibles.',
    achFailed: 'No se pudieron cargar los logros.', achUnlocked: 'Desbloqueado', achLocked: 'Bloqueado', back: 'Volver',
  },
  'es-ES': {
    signIn: 'Iniciar sesión con StarHermit', invite: 'Invitar a un amigo',
    inviteCopied: 'Enlace de invitación copiado: envíaselo a quien quieras para jugar juntos.', inviteFailed: 'No se ha podido copiar el enlace de invitación.',
    signedOut: 'Se ha cerrado la sesión de StarHermit; el modo práctica sigue disponible.',
    achievements: 'Logros', achLoading: 'Cargando…', achEmpty: 'Todavía no hay logros disponibles.',
    achFailed: 'No se han podido cargar los logros.', achUnlocked: 'Desbloqueado', achLocked: 'Bloqueado', back: 'Volver',
  },
  'de-DE': {
    signIn: 'Mit StarHermit anmelden', invite: 'Freund einladen',
    inviteCopied: 'Einladungslink kopiert – schick ihn an alle, mit denen du spielen willst.', inviteFailed: 'Einladungslink konnte nicht kopiert werden.',
    signedOut: 'Von StarHermit abgemeldet – das Training ist weiterhin verfügbar.',
    achievements: 'Erfolge', achLoading: 'Wird geladen…', achEmpty: 'Noch keine Erfolge verfügbar.',
    achFailed: 'Erfolge konnten nicht geladen werden.', achUnlocked: 'Freigeschaltet', achLocked: 'Gesperrt', back: 'Zurück',
  },
  'fr-FR': {
    signIn: 'Se connecter avec StarHermit', invite: 'Inviter un ami',
    inviteCopied: 'Lien d’invitation copié : envoie-le à qui tu veux pour jouer ensemble.', inviteFailed: 'Impossible de copier le lien d’invitation.',
    signedOut: 'Déconnecté de StarHermit : l’entraînement reste disponible.',
    achievements: 'Succès', achLoading: 'Chargement…', achEmpty: 'Aucun succès disponible pour le moment.',
    achFailed: 'Impossible de charger les succès.', achUnlocked: 'Débloqué', achLocked: 'Verrouillé', back: 'Retour',
  },
  'fr-CA': {
    signIn: 'Se connecter avec StarHermit', invite: 'Inviter un ami',
    inviteCopied: 'Lien d’invitation copié : envoie-le à qui tu veux pour jouer ensemble.', inviteFailed: 'Impossible de copier le lien d’invitation.',
    signedOut: 'Déconnecté de StarHermit : la pratique reste disponible.',
    achievements: 'Succès', achLoading: 'Chargement…', achEmpty: 'Aucun succès disponible pour l’instant.',
    achFailed: 'Impossible de charger les succès.', achUnlocked: 'Débloqué', achLocked: 'Verrouillé', back: 'Retour',
  },
  'pt-BR': {
    signIn: 'Entrar com StarHermit', invite: 'Convidar um amigo',
    inviteCopied: 'Link de convite copiado — envie para quem quiser jogar junto.', inviteFailed: 'Não foi possível copiar o link de convite.',
    signedOut: 'Você saiu do StarHermit — o treino continua disponível.',
    achievements: 'Conquistas', achLoading: 'Carregando…', achEmpty: 'Ainda não há conquistas disponíveis.',
    achFailed: 'Não foi possível carregar as conquistas.', achUnlocked: 'Desbloqueada', achLocked: 'Bloqueada', back: 'Voltar',
  },
  'it-IT': {
    signIn: 'Accedi con StarHermit', invite: 'Invita un amico',
    inviteCopied: 'Link d’invito copiato: invialo a chi vuoi per giocare insieme.', inviteFailed: 'Impossibile copiare il link d’invito.',
    signedOut: 'Disconnesso da StarHermit: l’allenamento resta disponibile.',
    achievements: 'Obiettivi', achLoading: 'Caricamento…', achEmpty: 'Nessun obiettivo ancora disponibile.',
    achFailed: 'Impossibile caricare gli obiettivi.', achUnlocked: 'Sbloccato', achLocked: 'Bloccato', back: 'Indietro',
  },
};

export const PLATFORM_LOCALES = Object.keys(STRINGS);

/** Strings for the browser's locale (en-US fallback per key). */
export function platformStrings(tag = (typeof navigator !== 'undefined' ? (navigator.languages?.[0] || navigator.language) : 'en-US')) {
  return { ...STRINGS['en-US'], ...STRINGS[pickLocale(tag)] };
}
