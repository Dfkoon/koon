import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './AcademicCountdown.css';

const EVENTS = [
  {
    id: 'drop-add',
    titleAr: 'فتر السحب والإضاف الفصلي',
    titleEn: 'Drop & Add Period',
    date: '2026-08-25T08:30:00',
    icon: '🔄',
    badgeAr: 'هام جداً',
    badgeEn: 'Very Important',
    color: '#3b82f6'
  },
  {
    id: 'midterms',
    titleAr: 'امتحانات المنتصف (الميد)',
    titleEn: 'Midterm Exams',
    date: '2026-09-15T09:00:00',
    icon: '📝',
    badgeAr: 'قريباً',
    badgeEn: 'Upcoming',
    color: '#f59e0b'
  },
  {
    id: 'finals',
    titleAr: 'الامتحانات النهائي (الفاينل)',
    titleEn: 'Final Examinations',
    date: '2026-11-10T09:00:00',
    icon: '🎓',
    badgeAr: 'الحدث الأكبر',
    badgeEn: 'Major Event',
    color: '#e02b20'
  }
];

const addToGoogleCalendar = (event, isAr) => {
  const title = encodeURIComponent(isAr ? event.titleAr : event.titleEn);
  const start = new Date(event.date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const end = new Date(new Date(event.date).getTime() + 2 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${encodeURIComponent('مكانك الجامعي | MT.BAU')}`;
  window.open(url, '_blank', 'noopener,noreferrer');
};

const AcademicCountdown = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isPast, setIsPast] = useState(false);

  const activeEvent = EVENTS[activeEventIndex];

  useEffect(() => {
    const calculateTime = () => {
      const target = new Date(activeEvent.date).getTime();
      const now = new Date().getTime();
      const difference = target - now;

      if (difference > 0) {
        setIsPast(false);
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);
        setTimeLeft({ days, hours, minutes, seconds });
      } else {
        setIsPast(true);
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [activeEventIndex]);

  return (
    <div className="academic-countdown-card" style={{ '--event-color': activeEvent.color }}>
      <div className="countdown-header">
        <div className="title-with-icon">
          <span className="event-icon">{activeEvent.icon}</span>
          <div>
            <h3>{isAr ? activeEvent.titleAr : activeEvent.titleEn}</h3>
            <div className="countdown-meta-row">
              <span className="event-badge">{isAr ? activeEvent.badgeAr : activeEvent.badgeEn}</span>
              <span className="event-date-str">
                {new Date(activeEvent.date).toLocaleDateString(isAr ? 'ar-JO' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        <div className="countdown-header-actions">
          <div className="event-selector-tabs">
            {EVENTS.map((ev, idx) => (
              <button
                key={ev.id}
                className={`event-tab ${idx === activeEventIndex ? 'active' : ''}`}
                onClick={() => setActiveEventIndex(idx)}
                title={isAr ? ev.titleAr : ev.titleEn}
                style={idx === activeEventIndex ? { '--tab-color': ev.color } : {}}
              >
                {ev.icon}
              </button>
            ))}
          </div>
          <button
            className="add-to-calendar-btn"
            onClick={() => addToGoogleCalendar(activeEvent, isAr)}
            title={isAr ? 'أضف لـ Google Calendar' : 'Add to Google Calendar'}
          >
            📅 {isAr ? 'أضف للتقويم' : 'Add to Calendar'}
          </button>
        </div>
      </div>

      {isPast ? (
        <div className="countdown-past-msg">
          ✅ {isAr ? 'انتهى هذا الحدث. ترقّب القادم!' : 'This event has passed. Stay tuned for the next one!'}
        </div>
      ) : (
        <div className="countdown-timer-grid">
          {[
            { val: timeLeft.days, labelAr: 'يوم', labelEn: 'Days' },
            { val: timeLeft.hours, labelAr: 'ساع', labelEn: 'Hours' },
            { val: timeLeft.minutes, labelAr: 'دقيق', labelEn: 'Min' },
            { val: timeLeft.seconds, labelAr: 'ثاني', labelEn: 'Sec' },
          ].map(({ val, labelAr, labelEn }) => (
            <div className="timer-box" key={labelEn}>
              <span className="number">{String(val).padStart(2, '0')}</span>
              <span className="label">{isAr ? labelAr : labelEn}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AcademicCountdown;
