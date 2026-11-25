import * as THREE from 'three';
import {
  ANIMATION_LIBRARY_REGISTRY,
  resolveToAnimationId,
} from './animationLibrary';
import { mapEmotionToFacialPreset } from './facialSystem';
import {
  AnimationId,
  AnimationStateId,
  EmotionId,
  FacialExpressionPresetId,
  GestureCueId,
  HandPoseId,
  PerformanceScript,
} from './types';

export interface StateMachineSnapshot {
  state: AnimationStateId;
  activeAnimation: AnimationId;
  secondaryAnimation: AnimationId | null;
  facialExpression: FacialExpressionPresetId;
  handPose: HandPoseId;
  speed: number;
  intensity: number;
  recentAnimations: AnimationId[];
}

export class AnimationStateMachine {
  private state: AnimationStateId = 'Idle';
  private activeAnimation: AnimationId = 'Idle_Normal';
  private secondaryAnimation: AnimationId | null = null;
  private facialExpression: FacialExpressionPresetId = 'calm';
  private handPose: HandPoseId = 'relaxed';

  private speed = 1.0;
  private intensity = 1.0;

  private recentHistory: AnimationId[] = [];
  private readonly maxHistory = 8;

  private actionElapsed = 0;
  private timedReturnSeconds: number | null = null;
  private switchedToSecondary = false;
  private isSpeechActive = false;

  public getSnapshot(): StateMachineSnapshot {
    return {
      state: this.state,
      activeAnimation: this.activeAnimation,
      secondaryAnimation: this.secondaryAnimation,
      facialExpression: this.facialExpression,
      handPose: this.handPose,
      speed: this.speed,
      intensity: this.intensity,
      recentAnimations: [...this.recentHistory],
    };
  }

  public getRecentAnimations(): AnimationId[] {
    return [...this.recentHistory];
  }

  public setTuning(speed: number, intensity: number): void {
    this.speed = THREE.MathUtils.clamp(speed, 0.5, 1.5);
    this.intensity = THREE.MathUtils.clamp(intensity, 0.4, 1.4);
  }

  private recordHistory(animId: AnimationId): void {
    if (animId.startsWith('Idle_')) return;
    if (this.recentHistory[0] === animId) return;
    this.recentHistory = [
      animId,
      ...this.recentHistory.filter((id) => id !== animId),
    ].slice(0, this.maxHistory);
  }

  public pickNonRepeatingAlternative(
    preferred: AnimationId,
    allowDuringAcademic = true,
  ): AnimationId {
    if (!this.recentHistory.includes(preferred)) {
      return preferred;
    }
    const meta = ANIMATION_LIBRARY_REGISTRY[preferred];
    const candidates = (Object.keys(ANIMATION_LIBRARY_REGISTRY) as AnimationId[]).filter(
      (id) => {
        const m = ANIMATION_LIBRARY_REGISTRY[id];
        if (m.category !== meta.category) return false;
        if (!allowDuringAcademic && !m.allowDuringAcademic) return false;
        return !this.recentHistory.includes(id);
      },
    );
    if (candidates.length > 0) {
      return candidates[0];
    }
    return preferred;
  }

  public setInteractionState(mode: 'idle' | 'listening' | 'thinking'): void {
    if (this.isSpeechActive && mode !== 'idle') return;
    this.isSpeechActive = false;
    this.secondaryAnimation = null;
    this.switchedToSecondary = false;
    this.timedReturnSeconds = null;
    this.actionElapsed = 0;

    if (mode === 'listening') {
      this.state = 'Listening';
      this.activeAnimation = 'Listen_Attentive';
      this.facialExpression = 'listening';
      this.handPose = 'relaxed';
    } else if (mode === 'thinking') {
      this.state = 'Thinking';
      this.activeAnimation = 'Think_HandOnChin';
      this.facialExpression = 'thinking';
      this.handPose = 'chin_rest';
    } else {
      this.state = 'Idle';
      this.activeAnimation = 'Idle_Normal';
      this.facialExpression = 'calm';
      this.handPose = 'relaxed';
    }
  }

