import React, { useState } from 'react';
import {
  Bone,
  Camera,
  ChevronDown,
  ChevronUp,
  Eye,
  FlipHorizontal,
  Grid3X3,
  Layers,
  Library,
  Maximize2,
  Mic,
  MicOff,
  Move,
  Paintbrush,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  RotateCw,
  Search,
  Send,
  Sliders,
  Smile,
  Square,
  Upload,
  Volume2,
} from 'lucide-react';
import {
  ANIMATION_LIBRARY_LIST,
  CATEGORY_LABELS,
} from '../rigging/animationLibrary';
import { FACIAL_EXPRESSION_PROFILES } from '../rigging/facialSystem';
import {
  AnimationCategoryCode,
  AnimationId,
  AnimationPresetId,
  AnimationStateId,
  BoneNodeInfo,
  CameraPresetId,
  EmotionId,
  FacialExpressionPresetId,
  FacialExpressionState,
  GestureCueId,
  GradeLevelId,
  HandPoseId,
  KeyframePose,
  PresetModelId,
  QualityPreset,
  RigChannelSummary,
  RigStats,
  StageSettings,
  StudioMode,
  SubjectId,
  TransformMode,
  TransformSpace,
  WeightBrushMode,
  WeightBrushSettings,
} from '../rigging/types';

interface StudioDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mode: StudioMode;
  activePreset: PresetModelId | 'custom';
  stats: RigStats;
  channelSummary: RigChannelSummary;
  bones: BoneNodeInfo[];
  selectedBoneIndex: number;
  onSelectBone: (index: number) => void;
  onSelectPreset: (preset: PresetModelId) => void;
  onOpenImport: () => void;

  // Transform controls
  transformMode: TransformMode;
  onChangeTransformMode: (m: TransformMode) => void;
  transformSpace: TransformSpace;
  onChangeTransformSpace: (s: TransformSpace) => void;
  onSetBoneTransform: (
    boneIndex: number,
    pos?: [number, number, number],
    rotDeg?: [number, number, number],
  ) => void;
  onResetSelectedBone: () => void;
  onResetFullPose: () => void;

  // Rig editing
  falloffPower: number;
  onChangeFalloffPower: (val: number) => void;
  onRebindAutoWeight: () => void;
  onAddChildBone: () => void;

  // Weight painting
  brushSettings: WeightBrushSettings;
  onChangeBrushSettings: (next: WeightBrushSettings) => void;

  // Animation
  animationPreset: AnimationPresetId;
  onChangeAnimationPreset: (p: AnimationPresetId) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: number;
  onChangePlaybackSpeed: (s: number) => void;
  loopAnimation: boolean;
  onToggleLoop: () => void;
  animTime: number;
  animDuration: number;
  onScrubAnimation: (t: number) => void;
  customKeyframes: KeyframePose[];
  onCaptureKeyframe: () => void;
  onClearKeyframes: () => void;
  onJumpToKeyframe: (kf: KeyframePose) => void;

  // Gemini Performance & Lipsync
  geminiInput: string;
  onChangeGeminiInput: (val: string) => void;
  speechMode: 'chat' | 'direct';
  onChangeSpeechMode: (m: 'chat' | 'direct') => void;
  onSendGeminiPrompt: () => void;
  geminiLoading: boolean;
  isSpeaking: boolean;
  onStopSpeech: () => void;
  voiceName: string;
  onChangeVoiceName: (v: string) => void;
  lastReplyText: string | null;
  lastGeminiError: string | null;
  onSpeakLastDirectly?: () => void;
  activeGesture: GestureCueId;
  onTriggerGestureCue: (
    gesture: GestureCueId,
    handPose: HandPoseId,
    emotion: EmotionId,
  ) => void;
  manualExpressions: Partial<FacialExpressionState>;
  onChangeManualExpressions: (next: Partial<FacialExpressionState>) => void;
  isListeningMic: boolean;
  onToggleMic: () => void;
  micSupported: boolean;

  // Educational Tutor, 150-Animation Library, State & Quality Tuning
  gradeLevel: GradeLevelId;
  onChangeGradeLevel: (g: GradeLevelId) => void;
  subject: SubjectId;
  onChangeSubject: (s: SubjectId) => void;
  interactionState: AnimationStateId;
  activeAnimationId: AnimationId;
  activeFacialExpression: FacialExpressionPresetId;
  onTriggerLibraryAnimation: (animId: AnimationId) => void;
  onSelectFacialExpression: (expr: FacialExpressionPresetId) => void;
  onInputFocusChange: (focused: boolean) => void;
  perfSpeed: number;
  perfIntensity: number;
  onChangePerfTuning: (speed: number, intensity: number) => void;

  // Stage & Camera
  stageSettings: StageSettings;
  onChangeStageSettings: (next: StageSettings) => void;
  onCameraPreset: (cam: CameraPresetId) => void;
}

