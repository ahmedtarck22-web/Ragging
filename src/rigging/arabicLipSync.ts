import * as THREE from 'three';

export type VisemeCategory =
  | 'SIL'
  | 'AA'
  | 'O'
  | 'E'
  | 'PP'
  | 'FV'
  | 'TH'
  | 'SH'
  | 'LN'
  | 'KQ';

export interface VisemeFrameWeights {
  jawOpen: number;
  visemeAA: number;
  visemeO: number;
  visemeE: number;
  visemePP: number;
  visemeFV: number;
  visemeTH: number;
  smileBoost: number;
}

export interface TimedPhonemeSegment {
  startFrac: number;
  endFrac: number;
  viseme: VisemeCategory;
  durationWeight: number;
  ch: string;
}

const VISEME_PROFILES: Record<VisemeCategory, VisemeFrameWeights> = {
  SIL: { jawOpen: 0, visemeAA: 0, visemeO: 0, visemeE: 0, visemePP: 0, visemeFV: 0, visemeTH: 0, smileBoost: 0 },
  // أ، إ، آ، ا (open vocalic aperture)
  AA: { jawOpen: 0.68, visemeAA: 0.88, visemeO: 0.08, visemeE: 0.14, visemePP: 0, visemeFV: 0, visemeTH: 0.05, smileBoost: 0.06 },
  // و، ضمة (rounded protruding lips)
  O: { jawOpen: 0.34, visemeAA: 0.12, visemeO: 0.94, visemeE: 0.04, visemePP: 0, visemeFV: 0, visemeTH: 0, smileBoost: 0 },
  // ي، كسرة، س، ز، ص (wide horizontal articulation + dental teeth line)
  E: { jawOpen: 0.24, visemeAA: 0.1, visemeO: 0.05, visemeE: 0.92, visemePP: 0, visemeFV: 0, visemeTH: 0.18, smileBoost: 0.22 },
  // ب، م (pressed bilabial lips)
  PP: { jawOpen: 0.02, visemeAA: 0, visemeO: 0.08, visemeE: 0, visemePP: 0.96, visemeFV: 0, visemeTH: 0, smileBoost: 0 },
  // ف / f / v (lower lip tucked gently toward upper teeth)
  FV: { jawOpen: 0.14, visemeAA: 0.04, visemeO: 0.04, visemeE: 0.18, visemePP: 0.18, visemeFV: 0.92, visemeTH: 0.1, smileBoost: 0 },
  // ث، ذ، ظ، ت، د، ط، ض (dental/interdental articulation)
  TH: { jawOpen: 0.28, visemeAA: 0.14, visemeO: 0.04, visemeE: 0.42, visemePP: 0, visemeFV: 0.08, visemeTH: 0.88, smileBoost: 0.05 },
  // ش، ج (flared rounded palato-alveolar)
  SH: { jawOpen: 0.36, visemeAA: 0.18, visemeO: 0.56, visemeE: 0.44, visemePP: 0, visemeFV: 0, visemeTH: 0.24, smileBoost: 0 },
  // ر، ل، ن (alveolar tap/lateral/nasal)
  LN: { jawOpen: 0.3, visemeAA: 0.22, visemeO: 0.08, visemeE: 0.52, visemePP: 0.08, visemeFV: 0, visemeTH: 0.35, smileBoost: 0.08 },
  // ك، ق، ح، خ، ع، غ، هـ (back velar/pharyngeal/glottal open)
  KQ: { jawOpen: 0.56, visemeAA: 0.64, visemeO: 0.18, visemeE: 0.18, visemePP: 0, visemeFV: 0, visemeTH: 0.1, smileBoost: 0 },
};

const DIACRITIC_FATHA = '\u064E';
const DIACRITIC_DAMMA = '\u064F';
const DIACRITIC_KASRA = '\u0650';
const DIACRITIC_SHADDA = '\u0651';
const DIACRITIC_SUKUN = '\u0652';
const DIACRITIC_FATHATAN = '\u064B';
const DIACRITIC_DAMMATAN = '\u064C';
const DIACRITIC_KASRATAN = '\u064D';

