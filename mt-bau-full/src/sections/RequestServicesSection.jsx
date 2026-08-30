import React, { useState, useRef } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import './RequestServicesSection.css';

/* ─── Service Types ─────────────────────────────── */
const SERVICES = [
  {
    id: 'summary',
    icon: '📝',
    label: 'ملص مادة',
    color: '#d32f2f',
    colorLight: 'rgba(211,47,47,0.08)',
    description: 'احصل على ملص احترافي لأي مادة دراسي',
    fields: ['studentName', 'studentPhone', 'subject', 'materialLink', 'notes'],
  },
  {
    id: 'quiz',
    icon: '❓',
    label: 'إنشاء أسئلة',
    color: '#1565c0',
    colorLight: 'rgba(21,101,192,0.08)',
    description: 'نصمم لك أسئلة مناسب لمادتك ونمطك المطلوب',
    fields: ['studentName', 'studentPhone', 'subject', 'questionStyle', 'questionCount', 'notes'],
  },
  {
    id: 'idea',
    icon: '💡',
    label: 'اقتراح فكر',
    color: '#e65100',
    colorLight: 'rgba(230,81,0,0.08)',
    description: 'شارك فكرتك البرمجي ونساعدك على تطويرها',
    fields: ['studentName', 'studentPhone', 'ideaTitle', 'ideaDetails', 'techStack', 'notes'],
  },
  {
    id: 'other',
    icon: '🚀',
    label: 'طلب آر',
    color: '#2e7d32',
    colorLight: 'rgba(46,125,50,0.08)',
    description: 'أي طلب آر تريده من فريقنا',
    fields: ['studentName', 'studentPhone', 'requestTitle', 'requestDetails', 'notes'],
  },
];

const QUESTION_STYLES = [
  'اختيار من متعدد (MCQ)',
  'صح وطأ',
  'أسئلة مقالي',
  'أسئلة قصير',
  'حل مسائل / تمارين',
  'متلط',
];

/* ─── Field Helper Component ─────────────────────── */
const Field = ({ label, required, children }) => (
  <div className="rss-field">
    <label className="rss-label">
      {label} {required && <span className="rss-required">*</span>}
    </label>
    {children}
  </div>
);