  public startSpeechPerformance(script: PerformanceScript): void {
    const primary = resolveToAnimationId(
      script.body_animation ?? script.gesture ?? script.primaryGesture,
    );
    const secondary = script.secondary_animation
      ? resolveToAnimationId(script.secondary_animation)
      : script.gesture && script.gesture !== primary
        ? resolveToAnimationId(script.gesture)
        : null;

    const meta = ANIMATION_LIBRARY_REGISTRY[primary];
    const expr: FacialExpressionPresetId =
      script.facial_expression ??
      mapEmotionToFacialPreset(script.emotion) ??
      meta.facialExpression;

    this.state = script.interaction_state ?? meta.state ?? 'Speaking';
    if (this.state === 'Idle') this.state = 'Speaking';
    this.activeAnimation = primary;
    this.secondaryAnimation = secondary && secondary !== primary ? secondary : null;
    this.facialExpression = expr;
    this.handPose = script.handPose ?? meta.handPose;
    this.isSpeechActive = true;
    this.switchedToSecondary = false;
    this.timedReturnSeconds = null;
    this.actionElapsed = 0;

    this.recordHistory(primary);
    if (this.secondaryAnimation) {
      this.recordHistory(this.secondaryAnimation);
    }
  }

  public finishSpeechPerformance(): void {
    this.isSpeechActive = false;
    this.secondaryAnimation = null;
    this.switchedToSecondary = false;
    this.timedReturnSeconds = null;
    this.actionElapsed = 0;
    this.state = 'Idle';
    this.activeAnimation = 'Idle_Normal';
    this.facialExpression = 'calm';
    this.handPose = 'relaxed';
  }

  public triggerManualCue(
    gesture: GestureCueId,
    handPose?: HandPoseId,
    emotion?: EmotionId,
    explicitFacial?: FacialExpressionPresetId,
    durationSec?: number,
  ): void {
    const animId = resolveToAnimationId(gesture);
    const meta = ANIMATION_LIBRARY_REGISTRY[animId];

    this.isSpeechActive = false;
    this.state = meta.state;
    this.activeAnimation = animId;
    this.secondaryAnimation = null;
    this.switchedToSecondary = false;
    this.facialExpression =
      explicitFacial ??
      (emotion ? mapEmotionToFacialPreset(emotion) : meta.facialExpression);
    this.handPose = handPose ?? meta.handPose;
    this.actionElapsed = 0;
    this.timedReturnSeconds = durationSec ?? (meta.loop ? null : meta.defaultDuration);
    this.recordHistory(animId);
  }

  public setFacialExpressionOnly(expr: FacialExpressionPresetId): void {
    this.facialExpression = expr;
  }

  public tick(
    dt: number,
    speechProgress01: number,
    speakingNow: boolean,
  ): {
    activeAnimation: AnimationId;
    facialExpression: FacialExpressionPresetId;
    handPose: HandPoseId;
    state: AnimationStateId;
    animClock: number;
    intensity: number;
  } {
    this.actionElapsed += dt * this.speed;

    if (this.isSpeechActive && speakingNow) {
      if (
        !this.switchedToSecondary &&
        this.secondaryAnimation &&
        speechProgress01 >= 0.48
      ) {
        this.switchedToSecondary = true;
        this.activeAnimation = this.secondaryAnimation;
        const secMeta = ANIMATION_LIBRARY_REGISTRY[this.secondaryAnimation];
        if (secMeta.state !== 'Idle') {
          this.state = secMeta.state;
        }
        this.handPose = secMeta.handPose;
      }
    } else if (this.timedReturnSeconds !== null && this.actionElapsed >= this.timedReturnSeconds) {
      this.timedReturnSeconds = null;
      this.state = 'Idle';
      this.activeAnimation = 'Idle_Normal';
      this.facialExpression = 'calm';
      this.handPose = 'relaxed';
      this.actionElapsed = 0;
    }

    return {
      activeAnimation: this.activeAnimation,
      facialExpression: this.facialExpression,
      handPose: this.handPose,
      state: this.state,
      animClock: this.actionElapsed,
      intensity: this.intensity,
    };
  }
}
