/**
 * The services answer in English, which is the right language for a REST contract and for their
 * tests. The console shows those answers to operators, so the messages the platform can actually
 * produce are rendered in French here; an unrecognised message is passed through unchanged rather
 * than guessed at.
 */

const EXACT: Record<string, string> = {
  'Username or password is incorrect.': 'Nom d’utilisateur ou mot de passe incorrect.',
  'Account creation is disabled on this console.': 'La création de compte est désactivée sur cette console.',
  'Sign in to continue.': 'Connectez-vous pour continuer.',
  'Your session has expired. Sign in again.': 'Votre session a expiré. Reconnectez-vous.',
  'The current password is incorrect.': 'Le mot de passe actuel est incorrect.',
  'Choose an image to upload.': 'Choisissez une image à envoyer.',
  'Use a PNG, JPEG or WebP image.': 'Utilisez une image PNG, JPEG ou WebP.',
  'The photo is too large.': 'La photo est trop volumineuse.',
  'Some fields are invalid.': 'Certains champs sont invalides.',
  'The request body is missing or malformed.': 'Le corps de la requête est absent ou mal formé.',
  'Telemetry store is currently unavailable.': 'Le stockage de télémétrie est actuellement indisponible.',
  'An unexpected error occurred. Please contact system administrator.':
    'Une erreur inattendue s’est produite. Contactez l’administrateur du système.',
  'This incident changed while you were working on it. Reload and try again.':
    'Cet incident a changé pendant que vous le traitiez. Rechargez la page et réessayez.',
  'This value is already in use.': 'Cette valeur est déjà utilisée.',
  'This incident is already resolved.': 'Cet incident est déjà résolu.',
  'Activity window must not be wider than 31 days': 'La fenêtre d’activité ne peut pas dépasser 31 jours.',
  '3 to 50 characters: letters, digits, dot, dash or underscore':
    '3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas',
  'must be between 8 and 72 characters': 'doit contenir entre 8 et 72 caractères',
  'must not be blank': 'ne doit pas être vide',
  'must not be null': 'est obligatoire',
  'must be a well-formed email address': 'doit être une adresse e-mail valide',
  'Bad Request': 'Requête invalide',
  'Not Found': 'Introuvable',
  'Unauthorized': 'Non autorisé',
  'Forbidden': 'Interdit',
  'Service Unavailable': 'Service indisponible',
  'Internal Server Error': 'Erreur interne du serveur',
};

const PATTERNS: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^The username '(.+)' is already taken\.$/, (m) => `Le nom d’utilisateur « ${m[1]} » est déjà pris.`],
  [/^This incident was already acknowledged by (.+)\.$/, (m) => `Cet incident a déjà été pris en compte par ${m[1]}.`],
  [/^The photo is larger than (\d+) KB\.$/, (m) => `La photo dépasse ${m[1]} Ko.`],
  [/^Incident (\d+) does not exist\.$/, (m) => `L’incident ${m[1]} n’existe pas.`],
  [/^Parameter '(.+)' has an unsupported value\.$/, (m) => `Le paramètre « ${m[1]} » a une valeur non prise en charge.`],
  [/^Required parameter '(.+)' is missing\.$/, (m) => `Le paramètre obligatoire « ${m[1]} » est manquant.`],
  [/^Unsupported sort direction '(.+)'\. Use 'asc' or 'desc'\.$/, (m) => `Sens de tri « ${m[1]} » non pris en charge. Utilisez « asc » ou « desc ».`],
  [/^Unsupported sort field '(.+)'\. Supported fields: (.+)$/, (m) => `Champ de tri « ${m[1]} » non pris en charge. Champs pris en charge : ${m[2]}`],
  [/^size must be between (\d+) and (\d+)$/, (m) => `la taille doit être comprise entre ${m[1]} et ${m[2]}`],
  [/^must be greater than or equal to (\d+)$/, (m) => `doit être supérieur ou égal à ${m[1]}`],
  [/^must be less than or equal to (\d+)$/, (m) => `doit être inférieur ou égal à ${m[1]}`],
];

export function translateMessage(message: string): string {
  const exact = EXACT[message];
  if (exact) {
    return exact;
  }
  for (const [pattern, render] of PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return render(match);
    }
  }
  return message;
}

const FIELD_LABELS: Record<string, string> = {
  username: 'nom d’utilisateur',
  password: 'mot de passe',
  newPassword: 'nouveau mot de passe',
  displayName: 'nom complet',
  email: 'e-mail',
  note: 'note',
  reason: 'motif',
};

export function translateField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
