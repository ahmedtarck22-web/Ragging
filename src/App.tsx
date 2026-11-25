import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import { StudioDock } from './components/StudioDock';
import { RigViewport, RigViewportHandle } from './rigging/RigViewport';
import {
  AnimationId,
  AnimationPresetId,
  AnimationStateId,
  BoneNodeInfo,
  CameraPresetId,
  ChatTurn,
  EmotionId,
  FacialExpressionPresetId,
  FacialExpressionState,
  GestureCueId,
  GradeLevelId,
  HandPoseId,
  KeyframePose,
  PerformanceScript,
  PresetModelId,
  RigChannelSummary,
  RigStats,
  StageSettings,
  StudioMode,
  SubjectId,
  TransformMode,
  TransformSpace,
  WeightBrushSettings,
} from './rigging/types';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export default function App() {
  const viewportRef = useRef<RigViewportHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const [mode, setMode] = useState<StudioMode>('perform');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetModelId | 'custom'>('sample_boy');

  const [bones, setBones] = useState<BoneNodeInfo[]>([]);
  const [selectedBoneIndex, setSelectedBoneIndex] = useState(0);
  const [stats, setStats] = useState<RigStats>({
    modelName: 'Uploaded Boy GLB',
    vertexCount: 0,
    triangleCount: 0,
    boneCount: 0,
    isCustomMesh: true,
  });
  const [channelSummary, setChannelSummary] = useState<RigChannelSummary>({
    totalBones: 0,
    totalMorphTargets: 0,
    hasJawOrMouth: true,
    hasBrows: true,
    hasEyesAndLashes: true,
    hasNose: true,
    hasEars: true,
    fingerBonesCount: 20,
    bodyBonesCount: 24,
  });

  const [transformMode, setTransformMode] = useState<TransformMode>('rotate');
  const [transformSpace, setTransformSpace] = useState<TransformSpace>('local');
  const [falloffPower, setFalloffPower] = useState(3.4);

  const [brushSettings, setBrushSettings] = useState<WeightBrushSettings>({
    mode: 'add',
    radius: 0.16,
    strength: 0.55,
  });

  const [stageSettings, setStageSettings] = useState<StageSettings>({
    showMesh: true,
    wireframe: false,
    xrayBones: true,
    showBones: true,
    showGrid: true,
    symmetryMirror: true,
    materialPreset: 'studio',
    qualityPreset: 'high',
  });

  // Animation state
  const [animationPreset, setAnimationPreset] = useState<AnimationPresetId>('walk');
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [loopAnimation, setLoopAnimation] = useState(true);
  const [animTime, setAnimTime] = useState(0);
  const [animDuration, setAnimDuration] = useState(1.2);
  const [customKeyframes, setCustomKeyframes] = useState<KeyframePose[]>([]);

  // Gemini AI Educational Tutor & Lipsync state
  const [geminiInput, setGeminiInput] = useState('');
  const [speechMode, setSpeechMode] = useState<'chat' | 'direct'>('chat');
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceName, setVoiceName] = useState('Kore');
  const [gradeLevel, setGradeLevel] = useState<GradeLevelId>('prep1');
  const [subject, setSubject] = useState<SubjectId>('general');
  const [interactionState, setInteractionState] = useState<AnimationStateId>('Idle');
  const [activeAnimationId, setActiveAnimationId] = useState<AnimationId>('Idle_Normal');
  const [activeFacialExpression, setActiveFacialExpression] =
    useState<FacialExpressionPresetId>('calm');
  const [perfSpeed, setPerfSpeed] = useState(1.0);
  const [perfIntensity, setPerfIntensity] = useState(1.0);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [lastReplyText, setLastReplyText] = useState<string | null>(null);
  const [lastGeminiError, setLastGeminiError] = useState<string | null>(null);
  const [lastSubmittedText, setLastSubmittedText] = useState<string>('');
  const [activeGesture, setActiveGesture] = useState<GestureCueId>('Idle_Normal');
  const [manualExpressions, setManualExpressions] = useState<Partial<FacialExpressionState>>({});
  const [isListeningMic, setIsListeningMic] = useState(false);

  const micSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition,
    );

  // Custom mesh import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importTemplate, setImportTemplate] = useState<'biped' | 'quadruped'>('biped');
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  const handleModeChange = (nextMode: StudioMode) => {
    setMode(nextMode);
    if (nextMode === 'rig') {
      setTransformMode('translate');
    } else if (nextMode === 'pose') {
      setTransformMode('rotate');
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (key === 'h') {
        setDockCollapsed((c) => !c);
      } else if (key === 'r') {
        setTransformMode('rotate');
      } else if (key === 'g') {
        setTransformMode('translate');
      } else if (key === 's') {
        setTransformMode('scale');
      } else if (e.code === 'Space' && mode === 'animate') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode]);

  const handleBonesUpdated = useCallback(
    (nextBones: BoneNodeInfo[], nextStats: RigStats, summary: RigChannelSummary) => {
      setBones(nextBones);
      setStats(nextStats);
      setChannelSummary(summary);
    },
    [],
  );

  const handleSelectPreset = (preset: PresetModelId) => {
    setActivePreset(preset);
    setSelectedBoneIndex(0);
    setCustomKeyframes([]);
    viewportRef.current?.loadPreset(preset);
    const labelMap: Record<PresetModelId, string> = {
      sample_boy: 'Uploaded Boy GLB',
      lumi: 'Lumi Tour Guide',
      mannequin: 'Studio Mannequin',
      mech: 'Articulated Mech',
      quadruped: 'Quadruped Hound',
    };
    showToast(`Loaded ${labelMap[preset]}`);
  };

  const handleFileUpload = async (file: File) => {
    setImportError(null);
    setImporting(true);
    try {
      await viewportRef.current?.loadCustomFile(file, importTemplate);
      setActivePreset('custom');
      setSelectedBoneIndex(0);
      setCustomKeyframes([]);
      setImportOpen(false);
      showToast(`Bound ${file.name} to Lipsync, Face & Body channels`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to parse 3D mesh file.');
    } finally {
      setImporting(false);
    }
  };

  const handleCaptureKeyframe = () => {
    const t =
      customKeyframes.length === 0
        ? 0
        : Number((customKeyframes[customKeyframes.length - 1].time + 0.75).toFixed(2));
    const kf = viewportRef.current?.captureKeyframe(t);
    if (!kf) return;
    setCustomKeyframes((prev) => [...prev, kf]);
    setAnimationPreset('custom');
    showToast(`Recorded keyframe at ${kf.label}`);
  };

  const handleJumpToKeyframe = (kf: KeyframePose) => {
    bones.forEach((b) => {
      const saved = kf.bones[b.name];
      if (saved) {
        viewportRef.current?.setBoneLocalTransform(b.index, saved.position, undefined);
      }
    });
    viewportRef.current?.scrubAnimation(kf.time);
  };

  const handleCameraPreset = (cam: CameraPresetId) => {
    viewportRef.current?.setCameraPreset(cam);
  };

  const handleSendGeminiPrompt = async (overrideText?: string, forceDirect?: boolean) => {
    const text = (overrideText ?? geminiInput).trim();
    if (!text || geminiLoading) return;

    const useDirect = forceDirect ?? speechMode === 'direct';

    // Unlock WebAudio synchronously while still inside user gesture
    viewportRef.current?.unlockAudio();

    setLastSubmittedText(text);
    setGeminiInput('');
    setLastGeminiError(null);
    setGeminiLoading(true);
    // Switch immediately into thinking state while waiting for Gemini
    setActiveGesture('Think_HandOnChin');
    viewportRef.current?.setInteractionState('thinking');

    const nextHistory: ChatTurn[] = [
      ...chatHistory,
      { id: `u_${Date.now()}`, role: 'user', text },
    ];
    setChatHistory(nextHistory);

    try {
      const response = await fetch('/api/perform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: nextHistory.slice(-6).map((h) => ({ role: h.role, text: h.text })),
          voiceName,
          characterName: stats.modelName,
          directSpeak: useDirect,
          gradeLevel,
          subject,
          recentAnimations: viewportRef.current?.getRecentAnimations() ?? [],
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Server error (${response.status})`);
      }

      const script = data as PerformanceScript;
      setLastReplyText(script.response_text ?? script.replyText);
      setActiveGesture(script.body_animation ?? script.primaryGesture);
      setChatHistory((prev) => [
        ...prev,
        {
          id: `m_${Date.now()}`,
          role: 'model',
          text: script.response_text ?? script.replyText,
          emotion: script.emotion,
          gesture: script.primaryGesture,
          animationId: script.body_animation,
          facialExpression: script.facial_expression,
        },
      ]);

      await viewportRef.current?.performScript(script);
      if (script.ttsWarning) {
        showToast('Playing phoneme-synced Arabic/English lipsync (TTS audio unavailable)');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to Gemini API.';
      setLastGeminiError(msg);
      setActiveGesture('Shrug_BothHands');
      viewportRef.current?.setPerformanceCue('Shrug_BothHands', 'open', 'confused');
    } finally {
      setGeminiLoading(false);
    }
  };

  const handleToggleMic = () => {
    if (!micSupported) return;
    if (isListeningMic && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListeningMic(false);
      return;
    }

    const Ctor = (
      window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }
    ).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = 'ar-EG';
    rec.interimResults = false;
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) {
        setGeminiInput(transcript);
        handleSendGeminiPrompt(transcript);
      }
    };
    rec.onerror = () => setIsListeningMic(false);
    rec.onend = () => setIsListeningMic(false);

    recognitionRef.current = rec;
    setIsListeningMic(true);
    viewportRef.current?.setInteractionState('listening');
    try {
      rec.start();
    } catch {
      setIsListeningMic(false);
    }
  };

  const handleTriggerGestureCue = (
    gesture: GestureCueId,
    handPose: HandPoseId,
    emotion: EmotionId,
  ) => {
    setActiveGesture(gesture);
    viewportRef.current?.setPerformanceCue(gesture, handPose, emotion);
  };

  const handleTriggerLibraryAnimation = (animId: AnimationId) => {
    setActiveGesture(animId);
    viewportRef.current?.triggerLibraryAnimation(animId);
  };

  const handleSelectFacialExpression = (expr: FacialExpressionPresetId) => {
    setActiveFacialExpression(expr);
    viewportRef.current?.setFacialExpression(expr);
  };

  const handleInputFocusChange = (focused: boolean) => {
    if (isSpeaking || geminiLoading) return;
    if (focused) {
      viewportRef.current?.setInteractionState('listening');
    } else if (!geminiInput.trim() && interactionState === 'Listening') {
      viewportRef.current?.setInteractionState('idle');
    }
  };

  const handleChangePerfTuning = (speed: number, intensity: number) => {
    setPerfSpeed(speed);
    setPerfIntensity(intensity);
    viewportRef.current?.setPerformanceTuning(speed, intensity);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0d0f14] text-slate-100">
      {/* Three-Zone Studio Top Bar */}
      <header className="fixed top-0 inset-x-0 z-20 h-14 px-6 flex items-center justify-between gap-8 bg-[#0d0f14]/92 border-b border-[#1f2430]">
        {/* Zone 1: Brand Wordmark */}
        <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          Lumi Rigging Studio
        </span>

        {/* Zone 2: 5 Single-line Mode Links */}
        <nav className="flex items-center gap-6" aria-label="Rigging workspace modes">
          {(
            [
              { id: 'perform', label: 'Gemini AI' },
              { id: 'pose', label: 'Pose' },
              { id: 'rig', label: 'Edit Rig' },
              { id: 'weights', label: 'Weights' },
              { id: 'animate', label: 'Animate' },
            ] as { id: StudioMode; label: string }[]
          ).map((item) => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleModeChange(item.id)}
                className={`relative py-4 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-amber-400 rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => viewportRef.current?.exportGLB()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export GLB</span>
          </button>
        </div>
      </header>

      {/* Full-Viewport 3D Studio Canvas */}
      <main className="w-full h-full pt-14">
        <RigViewport
          ref={viewportRef}
          mode={mode}
          transformMode={transformMode}
          transformSpace={transformSpace}
          selectedBoneIndex={selectedBoneIndex}
          stageSettings={stageSettings}
          brushSettings={brushSettings}
          animationPreset={animationPreset}
          customKeyframes={customKeyframes}
          isPlaying={isPlaying}
          playbackSpeed={playbackSpeed}
          loopAnimation={loopAnimation}
          onBonesUpdated={handleBonesUpdated}
          onSelectBone={setSelectedBoneIndex}
          onAnimationTimeUpdate={(t, dur) => {
            setAnimTime(t);
            setAnimDuration(dur);
          }}
          onSpeakingStateChange={setIsSpeaking}
          onPerformanceStateChange={(snap) => {
            setInteractionState(snap.state);
            setActiveAnimationId(snap.activeAnimation);
            setActiveFacialExpression(snap.facialExpression);
          }}
          onToast={showToast}
        />
      </main>

      {/* Subtle Toast Feedback */}
      {toast && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg border border-[#2c3344] bg-[#161a23] text-xs font-medium text-slate-100 shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* Collapsible Bottom Control Dock */}
      <StudioDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        mode={mode}
        activePreset={activePreset}
        stats={stats}
        channelSummary={channelSummary}
        bones={bones}
        selectedBoneIndex={selectedBoneIndex}
        onSelectBone={setSelectedBoneIndex}
        onSelectPreset={handleSelectPreset}
        onOpenImport={() => {
          setImportError(null);
          setImportOpen(true);
        }}
        transformMode={transformMode}
        onChangeTransformMode={setTransformMode}
        transformSpace={transformSpace}
        onChangeTransformSpace={setTransformSpace}
        onSetBoneTransform={(idx, pos, rotDeg) =>
          viewportRef.current?.setBoneLocalTransform(idx, pos, rotDeg)
        }
        onResetSelectedBone={() => viewportRef.current?.resetSelectedBone()}
        onResetFullPose={() => viewportRef.current?.resetFullPose()}
        falloffPower={falloffPower}
        onChangeFalloffPower={setFalloffPower}
        onRebindAutoWeight={() => viewportRef.current?.rebindAndAutoWeight(falloffPower)}
        onAddChildBone={() => viewportRef.current?.addChildBone(selectedBoneIndex)}
        brushSettings={brushSettings}
        onChangeBrushSettings={setBrushSettings}
        animationPreset={animationPreset}
        onChangeAnimationPreset={(p) => {
          setAnimationPreset(p);
          setIsPlaying(true);
        }}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        playbackSpeed={playbackSpeed}
        onChangePlaybackSpeed={setPlaybackSpeed}
        loopAnimation={loopAnimation}
        onToggleLoop={() => setLoopAnimation((l) => !l)}
        animTime={animTime}
        animDuration={animDuration}
        onScrubAnimation={(t) => {
          setIsPlaying(false);
          viewportRef.current?.scrubAnimation(t);
        }}
        customKeyframes={customKeyframes}
        onCaptureKeyframe={handleCaptureKeyframe}
        onClearKeyframes={() => {
          setCustomKeyframes([]);
          if (animationPreset === 'custom') setAnimationPreset('idle');
        }}
        onJumpToKeyframe={handleJumpToKeyframe}
        geminiInput={geminiInput}
        onChangeGeminiInput={setGeminiInput}
        speechMode={speechMode}
        onChangeSpeechMode={setSpeechMode}
        onSendGeminiPrompt={() => handleSendGeminiPrompt()}
        geminiLoading={geminiLoading}
        isSpeaking={isSpeaking}
        onStopSpeech={() => viewportRef.current?.stopPerformance()}
        voiceName={voiceName}
        onChangeVoiceName={setVoiceName}
        lastReplyText={lastReplyText}
        lastGeminiError={lastGeminiError}
        onSpeakLastDirectly={
          lastSubmittedText
            ? () => {
                setSpeechMode('direct');
                void handleSendGeminiPrompt(lastSubmittedText, true);
              }
            : undefined
        }
        activeGesture={activeGesture}
        onTriggerGestureCue={handleTriggerGestureCue}
        manualExpressions={manualExpressions}
        onChangeManualExpressions={(next) => {
          setManualExpressions(next);
          viewportRef.current?.setManualExpressionOverrides(next);
        }}
        isListeningMic={isListeningMic}
        onToggleMic={handleToggleMic}
        micSupported={micSupported}
        gradeLevel={gradeLevel}
        onChangeGradeLevel={setGradeLevel}
        subject={subject}
        onChangeSubject={setSubject}
        interactionState={interactionState}
        activeAnimationId={activeAnimationId}
        activeFacialExpression={activeFacialExpression}
        onTriggerLibraryAnimation={handleTriggerLibraryAnimation}
        onSelectFacialExpression={handleSelectFacialExpression}
        onInputFocusChange={handleInputFocusChange}
        perfSpeed={perfSpeed}
        perfIntensity={perfIntensity}
        onChangePerfTuning={handleChangePerfTuning}
        stageSettings={stageSettings}
        onChangeStageSettings={setStageSettings}
        onCameraPreset={handleCameraPreset}
      />

      {/* Custom Mesh Import Modal (.GLB / .GLTF / .FBX / .OBJ) */}
      {importOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileUpload(file);
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-[#2a3040] bg-[#14171f] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-white">
                Import 3D Character Mesh
              </h2>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#1e2330] transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4 leading-relaxed">
              Upload or drop a <span className="text-slate-200 font-mono">.glb</span>,{' '}
              <span className="text-slate-200 font-mono">.gltf</span>,{' '}
              <span className="text-slate-200 font-mono">.fbx</span>, or{' '}
              <span className="text-slate-200 font-mono">.obj</span> character. Existing
              skeletons &amp; facial blendshapes (mouth, jaw, brows, eyes, lashes, nose,
              ears, fingers) are bound automatically for Gemini lipsync &amp; gestures.
            </p>

            <div className="mb-4">
              <span className="block text-xs font-medium text-slate-300 mb-2">
                Auto-Rig Template (for static unrigged meshes)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setImportTemplate('biped')}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    importTemplate === 'biped'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-[#272d3b] bg-[#1a1e29] text-slate-300 hover:text-white'
                  }`}
                >
                  Expressive Biped (Face + Fingers)
                </button>
                <button
                  type="button"
                  onClick={() => setImportTemplate('quadruped')}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    importTemplate === 'quadruped'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                      : 'border-[#272d3b] bg-[#1a1e29] text-slate-300 hover:text-white'
                  }`}
                >
                  Quadruped Creature
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".glb,.gltf,.fbx,.obj"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border border-dashed border-[#343c50] bg-[#10131a] hover:border-amber-500/70 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-6 h-6 text-amber-400" />
              <span className="text-sm font-medium text-slate-200">
                {importing
                  ? 'Binding skeleton, blendshapes & fingers...'
                  : 'Choose or drop .GLB, .GLTF, .FBX, or .OBJ'}
              </span>
              <span className="text-xs text-slate-500">
                Processed locally in browser memory
              </span>
            </button>

            {importError && <p className="mt-3 text-xs text-rose-400">{importError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
