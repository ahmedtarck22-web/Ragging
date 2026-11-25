import * as THREE from 'three';
import {
  ANIMATION_LIBRARY_REGISTRY,
  evaluateAnimationLibraryPose,
} from './animationLibrary';
import {
  AudioEnvelopeSample,
  buildArabicEnglishPhonemeTimeline,
  evaluateSyncedVisemes,
  TimedPhonemeSegment,
} from './arabicLipSync';
import { ArmRestBasis } from './autoRigStaticModel';
import {
  EyeBlinkAndGazeController,
  FACIAL_EXPRESSION_PROFILES,
  mapEmotionToFacialPreset,
} from './facialSystem';
import { LoadedRigAsset } from './models';
import { FingerKey, MorphChannelKey, SemanticBoneKey } from './rigMapper';
import { AnimationStateMachine, StateMachineSnapshot } from './stateMachine';
import {
  AnimationId,
  EmotionId,
  FacialExpressionPresetId,
  FacialExpressionState,
  GestureCueId,
  HandPoseId,
  PerformanceScript,
} from './types';

const _deltaEuler = new THREE.Euler();
const _deltaQuat = new THREE.Quaternion();
const _targetQuat = new THREE.Quaternion();

const ALL_BODY_BONE_KEYS: SemanticBoneKey[] = [
  'pelvis',
  'spine',
  'chest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftForearm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightForearm',
  'rightHand',
  'leftThigh',
  'leftShin',
  'leftFoot',
  'rightThigh',
  'rightShin',
  'rightFoot',
];

function createZeroExpressionState(): FacialExpressionState {
  return {
    mouthOpen: 0,
    smile: 0.16,
    frown: 0,
    cheekSquint: 0,
    visemeAA: 0,
    visemeO: 0,
    visemeE: 0,
    visemePP: 0,
    visemeFV: 0,
    visemeTH: 0,
    browLift: 0.08,
    blink: 0,
    winkLeft: 0,
    winkRight: 0,
    eyeGazeX: 0,
    eyeGazeY: 0,
    noseTwitch: 0,
    earPerk: 0.1,
    fingerCurl: 0,
  };
}

export class PerformanceDirector {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private freqData = new Uint8Array(512);
  private isSpeakingAudio = false;
  private speechStartMs = 0;
  private speechFallbackDurationMs = 0;
  private speechText = '';
  private lipSyncEnabled = true;
  private phonemeTimeline: TimedPhonemeSegment[] = [];

  private readonly stateMachine = new AnimationStateMachine();
  private readonly blinkGazeController = new EyeBlinkAndGazeController();

  // Active performance mirrors
  public activeGesture: GestureCueId = 'Idle_Normal';
  public activeHandPose: HandPoseId = 'relaxed';
  public activeEmotion: EmotionId = 'calm';
  public targetExpression: FacialExpressionState = createZeroExpressionState();
  public manualOverrides: Partial<FacialExpressionState> = {};

  private currentExpression: FacialExpressionState = createZeroExpressionState();
  private currentPoseEuler: Record<string, [number, number, number]> = {};
  private currentPelvisOffset: [number, number, number] = [0, 0, 0];
  private speechEnergySmooth = 0;
  private onSpeechEnded?: () => void;
  private speechEndedDispatched = false;
  private htmlAudio: HTMLAudioElement | null = null;
  private htmlAudioUrl: string | null = null;

  private audioDeviceUnavailable = false;
  private wavEnvelope: Float32Array | null = null;
  private wavDurationMs = 0;

  private scriptCueOffsets = {
    browDelta: 0,
    smileDelta: 0,
    earDelta: 0,
    noseDelta: 0,
    gazeX: 0,
    gazeY: 0,
  };