function classifyArabicChar(ch: string): { viseme: VisemeCategory; weight: number } {
  // Long / open vowels & glottal Alef
  if ('أإآا'.includes(ch)) return { viseme: 'AA', weight: ch === 'آ' ? 1.75 : 1.45 };
  if ('ى'.includes(ch)) return { viseme: 'AA', weight: 1.3 };
  // Bilabial stops/nasal
  if ('بم'.includes(ch)) return { viseme: 'PP', weight: 0.85 };
  // Labiodental
  if (ch === 'ف') return { viseme: 'FV', weight: 0.9 };
  // Dental / emphatic dental stops
  if ('تدثذظضط'.includes(ch)) return { viseme: 'TH', weight: 'ثذظ'.includes(ch) ? 0.95 : 0.85 };
  // Sibilants
  if ('سزص'.includes(ch)) return { viseme: 'E', weight: 0.92 };
  // Post-alveolar / affricates
  if ('شج'.includes(ch)) return { viseme: 'SH', weight: 0.95 };
  // Velar / uvular / pharyngeal / glottal
  if ('كقحخعغهة'.includes(ch)) {
    return { viseme: ch === 'ع' || ch === 'ح' ? 'AA' : 'KQ', weight: ch === 'ق' || ch === 'ع' ? 1.05 : 0.9 };
  }
  // Alveolar sonorants
  if ('رلن'.includes(ch)) return { viseme: 'LN', weight: 0.82 };
  // Rounded / spread glides & long vowels
  if ('وؤ'.includes(ch)) return { viseme: 'O', weight: 1.35 };
  if ('يئ'.includes(ch)) return { viseme: 'E', weight: 1.35 };
  return { viseme: 'SIL', weight: 0.35 };
}

function classifyEnglishSegment(
  lowerText: string,
  idx: number,
): { viseme: VisemeCategory; weight: number; advance: number } {
  const pair = lowerText.slice(idx, idx + 2);
  if (pair === 'th') return { viseme: 'TH', weight: 0.95, advance: 2 };
  if (pair === 'sh' || pair === 'ch') return { viseme: 'SH', weight: 0.95, advance: 2 };
  if (pair === 'ph') return { viseme: 'FV', weight: 0.9, advance: 2 };
  if (pair === 'oo' || pair === 'ou' || pair === 'ow') return { viseme: 'O', weight: 1.35, advance: 2 };
  if (pair === 'ee' || pair === 'ea' || pair === 'ey') return { viseme: 'E', weight: 1.35, advance: 2 };
  if (pair === 'aa' || pair === 'ah') return { viseme: 'AA', weight: 1.4, advance: 2 };

  const ch = lowerText[idx];
  if ('bmp'.includes(ch)) return { viseme: 'PP', weight: 0.85, advance: 1 };
  if ('fv'.includes(ch)) return { viseme: 'FV', weight: 0.9, advance: 1 };
  if ('td'.includes(ch)) return { viseme: 'TH', weight: 0.8, advance: 1 };
  if ('szxc'.includes(ch)) return { viseme: 'E', weight: 0.85, advance: 1 };
  if ('jq'.includes(ch)) return { viseme: 'SH', weight: 0.9, advance: 1 };
  if ('lrn'.includes(ch)) return { viseme: 'LN', weight: 0.8, advance: 1 };
  if ('kgh'.includes(ch)) return { viseme: 'KQ', weight: 0.85, advance: 1 };
  if ('ouw'.includes(ch)) return { viseme: 'O', weight: 1.15, advance: 1 };
  if ('eiy'.includes(ch)) return { viseme: 'E', weight: 1.15, advance: 1 };
  if (ch === 'a') return { viseme: 'AA', weight: 1.2, advance: 1 };
  return { viseme: 'SIL', weight: 0.35, advance: 1 };
}

/**
 * Compiles bilingual Arabic + English text into normalized timed phoneme/viseme segments [0..1]
 * accounting for Arabic articulation groups, long vowels vs short harakat, and natural pauses.
 */
