import * as THREE from 'three';
import { EmotionId, FacialExpressionPresetId } from './types';

export interface FacialExpressionProfile {
  id: FacialExpressionPresetId;
  label: string;
  labelAr: string;
  smile: number;
  frown: number;
  cheekSquint: number;
  browLift: number; // -1..1
  mouthRestOpen: number;
  mouthRestO: number;
  noseTwitch: number;
  earPerk: number;
  winkRight: number;
  eyeGazeX: number;
  eyeGazeY: number;
}

export const FACIAL_EXPRESSION_PROFILES: Record<
  FacialExpressionPresetId,
  FacialExpressionProfile
> = {
  happy: {
    id: 'happy',
    label: 'Happy',
    labelAr: 'سعيد',
    smile: 0.82,
    frown: 0,
    cheekSquint: 0.48,
    browLift: 0.28,
    mouthRestOpen: 0.04,
    mouthRestO: 0,
    noseTwitch: 0.1,
    earPerk: 0.35,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0.04,
  },
  excited: {
    id: 'excited',
    label: 'Excited',
    labelAr: 'متحمس',
    smile: 0.92,
    frown: 0,
    cheekSquint: 0.58,
    browLift: 0.68,
    mouthRestOpen: 0.14,
    mouthRestO: 0,
    noseTwitch: 0.22,
    earPerk: 0.65,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0.1,
  },
  curious: {
    id: 'curious',
    label: 'Curious',
    labelAr: 'فضولي',
    smile: 0.22,
    frown: 0,
    cheekSquint: 0.1,
    browLift: 0.62,
    mouthRestOpen: 0.04,
    mouthRestO: 0.12,
    noseTwitch: 0.08,
    earPerk: 0.52,
    winkRight: 0,
    eyeGazeX: 0.24,
    eyeGazeY: 0.2,
  },
  thinking: {
    id: 'thinking',
    label: 'Thinking',
    labelAr: 'يفكر',
    smile: 0.06,
    frown: 0.08,
    cheekSquint: 0,
    browLift: 0.36,
    mouthRestOpen: 0,
    mouthRestO: 0.1,
    noseTwitch: 0.05,
    earPerk: 0.22,
    winkRight: 0,
    eyeGazeX: 0.34,
    eyeGazeY: 0.54,
  },
  confused: {
    id: 'confused',
    label: 'Confused',
    labelAr: 'مرتبك',
    smile: 0,
    frown: 0.46,
    cheekSquint: 0,
    browLift: -0.46,
    mouthRestOpen: 0.06,
    mouthRestO: 0.16,
    noseTwitch: 0.24,
    earPerk: 0.05,
    winkRight: 0,
    eyeGazeX: -0.28,
    eyeGazeY: 0.12,
  },
  surprised: {
    id: 'surprised',
    label: 'Surprised',
    labelAr: 'متفاجئ',
    smile: 0.08,
    frown: 0,
    cheekSquint: 0,
    browLift: 0.92,
    mouthRestOpen: 0.34,
    mouthRestO: 0.28,
    noseTwitch: 0.12,
    earPerk: 0.72,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0.15,
  },
  sad: {
    id: 'sad',
    label: 'Sad',
    labelAr: 'حزين',
    smile: 0,
    frown: 0.74,
    cheekSquint: 0,
    browLift: -0.28,
    mouthRestOpen: 0,
    mouthRestO: 0,
    noseTwitch: 0.08,
    earPerk: 0,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: -0.34,
  },
  encouraging: {
    id: 'encouraging',
    label: 'Encouraging',
    labelAr: 'مشجع',
    smile: 0.76,
    frown: 0,
    cheekSquint: 0.34,
    browLift: 0.42,
    mouthRestOpen: 0.03,
    mouthRestO: 0,
    noseTwitch: 0.05,
    earPerk: 0.36,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0.02,
  },
  proud: {
    id: 'proud',
    label: 'Proud',
    labelAr: 'فخور',
    smile: 0.8,
    frown: 0,
    cheekSquint: 0.42,
    browLift: 0.34,
    mouthRestOpen: 0,
    mouthRestO: 0,
    noseTwitch: 0.06,
    earPerk: 0.45,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0.06,
  },
  listening: {
    id: 'listening',
    label: 'Listening',
    labelAr: 'يستمع باهتمام',
    smile: 0.26,
    frown: 0,
    cheekSquint: 0.1,
    browLift: 0.28,
    mouthRestOpen: 0,
    mouthRestO: 0,
    noseTwitch: 0,
    earPerk: 0.46,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0.04,
  },
  explaining: {
    id: 'explaining',
    label: 'Explaining',
    labelAr: 'يشرح',
    smile: 0.4,
    frown: 0,
    cheekSquint: 0.16,
    browLift: 0.36,
    mouthRestOpen: 0.04,
    mouthRestO: 0,
    noseTwitch: 0.06,
    earPerk: 0.24,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0.02,
  },
  laughing: {
    id: 'laughing',
    label: 'Laughing',
    labelAr: 'يضحك',
    smile: 1.0,
    frown: 0,
    cheekSquint: 0.86,
    browLift: 0.52,
    mouthRestOpen: 0.36,
    mouthRestO: 0,
    noseTwitch: 0.24,
    earPerk: 0.56,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0.08,
  },
  winking: {
    id: 'winking',
    label: 'Winking',
    labelAr: 'يغمز',
    smile: 0.74,
    frown: 0,
    cheekSquint: 0.48,
    browLift: 0.32,
    mouthRestOpen: 0.02,
    mouthRestO: 0,
    noseTwitch: 0.12,
    earPerk: 0.38,
    winkRight: 0.96,
    eyeGazeX: 0.08,
    eyeGazeY: 0.02,
  },
  calm: {
    id: 'calm',
    label: 'Calm',
    labelAr: 'هادئ',
    smile: 0.24,
    frown: 0,
    cheekSquint: 0.06,
    browLift: 0.1,
    mouthRestOpen: 0,
    mouthRestO: 0,
    noseTwitch: 0,
    earPerk: 0.12,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0,
  },
};

