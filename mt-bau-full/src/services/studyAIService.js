/**
 * Study AI Service - AI-Powered Study Tools for Makanak Platform
 * Uses Groq API (same as Nashmi) to generate study materials
 */
import Groq from "groq-sdk";

const apiKey = (import.meta.env.VITE_GROQ_API_KEY || "").trim();

const groq = apiKey
    ? new Groq({ apiKey, dangerouslyAllowBrowser: true })
    : null;

const MODEL = "llama-3.3-70b-versatile";

// ─── Prompt Builders ───────────────────────────────────────────────────────

const buildQuizPrompt = (text, lang, count, type) => {
    const langNote = lang === 'ar'
        ? 'اكتب الأسئلة والإجابات بالاللغة العربية الفصحى.'
        : 'Write all questions and answers in English.';

    const typeInstructions = {
        mcq: lang === 'ar'
            ? `أنشئ ${count} سؤال اختيار متعدد (MCQ). لكل سؤال: نص السؤال، 4 يارات (A/B/C/D)، والإجاب الصحيح.`
            : `Generate ${count} multiple choice questions (MCQ). For each: question text, 4 options (A/B/C/D), correct answer.`,
        tf: lang === 'ar'
            ? `أنشئ ${count} سؤال صح أو خطأ. لكل سؤال: عبار وإجاب (صح/خطأ) مع شرح قصير.`
            : `Generate ${count} True/False questions. For each: statement, answer (True/False), brief explanation.`,
        essay: lang === 'ar'
            ? `أنشئ ${count} سؤال مقالي. لكل سؤال: نص السؤال ونموذج إجاب كامل.`
            : `Generate ${count} essay questions. For each: question text and a complete model answer.`,
        mixed: lang === 'ar'
            ? `أنشئ ${count} سؤال متنوع (مزيج من MCQ وصح/خطأ ومقالي). وضح نوع كل سؤال.`
            : `Generate ${count} mixed questions (mix of MCQ, True/False, Essay). Label each type.`,
    };

    return `${langNote}

${typeInstructions[type]}

أرجع النتيج بصيغ JSON فقط بدون أي نص ارجه. الصيغ:
{
  "questions": [
    {
      "id": 1,
      "type": "mcq" | "tf" | "essay",
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],  // فقط للـ MCQ
      "answer": "...",
      "explanation": "..."
    }
  ]
}

النص المدروس:
"""
${text.slice(0, 6000)}
"""`;
};

const buildSummaryPrompt = (text, lang) => {
    if (lang === 'ar') {
        return `أنت بير أكاديمي متخصص في تلخيص المواد الجامعي.
قم بتليص النص التالي بالاللغة العربية الفصحى بشكل منظم وشامل.

أرجع النتيج بصيغ JSON فقط:
{
  "title": "عنوان مناسب للماد",
  "overview": "فقر تمهيدي قصير (2-3 جمل)",
  "keyPoints": ["نقط رئيسي 1", "نقط رئيسي 2", ...],
  "definitions": [{"term": "المصطلح", "definition": "التعريف"}, ...],
  "conclusion": "لاص تامي"
}

النص:
"""
${text.slice(0, 6000)}
"""`;
    } else {
        return `You are an academic expert specializing in university material summarization.
Summarize the following text in English in a structured and comprehensive way.

Return the result as JSON only:
{
  "title": "Appropriate title for the material",
  "overview": "Brief introductory paragraph (2-3 sentences)",
  "keyPoints": ["Key point 1", "Key point 2", ...],
  "definitions": [{"term": "Term", "definition": "Definition"}, ...],
  "conclusion": "Final summary"
}

Text:
"""
${text.slice(0, 6000)}
"""`;
    }
};

