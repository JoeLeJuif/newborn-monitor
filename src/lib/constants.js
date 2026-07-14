// Libellés et options partagés.

export const FEED_TYPES = [
  { value: 'left', label: 'Sein gauche', breast: true, side: 'left' },
  { value: 'right', label: 'Sein droit', breast: true, side: 'right' },
  { value: 'both', label: 'Les deux seins', breast: true, side: 'both' },
  { value: 'colostrum', label: 'Colostrum exprimé', bottle: true },
  { value: 'breastmilk_bottle', label: 'Lait maternel au biberon', bottle: true },
  { value: 'formula', label: 'Préparation commerciale', bottle: true },
];

export function feedTypeLabel(value) {
  return FEED_TYPES.find((t) => t.value === value)?.label || value;
}

export function feedTypeMeta(value) {
  return FEED_TYPES.find((t) => t.value === value) || {};
}

export const AMOUNTS = [
  { value: 'small', label: 'Petite' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'large', label: 'Grande' },
];

export function amountLabel(value) {
  return AMOUNTS.find((a) => a.value === value)?.label || '—';
}

export const POOP_COLORS = [
  { value: 'meconium', label: 'Méconium (noir/vert très foncé)' },
  { value: 'green', label: 'Vert' },
  { value: 'brown', label: 'Brun' },
  { value: 'mustard', label: 'Jaune moutarde' },
  { value: 'other', label: 'Autre' },
];

export function poopColorLabel(value) {
  return POOP_COLORS.find((c) => c.value === value)?.label || '—';
}

export const POOP_TEXTURES = [
  { value: 'sticky', label: 'Collante' },
  { value: 'pasty', label: 'Pâteuse' },
  { value: 'seedy', label: 'Granuleuse' },
  { value: 'liquid', label: 'Liquide' },
];

export function poopTextureLabel(value) {
  return POOP_TEXTURES.find((t) => t.value === value)?.label || '—';
}

export const FEED_NOTE_SUGGESTIONS = [
  "Bébé s'est endormi",
  'Bonne prise du sein',
  'Régurgitation',
  'Bébé semblait encore avoir faim',
];

export function sideLabel(side) {
  if (side === 'left') return 'Gauche';
  if (side === 'right') return 'Droit';
  if (side === 'both') return 'Les deux';
  return '—';
}