  private static isAudioDeviceError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    const name = err instanceof Error ? err.name : '';
    return (
      /audio device/i.test(msg) ||
      name === 'NotSupportedError' ||
      /no audio/i.test(msg) ||
      /Failed to start/i.test(msg)
    );
  }

  private discardBrokenAudioContext(): void {
    const ctx = this.audioCtx;
    this.audioCtx = null;
    if (ctx) {
      try {
        void ctx.close().catch(() => {});
      } catch {
        // ignore close errors
      }
    }
  }

  private extractWavEnvelope(bytes: Uint8Array): { envelope: Float32Array; durationMs: number } | null {
    if (bytes.length < 44) return null;
    if (
      bytes[0] !== 0x52 ||
      bytes[1] !== 0x49 ||
      bytes[2] !== 0x46 ||
      bytes[3] !== 0x46 ||
      bytes[8] !== 0x57 ||
      bytes[9] !== 0x41 ||
      bytes[10] !== 0x56 ||
      bytes[11] !== 0x45
    ) {
      return null;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let numChannels = 1;
    let sampleRate = 24000;
    let bitsPerSample = 16;
    let dataOffset = -1;
    let dataSize = 0;

    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkId =
        String.fromCharCode(bytes[offset]) +
        String.fromCharCode(bytes[offset + 1]) +
        String.fromCharCode(bytes[offset + 2]) +
        String.fromCharCode(bytes[offset + 3]);
      const chunkSize = view.getUint32(offset + 4, true);
      const payloadStart = offset + 8;

      if (chunkId === 'fmt ' && payloadStart + 16 <= bytes.length) {
        numChannels = Math.max(1, view.getUint16(payloadStart + 2, true));
        sampleRate = Math.max(8000, view.getUint32(payloadStart + 4, true));
        bitsPerSample = view.getUint16(payloadStart + 14, true);
      } else if (chunkId === 'data') {
        dataOffset = payloadStart;
        dataSize = Math.min(chunkSize, bytes.length - payloadStart);
        break;
      }

      offset = payloadStart + chunkSize + (chunkSize & 1);
    }

    if (dataOffset < 0 || dataSize <= 0) return null;

    const bytesPerSample = Math.max(1, Math.floor(bitsPerSample / 8));
    const frameSize = bytesPerSample * numChannels;
    const totalFrames = Math.floor(dataSize / frameSize);
    if (totalFrames <= 0) return null;

    const framesPerBucket = Math.max(1, Math.floor(sampleRate * 0.02)); // 20ms buckets (50Hz)
    const bucketCount = Math.max(1, Math.ceil(totalFrames / framesPerBucket));
    const envelope = new Float32Array(bucketCount);

    for (let b = 0; b < bucketCount; b++) {
      const startFrame = b * framesPerBucket;
      const endFrame = Math.min(totalFrames, startFrame + framesPerBucket);
      let sumSq = 0;
      let count = 0;

      for (let f = startFrame; f < endFrame; f++) {
        const sampleOffset = dataOffset + f * frameSize;
        let normalized = 0;
        if (bitsPerSample === 16 && sampleOffset + 1 < bytes.length) {
          normalized = view.getInt16(sampleOffset, true) / 32768;
        } else if (bitsPerSample === 8 && sampleOffset < bytes.length) {
          normalized = (bytes[sampleOffset] - 128) / 128;
        }
        sumSq += normalized * normalized;
        count++;
      }

      const rms = count > 0 ? Math.sqrt(sumSq / count) : 0;
      envelope[b] = Math.min(1, rms * 3.8);
    }

    const durationMs = (totalFrames / sampleRate) * 1000;
    return { envelope, durationMs };
  }

  public unlockAudio(): void {
    if (this.audioDeviceUnavailable || typeof window === 'undefined') return;
    try {
      if (!this.audioCtx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.audioCtx = new AudioCtx();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch((err) => {
          if (PerformanceDirector.isAudioDeviceError(err)) {
            this.audioDeviceUnavailable = true;
            this.discardBrokenAudioContext();
          }
        });
      }
    } catch (err) {
      if (PerformanceDirector.isAudioDeviceError(err)) {
        this.audioDeviceUnavailable = true;
      }
      this.discardBrokenAudioContext();
    }
  }

  public getStateSnapshot(): StateMachineSnapshot {
    return this.stateMachine.getSnapshot();
  }

  public getRecentAnimations(): AnimationId[] {
    return this.stateMachine.getRecentAnimations();
  }

  public setPerformanceTuning(speed: number, intensity: number): void {
    this.stateMachine.setTuning(speed, intensity);
  }

  public setInteractionState(mode: 'idle' | 'listening' | 'thinking'): void {
    this.stateMachine.setInteractionState(mode);
    const snap = this.stateMachine.getSnapshot();
    this.activeGesture = snap.activeAnimation;
    this.activeHandPose = snap.handPose;
    this.activeEmotion = snap.facialExpression;
  }

  public triggerLibraryAnimation(
    animId: AnimationId,
    facialExpr?: FacialExpressionPresetId,
    durationSec?: number,
  ): void {
    const meta = ANIMATION_LIBRARY_REGISTRY[animId];
    const expr = facialExpr ?? meta.facialExpression;
    this.stateMachine.triggerManualCue(animId, meta.handPose, expr, expr, durationSec);
    this.activeGesture = animId;
    this.activeHandPose = meta.handPose;
    this.activeEmotion = expr;
    this.scriptCueOffsets = {
      browDelta: 0,
      smileDelta: 0,
      earDelta: 0,
      noseDelta: 0,
      gazeX: 0,
      gazeY: 0,
    };
  }

  public setFacialExpression(exprId: FacialExpressionPresetId): void {
    this.stateMachine.setFacialExpressionOnly(exprId);
    this.activeEmotion = exprId;
    this.scriptCueOffsets = {
      browDelta: 0,
      smileDelta: 0,
      earDelta: 0,
      noseDelta: 0,
      gazeX: 0,
      gazeY: 0,
    };
  }

  public setImmediateCue(gesture: GestureCueId, handPose: HandPoseId, emotion: EmotionId): void {
    const expr = mapEmotionToFacialPreset(emotion);
    this.stateMachine.triggerManualCue(gesture, handPose, emotion, expr);
    const snap = this.stateMachine.getSnapshot();
    this.activeGesture = snap.activeAnimation;
    this.activeHandPose = snap.handPose;
    this.activeEmotion = snap.facialExpression;
    this.scriptCueOffsets = {
      browDelta: 0,
      smileDelta: 0,
      earDelta: 0,
      noseDelta: 0,
      gazeX: 0,
      gazeY: 0,
    };
  }

  private completeSpeechCycle(): void {
    if (this.speechEndedDispatched) return;
    this.speechEndedDispatched = true;
    this.isSpeakingAudio = false;
    this.speechStartMs = 0;
    this.speechFallbackDurationMs = 0;
    this.speechEnergySmooth = 0;
    this.wavEnvelope = null;
    this.wavDurationMs = 0;
    this.stateMachine.finishSpeechPerformance();
    const snap = this.stateMachine.getSnapshot();
    this.activeGesture = snap.activeAnimation;
    this.activeHandPose = snap.handPose;
    this.activeEmotion = snap.facialExpression;
    this.onSpeechEnded?.();
  }

  public async playPerformance(
    script: PerformanceScript,
    onEnded?: () => void,
  ): Promise<void> {
    this.stopAudioNodesOnly();
    this.onSpeechEnded = onEnded;
    this.speechEndedDispatched = false;

    const spokenText = (script.response_text ?? script.replyText ?? '').trim();
    this.speechText = spokenText;
    this.lipSyncEnabled = script.lip_sync !== false;
    this.phonemeTimeline = buildArabicEnglishPhonemeTimeline(spokenText);

    this.stateMachine.startSpeechPerformance(script);
    const snap = this.stateMachine.getSnapshot();
    this.activeEmotion = snap.facialExpression;
    this.activeGesture = snap.activeAnimation;
    this.activeHandPose = snap.handPose;

    const baseProfile = FACIAL_EXPRESSION_PROFILES[snap.facialExpression];
    this.scriptCueOffsets = {
      browDelta: (script.facialCues?.browLift ?? baseProfile.browLift) - baseProfile.browLift,
      smileDelta: ((script.facialCues?.smile ?? baseProfile.smile) - baseProfile.smile) * 0.35,
      earDelta: (script.facialCues?.earPerk ?? baseProfile.earPerk) - baseProfile.earPerk,
      noseDelta: (script.facialCues?.noseTwitch ?? baseProfile.noseTwitch) - baseProfile.noseTwitch,
      gazeY: script.facialCues?.eyeGaze === 'up_think' ? 0.45 : 0,
      gazeX: script.facialCues?.eyeGaze === 'side_glance' ? 0.4 : 0,
    };

    if (script.audioBase64) {
      const binaryStr = atob(script.audioBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const parsedWav = this.extractWavEnvelope(bytes);
      if (parsedWav) {
        this.wavEnvelope = parsedWav.envelope;
        this.wavDurationMs = parsedWav.durationMs;
      }

      if (!this.audioDeviceUnavailable) {
        try {
          this.unlockAudio();
          if (this.audioCtx && !this.audioDeviceUnavailable) {
            if (this.audioCtx.state === 'suspended') {
              await this.audioCtx.resume();
            }
            const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer.slice(0));
            const analyser = this.audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.48;
            this.freqData = new Uint8Array(analyser.frequencyBinCount);

            const source = this.audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(analyser);
            analyser.connect(this.audioCtx.destination);

            this.analyser = analyser;
            this.sourceNode = source;
            this.isSpeakingAudio = true;
            this.speechStartMs = performance.now();
            this.speechFallbackDurationMs = audioBuffer.duration * 1000;

            source.onended = () => {
              this.completeSpeechCycle();
            };
            source.start(0);
            return;
          }
        } catch (err) {
          if (PerformanceDirector.isAudioDeviceError(err)) {
            this.audioDeviceUnavailable = true;
            this.discardBrokenAudioContext();
          } else {
            console.warn('WebAudio playback failed, trying <audio> fallback:', err);
          }
        }
      }

      // Secondary HTMLAudioElement WAV playback
      if (!this.audioDeviceUnavailable) {
        try {
          const blob = new Blob([bytes], { type: script.audioMimeType || 'audio/wav' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          this.htmlAudio = audio;
          this.htmlAudioUrl = url;
          this.speechStartMs = performance.now();
          this.speechFallbackDurationMs =
            this.wavDurationMs > 0
              ? this.wavDurationMs
              : Math.min(14000, Math.max(2000, spokenText.length * 75));
          this.isSpeakingAudio = false;

          audio.onloadedmetadata = () => {
            if (Number.isFinite(audio.duration) && audio.duration > 0) {
              this.speechFallbackDurationMs = audio.duration * 1000;
            }
          };
          audio.onended = () => {
            this.stopAudioNodesOnly();
            this.completeSpeechCycle();
          };
          audio.onerror = () => {
            if (this.htmlAudioUrl) {
              URL.revokeObjectURL(this.htmlAudioUrl);
              this.htmlAudioUrl = null;
            }
            this.htmlAudio = null;
          };
          await audio.play();
          return;
        } catch (audioErr) {
          if (this.htmlAudio) {
            try {
              this.htmlAudio.onended = null;
              this.htmlAudio.onerror = null;
              this.htmlAudio.pause();
            } catch {
              // ignore
            }
            this.htmlAudio = null;
          }
          if (this.htmlAudioUrl) {
            URL.revokeObjectURL(this.htmlAudioUrl);
            this.htmlAudioUrl = null;
          }
          if (PerformanceDirector.isAudioDeviceError(audioErr)) {
            this.audioDeviceUnavailable = true;
          }
        }
      }
    }

    // WAV-envelope or phoneme-timed lipsync (+ browser SpeechSynthesis fallback if device available)
    if (this.wavEnvelope && this.wavDurationMs > 0) {
      this.speechFallbackDurationMs = this.wavDurationMs;
    } else {
      const wordCount = Math.max(3, spokenText.split(/\s+/).length);
      this.speechFallbackDurationMs = Math.min(11000, Math.max(1800, wordCount * 420));
    }
    this.speechStartMs = performance.now();
    this.isSpeakingAudio = false;

    if (
      !this.audioDeviceUnavailable &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window
    ) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(spokenText);
        const hasArabic = /[\u0600-\u06FF]/.test(spokenText);
        utter.lang = hasArabic ? 'ar-EG' : 'en-US';
        utter.onend = () => {
          this.completeSpeechCycle();
        };
        utter.onerror = () => {
          // keep timed lipsync active until speechFallbackDurationMs elapses
        };
        window.speechSynthesis.speak(utter);
      } catch {
        // ignore speechSynthesis failures
      }
    }
  }

  private stopAudioNodesOnly(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // ignore already stopped
      }
      this.sourceNode = null;
    }
    if (this.htmlAudio) {
      try {
        this.htmlAudio.onended = null;
        this.htmlAudio.onerror = null;
        this.htmlAudio.pause();
      } catch {
        // ignore
      }
      this.htmlAudio = null;
    }
    if (this.htmlAudioUrl) {
      URL.revokeObjectURL(this.htmlAudioUrl);
      this.htmlAudioUrl = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    this.isSpeakingAudio = false;
    this.speechStartMs = 0;
    this.speechFallbackDurationMs = 0;
    this.speechEnergySmooth = 0;
    this.wavEnvelope = null;
    this.wavDurationMs = 0;
  }

  public stopSpeech(): void {
    this.stopAudioNodesOnly();
    this.speechEndedDispatched = true;
    this.stateMachine.finishSpeechPerformance();
    const snap = this.stateMachine.getSnapshot();
    this.activeGesture = snap.activeAnimation;
    this.activeHandPose = snap.handPose;
    this.activeEmotion = snap.facialExpression;
  }

  public isCurrentlySpeaking(): boolean {
    if (this.isSpeakingAudio) return true;
    if (this.speechStartMs > 0) {
      const elapsed = performance.now() - this.speechStartMs;
      if (elapsed < this.speechFallbackDurationMs) return true;
      this.completeSpeechCycle();
    }
    return false;
  }

  private setMorphGroup(
    asset: LoadedRigAsset,
    key: MorphChannelKey,
    value: number,
  ): void {
    const refs = asset.bindings.morphs[key];
    if (!refs || refs.length === 0) return;
    const clamped = Math.max(0, Math.min(1, value));
    for (const r of refs) {
      if (r.mesh.morphTargetInfluences) {
        r.mesh.morphTargetInfluences[r.index] = clamped;
      }
    }
  }

  private applyBoneOffset(
    asset: LoadedRigAsset,
    bone: THREE.Bone | undefined,
    targetEuler: [number, number, number],
    dt: number,
    speed = 8.5,
  ): void {
    if (!bone) return;
    const restQ = asset.restQuaternions.get(bone.name);
    if (!restQ) return;

    const cur = this.currentPoseEuler[bone.name] ?? [0, 0, 0];
    cur[0] = THREE.MathUtils.damp(cur[0], targetEuler[0], speed, dt);
    cur[1] = THREE.MathUtils.damp(cur[1], targetEuler[1], speed, dt);
    cur[2] = THREE.MathUtils.damp(cur[2], targetEuler[2], speed, dt);
    this.currentPoseEuler[bone.name] = cur;

    _deltaEuler.set(cur[0], cur[1], cur[2], 'XYZ');
    _deltaQuat.setFromEuler(_deltaEuler);
    const armBasis = (asset.rootObject.userData.armRestBasis as ArmRestBasis | undefined)?.[
      bone.name
    ];
    if (armBasis) {
      _deltaQuat.premultiply(armBasis.pre).multiply(armBasis.post);
    }
    _targetQuat.copy(restQ).multiply(_deltaQuat);
    bone.quaternion.copy(_targetQuat);
  }

  private sampleAudioEnvelope(speaking: boolean): AudioEnvelopeSample {
    if (this.isSpeakingAudio && this.analyser) {
      this.analyser.getByteFrequencyData(this.freqData);
      let lowSum = 0;
      for (let i = 3; i < 18; i++) lowSum += this.freqData[i];
      let midSum = 0;
      for (let i = 18; i < 48; i++) midSum += this.freqData[i];
      let highSum = 0;
      for (let i = 48; i < 95; i++) highSum += this.freqData[i];

      const lowEnergy = Math.min(1, lowSum / 15 / 110);
      const midEnergy = Math.min(1, midSum / 30 / 90);
      const highEnergy = Math.min(1, highSum / 47 / 72);
      const energy = Math.min(1, lowEnergy * 0.6 + midEnergy * 0.45 + highEnergy * 0.15);

      return { energy, lowEnergy, midEnergy, highEnergy, hasSpectrum: true };
    }

    if (speaking && this.wavEnvelope && this.wavDurationMs > 0) {
      const elapsedMs = Math.max(0, performance.now() - this.speechStartMs);
      const bucketIdx = Math.min(
        this.wavEnvelope.length - 1,
        Math.max(0, Math.floor(elapsedMs / 20)),
      );
      const energy = this.wavEnvelope[bucketIdx] ?? 0;
      return {
        energy,
        lowEnergy: energy * 0.9,
        midEnergy: energy * 0.8,
        highEnergy: energy * 0.5,
        hasSpectrum: false,
      };
    }

    if (speaking) {
      const t = Math.max(0, (performance.now() - this.speechStartMs) / 1000);
      const syl = Math.max(0, Math.sin(t * 12.5) * 0.45 + 0.52);
      const phrasePause = Math.sin(t * 2.1) < -0.82 ? 0.04 : 1.0;
      const energy = syl * phrasePause;
      return {
        energy,
        lowEnergy: energy * 0.85,
        midEnergy: energy * 0.75,
        highEnergy: energy * 0.45,
        hasSpectrum: false,
      };
    }

    return {
      energy: 0,
      lowEnergy: 0,
      midEnergy: 0,
      highEnergy: 0,
      hasSpectrum: false,
    };
  }

  public update(asset: LoadedRigAsset, dt: number, elapsed: number): void {
    const speaking = this.isCurrentlySpeaking();
    const durationMs = Math.max(1, this.wavDurationMs || this.speechFallbackDurationMs || 1);
    const elapsedMs = speaking && this.speechStartMs > 0 ? Math.max(0, performance.now() - this.speechStartMs) : 0;
    const progress01 = speaking ? THREE.MathUtils.clamp(elapsedMs / durationMs, 0, 1) : 0;

    // 1. Sample Audio Spectrum / WAV Envelope / Silence Gating + Bilingual Arabic/English Phoneme Visemes
    const audioSample = this.sampleAudioEnvelope(speaking);
    if (speaking) {
      this.speechEnergySmooth = THREE.MathUtils.lerp(this.speechEnergySmooth, audioSample.energy, 0.4);
    } else {
      this.speechEnergySmooth = THREE.MathUtils.damp(this.speechEnergySmooth, 0, 12, dt);
    }

    const visemes =
      speaking && this.lipSyncEnabled
        ? evaluateSyncedVisemes(this.phonemeTimeline, progress01, audioSample, elapsed)
        : evaluateSyncedVisemes([], 0, { energy: 0, lowEnergy: 0, midEnergy: 0, highEnergy: 0, hasSpectrum: false }, elapsed);

    // 2. Step Animation State Machine (Idle / Listening / Thinking / Speaking / Explaining / Celebrating / etc.)
    const smTick = this.stateMachine.tick(dt, progress01, speaking);
    this.activeGesture = smTick.activeAnimation;
    this.activeHandPose = smTick.handPose;
    this.activeEmotion = smTick.facialExpression;

    // 3. Facial Expression Profile + Blink & Gaze Layer
    const profile = FACIAL_EXPRESSION_PROFILES[smTick.facialExpression];
    const blinkGaze = this.blinkGazeController.update(dt, elapsed);

    const isMonkey =
      smTick.activeAnimation === 'Happy_Monkey' ||
      smTick.activeAnimation === 'Monkey_Original' ||
      smTick.activeAnimation === 'Monkey_Enhanced' ||
      smTick.activeAnimation === 'Monkey_Jump';

    const isLaughing =
      smTick.facialExpression === 'laughing' || smTick.activeAnimation === 'React_Laugh';

    const ov = this.manualOverrides;

    // Ensure mouth doesn't oscillate wildly when silent; subtle expression mouth rest only when quiet
    const restMouth = speaking ? 0 : profile.mouthRestOpen;
    const ppSuppression = visemes.visemePP > 0.45 ? 0.25 : 1.0;

    const tMouthOpen =
      ov.mouthOpen ??
      (isMonkey
        ? Math.max(visemes.jawOpen, 0.16 + Math.abs(Math.sin(elapsed * 8.5)) * 0.22) * ppSuppression
        : Math.max(visemes.jawOpen * ppSuppression, restMouth + (isLaughing ? Math.abs(Math.sin(elapsed * 9)) * 0.15 : 0)));

    const tSmile =
      ov.smile ??
      THREE.MathUtils.clamp(
        profile.smile +
          this.scriptCueOffsets.smileDelta +
          visemes.smileBoost +
          this.speechEnergySmooth * 0.12 +
          (isMonkey ? 0.2 : 0),
        0,
        1,
      );

    const tFrown = ov.frown ?? profile.frown;
    const tCheekSquint =
      ov.cheekSquint ?? THREE.MathUtils.clamp(profile.cheekSquint + (tSmile > 0.6 ? 0.12 : 0), 0, 1);

    const tVisAA = ov.visemeAA ?? visemes.visemeAA * ppSuppression;
    const tVisO = ov.visemeO ?? (speaking ? visemes.visemeO : profile.mouthRestO);
    const tVisE = ov.visemeE ?? visemes.visemeE;
    const tVisPP = ov.visemePP ?? visemes.visemePP;
    const tVisFV = ov.visemeFV ?? visemes.visemeFV;
    const tVisTH = ov.visemeTH ?? visemes.visemeTH;

    const tBrow =
      ov.browLift ??
      THREE.MathUtils.clamp(
        profile.browLift +
          this.scriptCueOffsets.browDelta +
          this.speechEnergySmooth * 0.22 +
          (isMonkey ? Math.sin(elapsed * 9) * 0.22 : 0),
        -1,
        1,
      );

    const tBlink = Math.max(ov.blink ?? 0, blinkGaze.blink);
    const tWinkLeft = Math.max(ov.winkLeft ?? 0, tBlink);
    const tWinkRight = Math.max(ov.winkRight ?? 0, profile.winkRight, tBlink);

    const tGazeX =
      ov.eyeGazeX ??
      THREE.MathUtils.clamp(profile.eyeGazeX + this.scriptCueOffsets.gazeX + blinkGaze.saccadeX, -1, 1);
    const tGazeY =
      ov.eyeGazeY ??
      THREE.MathUtils.clamp(profile.eyeGazeY + this.scriptCueOffsets.gazeY + blinkGaze.saccadeY, -1, 1);

    const tNose =
      ov.noseTwitch ??
      THREE.MathUtils.clamp(
        profile.noseTwitch + this.scriptCueOffsets.noseDelta + this.speechEnergySmooth * 0.12,
        0,
        1,
      );
    const tEar =
      ov.earPerk ??
      THREE.MathUtils.clamp(
        profile.earPerk +
          this.scriptCueOffsets.earDelta +
          this.speechEnergySmooth * 0.18 +
          (isMonkey ? Math.abs(Math.sin(elapsed * 8)) * 0.35 : 0),
        0,
        1,
      );
    const tFingerCurl = ov.fingerCurl ?? 0;

    // 4. Smooth Damping for Natural Transitions
    const c = this.currentExpression;
    c.mouthOpen = THREE.MathUtils.damp(c.mouthOpen, tMouthOpen, 24, dt);
    c.smile = THREE.MathUtils.damp(c.smile, tSmile, 10, dt);
    c.frown = THREE.MathUtils.damp(c.frown, tFrown, 10, dt);
    c.cheekSquint = THREE.MathUtils.damp(c.cheekSquint, tCheekSquint, 10, dt);
    c.visemeAA = THREE.MathUtils.damp(c.visemeAA, tVisAA, 22, dt);
    c.visemeO = THREE.MathUtils.damp(c.visemeO, tVisO, 22, dt);
    c.visemeE = THREE.MathUtils.damp(c.visemeE, tVisE, 22, dt);
    c.visemePP = THREE.MathUtils.damp(c.visemePP, tVisPP, 26, dt);
    c.visemeFV = THREE.MathUtils.damp(c.visemeFV, tVisFV, 22, dt);
    c.visemeTH = THREE.MathUtils.damp(c.visemeTH, tVisTH, 22, dt);
    c.browLift = THREE.MathUtils.damp(c.browLift, tBrow, 11, dt);
    c.blink = THREE.MathUtils.damp(c.blink, tBlink, 35, dt);
    c.winkLeft = THREE.MathUtils.damp(c.winkLeft, tWinkLeft, 28, dt);
    c.winkRight = THREE.MathUtils.damp(c.winkRight, tWinkRight, 28, dt);
    c.eyeGazeX = THREE.MathUtils.damp(c.eyeGazeX, tGazeX, 12, dt);
    c.eyeGazeY = THREE.MathUtils.damp(c.eyeGazeY, tGazeY, 12, dt);
    c.noseTwitch = THREE.MathUtils.damp(c.noseTwitch, tNose, 14, dt);
    c.earPerk = THREE.MathUtils.damp(c.earPerk, tEar, 11, dt);
    c.fingerCurl = THREE.MathUtils.damp(c.fingerCurl, tFingerCurl, 12, dt);

    // 5. Apply to Morph Targets (preserving indices 0..11 + optional 12..15)
    this.setMorphGroup(asset, 'jawOpen', c.mouthOpen);
    this.setMorphGroup(asset, 'visemeAA', c.visemeAA);
    this.setMorphGroup(asset, 'visemeO', c.visemeO);
    this.setMorphGroup(asset, 'visemeE', c.visemeE);
    this.setMorphGroup(asset, 'visemePP', c.visemePP);
    this.setMorphGroup(asset, 'visemeFV', c.visemeFV);
    this.setMorphGroup(asset, 'visemeTH', c.visemeTH);
    this.setMorphGroup(asset, 'mouthSmile', c.smile);
    this.setMorphGroup(asset, 'mouthFrown', c.frown);
    this.setMorphGroup(asset, 'cheekSquint', c.cheekSquint);
    this.setMorphGroup(asset, 'browUp', Math.max(0, c.browLift));
    this.setMorphGroup(asset, 'browDown', Math.max(0, -c.browLift));
    this.setMorphGroup(asset, 'eyeBlinkLeft', c.winkLeft);
    this.setMorphGroup(asset, 'eyeBlinkRight', c.winkRight);
    this.setMorphGroup(asset, 'eyeLookUp', Math.max(0, c.eyeGazeY));
    this.setMorphGroup(asset, 'eyeLookDown', Math.max(0, -c.eyeGazeY));
    this.setMorphGroup(asset, 'eyeLookOut', Math.max(0, c.eyeGazeX));
    this.setMorphGroup(asset, 'eyeLookIn', Math.max(0, -c.eyeGazeX));
    this.setMorphGroup(asset, 'noseSneer', c.noseTwitch);
    this.setMorphGroup(asset, 'earPerk', c.earPerk);

    // 6. Apply to Facial Bones (balanced Jaw/Mouth lateral + Eye/Eyelid/Brow/Nose/Ear micro-motion)
    const b = asset.bindings.bones;
    const lateralMouthYaw = (c.visemeE - c.visemeO) * 0.085;
    this.applyBoneOffset(asset, b.jaw, [c.mouthOpen * 0.13, lateralMouthYaw * 0.5, 0], dt, 24);
    this.applyBoneOffset(asset, b.mouth, [c.mouthOpen * 0.07, lateralMouthYaw, 0], dt, 24);
    this.applyBoneOffset(asset, b.leftEye, [-c.eyeGazeY * 0.28, c.eyeGazeX * 0.34, 0], dt, 16);
    this.applyBoneOffset(asset, b.rightEye, [-c.eyeGazeY * 0.28, c.eyeGazeX * 0.34, 0], dt, 16);
    this.applyBoneOffset(asset, b.leftEyelid, [c.winkLeft * 0.55, 0, 0], dt, 32);
    this.applyBoneOffset(asset, b.rightEyelid, [c.winkRight * 0.55, 0, 0], dt, 32);
    this.applyBoneOffset(asset, b.leftBrow, [0, 0, c.browLift * 0.24], dt, 12);
    this.applyBoneOffset(asset, b.rightBrow, [0, 0, -c.browLift * 0.24], dt, 12);
    this.applyBoneOffset(
      asset,
      b.nose,
      [-c.noseTwitch * 0.18, 0, Math.sin(elapsed * 8) * c.noseTwitch * 0.08],
      dt,
      18,
    );
    this.applyBoneOffset(asset, b.leftEar, [0, -c.earPerk * 0.22, c.earPerk * 0.26], dt, 14);
    this.applyBoneOffset(asset, b.rightEar, [0, c.earPerk * 0.22, -c.earPerk * 0.26], dt, 14);

    // 7. Apply Full-Body Pose from 150-Animation Library + Pelvis Root Offset
    const poseFrame = evaluateAnimationLibraryPose(
      smTick.activeAnimation,
      smTick.animClock,
      this.speechEnergySmooth,
      smTick.intensity,
      smTick.handPose,
    );

    const targetPelvis = poseFrame.pelvisPos ?? [0, 0, 0];
    this.currentPelvisOffset[0] = THREE.MathUtils.damp(this.currentPelvisOffset[0], targetPelvis[0], 9.5, dt);
    this.currentPelvisOffset[1] = THREE.MathUtils.damp(this.currentPelvisOffset[1], targetPelvis[1], 9.5, dt);
    this.currentPelvisOffset[2] = THREE.MathUtils.damp(this.currentPelvisOffset[2], targetPelvis[2], 9.5, dt);

    if (b.pelvis) {
      const restP = asset.restPositions.get(b.pelvis.name);
      if (restP) {
        b.pelvis.position.set(
          restP.x + this.currentPelvisOffset[0],
          restP.y + this.currentPelvisOffset[1],
          restP.z + this.currentPelvisOffset[2],
        );
      }
    }

    const poseSpeed = poseFrame.dampingSpeed ?? 8.5;
    (Object.keys(poseFrame.bones) as SemanticBoneKey[]).forEach((sKey) => {
      const targetBone = b[sKey];
      const off = poseFrame.bones[sKey];
      if (targetBone && off) {
        this.applyBoneOffset(asset, targetBone, off, dt, poseSpeed);
      }
    });

    for (const sKey of ALL_BODY_BONE_KEYS) {
      if (!poseFrame.bones[sKey] && b[sKey]) {
        this.applyBoneOffset(asset, b[sKey], [0, 0, 0], dt, poseSpeed);
      }
    }

    // 8. Apply All 10 Fingers Pose (supports counting 1-5, pointing, stop, beckon, thumbs_up, manual override)
    const manualCurlVal = Math.max(0, Math.min(1, c.fingerCurl));
    const fingerLeft =
      manualCurlVal > 0.02
        ? {
            thumb: manualCurlVal * 0.75,
            index: manualCurlVal * 1.25,
            middle: manualCurlVal * 1.25,
            ring: manualCurlVal * 1.25,
            pinky: manualCurlVal * 1.25,
          }
        : poseFrame.fingerLeft!;
    const fingerRight =
      manualCurlVal > 0.02
        ? {
            thumb: manualCurlVal * 0.75,
            index: manualCurlVal * 1.25,
            middle: manualCurlVal * 1.25,
            ring: manualCurlVal * 1.25,
            pinky: manualCurlVal * 1.25,
          }
        : poseFrame.fingerRight!;

    const fingerMap: Array<{ key: FingerKey; curl: number; sign: number }> = [
      { key: 'leftThumb', curl: fingerLeft.thumb, sign: 1 },
      { key: 'leftIndex', curl: fingerLeft.index, sign: 1 },
      { key: 'leftMiddle', curl: fingerLeft.middle, sign: 1 },
      { key: 'leftRing', curl: fingerLeft.ring, sign: 1 },
      { key: 'leftPinky', curl: fingerLeft.pinky, sign: 1 },
      { key: 'rightThumb', curl: fingerRight.thumb, sign: -1 },
      { key: 'rightIndex', curl: fingerRight.index, sign: -1 },
      { key: 'rightMiddle', curl: fingerRight.middle, sign: -1 },
      { key: 'rightRing', curl: fingerRight.ring, sign: -1 },
      { key: 'rightPinky', curl: fingerRight.pinky, sign: -1 },
    ];

    for (const fm of fingerMap) {
      const chain = asset.bindings.fingers[fm.key];
      chain.forEach((fBone, idx) => {
        const bend = fm.curl * (idx === 0 ? 0.65 : 0.85);
        const isThumb = fm.key.toLowerCase().includes('thumb');
        const euler: [number, number, number] = isThumb
          ? [0, fm.sign * bend * 0.55, fm.sign * bend * 0.35]
          : [0, 0, fm.sign * bend];
        this.applyBoneOffset(asset, fBone, euler, dt, 11);
      });
    }
  }
}