export function buildArabicEnglishPhonemeTimeline(text: string): TimedPhonemeSegment[] {
  const clean = (text || '').trim();
  if (!clean) return [];

  const rawTokens: Array<{ viseme: VisemeCategory; weight: number; ch: string }> = [];
  const lower = clean.toLowerCase();

  let i = 0;
  while (i < clean.length) {
    const ch = clean[i];

    // Arabic diacritics modulate the preceding consonant or insert short vowel pulse
    if (
      ch === DIACRITIC_FATHA ||
      ch === DIACRITIC_FATHATAN
    ) {
      rawTokens.push({ viseme: 'AA', weight: 0.65, ch });
      i++;
      continue;
    }
    if (ch === DIACRITIC_DAMMA || ch === DIACRITIC_DAMMATAN) {
      rawTokens.push({ viseme: 'O', weight: 0.65, ch });
      i++;
      continue;
    }
    if (ch === DIACRITIC_KASRA || ch === DIACRITIC_KASRATAN) {
      rawTokens.push({ viseme: 'E', weight: 0.65, ch });
      i++;
      continue;
    }
    if (ch === DIACRITIC_SHADDA) {
      if (rawTokens.length > 0) {
        rawTokens[rawTokens.length - 1].weight *= 1.35;
      }
      i++;
      continue;
    }
    if (ch === DIACRITIC_SUKUN) {
      if (rawTokens.length > 0) {
        rawTokens[rawTokens.length - 1].weight *= 0.82;
      }
      i++;
      continue;
    }

    // Punctuation pauses
    if (/[.,!?،؛:؟\n]/.test(ch)) {
      rawTokens.push({ viseme: 'SIL', weight: ch === '\n' || '.!?؟'.includes(ch) ? 1.45 : 0.9, ch });
      i++;
      continue;
    }

    // Spaces: brief co-articulation dip between words
    if (/\s/.test(ch)) {
      rawTokens.push({ viseme: 'SIL', weight: 0.25, ch: ' ' });
      i++;
      continue;
    }

    // Arabic letter range
    if (/[\u0621-\u064A\u0671-\u06D3]/.test(ch)) {
      const { viseme, weight } = classifyArabicChar(ch);
      rawTokens.push({ viseme, weight, ch });
      // Implicit short vowel transition between consecutive Arabic consonants for fluid jaw flow
      const next = clean[i + 1] ?? '';
      if (
        viseme !== 'AA' &&
        viseme !== 'O' &&
        viseme !== 'E' &&
        /[\u0621-\u064A]/.test(next) &&
        !'اوي'.includes(next)
      ) {
        rawTokens.push({ viseme: 'AA', weight: 0.35, ch: '~' });
      }
      i++;
      continue;
    }

    // English / Latin characters
    if (/[a-z]/i.test(lower[i])) {
      const { viseme, weight, advance } = classifyEnglishSegment(lower, i);
      rawTokens.push({ viseme, weight, ch: lower.slice(i, i + advance) });
      i += advance;
      continue;
    }

    // Digits -> treat as short neutral syllable
    if (/[0-9\u0660-\u0669]/.test(ch)) {
      rawTokens.push({ viseme: 'AA', weight: 0.75, ch });
    }
    i++;
  }

  if (rawTokens.length === 0) return [];

  let totalWeight = 0;
  for (const tk of rawTokens) totalWeight += Math.max(0.1, tk.weight);
  if (totalWeight <= 0) return [];

  const segments: TimedPhonemeSegment[] = [];
  let cursor = 0;
  for (const tk of rawTokens) {
    const w = Math.max(0.1, tk.weight);
    const span = w / totalWeight;
    segments.push({
      startFrac: cursor,
      endFrac: cursor + span,
      viseme: tk.viseme,
      durationWeight: w,
      ch: tk.ch,
    });
    cursor += span;
  }

  if (segments.length > 0) {
    segments[segments.length - 1].endFrac = 1.0;
  }
  return segments;
}

export interface AudioEnvelopeSample {
  energy: number;
  lowEnergy: number;
  midEnergy: number;
  highEnergy: number;
  hasSpectrum: boolean;
}

/**
 * Evaluates current lip-sync viseme blend weights anchored to real audio progress + energy envelope.
 * Strictly silences mouth targets when speech energy falls below pause threshold or when speech ends.
 */
