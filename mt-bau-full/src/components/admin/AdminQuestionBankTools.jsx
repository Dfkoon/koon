import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../config/firebase';
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  writeBatch, serverTimestamp, query, where, orderBy, updateDoc
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import Groq from 'groq-sdk';
import './AdminQuestionBankTools.css';

// ── Common Arabic Spelling & Grammar Auto-Fix Rules ──
function cleanArabicText(str) {
  if (!str) return '';
  let res = str;
  // Fix double spaces
  res = res.replace(/[ \t]+/g, ' ');
  // Fix comma spacing
  res = res.replace(/(\S)\s*،\s*/g, '$1، ');
  // Fix question mark spacing
  res = res.replace(/\s*؟/g, '؟');
  // Fix colon spacing
  res = res.replace(/(\S)\s*:\s*/g, '$1: ');
  // Fix common typo: ه / ة at the end of common words
  res = res.replace(/\bالجامعه\b/g, 'الجامعة')
           .replace(/\bالدراسيه\b/g, 'الدراسية')
           .replace(/\bالخطه\b/g, 'الخطة')
           .replace(/\bالماده\b/g, 'المادة')
           .replace(/\bالاجابه\b/g, 'الإجابة')
           .replace(/\bالصحيحه\b/g, 'الصحيحة')
           .replace(/\bالاسئله\b/g, 'الأسئلة')
           .replace(/\bالامتحان\b/g, 'الامتحان')
           .replace(/\bالكليه\b/g, 'الكلية')
           .replace(/\bطالبه\b/g, 'طالبة')
           .replace(/\bمساعده\b/g, 'مساعدة');
  // Normalize Hamzas in common roots
  res = res.replace(/\bانشئ\b/g, 'أنشئ')
           .replace(/\bاكتب\b/g, 'اكتب')
           .replace(/\bاختر\b/g, 'اختر')
           .replace(/\bاي\b/g, 'أي')
           .replace(/\bاين\b/g, 'أين')
           .replace(/\bاذا\b/g, 'إذا')
           .replace(/\bاو\b/g, 'أو')
           .replace(/\bان\b/g, 'أن')
           .replace(/\bالى\b/g, 'إلى');
  return res.trim();
}

// ── Levenshtein Distance & Similarity Calculation ──
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.trim().toLowerCase().replace(/[^\w\u0621-\u064A]/g, '');
  const s2 = str2.trim().toLowerCase().replace(/[^\w\u0621-\u064A]/g, '');
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const track = Array(s2.length + 1).fill(null).map(() =>
    Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator,
      );
    }
  }
  const distance = track[s2.length][s1.length];
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - distance / maxLen;
}

// ── Robust Regex Fallback Parser for Bulk Text ──
function parseQuestionsRegex(rawText) {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const questions = [];
  let currentQ = null;

  const qStartRegex = /^(?:(\d+)[\.\-\)]\s*|(?:س|سؤال|Q|Question)\s*(\d+)?[\:\.\-\)]\s*)(.+)/i;
  const optRegex = /^(?:([A-Da-dأ-د١-٤\d])[\.\-\)\:]\s*|\(([A-Da-dأ-د١-٤\d])\)\s*)(.+)/;
  const ansRegex = /^(?:(?:الجواب|الإجابة|الاجابة|إجابة|اجابة|الحل|Ans|Answer|Correct|Key)[\s\:\-\=]+)([A-Da-dأ-د١-٤\d\w\u0621-\u064A\s]+)/i;
  const expRegex = /^(?:(?:الشرح|التوضيح|التفسير|تفسير|Explanation|Reason)[\s\:\-\=]+)(.+)/i;

  const pushCurrent = () => {
    if (currentQ && (currentQ.questionAr || currentQ.questionEn)) {
      if (!currentQ.options || currentQ.options.length === 0) {
        // Detect True/False if no options
        const qText = (currentQ.questionAr || currentQ.questionEn).toLowerCase();
        if (qText.includes('صح') || qText.includes('خطأ') || qText.includes('true') || qText.includes('false')) {
          currentQ.type = 'true_false';
          currentQ.options = ['صح', 'خطأ'];
        }
      }
      questions.push(currentQ);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if question start
    const qMatch = line.match(qStartRegex);
    // Check answer line
    const ansMatch = line.match(ansRegex);
    // Check explanation line
    const expMatch = line.match(expRegex);
    // Check option line
    const optMatch = line.match(optRegex);

    if (ansMatch && currentQ) {
      const rawAns = ansMatch[1].trim().toUpperCase();
      // Map letter or number to option index or text
      let matchedIdx = -1;
      if (['A', 'أ', '1', '١'].includes(rawAns)) matchedIdx = 0;
      else if (['B', 'ب', '2', '٢'].includes(rawAns)) matchedIdx = 1;
      else if (['C', 'ج', '3', '٣'].includes(rawAns)) matchedIdx = 2;
      else if (['D', 'د', '4', '٤'].includes(rawAns)) matchedIdx = 3;

      if (matchedIdx !== -1 && currentQ.options[matchedIdx]) {
        currentQ.correctAnswer = currentQ.options[matchedIdx];
      } else {
        // Try matching option text
        const found = currentQ.options.find(o => o.toLowerCase().includes(rawAns.toLowerCase()));
        currentQ.correctAnswer = found || rawAns;
      }
      continue;
    }

    if (expMatch && currentQ) {
      currentQ.explanation = expMatch[1].trim();
      continue;
    }

    if (qMatch) {
      pushCurrent();
      const qText = qMatch[3].trim();
      const isArabic = /[\u0600-\u06FF]/.test(qText);
      currentQ = {
        id: `bulk_${Date.now()}_${questions.length + 1}`,
        type: 'mcq',
        questionAr: isArabic ? qText : '',
        questionEn: isArabic ? '' : qText,
        options: [],
        correctAnswer: '',
        marks: 1,
        explanation: '',
        selected: true
      };
      continue;
    }

    if (optMatch && currentQ) {
      const optText = optMatch[3].trim();
      currentQ.options.push(optText);
      continue;
    }

    // Append to current question text or options
    if (currentQ) {
      if (currentQ.options.length === 0) {
        if (currentQ.questionAr) currentQ.questionAr += ' ' + line;
        else if (currentQ.questionEn) currentQ.questionEn += ' ' + line;
      }
    } else {
      // Start question even if no number
      const isArabic = /[\u0600-\u06FF]/.test(line);
      currentQ = {
        id: `bulk_${Date.now()}_${questions.length + 1}`,
        type: 'mcq',
        questionAr: isArabic ? line : '',
        questionEn: isArabic ? '' : line,
        options: [],
        correctAnswer: '',
        marks: 1,
        explanation: '',
        selected: true
      };
    }
  }

  pushCurrent();
  return questions;
}