const buildMindMapPrompt = (text, lang) => {
    if (lang === 'ar') {
        return `أنت بير في إنشاء المططات الذهني للمواد الجامعي.
أنشئ مططاً ذهنياً منظماً للنص التالي بالاللغة العربية.

أرجع النتيج بصيغ JSON فقط:
{
  "root": "الموضوع الرئيسي",
  "branches": [
    {
      "title": "الفرع الرئيسي 1",
      "children": ["تفصيل 1", "تفصيل 2", "تفصيل 3"]
    },
    {
      "title": "الفرع الرئيسي 2",
      "children": ["تفصيل 1", "تفصيل 2"]
    }
  ]
}

النص:
"""
${text.slice(0, 6000)}
"""`;
    } else {
        return `You are an expert at creating mind maps for university subjects.
Create an organized mind map for the following text in English.

Return the result as JSON only:
{
  "root": "Main Topic",
  "branches": [
    {
      "title": "Main Branch 1",
      "children": ["Detail 1", "Detail 2", "Detail 3"]
    },
    {
      "title": "Main Branch 2",
      "children": ["Detail 1", "Detail 2"]
    }
  ]
}

Text:
"""
${text.slice(0, 6000)}
"""`;
    }
};

const buildStudyPlanPrompt = (text, lang) => {
    if (lang === 'ar') {
        return `أنت مرشد أكاديمي بير في تطيط الدراس الجامعي.
بناءً على النص التالي، أنشئ خطة دراسية مصص وعملي بالاللغة العربية.

أرجع النتيج بصيغ JSON فقط:
{
  "subject": "اسم المادة أو الموضوع",
  "totalDays": عدد الأيام المقترح,
  "difficulty": "سهل" | "متوسط" | "صعب",
  "days": [
    {
      "day": 1,
      "title": "عنوان اليوم",
      "topics": ["موضوع 1", "موضوع 2"],
      "duration": "مد الدراس المقترح",
      "tips": "نصيح اص لهذا اليوم"
    }
  ],
  "generalTips": ["نصيح عام 1", "نصيح عام 2", "نصيح عام 3"],
  "importantTopics": ["أهم موضوع 1", "أهم موضوع 2"]
}

النص:
"""
${text.slice(0, 6000)}
"""`;
    } else {
        return `You are an academic advisor expert in university study planning.
Based on the following text, create a customized and practical study plan in English.

Return the result as JSON only:
{
  "subject": "Subject or topic name",
  "totalDays": suggested number of days,
  "difficulty": "Easy" | "Medium" | "Hard",
  "days": [
    {
      "day": 1,
      "title": "Day title",
      "topics": ["Topic 1", "Topic 2"],
      "duration": "Suggested study duration",
      "tips": "Specific tip for this day"
    }
  ],
  "generalTips": ["General tip 1", "General tip 2", "General tip 3"],
  "importantTopics": ["Most important topic 1", "Most important topic 2"]
}

Text:
"""
${text.slice(0, 6000)}
"""`;
    }
};

// ─── Main Generator Function ───────────────────────────────────────────────

export const generateStudyMaterial = async ({ text, language, outputType, questionCount = 10, questionType = 'mcq' }) => {
    if (!groq) {
        return { error: 'API_KEY_MISSING' };
    }
    if (!text || text.trim().length < 50) {
        return { error: 'TEXT_TOO_SHORT' };
    }

    let prompt = '';
    switch (outputType) {
        case 'quiz':    prompt = buildQuizPrompt(text, language, questionCount, questionType); break;
        case 'summary': prompt = buildSummaryPrompt(text, language); break;
        case 'mindmap': prompt = buildMindMapPrompt(text, language); break;
        case 'plan':    prompt = buildStudyPlanPrompt(text, language); break;
        default: return { error: 'INVALID_TYPE' };
    }

    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('TIMEOUT')), 30000)
        );

        const request = groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: MODEL,
            temperature: 0.4,
            max_tokens: 4000,
            response_format: { type: 'json_object' },
        });

        const completion = await Promise.race([request, timeout]);
        const raw = completion.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);
        return { success: true, data: parsed, type: outputType };

    } catch (err) {
        console.error('StudyAI error:', err);
        if (err.message === 'TIMEOUT') return { error: 'TIMEOUT' };
        return { error: 'GENERATION_FAILED', details: err.message };
    }
};