export function evaluateSyncedVisemes(
  timeline: TimedPhonemeSegment[],
  progress01: number,
  audio: AudioEnvelopeSample,
  elapsedSec: number,
): VisemeFrameWeights {
  // Strict silence gate: pauses between phrases & end-of-speech stop mouth movement cleanly
  const silenceThreshold = audio.hasSpectrum ? 0.075 : 0.095;
  if (audio.energy <= silenceThreshold) {
    return VISEME_PROFILES.SIL;
  }

  const gain = THREE.MathUtils.clamp((audio.energy - silenceThreshold) / (1 - silenceThreshold), 0.12, 1.0);
  const clampedProg = THREE.MathUtils.clamp(progress01, 0, 0.9999);

  // Locate active phoneme segment (binary search or linear scan; timelines are ~20..250 items)
  let seg: TimedPhonemeSegment | null = null;
  let nextSeg: TimedPhonemeSegment | null = null;
  if (timeline.length > 0) {
    let lo = 0;
    let hi = timeline.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const cur = timeline[mid];
      if (clampedProg < cur.startFrac) {
        hi = mid - 1;
      } else if (clampedProg >= cur.endFrac) {
        lo = mid + 1;
      } else {
        seg = cur;
        nextSeg = timeline[mid + 1] ?? null;
        break;
      }
    }
    if (!seg) seg = timeline[timeline.length - 1];
  }

  let profile: VisemeFrameWeights;
  if (!seg || seg.viseme === 'SIL') {
    // If audio is genuinely voiced during a punctuation gap, fall back smoothly to spectral balance
    const lateralWave = 0.5 + 0.5 * Math.sin(elapsedSec * 10.5);
    return {
      jawOpen: audio.lowEnergy * 0.48 * gain,
      visemeAA: audio.lowEnergy * 0.52 * gain,
      visemeO: (1 - lateralWave) * gain * 0.35,
      visemeE: (audio.midEnergy * 0.65 + lateralWave * 0.3) * gain,
      visemePP: audio.energy < 0.16 ? 0.32 : 0,
      visemeFV: audio.highEnergy * 0.2,
      visemeTH: audio.highEnergy * 0.15,
      smileBoost: 0.04 * gain,
    };
  }

  const base = VISEME_PROFILES[seg.viseme];
  // Smooth co-articulation blend near segment tail toward next phoneme
  const segSpan = Math.max(1e-4, seg.endFrac - seg.startFrac);
  const localFrac = (clampedProg - seg.startFrac) / segSpan;
  if (nextSeg && nextSeg.viseme !== 'SIL' && localFrac > 0.72) {
    const blend = (localFrac - 0.72) / 0.28 * 0.45;
    const nxt = VISEME_PROFILES[nextSeg.viseme];
    profile = {
      jawOpen: THREE.MathUtils.lerp(base.jawOpen, nxt.jawOpen, blend),
      visemeAA: THREE.MathUtils.lerp(base.visemeAA, nxt.visemeAA, blend),
      visemeO: THREE.MathUtils.lerp(base.visemeO, nxt.visemeO, blend),
      visemeE: THREE.MathUtils.lerp(base.visemeE, nxt.visemeE, blend),
      visemePP: THREE.MathUtils.lerp(base.visemePP, nxt.visemePP, blend),
      visemeFV: THREE.MathUtils.lerp(base.visemeFV, nxt.visemeFV, blend),
      visemeTH: THREE.MathUtils.lerp(base.visemeTH, nxt.visemeTH, blend),
      smileBoost: THREE.MathUtils.lerp(base.smileBoost, nxt.smileBoost, blend),
    };
  } else {
    profile = base;
  }

  // Modulate phoneme weights by real audio amplitude + spectral bands so loudness matches jaw excursion
  const spectralScale = audio.hasSpectrum
    ? THREE.MathUtils.clamp(0.45 + audio.lowEnergy * 0.55 + audio.midEnergy * 0.35, 0.35, 1.15)
    : THREE.MathUtils.clamp(0.4 + audio.energy * 0.75, 0.35, 1.12);
  const scale = gain * spectralScale;

  // For bilabial PP (ب/م) keep lip press crisp even at moderate energy so lips visibly touch
  const ppBoost = seg.viseme === 'PP' ? Math.max(0.55, Math.min(1, audio.energy * 1.4)) : scale;

  return {
    jawOpen: Math.min(0.74, profile.jawOpen * scale),
    visemeAA: Math.min(0.95, profile.visemeAA * scale),
    visemeO: Math.min(0.98, profile.visemeO * scale),
    visemeE: Math.min(0.98, profile.visemeE * scale),
    visemePP: Math.min(1.0, profile.visemePP * ppBoost),
    visemeFV: Math.min(0.95, profile.visemeFV * Math.max(scale, 0.45)),
    visemeTH: Math.min(0.92, profile.visemeTH * Math.max(scale, 0.45)),
    smileBoost: profile.smileBoost * scale,
  };
}
