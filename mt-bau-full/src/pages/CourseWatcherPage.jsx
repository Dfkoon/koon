import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import './CourseWatcherPage.css';

const CourseWatcherPage = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [activeTab, setActiveTab] = useState('embed');

  // Backend student URL (live Render deployment)
  const studentPortalUrl = 'https://bau-course-watcher.onrender.com/student';

  return (
    <div className="watcher-page-container">
      
      {/* Hero Header */}
      <section className="watcher-hero">
        <div className="watcher-hero-content">
          <motion.div 
            className="watcher-live-badge"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <span className="live-dot-pulse"></span>
            <span>{isAr ? 'نظام مراقبة جريدة المواد — جامعة البلقاء التطبيقية' : 'BAU Course Watcher Portal'}</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {isAr ? (
              <>مراقب <span className="highlight-text">الجريدة</span> والمواد المفتوحة</>
            ) : (
              <>BAU Course <span className="highlight-text">Watcher</span></>
            )}
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {isAr
              ? 'احصل على إشعارات فورية عبر البريد الإلكتروني بمجرد توفر شاغر في أي شعبة مادة مغلقة أو فتح شعب دراسية جديدة بجامعة البلقاء.'
              : 'Get instant email alerts as soon as a seat opens up in your closed university courses at BAU.'}
          </motion.p>

          {/* Action Header Buttons */}
          <motion.div 
            className="watcher-hero-actions"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <a 
              href={studentPortalUrl}
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn-hero-watcher-primary"
            >
              🚀 {isAr ? 'فتح المراقب في نافذة جديدة' : 'Open Watcher Portal'}
            </a>
            <button 
              onClick={() => setActiveTab('guide')} 
              className="btn-hero-watcher-secondary"
            >
              📖 {isAr ? 'طريقة الاستخدام' : 'How it Works'}
            </button>
          </motion.div>
        </div>
      </section>

      {/* Tabs Control */}
      <div className="watcher-main-content">
        <div className="watcher-tabs-bar">
          <button 
            className={`watcher-tab-btn ${activeTab === 'embed' ? 'active' : ''}`}
            onClick={() => setActiveTab('embed')}
          >
            🎓 {isAr ? 'واجهة الطلاب والتسجيل' : 'Student Watcher Portal'}
          </button>
          <button 
            className={`watcher-tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
            onClick={() => setActiveTab('guide')}
          >
            ℹ️ {isAr ? 'دليل الاستخدام والمميزات' : 'User Guide & Features'}
          </button>
        </div>

        {/* Tab 1: Embedded Student Portal */}
        {activeTab === 'embed' && (
          <motion.div 
            className="watcher-embed-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="embed-notice">
              <span>💡 {isAr ? 'يتم التنسيق مباشرة مع سيرفرات جامعة البلقاء. يمكنك الاشتراك وتصفح المواد أدناه:' : 'Connected live to BAU Course Watcher. Search and subscribe below:'}</span>
              <a href={studentPortalUrl} target="_blank" rel="noopener noreferrer" className="embed-direct-link">
                {isAr ? 'رابط مستقل ↗' : 'Direct Link ↗'}
              </a>
            </div>

            <div className="iframe-wrapper">
              <iframe 
                src={studentPortalUrl} 
                title="BAU Course Watcher Student"
                className="watcher-iframe"
              />
            </div>
          </motion.div>
        )}

        {/* Tab 2: Guide & Steps */}
        {activeTab === 'guide' && (
          <motion.div 
            className="watcher-guide-grid"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="guide-card">
              <div className="guide-num">1</div>
              <h3>{isAr ? 'أدخل اسمك وإيميلك الشخصي' : 'Enter Your Name & Email'}</h3>
              <p>{isAr ? 'سجل بريدك الإلكتروني ليصلك الإشعار فور توفر أي شاغر في شعبك.' : 'Provide your email to receive instant alerts when a seat becomes available.'}</p>
            </div>

            <div className="guide-card">
              <div className="guide-num">2</div>
              <h3>{isAr ? 'حدد الكلية والمادة' : 'Select College & Course'}</h3>
              <p>{isAr ? 'اختر الكلية أو حدد اسم مادة محددة برقم شعبتها لضبط التنبيهات بدقة.' : 'Filter notifications by specific colleges, courses, or section numbers.'}</p>
            </div>

            <div className="guide-card">
              <div className="guide-num">3</div>
              <h3>{isAr ? 'تلقَّ الإشعارات فوراً' : 'Receive Instant Notifications'}</h3>
              <p>{isAr ? 'سيقوم النظام بمراقبة الجريدة 24/7 وإرسال إيميل لك في ثوانٍ معدودة بمجرد فتح الشعبة.' : 'The system monitors 24/7 and emails you within seconds of a section opening.'}</p>
            </div>
          </motion.div>
        )}

      </div>

    </div>
  );
};

export default CourseWatcherPage;
