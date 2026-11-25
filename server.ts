import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  ANIMATION_LIBRARY_IDS,
  AnimationId,
  AnimationStateId,
  FacialExpressionPresetId,
  GradeLevelId,
  HandPoseId,
  SpeechLanguage,
  SpeechStyle,
  SubjectId,
} from './src/rigging/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface PerformRequestBody {
  message?: string;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
  voiceName?: string;
  characterName?: string;
  directSpeak?: boolean;
  gradeLevel?: GradeLevelId;
  subject?: SubjectId;
  recentAnimations?: string[];
}

const VALID_FACIAL_EXPRESSIONS: readonly FacialExpressionPresetId[] = [
  'happy',
  'excited',
  'curious',
  'thinking',
  'confused',
  'surprised',
  'sad',
  'encouraging',
  'proud',
  'listening',
  'explaining',
  'laughing',
  'winking',
  'calm',
];

const VALID_STATES: readonly AnimationStateId[] = [
  'Idle',
  'Listening',
  'Thinking',
  'Speaking',
  'Explaining',
  'Reacting',
  'Celebrating',
  'Moving',
  'Special_Action',
];

const VALID_HAND_POSES: readonly HandPoseId[] = [
  'relaxed',
  'point',
  'open',
  'fist',
  'chin_rest',
  'thumbs_up',
  'count_one',
  'count_two',
  'count_three',
  'count_four',
  'count_five',
  'stop',
  'beckon',
];

const ANIMATION_SET = new Set<string>(ANIMATION_LIBRARY_IDS);
const EXPR_SET = new Set<string>(VALID_FACIAL_EXPRESSIONS);
const STATE_SET = new Set<string>(VALID_STATES);
const HAND_SET = new Set<string>(VALID_HAND_POSES);

const DISALLOWED_DURING_SERIOUS_EXPLAIN = new Set<AnimationId>([
  'Monkey_Original',
  'Monkey_Enhanced',
  'Monkey_Jump',
  'Happy_Monkey',
  'Backflip_Original',
  'Backflip_Enhanced',
  'Happy_Jump',
  'Happy_DoubleJump',
  'Happy_Spin',
  'Spin_Happy',
  'Dance_Loop',
  'Dance_Victory',
  'Robot_Fun',
  'Jump_High',
  'Wave_DoubleJump',
]);

const EXPLAIN_ROTATION: AnimationId[] = [
  'Explain_OpenHands',
  'Explain_Teacher',
  'Explain_StepByStep',
  'Explain_OneHandRight',
  'Explain_Emphasize',
  'Point_AtBoard',
  'Present_Lesson',
  'Explain_Compare',
  'Explain_Summarize',
];

const CELEBRATE_ROTATION: AnimationId[] = [
  'Celebrate_Correct_Answer',
  'Happy_Clap',
  'React_Bravo',
  'Happy_ThumbsUpBoth',
  'Happy_VictoryPose',
  'Happy_Monkey',
  'Happy_Cheer',
];

const THINK_ROTATION: AnimationId[] = [
  'Think_HandOnChin',
  'Think_ScratchHead',
  'Think_LookUp',
  'Think_Idea',
  'Think_HandToMouth',
  'Think_LookSide',
];

const GRADE_META: Record<GradeLevelId, { labelAr: string; focus: string }> = {
  prep1: {
    labelAr: 'الصف الأول الإعدادي (أولى إعدادي)',
    focus: 'Use simple, encouraging step-by-step explanations ideal for 12-13 year old students entering middle school.',
  },
  prep2: {
    labelAr: 'الصف الثاني الإعدادي (تانية إعدادي)',
    focus: 'Use clear structured reasoning with practical examples suitable for 13-14 year old Prep 2 students.',
  },
  prep3: {
    labelAr: 'الصف الثالث الإعدادي (تالتة إعدادي - الشهادة الإعدادية)',
    focus: 'Use sharp, exam-confident, crystal-clear explanations with smart tips and follow-up checks for 14-15 year old Prep 3 students.',
  },
};

