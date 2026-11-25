import * as THREE from 'three';
import { ArmRestBasis } from './autoRigStaticModel';
import { buildPresetAnimationClip } from './animations';
import {
  ANIMATION_LIBRARY_IDS,
  AnimationCategoryCode,
  AnimationId,
  AnimationPresetId,
  AnimationStateId,
  FacialExpressionPresetId,
  GestureCueId,
  HandPoseId,
} from './types';

export interface AnimationMeta {
  id: AnimationId;
  index: number; // 1..150
  category: AnimationCategoryCode;
  categoryLabel: string;
  categoryLabelAr: string;
  label: string;
  labelAr: string;
  state: AnimationStateId;
  facialExpression: FacialExpressionPresetId;
  handPose: HandPoseId;
  allowDuringAcademic: boolean;
  defaultDuration: number;
  loop: boolean;
  reusesBaseClip?: AnimationPresetId;
}

export type BoneEulerMap = Record<string, [number, number, number]>;

export interface FingerSideCurls {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

export interface LibraryPoseFrame {
  pelvisPos: [number, number, number];
  bones: BoneEulerMap;
  handPoseOverride?: HandPoseId;
  fingerLeft?: FingerSideCurls;
  fingerRight?: FingerSideCurls;
  dampingSpeed?: number;
}

export const CATEGORY_LABELS: Record<
  AnimationCategoryCode,
  { en: string; ar: string }
> = {
  A: { en: 'Idle & Personality', ar: 'الوقفة والشخصية' },
  B: { en: 'Happy & Celebration', ar: 'السعادة والاحتفال' },
  C: { en: 'Hands & Arms', ar: 'الأيدي والأذرع' },
  D: { en: 'Thinking & Explaining', ar: 'التفكير والشرح' },
  E: { en: 'Student Interaction', ar: 'التفاعل مع الطالب' },
  F: { en: 'Emotions & Expressions', ar: 'المشاعر والتعبيرات' },
  G: { en: 'Body & Locomotion', ar: 'الحركة والتنقل' },
  H: { en: 'Fun & Special Moves', ar: 'حركات مرحة وخاصة' },
  I: { en: 'Educational & Interactive', ar: 'تفاعلات تعليمية' },
};

const CAT_BY_INDEX = (idx1: number): AnimationCategoryCode => {
  if (idx1 <= 15) return 'A';
  if (idx1 <= 30) return 'B';
  if (idx1 <= 60) return 'C';
  if (idx1 <= 75) return 'D';
  if (idx1 <= 95) return 'E';
  if (idx1 <= 110) return 'F';
  if (idx1 <= 130) return 'G';
  if (idx1 <= 145) return 'H';
  return 'I';
};

const ARABIC_NAMES: Partial<Record<AnimationId, string>> = {
  Idle_Normal: 'وقفة طبيعية',
  Idle_Relaxed: 'وقفة مريحة',
  Idle_Happy: 'وقفة سعيدة',
  Idle_Curious: 'وقفة فضولية',
  Idle_Excited: 'وقفة متحمسة',
  Idle_Confident: 'وقفة واثقة',
  Idle_Shy: 'وقفة خجولة',
  Idle_LookAround: 'التلفت حوله',
  Idle_WeightShift: 'تبديل ارتكاز الوزن',
  Idle_BreathingDeep: 'تنفس عميق',
  Idle_StretchArms: 'تمطيط الذراعين',
  Idle_StretchNeck: 'إراحة الرقبة',
  Idle_TapFoot: 'نقر بالقدم',
  Idle_HandsBehindBack: 'الأيدي خلف الظهر',
  Idle_HandsOnHips: 'الأيدي على الخصر',
  Happy_Clap: 'تصفيق تشجيعي',
  Happy_ClapFast: 'تصفيق سريع متحمس',
  Happy_ClapSlow: 'تصفيق فخور بطيء',
  Happy_Jump: 'قفزة فرح',
  Happy_DoubleJump: 'قفزتان احتفاليتان',
  Happy_Cheer: 'هتاف بالحماس',
  Happy_FistPump: 'حركة نجاح بالقبضة',
  Happy_VictoryPose: 'وقفة النصر',
  Happy_HandsUp: 'رفع اليدين فرحاً',
  Happy_DanceSmall: 'رقصة احتفالية خفيفة',
  Happy_Bounce: 'ارتداد مرح',
  Happy_Spin: 'دوران 360 فرحاً',
  Happy_ThumbsUpBoth: 'إعجاب بكلتا اليدين',
  Happy_CelebrateStep: 'خطوة احتفال',
  Happy_Monkey: 'احتفال القرد المرح',
  Wave_Hello: 'تلويحة ترحيب',
  Wave_Goodbye: 'تلويحة وداع',
  Wave_Friendly: 'تحية ودودة',
  Wave_Big: 'تلويحة كبيرة',
  Point_Right: 'إشارة لليمين',
  Point_Left: 'إشارة لليسار',
  Point_Up: 'إشارة للأعلى',
  Point_Forward: 'إشارة للأمام',
  Point_AtBoard: 'إشارة للسبورة',
  Point_TwoHands: 'تحديد بكلتا اليدين',
  Explain_OpenHands: 'فتح اليدين للشرح',
  Explain_OneHandRight: 'شرح باليد اليمنى',
  Explain_OneHandLeft: 'شرح باليد اليسرى',
  Explain_StepByStep: 'شرح خطوة بخطوة',
  Explain_Emphasize: 'تأكيد نقطة مهمة',
  Explain_Compare: 'مقارنة بين فكرتين',
  Explain_Count_One: 'عدّ: واحد',
  Explain_Count_Two: 'عدّ: اثنان',
  Explain_Count_Three: 'عدّ: ثلاثة',
  Explain_Count_Four: 'عدّ: أربعة',
  Explain_Count_Five: 'عدّ: خمسة',
  Raise_Hand: 'رفع اليد',
  Offer_Hand: 'تقديم دعوة للمشاركة',
  Stop_Gesture: 'إشارة التوقف لحظة',
  Come_Here: 'دعوة للاقتراب',
  Cross_Arms: 'عقد الذراعين',
  Hands_Together: 'ضم اليدين',
  Hand_To_Chest: 'يد على القلب',
  Hand_To_Ear: 'إنصات مركز',
  Shrug_BothHands: 'هز الكتفين بتساؤل',
  Think_Original: 'تفكير كلاسيكي',
  Think_HandOnChin: 'يد على الذقن',
  Think_HandToMouth: 'يد عند الفم',
  Think_ScratchHead: 'حك الرأس بتفكير',
  Think_LookUp: 'نظر للأعلى للتفكير',
  Think_LookSide: 'نظرة جانبية للتأمل',
  Think_PaceStep: 'خطوة تفكير متأنية',
  Think_Idea: 'إلهام فكرة رائعة!',
  Think_IdeaExcited: 'فكرة مذهلة بحماس!',
  Explain_Teacher: 'أسلوب المعلم',
  Explain_Deep: 'شرح عميق ومفصل',
  Explain_Calm: 'شرح هادئ ومبسط',
  Explain_Storytelling: 'سرد قصة تعليمية',
  Explain_Summarize: 'تلخيص الفكرة',
  Explain_Highlight: 'تسليط الضوء على نقطة',
  Listen_Attentive: 'استماع باهتمام',
  Listen_HeadTilt: 'إمالة الرأس للإنصات',
  Listen_Nodding: 'إيماءة فهم مستمرة',
  Listen_Curious: 'استماع بفضول',
  React_Agree: 'موافقة',
  React_StrongAgree: 'موافقة قوية',
  React_Disagree: 'رفض مهذب',
  React_Surprised: 'دهشة',
  React_Shocked: 'مفاجأة كبيرة',
  React_Confused: 'ارتباك لطيف',
  React_Laugh: 'ضحك',
  React_SmileNod: 'ابتسامة وإيماءة',
  React_Encourage: 'تشجيع الطالب',
  React_Bravo: 'برافو!',
  React_CorrectAnswer: 'إجابة صحيحة!',
  React_TryAgain: 'حاول مرة أخرى بتشجيع',
  React_GoodQuestion: 'سؤال ممتاز!',
  React_WaitAMoment: 'انتظر لحظة',
  React_HighFive: 'هاي فايف!',
  React_RespectfulBow: 'انحناءة تقدير',
  Emotion_Happy: 'تعبير السعادة',
  Emotion_Excited: 'تعبير الحماس',
  Emotion_Curious: 'تعبير الفضول',
  Emotion_Thinking: 'تعبير التفكير',
  Emotion_Confused: 'تعبير الحيرة',
  Emotion_Surprised: 'تعبير الدهشة',
  Emotion_Sad: 'تعبير التعاطف الهادئ',
  Emotion_Proud: 'تعبير الفخر',
  Emotion_Shy: 'تعبير الخجل',
  Emotion_Calm: 'تعبير الهدوء',
  Emotion_Focused: 'تعبير التركيز',
  Emotion_Playful: 'تعبير المرح',
  Emotion_Encouraging: 'تعبير التشجيع',
  Emotion_Disappointed_Soft: 'أسف لطيف',
  Emotion_Relieved: 'ارتياح',
  Walk_Original: 'مشي طبيعي',
  Walk_Happy: 'مشي سعيد',
  Walk_Confident: 'مشي واثق',
  Walk_Curious: 'مشي بفضول',
  Run_Original: 'جري طبيعي',
  Run_Happy: 'جري مرح',
  Run_Excited: 'جري متحمس',
  Turn_Left: 'التفاف لليسار',
  Turn_Right: 'التفاف لليمين',
  Turn_Back: 'التفاف للخلف',
  Step_Forward: 'خطوة للأمام',
  Step_Backward: 'خطوة للخلف',
  Step_Left: 'خطوة لليسار',
  Step_Right: 'خطوة لليمين',
  Lean_Forward: 'ميل للأمام',
  Lean_Back: 'ميل للخلف',
  Stretch_Body: 'تمدد للجسم',
  Hero_Original: 'وقفة البطل',
  Hero_Confident: 'بطل واثق',
  Balance_Pose: 'توازن على قدم واحدة',
  Monkey_Original: 'قرد مرح (الأصلي)',
  Monkey_Enhanced: 'قرد مرح مطوّر',
  Monkey_Jump: 'قفزة القرد السعيد',
  Backflip_Original: 'شقلبة خلفية (الأصلية)',
  Backflip_Enhanced: 'شقلبة خلفية احترافية',
  Jump_Normal: 'قفزة عادية',
  Jump_High: 'قفزة عالية',
  Spin_Happy: 'دوران سعيد',
  Dance_Loop: 'رقصة إيقاعية',
  Dance_Victory: 'رقصة الفوز',
  Robot_Fun: 'حركة الروبوت المرح',
  Wave_DoubleJump: 'قفزتان مع تلويح',
  Playful_Bounce: 'تنطيط حيوي',
  Salute: 'تحية احترام',
  Triumph_Pose: 'وقفة الانتصار',
  Present_Lesson: 'تقديم الدرس',
  Introduce_Topic: 'تمهيد الموضوع',
  Ask_Student: 'سؤال الطالب',
  Celebrate_Correct_Answer: 'احتفال بالإجابة الصحيحة',
  Encourage_Student: 'دعم وتشجيع الطالب',
};

const BASE_CLIP_REUSE: Partial<Record<AnimationId, AnimationPresetId>> = {
  Idle_Normal: 'idle',
  Walk_Original: 'walk',
  Run_Original: 'run',
  Wave_Hello: 'wave',
  Think_Original: 'think',
  Happy_Clap: 'clap',
  Monkey_Original: 'monkey',
  Backflip_Original: 'backflip',
  Hero_Original: 'hero',
};

function inferMeta(id: AnimationId, index: number): AnimationMeta {
  const category = CAT_BY_INDEX(index);
  const catInfo = CATEGORY_LABELS[category];
  const label = id.replace(/_/g, ' ');
  const labelAr = ARABIC_NAMES[id] ?? label;

  let state: AnimationStateId = 'Speaking';
  let facialExpression: FacialExpressionPresetId = 'explaining';
  let handPose: HandPoseId = 'open';
  let allowDuringAcademic = true;
  let defaultDuration = 2.4;
  let loop = true;

  if (category === 'A') {
    state = 'Idle';
    handPose = 'relaxed';
    defaultDuration = 3.2;
    if (id === 'Idle_Happy') facialExpression = 'happy';
    else if (id === 'Idle_Curious' || id === 'Idle_LookAround') facialExpression = 'curious';
    else if (id === 'Idle_Excited') facialExpression = 'excited';
    else if (id === 'Idle_Confident' || id === 'Idle_HandsOnHips') facialExpression = 'proud';
    else facialExpression = 'calm';
  } else if (category === 'B') {
    state = 'Celebrating';
    facialExpression = id === 'Happy_Monkey' ? 'laughing' : 'excited';
    handPose = id.includes('ThumbsUp')
      ? 'thumbs_up'
      : id === 'Happy_Monkey'
        ? 'fist'
        : 'open';
    allowDuringAcademic =
      id === 'Happy_Clap' ||
      id === 'Happy_ClapSlow' ||
      id === 'Happy_ThumbsUpBoth';
    defaultDuration = 2.0;
  } else if (category === 'C') {
    state = id.startsWith('Wave') ? 'Reacting' : 'Explaining';
    facialExpression = id.startsWith('Wave')
      ? 'happy'
      : id === 'Shrug_BothHands'
        ? 'confused'
        : 'explaining';
    if (id.startsWith('Point')) handPose = 'point';
    else if (id === 'Explain_Count_One') handPose = 'count_one';
    else if (id === 'Explain_Count_Two') handPose = 'count_two';
    else if (id === 'Explain_Count_Three') handPose = 'count_three';
    else if (id === 'Explain_Count_Four') handPose = 'count_four';
    else if (id === 'Explain_Count_Five') handPose = 'count_five';
    else if (id === 'Stop_Gesture') handPose = 'stop';
    else if (id === 'Come_Here') handPose = 'beckon';
    else handPose = 'open';
  } else if (category === 'D') {
    state = id.startsWith('Think') ? 'Thinking' : 'Explaining';
    facialExpression = id.includes('Idea')
      ? 'excited'
      : id.startsWith('Think')
        ? 'thinking'
        : 'explaining';
    handPose = id.includes('Idea')
      ? 'point'
      : id === 'Think_HandOnChin' || id === 'Think_HandToMouth'
        ? 'chin_rest'
        : 'open';
  } else if (category === 'E') {
    state = id.startsWith('Listen')
      ? 'Listening'
      : id === 'React_Bravo' || id === 'React_CorrectAnswer'
        ? 'Celebrating'
        : 'Reacting';
    if (id.startsWith('Listen')) facialExpression = id === 'Listen_Curious' ? 'curious' : 'listening';
    else if (id === 'React_Surprised' || id === 'React_Shocked') facialExpression = 'surprised';
    else if (id === 'React_Confused') facialExpression = 'confused';
    else if (id === 'React_Laugh') facialExpression = 'laughing';
    else if (id === 'React_TryAgain' || id === 'React_Encourage') facialExpression = 'encouraging';
    else if (id === 'React_CorrectAnswer' || id === 'React_Bravo') facialExpression = 'excited';
    else if (id === 'React_Disagree') facialExpression = 'calm';
    else facialExpression = 'happy';
    handPose = id === 'React_WaitAMoment'
      ? 'count_one'
      : id === 'React_StrongAgree'
        ? 'thumbs_up'
        : id === 'React_GoodQuestion'
          ? 'point'
          : 'open';
  } else if (category === 'F') {
    state = 'Reacting';
    const mapExpr: Partial<Record<AnimationId, FacialExpressionPresetId>> = {
      Emotion_Happy: 'happy',
      Emotion_Excited: 'excited',
      Emotion_Curious: 'curious',
      Emotion_Thinking: 'thinking',
      Emotion_Confused: 'confused',
      Emotion_Surprised: 'surprised',
      Emotion_Sad: 'sad',
      Emotion_Proud: 'proud',
      Emotion_Shy: 'calm',
      Emotion_Calm: 'calm',
      Emotion_Focused: 'explaining',
      Emotion_Playful: 'winking',
      Emotion_Encouraging: 'encouraging',
      Emotion_Disappointed_Soft: 'sad',
      Emotion_Relieved: 'happy',
    };
    facialExpression = mapExpr[id] ?? 'calm';
    handPose = id === 'Emotion_Thinking' ? 'chin_rest' : 'relaxed';
  } else if (category === 'G') {
    state = 'Moving';
    facialExpression = id.includes('Happy') || id.includes('Excited')
      ? 'happy'
      : id.includes('Hero')
        ? 'proud'
        : id.includes('Curious')
          ? 'curious'
          : 'calm';
    handPose = id.includes('Run') ? 'fist' : 'relaxed';
    allowDuringAcademic = id.startsWith('Lean') || id.startsWith('Step');
  } else if (category === 'H') {
    state = 'Special_Action';
    facialExpression = id.includes('Monkey')
      ? 'laughing'
      : id === 'Salute'
        ? 'proud'
        : 'excited';
    handPose = id.includes('Monkey') ? 'fist' : 'open';
    allowDuringAcademic = false;
    loop = id !== 'Backflip_Original' && id !== 'Backflip_Enhanced';
  } else {
    state = id === 'Celebrate_Correct_Answer' ? 'Celebrating' : 'Explaining';
    facialExpression = id === 'Celebrate_Correct_Answer'
      ? 'excited'
      : id === 'Encourage_Student'
        ? 'encouraging'
        : id === 'Ask_Student'
          ? 'curious'
          : 'explaining';
    handPose = id === 'Celebrate_Correct_Answer' ? 'thumbs_up' : 'open';
  }

  return {
    id,
    index,
    category,
    categoryLabel: catInfo.en,
    categoryLabelAr: catInfo.ar,
    label,
    labelAr,
    state,
    facialExpression,
    handPose,
    allowDuringAcademic,
    defaultDuration,
    loop,
    reusesBaseClip: BASE_CLIP_REUSE[id],
  };
}

export const ANIMATION_LIBRARY_REGISTRY: Record<AnimationId, AnimationMeta> = (() => {
  const reg = {} as Record<AnimationId, AnimationMeta>;
  ANIMATION_LIBRARY_IDS.forEach((id, i) => {
    reg[id] = inferMeta(id, i + 1);
  });
  return reg;
})();

export const ANIMATION_LIBRARY_LIST: AnimationMeta[] = ANIMATION_LIBRARY_IDS.map(
  (id) => ANIMATION_LIBRARY_REGISTRY[id],
);

const LEGACY_GESTURE_TO_LIBRARY: Record<string, AnimationId> = {
  idle: 'Idle_Normal',
  hand_on_chin: 'Think_HandOnChin',
  hand_to_mouth: 'Think_HandToMouth',
  scratch_head: 'Think_ScratchHead',
  good_idea_point: 'Think_Idea',
  clap: 'Happy_Clap',
  nod_agree: 'React_Agree',
  open_hands_explain: 'Explain_OpenHands',
  wave_greet: 'Wave_Hello',
  celebrate: 'Happy_Cheer',
  monkey: 'Monkey_Enhanced',
  leg_kick_flip: 'Backflip_Enhanced',
  shrug: 'Shrug_BothHands',
};

export function resolveToAnimationId(input: GestureCueId | string | undefined): AnimationId {
  if (!input) return 'Idle_Normal';
  if ((ANIMATION_LIBRARY_IDS as readonly string[]).includes(input)) {
    return input as AnimationId;
  }
  return LEGACY_GESTURE_TO_LIBRARY[input] ?? 'Explain_OpenHands';
}

// Helper for crisp knee/leg base stance
function baseLegs(
  lThighX = -0.05,
  rThighX = -0.05,
  lShinX?: number,
  rShinX?: number,
  spread = 0.04,
): BoneEulerMap {
  const ls = lShinX ?? Math.max(0.06, -lThighX * 1.9);
  const rs = rShinX ?? Math.max(0.06, -rThighX * 1.9);
  return {
    leftThigh: [lThighX, spread, spread],
    leftShin: [ls, 0, 0],
    leftFoot: [-(lThighX + ls) * 0.5, 0, 0],
    rightThigh: [rThighX, -spread, -spread],
    rightShin: [rs, 0, 0],
    rightFoot: [-(rThighX + rs) * 0.5, 0, 0],
  };
}

function fingerPresetCurls(handPose: HandPoseId, elapsed: number): {
  left: FingerSideCurls;
  right: FingerSideCurls;
} {
  const micro = Math.sin(elapsed * 3.1) * 0.03;
  switch (handPose) {
    case 'count_one':
      return {
        left: { thumb: 0.3, index: 0.35, middle: 0.45, ring: 0.5, pinky: 0.55 },
        right: { thumb: 0.85, index: 0.02, middle: 1.25, ring: 1.28, pinky: 1.3 },
      };
    case 'count_two':
      return {
        left: { thumb: 0.3, index: 0.35, middle: 0.45, ring: 0.5, pinky: 0.55 },
        right: { thumb: 0.85, index: 0.02, middle: 0.02, ring: 1.25, pinky: 1.28 },
      };
    case 'count_three':
      return {
        left: { thumb: 0.3, index: 0.35, middle: 0.45, ring: 0.5, pinky: 0.55 },
        right: { thumb: 0.85, index: 0.02, middle: 0.02, ring: 0.02, pinky: 1.25 },
      };
    case 'count_four':
      return {
        left: { thumb: 0.3, index: 0.35, middle: 0.45, ring: 0.5, pinky: 0.55 },
        right: { thumb: 0.9, index: 0.02, middle: 0.02, ring: 0.02, pinky: 0.02 },
      };
    case 'count_five':
      return {
        left: { thumb: 0.25, index: 0.3, middle: 0.36, ring: 0.44, pinky: 0.5 },
        right: { thumb: 0.02, index: 0.02, middle: 0.02, ring: 0.02, pinky: 0.02 },
      };
    case 'stop':
      return {
        left: { thumb: 0.22, index: 0.28, middle: 0.34, ring: 0.42, pinky: 0.48 },
        right: { thumb: 0.05, index: 0.02, middle: 0.02, ring: 0.02, pinky: 0.02 },
      };
    case 'beckon': {
      const wave = 0.45 + 0.45 * Math.sin(elapsed * 6.5);
      return {
        left: { thumb: 0.22, index: 0.28, middle: 0.35, ring: 0.42, pinky: 0.5 },
        right: { thumb: 0.3, index: wave, middle: wave, ring: wave * 1.05, pinky: wave * 1.1 },
      };
    }
    case 'point':
      return {
        left: { thumb: 0.35, index: 0.3, middle: 0.45, ring: 0.55, pinky: 0.6 },
        right: { thumb: 0.6, index: 0.02, middle: 1.15, ring: 1.2, pinky: 1.25 },
      };
    case 'thumbs_up':
      return {
        left: { thumb: 0.3, index: 0.35, middle: 0.45, ring: 0.5, pinky: 0.55 },
        right: { thumb: -0.18, index: 1.2, middle: 1.25, ring: 1.25, pinky: 1.25 },
      };
    case 'chin_rest':
      return {
        left: { thumb: 0.25, index: 0.35, middle: 0.45, ring: 0.5, pinky: 0.55 },
        right: { thumb: 0.2, index: 0.35, middle: 0.85, ring: 0.95, pinky: 1.0 },
      };
    case 'fist':
      return {
        left: { thumb: 0.85, index: 1.25, middle: 1.3, ring: 1.3, pinky: 1.3 },
        right: { thumb: 0.85, index: 1.25, middle: 1.3, ring: 1.3, pinky: 1.3 },
      };
    case 'open':
      return {
        left: { thumb: 0.05 + micro, index: 0.08 + micro, middle: 0.1, ring: 0.12, pinky: 0.14 },
        right: { thumb: 0.05 + micro, index: 0.08 + micro, middle: 0.1, ring: 0.12, pinky: 0.14 },
      };
    case 'relaxed':
    default:
      return {
        left: { thumb: 0.22 + micro, index: 0.28 + micro, middle: 0.36, ring: 0.44, pinky: 0.5 },
        right: { thumb: 0.22 + micro, index: 0.28 + micro, middle: 0.36, ring: 0.44, pinky: 0.5 },
      };
  }
}

/**
 * Evaluates EVERY ONE of the 150 distinct animations cleanly with finite, anatomical bone kinematics.
 */
export function evaluateAnimationLibraryPose(
  animId: AnimationId,
  elapsed: number,
  speechEnergy: number,
  intensity = 1.0,
  handPoseOverride?: HandPoseId,
): LibraryPoseFrame {
  const amp = THREE.MathUtils.clamp(intensity, 0.3, 1.5);
  const breath = Math.sin(elapsed * 2.1) * 0.03 * amp;
  const talkBeat = speechEnergy * Math.sin(elapsed * 8.2) * amp;
  const sway = Math.sin(elapsed * 1.45) * 0.05 * amp;

  const meta = ANIMATION_LIBRARY_REGISTRY[animId];
  const defaultFingers = fingerPresetCurls(handPoseOverride ?? meta.handPose, elapsed);

  // Neutral arm helpers
  const armRestLeft: BoneEulerMap = {
    leftShoulder: [0, 0, 0.04],
    leftUpperArm: [0.05, -0.14, -1.22 + breath * 0.5],
    leftForearm: [0, -0.36, 0],
    leftHand: [0, 0, 0.08],
  };
  const armRestRight: BoneEulerMap = {
    rightShoulder: [0, 0, -0.04],
    rightUpperArm: [0.05, 0.14, 1.22 - breath * 0.5],
    rightForearm: [0, 0.36, 0],
    rightHand: [0, 0, -0.08],
  };

  let out: LibraryPoseFrame;

  switch (animId) {
    // =========================================================
    // A. IDLE & PERSONALITY (1 - 15)
    // =========================================================
    case 'Idle_Normal':
      out = {
        pelvisPos: [sway * 0.2, -0.012 + breath * 0.15, 0],
        bones: {
          pelvis: [0.01, sway * 0.5, sway * 0.2],
          spine: [breath * 0.5, -sway * 0.25, 0],
          chest: [-breath * 0.8, Math.sin(elapsed * 0.8) * 0.03, 0],
          head: [Math.sin(elapsed * 1.1) * 0.025 + talkBeat * 0.04, Math.sin(elapsed * 0.7) * 0.05, Math.sin(elapsed * 0.9) * 0.02],
          ...armRestLeft,
          ...armRestRight,
          ...baseLegs(),
        },
      };
      break;

    case 'Idle_Relaxed':
      out = {
        pelvisPos: [sway * 0.3, -0.02, 0],
        bones: {
          pelvis: [0.02, -0.06 + sway * 0.4, 0.03],
          spine: [0.03, 0.04, -0.02],
          chest: [0.02 - breath, 0.04, -0.02],
          head: [0.02, -0.04, 0.05],
          leftShoulder: [0, 0, 0.05],
          leftUpperArm: [0.08, -0.06, -1.26],
          leftForearm: [0, -0.28, 0],
          leftHand: [0, 0, 0.12],
          rightShoulder: [0, 0, -0.05],
          rightUpperArm: [0.04, 0.18, 1.06],
          rightForearm: [0, 0.85, 0],
          rightHand: [0, 0, -0.2],
          ...baseLegs(-0.04, -0.1, 0.08, 0.2, 0.06),
        },
      };
      break;

    case 'Idle_Happy': {
      const b = Math.abs(Math.sin(elapsed * 3.1)) * 0.028 * amp;
      out = {
        pelvisPos: [Math.sin(elapsed * 1.55) * 0.02, -0.014 + b, 0],
        bones: {
          pelvis: [0, Math.sin(elapsed * 1.55) * 0.05, 0],
          spine: [-0.02, 0, 0],
          chest: [-0.03 + breath, Math.sin(elapsed * 1.55) * -0.04, 0],
          head: [-0.04 + b * 0.9, Math.sin(elapsed * 1.2) * 0.06, Math.sin(elapsed * 1.55) * 0.05],
          leftUpperArm: [0.06, -0.25, -1.04 + b * 1.5],
          leftForearm: [0, -0.68, 0.1],
          rightUpperArm: [0.06, 0.25, 1.04 - b * 1.5],
          rightForearm: [0, 0.68, -0.1],
          ...baseLegs(-0.08 + b, -0.08 + b),
        },
      };
      break;
    }

    case 'Idle_Curious':
      out = {
        pelvisPos: [0, -0.015, 0.02],
        bones: {
          pelvis: [0.02, -0.05, 0],
          spine: [0.06, 0.04, 0],
          chest: [0.06 + breath, 0.05, 0.03],
          neck: [0.04, 0, 0.04],
          head: [0.03, Math.sin(elapsed * 1.2) * 0.08, 0.16],
          leftUpperArm: [0.08, -0.22, -1.16],
          leftForearm: [0, -0.58, 0],
          rightUpperArm: [-0.1, 0.48, 0.95],
          rightForearm: [0, 1.15, -0.2],
          rightHand: [0.1, 0.1, -0.15],
          ...baseLegs(-0.07, -0.04),
        },
      };
      break;

    case 'Idle_Excited': {
      const hop = Math.abs(Math.sin(elapsed * 5.4)) * 0.035 * amp;
      out = {
        pelvisPos: [0, -0.02 + hop, 0],
        bones: {
          pelvis: [0.03, Math.sin(elapsed * 2.7) * 0.07, 0],
          spine: [-0.03, 0, 0],
          chest: [-0.04 + hop * 0.4, 0, 0],
          head: [-0.05, Math.sin(elapsed * 2.7) * 0.08, 0],
          leftShoulder: [0, 0, 0.08],
          leftUpperArm: [0.12, -0.38, -0.82 + hop * 2],
          leftForearm: [0, -1.25, 0.25],
          rightShoulder: [0, 0, -0.08],
          rightUpperArm: [0.12, 0.38, 0.82 - hop * 2],
          rightForearm: [0, 1.25, -0.25],
          ...baseLegs(-0.12 + hop * 1.4, -0.12 + hop * 1.4),
        },
      };
      break;
    }

    case 'Idle_Confident':
      out = {
        pelvisPos: [0, -0.01, 0],
        bones: {
          pelvis: [-0.02, -0.1, 0],
          spine: [-0.04, 0.06, 0],
          chest: [-0.06 + breath, 0.06, 0],
          head: [0.02, 0.03, -0.02],
          leftUpperArm: [0.06, -0.16, -0.98],
          leftForearm: [0, -0.92, 0.1],
          rightUpperArm: [0.06, 0.16, 0.98],
          rightForearm: [0, 0.92, -0.1],
          ...baseLegs(-0.12, 0.06, 0.18, 0.08, 0.07),
        },
      };
      break;

    case 'Idle_Shy': {
      const toe = Math.sin(elapsed * 2.4) * 0.12;
      out = {
        pelvisPos: [0, -0.02, 0],
        bones: {
          pelvis: [0.03, 0.06, 0],
          spine: [0.06, -0.04, 0],
          chest: [0.08 + breath, -0.04, 0],
          head: [0.12, -0.12, 0.14],
          leftShoulder: [0, -0.1, -0.06],
          leftUpperArm: [0.12, -0.36, -1.2],
          leftForearm: [0, -0.95, 0.2],
          rightShoulder: [0, 0.1, 0.06],
          rightUpperArm: [0.12, 0.36, 1.2],
          rightForearm: [0, 0.95, -0.2],
          leftThigh: [-0.08, -0.08, 0.02],
          leftShin: [0.16, 0, 0],
          rightThigh: [-0.1, 0.12 + toe * 0.2, -0.02],
          rightShin: [0.22, 0, 0],
          rightFoot: [-0.1 + toe, 0, 0],
        },
      };
      break;
    }

    case 'Idle_LookAround': {
      const scan = Math.sin(elapsed * 1.15);
      out = {
        pelvisPos: [scan * 0.015, -0.012, 0],
        bones: {
          pelvis: [0, scan * 0.08, 0],
          spine: [0.02, scan * 0.12, 0],
          chest: [breath, scan * 0.16, 0],
          neck: [0, scan * 0.12, 0],
          head: [-0.03 + Math.cos(elapsed * 2.3) * 0.04, scan * 0.36, scan * -0.05],
          ...armRestLeft,
          ...armRestRight,
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Idle_WeightShift': {
      const w = Math.sin(elapsed * 1.1);
      out = {
        pelvisPos: [w * 0.06, -0.02 - Math.abs(w) * 0.015, 0],
        bones: {
          pelvis: [0.02, w * 0.08, w * 0.09],
          spine: [0.02, -w * 0.05, -w * 0.07],
          chest: [breath, -w * 0.06, -w * 0.05],
          head: [0, w * 0.05, -w * 0.04],
          ...armRestLeft,
          ...armRestRight,
          leftThigh: [-0.05 - Math.max(0, -w) * 0.09, 0.04, 0.06 - w * 0.05],
          leftShin: [0.1 + Math.max(0, -w) * 0.18, 0, 0],
          rightThigh: [-0.05 - Math.max(0, w) * 0.09, -0.04, -0.06 - w * 0.05],
          rightShin: [0.1 + Math.max(0, w) * 0.18, 0, 0],
        },
      };
      break;
    }

    case 'Idle_BreathingDeep': {
      const deep = 0.5 + 0.5 * Math.sin(elapsed * 1.6);
      out = {
        pelvisPos: [0, -0.015 + deep * 0.014, 0],
        bones: {
          pelvis: [0, 0, 0],
          spine: [0.03 - deep * 0.05, 0, 0],
          chest: [0.03 - deep * 0.1, 0, 0],
          head: [0.04 - deep * 0.09, 0, 0],
          leftShoulder: [0, 0, 0.03 + deep * 0.1],
          leftUpperArm: [0.05, -0.14, -1.24 + deep * 0.14],
          leftForearm: [0, -0.36 - deep * 0.12, 0],
          rightShoulder: [0, 0, -0.03 - deep * 0.1],
          rightUpperArm: [0.05, 0.14, 1.24 - deep * 0.14],
          rightForearm: [0, 0.36 + deep * 0.12, 0],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Idle_StretchArms': {
      const s = 0.5 + 0.5 * Math.sin(elapsed * 1.6);
      out = {
        pelvisPos: [0, -0.01 + s * 0.02, 0],
        bones: {
          spine: [-0.06 * s, 0, 0],
          chest: [-0.1 * s, 0, 0],
          head: [-0.12 * s, 0, 0],
          leftShoulder: [0, 0, 0.22 * s],
          leftUpperArm: [0.1, -0.25, -1.15 + s * 2.1],
          leftForearm: [0, -0.35, 0.35 * s],
          rightShoulder: [0, 0, -0.22 * s],
          rightUpperArm: [0.1, 0.25, 1.15 - s * 2.1],
          rightForearm: [0, 0.35, -0.35 * s],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Idle_StretchNeck': {
      const roll = Math.sin(elapsed * 1.5);
      out = {
        pelvisPos: [0, -0.01, 0],
        bones: {
          chest: [breath, 0, roll * -0.03],
          neck: [0.04, roll * 0.1, roll * 0.12],
          head: [0.05 + Math.abs(roll) * 0.05, roll * 0.18, roll * 0.26],
          ...armRestLeft,
          ...armRestRight,
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Idle_TapFoot': {
      const tap = Math.max(0, Math.sin(elapsed * 6.8));
      out = {
        pelvisPos: [-0.02, -0.015, 0],
        bones: {
          pelvis: [0, 0.04, -0.04],
          chest: [breath, -0.04, 0.03],
          head: [0.02, 0.06, -0.05],
          leftUpperArm: [0.04, -0.15, -1.04],
          leftForearm: [0, -1.05, 0.15],
          ...armRestRight,
          leftThigh: [-0.05, 0.04, 0.04],
          leftShin: [0.1, 0, 0],
          rightThigh: [-0.14, -0.06, -0.05],
          rightShin: [0.26, 0, 0],
          rightFoot: [-0.12 - tap * 0.32, 0, 0],
        },
      };
      break;
    }

    case 'Idle_HandsBehindBack':
      out = {
        pelvisPos: [0, -0.01, 0],
        bones: {
          spine: [0.02, 0, 0],
          chest: [-0.04 + breath, 0, 0],
          head: [0.02, Math.sin(elapsed * 0.9) * 0.06, 0],
          leftShoulder: [0, 0.18, 0],
          leftUpperArm: [-0.18, 0.42, -1.16],
          leftForearm: [0, 0.72, -0.25],
          leftHand: [0, 0, 0.2],
          rightShoulder: [0, -0.18, 0],
          rightUpperArm: [-0.18, -0.42, 1.16],
          rightForearm: [0, -0.72, 0.25],
          rightHand: [0, 0, -0.2],
          ...baseLegs(-0.04, -0.04, 0.08, 0.08, 0.05),
        },
      };
      break;

    case 'Idle_HandsOnHips':
      out = {
        pelvisPos: [0, -0.01, 0],
        bones: {
          pelvis: [-0.02, 0.03, 0],
          chest: [-0.05 + breath, -0.03, 0],
          head: [0, Math.sin(elapsed * 0.8) * 0.05, 0.03],
          leftUpperArm: [0.05, 0.1, -0.78],
          leftForearm: [0, -1.42, -0.22],
          leftHand: [0, 0, 0.3],
          rightUpperArm: [0.05, -0.1, 0.78],
          rightForearm: [0, 1.42, 0.22],
          rightHand: [0, 0, -0.3],
          ...baseLegs(-0.06, -0.06, 0.12, 0.12, 0.07),
        },
      };
      break;

    // =========================================================
    // B. HAPPY & CELEBRATION (16 - 30)
    // =========================================================
    case 'Happy_Clap':
    case 'Happy_ClapFast':
    case 'Happy_ClapSlow': {
      const freq = animId === 'Happy_ClapFast' ? 15.5 : animId === 'Happy_ClapSlow' ? 6.2 : 11.2;
      const openAmt = Math.max(0, Math.sin(elapsed * freq));
      const b = Math.abs(Math.cos(elapsed * (freq * 0.5))) * (animId === 'Happy_ClapSlow' ? 0.02 : 0.04) * amp;
      const liftY = animId === 'Happy_ClapSlow' ? 0.16 : 0;
      out = {
        pelvisPos: [Math.sin(elapsed * 2.8) * 0.02, -0.025 + b, 0],
        bones: {
          pelvis: [0.03, sway * 0.4, sway * 0.2],
          chest: [-0.03 + breath, -sway * 0.3, 0],
          head: [Math.sin(elapsed * freq * 0.5) * 0.06 - 0.03, sway * 0.5, Math.sin(elapsed * 3.1) * 0.05],
          leftShoulder: [0, -0.18 + openAmt * 0.06, 0],
          leftUpperArm: [0.1 + liftY, -1.05 + openAmt * 0.34, -0.22 - openAmt * 0.08],
          leftForearm: [0, -1.35 + openAmt * 0.28, 0.32 - openAmt * 0.08],
          leftHand: [0, 0, 0.15 + openAmt * 0.12],
          rightShoulder: [0, 0.18 - openAmt * 0.06, 0],
          rightUpperArm: [0.1 + liftY, 1.05 - openAmt * 0.34, 0.22 + openAmt * 0.08],
          rightForearm: [0, 1.35 - openAmt * 0.28, -0.32 + openAmt * 0.08],
          rightHand: [0, 0, -0.15 - openAmt * 0.12],
          ...baseLegs(-0.14 + b * 1.4, -0.14 + b * 1.4),
        },
      };
      break;
    }

    case 'Happy_Jump':
    case 'Happy_DoubleJump': {
      const freq = animId === 'Happy_DoubleJump' ? 6.6 : 4.2;
      const p = animId === 'Happy_DoubleJump' ? Math.abs(Math.sin(elapsed * freq)) : Math.max(0, Math.sin(elapsed * freq));
      const crouch = 1 - p;
      out = {
        pelvisPos: [0, -0.08 * crouch + p * 0.18 * amp, 0],
        bones: {
          pelvis: [0.04 * crouch, 0, 0],
          spine: [-0.08 * p, 0, 0],
          chest: [-0.08 * p, 0, 0],
          head: [-0.1 * p, 0, 0],
          leftShoulder: [0, 0, 0.2 * p],
          leftUpperArm: [0.12, -0.25, -0.9 + p * 1.65],
          leftForearm: [0, -0.45, 0.7 * p],
          rightShoulder: [0, 0, -0.2 * p],
          rightUpperArm: [0.12, 0.25, 0.9 - p * 1.65],
          rightForearm: [0, 0.45, -0.7 * p],
          leftThigh: [-0.35 * crouch - 0.15 * p, 0.05, 0.06],
          leftShin: [0.7 * crouch + 0.32 * p, 0, 0],
          rightThigh: [-0.35 * crouch - 0.15 * p, -0.05, -0.06],
          rightShin: [0.7 * crouch + 0.32 * p, 0, 0],
        },
      };
      break;
    }

    case 'Happy_Cheer': {
      const jump = Math.abs(Math.sin(elapsed * 5.2));
      const alt = Math.sin(elapsed * 5.2);
      out = {
        pelvisPos: [alt * 0.02, -0.04 + jump * 0.1 * amp, 0],
        bones: {
          pelvis: [0.04, alt * 0.08, 0],
          spine: [-0.06, 0, 0],
          chest: [-0.06 + jump * 0.05, 0, 0],
          head: [-0.08, alt * 0.08, Math.sin(elapsed * 3.5) * 0.07],
          leftShoulder: [0, 0, 0.16],
          leftUpperArm: [0.1, -0.28, 0.25 + jump * 0.25],
          leftForearm: [0, -0.35, 1.15 + alt * 0.18],
          rightShoulder: [0, 0, -0.16],
          rightUpperArm: [0.1, 0.28, -0.25 - jump * 0.25],
          rightForearm: [0, 0.35, -1.15 + alt * 0.18],
          ...baseLegs(-0.22 * (1 - jump) - 0.1 * jump, -0.22 * (1 - jump) - 0.1 * jump),
        },
      };
      break;
    }

    case 'Happy_FistPump': {
      const pump = 0.5 + 0.5 * Math.sin(elapsed * 6.5);
      out = {
        pelvisPos: [0, -0.03 + pump * 0.04, 0],
        bones: {
          pelvis: [0.02, 0.12, 0],
          chest: [-0.04, 0.1, 0],
          head: [-0.05 + pump * 0.05, -0.08, 0],
          ...armRestLeft,
          rightShoulder: [0, 0.1, -0.1],
          rightUpperArm: [0.35 - pump * 0.2, 0.72, 0.45 - pump * 0.55],
          rightForearm: [0, 1.35, -0.65 - pump * 0.65],
          rightHand: [0.15, 0, -0.2],
          ...baseLegs(-0.14, -0.06, 0.24, 0.12, 0.07),
        },
      };
      break;
    }

    case 'Happy_VictoryPose':
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          pelvis: [-0.03, 0, 0],
          chest: [-0.08 + breath, 0, 0],
          head: [-0.06, 0, 0],
          leftShoulder: [0, 0, 0.18],
          leftUpperArm: [0.06, -0.18, 0.55],
          leftForearm: [0, -0.22, 0.2],
          rightShoulder: [0, 0, -0.18],
          rightUpperArm: [0.06, 0.18, -0.55],
          rightForearm: [0, 0.22, -0.2],
          ...baseLegs(-0.08, -0.08, 0.16, 0.16, 0.09),
        },
      };
      break;

    case 'Happy_HandsUp': {
      const wave = Math.sin(elapsed * 4.8) * 0.22;
      out = {
        pelvisPos: [0, -0.015 + Math.abs(wave) * 0.05, 0],
        bones: {
          chest: [-0.05 + breath, 0, wave * 0.12],
          head: [-0.08, 0, wave * -0.1],
          leftShoulder: [0, 0, 0.2],
          leftUpperArm: [0.15, -0.2, 0.85 + wave * 0.2],
          leftForearm: [0, -0.3, 0.25 + wave],
          rightShoulder: [0, 0, -0.2],
          rightUpperArm: [0.15, 0.2, -0.85 + wave * 0.2],
          rightForearm: [0, 0.3, -0.25 + wave],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Happy_DanceSmall': {
      const groove = Math.sin(elapsed * 5.2);
      const bob = Math.abs(Math.cos(elapsed * 5.2)) * 0.04;
      out = {
        pelvisPos: [groove * 0.045, -0.03 + bob, 0],
        bones: {
          pelvis: [0.03, groove * 0.14, groove * 0.09],
          spine: [0.02, -groove * 0.1, -groove * 0.06],
          chest: [0, -groove * 0.14, groove * 0.08],
          head: [Math.sin(elapsed * 10.4) * 0.05, groove * 0.1, groove * -0.08],
          leftUpperArm: [0.15, -0.35 + groove * 0.25, -0.65],
          leftForearm: [0, -1.25, 0.35 + groove * 0.25],
          rightUpperArm: [0.15, 0.35 + groove * 0.25, 0.65],
          rightForearm: [0, 1.25, -0.35 + groove * 0.25],
          leftThigh: [-0.12 - Math.max(0, groove) * 0.14, 0.05, 0.05],
          leftShin: [0.24 + Math.max(0, groove) * 0.26, 0, 0],
          rightThigh: [-0.12 - Math.max(0, -groove) * 0.14, -0.05, -0.05],
          rightShin: [0.24 + Math.max(0, -groove) * 0.26, 0, 0],
        },
      };
      break;
    }

    case 'Happy_Bounce': {
      const b = Math.abs(Math.sin(elapsed * 6.2)) * 0.055 * amp;
      out = {
        pelvisPos: [0, -0.045 + b, 0],
        bones: {
          chest: [0.03 - b * 0.5, 0, 0],
          head: [-0.04 + b * 0.7, 0, Math.sin(elapsed * 3.1) * 0.06],
          leftUpperArm: [0.08, -0.32, -0.88 + b * 2.5],
          leftForearm: [0, -0.95, 0.2],
          rightUpperArm: [0.08, 0.32, 0.88 - b * 2.5],
          rightForearm: [0, 0.95, -0.2],
          ...baseLegs(-0.2 + b * 2.2, -0.2 + b * 2.2),
        },
      };
      break;
    }

    case 'Happy_Spin': {
      const spin = (elapsed * 2.8) % (Math.PI * 2);
      const hop = Math.abs(Math.sin(elapsed * 5.6)) * 0.045;
      out = {
        pelvisPos: [0, -0.015 + hop, 0],
        bones: {
          pelvis: [0.02, spin, 0],
          chest: [-0.04, 0.08, 0],
          head: [-0.04, 0.1, 0],
          leftUpperArm: [0.08, -0.22, -0.35],
          leftForearm: [0, -0.75, 0.2],
          rightUpperArm: [0.08, 0.22, 0.35],
          rightForearm: [0, 0.75, -0.2],
          ...baseLegs(-0.1, -0.1),
        },
      };
      break;
    }

    case 'Happy_ThumbsUpBoth':
      out = {
        pelvisPos: [0, -0.015 + Math.abs(Math.sin(elapsed * 3.5)) * 0.02, 0.03],
        bones: {
          pelvis: [0.03, 0, 0],
          chest: [0.04 + breath, 0, 0],
          head: [-0.04, 0, 0.04],
          leftShoulder: [0, -0.08, 0],
          leftUpperArm: [0.2, -0.82, -0.62],
          leftForearm: [0, -1.1, 0.3],
          leftHand: [0, -0.2, 0.15],
          rightShoulder: [0, 0.08, 0],
          rightUpperArm: [0.2, 0.82, 0.62],
          rightForearm: [0, 1.1, -0.3],
          rightHand: [0, 0.2, -0.15],
          ...baseLegs(-0.08, -0.08),
        },
        fingerLeft: defaultFingers.right,
        fingerRight: defaultFingers.right,
      };
      break;

    case 'Happy_CelebrateStep': {
      const s = Math.sin(elapsed * 3.8);
      out = {
        pelvisPos: [s * 0.04, -0.02 + Math.abs(s) * 0.05, 0.05 * Math.max(0, s)],
        bones: {
          pelvis: [0.02, s * 0.15, 0],
          chest: [-0.05, -s * 0.12, 0],
          head: [-0.06, s * 0.1, 0],
          leftUpperArm: [0.15, -0.35, 0.1 + s * 0.3],
          leftForearm: [0, -0.6, 0.55],
          rightUpperArm: [0.15, 0.35, -0.1 + s * 0.3],
          rightForearm: [0, 0.6, -0.55],
          leftThigh: [-0.22 * Math.max(0, s) - 0.06, 0.04, 0.05],
          leftShin: [0.32 * Math.max(0, s) + 0.12, 0, 0],
          rightThigh: [-0.22 * Math.max(0, -s) - 0.06, -0.04, -0.05],
          rightShin: [0.32 * Math.max(0, -s) + 0.12, 0, 0],
        },
      };
      break;
    }

    case 'Happy_Monkey':
    case 'Monkey_Original':
    case 'Monkey_Enhanced':
    case 'Monkey_Jump': {
      // Signature expressive playful Monkey animation!
      const speedMult = animId === 'Monkey_Jump' ? 8.2 : animId === 'Monkey_Enhanced' ? 7.4 : 6.8;
      const hopPhase = elapsed * speedMult;
      const hopHeight = animId === 'Monkey_Jump' ? 0.145 : animId === 'Happy_Monkey' ? 0.095 : 0.075;
      const hopY = Math.abs(Math.sin(hopPhase)) * hopHeight * amp;
      const sideSwing = Math.sin(hopPhase * 0.5);
      const armPump = Math.sin(elapsed * (animId === 'Monkey_Enhanced' ? 11.2 : 9.5));
      const wristFlop = Math.sin(elapsed * 11.5) * 0.38;
      out = {
        pelvisPos: [sideSwing * 0.06, -0.14 + hopY, 0.025],
        bones: {
          pelvis: [0.16, sideSwing * 0.16, sideSwing * 0.09],
          spine: [0.18, -sideSwing * 0.11, 0],
          chest: [0.14, -sideSwing * 0.13, sideSwing * 0.07],
          neck: [-0.14, 0, 0],
          head: [-0.14 + Math.sin(elapsed * 8.5) * 0.07, sideSwing * 0.2, sideSwing * -0.14],
          leftShoulder: [0, 0.05, 0.18],
          leftUpperArm: [0.25 + armPump * 0.28, -0.35, -0.45 + armPump * 0.38],
          leftForearm: [0, -1.25 + armPump * 0.28, -0.75 - armPump * 0.36],
          leftHand: [-0.55 + wristFlop, 0, 0.45],
          rightShoulder: [0, -0.05, -0.18],
          rightUpperArm: [0.25 - armPump * 0.28, 0.35, 0.45 + armPump * 0.38],
          rightForearm: [0, 1.25 + armPump * 0.28, 0.75 - armPump * 0.36],
          rightHand: [-0.55 - wristFlop, 0, -0.45],
          leftThigh: [-0.62 - hopY * 1.4, 0.14, 0.18],
          leftShin: [1.05 + hopY * 1.5, 0, 0],
          leftFoot: [-0.38, 0, -0.08],
          rightThigh: [-0.62 - hopY * 1.4, -0.14, -0.18],
          rightShin: [1.05 + hopY * 1.5, 0, 0],
          rightFoot: [-0.38, 0, 0.08],
        },
        dampingSpeed: 11.5,
      };
      break;
    }

    // =========================================================
    // C. HANDS & ARMS (31 - 60)
    // =========================================================
    case 'Wave_Hello':
    case 'Wave_Goodbye':
    case 'Wave_Friendly':
    case 'Wave_Big': {
      const freq = animId === 'Wave_Goodbye' ? 4.2 : animId === 'Wave_Big' ? 6.8 : 6.0;
      const wave = Math.sin(elapsed * freq);
      const armZ = animId === 'Wave_Big' ? -0.35 : animId === 'Wave_Goodbye' ? 0.52 : 0.28;
      const forearmZ = animId === 'Wave_Big' ? -0.95 + wave * 0.34 : -1.75 + wave * 0.24;
      const turnY = animId === 'Wave_Friendly' ? 0.14 : 0.04;
      out = {
        pelvisPos: [Math.sin(elapsed * 2.2) * 0.015, -0.015, 0],
        bones: {
          pelvis: [0.02, turnY + Math.sin(elapsed * 2.2) * 0.04, -0.02],
          chest: [-0.02 + breath, turnY, -0.03],
          head: [-0.04, -turnY, 0.07 + wave * 0.03],
          rightShoulder: [0, 0, -0.06],
          rightUpperArm: [0.12, 0.35, armZ],
          rightForearm: [0, 0.25, forearmZ],
          rightHand: [0.22, 0.1, wave * 0.28],
          ...armRestLeft,
          ...baseLegs(-0.06, -0.08),
        },
      };
      break;
    }

    case 'Point_Right':
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          pelvis: [0, -0.14, 0],
          chest: [0, -0.16, 0],
          head: [0, -0.22, 0.03],
          ...armRestLeft,
          rightUpperArm: [0.05, 0.12, 0.08],
          rightForearm: [0, 0.14, -0.06],
          rightHand: [0, 0, -0.06],
          ...baseLegs(),
        },
      };
      break;

    case 'Point_Left':
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          pelvis: [0, 0.14, 0],
          chest: [0, 0.16, 0],
          head: [0, 0.22, -0.03],
          leftUpperArm: [0.05, -0.12, -0.08],
          leftForearm: [0, -0.14, 0.06],
          leftHand: [0, 0, 0.06],
          ...armRestRight,
          ...baseLegs(),
        },
        fingerLeft: defaultFingers.right,
        fingerRight: defaultFingers.left,
      };
      break;

    case 'Point_Up': {
      const pulse = Math.sin(elapsed * 4.2) * 0.08;
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          chest: [-0.04 + breath, 0.06, 0],
          head: [-0.14, -0.05, 0.04],
          ...armRestLeft,
          rightShoulder: [0, 0, -0.1],
          rightUpperArm: [0.15, 0.45, -0.1 + pulse * 0.2],
          rightForearm: [0, 0.35, -1.62 + pulse],
          rightHand: [0.1, 0, -0.1],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Point_Forward': {
      const beat = Math.sin(elapsed * 4.5) * 0.06;
      out = {
        pelvisPos: [0, -0.015, 0.03],
        bones: {
          pelvis: [0.02, 0.08, 0],
          chest: [0.04 + breath, 0.1, 0],
          head: [0, -0.08, 0],
          ...armRestLeft,
          rightShoulder: [0, 0.12, 0],
          rightUpperArm: [0.05, 1.15, 0.45 + beat],
          rightForearm: [0, 0.35, -0.08],
          rightHand: [0, 0.1, 0],
          ...baseLegs(-0.08, -0.04),
        },
      };
      break;
    }

    case 'Point_AtBoard': {
      const sweep = Math.sin(elapsed * 2.6) * 0.12;
      out = {
        pelvisPos: [0.02, -0.015, 0],
        bones: {
          pelvis: [0, -0.34, 0],
          chest: [0.02, -0.26, 0],
          head: [0.02, -0.24 + sweep * 0.4, 0],
          ...armRestLeft,
          rightShoulder: [0, 0.1, -0.06],
          rightUpperArm: [0.12 + sweep * 0.4, 0.58, 0.05 + sweep * 0.5],
          rightForearm: [0, 0.45, -0.38],
          rightHand: [0, 0.12, 0],
          ...baseLegs(-0.06, -0.06),
        },
      };
      break;
    }

    case 'Point_TwoHands': {
      const pulse = Math.sin(elapsed * 4.5) * 0.06;
      out = {
        pelvisPos: [0, -0.015, 0.02],
        bones: {
          chest: [0.03 + breath, 0, 0],
          head: [0.02, 0, 0],
          leftUpperArm: [0.08, -0.88, -0.68 + pulse],
          leftForearm: [0, -0.52, 0],
          rightUpperArm: [0.08, 0.88, 0.68 - pulse],
          rightForearm: [0, 0.52, 0],
          ...baseLegs(),
        },
        fingerLeft: defaultFingers.right,
      };
      break;
    }

    case 'Explain_OpenHands':
    case 'Explain_OneHandRight':
    case 'Explain_OneHandLeft':
    case 'Explain_StepByStep':
    case 'Explain_Emphasize':
    case 'Explain_Compare': {
      const beat = (0.38 + speechEnergy * 0.62) * Math.sin(elapsed * 5.8);
      const wristFlow = Math.cos(elapsed * 4.4) * 0.22;
      if (animId === 'Explain_OneHandRight') {
        out = {
          pelvisPos: [0.01, -0.015, 0],
          bones: {
            chest: [0.02 + breath, 0.06, 0],
            head: [talkBeat * 0.05, -0.04, 0.04],
            ...armRestLeft,
            rightUpperArm: [0.1, 0.56, 0.72 - beat * 0.14],
            rightForearm: [0, 1.32 + beat * 0.25, -0.24],
            rightHand: [-0.3 + wristFlow * 0.3, -wristFlow * 0.25, -0.2],
            ...baseLegs(),
          },
        };
      } else if (animId === 'Explain_OneHandLeft') {
        out = {
          pelvisPos: [-0.01, -0.015, 0],
          bones: {
            chest: [0.02 + breath, -0.06, 0],
            head: [talkBeat * 0.05, 0.04, -0.04],
            leftUpperArm: [0.1, -0.56, -0.72 + beat * 0.14],
            leftForearm: [0, -1.32 - beat * 0.25, 0.24],
            leftHand: [-0.3 - wristFlow * 0.3, wristFlow * 0.25, 0.2],
            ...armRestRight,
            ...baseLegs(),
          },
        };
      } else if (animId === 'Explain_StepByStep') {
        const phase = Math.floor((elapsed * 1.4) % 3);
        const shift = phase === 0 ? -0.12 : phase === 1 ? 0 : 0.12;
        out = {
          pelvisPos: [shift * 0.12, -0.015, 0],
          bones: {
            chest: [0.03, shift * 0.6, 0],
            head: [0.02, shift * 0.8, 0],
            leftUpperArm: [0.12, -0.68, -0.76 - (phase === 0 ? 0.18 : 0)],
            leftForearm: [0, -1.25, 0.22],
            leftHand: [-0.25, 0, 0.18],
            rightUpperArm: [0.12, 0.68, 0.76 + (phase === 2 ? 0.18 : 0)],
            rightForearm: [0, 1.25, -0.22],
            rightHand: [-0.25, 0, -0.18],
            ...baseLegs(),
          },
        };
      } else if (animId === 'Explain_Emphasize') {
        const chop = Math.abs(Math.sin(elapsed * 5.2));
        out = {
          pelvisPos: [0, -0.02 + chop * 0.015, 0.03],
          bones: {
            chest: [0.06 - chop * 0.04, 0, 0],
            head: [0.06 * chop, 0, 0],
            leftUpperArm: [0.15, -0.72, -0.68 + chop * 0.18],
            leftForearm: [0, -1.35, 0.25 - chop * 0.22],
            leftHand: [0, 0, 0.18],
            rightUpperArm: [0.15, 0.72, 0.68 - chop * 0.18],
            rightForearm: [0, 1.35, -0.25 + chop * 0.22],
            rightHand: [0, 0, -0.18],
            ...baseLegs(-0.08, -0.08),
          },
        };
      } else if (animId === 'Explain_Compare') {
        const scale = Math.sin(elapsed * 2.8);
        out = {
          pelvisPos: [scale * 0.02, -0.015, 0],
          bones: {
            chest: [0.02, scale * 0.12, scale * 0.04],
            head: [0.02, scale * 0.18, scale * -0.05],
            leftUpperArm: [0.12, -0.58, -0.68 + scale * 0.25],
            leftForearm: [0, -1.05, 0.2 + scale * 0.15],
            leftHand: [-0.45, 0.15, 0.2],
            rightUpperArm: [0.12, 0.58, 0.68 + scale * 0.25],
            rightForearm: [0, 1.05, -0.2 + scale * 0.15],
            rightHand: [-0.45, -0.15, -0.2],
            ...baseLegs(),
          },
        };
      } else {
        out = {
          pelvisPos: [sway * 0.22, -0.018, 0],
          bones: {
            pelvis: [0.02, sway * 0.5, sway * 0.25],
            spine: [0.03, sway * 0.4, 0],
            chest: [-0.02 + breath, sway * 0.55, 0],
            head: [talkBeat * 0.06, sway * 0.5, Math.sin(elapsed * 1.9) * 0.05],
            leftShoulder: [0, -0.04, 0.05],
            leftUpperArm: [0.1 + beat * 0.25, -0.52, -0.82 - speechEnergy * 0.1],
            leftForearm: [0, -1.22 - beat * 0.28, 0.28 + beat * 0.15],
            leftHand: [-0.32 + wristFlow * 0.4, wristFlow * 0.35, 0.2],
            rightShoulder: [0, 0.04, -0.05],
            rightUpperArm: [0.1 - beat * 0.25, 0.52, 0.82 + speechEnergy * 0.1],
            rightForearm: [0, 1.22 + beat * 0.28, -0.28 - beat * 0.15],
            rightHand: [-0.32 - wristFlow * 0.4, -wristFlow * 0.35, -0.2],
            ...baseLegs(-0.08 + sway * 0.2, -0.08 - sway * 0.2),
          },
        };
      }
      break;
    }

    case 'Explain_Count_One':
    case 'Explain_Count_Two':
    case 'Explain_Count_Three':
    case 'Explain_Count_Four':
    case 'Explain_Count_Five': {
      const countBob = Math.sin(elapsed * 4.5) * 0.05;
      const numTilt =
        animId === 'Explain_Count_One' ? -0.06 :
        animId === 'Explain_Count_Two' ? -0.02 :
        animId === 'Explain_Count_Three' ? 0.02 :
        animId === 'Explain_Count_Four' ? 0.05 : 0.08;
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          chest: [0.02 + breath, 0.08, 0],
          head: [-0.02 + countBob * 0.4, -0.06, numTilt],
          ...armRestLeft,
          rightShoulder: [0, 0.06, -0.05],
          rightUpperArm: [0.14, 0.58, 0.42],
          rightForearm: [0, 0.72, -1.28 + countBob],
          rightHand: [0.1, 0.15, -0.15],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Raise_Hand':
      out = {
        pelvisPos: [0, -0.01, 0],
        bones: {
          chest: [-0.03 + breath, 0.05, 0],
          head: [-0.05, -0.04, 0.03],
          ...armRestLeft,
          rightShoulder: [0, 0, -0.15],
          rightUpperArm: [0.12, 0.22, -0.42],
          rightForearm: [0, 0.22, -0.95],
          rightHand: [0, 0, -0.1],
          ...baseLegs(),
        },
      };
      break;

    case 'Offer_Hand':
      out = {
        pelvisPos: [0, -0.015, 0.04],
        bones: {
          pelvis: [0.02, 0.06, 0],
          chest: [0.05 + breath, 0.08, 0],
          head: [0.02, -0.06, 0.04],
          ...armRestLeft,
          rightUpperArm: [0.1, 0.85, 0.72],
          rightForearm: [0, 0.65, -0.15],
          rightHand: [-0.48, 0.12, -0.15],
          ...baseLegs(-0.08, -0.04),
        },
      };
      break;

    case 'Stop_Gesture':
      out = {
        pelvisPos: [0, -0.012, -0.02],
        bones: {
          pelvis: [-0.02, 0.06, 0],
          chest: [-0.04, 0.06, 0],
          head: [0, -0.05, 0],
          ...armRestLeft,
          rightUpperArm: [0.08, 1.02, 0.45],
          rightForearm: [0, 0.55, -0.25],
          rightHand: [0.22, 0, -1.15],
          ...baseLegs(),
        },
      };
      break;

    case 'Come_Here': {
      const curl = Math.sin(elapsed * 5.2) * 0.2;
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          chest: [0.02 + breath, 0.06, 0],
          head: [0.02, -0.05, 0.05],
          ...armRestLeft,
          rightUpperArm: [0.12, 0.78, 0.65],
          rightForearm: [0, 0.88, -0.45 + curl * 0.4],
          rightHand: [-0.45, 0, -0.4 + curl],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Cross_Arms':
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          pelvis: [-0.02, -0.06, 0],
          chest: [-0.04 + breath, 0.06, 0],
          head: [0.03, 0.04, 0.04],
          leftShoulder: [0, -0.16, 0],
          leftUpperArm: [0.12, -0.95, -0.92],
          leftForearm: [0, -1.72, 0.16],
          leftHand: [0, 0, 0.25],
          rightShoulder: [0, 0.16, 0],
          rightUpperArm: [0.08, 0.92, 0.98],
          rightForearm: [0, 1.72, -0.18],
          rightHand: [0, 0, -0.25],
          ...baseLegs(-0.06, -0.06),
        },
      };
      break;

    case 'Hands_Together':
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          chest: [0.04 + breath, 0, 0],
          head: [0.04, 0, 0],
          leftShoulder: [0, -0.14, 0],
          leftUpperArm: [0.14, -0.78, -0.85],
          leftForearm: [0, -1.45, 0.24],
          leftHand: [0, 0, 0.2],
          rightShoulder: [0, 0.14, 0],
          rightUpperArm: [0.14, 0.78, 0.85],
          rightForearm: [0, 1.45, -0.24],
          rightHand: [0, 0, -0.2],
          ...baseLegs(),
        },
      };
      break;

    case 'Hand_To_Chest':
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          chest: [0.04 + breath, 0.04, 0],
          head: [0.06, -0.04, 0.06],
          ...armRestLeft,
          rightShoulder: [0, 0.15, 0],
          rightUpperArm: [0.18, 0.88, 0.85],
          rightForearm: [0, 1.92, -0.32],
          rightHand: [0.15, 0.2, -0.2],
          ...baseLegs(),
        },
      };
      break;

    case 'Hand_To_Ear':
      out = {
        pelvisPos: [0, -0.015, 0.02],
        bones: {
          chest: [0.05 + breath, -0.08, 0.04],
          head: [0.03, -0.1, 0.14],
          ...armRestLeft,
          rightShoulder: [0, 0.06, -0.18],
          rightUpperArm: [0.18, 0.35, -0.62],
          rightForearm: [0, 0.45, -1.55],
          rightHand: [0.15, 0.2, -0.25],
          ...baseLegs(),
        },
      };
      break;

    case 'Shrug_BothHands': {
      const lift = 0.5 + 0.5 * Math.sin(elapsed * 3.0);
      out = {
        pelvisPos: [0, -0.025 + lift * 0.012, 0],
        bones: {
          chest: [0.04, 0, 0],
          head: [0.05, 0.08, 0.12],
          leftShoulder: [0, 0, 0.16 + lift * 0.12],
          leftUpperArm: [0.08, -0.32, -0.62],
          leftForearm: [0, -1.15, 0.45],
          leftHand: [-0.62, 0.15, 0.28],
          rightShoulder: [0, 0, -0.16 - lift * 0.12],
          rightUpperArm: [0.08, 0.32, 0.62],
          rightForearm: [0, 1.15, -0.45],
          rightHand: [-0.62, -0.15, -0.28],
          ...baseLegs(-0.1, -0.1),
        },
      };
      break;
    }

    // =========================================================
    // D. THINKING & EXPLAINING (61 - 75)
    // =========================================================
    case 'Think_Original':
    case 'Think_HandOnChin': {
      const ponder = Math.sin(elapsed * 1.5);
      const twirl = Math.sin(elapsed * 2.8) * 0.1;
      out = {
        pelvisPos: [ponder * 0.014, -0.02, 0],
        bones: {
          pelvis: [0.02, -0.07, 0.02],
          spine: [0.05, 0.05, -0.03],
          chest: [0.04 + breath * 0.5, 0.07, -0.04],
          neck: [0.04, -0.05, 0.05],
          head: [-0.06 + ponder * 0.04, -0.1 + ponder * 0.05, 0.13],
          rightShoulder: [0, 0.12, 0],
          rightUpperArm: [-0.4, 1.15, 0.65],
          rightForearm: [0, 1.85, -0.45],
          rightHand: [0.1, 0.2 + twirl, -0.25],
          leftShoulder: [0, -0.1, 0],
          leftUpperArm: [0.1, -0.85, -0.95],
          leftForearm: [0, -1.55, 0.15],
          leftHand: [0, 0.1, 0.2],
          ...baseLegs(-0.08, -0.14, 0.16, 0.26),
        },
      };
      break;
    }

    case 'Think_HandToMouth': {
      const hover = Math.sin(elapsed * 2.8) * 0.04;
      out = {
        pelvisPos: [sway * 0.16, -0.015 + Math.abs(hover) * 0.14, 0],
        bones: {
          pelvis: [0.02, -0.07 + sway * 0.35, sway * 0.2],
          spine: [0.04, 0.05, -0.02],
          chest: [0.05 + breath * 0.6, 0.06, -0.03],
          neck: [0.04, -0.04, 0.04],
          head: [-0.04 + Math.sin(elapsed * 2.0) * 0.03, -0.06 + sway * 0.4, 0.1],
          rightShoulder: [0, 0.14, 0],
          rightUpperArm: [-0.32, 0.96 + hover * 0.3, 0.52],
          rightForearm: [0, 1.88 + hover * 0.5, -0.55],
          rightHand: [0.12 + hover * 0.6, 0.16, -0.22 + Math.sin(elapsed * 4.5) * 0.08],
          ...armRestLeft,
          ...baseLegs(-0.08, 0.04, 0.16, 0.06),
        },
      };
      break;
    }

    case 'Think_ScratchHead': {
      const scratch = Math.sin(elapsed * 11.5);
      const headBob = Math.sin(elapsed * 5.75) * 0.035;
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          pelvis: [0, 0.05, -0.02],
          spine: [0.02, -0.03, 0.03],
          chest: [0.02 + breath * 0.5, -0.04, 0.04],
          neck: [0.04, 0.04, 0.05],
          head: [0.04 + headBob, -0.08, 0.15 + scratch * 0.025],
          rightShoulder: [0, 0.08, -0.25],
          rightUpperArm: [0.24, 0.25, -1.02],
          rightForearm: [0, 0.22, -0.92 + scratch * 0.13],
          rightHand: [0.18, 0.08, -0.28 + scratch * 0.26],
          leftUpperArm: [0.04, -0.14, -1.06],
          leftForearm: [0, -0.85, 0],
          leftHand: [0, 0, 0.2],
          ...baseLegs(-0.06, -0.12, 0.12, 0.24),
        },
      };
      break;
    }