export function mapEmotionToFacialPreset(emotion: EmotionId): FacialExpressionPresetId {
  if (emotion in FACIAL_EXPRESSION_PROFILES) {
    return emotion as FacialExpressionPresetId;
  }
  switch (emotion) {
    case 'agreeing':
      return 'encouraging';
    case 'skeptical':
      return 'confused';
    case 'neutral':
    default:
      return 'calm';
  }
}

export class EyeBlinkAndGazeController {
  private blinkTimer = 0;
  private nextBlinkInterval = 2.6;
  private doubleBlinkPending = false;
  private saccadeTimer = 0;
  private nextSaccadeInterval = 1.9;
  private saccadeTargetX = 0;
  private saccadeTargetY = 0;
  private saccadeCurX = 0;
  private saccadeCurY = 0;

  public update(dt: number, elapsed: number): {
    blink: number;
    saccadeX: number;
    saccadeY: number;
  } {
    this.blinkTimer += dt;
    let blink = 0;
    const blinkDur = 0.15;

    if (this.blinkTimer >= this.nextBlinkInterval) {
      const bElapsed = this.blinkTimer - this.nextBlinkInterval;
      if (bElapsed < blinkDur) {
        blink = Math.sin((bElapsed / blinkDur) * Math.PI);
      } else if (this.doubleBlinkPending) {
        this.doubleBlinkPending = false;
        this.blinkTimer = this.nextBlinkInterval - 0.12;
      } else {
        this.blinkTimer = 0;
        const r = (Math.sin(elapsed * 12.9898) * 43758.5453) % 1;
        const frac = Math.abs(r);
        this.nextBlinkInterval = 2.2 + frac * 2.5;
        this.doubleBlinkPending = frac > 0.78;
      }
    }

    this.saccadeTimer += dt;
    if (this.saccadeTimer >= this.nextSaccadeInterval) {
      this.saccadeTimer = 0;
      const rx = Math.sin(elapsed * 7.31) * 0.5 + Math.cos(elapsed * 3.17) * 0.5;
      const ry = Math.cos(elapsed * 5.43) * 0.5 + Math.sin(elapsed * 2.11) * 0.5;
      this.saccadeTargetX = rx * 0.11;
      this.saccadeTargetY = ry * 0.06;
      this.nextSaccadeInterval = 1.5 + Math.abs(rx) * 1.8;
    }

    this.saccadeCurX = THREE.MathUtils.damp(this.saccadeCurX, this.saccadeTargetX, 11, dt);
    this.saccadeCurY = THREE.MathUtils.damp(this.saccadeCurY, this.saccadeTargetY, 11, dt);

    return {
      blink,
      saccadeX: this.saccadeCurX,
      saccadeY: this.saccadeCurY,
    };
  }
}