const SUBJECT_META: Record<SubjectId, string> = {
  general: 'المساعدة الدراسية العامة وتنظيم المذاكرة',
  math: 'الرياضيات (الجبر والإحصاء والهندسة)',
  science: 'العلوم (الكيمياء والفيزياء والأحياء)',
  arabic: 'اللغة العربية (النحو والبلاغة والقراءة والنصوص)',
  english: 'اللغة الإنجليزية (Grammar, Vocabulary & Conversation)',
  social: 'الدراسات الاجتماعية (التاريخ والجغرافيا)',
};

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  baseDelayMs = 450,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|timeout|ECONNRESET/i.test(msg);
      if (!isTransient || attempt === retries) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

function ensureWavBase64(base64Data: string, mimeType?: string): string {
  const buf = Buffer.from(base64Data, 'base64');
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF') {
    return base64Data;
  }
  if (!mimeType || /l16|pcm|wav/i.test(mimeType)) {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + buf.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(buf.length, 40);
    return Buffer.concat([header, buf]).toString('base64');
  }
  return base64Data;
}

function formatGeminiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string } };
    if (parsed?.error?.message) return parsed.error.message;
  } catch {
    // ignore
  }
  return raw || 'Gemini request failed.';
}

function pickNonRecent(pool: AnimationId[], recent: Set<string>, fallback: AnimationId): AnimationId {
  for (const cand of pool) {
    if (!recent.has(cand)) return cand;
  }
  return fallback;
}

function detectIntentDefaults(userMessage: string, recentList: string[]): {
  bodyAnimation: AnimationId;
  gesture: AnimationId;
  secondary: AnimationId;
  facialExpression: FacialExpressionPresetId;
  interactionState: AnimationStateId;
  handPose: HandPoseId;
  speechStyle: SpeechStyle;
  isPlayfulOrCelebration: boolean;
} {
  const lower = userMessage.toLowerCase();
  const recent = new Set(recentList.slice(0, 4));

  const isMonkey = /قرد|نسناس|monkey|ape/.test(lower);
  const isFlip = /شقلط|شقلب|باك|flip|backflip|kick/.test(lower);
  const isCelebrate = /سقف|تصفيق|برافو|شاطر|ممتاز|نجحت|حليت صح|clap|bravo|correct|yay|celebrate/.test(lower);
  const isScratch = /هرش|محتار|حيران|مش فاهم|صعب|confused|scratch/.test(lower);
  const isThink = /فكر|تفتكر|ليه|ازاي|كيف|لماذا|think|why|how/.test(lower);
  const isGreet = /اهلا|أهلا|مرحبا|سلام|ازيك|صباح|مساء|hello|hi|hey/.test(lower);
  const isSad = /زعلان|صعب عليا|خايف|غلطت|sad|worried|mistake/.test(lower);

  if (isMonkey) {
    return {
      bodyAnimation: 'Happy_Monkey',
      gesture: 'Monkey_Enhanced',
      secondary: 'Happy_Clap',
      facialExpression: 'laughing',
      interactionState: 'Celebrating',
      handPose: 'fist',
      speechStyle: 'playful',
      isPlayfulOrCelebration: true,
    };
  }
  if (isFlip) {
    return {
      bodyAnimation: 'Backflip_Enhanced',
      gesture: 'Hero_Confident',
      secondary: 'Happy_VictoryPose',
      facialExpression: 'excited',
      interactionState: 'Special_Action',
      handPose: 'open',
      speechStyle: 'enthusiastic',
      isPlayfulOrCelebration: true,
    };
  }
  if (isCelebrate) {
    const body = pickNonRecent(CELEBRATE_ROTATION, recent, 'Celebrate_Correct_Answer');
    return {
      bodyAnimation: body,
      gesture: 'Happy_Clap',
      secondary: 'Encourage_Student',
      facialExpression: 'proud',
      interactionState: 'Celebrating',
      handPose: 'thumbs_up',
      speechStyle: 'enthusiastic',
      isPlayfulOrCelebration: true,
    };
  }
  if (isGreet) {
    return {
      bodyAnimation: recent.has('Wave_Hello') ? 'Wave_Friendly' : 'Wave_Hello',
      gesture: 'Introduce_Topic',
      secondary: 'Idle_Happy',
      facialExpression: 'happy',
      interactionState: 'Reacting',
      handPose: 'open',
      speechStyle: 'cheerful',
      isPlayfulOrCelebration: true,
    };
  }
  if (isSad) {
    return {
      bodyAnimation: 'Encourage_Student',
      gesture: 'React_TryAgain',
      secondary: 'Explain_Calm',
      facialExpression: 'encouraging',
      interactionState: 'Reacting',
      handPose: 'open',
      speechStyle: 'encouraging',
      isPlayfulOrCelebration: false,
    };
  }
  if (isScratch) {
    return {
      bodyAnimation: 'Think_ScratchHead',
      gesture: 'Explain_StepByStep',
      secondary: 'Explain_OpenHands',
      facialExpression: 'curious',
      interactionState: 'Thinking',
      handPose: 'open',
      speechStyle: 'thoughtful',
      isPlayfulOrCelebration: false,
    };
  }
  if (isThink) {
    const body = pickNonRecent(THINK_ROTATION, recent, 'Think_HandOnChin');
    return {
      bodyAnimation: body,
      gesture: 'Explain_Teacher',
      secondary: 'Ask_Student',
      facialExpression: 'thinking',
      interactionState: 'Explaining',
      handPose: body === 'Think_Idea' ? 'point' : 'chin_rest',
      speechStyle: 'thoughtful',
      isPlayfulOrCelebration: false,
    };
  }

  const explain = pickNonRecent(EXPLAIN_ROTATION, recent, 'Explain_OpenHands');
  return {
    bodyAnimation: explain,
    gesture: 'Explain_StepByStep',
    secondary: 'Ask_Student',
    facialExpression: 'explaining',
    interactionState: 'Explaining',
    handPose: 'open',
    speechStyle: 'encouraging',
    isPlayfulOrCelebration: false,
  };
}

