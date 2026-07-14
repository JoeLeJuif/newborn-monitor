// Génération de résumés texte et CSV pour le partage (24 h par défaut).

import {
  feedTypeLabel,
  feedTypeMeta,
  amountLabel,
  poopColorLabel,
  poopTextureLabel,
  sideLabel,
} from './constants.js';
import { aggregate, eventsInRange, sortedByTimeDesc, eventTime } from './summary.js';
import { formatDateTime, formatDuration, formatBabyAge } from './time.js';

function feedDescription(e) {
  const parts = [feedTypeLabel(e.feedType)];
  if (feedTypeMeta(e.feedType).breast && e.durationSec) {
    parts.push(formatDuration(e.durationSec));
    if (e.lastSide) parts.push(`dernier sein : ${sideLabel(e.lastSide)}`);
  }
  if (e.amountMl) parts.push(`${e.amountMl} ml`);
  if (e.inProgress) parts.push('(en cours)');
  return parts.join(' · ');
}

function diaperDescription(e) {
  const bits = [];
  if (e.pee && e.poop) bits.push('Pipi + caca');
  else if (e.pee) bits.push('Pipi');
  else if (e.poop) bits.push('Caca');
  const details = [];
  if (e.pee) details.push(`pipi : ${amountLabel(e.peeAmount)}`);
  if (e.poop) {
    details.push(
      `caca : ${amountLabel(e.poopAmount)}, ${poopColorLabel(
        e.poopColor,
      )}, ${poopTextureLabel(e.poopTexture)}`,
    );
  }
  return bits.join(' ') + (details.length ? ' — ' + details.join(' ; ') : '');
}

export function eventLine(e) {
  const when = formatDateTime(eventTime(e));
  const body =
    e.type === 'feed' ? feedDescription(e) : diaperDescription(e);
  const note = e.note ? ` — note : ${e.note}` : '';
  return `${when} — ${body}${note}`;
}

export function buildTextSummary(events, baby, hours = 24) {
  const now = Date.now();
  const range = eventsInRange(events, now - hours * 3600000, now);
  const agg = aggregate(range);
  const lines = [];

  lines.push('RÉSUMÉ DU SUIVI DU NOUVEAU-NÉ');
  if (baby?.name) lines.push(`Bébé : ${baby.name}`);
  if (baby?.birth) lines.push(`Âge : ${formatBabyAge(baby.birth)}`);
  lines.push(`Période : dernières ${hours} h`);
  lines.push(`Généré le : ${formatDateTime(new Date().toISOString())}`);
  lines.push('');
  lines.push('— Totaux —');
  lines.push(`Boires : ${agg.feeds}`);
  lines.push(`Temps total au sein : ${formatDuration(agg.breastSec)}`);
  lines.push(`Quantité totale : ${agg.totalMl} ml`);
  lines.push(`Pipis : ${agg.pees}`);
  lines.push(`Cacas : ${agg.poops}`);
  lines.push('');
  lines.push('— Événements —');
  const ordered = sortedByTimeDesc(range);
  if (ordered.length === 0) lines.push('Aucun événement sur la période.');
  for (const e of ordered) lines.push(eventLine(e));
  lines.push('');
  lines.push(
    'Note : ce résumé consigne les observations des parents. Il ne constitue pas un avis médical.',
  );
  return lines.join('\n');
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCSV(events, hours = 24) {
  const now = Date.now();
  const range = sortedByTimeDesc(
    eventsInRange(events, now - hours * 3600000, now),
  );
  const header = [
    'date_heure',
    'type',
    'detail',
    'duree_min',
    'quantite_ml',
    'pipi',
    'caca',
    'quantite',
    'couleur',
    'texture',
    'note',
  ];
  const rows = [header.map(csvCell).join(',')];
  for (const e of range) {
    if (e.type === 'feed') {
      rows.push(
        [
          new Date(e.start).toISOString(),
          'boire',
          feedTypeLabel(e.feedType),
          e.durationSec ? (e.durationSec / 60).toFixed(1) : '',
          e.amountMl || '',
          '',
          '',
          '',
          '',
          '',
          e.note || '',
        ]
          .map(csvCell)
          .join(','),
      );
    } else {
      rows.push(
        [
          new Date(e.time).toISOString(),
          'couche',
          e.pee && e.poop ? 'pipi+caca' : e.pee ? 'pipi' : 'caca',
          '',
          '',
          e.pee ? 'oui' : 'non',
          e.poop ? 'oui' : 'non',
          e.poop ? amountLabel(e.poopAmount) : e.pee ? amountLabel(e.peeAmount) : '',
          e.poop ? poopColorLabel(e.poopColor) : '',
          e.poop ? poopTextureLabel(e.poopTexture) : '',
          e.note || '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  return rows.join('\n');
}

export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
