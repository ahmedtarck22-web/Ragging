export type StudioMode = 'pose' | 'rig' | 'weights' | 'animate' | 'perform';

export type PresetModelId = 'sample_boy' | 'lumi' | 'mannequin' | 'mech' | 'quadruped';

export type TransformMode = 'rotate' | 'translate' | 'scale';

export type TransformSpace = 'local' | 'world';

export type WeightBrushMode = 'add' | 'subtract' | 'smooth';

export type CameraPresetId = 'threeQuarter' | 'front' | 'side' | 'top' | 'focusBone';

export type QualityPreset = 'low' | 'medium' | 'high';

export type GradeLevelId = 'prep1' | 'prep2' | 'prep3';

export type SubjectId = 'general' | 'math' | 'science' | 'arabic' | 'english' | 'social';

export type AnimationPresetId =
  | 'none'
  | 'idle'
  | 'walk'
  | 'run'
  | 'wave'
  | 'hero'
  | 'think'
  | 'clap'
  | 'monkey'
  | 'backflip'
  | 'custom';

export type AnimationStateId =
  | 'Idle'
  | 'Listening'
  | 'Thinking'
  | 'Speaking'
  | 'Explaining'
  | 'Reacting'
  | 'Celebrating'
  | 'Moving'
  | 'Special_Action';

export type AnimationCategoryCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export type FacialExpressionPresetId =
  | 'happy'
  | 'excited'
  | 'curious'
  | 'thinking'
  | 'confused'
  | 'surprised'
  | 'sad'
  | 'encouraging'
  | 'proud'
  | 'listening'
  | 'explaining'
  | 'laughing'
  | 'winking'
  | 'calm';

export type SpeechLanguage = 'ar-EG' | 'ar' | 'en' | 'bilingual';

export type SpeechStyle =
  | 'cheerful'
  | 'calm'
  | 'enthusiastic'
  | 'thoughtful'
  | 'encouraging'
  | 'playful';

export const ANIMATION_LIBRARY_IDS = [
  // A. Idle & Personality (1-15)
  'Idle_Normal',
  'Idle_Relaxed',
  'Idle_Happy',
  'Idle_Curious',
  'Idle_Excited',
  'Idle_Confident',
  'Idle_Shy',
  'Idle_LookAround',
  'Idle_WeightShift',
  'Idle_BreathingDeep',
  'Idle_StretchArms',
  'Idle_StretchNeck',
  'Idle_TapFoot',
  'Idle_HandsBehindBack',
  'Idle_HandsOnHips',

  // B. Happy & Celebration (16-30)
  'Happy_Clap',
  'Happy_ClapFast',
  'Happy_ClapSlow',
  'Happy_Jump',
  'Happy_DoubleJump',
  'Happy_Cheer',
  'Happy_FistPump',
  'Happy_VictoryPose',
  'Happy_HandsUp',
  'Happy_DanceSmall',
  'Happy_Bounce',
  'Happy_Spin',
  'Happy_ThumbsUpBoth',
  'Happy_CelebrateStep',
  'Happy_Monkey',

  // C. Hands & Arms (31-60)
  'Wave_Hello',
  'Wave_Goodbye',
  'Wave_Friendly',
  'Wave_Big',
  'Point_Right',
  'Point_Left',
  'Point_Up',
  'Point_Forward',
  'Point_AtBoard',
  'Point_TwoHands',
  'Explain_OpenHands',
  'Explain_OneHandRight',
  'Explain_OneHandLeft',
  'Explain_StepByStep',
  'Explain_Emphasize',
  'Explain_Compare',
  'Explain_Count_One',
  'Explain_Count_Two',
  'Explain_Count_Three',
  'Explain_Count_Four',
  'Explain_Count_Five',
  'Raise_Hand',
  'Offer_Hand',
  'Stop_Gesture',
  'Come_Here',
  'Cross_Arms',
  'Hands_Together',
  'Hand_To_Chest',
  'Hand_To_Ear',
  'Shrug_BothHands',

  // D. Thinking & Explaining (61-75)
  'Think_Original',
  'Think_HandOnChin',
  'Think_HandToMouth',
  'Think_ScratchHead',
  'Think_LookUp',
  'Think_LookSide',
  'Think_PaceStep',
  'Think_Idea',
  'Think_IdeaExcited',
  'Explain_Teacher',
  'Explain_Deep',
  'Explain_Calm',
  'Explain_Storytelling',
  'Explain_Summarize',
  'Explain_Highlight',

  // E. Student Interaction (76-95)
  'Listen_Attentive',
  'Listen_HeadTilt',
  'Listen_Nodding',
  'Listen_Curious',
  'React_Agree',
  'React_StrongAgree',
  'React_Disagree',
  'React_Surprised',
  'React_Shocked',
  'React_Confused',
  'React_Laugh',
  'React_SmileNod',
  'React_Encourage',
  'React_Bravo',
  'React_CorrectAnswer',
  'React_TryAgain',
  'React_GoodQuestion',
  'React_WaitAMoment',
  'React_HighFive',
  'React_RespectfulBow',

  // F. Emotions & Expressions (96-110)
  'Emotion_Happy',
  'Emotion_Excited',
  'Emotion_Curious',
  'Emotion_Thinking',
  'Emotion_Confused',
  'Emotion_Surprised',
  'Emotion_Sad',
  'Emotion_Proud',
  'Emotion_Shy',
  'Emotion_Calm',
  'Emotion_Focused',
  'Emotion_Playful',
  'Emotion_Encouraging',
  'Emotion_Disappointed_Soft',
  'Emotion_Relieved',

  // G. Body & Locomotion (111-130)
  'Walk_Original',
  'Walk_Happy',
  'Walk_Confident',
  'Walk_Curious',
  'Run_Original',
  'Run_Happy',
  'Run_Excited',
  'Turn_Left',
  'Turn_Right',
  'Turn_Back',
  'Step_Forward',
  'Step_Backward',
  'Step_Left',
  'Step_Right',
  'Lean_Forward',
  'Lean_Back',
  'Stretch_Body',
  'Hero_Original',
  'Hero_Confident',
  'Balance_Pose',

  // H. Fun & Special Moves (131-145)
  'Monkey_Original',
  'Monkey_Enhanced',
  'Monkey_Jump',
  'Backflip_Original',
  'Backflip_Enhanced',
  'Jump_Normal',
  'Jump_High',
  'Spin_Happy',
  'Dance_Loop',
  'Dance_Victory',
  'Robot_Fun',
  'Wave_DoubleJump',
  'Playful_Bounce',
  'Salute',
  'Triumph_Pose',

  // I. Educational & Interactive (146-150)
  'Present_Lesson',
  'Introduce_Topic',
  'Ask_Student',
  'Celebrate_Correct_Answer',
  'Encourage_Student',
] as const;