export const StudioDock: React.FC<StudioDockProps> = ({
  collapsed,
  onToggleCollapse,
  mode,
  activePreset,
  stats,
  channelSummary,
  bones,
  selectedBoneIndex,
  onSelectBone,
  onSelectPreset,
  onOpenImport,
  transformMode,
  onChangeTransformMode,
  transformSpace,
  onChangeTransformSpace,
  onSetBoneTransform,
  onResetSelectedBone,
  onResetFullPose,
  falloffPower,
  onChangeFalloffPower,
  onRebindAutoWeight,
  onAddChildBone,
  brushSettings,
  onChangeBrushSettings,
  animationPreset,
  onChangeAnimationPreset,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onChangePlaybackSpeed,
  loopAnimation,
  onToggleLoop,
  animTime,
  animDuration,
  onScrubAnimation,
  customKeyframes,
  onCaptureKeyframe,
  onClearKeyframes,
  onJumpToKeyframe,
  geminiInput,
  onChangeGeminiInput,
  speechMode,
  onChangeSpeechMode,
  onSendGeminiPrompt,
  geminiLoading,
  isSpeaking,
  onStopSpeech,
  voiceName,
  onChangeVoiceName,
  lastReplyText,
  lastGeminiError,
  onSpeakLastDirectly,
  activeGesture,
  onTriggerGestureCue,
  manualExpressions,
  onChangeManualExpressions,
  isListeningMic,
  onToggleMic,
  micSupported,
  gradeLevel,
  onChangeGradeLevel,
  subject,
  onChangeSubject,
  interactionState,
  activeAnimationId,
  activeFacialExpression,
  onTriggerLibraryAnimation,
  onSelectFacialExpression,
  onInputFocusChange,
  perfSpeed,
  perfIntensity,
  onChangePerfTuning,
  stageSettings,
  onChangeStageSettings,
  onCameraPreset,
}) => {
  const [showStageSubbar, setShowStageSubbar] = useState(false);
  const [showFaceRigTester, setShowFaceRigTester] = useState(false);
  const [showLibraryBrowser, setShowLibraryBrowser] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState<'ALL' | AnimationCategoryCode>('ALL');
  const [librarySearch, setLibrarySearch] = useState('');
  const selectedBone = bones[selectedBoneIndex] ?? bones[0];

  const filteredLibrary = ANIMATION_LIBRARY_LIST.filter((item) => {
    if (libraryCategory !== 'ALL' && item.category !== libraryCategory) return false;
    const q = librarySearch.trim().toLowerCase();
    if (!q) return true;
    return (
      item.id.toLowerCase().includes(q) ||
      item.label.toLowerCase().includes(q) ||
      item.labelAr.includes(q)
    );
  });

  const handleRotAxis = (axis: 0 | 1 | 2, deg: number) => {
    if (!selectedBone) return;
    const next: [number, number, number] = [...selectedBone.localRotationDeg];
    next[axis] = deg;
    onSetBoneTransform(selectedBone.index, undefined, next);
  };

  const handlePosAxis = (axis: 0 | 1 | 2, val: number) => {
    if (!selectedBone) return;
    const next: [number, number, number] = [...selectedBone.localPosition];
    next[axis] = val;
    onSetBoneTransform(selectedBone.index, next, undefined);
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 z-20 w-[min(1040px,95vw)] transition-transform duration-200 ease-out pointer-events-none"
      style={{
        transform: collapsed
          ? 'translate(-50%, calc(100% + 20px))'
          : 'translate(-50%, 0)',
      }}
    >
      {/* Spoken Subtitle Strip cleanly positioned just above the dock */}
      {mode === 'perform' && !collapsed && (lastReplyText || lastGeminiError) && (
        <div className="flex justify-center mb-2 pointer-events-auto">
          <div
            dir="auto"
            className={`max-w-2xl px-4 py-2 rounded-lg border text-sm text-center shadow-lg flex flex-wrap items-center justify-center gap-3 ${
              lastGeminiError
                ? 'border-rose-500/40 bg-[#1f1418] text-rose-200'
                : 'border-[#2b3244] bg-[#14171f]/95 text-slate-100'
            }`}
          >
            <span>{lastGeminiError ? lastGeminiError : lastReplyText}</span>
            {lastGeminiError && onSpeakLastDirectly && (
              <button
                type="button"
                onClick={onSpeakLastDirectly}
                className="px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                انطق النص بالصوت مباشرة (Say Text)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Collapse / Expand Handle pinned to top edge of dock */}
      <div className="flex justify-center mb-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={onToggleCollapse}
          style={{
            transform: collapsed ? 'translateY(-44px)' : 'translateY(0)',
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-t-lg border border-[#282e3d] bg-[#14171f] text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          title="Toggle Studio Controls (H)"
        >
          {collapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Hide Controls</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Container */}
      <div className="pointer-events-auto rounded-xl border border-[#272d3b] bg-[#14171f]/95 shadow-2xl overflow-hidden">
        {/* Top Utility & Asset Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-[#222734]">
          <div className="flex items-center gap-2">
            <div className="flex items-center p-0.5 rounded-lg bg-[#0d0f14] border border-[#232836]">
              {(
                [
                  { id: 'sample_boy', label: 'Uploaded Boy' },
                  { id: 'lumi', label: 'Lumi Guide' },
                  { id: 'mannequin', label: 'Mannequin' },
                  { id: 'mech', label: 'Mech' },
                  { id: 'quadruped', label: 'Quadruped' },
                ] as { id: PresetModelId; label: string }[]
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectPreset(p.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activePreset === p.id
                      ? 'bg-[#222836] text-amber-400'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenImport}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#2b3242] bg-[#1a1e29] text-slate-200 hover:border-amber-500/60 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Import GLB / FBX / OBJ</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 font-mono-tabular">
            <span className="text-slate-200 font-sans font-medium truncate max-w-[140px]">
              {stats.modelName}
            </span>
            <span aria-hidden="true">·</span>
            <span>{stats.triangleCount.toLocaleString()} tris</span>
            <span aria-hidden="true">·</span>
            <span>{stats.boneCount} bones</span>
            <span aria-hidden="true">·</span>
            <span>{channelSummary.totalMorphTargets} morphs</span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#0d0f14] border border-[#232836]">
              {(
                [
                  { id: 'threeQuarter', label: '3/4' },
                  { id: 'front', label: 'Front' },
                  { id: 'side', label: 'Side' },
                  { id: 'top', label: 'Top' },
                  { id: 'focusBone', label: 'Focus' },
                ] as { id: CameraPresetId; label: string }[]
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onCameraPreset(c.id)}
                  className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-amber-400 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title={`Camera: ${c.label}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowStageSubbar((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showStageSubbar
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                  : 'border-[#2b3242] bg-[#1a1e29] text-slate-300 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Viewport</span>
            </button>
          </div>
        </div>

        {/* Optional Viewport / Stage Display Strip */}
        {showStageSubbar && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[#10131a] border-b border-[#222734]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChangeStageSettings({ ...stageSettings, xrayBones: !stageSettings.xrayBones })
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  stageSettings.xrayBones
                    ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                    : 'border-[#252b38] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Bone className="w-3.5 h-3.5" />
                <span>X-Ray Bones</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeStageSettings({ ...stageSettings, showBones: !stageSettings.showBones })
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  stageSettings.showBones
                    ? 'border-slate-500/50 bg-slate-700/30 text-slate-200'
                    : 'border-[#252b38] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Skeleton</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeStageSettings({
                    ...stageSettings,
                    symmetryMirror: !stageSettings.symmetryMirror,
                  })
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  stageSettings.symmetryMirror
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    : 'border-[#252b38] text-slate-400 hover:text-slate-200'
                }`}
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                <span>X-Mirror</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeStageSettings({ ...stageSettings, wireframe: !stageSettings.wireframe })
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  stageSettings.wireframe
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                    : 'border-[#252b38] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Wireframe</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onChangeStageSettings({ ...stageSettings, showGrid: !stageSettings.showGrid })
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  stageSettings.showGrid
                    ? 'border-slate-500/50 bg-slate-700/30 text-slate-200'
                    : 'border-[#252b38] text-slate-400 hover:text-slate-200'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
                <span>Floor Grid</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500 mr-1">Quality</span>
                {(
                  [
                    { id: 'low', label: 'Low' },
                    { id: 'medium', label: 'Med' },
                    { id: 'high', label: 'High' },
                  ] as { id: QualityPreset; label: string }[]
                ).map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() =>
                      onChangeStageSettings({ ...stageSettings, qualityPreset: q.id })
                    }
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      stageSettings.qualityPreset === q.id
                        ? 'bg-[#252b3b] text-emerald-400 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="text-xs text-slate-500 mr-1">Surface</span>
                {(
                  [
                    { id: 'studio', label: 'Studio' },
                    { id: 'clay', label: 'Clay' },
                    { id: 'ceramic', label: 'Ceramic' },
                    { id: 'graphite', label: 'Graphite' },
                  ] as { id: StageSettings['materialPreset']; label: string }[]
                ).map((mat) => (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() =>
                      onChangeStageSettings({ ...stageSettings, materialPreset: mat.id })
                    }
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      stageSettings.materialPreset === mat.id
                        ? 'bg-[#252b3b] text-amber-400 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Horizontal Bone Hierarchy Picker Strip (for Pose, Edit Rig, Weights) */}
        {(mode === 'pose' || mode === 'rig' || mode === 'weights') && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[#222734] bg-[#12151d]">
            <span className="text-xs font-medium text-slate-400 shrink-0 flex items-center gap-1.5">
              <Bone className="w-3.5 h-3.5 text-amber-400" />
              <span>Bone</span>
            </span>
            <div className="flex items-center gap-1 overflow-x-auto studio-scroll py-0.5 flex-1">
              {bones.map((b) => {
                const isSelected = b.index === selectedBoneIndex;
                const isMirror =
                  stageSettings.symmetryMirror && selectedBone?.mirrorName === b.name;
                return (
                  <button
                    key={`${b.index}-${b.name}`}
                    type="button"
                    onClick={() => onSelectBone(b.index)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : isMirror
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-[#1b1f2b] text-slate-300 hover:bg-[#242a3a] hover:text-white'
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Mode-Specific Precision Controls */}
        <div className="px-4 py-3">
          {mode === 'perform' && (
            <div className="flex flex-col gap-2.5">
              {/* Row 1: Grade Level + Subject + Live State + Library/Face toggles + Voice */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center p-0.5 rounded-lg bg-[#0d0f14] border border-[#232836]">
                    {(
                      [
                        { id: 'prep1', label: 'أولى إعدادي' },
                        { id: 'prep2', label: 'تانية إعدادي' },
                        { id: 'prep3', label: 'تالتة إعدادي' },
                      ] as { id: GradeLevelId; label: string }[]
                    ).map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => onChangeGradeLevel(g.id)}
                        className={`px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          gradeLevel === g.id
                            ? 'bg-amber-500 text-slate-950'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>

                  <select
                    value={subject}
                    onChange={(e) => onChangeSubject(e.target.value as SubjectId)}
                    className="bg-[#0d0f14] border border-[#272d3b] rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    title="Subject"
                  >
                    <option value="general">مادة عامة</option>
                    <option value="science">العلوم</option>
                    <option value="math">الرياضيات</option>
                    <option value="arabic">اللغة العربية</option>
                    <option value="english">English</option>
                    <option value="social">الدراسات</option>
                  </select>

                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#232836] bg-[#0d0f14] text-[11px]">
                    <span className="text-amber-400 font-semibold">{interactionState}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-300 font-mono truncate max-w-[140px]">
                      {activeAnimationId}
                    </span>
                    <span className="text-slate-600">·</span>
                    <span className="text-sky-300">{activeFacialExpression}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLibraryBrowser((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showLibraryBrowser
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                        : 'border-[#2b3242] bg-[#1a1e29] text-slate-300 hover:text-white'
                    }`}
                  >
                    <Library className="w-3.5 h-3.5" />
                    <span>150 Animations &amp; Expressions</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFaceRigTester((v) => !v)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      showFaceRigTester
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                        : 'border-[#2b3242] bg-[#1a1e29] text-slate-300 hover:text-white'
                    }`}
                  >
                    <Smile className="w-3.5 h-3.5" />
                    <span>Rig Tuning</span>
                  </button>

                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    <select
                      value={voiceName}
                      onChange={(e) => onChangeVoiceName(e.target.value)}
                      className="bg-[#0d0f14] border border-[#272d3b] rounded-md px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    >
                      <option value="Kore">Kore</option>
                      <option value="Puck">Puck</option>
                      <option value="Charon">Charon</option>
                      <option value="Fenrir">Fenrir</option>
                      <option value="Zephyr">Zephyr</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Searchable 150-Animation Library + 14 Facial Expressions Drawer */}
              {showLibraryBrowser && (
                <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-[#0d0f14] border border-[#232836]">
                  {/* 14 Facial Expressions Strip */}
                  <div className="flex items-center gap-1.5 overflow-x-auto studio-scroll pb-1 border-b border-[#1d2230]">
                    <span className="text-[11px] font-medium text-slate-400 shrink-0 mr-1">
                      14 Expressions:
                    </span>
                    {(Object.values(FACIAL_EXPRESSION_PROFILES) as Array<
                      (typeof FACIAL_EXPRESSION_PROFILES)[FacialExpressionPresetId]
                    >).map((expr) => (
                      <button
                        key={expr.id}
                        type="button"
                        onClick={() => onSelectFacialExpression(expr.id)}
                        className={`px-2 py-1 text-[11px] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          activeFacialExpression === expr.id
                            ? 'bg-sky-500 text-slate-950 font-semibold'
                            : 'bg-[#171b25] text-slate-300 hover:text-white hover:bg-[#212736]'
                        }`}
                        title={expr.label}
                      >
                        {expr.labelAr} · {expr.label}
                      </button>
                    ))}
                  </div>

                  {/* Category Tabs + Search */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 overflow-x-auto studio-scroll">
                      <button
                        type="button"
                        onClick={() => setLibraryCategory('ALL')}
                        className={`px-2 py-1 text-[11px] rounded cursor-pointer whitespace-nowrap ${
                          libraryCategory === 'ALL'
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-[#171b25] text-slate-300 hover:text-white'
                        }`}
                      >
                        All (150)
                      </button>
                      {(Object.keys(CATEGORY_LABELS) as AnimationCategoryCode[]).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setLibraryCategory(cat)}
                          className={`px-2 py-1 text-[11px] rounded cursor-pointer whitespace-nowrap ${
                            libraryCategory === cat
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'bg-[#171b25] text-slate-300 hover:text-white'
                          }`}
                          title={CATEGORY_LABELS[cat].en}
                        >
                          {cat}. {CATEGORY_LABELS[cat].ar}
                        </button>
                      ))}
                    </div>

                    <div className="relative flex items-center">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 pointer-events-none" />
                      <input
                        type="text"
                        dir="auto"
                        value={librarySearch}
                        onChange={(e) => setLibrarySearch(e.target.value)}
                        placeholder="بحث بالاسم أو العربية..."
                        className="bg-[#151923] border border-[#272d3b] rounded-md pl-7 pr-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500 w-44"
                      />
                    </div>
                  </div>

                  {/* Scrollable Animation Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto studio-scroll pr-1">
                    {filteredLibrary.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onTriggerLibraryAnimation(item.id)}
                        className={`px-2 py-1.5 text-left rounded border transition-colors cursor-pointer ${
                          activeAnimationId === item.id
                            ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                            : 'border-[#202634] bg-[#151923] text-slate-300 hover:border-slate-600 hover:text-white'
                        }`}
                        title={`${item.index}. ${item.id} (${item.categoryLabel})`}
                      >
                        <div className="text-[11px] font-medium truncate">
                          {item.index}. {item.labelAr}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          {item.id}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional Face, Fingers, Speed & Intensity Sliders */}
              {showFaceRigTester && (
                <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5 p-2.5 rounded-lg bg-[#0d0f14] border border-[#232836]">
                  <label className="flex flex-col gap-1 text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span>Speed</span>
                      <span className="font-mono-tabular text-sky-400">
                        {perfSpeed.toFixed(2)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.5}
                      step={0.05}
                      value={perfSpeed}
                      onChange={(e) => onChangePerfTuning(Number(e.target.value), perfIntensity)}
                      className="studio-range w-full"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span>Intensity</span>
                      <span className="font-mono-tabular text-sky-400">
                        {perfIntensity.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={1.4}
                      step={0.05}
                      value={perfIntensity}
                      onChange={(e) => onChangePerfTuning(perfSpeed, Number(e.target.value))}
                      className="studio-range w-full"
                    />
                  </label>

                  {(
                    [
                      { key: 'mouthOpen', label: 'Mouth', min: 0, max: 1 },
                      { key: 'smile', label: 'Smile', min: 0, max: 1 },
                      { key: 'browLift', label: 'Brows', min: -1, max: 1 },
                      { key: 'blink', label: 'Blink', min: 0, max: 1 },
                      { key: 'eyeGazeX', label: 'Gaze', min: -1, max: 1 },
                      { key: 'noseTwitch', label: 'Nose', min: 0, max: 1 },
                      { key: 'earPerk', label: 'Ears', min: 0, max: 1 },
                      { key: 'fingerCurl', label: 'Fingers', min: 0, max: 1 },
                    ] as {
                      key: keyof FacialExpressionState;
                      label: string;
                      min: number;
                      max: number;
                    }[]
                  ).map((item) => {
                    const val = manualExpressions[item.key] ?? 0;
                    return (
                      <label key={item.key} className="flex flex-col gap-1 text-[11px] text-slate-300">
                        <div className="flex justify-between">
                          <span>{item.label}</span>
                          <span className="font-mono-tabular text-amber-400">
                            {val.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={item.min}
                          max={item.max}
                          step={0.05}
                          value={val}
                          onChange={(e) =>
                            onChangeManualExpressions({
                              ...manualExpressions,
                              [item.key]: Number(e.target.value),
                            })
                          }
                          className="studio-range w-full"
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Row 2: Quick Reactive Educational & Playful Cues */}
              <div className="flex items-center gap-1.5 overflow-x-auto studio-scroll pb-0.5">
                {(
                  [
                    { g: 'Idle_Normal', h: 'relaxed', e: 'calm', label: 'Idle' },
                    { g: 'Wave_Hello', h: 'open', e: 'happy', label: 'أهلاً Wave' },
                    { g: 'Listen_Attentive', h: 'relaxed', e: 'listening', label: 'يستمع' },
                    { g: 'Explain_OpenHands', h: 'open', e: 'explaining', label: 'يشرح' },
                    { g: 'Think_HandOnChin', h: 'chin_rest', e: 'thinking', label: 'يفكر' },
                    { g: 'Think_ScratchHead', h: 'relaxed', e: 'curious', label: 'يهرش رأسه' },
                    { g: 'Think_HandToMouth', h: 'chin_rest', e: 'surprised', label: 'إيده عند بقه' },
                    { g: 'Think_Idea', h: 'point', e: 'excited', label: 'فكرة حلوة!' },
                    { g: 'Happy_Clap', h: 'open', e: 'proud', label: 'تصفيق 👏' },
                    { g: 'Happy_Monkey', h: 'fist', e: 'laughing', label: 'قرد مرح 🐒' },
                    { g: 'Backflip_Enhanced', h: 'open', e: 'excited', label: 'شقلبة' },
                    { g: 'Explain_Count_Three', h: 'count_three', e: 'explaining', label: 'عد 1-2-3' },
                    { g: 'Celebrate_Correct_Answer', h: 'thumbs_up', e: 'excited', label: 'إجابة صحيحة!' },
                    { g: 'Encourage_Student', h: 'open', e: 'encouraging', label: 'تشجيع' },
                  ] as {
                    g: AnimationId;
                    h: HandPoseId;
                    e: EmotionId;
                    label: string;
                  }[]
                ).map((cue) => (
                  <button
                    key={cue.g}
                    type="button"
                    onClick={() => onTriggerGestureCue(cue.g, cue.h, cue.e)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeAnimationId === cue.g || activeGesture === cue.g
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-[#1a1e29] text-slate-300 hover:text-white hover:bg-[#232938]'
                    }`}
                  >
                    {cue.label}
                  </button>
                ))}
              </div>

              {/* Row 3: Conversational Input to Gemini Educational Tutor API */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onSendGeminiPrompt();
                }}
                className="flex items-center gap-2"
              >
                {micSupported && (
                  <button
                    type="button"
                    onClick={onToggleMic}
                    className={`p-2 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                      isListeningMic
                        ? 'border-rose-500 bg-rose-500/20 text-rose-300'
                        : 'border-[#2b3242] bg-[#1a1e29] text-slate-300 hover:text-white'
                    }`}
                    title="Voice input"
                  >
                    {isListeningMic ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}

                <div className="flex items-center p-0.5 rounded-lg bg-[#0d0f14] border border-[#232836] shrink-0">
                  <button
                    type="button"
                    onClick={() => onChangeSpeechMode('chat')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      speechMode === 'chat'
                        ? 'bg-[#222836] text-amber-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Gemini Tutor
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeSpeechMode('direct')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                      speechMode === 'direct'
                        ? 'bg-[#222836] text-amber-400'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Say Text
                  </button>
                </div>

                <input
                  type="text"
                  dir="auto"
                  value={geminiInput}
                  onFocus={() => onInputFocusChange(true)}
                  onBlur={() => onInputFocusChange(false)}
                  onChange={(e) => onChangeGeminiInput(e.target.value)}
                  placeholder={
                    speechMode === 'direct'
                      ? 'اكتب النص ليقرأه المساعد بتزامن حركة الفم العربي...'
                      : 'اسألني أي سؤال في منهج الإعدادي (عربي / English)...'
                  }
                  className="flex-1 bg-[#0d0f14] border border-[#272d3b] rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />

                {isSpeaking && (
                  <button
                    type="button"
                    onClick={onStopSpeech}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop</span>
                  </button>
                )}

                <button
                  type="submit"
                  disabled={geminiLoading || !geminiInput.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{geminiLoading ? 'Thinking...' : 'Speak'}</span>
                </button>
              </form>
            </div>
          )}

          {mode === 'pose' && selectedBone && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center p-0.5 rounded-lg bg-[#0d0f14] border border-[#232836]">
                  <button
                    type="button"
                    onClick={() => onChangeTransformMode('rotate')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      transformMode === 'rotate'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Rotate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeTransformMode('translate')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      transformMode === 'translate'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Move className="w-3.5 h-3.5" />
                    <span>Move</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeTransformMode('scale')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      transformMode === 'scale'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Scale</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onChangeTransformSpace(transformSpace === 'local' ? 'world' : 'local')
                  }
                  className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#2b3242] bg-[#1a1e29] text-slate-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {transformSpace === 'local' ? 'Local Space' : 'World Space'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-4 flex-1 justify-center">
                {(['X', 'Y', 'Z'] as const).map((axisLabel, axisIdx) => {
                  const val = Math.round(selectedBone.localRotationDeg[axisIdx as 0 | 1 | 2]);
                  return (
                    <label
                      key={axisLabel}
                      className="flex items-center gap-2 text-xs text-slate-300"
                    >
                      <span
                        className={`font-mono-tabular font-semibold w-4 ${
                          axisIdx === 0
                            ? 'text-rose-400'
                            : axisIdx === 1
                              ? 'text-emerald-400'
                              : 'text-sky-400'
                        }`}
                      >
                        {axisLabel}
                      </span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={val}
                        onChange={(e) =>
                          handleRotAxis(axisIdx as 0 | 1 | 2, Number(e.target.value))
                        }
                        className="studio-range w-24"
                      />
                      <span className="font-mono-tabular text-slate-300 w-10 text-right">
                        {val}°
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onResetSelectedBone}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#2b3242] bg-[#1a1e29] text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Reset Bone
                </button>
                <button
                  type="button"
                  onClick={onResetFullPose}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#2b3242] bg-[#1a1e29] text-slate-200 hover:border-amber-500/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Reset T-Pose</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'rig' && selectedBone && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  Joint Position ({selectedBone.name})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                {(['X', 'Y', 'Z'] as const).map((axisLabel, axisIdx) => {
                  const val = selectedBone.localPosition[axisIdx as 0 | 1 | 2];
                  return (
                    <label
                      key={axisLabel}
                      className="flex items-center gap-2 text-xs text-slate-300"
                    >
                      <span
                        className={`font-mono-tabular font-semibold ${
                          axisIdx === 0
                            ? 'text-rose-400'
                            : axisIdx === 1
                              ? 'text-emerald-400'
                              : 'text-sky-400'
                        }`}
                      >
                        {axisLabel}
                      </span>
                      <input
                        type="range"
                        min={-1.2}
                        max={1.8}
                        step={0.01}
                        value={val}
                        onChange={(e) =>
                          handlePosAxis(axisIdx as 0 | 1 | 2, Number(e.target.value))
                        }
                        className="studio-range w-24"
                      />
                      <span className="font-mono-tabular text-slate-300 w-12 text-right">
                        {val.toFixed(2)}m
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Falloff</span>
                  <input
                    type="range"
                    min={1.5}
                    max={6.0}
                    step={0.1}
                    value={falloffPower}
                    onChange={(e) => onChangeFalloffPower(Number(e.target.value))}
                    className="studio-range w-20"
                  />
                  <span className="font-mono-tabular w-7 text-right">
                    {falloffPower.toFixed(1)}
                  </span>
                </label>

                <button
                  type="button"
                  onClick={onAddChildBone}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#2b3242] bg-[#1a1e29] text-slate-200 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  <span>Add Child Bone</span>
                </button>

                <button
                  type="button"
                  onClick={onRebindAutoWeight}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Bone className="w-3.5 h-3.5" />
                  <span>Bind & Auto-Weight</span>
                </button>
              </div>
            </div>
          )}

          {mode === 'weights' && selectedBone && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center p-0.5 rounded-lg bg-[#0d0f14] border border-[#232836]">
                  {(
                    [
                      { id: 'add', label: 'Add' },
                      { id: 'subtract', label: 'Subtract' },
                      { id: 'smooth', label: 'Smooth' },
                    ] as { id: WeightBrushMode; label: string }[]
                  ).map((bm) => (
                    <button
                      key={bm.id}
                      type="button"
                      onClick={() => onChangeBrushSettings({ ...brushSettings, mode: bm.id })}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        brushSettings.mode === bm.id
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Paintbrush className="w-3 h-3" />
                      <span>{bm.label}</span>
                    </button>
                  ))}
                </div>

                <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono-tabular">0.0</span>
                  <div
                    className="w-24 h-2 rounded-full"
                    style={{
                      background:
                        'linear-gradient(90deg, #1e293b 0%, #2563eb 25%, #10b981 50%, #f59e0b 75%, #ef4444 100%)',
                    }}
                  />
                  <span className="font-mono-tabular">1.0</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Radius</span>
                  <input
                    type="range"
                    min={0.04}
                    max={0.45}
                    step={0.01}
                    value={brushSettings.radius}
                    onChange={(e) =>
                      onChangeBrushSettings({
                        ...brushSettings,
                        radius: Number(e.target.value),
                      })
                    }
                    className="studio-range w-24"
                  />
                  <span className="font-mono-tabular w-11 text-right">
                    {brushSettings.radius.toFixed(2)}m
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <span>Strength</span>
                  <input
                    type="range"
                    min={0.05}
                    max={1.0}
                    step={0.05}
                    value={brushSettings.strength}
                    onChange={(e) =>
                      onChangeBrushSettings({
                        ...brushSettings,
                        strength: Number(e.target.value),
                      })
                    }
                    className="studio-range w-24"
                  />
                  <span className="font-mono-tabular w-10 text-right">
                    {Math.round(brushSettings.strength * 100)}%
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-xs text-slate-400 font-mono-tabular">
                  <span>{selectedBone.vertexInfluenceCount} verts</span>
                  <span aria-hidden="true" className="mx-1.5">
                    ·
                  </span>
                  <span>avg {(selectedBone.averageWeight * 100).toFixed(0)}%</span>
                </div>

                <button
                  type="button"
                  onClick={onRebindAutoWeight}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[#2b3242] bg-[#1a1e29] text-slate-200 hover:border-amber-500/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Auto-Weight Mesh
                </button>
              </div>
            </div>
          )}

          {mode === 'animate' && (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-lg bg-[#0d0f14] border border-[#232836]">
                  {(
                    [
                      { id: 'idle', label: 'Idle' },
                      { id: 'walk', label: 'Walk' },
                      { id: 'run', label: 'Run' },
                      { id: 'wave', label: 'Wave' },
                      { id: 'think', label: 'Think' },
                      { id: 'clap', label: 'Clap' },
                      { id: 'monkey', label: 'Monkey' },
                      { id: 'backflip', label: 'Backflip' },
                      { id: 'hero', label: 'Hero' },
                      { id: 'custom', label: `Custom (${customKeyframes.length})` },
                    ] as { id: AnimationPresetId; label: string }[]
                  ).map((ap) => (
                    <button
                      key={ap.id}
                      type="button"
                      onClick={() => onChangeAnimationPreset(ap.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        animationPreset === ap.id
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {ap.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pause</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>Play</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onToggleLoop}
                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                      loopAnimation
                        ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
                        : 'border-[#2b3242] bg-[#1a1e29] text-slate-400'
                    }`}
                    title="Loop Playback"
                  >
                    <Repeat className="w-3.5 h-3.5" />
                  </button>

                  <label className="flex items-center gap-1.5 text-xs text-slate-300 ml-1">
                    <span>Speed</span>
                    <input
                      type="range"
                      min={0.25}
                      max={2.0}
                      step={0.25}
                      value={playbackSpeed}
                      onChange={(e) => onChangePlaybackSpeed(Number(e.target.value))}
                      className="studio-range w-16"
                    />
                    <span className="font-mono-tabular w-9 text-right">
                      {playbackSpeed.toFixed(2)}x
                    </span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onCaptureKeyframe}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-sky-500/40 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Record Keyframe</span>
                  </button>
                  {customKeyframes.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearKeyframes}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-[#2b3242] bg-[#1a1e29] text-slate-400 hover:text-rose-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono-tabular text-xs text-slate-300 w-12">
                  {animTime.toFixed(2)}s
                </span>
                <div className="relative flex-1 flex items-center">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(animDuration || 3.0, 0.5)}
                    step={0.01}
                    value={Math.min(animTime, Math.max(animDuration || 3.0, 0.5))}
                    onChange={(e) => onScrubAnimation(Number(e.target.value))}
                    className="studio-range w-full"
                  />
                </div>
                <span className="font-mono-tabular text-xs text-slate-500 w-12 text-right">
                  {(animDuration || 3.0).toFixed(2)}s
                </span>

                {customKeyframes.length > 0 && (
                  <div className="flex items-center gap-1">
                    {customKeyframes.map((kf) => (
                      <button
                        key={kf.id}
                        type="button"
                        onClick={() => onJumpToKeyframe(kf)}
                        className="px-2 py-0.5 text-[11px] font-mono-tabular rounded bg-[#1d2230] text-sky-300 hover:bg-sky-500/20 cursor-pointer"
                      >
                        {kf.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
