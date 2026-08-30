import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import './CourseWatcherSection.css';

const CourseWatcherSection = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const features = [
    {
      icon: '📡',
      title: isAr ? 'مراقبة آلية 24/7' : '24/7 Automated Monitoring',
      desc: isAr
        ? 'فحص آلي ومتواصل لجريدة مواد جامعة البلقاء التطبيقية لحساب الشعب المتاحة والمغلقة والمستحدثة.'
        : 'Continuous automated tracking of BAU course schedule for open, closed, and new sections.'
    },
    {
      icon: '⚡',
      title: isAr ? 'إشعارات بريدية فورية' : 'Instant Email Alerts',
      desc: isAr
        ? 'تلقَّ إشعاراً فورياً على إيميلك الشخصي بمجرد توفر شاغر في موادك المفضلة لتسجيلها فوزاً.'
        : 'Receive instant email notifications as soon as a seat opens in your desired courses.'
    },
    {
      icon: '🎯',
      title: isAr ? 'فلترة حسب الكلية والمادة' : 'College & Course Filters',
      desc: isAr
        ? 'خصّص تنبيهاتك بدقة عبر اختيار الكليات التي تهمك أو تحديد مادة ورقم شعبة معين.'
        : 'Customize your alerts by selecting specific colleges, course names, or section numbers.'
    },
    {
      icon: '🕒',
      title: isAr ? 'مواعيد 12 ساعة سهلة' : '12-Hour Human Times',
      desc: isAr
        ? 'تحويل صيغ المواعيد المعقدة إلى توقيت 12 ساعة واضح مع بيان طبيعة المادة (وجاهي / مدمج / إلكتروني).'
        : 'Translates technical schedule strings into clean 12-hour formats with study mode indicators.'
    }
  ];

  return (
    <section className="course-watcher-section" id="course-watcher">
      <div className="cws-container">
        
        {/* Top Header Badge */}
        <motion.div 
          className="cws-badge"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <span className="cws-dot"></span>
          <span>{isAr ? 'مباشر ⚡ نظام مراقب الجريدة الآلي — جامعة البلقاء' : 'LIVE ⚡ BAU Course Watcher System'}</span>
        </motion.div>

        {/* Section Heading */}
        <motion.h2 
          className="cws-title"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {isAr ? (
            <>لا تفوت فرصتك بتسجيل موادك المفضلة مع <span className="highlight">مراقب الجريدة</span></>
          ) : (
            <>Never Miss Your Course Seats With <span className="highlight">BAU Course Watcher</span></>
          )}
        </motion.h2>

        <motion.p 
          className="cws-subtitle"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {isAr
            ? 'نظام ذكي متكامل يرصد التغيرات في جريدة المواد بجامعة البلقاء التطبيقية لحظة بلحظة، ويرسل لك إشعاراً فورياً عند فتح أي شعبة أو توفر شاغر لضمان جدولك الأكاديمي المثالي.'
            : 'An intelligent system monitoring course section availability at Al-Balqa Applied University in real-time and notifying you instantly when a seat opens up.'}
        </motion.p>

        {/* Features Grid */}
        <div className="cws-grid">
          {features.map((feat, idx) => (
            <motion.div 
              key={idx}
              className="cws-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 * idx }}
              whileHover={{ y: -6 }}
            >
              <div className="cws-card-icon">{feat.icon}</div>
              <h3 className="cws-card-title">{feat.title}</h3>
              <p className="cws-card-desc">{feat.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Call to Action Container */}
        <motion.div 
          className="cws-cta-container"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="cws-cta-content">
            <h3>{isAr ? 'جاهز لمراقبة موادك الأكاديمية؟' : 'Ready to Track Your Courses?'}</h3>
            <p>
              {isAr 
                ? 'انضم للطلاب واستفد من نظام المراقبة التلقائي مجاناً وسجل موادك فور توفرها!' 
                : 'Join fellow students and take advantage of free real-time automated course notifications!'}
            </p>
          </div>
          <div className="cws-cta-buttons">
            <Link to="/watcher" className="btn-cws-primary">
              <span className="btn-icon">🎓</span>
              <span>{isAr ? 'دخول الطلاب لمراقب الجريدة' : 'Student Course Watcher Portal'}</span>
            </Link>
            <a 
              href="https://bau-course-watcher.onrender.com/student" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn-cws-secondary"
            >
              <span className="btn-icon">🚀</span>
              <span>{isAr ? 'الرابط المباشر للمراقب' : 'Direct Watcher Portal'}</span>
            </a>
          </div>
        </motion.div>

      </div>
    </section>
  );
};

export default CourseWatcherSection;