export type AnimationId = (typeof ANIMATION_LIBRARY_IDS)[number];

// Backwards-compatible emotion & gesture IDs (still accepted everywhere)
export type EmotionId =
  | 'neutral'
  | 'thinking'
  | 'happy'
  | 'excited'
  | 'explaining'
  | 'agreeing'
  | 'surprised'
  | 'skeptical'
  | FacialExpressionPresetId;

export type GestureCueId =
  | 'idle'
  | 'hand_on_chin'
  | 'hand_to_mouth'
  | 'scratch_head'
  | 'good_idea_point'
  | 'clap'
  | 'nod_agree'
  | 'open_hands_explain'
  | 'wave_greet'
  | 'celebrate'
  | 'monkey'
  | 'leg_kick_flip'
  | 'shrug'
  | AnimationId;

export type HandPoseId =
  | 'relaxed'
  | 'point'
  | 'open'
  | 'fist'
  | 'chin_rest'
  | 'thumbs_up'
  | 'count_one'
  | 'count_two'
  | 'count_three'
  | 'count_four'
  | 'count_five'
  | 'stop'
  | 'beckon';

export interface FacialExpressionState {
  mouthOpen: number;
  smile: number;
  frown: number;
  cheekSquint: number;
  visemeAA: number;
  visemeO: number;
  visemeE: number;
  visemePP: number;
  visemeFV: number;
  visemeTH: number;
  browLift: number; // -1..1
  blink: number; // 0..1
  winkLeft: number; // 0..1
  winkRight: number; // 0..1
  eyeGazeX: number; // -1..1
  eyeGazeY: number; // -1..1
  noseTwitch: number; // 0..1
  earPerk: number; // 0..1
  fingerCurl: number; // 0..1 (manual override or blended)
}

export interface PerformanceScript {
  replyText: string;
  response_text?: string;
  emotion: EmotionId;
  facial_expression?: FacialExpressionPresetId;
  body_animation?: AnimationId;
  gesture?: AnimationId;
  secondary_animation?: AnimationId;
  interaction_state?: AnimationStateId;
  speech_language?: SpeechLanguage;
  speech_style?: SpeechStyle;
  lip_sync?: boolean;
  primaryGesture: GestureCueId;
  handPose: HandPoseId;
  facialCues: {
    browLift: number;
    smile: number;
    eyeGaze: 'user' | 'up_think' | 'side_glance';
    earPerk: number;
    noseTwitch: number;
  };
  audioBase64: string | null;
  audioMimeType: string | null;
  ttsWarning?: string | null;
  fallbackUsed?: boolean;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  emotion?: EmotionId;
  gesture?: GestureCueId;
  animationId?: AnimationId;
  facialExpression?: FacialExpressionPresetId;
}

export interface RigChannelSummary {
  totalBones: number;
  totalMorphTargets: number;
  hasJawOrMouth: boolean;
  hasBrows: boolean;
  hasEyesAndLashes: boolean;
  hasNose: boolean;
  hasEars: boolean;
  fingerBonesCount: number;
  bodyBonesCount: number;
}

export interface BoneNodeInfo {
  index: number;
  name: string;
  parentIndex: number;
  depth: number;
  mirrorName: string | null;
  localPosition: [number, number, number];
  localRotationDeg: [number, number, number];
  localScale: [number, number, number];
  vertexInfluenceCount: number;
  averageWeight: number;
}

export interface KeyframePose {
  id: string;
  time: number;
  label: string;
  bones: Record<
    string,
    {
      position: [number, number, number];
      quaternion: [number, number, number, number];
    }
  >;
}

export interface WeightBrushSettings {
  mode: WeightBrushMode;
  radius: number;
  strength: number;
}

export interface StageSettings {
  showMesh: boolean;
  wireframe: boolean;
  xrayBones: boolean;
  showBones: boolean;
  showGrid: boolean;
  symmetryMirror: boolean;
  materialPreset: 'clay' | 'ceramic' | 'graphite' | 'studio';
  qualityPreset: QualityPreset;
}

export interface RigStats {
  modelName: string;
  vertexCount: number;
  triangleCount: number;
  boneCount: number;
  isCustomMesh: boolean;
  qualityPreset?: QualityPreset;
  webpSupported?: boolean;
}