    case 'Think_LookUp':
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          spine: [-0.03, 0, 0],
          chest: [-0.05 + breath, 0, 0],
          neck: [-0.08, 0, 0],
          head: [-0.22, Math.sin(elapsed * 1.3) * 0.08, 0.06],
          ...armRestLeft,
          rightUpperArm: [0.06, 0.35, 1.05],
          rightForearm: [0, 1.25, -0.2],
          ...baseLegs(),
        },
      };
      break;

    case 'Think_LookSide':
      out = {
        pelvisPos: [0.02, -0.015, 0],
        bones: {
          pelvis: [0, -0.08, 0],
          chest: [0.02 + breath, -0.06, 0],
          head: [0.02, -0.32 + Math.sin(elapsed * 1.1) * 0.05, 0.08],
          leftUpperArm: [0.08, -0.68, -0.92],
          leftForearm: [0, -1.35, 0.2],
          ...armRestRight,
          ...baseLegs(),
        },
      };
      break;

    case 'Think_PaceStep': {
      const pace = Math.sin(elapsed * 1.8);
      out = {
        pelvisPos: [pace * 0.08, -0.02 + Math.abs(Math.cos(elapsed * 1.8)) * 0.012, 0],
        bones: {
          pelvis: [0.02, pace * 0.16, 0],
          chest: [0.05, pace * 0.12, 0],
          head: [0.08, -pace * 0.1, 0.06],
          rightShoulder: [0, 0.1, 0],
          rightUpperArm: [-0.35, 1.12, 0.65],
          rightForearm: [0, 1.82, -0.45],
          leftUpperArm: [0.08, -0.75, -0.95],
          leftForearm: [0, -1.45, 0.2],
          leftThigh: [-0.15 * Math.max(0, pace) - 0.06, 0.04, 0.04],
          leftShin: [0.28 * Math.max(0, pace) + 0.12, 0, 0],
          rightThigh: [-0.15 * Math.max(0, -pace) - 0.06, -0.04, -0.04],
          rightShin: [0.28 * Math.max(0, -pace) + 0.12, 0, 0],
        },
      };
      break;
    }

    case 'Think_Idea':
    case 'Think_IdeaExcited': {
      const speed = animId === 'Think_IdeaExcited' ? 6.4 : 5.0;
      const bounce = Math.abs(Math.sin(elapsed * speed));
      const nod = Math.sin(elapsed * 6.0) * 0.12;
      const flourish = Math.sin(elapsed * 4.2) * 0.18;
      out = {
        pelvisPos: [0, -0.02 + bounce * (animId === 'Think_IdeaExcited' ? 0.065 : 0.042), 0],
        bones: {
          pelvis: [0.02, 0.08, -0.02],
          spine: [-0.04, 0.06, 0],
          chest: [-0.05 + breath, 0.08, 0],
          neck: [nod * 0.35, -0.03, 0],
          head: [nod - 0.05, -0.06, -0.06],
          rightShoulder: [0, 0.08, -0.08],
          rightUpperArm: [0.15, 0.75, 0.18 + bounce * 0.08],
          rightForearm: [0, 0.95, -1.35 + flourish * 0.28],
          rightHand: [0.15 + flourish * 0.45, 0.15 + flourish * 0.5, -0.15],
          leftUpperArm: [0.06, -0.18, -1.12],
          leftForearm: [0, -0.68, 0],
          ...baseLegs(-0.14 * bounce, -0.08 - 0.1 * bounce),
        },
      };
      break;
    }

    case 'Explain_Teacher': {
      const b = Math.sin(elapsed * 3.8) * 0.12;
      out = {
        pelvisPos: [0, -0.015, 0.02],
        bones: {
          chest: [0.03 + breath, Math.sin(elapsed * 1.4) * 0.06, 0],
          head: [talkBeat * 0.06, Math.sin(elapsed * 1.4) * 0.06, 0],
          leftUpperArm: [0.1, -0.46, -0.95],
          leftForearm: [0, -1.12, 0.2],
          rightUpperArm: [0.12, 0.65, 0.68 - b * 0.3],
          rightForearm: [0, 1.25 + b, -0.35],
          rightHand: [-0.25, b * 0.4, -0.15],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Explain_Deep':
      out = {
        pelvisPos: [0, -0.02, 0.05],
        bones: {
          pelvis: [0.04, 0, 0],
          spine: [0.08, 0, 0],
          chest: [0.08 + breath, 0, 0],
          head: [-0.04 + talkBeat * 0.05, 0, 0.04],
          leftUpperArm: [0.15, -0.78, -0.72],
          leftForearm: [0, -1.45, 0.28],
          leftHand: [-0.2, 0.1, 0.15],
          rightUpperArm: [0.15, 0.78, 0.72],
          rightForearm: [0, 1.45, -0.28],
          rightHand: [-0.2, -0.1, -0.15],
          ...baseLegs(-0.1, -0.1),
        },
      };
      break;

    case 'Explain_Calm': {
      const flow = Math.sin(elapsed * 1.9) * 0.12;
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          chest: [0.01 + breath, flow * 0.25, 0],
          head: [0.01, flow * 0.25, 0.03],
          leftUpperArm: [0.08, -0.45, -0.95 + flow * 0.15],
          leftForearm: [0, -0.95, 0.18],
          leftHand: [-0.25, 0, 0.15],
          rightUpperArm: [0.08, 0.45, 0.95 - flow * 0.15],
          rightForearm: [0, 0.95, -0.18],
          rightHand: [-0.25, 0, -0.15],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Explain_Storytelling': {
      const arc = Math.sin(elapsed * 2.4);
      out = {
        pelvisPos: [arc * 0.03, -0.015, 0],
        bones: {
          pelvis: [0.02, arc * 0.12, 0],
          chest: [0.02 + breath, arc * 0.16, 0],
          head: [talkBeat * 0.06, arc * 0.18, arc * -0.06],
          leftUpperArm: [0.12, -0.42 + arc * 0.2, -0.62],
          leftForearm: [0, -1.05, 0.35],
          rightUpperArm: [0.12, 0.42 + arc * 0.2, 0.62],
          rightForearm: [0, 1.05, -0.35],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Explain_Summarize': {
      const gather = 0.5 + 0.5 * Math.sin(elapsed * 2.5);
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          chest: [0.03 + breath, 0, 0],
          head: [0.04 * gather, 0, 0],
          leftUpperArm: [0.12, -0.45 - gather * 0.45, -0.78],
          leftForearm: [0, -1.15 - gather * 0.35, 0.2],
          rightUpperArm: [0.12, 0.45 + gather * 0.45, 0.78],
          rightForearm: [0, 1.15 + gather * 0.35, -0.2],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Explain_Highlight': {
      const tap = Math.abs(Math.sin(elapsed * 4.2)) * 0.15;
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          chest: [0.04 + breath, 0.06, 0],
          head: [0.06, -0.05, 0.04],
          leftUpperArm: [0.12, -0.82, -0.82],
          leftForearm: [0, -1.35, 0.2],
          leftHand: [-0.4, 0, 0.15],
          rightUpperArm: [0.14, 0.85, 0.72 - tap],
          rightForearm: [0, 1.42, -0.35 + tap],
          ...baseLegs(),
        },
      };
      break;
    }

    // =========================================================
    // E. STUDENT INTERACTION (76 - 95)
    // =========================================================
    case 'Listen_Attentive':
      out = {
        pelvisPos: [0, -0.012, 0.03],
        bones: {
          spine: [0.05, 0, 0],
          chest: [0.05 + breath, 0, 0],
          head: [Math.sin(elapsed * 2.2) * 0.03, 0, 0.04],
          leftUpperArm: [0.06, -0.28, -1.12],
          leftForearm: [0, -0.78, 0.1],
          rightUpperArm: [0.06, 0.28, 1.12],
          rightForearm: [0, 0.78, -0.1],
          ...baseLegs(-0.06, -0.04),
        },
      };
      break;

    case 'Listen_HeadTilt':
      out = {
        pelvisPos: [0, -0.012, 0.02],
        bones: {
          chest: [0.03 + breath, -0.04, 0.03],
          neck: [0.02, 0, 0.06],
          head: [0.02, 0.04, 0.2],
          ...armRestLeft,
          ...armRestRight,
          ...baseLegs(),
        },
      };
      break;

    case 'Listen_Nodding': {
      const nod = Math.sin(elapsed * 5.2) * 0.11;
      out = {
        pelvisPos: [0, -0.012, 0.02],
        bones: {
          chest: [0.04 + breath, 0, 0],
          neck: [nod * 0.4, 0, 0],
          head: [nod + 0.03, 0, 0],
          ...armRestLeft,
          ...armRestRight,
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Listen_Curious':
      out = {
        pelvisPos: [0, -0.015, 0.025],
        bones: {
          chest: [0.04 + breath, 0.05, 0],
          head: [0.02, -0.08, 0.14],
          ...armRestLeft,
          rightUpperArm: [-0.3, 0.95, 0.65],
          rightForearm: [0, 1.75, -0.4],
          ...baseLegs(),
        },
      };
      break;

    case 'React_Agree':
    case 'React_StrongAgree': {
      const freq = animId === 'React_StrongAgree' ? 7.2 : 5.8;
      const nod = Math.sin(elapsed * freq) * (animId === 'React_StrongAgree' ? 0.18 : 0.13);
      out = {
        pelvisPos: [0, -0.015 + Math.abs(nod) * 0.1, 0],
        bones: {
          chest: [0.04 + breath, 0, 0],
          neck: [nod * 0.35, 0, 0],
          head: [nod, 0, 0],
          leftUpperArm: [0.08, -0.32, -1.05],
          leftForearm: [0, -0.85, 0.15],
          rightUpperArm: [0.12, 0.56, 0.78],
          rightForearm: [0, 1.15, -0.25],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'React_Disagree': {
      const shake = Math.sin(elapsed * 5.6) * 0.22;
      out = {
        pelvisPos: [0, -0.015, -0.02],
        bones: {
          chest: [-0.02, 0, 0],
          head: [0.02, shake, 0.04],
          ...armRestLeft,
          rightUpperArm: [0.08, 0.72, 0.68],
          rightForearm: [0, 0.95 + shake * 0.4, -0.45],
          rightHand: [0.2, 0, -0.85],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'React_Surprised':
    case 'React_Shocked': {
      const stepBack = animId === 'React_Shocked' ? -0.07 : -0.04;
      out = {
        pelvisPos: [0, -0.02, stepBack],
        bones: {
          pelvis: [-0.04, 0, 0],
          chest: [-0.08, 0, 0],
          head: [-0.08, 0, animId === 'React_Shocked' ? 0.06 : 0],
          leftShoulder: [0, 0, 0.15],
          leftUpperArm: [0.12, -0.75, -0.52],
          leftForearm: [0, -1.45, animId === 'React_Shocked' ? -0.35 : 0.35],
          rightShoulder: [0, 0, -0.15],
          rightUpperArm: [0.12, 0.75, 0.52],
          rightForearm: [0, 1.45, animId === 'React_Shocked' ? 0.35 : -0.35],
          ...baseLegs(-0.14, 0.04, 0.24, 0.12),
        },
      };
      break;
    }

    case 'React_Confused': {
      const swayC = Math.sin(elapsed * 2.2) * 0.05;
      out = {
        pelvisPos: [0, -0.018, 0],
        bones: {
          chest: [0.03, swayC, 0.04],
          head: [0.04, 0.08, 0.22],
          ...armRestLeft,
          rightShoulder: [0, 0, -0.14],
          rightUpperArm: [0.12, 0.48, 0.62],
          rightForearm: [0, 1.25, -0.55],
          rightHand: [-0.4, 0.15, -0.25],
          ...baseLegs(-0.08, -0.08),
        },
      };
      break;
    }

    case 'React_Laugh': {
      const chuckle = Math.abs(Math.sin(elapsed * 9.5));
      out = {
        pelvisPos: [0, -0.025 + chuckle * 0.02, -0.02],
        bones: {
          pelvis: [-0.04, 0, 0],
          chest: [-0.08 + chuckle * 0.06, 0, 0],
          head: [-0.14 + chuckle * 0.08, Math.sin(elapsed * 4.75) * 0.06, 0.05],
          leftUpperArm: [0.12, -0.62, -0.82],
          leftForearm: [0, -1.45, 0.2],
          rightUpperArm: [0.14, 0.85, 0.85],
          rightForearm: [0, 1.82, -0.3],
          ...baseLegs(-0.1, -0.1),
        },
      };
      break;
    }

    case 'React_SmileNod': {
      const nod = Math.sin(elapsed * 3.4) * 0.09;
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          chest: [0.02 + breath, 0, 0],
          head: [nod, 0.04, 0.06],
          ...armRestLeft,
          ...armRestRight,
          ...baseLegs(),
        },
      };
      break;
    }

    case 'React_Encourage':
    case 'Encourage_Student': {
      const beat = Math.sin(elapsed * 3.8) * 0.08;
      out = {
        pelvisPos: [0, -0.015, 0.03],
        bones: {
          chest: [0.05 + breath, 0.04, 0],
          head: [0.05 + beat * 0.5, -0.04, 0.05],
          leftUpperArm: [0.1, -0.45, -0.85],
          leftForearm: [0, -1.05, 0.2],
          rightUpperArm: [0.12, 0.78, 0.65 - beat],
          rightForearm: [0, 0.95 + beat, -0.2],
          rightHand: [-0.38, 0.1, -0.15],
          ...baseLegs(-0.08, -0.04),
        },
      };
      break;
    }

    case 'React_Bravo':
    case 'Celebrate_Correct_Answer':
    case 'React_CorrectAnswer': {
      const hop = Math.abs(Math.sin(elapsed * 5.8)) * 0.065 * amp;
      const open = Math.max(0, Math.sin(elapsed * 11.6));
      out = {
        pelvisPos: [0, -0.03 + hop, 0],
        bones: {
          pelvis: [0.02, 0, 0],
          chest: [-0.04, 0, 0],
          head: [-0.06 + Math.sin(elapsed * 5.8) * 0.06, 0, 0],
          leftUpperArm: [0.22, -0.95 + open * 0.35, -0.18],
          leftForearm: [0, -1.35 + open * 0.25, 0.35],
          rightUpperArm: [0.22, 0.95 - open * 0.35, 0.18],
          rightForearm: [0, 1.35 - open * 0.25, -0.35],
          ...baseLegs(-0.16 + hop * 1.5, -0.16 + hop * 1.5),
        },
      };
      break;
    }

    case 'React_TryAgain': {
      const gentle = Math.sin(elapsed * 2.8) * 0.06;
      out = {
        pelvisPos: [0, -0.015, 0.02],
        bones: {
          chest: [0.04 + breath, 0, 0],
          head: [0.04 + gentle, 0.04, 0.08],
          ...armRestLeft,
          rightUpperArm: [0.1, 0.62, 0.78],
          rightForearm: [0, 1.05, -0.25],
          rightHand: [-0.35, 0.1, -0.12],
          ...baseLegs(),
        },
      };
      break;
    }

    case 'React_GoodQuestion':
      out = {
        pelvisPos: [0, -0.015, 0.02],
        bones: {
          chest: [0.03 + breath, 0.08, 0],
          head: [Math.sin(elapsed * 4.5) * 0.07, -0.06, 0.05],
          ...armRestLeft,
          rightUpperArm: [0.14, 0.92, 0.52],
          rightForearm: [0, 0.85, -0.55],
          ...baseLegs(),
        },
      };
      break;

    case 'React_WaitAMoment':
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          chest: [0.02, 0.04, 0],
          head: [0.03, -0.05, 0.06],
          ...armRestLeft,
          rightUpperArm: [0.12, 0.55, 0.52],
          rightForearm: [0, 0.72, -1.25],
          ...baseLegs(),
        },
      };
      break;

    case 'React_HighFive': {
      const slap = Math.max(0, Math.sin(elapsed * 4.2)) * 0.25;
      out = {
        pelvisPos: [0, -0.015 + slap * 0.08, 0.05],
        bones: {
          pelvis: [0.02, 0.12, 0],
          chest: [-0.03, 0.14, 0],
          head: [-0.05, -0.1, 0],
          ...armRestLeft,
          rightShoulder: [0, 0.12, -0.12],
          rightUpperArm: [0.12, 0.88 + slap * 0.4, 0.08],
          rightForearm: [0, 0.32, -1.12],
          rightHand: [0.15, 0, -0.6],
          ...baseLegs(-0.1, 0.04),
        },
      };
      break;
    }

    case 'React_RespectfulBow': {
      const bow = 0.5 + 0.5 * Math.sin(elapsed * 2.2);
      out = {
        pelvisPos: [0, -0.02 - bow * 0.02, 0],
        bones: {
          pelvis: [0.12 * bow, 0, 0],
          spine: [0.18 * bow, 0, 0],
          chest: [0.16 * bow, 0, 0],
          head: [0.16 * bow, 0, 0],
          leftUpperArm: [0.08, -0.35 * bow, -1.16],
          leftForearm: [0, -0.65 * bow - 0.35, 0],
          rightUpperArm: [0.08, 0.35 * bow, 1.16],
          rightForearm: [0, 0.65 * bow + 0.35, 0],
          ...baseLegs(),
        },
      };
      break;
    }

    // =========================================================
    // F. EMOTIONS & EXPRESSIONS (96 - 110)
    // =========================================================
    case 'Emotion_Happy':
    case 'Emotion_Excited':
    case 'Emotion_Curious':
    case 'Emotion_Thinking':
    case 'Emotion_Confused':
    case 'Emotion_Surprised':
    case 'Emotion_Sad':
    case 'Emotion_Proud':
    case 'Emotion_Shy':
    case 'Emotion_Calm':
    case 'Emotion_Focused':
    case 'Emotion_Playful':
    case 'Emotion_Encouraging':
    case 'Emotion_Disappointed_Soft':
    case 'Emotion_Relieved': {
      const p = Math.sin(elapsed * 2.2);
      const isSad = animId === 'Emotion_Sad' || animId === 'Emotion_Disappointed_Soft';
      const isProud = animId === 'Emotion_Proud';
      const isPlayful = animId === 'Emotion_Playful';
      const isExcited = animId === 'Emotion_Excited';
      out = {
        pelvisPos: [0, isSad ? -0.025 : isExcited ? -0.02 + Math.abs(p) * 0.04 : -0.012, 0],
        bones: {
          pelvis: [isSad ? 0.05 : 0, isPlayful ? p * 0.08 : 0, 0],
          spine: [isSad ? 0.09 : isProud ? -0.05 : 0.02, 0, 0],
          chest: [isSad ? 0.1 : isProud ? -0.07 : breath, isPlayful ? -p * 0.06 : 0, 0],
          head: [
            isSad ? 0.2 : isProud ? -0.06 : isExcited ? -0.05 : 0.02,
            animId === 'Emotion_Curious' ? 0.14 : isPlayful ? p * 0.1 : 0,
            animId === 'Emotion_Curious' || animId === 'Emotion_Confused' ? 0.16 : isPlayful ? -0.08 : 0,
          ],
          leftUpperArm: isProud
            ? [0.05, 0.08, -0.82]
            : isExcited
              ? [0.12, -0.38, -0.82 + Math.abs(p) * 0.2]
              : [0.06, -0.18, -1.2],
          leftForearm: isProud ? [0, -1.35, -0.2] : [0, isSad ? -0.22 : -0.55, 0],
          rightUpperArm: isProud
            ? [0.05, -0.08, 0.82]
            : animId === 'Emotion_Thinking'
              ? [-0.36, 1.05, 0.65]
              : isExcited
                ? [0.12, 0.38, 0.82 - Math.abs(p) * 0.2]
                : [0.06, 0.18, 1.2],
          rightForearm: isProud
            ? [0, 1.35, 0.2]
            : animId === 'Emotion_Thinking'
              ? [0, 1.82, -0.45]
              : [0, isSad ? 0.22 : 0.55, 0],
          ...baseLegs(isSad ? -0.04 : -0.08, isSad ? -0.04 : -0.08),
        },
      };
      break;
    }

    // =========================================================
    // G. BODY & LOCOMOTION (111 - 130)
    // =========================================================
    case 'Walk_Original':
    case 'Walk_Happy':
    case 'Walk_Confident':
    case 'Walk_Curious': {
      const freq = animId === 'Walk_Happy' ? 5.8 : 5.0;
      const w = Math.sin(elapsed * freq);
      const bob = Math.abs(Math.cos(elapsed * freq)) * (animId === 'Walk_Happy' ? 0.032 : 0.02);
      const strideAmp = animId === 'Walk_Confident' ? 0.52 : 0.45;
      const leanX = animId === 'Walk_Curious' ? 0.12 : animId === 'Walk_Confident' ? -0.05 : 0.04;
      out = {
        pelvisPos: [0, -0.02 + bob, 0],
        bones: {
          pelvis: [0, w * 0.09, w * 0.04],
          spine: [leanX, -w * 0.07, 0],
          chest: [leanX * 0.5, -w * 0.08, 0],
          head: [-leanX * 0.6, w * 0.05, animId === 'Walk_Happy' ? w * 0.05 : 0],
          leftThigh: [-w * strideAmp, 0, 0],
          leftShin: [Math.max(0.1, 0.35 + Math.cos(elapsed * freq) * 0.38), 0, 0],
          rightThigh: [w * strideAmp, 0, 0],
          rightShin: [Math.max(0.1, 0.35 - Math.cos(elapsed * freq) * 0.38), 0, 0],
          leftUpperArm: [0, w * 0.38, animId === 'Walk_Happy' ? -1.08 : -1.2],
          leftForearm: [0, -0.45 - Math.max(0, -w) * 0.3, 0],
          rightUpperArm: [0, w * 0.38, animId === 'Walk_Happy' ? 1.08 : 1.2],
          rightForearm: [0, 0.45 + Math.max(0, w) * 0.3, 0],
        },
      };
      break;
    }

    case 'Run_Original':
    case 'Run_Happy':
    case 'Run_Excited': {
      const freq = animId === 'Run_Excited' ? 10.2 : 8.8;
      const r = Math.sin(elapsed * freq);
      const bob = Math.abs(Math.cos(elapsed * freq)) * 0.055;
      out = {
        pelvisPos: [0, -0.03 + bob, 0],
        bones: {
          pelvis: [0.06, r * 0.12, 0],
          spine: [0.22, -r * 0.14, 0],
          chest: [0.1, -r * 0.12, 0],
          head: [-0.18, r * 0.06, 0],
          leftThigh: [-r * 0.82, 0, 0],
          leftShin: [Math.max(0.18, 0.68 + Math.cos(elapsed * freq) * 0.72), 0, 0],
          rightThigh: [r * 0.82, 0, 0],
          rightShin: [Math.max(0.18, 0.68 - Math.cos(elapsed * freq) * 0.72), 0, 0],
          leftUpperArm: [0, r * 0.68, animId === 'Run_Happy' ? -0.95 : -1.12],
          leftForearm: [0, -1.28, 0],
          rightUpperArm: [0, r * 0.68, animId === 'Run_Happy' ? 0.95 : 1.12],
          rightForearm: [0, 1.28, 0],
        },
      };
      break;
    }

    case 'Turn_Left':
    case 'Turn_Right':
    case 'Turn_Back': {
      const targetAngle =
        animId === 'Turn_Left' ? 0.85 : animId === 'Turn_Right' ? -0.85 : Math.PI * 0.96;
      const phase = 0.5 + 0.5 * Math.sin(elapsed * 1.8);
      out = {
        pelvisPos: [0, -0.015 + Math.abs(Math.sin(elapsed * 3.6)) * 0.015, 0],
        bones: {
          pelvis: [0, targetAngle * phase, 0],
          chest: [0, targetAngle * 0.12 * phase, 0],
          head: [0, targetAngle * 0.18 * phase, 0],
          ...armRestLeft,
          ...armRestRight,
          ...baseLegs(),
        },
      };
      break;
    }

    case 'Step_Forward':
    case 'Step_Backward':
    case 'Step_Left':
    case 'Step_Right': {
      const p = 0.5 + 0.5 * Math.sin(elapsed * 2.4);
      const dx = animId === 'Step_Left' ? 0.14 * p : animId === 'Step_Right' ? -0.14 * p : 0;
      const dz = animId === 'Step_Forward' ? 0.16 * p : animId === 'Step_Backward' ? -0.16 * p : 0;
      out = {
        pelvisPos: [dx, -0.02 + Math.sin(p * Math.PI) * 0.025, dz],
        bones: {
          chest: [dz * 0.25, 0, dx * -0.25],
          ...armRestLeft,
          ...armRestRight,
          leftThigh: [-0.25 * p, 0.04, 0.06],
          leftShin: [0.42 * p + 0.1, 0, 0],
          rightThigh: [0.15 * p - 0.05, -0.04, -0.06],
          rightShin: [0.15 * p + 0.1, 0, 0],
        },
      };
      break;
    }

    case 'Lean_Forward':
    case 'Lean_Back': {
      const sign = animId === 'Lean_Forward' ? 1 : -1;
      out = {
        pelvisPos: [0, -0.015, sign * 0.04],
        bones: {
          spine: [sign * 0.14, 0, 0],
          chest: [sign * 0.12, 0, 0],
          head: [-sign * 0.08, 0, 0],
          ...armRestLeft,
          ...armRestRight,
          ...baseLegs(-0.08, -0.08),
        },
      };
      break;
    }

    case 'Stretch_Body': {
      const s = 0.5 + 0.5 * Math.sin(elapsed * 1.5);
      out = {
        pelvisPos: [0, -0.01 + s * 0.025, 0],
        bones: {
          spine: [-0.08 * s, 0, 0],
          chest: [-0.12 * s, 0, 0],
          head: [-0.1 * s, 0, 0],
          leftUpperArm: [0.15, -0.15, -1.1 + s * 2.1],
          leftForearm: [0, -0.2, 0.2 * s],
          rightUpperArm: [0.15, 0.15, 1.1 - s * 2.1],
          rightForearm: [0, 0.2, -0.2 * s],
          ...baseLegs(-0.04, -0.04),
        },
      };
      break;
    }

    case 'Hero_Original':
    case 'Hero_Confident':
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          pelvis: [0, -0.24, 0],
          chest: [-0.12 + breath, 0.24, 0],
          head: [0.04, 0.04, 0],
          leftUpperArm: [0, -0.28, animId === 'Hero_Confident' ? -0.78 : -0.94],
          leftForearm: [0, animId === 'Hero_Confident' ? -1.42 : -0.92, 0],
          rightUpperArm: [0, 0.32, animId === 'Hero_Confident' ? 0.78 : 0.91],
          rightForearm: [0, animId === 'Hero_Confident' ? 1.42 : 0.75, 0],
          leftThigh: [-0.28, 0.14, 0.1],
          leftShin: [0.38, 0, 0],
          rightThigh: [0.24, -0.14, -0.1],
          rightShin: [0.21, 0, 0],
        },
      };
      break;

    case 'Balance_Pose': {
      const wobble = Math.sin(elapsed * 2.5) * 0.08;
      out = {
        pelvisPos: [-0.04, -0.01, 0],
        bones: {
          pelvis: [0, 0, -0.06],
          chest: [0.04, 0, wobble * 0.6],
          head: [0, 0, -wobble * 0.5],
          leftUpperArm: [0.05, -0.1, -0.12 + wobble],
          leftForearm: [0, -0.2, 0],
          rightUpperArm: [0.05, 0.1, 0.12 + wobble],
          rightForearm: [0, 0.2, 0],
          leftThigh: [-0.05, 0.02, 0.02],
          leftShin: [0.1, 0, 0],
          rightThigh: [-1.15, -0.05, -0.1],
          rightShin: [1.55, 0, 0],
        },
      };
      break;
    }

    // =========================================================
    // H. FUN & SPECIAL MOVES (131 - 145)
    // =========================================================
    case 'Backflip_Original':
    case 'Backflip_Enhanced': {
      const cycle = elapsed % 3.0;
      const twirl = Math.sin(elapsed * 8.0);
      if (cycle >= 1.1 && cycle < 2.15) {
        const p = (cycle - 1.1) / 1.05;
        const jumpArc = Math.sin(p * Math.PI);
        const flipAngle = -p * Math.PI * 2;
        const tuck = Math.sin(p * Math.PI);
        out = {
          pelvisPos: [0, jumpArc * 0.5 - 0.04 * (1 - jumpArc), 0],
          bones: {
            pelvis: [flipAngle, 0, 0],
            spine: [0.22 * tuck, 0, 0],
            chest: [0.2 * tuck, 0, 0],
            head: [0.15 * tuck, 0, 0],
            leftUpperArm: [0, -0.45, -0.5 + tuck * 0.9],
            leftForearm: [0, -1.15, 0.3],
            rightUpperArm: [0, 0.45, 0.5 - tuck * 0.9],
            rightForearm: [0, 1.15, -0.3],
            leftThigh: [-1.05 * tuck - 0.15, 0.06, 0.08],
            leftShin: [1.55 * tuck + 0.25, 0, 0],
            rightThigh: [-1.05 * tuck - 0.15, -0.06, -0.08],
            rightShin: [1.55 * tuck + 0.25, 0, 0],
          },
          dampingSpeed: 12,
        };
      } else {
        const isLeftKick = cycle >= 2.15;
        const localT = isLeftKick ? (cycle - 2.15) / 0.85 : cycle / 1.1;
        const kick = Math.sin(localT * Math.PI);
        const rKick = isLeftKick ? 0 : kick;
        const lKick = isLeftKick ? kick : 0;
        out = {
          pelvisPos: [0, -0.05 + kick * 0.06, 0],
          bones: {
            pelvis: [-0.08 * kick, (lKick - rKick) * 0.22, (rKick - lKick) * 0.08],
            spine: [-0.06 * kick, (rKick - lKick) * 0.18, 0],
            chest: [-0.04, (rKick - lKick) * 0.2, 0],
            head: [0.04, (lKick - rKick) * 0.15, (rKick - lKick) * 0.06],
            leftUpperArm: [0.2 * kick, -0.35 + twirl * 0.35, -0.55 - rKick * 0.45],
            leftForearm: [0, -0.95, 0.35 + twirl * 0.3],
            rightUpperArm: [0.2 * kick, 0.35 - twirl * 0.35, 0.55 + lKick * 0.45],
            rightForearm: [0, 0.95, -0.35 - twirl * 0.3],
            rightThigh: [-1.35 * rKick - 0.12 * lKick, -0.1 * rKick, -0.12 * rKick],
            rightShin: [0.22 * rKick + 0.24 * lKick, 0, 0],
            leftThigh: [-1.35 * lKick - 0.12 * rKick, 0.1 * lKick, 0.12 * lKick],
            leftShin: [0.22 * lKick + 0.24 * rKick, 0, 0],
          },
          dampingSpeed: 11,
        };
      }
      break;
    }

    case 'Jump_Normal':
    case 'Jump_High': {
      const h = animId === 'Jump_High' ? 0.32 : 0.16;
      const p = Math.max(0, Math.sin(elapsed * 3.8));
      out = {
        pelvisPos: [0, -0.06 * (1 - p) + p * h * amp, 0],
        bones: {
          chest: [-0.08 * p, 0, 0],
          head: [-0.08 * p, 0, 0],
          leftUpperArm: [0.1, -0.25, -0.95 + p * 1.3],
          leftForearm: [0, -0.45, 0.35 * p],
          rightUpperArm: [0.1, 0.25, 0.95 - p * 1.3],
          rightForearm: [0, 0.45, -0.35 * p],
          ...baseLegs(-0.28 * (1 - p) - 0.18 * p, -0.28 * (1 - p) - 0.18 * p),
        },
      };
      break;
    }

    case 'Spin_Happy': {
      const spin = (elapsed * 3.4) % (Math.PI * 2);
      out = {
        pelvisPos: [0, -0.015 + Math.abs(Math.sin(elapsed * 6.8)) * 0.04, 0],
        bones: {
          pelvis: [0, spin, 0],
          chest: [-0.05, 0.12, 0],
          leftUpperArm: [0.1, -0.2, -0.12],
          rightUpperArm: [0.1, 0.2, 0.12],
          ...baseLegs(-0.08, -0.08),
        },
      };
      break;
    }

    case 'Dance_Loop':
    case 'Dance_Victory': {
      const beat = Math.sin(elapsed * 6.4);
      const bounce = Math.abs(Math.cos(elapsed * 6.4)) * 0.055;
      const armsUp = animId === 'Dance_Victory' ? 0.55 : -0.35;
      out = {
        pelvisPos: [beat * 0.06, -0.03 + bounce, 0],
        bones: {
          pelvis: [0.04, beat * 0.22, beat * 0.1],
          spine: [0.02, -beat * 0.14, 0],
          chest: [-0.04, -beat * 0.18, beat * 0.09],
          head: [Math.sin(elapsed * 12.8) * 0.05, beat * 0.14, -beat * 0.08],
          leftUpperArm: [0.18, -0.4 + beat * 0.35, armsUp],
          leftForearm: [0, -1.15, 0.45 + beat * 0.3],
          rightUpperArm: [0.18, 0.4 + beat * 0.35, -armsUp],
          rightForearm: [0, 1.15, -0.45 + beat * 0.3],
          ...baseLegs(-0.14 - Math.max(0, beat) * 0.18, -0.14 - Math.max(0, -beat) * 0.18),
        },
      };
      break;
    }

    case 'Robot_Fun': {
      const step = Math.floor(elapsed * 3.5) % 4;
      const armL = step === 0 ? -0.2 : step === 1 ? -0.9 : -0.6;
      const armR = step === 2 ? 0.2 : step === 3 ? 0.9 : 0.6;
      out = {
        pelvisPos: [0, -0.015, 0],
        bones: {
          chest: [0, step % 2 === 0 ? 0.18 : -0.18, 0],
          head: [0, step === 1 ? -0.25 : step === 3 ? 0.25 : 0, step === 2 ? 0.1 : -0.1],
          leftUpperArm: [0.05, -0.65, armL],
          leftForearm: [0, -1.55, 0.1],
          rightUpperArm: [0.05, 0.65, armR],
          rightForearm: [0, 1.55, -0.1],
          ...baseLegs(-0.08, -0.08),
        },
        dampingSpeed: 18,
      };
      break;
    }

    case 'Wave_DoubleJump': {
      const hop = Math.abs(Math.sin(elapsed * 6.4)) * 0.095;
      const wave = Math.sin(elapsed * 8.0);
      out = {
        pelvisPos: [0, -0.025 + hop, 0],
        bones: {
          chest: [-0.04, 0, 0],
          head: [-0.05, 0, wave * 0.06],
          leftUpperArm: [0.1, -0.35, -0.35],
          leftForearm: [0, -0.25, 1.35 + wave * 0.22],
          rightUpperArm: [0.1, 0.35, 0.35],
          rightForearm: [0, 0.25, -1.35 - wave * 0.22],
          ...baseLegs(-0.18 + hop * 1.4, -0.18 + hop * 1.4),
        },
      };
      break;
    }

    case 'Playful_Bounce': {
      const b = Math.abs(Math.sin(elapsed * 7.2)) * 0.065;
      const tilt = Math.sin(elapsed * 3.6) * 0.12;
      out = {
        pelvisPos: [tilt * 0.15, -0.04 + b, 0],
        bones: {
          pelvis: [0.03, tilt * 0.8, tilt * 0.4],
          chest: [-0.03, -tilt * 0.6, 0],
          head: [-0.04, tilt, -tilt * 0.6],
          leftUpperArm: [0.14, -0.35, -0.75 + b * 2],
          leftForearm: [0, -1.15, 0.3],
          rightUpperArm: [0.14, 0.35, 0.75 - b * 2],
          rightForearm: [0, 1.15, -0.3],
          ...baseLegs(-0.2 + b * 1.8, -0.2 + b * 1.8),
        },
      };
      break;
    }

    case 'Salute':
      out = {
        pelvisPos: [0, -0.008, 0],
        bones: {
          chest: [-0.05 + breath, 0, 0],
          head: [0, 0, 0],
          ...armRestLeft,
          rightShoulder: [0, 0, -0.1],
          rightUpperArm: [0.16, 0.42, -0.15],
          rightForearm: [0, 0.55, -1.88],
          rightHand: [0.12, 0.1, -0.15],
          ...baseLegs(-0.03, -0.03),
        },
      };
      break;

    case 'Triumph_Pose':
      out = {
        pelvisPos: [0, -0.012, 0],
        bones: {
          pelvis: [-0.02, -0.12, 0],
          chest: [-0.08 + breath, 0.12, 0],
          head: [-0.08, 0, 0],
          leftUpperArm: [0.08, -0.22, -0.95],
          leftForearm: [0, -1.2, 0.15],
          rightShoulder: [0, 0, -0.18],
          rightUpperArm: [0.18, 0.35, -0.55],
          rightForearm: [0, 0.25, -0.25],
          ...baseLegs(-0.12, 0.04, 0.2, 0.08),
        },
      };
      break;

    // =========================================================
    // I. EDUCATIONAL & INTERACTIVE (146 - 150)
    // =========================================================
    case 'Present_Lesson': {
      const sweep = Math.sin(elapsed * 2.2) * 0.14;
      out = {
        pelvisPos: [sweep * 0.15, -0.015, 0],
        bones: {
          pelvis: [0, sweep * 0.4, 0],
          chest: [0.02 + breath, sweep * 0.6, 0],
          head: [talkBeat * 0.05, sweep * 0.5, 0.04],
          leftUpperArm: [0.1, -0.45, -0.88],
          leftForearm: [0, -1.15, 0.22],
          leftHand: [-0.28, 0, 0.16],
          rightUpperArm: [0.12, 0.62, 0.55 + sweep * 0.3],
          rightForearm: [0, 0.88, -0.28],
          rightHand: [-0.36, 0.15, -0.16],
          ...baseLegs(-0.07, -0.05),
        },
      };
      break;
    }

    case 'Introduce_Topic': {
      const beat = Math.sin(elapsed * 3.4) * 0.1;
      out = {
        pelvisPos: [0, -0.015, 0.03],
        bones: {
          chest: [0.04 + breath, 0.06, 0],
          head: [-0.03 + talkBeat * 0.05, -0.05, 0.04],
          leftUpperArm: [0.12, -0.72, -0.76],
          leftForearm: [0, -1.35 + beat, 0.24],
          rightUpperArm: [0.12, 0.72, 0.76],
          rightForearm: [0, 1.35 - beat, -0.24],
          ...baseLegs(-0.08, -0.06),
        },
      };
      break;
    }

    case 'Ask_Student':
    default: {
      const tilt = Math.sin(elapsed * 1.8) * 0.04;
      out = {
        pelvisPos: [0, -0.015, 0.035],
        bones: {
          pelvis: [0.02, -0.05, 0],
          chest: [0.05 + breath, 0.06, 0],
          head: [0.03 + tilt, -0.06, 0.12],
          ...armRestLeft,
          rightUpperArm: [0.12, 0.85, 0.68],
          rightForearm: [0, 0.88, -0.24],
          rightHand: [-0.42, 0.12, -0.18],
          ...baseLegs(-0.07, -0.05),
        },
      };
      break;
    }
  }

  return {
    ...out,
    fingerLeft: out.fingerLeft ?? defaultFingers.left,
    fingerRight: out.fingerRight ?? defaultFingers.right,
  };
}

/**
 * Generates an AnimationClip for any of the 150 library IDs (reusing the 9 core clips
 * where designated so exported GLBs keep Idle/Walk/Run/Wave/Think/Clap/Monkey/Backflip/HeroStance).
 */
export function buildLibraryAnimationClip(
  animId: AnimationId,
  bones: THREE.Bone[],
  armRestBasis?: ArmRestBasis,
  pelvisRestPos?: THREE.Vector3,
): THREE.AnimationClip | null {
  const meta = ANIMATION_LIBRARY_REGISTRY[animId];
  if (meta.reusesBaseClip) {
    return buildPresetAnimationClip(
      meta.reusesBaseClip,
      bones,
      armRestBasis,
      pelvisRestPos,
    );
  }
  const dur = meta.defaultDuration;
  const steps = 9;
  const times: number[] = [];
  for (let i = 0; i <= steps; i++) {
    times.push(Number(((i / steps) * dur).toFixed(3)));
  }

  const pelvisBone = bones.find((b) => b.name === 'Pelvis');
  const basePelvis = pelvisRestPos
    ? pelvisRestPos.clone()
    : pelvisBone
      ? pelvisBone.position.clone()
      : new THREE.Vector3(0, 0.88, 0);

  const semanticToBoneName: Record<string, string> = {
    pelvis: 'Pelvis',
    spine: 'Spine',
    chest: 'Chest',
    neck: 'Neck',
    head: 'Head',
    leftShoulder: 'LeftShoulder',
    leftUpperArm: 'LeftUpperArm',
    leftForearm: 'LeftForearm',
    leftHand: 'LeftHand',
    rightShoulder: 'RightShoulder',
    rightUpperArm: 'RightUpperArm',
    rightForearm: 'RightForearm',
    rightHand: 'RightHand',
    leftThigh: 'LeftThigh',
    leftShin: 'LeftShin',
    leftFoot: 'LeftFoot',
    rightThigh: 'RightThigh',
    rightShin: 'RightShin',
    rightFoot: 'RightFoot',
  };

  const boneTrackMap = new Map<string, number[]>();
  const pelvisPosValues: number[] = [];
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();

  for (const t of times) {
    const frame = evaluateAnimationLibraryPose(animId, t, 0.5, 1.0);
    pelvisPosValues.push(
      basePelvis.x + frame.pelvisPos[0],
      basePelvis.y + frame.pelvisPos[1],
      basePelvis.z + frame.pelvisPos[2],
    );
    for (const [sKey, boneName] of Object.entries(semanticToBoneName)) {
      if (!bones.some((b) => b.name === boneName)) continue;
      const e = frame.bones[sKey] ?? [0, 0, 0];
      euler.set(e[0], e[1], e[2], 'XYZ');
      quat.setFromEuler(euler);
      const basis = armRestBasis?.[boneName];
      if (basis) {
        quat.premultiply(basis.pre).multiply(basis.post);
      }
      const arr = boneTrackMap.get(boneName) ?? [];
      arr.push(quat.x, quat.y, quat.z, quat.w);
      boneTrackMap.set(boneName, arr);
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  if (bones.some((b) => b.name === 'Pelvis')) {
    tracks.push(new THREE.VectorKeyframeTrack('Pelvis.position', times, pelvisPosValues));
  }
  for (const [boneName, qVals] of boneTrackMap.entries()) {
    tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, qVals));
  }

  return new THREE.AnimationClip(animId, dur, tracks);
}