interface RawTutorOutput {
  response_text?: string;
  replyText?: string;
  emotion?: string;
  facial_expression?: string;
  body_animation?: string;
  gesture?: string;
  secondary_animation?: string;
  interaction_state?: string;
  speech_language?: string;
  speech_style?: string;
  lip_sync?: boolean;
  hand_pose?: string;
  voice_style?: string;
  facial_cues?: {
    browLift?: number;
    smile?: number;
    eyeGaze?: string;
    earPerk?: number;
    noseTwitch?: number;
  };
}

function validateAndSanitizeTutorOutput(
  raw: RawTutorOutput,
  userMessage: string,
  recentAnimations: string[],
) {
  const defaults = detectIntentDefaults(userMessage, recentAnimations);
  const recentSet = new Set(recentAnimations.slice(0, 3));

  const responseText = (raw.response_text ?? raw.replyText ?? '').trim() ||
    'أهلاً بك يا بطل! أنا جاهز أشرح لك الدرس خطوة بخطوة.';

  const hasArabic = /[\u0600-\u06FF]/.test(responseText);
  const hasLatin = /[a-zA-Z]{3,}/.test(responseText);
  const inferredLang: SpeechLanguage =
    hasArabic && hasLatin ? 'bilingual' : hasArabic ? 'ar-EG' : 'en';

  const facialExpression: FacialExpressionPresetId =
    raw.facial_expression && EXPR_SET.has(raw.facial_expression)
      ? (raw.facial_expression as FacialExpressionPresetId)
      : defaults.facialExpression;

  let bodyAnimation: AnimationId =
    raw.body_animation && ANIMATION_SET.has(raw.body_animation)
      ? (raw.body_animation as AnimationId)
      : defaults.bodyAnimation;

  let gesture: AnimationId =
    raw.gesture && ANIMATION_SET.has(raw.gesture)
      ? (raw.gesture as AnimationId)
      : defaults.gesture;

  let secondaryAnimation: AnimationId =
    raw.secondary_animation && ANIMATION_SET.has(raw.secondary_animation)
      ? (raw.secondary_animation as AnimationId)
      : defaults.secondary;

  // Keep academic explanations grounded unless celebration/playful intent is genuine
  const isAcademicContext =
    !defaults.isPlayfulOrCelebration &&
    facialExpression !== 'laughing' &&
    facialExpression !== 'excited';
  if (isAcademicContext && DISALLOWED_DURING_SERIOUS_EXPLAIN.has(bodyAnimation)) {
    bodyAnimation = defaults.bodyAnimation;
  }
  if (isAcademicContext && DISALLOWED_DURING_SERIOUS_EXPLAIN.has(gesture)) {
    gesture = defaults.gesture;
  }
  if (isAcademicContext && DISALLOWED_DURING_SERIOUS_EXPLAIN.has(secondaryAnimation)) {
    secondaryAnimation = defaults.secondary;
  }

  // Anti-repetition check
  if (recentSet.has(bodyAnimation) && !/قرد|monkey|backflip/i.test(userMessage)) {
    bodyAnimation = pickNonRecent(
      defaults.isPlayfulOrCelebration ? CELEBRATE_ROTATION : EXPLAIN_ROTATION,
      recentSet,
      bodyAnimation,
    );
  }

  const interactionState: AnimationStateId =
    raw.interaction_state && STATE_SET.has(raw.interaction_state)
      ? (raw.interaction_state as AnimationStateId)
      : defaults.interactionState;

  const handPose: HandPoseId =
    raw.hand_pose && HAND_SET.has(raw.hand_pose)
      ? (raw.hand_pose as HandPoseId)
      : defaults.handPose;

  const speechLanguage: SpeechLanguage =
    raw.speech_language === 'ar-EG' ||
    raw.speech_language === 'ar' ||
    raw.speech_language === 'en' ||
    raw.speech_language === 'bilingual'
      ? raw.speech_language
      : inferredLang;

  const speechStyle: SpeechStyle =
    raw.speech_style === 'cheerful' ||
    raw.speech_style === 'calm' ||
    raw.speech_style === 'enthusiastic' ||
    raw.speech_style === 'thoughtful' ||
    raw.speech_style === 'encouraging' ||
    raw.speech_style === 'playful'
      ? raw.speech_style
      : defaults.speechStyle;

  const browLift =
    typeof raw.facial_cues?.browLift === 'number'
      ? Math.max(-1, Math.min(1, raw.facial_cues.browLift))
      : facialExpression === 'confused'
        ? -0.4
        : 0.36;

  const smile =
    typeof raw.facial_cues?.smile === 'number'
      ? Math.max(0, Math.min(1, raw.facial_cues.smile))
      : facialExpression === 'sad' || facialExpression === 'confused'
        ? 0.05
        : 0.55;

  const eyeGaze =
    raw.facial_cues?.eyeGaze === 'up_think' || raw.facial_cues?.eyeGaze === 'side_glance'
      ? raw.facial_cues.eyeGaze
      : facialExpression === 'thinking'
        ? 'up_think'
        : 'user';

  const earPerk =
    typeof raw.facial_cues?.earPerk === 'number'
      ? Math.max(0, Math.min(1, raw.facial_cues.earPerk))
      : bodyAnimation.includes('Monkey')
        ? 0.85
        : 0.3;

  const noseTwitch =
    typeof raw.facial_cues?.noseTwitch === 'number'
      ? Math.max(0, Math.min(1, raw.facial_cues.noseTwitch))
      : bodyAnimation.includes('Monkey')
        ? 0.45
        : 0.1;

  return {
    response_text: responseText,
    replyText: responseText,
    emotion: facialExpression,
    facial_expression: facialExpression,
    body_animation: bodyAnimation,
    gesture,
    secondary_animation: secondaryAnimation,
    interaction_state: interactionState,
    speech_language: speechLanguage,
    speech_style: speechStyle,
    lip_sync: raw.lip_sync !== false,
    primaryGesture: bodyAnimation,
    handPose,
    voiceStyle: raw.voice_style || `Warm, clear ${speechStyle} middle-school teacher voice`,
    facialCues: {
      browLift,
      smile,
      eyeGaze,
      earPerk,
      noseTwitch,
    },
  };
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '2mb' }));

  app.post('/api/perform', async (req, res) => {
    try {
      const body = (req.body ?? {}) as PerformRequestBody;
      const userMessage = (body.message ?? '').trim();
      if (!userMessage) {
        res.status(400).json({ error: 'Message is required.' });
        return;
      }

      const gradeLevel: GradeLevelId =
        body.gradeLevel === 'prep2' || body.gradeLevel === 'prep3' ? body.gradeLevel : 'prep1';
      const subject: SubjectId =
        body.subject && body.subject in SUBJECT_META ? body.subject : 'general';
      const recentAnimations = Array.isArray(body.recentAnimations) ? body.recentAnimations : [];

      const voiceName = body.voiceName || 'Kore';
      const characterName = body.characterName || 'Lumi';

      const historyText = (body.history ?? [])
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'Student' : characterName}: ${m.text}`)
        .join('\n');

      const promptText = historyText
        ? `Student grade: ${GRADE_META[gradeLevel].labelAr}\nSubject: ${SUBJECT_META[subject]}\nRecent animations to avoid repeating: ${recentAnimations.slice(0, 5).join(', ') || 'none'}\n\nRecent conversation:\n${historyText}\n\nStudent: ${userMessage}`
        : `Student grade: ${GRADE_META[gradeLevel].labelAr}\nSubject: ${SUBJECT_META[subject]}\nRecent animations to avoid repeating: ${recentAnimations.slice(0, 5).join(', ') || 'none'}\n\nStudent: ${userMessage}`;

      const animationCatalogPrompt = ANIMATION_LIBRARY_IDS.join(', ');

      const scriptConfig = {
        systemInstruction: [
          `You are ${characterName}, a smart, warm, interactive 3D educational companion & tutor for Egyptian middle-school students (${GRADE_META[gradeLevel].labelAr}), specializing in ${SUBJECT_META[subject]}.`,
          GRADE_META[gradeLevel].focus,
          'Language rule: Reply in clear, friendly Egyptian Arabic when the student writes in Arabic, or clear English when the student writes in English.',
          'Teaching style: Explain concepts simply step-by-step in 2 to 4 concise spoken sentences so TTS & lip-sync are natural. Praise correct answers warmly, gently guide mistakes without embarrassment, and optionally end with a short motivating check question.',
          '3D Performance Rules:',
          `- Select ONLY valid animation IDs from this exact 150-animation library: ${animationCatalogPrompt}`,
          `- Select facial_expression ONLY from: ${VALID_FACIAL_EXPRESSIONS.join(', ')}.`,
          '- Vary your body_animation, gesture, and secondary_animation naturally! Do NOT repeat recent animations.',
          '- During serious academic explanations, prefer calm pedagogical animations (Explain_OpenHands, Explain_Teacher, Explain_StepByStep, Explain_Count_One..Five, Point_AtBoard, Present_Lesson, Think_HandOnChin, Ask_Student).',
          '- Reserve Happy_Monkey / Monkey_Enhanced / Monkey_Jump for celebrating big wins, playful greetings, or when the student explicitly asks for the monkey move!',
        ].join('\n'),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            response_text: {
              type: Type.STRING,
              description: 'Clear spoken educational reply for the student.',
            },
            facial_expression: {
              type: Type.STRING,
              description: `One of: ${VALID_FACIAL_EXPRESSIONS.join(', ')}`,
            },
            body_animation: {
              type: Type.STRING,
              description: 'Primary animation ID from the 150-animation library.',
            },
            gesture: {
              type: Type.STRING,
              description: 'Supporting hand/arm gesture ID from the 150-animation library.',
            },
            secondary_animation: {
              type: Type.STRING,
              description: 'Follow-up transition animation ID from the 150-animation library.',
            },
            interaction_state: {
              type: Type.STRING,
              description: `One of: ${VALID_STATES.join(', ')}`,
            },
            speech_language: {
              type: Type.STRING,
              description: 'One of: ar-EG, ar, en, bilingual',
            },
            speech_style: {
              type: Type.STRING,
              description: 'One of: cheerful, calm, enthusiastic, thoughtful, encouraging, playful',
            },
            lip_sync: {
              type: Type.BOOLEAN,
              description: 'True when speaking out loud.',
            },
            hand_pose: {
              type: Type.STRING,
              description: `One of: ${VALID_HAND_POSES.join(', ')}`,
            },
            voice_style: {
              type: Type.STRING,
              description: 'Short English TTS delivery direction.',
            },
            facial_cues: {
              type: Type.OBJECT,
              properties: {
                browLift: { type: Type.NUMBER },
                smile: { type: Type.NUMBER },
                eyeGaze: { type: Type.STRING },
                earPerk: { type: Type.NUMBER },
                noseTwitch: { type: Type.NUMBER },
              },
            },
          },
          required: [
            'response_text',
            'facial_expression',
            'body_animation',
            'gesture',
            'secondary_animation',
            'interaction_state',
            'speech_language',
            'speech_style',
            'lip_sync',
            'hand_pose',
          ],
        },
      };

      let rawParsed: RawTutorOutput = {};
      let fallbackUsed = false;
      let fallbackReason: string | null = null;

      if (body.directSpeak) {
        const d = detectIntentDefaults(userMessage, recentAnimations);
        rawParsed = {
          response_text: userMessage,
          facial_expression: d.facialExpression,
          body_animation: d.bodyAnimation,
          gesture: d.gesture,
          secondary_animation: d.secondary,
          interaction_state: d.interactionState,
          speech_style: d.speechStyle,
          lip_sync: true,
          hand_pose: d.handPose,
        };
      } else {
        const ai = getGeminiClient();
        const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
          Promise.race([
            p,
            new Promise<T>((_, rej) =>
              setTimeout(() => rej(new Error(`Model timeout after ${ms}ms`)), ms),
            ),
          ]);

        try {
          const candidates = [
            { model: 'gemini-4-hydrogen', withThinking: true, timeout: 10000 },
            { model: 'gemini-3.5-flash-lite', withThinking: false, timeout: 10000 },
            { model: 'gemini-3.5-flash', withThinking: false, timeout: 12000 },
            { model: 'gemini-3.1-flash-lite', withThinking: false, timeout: 10000 },
          ];
          let scriptResponse: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
          let lastModelErr: unknown = null;

          for (const cand of candidates) {
            try {
              scriptResponse = await withTimeout(
                ai.models.generateContent({
                  model: cand.model,
                  contents: promptText,
                  config: cand.withThinking
                    ? {
                        ...scriptConfig,
                        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                      }
                    : scriptConfig,
                }),
                cand.timeout,
              );
              if (scriptResponse?.text) break;
            } catch (candErr) {
              lastModelErr = candErr;
              console.warn(`${cand.model} unavailable:`, formatGeminiErrorMessage(candErr));
            }
          }

          if (!scriptResponse?.text) {
            throw lastModelErr ?? new Error('All Gemini text models temporarily unavailable.');
          }

          const rawJson = (scriptResponse.text ?? '{}')
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '');
          rawParsed = JSON.parse(rawJson) as RawTutorOutput;
        } catch (modelErr) {
          fallbackReason = formatGeminiErrorMessage(modelErr);
          console.warn('Gemini tutor text fallback engaged:', fallbackReason);
          fallbackUsed = true;
          const d = detectIntentDefaults(userMessage, recentAnimations);
          const isAr = /[\u0600-\u06FF]/.test(userMessage);
          rawParsed = {
            response_text: isAr
              ? `سؤال ممتاز لطلاب ${GRADE_META[gradeLevel].labelAr}! خلينا نفكر فيه مع بعض خطوة بخطوة: حاول تحدد المعطيات الأساسية الأول، وأنا معاك نكمل الحل.`
              : `Great question! Let us break it down step by step for ${gradeLevel.toUpperCase()}: identify the key facts first, and tell me what step you want to try next!`,
            facial_expression: d.facialExpression,
            body_animation: d.bodyAnimation,
            gesture: d.gesture,
            secondary_animation: d.secondary,
            interaction_state: d.interactionState,
            speech_style: d.speechStyle,
            lip_sync: true,
            hand_pose: d.handPose,
          };
        }
      }

      const finalScript = validateAndSanitizeTutorOutput(
        rawParsed,
        userMessage,
        recentAnimations,
      );

      // 2. Synthesize spoken audio with Gemini TTS (if GEMINI_API_KEY is available)
      let audioBase64: string | null = null;
      let ttsWarning: string | null = null;

      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = getGeminiClient();
          const aiAlpha = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY,
            httpOptions: {
              apiVersion: 'v1alpha',
              headers: { 'User-Agent': 'aistudio-build' },
            },
          });

          const runTts = async (
            client: GoogleGenAI,
            ttsModel: string,
            useSpeechMeta: boolean,
            useSpeechConfig: boolean,
          ) => {
            const styleText = finalScript.voiceStyle;
            const part = useSpeechMeta
              ? { text: finalScript.response_text, speechMetadata: { style: styleText } }
              : { text: `Say in a ${styleText} tone: ${finalScript.response_text}` };
            const config: Record<string, unknown> = {
              responseModalities: ['AUDIO'],
            };
            if (useSpeechConfig) {
              config.speechConfig = {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              };
            }
            const ttsResponse = await client.models.generateContent({
              model: ttsModel,
              contents: [{ role: 'user', parts: [part] }],
              config,
            });
            const inline = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData;
            if (!inline?.data) {
              throw new Error('TTS returned empty audio.');
            }
            return ensureWavBase64(inline.data, inline.mimeType);
          };

          const ttsAttempts: Array<() => Promise<string>> = [
            () => runTts(aiAlpha, 'gemini-3.8-flash-lite-tts', true, true),
            () => runTts(ai, 'gemini-3.8-flash-lite-tts', false, false),
            () => runTts(aiAlpha, 'gemini-3.8-flash-tts', true, true),
            () => runTts(ai, 'gemini-3.8-flash-tts', false, false),
          ];

          let lastTtsErr: unknown = null;
          for (const attempt of ttsAttempts) {
            try {
              audioBase64 = await attempt();
              if (audioBase64) break;
            } catch (err) {
              lastTtsErr = err;
            }
          }
          if (!audioBase64 && lastTtsErr) {
            ttsWarning = formatGeminiErrorMessage(lastTtsErr);
          }
        } catch (ttsSetupErr) {
          ttsWarning = formatGeminiErrorMessage(ttsSetupErr);
        }
      } else {
        ttsWarning = 'GEMINI_API_KEY not configured for TTS';
      }

      res.json({
        replyText: finalScript.replyText,
        response_text: finalScript.response_text,
        emotion: finalScript.emotion,
        facial_expression: finalScript.facial_expression,
        body_animation: finalScript.body_animation,
        gesture: finalScript.gesture,
        secondary_animation: finalScript.secondary_animation,
        interaction_state: finalScript.interaction_state,
        speech_language: finalScript.speech_language,
        speech_style: finalScript.speech_style,
        lip_sync: finalScript.lip_sync,
        primaryGesture: finalScript.primaryGesture,
        handPose: finalScript.handPose,
        facialCues: finalScript.facialCues,
        audioBase64,
        audioMimeType: audioBase64 ? 'audio/wav' : null,
        ttsWarning,
        fallbackUsed,
        fallbackReason,
      });
    } catch (err) {
      console.error('/api/perform error:', err);
      res.status(500).json({ error: formatGeminiErrorMessage(err) });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { server: httpServer },
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Lumi 3D Rigging Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