export default function AdminQuestionBankTools({
  allSubjects = [],
  allParts = [],
  selectedSubjectId = '',
  selectedPartId = '',
  onClose = () => {},
  onQuestionsImported = () => {},
  isAr = true
}) {
  const [activeTab, setActiveTab] = useState('importer'); // 'importer' | 'auditor'

  // ── Target Selection ──
  const [targetSubjectId, setTargetSubjectId] = useState(selectedSubjectId || (allSubjects[0]?.id || ''));
  const [targetPartId, setTargetPartId] = useState(selectedPartId || '');

  // Filter parts based on targetSubjectId
  const availableParts = useMemo(() => {
    return allParts.filter(p => !targetSubjectId || p.subjectId === targetSubjectId || p.category === targetSubjectId);
  }, [allParts, targetSubjectId]);

  useEffect(() => {
    if (availableParts.length > 0 && !availableParts.some(p => p.id === targetPartId)) {
      setTargetPartId(availableParts[0].id);
    }
  }, [availableParts, targetPartId]);

  // ════════════════════════════════════════════════════════════════════════════
  // TAB 1: BULK AI IMPORTER STATE
  // ════════════════════════════════════════════════════════════════════════════
  const [rawText, setRawText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);

  // Parse using Groq AI
  const handleParseWithAI = async () => {
    if (!rawText.trim()) {
      toast.error(isAr ? 'يرجى لصق نص الأسئلة أولاً' : 'Please paste question text first');
      return;
    }

    setIsParsing(true);
    const apiKey = (import.meta.env.VITE_GROQ_API_KEY || '').trim();

    if (!apiKey) {
      // Fallback directly to regex parser
      toast(isAr ? 'مفتاح الذكاء غير متوفر — جاري التحليل الذكي عبر المحلل الداخلي...' : 'API key missing — parsing with regex engine...');
      const results = parseQuestionsRegex(rawText);
      setParsedQuestions(results);
      setIsParsing(false);
      if (results.length === 0) {
        toast.error(isAr ? 'لم يتم العثور على أسئلة في النص' : 'No questions found in text');
      } else {
        toast.success(isAr ? `تم استخراج ${results.length} سؤال بنجاح!` : `Successfully parsed ${results.length} questions!`);
      }
      return;
    }

    try {
      const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
      const prompt = `You are an expert exam parser. Parse the following raw text into a strict JSON array of quiz questions for a university exam bank.
Format requirements:
- Each item must have:
  - "questionAr": Arabic question text (if present)
  - "questionEn": English question text (if present or translated)
  - "type": "mcq" | "true_false" | "short_answer"
  - "options": array of 2 to 4 choices strings (e.g. ["A", "B", "C", "D"] or Arabic strings). For true_false, use ["صح", "خطأ"] or ["True", "False"].
  - "correctAnswer": exact string of the correct choice from options array
  - "marks": number (default 1)
  - "explanation": brief explanation or rationale (if present)

Return ONLY valid JSON matching this schema:
{
  "questions": [
    {
      "questionAr": "...",
      "questionEn": "...",
      "type": "mcq",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": "...",
      "marks": 1,
      "explanation": "..."
    }
  ]
}

Raw text to parse:
"""
${rawText.slice(0, 15000)}
"""`;

      const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const content = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      const list = (parsed.questions || []).map((q, idx) => ({
        id: `bulk_${Date.now()}_${idx + 1}`,
        type: q.type || 'mcq',
        questionAr: q.questionAr || '',
        questionEn: q.questionEn || '',
        options: Array.isArray(q.options) ? q.options : [],
        correctAnswer: q.correctAnswer || (q.options?.[0] || ''),
        marks: Number(q.marks) || 1,
        explanation: q.explanation || '',
        selected: true
      }));

      if (list.length === 0) {
        throw new Error('AI returned 0 questions');
      }

      setParsedQuestions(list);
      toast.success(isAr ? ` تم استخراج ${list.length} سؤال بالذكاء الاصطناعي!` : ` Parsed ${list.length} questions with AI!`);
    } catch (err) {
      console.warn('Groq AI parsing fallback to regex:', err);
      toast(isAr ? 'جاري التحويل للمحلل السريع الداخلي...' : 'Falling back to regex parser...');
      const fallbackList = parseQuestionsRegex(rawText);
      setParsedQuestions(fallbackList);
      if (fallbackList.length > 0) {
        toast.success(isAr ? ` تم استخراج ${fallbackList.length} سؤال عبر المحلل الداخلي` : ` Parsed ${fallbackList.length} questions`);
      } else {
        toast.error(isAr ? 'فشل تحليل النص. تأكد من وضوح ترقيم الأسئلة والخيارات' : 'Failed to parse text. Check numbering and options');
      }
    } finally {
      setIsParsing(false);
    }
  };

  // Save all selected parsed questions into Firestore
  const handleSaveToBank = async () => {
    const selected = parsedQuestions.filter(q => q.selected);
    if (selected.length === 0) {
      toast.error(isAr ? 'يرجى تحديد سؤال واحد على الأقل للاستيراد' : 'Please select at least one question');
      return;
    }
    if (!targetPartId) {
      toast.error(isAr ? 'يرجى اختيار الجزء / الاختبار المستهدف أولاً' : 'Please select target part/quiz');
      return;
    }

    setIsSaving(true);
    setSaveProgress(0);

    try {
      let savedCount = 0;
      const batchSize = 100;
      for (let i = 0; i < selected.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = selected.slice(i, i + batchSize);
        chunk.forEach(q => {
          const docId = `${targetPartId}_${q.id}`;
          const docRef = doc(db, 'quiz_questions', docId);
          batch.set(docRef, {
            id: q.id,
            partId: targetPartId,
            subjectId: targetSubjectId,
            type: q.type || 'mcq',
            questionAr: cleanArabicText(q.questionAr || ''),
            questionEn: (q.questionEn || '').trim(),
            options: q.options || [],
            correctAnswer: q.correctAnswer || (q.options?.[0] || ''),
            marks: Number(q.marks) || 1,
            explanation: (q.explanation || '').trim(),
            createdAt: serverTimestamp(),
            importedVia: 'bulk_ai'
          });
        });
        await batch.commit();
        savedCount += chunk.length;
        setSaveProgress(Math.round((savedCount / selected.length) * 100));
      }

      toast.success(isAr ? ` تم استيراد وحفظ ${savedCount} سؤال بنجاح في بنك الأسئلة!` : ` Successfully imported ${savedCount} questions!`);
      setParsedQuestions([]);
      setRawText('');
      onQuestionsImported();
    } catch (err) {
      console.error('Error saving bulk questions:', err);
      toast.error(isAr ? `فشل الاستيراد: ${err.message}` : `Import failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // TAB 2: SMART QUESTION BANK AUDITOR STATE
  // ════════════════════════════════════════════════════════════════════════════
  const [auditScope, setAuditScope] = useState('all'); // 'all' | 'subject' | 'part'
  const [isAuditing, setIsAuditing] = useState(false);
  const [bankQuestions, setBankQuestions] = useState([]);
  const [questionReports, setQuestionReports] = useState([]);
  const [auditIssues, setAuditIssues] = useState({
    duplicates: [],
    missingAnswers: [],
    missingOptions: [],
    reportedQuestions: [],
    spellingIssues: []
  });
  const [hasRunAudit, setHasRunAudit] = useState(false);
  const [activeAuditFilter, setActiveAuditFilter] = useState('all');

  // Load questions and reports for auditing
  const runFullAudit = async () => {
    setIsAuditing(true);
    setHasRunAudit(false);
    try {
      // 1. Fetch questions from Firestore quiz_questions
      let qSnap;
      if (auditScope === 'part' && targetPartId) {
        const q = query(collection(db, 'quiz_questions'), where('partId', '==', targetPartId));
        qSnap = await getDocs(q);
      } else if (auditScope === 'subject' && targetSubjectId) {
        const q = query(collection(db, 'quiz_questions'), where('subjectId', '==', targetSubjectId));
        qSnap = await getDocs(q);
      } else {
        qSnap = await getDocs(collection(db, 'quiz_questions'));
      }
      const questionsList = qSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
      setBankQuestions(questionsList);

      // 2. Fetch all reports from question_reports
      const reportsSnap = await getDocs(collection(db, 'question_reports'));
      const reportsList = reportsSnap.docs.map(d => ({ reportId: d.id, ...d.data() }));
      setQuestionReports(reportsList);

      // 3. Perform Analysis
      const duplicates = [];
      const missingAnswers = [];
      const missingOptions = [];
      const reportedQuestions = [];
      const spellingIssues = [];

      // Check each question
      for (let i = 0; i < questionsList.length; i++) {
        const q1 = questionsList[i];
        const text1 = (q1.questionAr || q1.questionEn || '').trim();

        // 3a. Missing Answers
        if (!q1.correctAnswer && q1.type !== 'text' && (!q1.correctAnswers || q1.correctAnswers.length === 0)) {
          missingAnswers.push(q1);
        }

        // 3b. Missing Options (for MCQ)
        if (q1.type === 'mcq' && (!q1.options || q1.options.length < 2)) {
          missingOptions.push(q1);
        }

        // 3c. Duplicate Detection
        for (let j = i + 1; j < questionsList.length; j++) {
          const q2 = questionsList[j];
          const text2 = (q2.questionAr || q2.questionEn || '').trim();
          if (text1 && text2) {
            const similarity = calculateSimilarity(text1, text2);
            if (similarity >= 0.82) {
              duplicates.push({
                similarity: Math.round(similarity * 100),
                q1,
                q2
              });
            }
          }
        }

        // 3d. Check Reports
        const matchingReports = reportsList.filter(r => {
          if (r.questionId && (r.questionId === q1.id || r.questionId === q1.docId)) return true;
          if (r.quizId && (r.quizId === q1.partId || r.quizId === q1.subjectId)) {
            const reportText = (r.questionAr || r.questionEn || r.text || '').toLowerCase();
            return text1 && reportText.includes(text1.slice(0, 30).toLowerCase());
          }
          return false;
        });

        if (matchingReports.length > 0) {
          reportedQuestions.push({
            question: q1,
            reportsCount: matchingReports.length,
            reports: matchingReports
          });
        }

        // 3e. Spelling & Typo suggestions
        if (q1.questionAr) {
          const cleaned = cleanArabicText(q1.questionAr);
          if (cleaned !== q1.questionAr.trim()) {
            spellingIssues.push({
              question: q1,
              original: q1.questionAr,
              suggested: cleaned
            });
          }
        }
      }

      setAuditIssues({
        duplicates,
        missingAnswers,
        missingOptions,
        reportedQuestions,
        spellingIssues
      });
      setHasRunAudit(true);
      toast.success(isAr ? 'تم الانتهاء من فحص بنك الأسئلة بالكامل!' : 'Question bank audit completed!');
    } catch (err) {
      console.error('Audit failed:', err);
      toast.error(isAr ? 'فشل فحص الأسئلة' : 'Failed to audit questions');
    } finally {
      setIsAuditing(false);
    }
  };

  // Quick action: Delete question from bank
  const handleDeleteQuestion = async (qDocId) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذا السؤال؟' : 'Are you sure you want to delete this question?')) return;
    try {
      await deleteDoc(doc(db, 'quiz_questions', qDocId));
      toast.success(isAr ? 'تم حذف السؤال بنجاح' : 'Question deleted successfully');
      runFullAudit();
    } catch (err) {
      toast.error(isAr ? 'فشل حذف السؤال' : 'Failed to delete question');
    }
  };

  // Quick action: Fix spelling
  const handleAutoFixSpelling = async (qDocId, suggestedText) => {
    try {
      await updateDoc(doc(db, 'quiz_questions', qDocId), {
        questionAr: suggestedText
      });
      toast.success(isAr ? 'تم تصحيح الإملاء وحفظ السؤال!' : 'Spelling fixed & saved!');
      runFullAudit();
    } catch (err) {
      toast.error(isAr ? 'فشل حفظ التصحيح' : 'Failed to fix spelling');
    }
  };

  // Quick action: Resolve reports
  const handleResolveReports = async (reports = []) => {
    try {
      const batch = writeBatch(db);
      reports.forEach(r => {
        if (r.reportId) {
          const ref = doc(db, 'question_reports', r.reportId);
          batch.update(ref, { status: 'resolved', resolvedAt: serverTimestamp() });
        }
      });
      await batch.commit();
      toast.success(isAr ? 'تم تعليم البلاغات كمحلولة بنجاح' : 'Reports resolved successfully');
      runFullAudit();
    } catch (err) {
      toast.error(isAr ? 'فشل حل البلاغات' : 'Failed to resolve reports');
    }
  };

  return (
    <div className="qbank-tools-modal-overlay" onClick={onClose}>
      <div className="qbank-tools-modal" onClick={e => e.stopPropagation()}>

        {/* ── Modal Header ── */}
        <div className="qbank-tools-header">
          <div className="qbank-tools-header-title">
            <span className="qbank-tools-badge">AI Assistant</span>
            <h3>{isAr ? 'مساعد بنك الأسئلة واستيراد الاختبارات الذكي' : 'Smart Quiz Bank AI Assistant & Auditor'}</h3>
          </div>
          <button className="qbank-tools-close-btn" onClick={onClose}>×</button>
        </div>

        {/* ── Navigation Sub-tabs ── */}
        <div className="qbank-tools-tabs">
          <button
            className={`qbank-tools-tab-btn ${activeTab === 'importer' ? 'active' : ''}`}
            onClick={() => setActiveTab('importer')}
          >
            📥 {isAr ? 'استيراد الأسئلة بالجملة (Bulk AI Import)' : 'Bulk AI Importer'}
          </button>
          <button
            className={`qbank-tools-tab-btn ${activeTab === 'auditor' ? 'active' : ''}`}
            onClick={() => setActiveTab('auditor')}
          >
            🔍 {isAr ? 'مدقق جودة بنك الأسئلة (Smart Audit)' : 'Smart Bank Auditor'}
          </button>
        </div>

        {/* ── Global Target Selector ── */}
        <div className="qbank-tools-target-bar">
          <div className="qbank-target-item">
            <label>{isAr ? 'المادة المستهدفة:' : 'Target Subject:'}</label>
            <select
              value={targetSubjectId}
              onChange={e => setTargetSubjectId(e.target.value)}
              className="qbank-select"
            >
              {allSubjects.map(s => (
                <option key={s.id} value={s.id}>{isAr ? (s.nameAr || s.name) : (s.name || s.nameAr)} ({s.id})</option>
              ))}
            </select>
          </div>

          <div className="qbank-target-item">
            <label>{isAr ? 'الجزء / الاختبار المستهدف:' : 'Target Quiz Part:'}</label>
            <select
              value={targetPartId}
              onChange={e => setTargetPartId(e.target.value)}
              className="qbank-select"
            >
              {availableParts.length === 0 ? (
                <option value="">{isAr ? 'لا توجد أجزاء متاحة للمادة' : 'No parts available'}</option>
              ) : (
                availableParts.map(p => (
                  <option key={p.id} value={p.id}>{isAr ? (p.titleAr || p.title) : (p.title || p.titleAr)} ({p.id})</option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: BULK IMPORTER CONTENT                                         */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'importer' && (
          <div className="qbank-tab-content">
            <div className="qbank-instruction-box">
              <span className="qbank-info-icon">💡</span>
              <div>
                <strong>{isAr ? 'كيف يعمل الاستيراد الذكي؟' : 'How does Bulk AI Importer work?'}</strong>
                <p>
                  {isAr
                    ? 'انسخ نموذج الأسئلة بالكامل من ملف Word أو PDF أو نص وألصقه أدناه. سيقوم الذكاء الاصطناعي تلقائياً بفصل الأسئلة واستخراج الخيارات وتحديد الإجابات الصحيحة ونقاط كل سؤال.'
                    : 'Paste questions from Word, PDF, or text. AI will automatically structure questions, extract options, identify correct answers, and assign points.'}
                </p>
              </div>
            </div>

            {parsedQuestions.length === 0 ? (
              <div className="qbank-importer-input-area">
                <textarea
                  className="qbank-bulk-textarea"
                  value={rawText}
                  onChange={e => setRawText(e.target.value)}
                  placeholder={isAr
                    ? `الصق نموذج الأسئلة هنا، مثال:\n1. ما هي عاصمة الأردن؟\nA) عمان\nB) إربد\nC) الزرقاء\nD) العقبة\nالإجابة: A\n\n2. Which protocol is secure?\nA) HTTP\nB) HTTPS\nAnswer: B`
                    : `Paste exam questions here...`}
                  rows={10}
                />

                <div className="qbank-importer-actions">
                  <button
                    className="qbank-action-btn primary"
                    onClick={handleParseWithAI}
                    disabled={isParsing || !rawText.trim()}
                  >
                    {isParsing ? (isAr ? '⏳ جاري التحليل والذكاء الاصطناعي...' : '⏳ Parsing with AI...') : (isAr ? '✨ تحليل وتوزيع الأسئلة بالذكاء الاصطناعي' : '✨ Parse Questions with AI')}
                  </button>

                  <button
                    className="qbank-action-btn secondary"
                    onClick={() => {
                      const list = parseQuestionsRegex(rawText);
                      setParsedQuestions(list);
                      if (list.length > 0) toast.success(isAr ? `تم استخراج ${list.length} سؤال` : `Parsed ${list.length} questions`);
                      else toast.error(isAr ? 'لم يتم العثور على أسئلة' : 'No questions found');
                    }}
                    disabled={isParsing || !rawText.trim()}
                  >
                    ⚡ {isAr ? 'تحليل سريع بالمحلل الداخلي' : 'Fast Regex Parse'}
                  </button>

                  <button
                    className="qbank-action-btn text"
                    onClick={() => setRawText('')}
                    disabled={isParsing || !rawText}
                  >
                    {isAr ? 'مسح النص' : 'Clear Text'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="qbank-preview-area">
                <div className="qbank-preview-header">
                  <div className="qbank-preview-title">
                    <h4>{isAr ? `معاينة وتعديل الأسئلة المُستخرجة (${parsedQuestions.length})` : `Preview & Edit Parsed Questions (${parsedQuestions.length})`}</h4>
                    <span className="qbank-preview-subtitle">
                      {isAr ? 'يمكنك تعديل أي سؤال أو خيار أو إجابة قبل الاعتماد النهائي' : 'You can edit question texts, choices, or answers before final import'}
                    </span>
                  </div>

                  <div className="qbank-preview-top-actions">
                    <button
                      className="qbank-mini-btn"
                      onClick={() => {
                        const allSelected = parsedQuestions.every(q => q.selected);
                        setParsedQuestions(prev => prev.map(q => ({ ...q, selected: !allSelected })));
                      }}
                    >
                      {parsedQuestions.every(q => q.selected) ? (isAr ? 'إلغاء تحديد الكل' : 'Deselect All') : (isAr ? 'تحديد الكل' : 'Select All')}
                    </button>
                    <button
                      className="qbank-mini-btn danger"
                      onClick={() => setParsedQuestions([])}
                    >
                      {isAr ? 'إعادة الإدخال' : 'Start Over'}
                    </button>
                  </div>
                </div>

                {/* Parsed Questions Cards List */}
                <div className="qbank-parsed-cards-list">
                  {parsedQuestions.map((q, qIndex) => (
                    <div key={q.id || qIndex} className={`qbank-parsed-card ${q.selected ? 'selected' : 'unselected'}`}>
                      <div className="qbank-card-top">
                        <label className="qbank-card-checkbox">
                          <input
                            type="checkbox"
                            checked={q.selected}
                            onChange={e => {
                              const checked = e.target.checked;
                              setParsedQuestions(prev => prev.map((item, i) => i === qIndex ? { ...item, selected: checked } : item));
                            }}
                          />
                          <span className="qbank-card-qnum">#{qIndex + 1}</span>
                        </label>

                        <div className="qbank-card-type-tag">
                          <span>{q.type.toUpperCase()}</span>
                          <span className="qbank-card-pts">{q.marks} pt</span>
                        </div>

                        <button
                          className="qbank-card-del-btn"
                          onClick={() => setParsedQuestions(prev => prev.filter((_, i) => i !== qIndex))}
                          title={isAr ? 'حذف هذا السؤال' : 'Remove this question'}
                        >
                          🗑️
                        </button>
                      </div>

                      {/* Question Text Arabic */}
                      <div className="qbank-card-field">
                        <label>{isAr ? 'نص السؤال (عربي):' : 'Question (Arabic):'}</label>
                        <input
                          type="text"
                          value={q.questionAr || ''}
                          onChange={e => {
                            const v = e.target.value;
                            setParsedQuestions(prev => prev.map((item, i) => i === qIndex ? { ...item, questionAr: v } : item));
                          }}
                          placeholder="نص السؤال بالعربية..."
                          dir="rtl"
                          className="qbank-input"
                        />
                      </div>

                      {/* Question Text English */}
                      <div className="qbank-card-field">
                        <label>{isAr ? 'نص السؤال (إنجليزي):' : 'Question (English):'}</label>
                        <input
                          type="text"
                          value={q.questionEn || ''}
                          onChange={e => {
                            const v = e.target.value;
                            setParsedQuestions(prev => prev.map((item, i) => i === qIndex ? { ...item, questionEn: v } : item));
                          }}
                          placeholder="Question in English..."
                          dir="ltr"
                          className="qbank-input"
                        />
                      </div>

                      {/* Options & Correct Answer */}
                      <div className="qbank-card-options-box">
                        <label className="qbank-card-opt-label">
                          {isAr ? 'الخيارات (اختر الإجابة الصحيحة بالضغط على الدائرة):' : 'Options (Select correct answer):'}
                        </label>
                        <div className="qbank-card-opts-grid">
                          {q.options.map((opt, optIndex) => (
                            <div key={optIndex} className={`qbank-card-opt-row ${q.correctAnswer === opt ? 'is-correct' : ''}`}>
                              <input
                                type="radio"
                                name={`correct_${qIndex}`}
                                checked={q.correctAnswer === opt}
                                onChange={() => {
                                  setParsedQuestions(prev => prev.map((item, i) => i === qIndex ? { ...item, correctAnswer: opt } : item));
                                }}
                              />
                              <input
                                type="text"
                                value={opt}
                                onChange={e => {
                                  const v = e.target.value;
                                  setParsedQuestions(prev => prev.map((item, i) => {
                                    if (i === qIndex) {
                                      const newOpts = [...item.options];
                                      const wasCorrect = item.correctAnswer === newOpts[optIndex];
                                      newOpts[optIndex] = v;
                                      return {
                                        ...item,
                                        options: newOpts,
                                        correctAnswer: wasCorrect ? v : item.correctAnswer
                                      };
                                    }
                                    return item;
                                  }));
                                }}
                                className="qbank-opt-input"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Explanation */}
                      {q.explanation && (
                        <div className="qbank-card-explanation">
                          <span>💡 {isAr ? 'الشرح:' : 'Explanation:'}</span> {q.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bottom Save Bar */}
                <div className="qbank-importer-bottom-bar">
                  <div className="qbank-save-info">
                    <strong>{parsedQuestions.filter(q => q.selected).length}</strong> {isAr ? 'سؤال جاهز للاستيراد' : 'questions ready for import'}
                  </div>

                  <button
                    className="qbank-action-btn primary large"
                    onClick={handleSaveToBank}
                    disabled={isSaving || parsedQuestions.filter(q => q.selected).length === 0}
                  >
                    {isSaving
                      ? (isAr ? `⏳ جاري الحفظ في بنك الأسئلة (${saveProgress}%)...` : `⏳ Saving to bank (${saveProgress}%)...`)
                      : (isAr ? '🚀 حفظ واستيراد جميع الأسئلة المحددة إلى بنك الأسئلة' : '🚀 Save and Import to Question Bank')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: SMART AUDITOR CONTENT                                         */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'auditor' && (
          <div className="qbank-tab-content">
            <div className="qbank-auditor-controls">
              <div className="qbank-audit-scope-bar">
                <label>{isAr ? 'نطاق الفحص:' : 'Audit Scope:'}</label>
                <div className="qbank-pill-group">
                  <button
                    className={`qbank-pill-btn ${auditScope === 'all' ? 'active' : ''}`}
                    onClick={() => setAuditScope('all')}
                  >
                    {isAr ? 'كل بنك الأسئلة' : 'All Question Bank'}
                  </button>
                  <button
                    className={`qbank-pill-btn ${auditScope === 'subject' ? 'active' : ''}`}
                    onClick={() => setAuditScope('subject')}
                  >
                    {isAr ? 'المادة المحددة فقط' : 'Selected Subject Only'}
                  </button>
                  <button
                    className={`qbank-pill-btn ${auditScope === 'part' ? 'active' : ''}`}
                    onClick={() => setAuditScope('part')}
                  >
                    {isAr ? 'الجزء / الاختبار المحدد فقط' : 'Selected Quiz Part Only'}
                  </button>
                </div>
              </div>

              <button
                className="qbank-action-btn primary"
                onClick={runFullAudit}
                disabled={isAuditing}
              >
                {isAuditing ? (isAr ? '⏳ جاري الفحص الشامل...' : '⏳ Running Audit...') : (isAr ? '🔍 بدء الفحص الشامل لبنك الأسئلة' : '🔍 Run Full Quality Audit')}
              </button>
            </div>

            {hasRunAudit && (
              <div className="qbank-audit-results">
                {/* Metric Summary Cards */}
                <div className="qbank-audit-metrics-grid">
                  <div
                    className={`qbank-metric-card ${activeAuditFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveAuditFilter('all')}
                  >
                    <span className="qbank-metric-num">{bankQuestions.length}</span>
                    <span className="qbank-metric-label">{isAr ? 'إجمالي الأسئلة المفحوصة' : 'Questions Scanned'}</span>
                  </div>

                  <div
                    className={`qbank-metric-card warning ${activeAuditFilter === 'duplicates' ? 'active' : ''}`}
                    onClick={() => setActiveAuditFilter('duplicates')}
                  >
                    <span className="qbank-metric-num">{auditIssues.duplicates.length}</span>
                    <span className="qbank-metric-label">{isAr ? 'أسئلة مكررة / متشابهة' : 'Duplicates Found'}</span>
                  </div>

                  <div
                    className={`qbank-metric-card danger ${activeAuditFilter === 'missing' ? 'active' : ''}`}
                    onClick={() => setActiveAuditFilter('missing')}
                  >
                    <span className="qbank-metric-num">{auditIssues.missingAnswers.length + auditIssues.missingOptions.length}</span>
                    <span className="qbank-metric-label">{isAr ? 'أسئلة ناقصة إجابات/خيارات' : 'Missing Answers / Options'}</span>
                  </div>

                  <div
                    className={`qbank-metric-card danger ${activeAuditFilter === 'reported' ? 'active' : ''}`}
                    onClick={() => setActiveAuditFilter('reported')}
                  >
                    <span className="qbank-metric-num">{auditIssues.reportedQuestions.length}</span>
                    <span className="qbank-metric-label">{isAr ? 'أسئلة عليها بلاغات طلاب' : 'Reported Questions'}</span>
                  </div>

                  <div
                    className={`qbank-metric-card info ${activeAuditFilter === 'spelling' ? 'active' : ''}`}
                    onClick={() => setActiveAuditFilter('spelling')}
                  >
                    <span className="qbank-metric-num">{auditIssues.spellingIssues.length}</span>
                    <span className="qbank-metric-label">{isAr ? 'تحسينات إملائية ولغوية' : 'Spelling Fixes'}</span>
                  </div>
                </div>

                {/* Audit Issues Details */}
                <div className="qbank-audit-details-container">
                  {/* Duplicates Section */}
                  {(activeAuditFilter === 'all' || activeAuditFilter === 'duplicates') && auditIssues.duplicates.length > 0 && (
                    <div className="qbank-issue-section">
                      <h4 className="qbank-issue-title warning">
                        ⚠️ {isAr ? `الأسئلة المكررة والمتطابقة (${auditIssues.duplicates.length})` : `Duplicate Questions (${auditIssues.duplicates.length})`}
                      </h4>
                      <div className="qbank-issue-list">
                        {auditIssues.duplicates.map((item, idx) => (
                          <div key={idx} className="qbank-duplicate-box">
                            <div className="qbank-dup-badge">تشابه {item.similarity}%</div>
                            <div className="qbank-dup-pair">
                              <div className="qbank-dup-item">
                                <div className="qbank-dup-item-head">
                                  <span>السؤال الأول (ID: {item.q1.id})</span>
                                  <button className="qbank-mini-btn danger" onClick={() => handleDeleteQuestion(item.q1.docId)}>حذف هذا</button>
                                </div>
                                <p>{item.q1.questionAr || item.q1.questionEn}</p>
                              </div>
                              <div className="qbank-dup-item">
                                <div className="qbank-dup-item-head">
                                  <span>السؤال الثاني (ID: {item.q2.id})</span>
                                  <button className="qbank-mini-btn danger" onClick={() => handleDeleteQuestion(item.q2.docId)}>حذف هذا</button>
                                </div>
                                <p>{item.q2.questionAr || item.q2.questionEn}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing Answers / Options Section */}
                  {(activeAuditFilter === 'all' || activeAuditFilter === 'missing') && (auditIssues.missingAnswers.length > 0 || auditIssues.missingOptions.length > 0) && (
                    <div className="qbank-issue-section">
                      <h4 className="qbank-issue-title danger">
                        ❌ {isAr ? `أسئلة تنقصها إجابة صحيحة أو خيارات (${auditIssues.missingAnswers.length + auditIssues.missingOptions.length})` : `Missing Answers or Options`}
                      </h4>
                      <div className="qbank-issue-list">
                        {[...auditIssues.missingAnswers, ...auditIssues.missingOptions].map((q, idx) => (
                          <div key={idx} className="qbank-issue-item-card">
                            <div className="qbank-issue-card-content">
                              <div className="qbank-issue-tags">
                                <span className="qbank-tag danger">{!q.correctAnswer ? 'بدون إجابة صحيحة' : 'خيارات غير مكتملة'}</span>
                                <span className="qbank-tag">ID: {q.id}</span>
                                <span className="qbank-tag">Part: {q.partId}</span>
                              </div>
                              <p className="qbank-issue-qtext">{q.questionAr || q.questionEn}</p>
                            </div>
                            <div className="qbank-issue-actions">
                              <button className="qbank-mini-btn danger" onClick={() => handleDeleteQuestion(q.docId)}>حذف السؤال</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reported Questions Section */}
                  {(activeAuditFilter === 'all' || activeAuditFilter === 'reported') && auditIssues.reportedQuestions.length > 0 && (
                    <div className="qbank-issue-section">
                      <h4 className="qbank-issue-title danger">
                        🚨 {isAr ? `أسئلة تلقت بلاغات متكررة من الطلاب (${auditIssues.reportedQuestions.length})` : `Reported Questions (${auditIssues.reportedQuestions.length})`}
                      </h4>
                      <div className="qbank-issue-list">
                        {auditIssues.reportedQuestions.map((item, idx) => (
                          <div key={idx} className="qbank-reported-card">
                            <div className="qbank-reported-header">
                              <span className="qbank-rep-badge">{item.reportsCount} بلاغ</span>
                              <span className="qbank-tag">ID: {item.question.id}</span>
                              <span className="qbank-tag">Quiz: {item.question.partId}</span>
                            </div>
                            <p className="qbank-issue-qtext">{item.question.questionAr || item.question.questionEn}</p>

                            <div className="qbank-rep-reasons">
                              <strong>أسباب البلاغات وملاحظات الطلاب:</strong>
                              <ul>
                                {item.reports.map((r, rIdx) => (
                                  <li key={rIdx}>
                                    <span className="qbank-rep-reason">{r.reason || 'ملاحظة'}:</span> {r.studentNote || r.text || 'بدون تفاصيل إضافية'}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div className="qbank-issue-actions">
                              <button className="qbank-mini-btn success" onClick={() => handleResolveReports(item.reports)}>
                                ✅ تعليم البلاغات كمحلولة
                              </button>
                              <button className="qbank-mini-btn danger" onClick={() => handleDeleteQuestion(item.question.docId)}>
                                🗑️ حذف السؤال
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spelling & Grammar Fixes Section */}
                  {(activeAuditFilter === 'all' || activeAuditFilter === 'spelling') && auditIssues.spellingIssues.length > 0 && (
                    <div className="qbank-issue-section">
                      <h4 className="qbank-issue-title info">
                        ✍️ {isAr ? `تحسينات إملائية وصياغة (${auditIssues.spellingIssues.length})` : `Spelling & Quality Improvements`}
                      </h4>
                      <div className="qbank-issue-list">
                        {auditIssues.spellingIssues.map((item, idx) => (
                          <div key={idx} className="qbank-spelling-card">
                            <div className="qbank-spelling-compare">
                              <div className="qbank-spelling-orig">
                                <span className="qbank-subtag red">الأصل:</span>
                                <p>{item.original}</p>
                              </div>
                              <div className="qbank-spelling-arrow">➔</div>
                              <div className="qbank-spelling-sugg">
                                <span className="qbank-subtag green">التصحيح المقترح:</span>
                                <p>{item.suggested}</p>
                              </div>
                            </div>
                            <button
                              className="qbank-mini-btn success"
                              onClick={() => handleAutoFixSpelling(item.question.docId, item.suggested)}
                            >
                              🪄 تطبيق التصحيح
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Clean State (No Issues Found) */}
                  {auditIssues.duplicates.length === 0 &&
                    auditIssues.missingAnswers.length === 0 &&
                    auditIssues.missingOptions.length === 0 &&
                    auditIssues.reportedQuestions.length === 0 &&
                    auditIssues.spellingIssues.length === 0 && (
                      <div className="qbank-clean-state">
                        <span className="qbank-clean-icon">🎉</span>
                        <h4>{isAr ? 'بنك الأسئلة خالٍ تماماً من المشاكل والأخطاء!' : 'Question bank is completely clean and optimized!'}</h4>
                        <p>{isAr ? 'تم فحص جميع الأسئلة، لا توجد أسئلة مكررة أو ناقصة أو بلاغات معلقة.' : 'All questions are fully validated.'}</p>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