export default function RequestServicesSection() {
  const [active, setActive] = useState(null);
  const [form, setForm] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const formRef = useRef(null);

  const service = SERVICES.find(s => s.id === active);

  const handleSelect = (id) => {
    setActive(id);
    setForm({});
    setSubmitted(false);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.studentName?.trim()) {
      toast.error('يرجى كتاب اسمك الكريم');
      return;
    }
    if (!form.studentPhone?.trim()) {
      toast.error('يرجى كتاب رقم التواصل (واتساب)');
      return;
    }

    if (service.id === 'summary' && !form.subject?.trim()) {
      toast.error('يرجى تحديد اسم المادة');
      return;
    }
    if (service.id === 'quiz' && !form.subject?.trim()) {
      toast.error('يرجى تحديد اسم المادة');
      return;
    }
    if (service.id === 'idea' && (!form.ideaTitle?.trim() || !form.ideaDetails?.trim())) {
      toast.error('يرجى كتاب عنوان الفكر وتفاصيلها');
      return;
    }
    if (service.id === 'other' && (!form.requestTitle?.trim() || !form.requestDetails?.trim())) {
      toast.error('يرجى كتاب عنوان الطلب وتفاصيله');
      return;
    }

    setLoading(true);
    const createdAtIso = new Date().toISOString();
    const payload = {
      serviceId: service.id,
      serviceLabel: service.label,
      studentName: form.studentName.trim(),
      studentPhone: form.studentPhone.trim(),
      subject: form.subject?.trim() || '',
      materialLink: form.materialLink?.trim() || '',
      questionStyle: form.questionStyle || '',
      questionCount: form.questionCount || null,
      ideaTitle: form.ideaTitle?.trim() || '',
      ideaDetails: form.ideaDetails?.trim() || '',
      techStack: form.techStack?.trim() || '',
      requestTitle: form.requestTitle?.trim() || '',
      requestDetails: form.requestDetails?.trim() || '',
      notes: form.notes?.trim() || '',
      status: 'new', // new | in_progress | completed | cancelled
      createdAt: createdAtIso,
    };

    try {
      await addDoc(collection(db, 'service_requests'), payload);
    } catch (err) {
      console.warn('Cloud save fallback triggered:', err?.message || err);
      // Backup store in localStorage
      try {
        const existing = JSON.parse(localStorage.getItem('koon_local_service_requests') || '[]');
        existing.unshift({ id: `local-${Date.now()}`, ...payload });
        localStorage.setItem('koon_local_service_requests', JSON.stringify(existing));
      } catch (localErr) {
        console.error('LocalStorage fallback error:', localErr);
      }
    } finally {
      setLoading(false);
      setSubmitted(true);
      toast.success('تم إرسال طلبك بنجاح!');
    }
  };

  return (
    <section className="rss-section" id="request-services">
      {/* Header */}
      <div className="rss-header">
        <div className="rss-badge">✨ خدمات الفريق</div>
        <h2 className="rss-title">اطلب ما تحتاجه</h2>
        <p className="rss-subtitle">
          سواء ملص مادة، إنشاء أسئلة، أو اقتراح فكر — نحن هنا لمساعدتك
        </p>
      </div>

      {/* Service Cards */}
      <div className="rss-cards">
        {SERVICES.map(s => (
          <button
            key={s.id}
            className={`rss-card ${active === s.id ? 'rss-card--active' : ''}`}
            style={{ '--card-color': s.color, '--card-bg': s.colorLight }}
            onClick={() => handleSelect(s.id)}
          >
            <span className="rss-card-icon">{s.icon}</span>
            <span className="rss-card-label">{s.label}</span>
            <span className="rss-card-desc">{s.description}</span>
            {active === s.id && <span className="rss-card-check">✓</span>}
          </button>
        ))}
      </div>

      {/* Form Panel */}
      {service && (
        <div className="rss-form-wrap" ref={formRef}>
          <div className="rss-form-card" style={{ '--card-color': service.color }}>

            {/* Form Header */}
            <div className="rss-form-header">
              <span className="rss-form-icon">{service.icon}</span>
              <div>
                <h3 className="rss-form-title">{service.label}</h3>
                <p className="rss-form-sub">{service.description}</p>
              </div>
            </div>

            {submitted ? (
              /* Success State */
              <div className="rss-success">
                <div className="rss-success-icon">🎉</div>
                <h4>تم إرسال طلبك بنجاح!</h4>
                <p>تم حفظ طلبك وسيتواصل معك فريق العمل في أقرب وقت ممكن عبر الواتساب.</p>
                <button
                  className="rss-btn-ghost"
                  onClick={() => { setSubmitted(false); setForm({}); setActive(null); }}
                >
                  إرسال طلب جديد
                </button>
              </div>
            ) : (
              <form className="rss-form" onSubmit={handleSubmit} noValidate>

                {/* ── Student Basic Info (Always Included) ── */}
                <div className="rss-form-row">
                  <Field label="اسم الطالب / الطالب" required>
                    <input className="rss-input" placeholder="اسمك الثلاثي..." required
                      value={form.studentName || ''} onChange={e => set('studentName', e.target.value)} />
                  </Field>
                  <Field label="رقم التواصل (واتساب)" required>
                    <input className="rss-input" placeholder="079XXXXXXXX أو +9627XXXXXXXX" required dir="ltr"
                      value={form.studentPhone || ''} onChange={e => set('studentPhone', e.target.value)} />
                  </Field>
                </div>

                {/* ── SUMMARY fields ── */}
                {service.id === 'summary' && <>
                  <Field label="اسم المادة" required>
                    <input className="rss-input" placeholder="مثال: تحليل عددي، هياكل بيانات..." required
                      value={form.subject || ''} onChange={e => set('subject', e.target.value)} />
                  </Field>
                  <Field label="رابط المادة / الكتاب">
                    <input className="rss-input" placeholder="https://... (اختياري)" dir="ltr"
                      value={form.materialLink || ''} onChange={e => set('materialLink', e.target.value)} />
                  </Field>
                  <Field label="ملاحظات أو نقاط تريد التركيز عليها">
                    <textarea className="rss-textarea" rows={4}
                      placeholder="مثال: أريد التركيز على الفصل الثالث، أو أسلوب مبسط..."
                      value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
                  </Field>
                </>}

                {/* ── QUIZ fields ── */}
                {service.id === 'quiz' && <>
                  <Field label="اسم المادة" required>
                    <input className="rss-input" placeholder="مثال: قواعد بيانات، برمجة متقدم..." required
                      value={form.subject || ''} onChange={e => set('subject', e.target.value)} />
                  </Field>
                  <Field label="نمط الأسئلة">
                    <div className="rss-chips">
                      {QUESTION_STYLES.map(style => (
                        <button type="button" key={style}
                          className={`rss-chip ${form.questionStyle === style ? 'rss-chip--active' : ''}`}
                          onClick={() => set('questionStyle', style)}>
                          {style}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="عدد الأسئلة المطلوب">
                    <div className="rss-count-row">
                      {[5, 10, 15, 20, 25, 30].map(n => (
                        <button type="button" key={n}
                          className={`rss-count-btn ${form.questionCount === n ? 'rss-count-btn--active' : ''}`}
                          onClick={() => set('questionCount', n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="ملاحظات إضافي">
                    <textarea className="rss-textarea" rows={3}
                      placeholder="مثال: يوجد كتاب معين أو نقاط محدد أريد الأسئلة منها..."
                      value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
                  </Field>
                </>}

                {/* ── IDEA fields ── */}
                {service.id === 'idea' && <>
                  <Field label="عنوان الفكر" required>
                    <input className="rss-input" placeholder="مثال: تطبيق لإدار الجدول الدراسي..." required
                      value={form.ideaTitle || ''} onChange={e => set('ideaTitle', e.target.value)} />
                  </Field>
                  <Field label="تفاصيل الفكر" required>
                    <textarea className="rss-textarea" rows={5} required
                      placeholder="اشرح فكرتك بالتفصيل: ما المشكل التي تحلها؟ من هم المستدمون؟ ما المميزات الأساسي؟"
                      value={form.ideaDetails || ''} onChange={e => set('ideaDetails', e.target.value)} />
                  </Field>
                  <Field label="التقنيات المفضل (اختياري)">
                    <input className="rss-input" placeholder="مثال: React, Firebase, Python..."
                      value={form.techStack || ''} onChange={e => set('techStack', e.target.value)} />
                  </Field>
                  <Field label="ملاحظات أرى">
                    <textarea className="rss-textarea" rows={2}
                      placeholder="أي معلومات إضافي تريد إضافتها..."
                      value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
                  </Field>
                </>}

                {/* ── OTHER fields ── */}
                {service.id === 'other' && <>
                  <Field label="عنوان الطلب" required>
                    <input className="rss-input" placeholder="اكتب عنواناً متصراً لطلبك..." required
                      value={form.requestTitle || ''} onChange={e => set('requestTitle', e.target.value)} />
                  </Field>
                  <Field label="تفاصيل الطلب" required>
                    <textarea className="rss-textarea" rows={5} required
                      placeholder="اشرح طلبك بالتفصيل قدر الإمكان..."
                      value={form.requestDetails || ''} onChange={e => set('requestDetails', e.target.value)} />
                  </Field>
                  <Field label="ملاحظات إضافي">
                    <textarea className="rss-textarea" rows={2}
                      placeholder="أي معلومات إضافي..."
                      value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
                  </Field>
                </>}

                {/* Submit Button */}
                <button type="submit" className="rss-btn-submit" disabled={loading}
                  style={{ '--card-color': service.color }}>
                  {loading ? (
                    <><span className="rss-spinner" /> جاري حفظ الطلب...</>
                  ) : (
                    <>{service.icon} إرسال الطلب الآن</>
                  )}
                </button>

              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
