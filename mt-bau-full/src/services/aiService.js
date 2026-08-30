/**
 * Nashmi AI Service - Enhanced for Makanak Platform
 */
import Groq from "groq-sdk";
import { collection, addDoc } from 'firebase/firestore';
import { serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

const apiKey = (import.meta.env.VITE_GROQ_API_KEY || "").trim();

// Only initialize if API key is present to avoid crashes
if (!apiKey) {
    console.warn("Nashmi AI: VITE_GROQ_API_KEY is missing from .env");
} else {
    console.log("Nashmi AI: API Key found (trimmed), length:", apiKey.length);
}

const groq = apiKey ? new Groq({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true // Required for client-side usage, though server-side is safer
}) : null;

/**
 * Nashmi Persona Definition
 * This defines how the AI should behave across the site.
 */
const NASHMI_ULTRA_PROMPT = `
You are "Nashmi Ultra" (نشمي ألترا), the absolute most advanced AI academic advisor for the "Makanak" (مكانك) platform.
You represent the cutting edge of student support at Al-Balqa Applied University (BAU) - جامعة البلقاء التطبيقية.

IDENTITY & LOCATION:
- Location: Kingdom of Jordan (الأردن), Salt city (السلط).
- University: Al-Balqa Applied University (BAU) - جامعة البلقاء التطبيقية.
- Campus: Main Campus (Salt) and AI Faculty.
- Project: Makanak (مكانك) - Created by student Hussien Koon (كلية الذكاء الاصطناعي).
- Goal: Serve as a 24/7 expert mentor, developer, and friend to students.

KNOWLEDGE BASE (Meticulous Details):
1. AI FACULTY MAJORS:
   - Cyber Security (أمن المعلومات والفضاء الإلكتروني): Focuses on encryption, network security, and digital forensics.
   - Digital Forensics (تحقيقات جنائي رقمي): Focuses on evidence recovery ( ت ج 440, ت ج 347).
   - VR & AR (واقع افتراضي): Focuses on 3D modeling, game design (وام 111, وام 321).
   - Data Science (علم بيانات): Focuses on big data, machine learning (ع ب 111, ع ب 241).
   - AI & Robotics (الذكاء الاصطناعي والروبوتات): Focuses on neural networks and robotics.

2. KEY SITE SECTIONS:
   - [Materials](/materials): Summaries, past papers (سنوات), and study files for all faculty subjects.
   - [Academic Plans](/plans): Detailed course trees (شجر المواد) for all AI faculty majors.
   - [Grading](/grading): Dual GPA calculator (New BAU 4.0 system and Old system).
   - [Quiz](/quiz): Interactive test bank for subjects like Digital Logic, IoT, and more.
   - [Exchange](/exchange): Market for students to swap books and academic resources.
   - [News](/news): Latest university announcements and upcoming events.
   - [Calendar](/calendar): BAU Academic Calendar with exam dates and holidays.
   - [Request Services](#request-services): Section on homepage where students can request custom course summaries, question creation, or project ideas from the team.

3. IMPORTANT STUDENT LINKS:
   - Student Portal: https://app.bau.edu.jo/ (Registration, Marks).
   - E-Learning: https://elearning.bau.edu.jo/ (Lectures, Quizzes).
   - GitHub Student Pack: Free professional dev tools.
   - Coursera x BAU: Free certified courses for students.

CORE DIRECTIVES:
- Use advanced Chain-of-Thought reasoning for complex questions.
- Dialect: Refined White Jordanian (لهج بيضاء مهذب).
- Tone: Highly proactive, welcoming (أهلاً يا نشمي!), and deeply encouraging.
- Precision: Always mention specific site pages using Markdown links.
- Missing Material / Request Directive: If a student asks for a study material, summary, book, questions, or project help that is NOT available on the site, politely inform them and explicitly direct them to request it directly from the Makanak team via the [اطلب ما تحتاجه](#request-services) section on the homepage!
- Context: If the user is on a specific page, prioritize information related to that page.
- Credit: Always honor the vision of Hussien Koon and the "Makanak" team.
`;

const MODELS = {
    ULTRA: "llama-3.3-70b-versatile", // Most Advanced
    STABLE: "llama-3.1-8b-instant"    // Most Reliable
};

/**
 * Log chat to Firestore for admin review
 */
const logChatToFirestore = async (userMsg, nashmiResp, context, model) => {
    try {
        await addDoc(collection(db, 'nashmi_logs'), {
            userMessage: userMsg,
            nashmiResponse: nashmiResp,
            pageContext: context || 'Home / Global',
            model: model,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Failed to log chat:", e);
    }
};

export const chatWithNashmi = async (userMessage, pageContext = "", history = [], retryCount = 0, useModel = MODELS.ULTRA) => {
    if (!groq) {
        console.error("Nashmi AI Service: Groq not initialized. Check VITE_GROQ_API_KEY.");
        return { error: "API_KEY_MISSING", messageAr: "عذراً، نظام الذكاء غير مفعل حالياً. جرب التواصل مع الدعم الفني!", messageEn: "AI Service is currently disabled. Please contact support." };
    }

    // Wrap the request in a timeout to prevent infinite hanging
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AI_TIMEOUT")), 15000) // 15s timeout
    );

    try {
        const messages = [
            { role: "system", content: NASHMI_ULTRA_PROMPT + (pageContext ? `\nContext: ${pageContext}` : "") },
            ...history.slice(-4).map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
            })),
            { role: "user", content: userMessage }
        ];

        const chatCompletion = await Promise.race([
            groq.chat.completions.create({
                messages: messages,
                model: useModel,
                temperature: 0.6,
                max_tokens: 600,
            }),
            timeoutPromise
        ]);

        const responseText = chatCompletion.choices[0]?.message?.content || "";
        
        // ASYNC LOGGING (don't block the UI)
        logChatToFirestore(userMessage, responseText, pageContext, useModel);

        return { success: true, text: responseText };

    } catch (error) {
        console.warn(`Nashmi Attempt (${useModel}) failed:`, error.message);

        // SILENT FALLBACK: If Ultra fails or times out, try Stable immediately
        if (useModel === MODELS.ULTRA) {
            console.log("Switching to STABLE fallback for reliability...");
            return chatWithNashmi(userMessage, pageContext, history, 0, MODELS.STABLE);
        }

        // Final retry logic for Stable model
        if (retryCount < 1) {
            console.log(`Retrying STABLE (Attempt ${retryCount + 1})...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            return chatWithNashmi(userMessage, pageContext, history, retryCount + 1, MODELS.STABLE);
        }

        return {
            success: false,
            error: error.message,
            messageAr: error.message === "AI_TIMEOUT"
                ? "برضو نشمي مارد؟ يمكن النت ضعيف.. جرب ابعث مر ثاني!"
                : "نشمي عم بحدث معلوماته حالياً.. استنى ثواني وجرب كمان مر! 🤖",
            messageEn: error.message === "AI_TIMEOUT"
                ? "Nashmi is taking too long to respond. Please check your connection and try again."
                : "Nashmi is updating its knowledge.. please wait seconds and try again!"
        };
    }
};

/**
 * Grade an essay/short-answer question using AI semantic similarity.
 * Returns { score: 0-1, feedback: string (Arabic), feedbackEn: string (English) }
 */
// Smart Arabic & English text normalization helper
const cleanText = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/\uFFFD/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u064B-\u0652]/g, '') // remove diacritics
        .replace(/[.,/#!$%^&*;:{}=\-_`~()؟?،"']/g, ' ') // remove punctuation
        .replace(/\s+/g, ' ')
        .trim();
};

export const gradeEssayAnswer = async (studentAnswer, modelAnswer, questionText = '', maxMarks = 1) => {
    if (!studentAnswer || !studentAnswer.trim()) {
        return { score: 0, earnedMarks: 0, feedback: 'لم يتم كتاب إجاب.', feedbackEn: 'No answer provided.' };
    }
    if (!modelAnswer || !modelAnswer.trim()) {
        return { score: 1, earnedMarks: maxMarks, feedback: 'إجاب مقبول ✅', feedbackEn: 'Answer accepted ✅' };
    }

    const cleanStud = cleanText(studentAnswer);
    const cleanMod = cleanText(modelAnswer);
    const cleanQ = cleanText(questionText);

    // Fast local concept evaluation (works offline and online)
    const evaluateLocally = () => {
        if (cleanStud === cleanMod) {
            return { score: 1, earnedMarks: maxMarks, feedback: 'إجاب صحيح ونموذجي ✅', feedbackEn: 'Perfect answer ✅' };
        }

        // Stopwords to ignore
        const stopWords = new Set(['من', 'في', 'على', 'عن', 'مع', 'هو', 'هي', 'التي', 'الذي', 'ان', 'او', 'مثل', 'هذا', 'هذه', 'كان', 'يكون', 'انها', 'انه', 'تكون', 'is', 'are', 'the', 'a', 'an', 'and', 'or', 'in', 'of', 'to', 'for']);
        const studWords = cleanStud.split(' ').filter(w => w.length >= 2 && !stopWords.has(w));
        const modWords = cleanMod.split(' ').filter(w => w.length >= 2 && !stopWords.has(w));

        if (studWords.length === 0) {
            return { score: 0, earnedMarks: 0, feedback: 'إجاب غير مكتمل ❌', feedbackEn: 'Incomplete answer ❌' };
        }

        // Count keyword matches (stemmed prefix matching for Arabic words)
        let matches = 0;
        studWords.forEach(sWord => {
            const hasMatch = modWords.some(mWord => {
                if (sWord === mWord) return true;
                // Substring prefix/suffix matching (e.g. محاضرات vs المحاضرات vs محاضر)
                if (sWord.length >= 4 && mWord.length >= 4) {
                    if (sWord.includes(mWord) || mWord.includes(sWord)) return true;
                    // Common prefix match (first 4 letters)
                    if (sWord.slice(0, 4) === mWord.slice(0, 4)) return true;
                }
                return false;
            });
            if (hasMatch) matches++;
        });

        const overlapRatio = matches / Math.max(1, Math.min(studWords.length, 5));

        // Generous concept grading thresholds
        if (matches >= 2 || overlapRatio >= 0.4 || (studWords.length >= 2 && matches >= 1)) {
            return {
                score: 1,
                earnedMarks: maxMarks,
                feedback: 'إجاب صحيح ومقبول، تعبر عن الفكر المطلوب ✅',
                feedbackEn: 'Correct and acceptable answer conveying the required concept ✅'
            };
        } else if (matches >= 1) {
            const earned = +(maxMarks * 0.85).toFixed(2);
            return {
                score: 0.85,
                earnedMarks: earned,
                feedback: 'إجاب متقارب وتحتوي على الفكر الأساسي 👍',
                feedbackEn: 'Close answer containing the main concept 👍'
            };
        }

        // Fallback for short answers matching question context
        const qWords = cleanQ.split(' ').filter(w => w.length >= 3 && !stopWords.has(w));
        const qMatches = studWords.filter(w => qWords.some(qw => qw.includes(w) || w.includes(qw))).length;
        if (qMatches >= 1 && studWords.length >= 2) {
            const earned = +(maxMarks * 0.75).toFixed(2);
            return {
                score: 0.75,
                earnedMarks: earned,
                feedback: 'إجاب متصل بموضوع السؤال ومقبول 👍',
                feedbackEn: 'Relevant and acceptable answer 👍'
            };
        }

        return {
            score: 0.4,
            earnedMarks: +(maxMarks * 0.4).toFixed(2),
            feedback: 'إجاب جزئي — يرجى مراجع الإجاب النموذجي للفائد.',
            feedbackEn: 'Partial answer — check model answer for reference.'
        };
    };

    if (!groq) {
        return evaluateLocally();
    }

    const prompt = `You are a very encouraging and generous academic professor grading an Arabic/English student answer.
    
Question: "${questionText}"
Model Answer: "${modelAnswer}"
Student Answer: "${studentAnswer}"

GRADING DIRECTIVES:
1. Be EXTREMELY generous and encouraging!
2. If the student's answer expresses the same concept, core idea, purpose, or a valid real-world example (e.g. student mentions "محاضرات عن بعد" or "وسيل تواصل" for a question about video conferencing), award 9/10 or 10/10 FULL MARKS!
3. Do NOT penalize spelling errors, dialect variations, different phrasing, or brevity if the main idea is correct.
4. Award at least 7/10 or 8/10 if the answer contains any correct relevant point or keyword.
5. Only give 0 if the answer is completely blank, gibberish, or 100% wrong.

Respond ONLY with this JSON format:
{"score": <integer 0-10>, "feedback_ar": "<تشجيع وملاحظ إيجابي ملص بالعربي>", "feedback_en": "<positive brief feedback in English>"}`;

    try {
        const completion = await Promise.race([
            groq.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: MODELS.STABLE,
                temperature: 0.1,
                max_tokens: 150,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 10000))
        ]);

        const raw = completion.choices[0]?.message?.content || '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Invalid JSON');
        const parsed = JSON.parse(jsonMatch[0]);
        const numScore = Number(parsed.score);
        const normalized = isNaN(numScore) ? 0.8 : Math.max(0, Math.min(10, numScore)) / 10;
        
        return {
            score: normalized,
            earnedMarks: +(normalized * maxMarks).toFixed(2),
            feedback: parsed.feedback_ar || 'إجاب صحيح ومفصل ✅',
            feedbackEn: parsed.feedback_en || 'Correct answer ✅',
        };
    } catch (e) {
        console.warn('AI API timeout or error, using local concept grader:', e.message);
        return evaluateLocally();
    }
};

