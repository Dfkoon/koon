import React, { useState, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { generateStudyMaterial } from '../services/studyAIService';
import toast from 'react-hot-toast';
import './AIStudyTools.css';

// ─── Icons ────────────────────────────────────────────────────────────────
const IconQuiz     = () => <span className="ast-icon">📝</span>;
const IconSummary  = () => <span className="ast-icon">📋</span>;
const IconMindMap  = () => <span className="ast-icon">🗺️</span>;
const IconPlan     = () => <span className="ast-icon">📚</span>;
const IconAI       = () => <span className="ast-icon">🤖</span>;
const IconCopy     = () => <span className="ast-icon">📋</span>;
const IconPrint    = () => <span className="ast-icon">🖨️</span>;
const IconReset    = () => <span className="ast-icon">🔄</span>;

// ─── Output Type Cards ────────────────────────────────────────────────────
const OUTPUT_TYPES = [
  { id: 'quiz',    icon: '📝', labelAr: 'اختبار',       labelEn: 'Quiz',       descAr: 'أسئلة تفاعلية',  descEn: 'Interactive questions' },
  { id: 'summary', icon: '📋', labelAr: 'ملخص ذكي',     labelEn: 'Summary',    descAr: 'نقاط ومفاهيم',    descEn: 'Key points & concepts' },
  { id: 'mindmap', icon: '🗺️', labelAr: 'مخطط ذهني',   labelEn: 'Mind Map',   descAr: 'هيكل بصري',        descEn: 'Visual structure' },
  { id: 'plan',    icon: '📚', labelAr: 'خطة الدراسة', labelEn: 'Study Plan', descAr: 'جدول يومي',        descEn: 'Daily schedule' },
];

const QUESTION_TYPES = [
  { id: 'mcq',   labelAr: 'اختيار من متعدد', labelEn: 'MCQ' },
  { id: 'tf',    labelAr: 'صح / خطأ',        labelEn: 'True / False' },
  { id: 'essay', labelAr: 'مقالي',            labelEn: 'Essay' },
  { id: 'mixed', labelAr: 'مختلط',            labelEn: 'Mixed' },
];

// ─── Result Renderers ─────────────────────────────────────────────────────

const QuizResult = ({ data, lang }) => {
  const [answers, setAnswers]     = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore]         = useState(0);
  const isRtl = lang === 'ar';

  const handleSelect = (qId, val) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [qId]: val }));
  };

  const handleSubmit = () => {
    let correct = 0;
    data.questions.forEach(q => {
      if (q.type === 'mcq' || q.type === 'tf') {
        const userAns = (answers[q.id] || '').toLowerCase().trim();
        const correctAns = (q.answer || '').toLowerCase().trim();
        if (userAns && correctAns && (userAns === correctAns || correctAns.includes(userAns) || userAns.includes(correctAns))) {
          correct++;
        }
      }
    });
    setScore(correct);
    setSubmitted(true);
  };

  const gradable = data.questions?.filter(q => q.type !== 'essay') || [];
  const pct = gradable.length > 0 ? Math.round((score / gradable.length) * 100) : 0;

  return (
    <div className="ast-quiz-result">
      {submitted && (
        <div className={`ast-score-banner ${pct >= 70 ? 'pass' : 'fail'}`}>
          <span className="ast-score-emoji">{pct >= 70 ? '🎉' : '💪'}</span>
          <span>{isRtl ? `نتيجتك: ${score}/${gradable.length} (${pct}%)` : `Score: ${score}/${gradable.length} (${pct}%)`}</span>
        </div>
      )}
      {data.questions?.map((q, idx) => (
        <div key={q.id || idx} className={`ast-question-card ${submitted ? (answers[q.id] === q.answer ? 'correct' : 'wrong') : ''}`}>
          <div className="ast-question-header">
            <span className="ast-q-num">{idx + 1}</span>
            <span className="ast-q-type-badge">{q.type?.toUpperCase()}</span>
          </div>
          <p className="ast-q-text">{q.question}</p>

          {q.type === 'mcq' && q.options && (
            <div className="ast-options">
              {q.options.map((opt, oi) => (
                <button
                  key={oi}
                  className={`ast-option ${answers[q.id] === opt ? 'selected' : ''} ${submitted && opt === q.answer ? 'correct-opt' : ''}`}
                  onClick={() => handleSelect(q.id, opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {q.type === 'tf' && (
            <div className="ast-tf-btns">
              {(isRtl ? ['صح', 'خطأ'] : ['True', 'False']).map(val => (
                <button
                  key={val}
                  className={`ast-tf-btn ${answers[q.id] === val ? 'selected' : ''} ${submitted && (q.answer?.toLowerCase().includes(val.toLowerCase()) || q.answer === val) ? 'correct-opt' : ''}`}
                  onClick={() => handleSelect(q.id, val)}
                >
                  {val}
                </button>
              ))}
            </div>
          )}

          {q.type === 'essay' && (
            <textarea className="ast-essay-input" placeholder={isRtl ? 'اكتب إجابتك هنا...' : 'Write your answer here...'} rows={4} />
          )}

          {submitted && q.explanation && (
            <div className="ast-explanation">
              <strong>{isRtl ? '💡 الشرح:' : '💡 Explanation:'}</strong> {q.explanation}
            </div>
          )}
          {submitted && (q.type === 'mcq' || q.type === 'tf') && (
            <div className="ast-correct-ans">
              <strong>{isRtl ? '✅ الإجاب الصحيح:' : '✅ Correct Answer:'}</strong> {q.answer}
            </div>
          )}
          {q.type === 'essay' && submitted && (
            <div className="ast-model-answer">
              <strong>{isRtl ? '📖 نموذج الإجاب:' : '📖 Model Answer:'}</strong> {q.answer}
            </div>
          )}
        </div>
      ))}

      {!submitted && data.questions?.some(q => q.type !== 'essay') && (
        <button className="ast-submit-btn" onClick={handleSubmit}>
          {isRtl ? '✅ تحقق من الإجابات' : '✅ Check Answers'}
        </button>
      )}
    </div>
  );
};

const SummaryResult = ({ data, lang }) => {
  const isRtl = lang === 'ar';
  return (
    <div className="ast-summary-result">
      <h2 className="ast-result-title">{data.title}</h2>
      <div className="ast-overview-box">
        <p>{data.overview}</p>
      </div>
      {data.keyPoints?.length > 0 && (
        <div className="ast-section">
          <h3>✨ {isRtl ? 'النقاط الرئيسي' : 'Key Points'}</h3>
          <ul className="ast-key-points">
            {data.keyPoints.map((pt, i) => <li key={i}>{pt}</li>)}
          </ul>
        </div>
      )}
      {data.definitions?.length > 0 && (
        <div className="ast-section">
          <h3>📖 {isRtl ? 'المصطلحات المهم' : 'Key Definitions'}</h3>
          <div className="ast-definitions">
            {data.definitions.map((d, i) => (
              <div key={i} className="ast-def-card">
                <span className="ast-def-term">{d.term}</span>
                <span className="ast-def-sep">—</span>
                <span className="ast-def-body">{d.definition}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.conclusion && (
        <div className="ast-conclusion">
          <h3>🎯 {isRtl ? 'اللاص' : 'Conclusion'}</h3>
          <p>{data.conclusion}</p>
        </div>
      )}
    </div>
  );
};

const MindMapResult = ({ data, lang }) => {
  const [open, setOpen] = useState({});
  const isRtl = lang === 'ar';
  const toggle = i => setOpen(p => ({ ...p, [i]: !p[i] }));

  const colors = ['#d32f2f','#506400','#1565c0','#6a1b9a','#e65100','#00695c'];

  return (
    <div className="ast-mindmap">
      <div className="ast-mindmap-root">
        <span className="ast-mindmap-root-label">🌐 {data.root}</span>
      </div>
      <div className="ast-mindmap-branches">
        {data.branches?.map((branch, i) => (
          <div key={i} className="ast-branch" style={{ '--branch-color': colors[i % colors.length] }}>
            <button className="ast-branch-header" onClick={() => toggle(i)}>
              <span className="ast-branch-dot" />
              <span className="ast-branch-title">{branch.title}</span>
              <span className="ast-branch-toggle">{open[i] ? '▲' : '▼'}</span>
            </button>
            {(open[i] !== false) && branch.children?.length > 0 && (
              <ul className="ast-branch-children">
                {branch.children.map((child, j) => (
                  <li key={j} className="ast-leaf">
                    <span className="ast-leaf-dot" />
                    {child}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {data.branches?.length === 0 && (
        <p className="ast-empty">{isRtl ? 'لم يتم إنشاء مخطط.' : 'No mind map generated.'}</p>
      )}
    </div>
  );
};

const StudyPlanResult = ({ data, lang }) => {
  const isRtl = lang === 'ar';
  const diffColors = { سهل: '#22c55e', Easy: '#22c55e', متوسط: '#f59e0b', Medium: '#f59e0b', صعب: '#ef4444', Hard: '#ef4444' };

  return (
    <div className="ast-plan-result">
      <div className="ast-plan-header">
        <h2 className="ast-result-title">{data.subject}</h2>
        <div className="ast-plan-meta">
          <span className="ast-meta-badge">
            📅 {data.totalDays} {isRtl ? 'يوم' : 'days'}
          </span>
          <span className="ast-meta-badge" style={{ background: diffColors[data.difficulty] + '22', color: diffColors[data.difficulty] }}>
            ⚡ {data.difficulty}
          </span>
        </div>
      </div>

      {data.importantTopics?.length > 0 && (
        <div className="ast-important-box">
          <h4>🔥 {isRtl ? 'أهم المواضيع' : 'Most Important Topics'}</h4>
          <div className="ast-important-tags">
            {data.importantTopics.map((t, i) => <span key={i} className="ast-tag">{t}</span>)}
          </div>
        </div>
      )}

      <div className="ast-days-grid">
        {data.days?.map(day => (
          <div key={day.day} className="ast-day-card">
            <div className="ast-day-num">{isRtl ? `اليوم ${day.day}` : `Day ${day.day}`}</div>
            <h4 className="ast-day-title">{day.title}</h4>
            <div className="ast-day-duration">⏱️ {day.duration}</div>
            <ul className="ast-day-topics">
              {day.topics?.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
            {day.tips && <p className="ast-day-tip">💡 {day.tips}</p>}
          </div>
        ))}
      </div>

      {data.generalTips?.length > 0 && (
        <div className="ast-tips-section">
          <h4>🌟 {isRtl ? 'نصائح عام' : 'General Tips'}</h4>
          <ul className="ast-tips-list">
            {data.generalTips.map((tip, i) => <li key={i}>{tip}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

// ─── Loading Skeleton ─────────────────────────────────────────────────────
const LoadingState = ({ lang }) => (
  <div className="ast-loading">
    <div className="ast-loading-brain">🤖</div>
    <div className="ast-loading-text">
      {lang === 'ar' ? 'نشمي يحلل المادة...' : 'AI is analyzing your text...'}
    </div>
    <div className="ast-loading-dots"><span /><span /><span /></div>
    <div className="ast-loading-bars">
      {[...Array(4)].map((_, i) => <div key={i} className="ast-loading-bar" style={{ animationDelay: `${i * 0.15}s` }} />)}
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────
const AIStudyTools = () => {
  const { language } = useLanguage();
  const isRtl = language === 'ar';

  const [text, setText]               = useState('');
  const [lang, setLang]               = useState(language || 'ar');
  const [outputType, setOutputType]   = useState('quiz');
  const [questionCount, setQuestionCount] = useState(10);
  const [questionType, setQuestionType]   = useState('mcq');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState('');
  const resultRef = useRef(null);

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

  const handleGenerate = async () => {
    if (!text.trim() || text.trim().length < 50) {
      toast.error(isRtl ? 'الرجاء إدخال نص كافٍ (50 حرف على الأقل)' : 'Please enter sufficient text (at least 50 chars)');
      return;
    }
    setLoading(true);
    setResult(null);
    setError('');

    const res = await generateStudyMaterial({ text, language: lang, outputType, questionCount, questionType });

    setLoading(false);

    if (res.error) {
      const msgs = {
        API_KEY_MISSING:   isRtl ? 'مفتاح الذكاء الاصطناعي غير مضبوط. تواصل مع المسؤول.' : 'AI API key is not configured.',
        TEXT_TOO_SHORT:    isRtl ? 'النص قصير جداً.' : 'Text is too short.',
        TIMEOUT:           isRtl ? 'انتهت مهل الاتصال. حاول مجدداً.' : 'Request timed out. Please try again.',
        GENERATION_FAILED: isRtl ? 'حدث خطأ أثناء التوليد. حاول مجدداً.' : 'Generation failed. Please try again.',
      };
      setError(msgs[res.error] || res.error);
      toast.error(msgs[res.error] || res.error);
      return;
    }

    setResult(res);
    toast.success(isRtl ? '✅ تم التوليد بنجاح!' : '✅ Generated successfully!');
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.data, null, 2));
    toast.success(isRtl ? 'تم النس!' : 'Copied!');
  };

  const handlePrint = () => window.print();
  const handleReset = () => { setResult(null); setError(''); setText(''); };

  return (
    <div className="ast-page" dir={isRtl ? 'rtl' : 'ltr'}>

      {/* ── Hero ── */}
      <div className="ast-hero">
        <div className="ast-hero-glow" />
        <div className="ast-hero-content">
          <div className="ast-hero-badge">
            <span>🤖</span>
            <span>{isRtl ? 'مدعوم بالذكاء الاصطناعي' : 'AI-Powered'}</span>
          </div>
          <h1 className="ast-hero-title">
            {isRtl ? 'أدوات الدراسة الذكية' : 'AI Study Tools'}
          </h1>
          <p className="ast-hero-sub">
            {isRtl
              ? 'الصق نص المادة وسيقوم الذكاء الاصطناعي بتحويله إلى اختبار، ملخص، مخطط ذهني أو خطة دراسية!'
              : 'Paste your study material and AI will transform it into a quiz, summary, mind map, or study plan!'}
          </p>
          <div className="ast-hero-stats">
            <div className="ast-stat"><span>📝</span><span>{isRtl ? 'اختبارات' : 'Quizzes'}</span></div>
            <div className="ast-stat-divider" />
            <div className="ast-stat"><span>📋</span><span>{isRtl ? 'ملخصات' : 'Summaries'}</span></div>
            <div className="ast-stat-divider" />
            <div className="ast-stat"><span>🗺️</span><span>{isRtl ? 'مخططات' : 'Mind Maps'}</span></div>
            <div className="ast-stat-divider" />
            <div className="ast-stat"><span>📚</span><span>{isRtl ? 'خطط' : 'Plans'}</span></div>
          </div>
        </div>
      </div>

      {/* ── Main Card ── */}
      <div className="ast-main">
        <div className="ast-card">

          {/* Step 1: Text Input */}
          <div className="ast-step">
            <div className="ast-step-header">
              <div className="ast-step-num">1</div>
              <h2>{isRtl ? 'أدخل نص المادة' : 'Enter Study Material'}</h2>
            </div>
            <div className="ast-textarea-wrapper">
              <textarea
                className="ast-textarea"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={isRtl
                  ? 'الصق نص المحاضرة أو الكتاب أو الملاحظات هنا...\n\nمثال: "الشبكات العصبيةة هي نماذج حسابية مستوحاة من الدماغ البشري..."'
                  : 'Paste your lecture, book, or notes here...\n\nExample: "Neural networks are computational models inspired by the human brain..."'}
                rows={10}
              />
              <div className="ast-textarea-footer">
                <span className={`ast-word-count ${wordCount < 30 ? 'low' : wordCount < 100 ? 'mid' : 'good'}`}>
                  {wordCount} {isRtl ? 'كلمة' : 'words'}
                  {wordCount < 30 && ` — ${isRtl ? 'أضف المزيد للحصول على نتائج أفضل' : 'Add more for better results'}`}
                  {wordCount >= 30 && wordCount < 100 && ` — ${isRtl ? 'جيد' : 'Good'}`}
                  {wordCount >= 100 && ` — ${isRtl ? 'ممتاز!' : 'Excellent!'}`}
                </span>
              </div>
            </div>
          </div>

          {/* Step 2: Language */}
          <div className="ast-step">
            <div className="ast-step-header">
              <div className="ast-step-num">2</div>
              <h2>{isRtl ? 'لغة المخرج' : 'Output Language'}</h2>
            </div>
            <div className="ast-lang-btns">
              <button className={`ast-lang-btn ${lang === 'ar' ? 'active' : ''}`} onClick={() => setLang('ar')}>
                🇯🇴 {isRtl ? 'عربي' : 'Arabic'}
              </button>
              <button className={`ast-lang-btn ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>
                🇬🇧 English
              </button>
            </div>
          </div>

          {/* Step 3: Output Type */}
          <div className="ast-step">
            <div className="ast-step-header">
              <div className="ast-step-num">3</div>
              <h2>{isRtl ? 'نوع المخرج' : 'Output Type'}</h2>
            </div>
            <div className="ast-type-grid">
              {OUTPUT_TYPES.map(type => (
                <button
                  key={type.id}
                  className={`ast-type-card ${outputType === type.id ? 'active' : ''}`}
                  onClick={() => setOutputType(type.id)}
                >
                  <span className="ast-type-icon">{type.icon}</span>
                  <span className="ast-type-label">{isRtl ? type.labelAr : type.labelEn}</span>
                  <span className="ast-type-desc">{isRtl ? type.descAr : type.descEn}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 4: Quiz Options (conditional) */}
          {outputType === 'quiz' && (
            <div className="ast-step ast-step-quiz-opts">
              <div className="ast-step-header">
                <div className="ast-step-num">4</div>
                <h2>{isRtl ? 'خيارات الاختبار' : 'Quiz Options'}</h2>
              </div>
              <div className="ast-quiz-opts">
                <div className="ast-opt-group">
                  <label>{isRtl ? 'عدد الأسئلة' : 'Number of Questions'}</label>
                  <div className="ast-count-btns">
                    {[5, 10, 15, 20].map(n => (
                      <button key={n} className={`ast-count-btn ${questionCount === n ? 'active' : ''}`} onClick={() => setQuestionCount(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ast-opt-group">
                  <label>{isRtl ? 'نوع الأسئلة' : 'Question Type'}</label>
                  <div className="ast-qtype-btns">
                    {QUESTION_TYPES.map(qt => (
                      <button key={qt.id} className={`ast-qtype-btn ${questionType === qt.id ? 'active' : ''}`} onClick={() => setQuestionType(qt.id)}>
                        {isRtl ? qt.labelAr : qt.labelEn}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            className={`ast-generate-btn ${loading ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
          >
            {loading ? (
              <><span className="ast-spinner" />{isRtl ? 'جاري التوليد...' : 'Generating...'}</>
            ) : (
              <>🚀 {isRtl ? 'توليد الآن' : 'Generate Now'}</>
            )}
          </button>

        </div>

        {/* ── Result Section ── */}
        {loading && <LoadingState lang={lang} />}

        {error && !loading && (
          <div className="ast-error-box">
            <span>⚠️</span> {error}
          </div>
        )}

        {result && !loading && (
          <div className="ast-result-section" ref={resultRef}>
            <div className="ast-result-toolbar">
              <h2 className="ast-result-heading">
                {OUTPUT_TYPES.find(t => t.id === result.type)?.icon}{' '}
                {isRtl
                  ? OUTPUT_TYPES.find(t => t.id === result.type)?.labelAr
                  : OUTPUT_TYPES.find(t => t.id === result.type)?.labelEn}
              </h2>
              <div className="ast-toolbar-btns">
                <button className="ast-toolbar-btn" onClick={handleCopy} title={isRtl ? 'نس' : 'Copy'}>
                  <IconCopy />{isRtl ? 'نس' : 'Copy'}
                </button>
                <button className="ast-toolbar-btn" onClick={handlePrint} title={isRtl ? 'طباع' : 'Print'}>
                  <IconPrint />{isRtl ? 'طباع' : 'Print'}
                </button>
                <button className="ast-toolbar-btn reset" onClick={handleReset} title={isRtl ? 'إعاد' : 'Reset'}>
                  <IconReset />{isRtl ? 'إعاد' : 'Reset'}
                </button>
              </div>
            </div>

            <div className="ast-result-body">
              {result.type === 'quiz'    && <QuizResult    data={result.data} lang={lang} />}
              {result.type === 'summary' && <SummaryResult data={result.data} lang={lang} />}
              {result.type === 'mindmap' && <MindMapResult data={result.data} lang={lang} />}
              {result.type === 'plan'    && <StudyPlanResult data={result.data} lang={lang} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIStudyTools;
