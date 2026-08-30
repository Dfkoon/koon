import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import './GraduationPromo.css';

const GraduationPromo = () => {
  const { t } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);

  const ads = [
    {
      id: 'horizon',
      badge: t('promo.horizon.badge'),
      title: t('promo.horizon.title'),
      highlight: t('promo.horizon.highlight'),
      description: t('promo.horizon.desc'),
      ctaText: t('promo.horizon.cta'),
      ctaIcon: '📲',
      ctaLink: 'https://wa.me/962798421524',
      secondaryText: t('promo.horizon.secondary'),
      secondaryIcon: '📸',
      secondaryLink: 'https://www.instagram.com/p/DUqUOoYjMyD/',
      phone: '0798421524',
      type: 'book'
    },
    {
      id: 'nabdh',
      badge: t('promo.nabdh.badge'),
      title: t('promo.nabdh.title'),
      highlight: t('promo.nabdh.highlight'),
      description: t('promo.nabdh.desc'),
      tasks: [
        t('promo.nabdh.task1'),
        t('promo.nabdh.task2'),
        t('promo.nabdh.task3'),
        t('promo.nabdh.task4')
      ],
      quote: t('promo.nabdh.quote'),
      ctaText: t('promo.nabdh.cta'),
      ctaIcon: '🤝',
      ctaLink: 'https://chat.whatsapp.com/KdxQ3L1aDQfAK7azrXcxE7',
      secondaryText: t('promo.nabdh.secondary'),
      secondaryIcon: '📌',
      secondaryLink: '#',
      type: 'charity'
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % ads.length);
    }, 10000); // Change every 10 seconds
    return () => clearInterval(timer);
  }, []);

  const currentAd = ads[currentIndex];

  return (
    <section className="graduation-promo">
      <div className="promo-container">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentAd.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5 }}
            className={`promo-content glass-card ${currentAd.type}-layout`}
          >
            {currentAd.type === 'book' && (
              <div className="promo-image-side">
                <div className="main-image-wrapper">
                  <div className="promo-image-wrapper">
                    <img 
                      src="ofoq_designs_official.png" 
                      alt="Ofoq Designs Official" 
                      className="promo-image-real"
                      onError={(e) => {
                        e.target.src = "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?q=80&w=1000&auto=format&fit=crop";
                      }}
                    />
                  </div>
                  <div className="image-overlay-glow"></div>
                </div>
              </div>
            )}
            
            <div className="promo-text-side">
              {currentAd.type === 'charity' && (
                <div className="corner-logo">
                  <svg viewBox="0 0 400 300" className="corner-svg">
                    <defs>
                      <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style={{ stopColor: '#14b8a6' }} />
                        <stop offset="100%" style={{ stopColor: '#0d9488' }} />
                      </linearGradient>
                    </defs>
                    <path d="M200 210 C130 140 130 80 200 80 C270 80 270 140 200 210" fill="url(#heartGradient)" />
                    <path d="M175 155 Q200 180 225 155" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              <div className="promo-badge">{currentAd.badge}</div>
              <h2 className="promo-title">
                {currentAd.title} 
                <span className="highlight">{currentAd.highlight}</span>
              </h2>
              
              {currentAd.tasks ? (
                <ul className="promo-tasks-list">
                  {currentAd.tasks.map((task, i) => (
                    <li key={i}>✅ {task}</li>
                  ))}
                  <div className="promo-quote">{currentAd.quote}</div>
                </ul>
              ) : (
                <p className="promo-description">{currentAd.description}</p>
              )}
              
              <div className="promo-actions">
                <a href={currentAd.ctaLink} target="_blank" rel="noopener noreferrer" className="promo-cta-btn">
                  <span className="btn-icon">{currentAd.ctaIcon}</span>
                  {currentAd.ctaText}
                </a>
                
                <a href={currentAd.secondaryLink} target="_blank" rel="noopener noreferrer" className="promo-secondary-btn">
                  <span className="btn-icon">{currentAd.secondaryIcon}</span>
                  {currentAd.secondaryText}
                </a>
              </div>
              
              <div className="promo-footer">
                {currentAd.phone && (
                  <div className="promo-contact-info">
                    <span className="phone-label">{t('promo.contact.label')}</span>
                    <span className="phone-number">{currentAd.phone}</span>
                  </div>
                )}
                <div className="slider-dots">
                  {ads.map((_, i) => (
                    <div 
                      key={i} 
                      className={`dot ${i === currentIndex ? 'active' : ''}`}
                      onClick={() => setCurrentIndex(i)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};

export default GraduationPromo;
