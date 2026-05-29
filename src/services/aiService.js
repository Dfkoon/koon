/**
 * Nashmi AI Service - Enhanced for Makanak Platform
 */
import Groq from "groq-sdk";

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
   - Digital Forensics (تحقيقات جنائية رقمية): Focuses on evidence recovery ( ت ج 440, ت ج 347).
   - VR & AR (واقع افتراضي): Focuses on 3D modeling, game design (وام 111, وام 321).
   - Data Science (علم بيانات): Focuses on big data, machine learning (ع ب 111, ع ب 241).
   - AI & Robotics (الذكاء الاصطناعي والروبوتات): Focuses on neural networks and robotics.

2. KEY SITE SECTIONS:
   - [Materials](/materials): Summaries, past papers (سنوات), and study files for all faculty subjects.
   - [Academic Plans](/plans): Detailed course trees (شجرة المواد) for all AI faculty majors.
   - [Grading](/grading): Dual GPA calculator (New BAU 4.0 system and Old system).
   - [Quiz](/quiz): Interactive test bank for subjects like Digital Logic, IoT, and more.
   - [Exchange](/exchange): Market for students to swap books and academic resources.
   - [News](/news): Latest university announcements and upcoming events.
   - [Calendar](/calendar): BAU Academic Calendar with exam dates and holidays.

3. IMPORTANT STUDENT LINKS:
   - Student Portal: https://app.bau.edu.jo/ (Registration, Marks).
   - E-Learning: https://elearning.bau.edu.jo/ (Lectures, Quizzes).
   - GitHub Student Pack: Free professional dev tools.
   - Coursera x BAU: Free certified courses for students.

CORE DIRECTIVES:
- Use advanced Chain-of-Thought reasoning for complex questions.
- Dialect: Refined White Jordanian (لهجة بيضاء مهذبة).
- Tone: Highly proactive, welcoming (أهلاً يا نشمي!), and deeply encouraging.
- Precision: Always mention specific site pages using Markdown links.
- Context: If the user is on a specific page, prioritize information related to that page.
- Credit: Always honor the vision of Hussien Koon and the "Makanak" team.
`;

const MODELS = {
    ULTRA: "llama-3.3-70b-versatile", // Most Advanced
    STABLE: "llama-3.1-8b-instant"    // Most Reliable
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

        return { success: true, text: chatCompletion.choices[0]?.message?.content || "" };

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
                ? "برضو نشمي مارد؟ يمكن النت ضعيف.. جرب ابعث مرة ثانية!"
                : "نشمي عم بحدث معلوماته حالياً.. استنى ثواني وجرب كمان مرة! 🤖",
            messageEn: error.message === "AI_TIMEOUT"
                ? "Nashmi is taking too long to respond. Please check your connection and try again."
                : "Nashmi is updating its knowledge.. please wait seconds and try again!"
        };
    }
};
