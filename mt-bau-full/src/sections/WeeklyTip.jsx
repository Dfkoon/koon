import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { tipsData, categories } from '../data/tipsData';
import './WeeklyTip.css';

const WeeklyTip = () => {
    const { t, language } = useLanguage();
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [currentTipIndex, setCurrentTipIndex] = useState(0);

    const tips = tipsData[language] || tipsData.ar;
    const categoryList = categories[language] || categories.ar;

    // Filter tips based on selected category
    const filteredTips = selectedCategory === 'all'
        ? tips
        : tips.filter(tip => tip.category === selectedCategory);

    const currentTip = filteredTips[currentTipIndex] || filteredTips[0];

    const handleNext = () => {
        setCurrentTipIndex((prev) => (prev + 1) % filteredTips.length);
    };

    const handlePrevious = () => {
        setCurrentTipIndex((prev) => (prev - 1 + filteredTips.length) % filteredTips.length);
    };

    const handleCategoryChange = (categoryId) => {
        setSelectedCategory(categoryId);
        setCurrentTipIndex(0); // Reset to first tip when changing category
    };

    return (
        <section id="weekly-tip" className="weekly-tip-section">
            <div className="section-header">
                <h2 className="section-title">{t('tip.title')}</h2>
                <p className="section-subtitle">{t('tip.subtitle')}</p>
            </div>

            {/* Category Filter */}
            <div className="tip-categories">
                {categoryList.map((category) => (
                    <button
                        key={category.id}
                        className={`category-btn ${selectedCategory === category.id ? 'active' : ''}`}
                        onClick={() => handleCategoryChange(category.id)}
                    >
                        <span className="category-emoji">{category.emoji}</span>
                        <span className="category-name">{category.name}</span>
                    </button>
                ))}
            </div>

            {/* Tip Card */}
            <div className="tip-container">
                <div className="tip-card glass-card">
                    <div className="tip-badge">
                        {categoryList.find(c => c.id === (currentTip?.category || 'study'))?.name}
                    </div>
                    <div className="tip-content">
                        <h3 className="tip-card-title">{currentTip?.title}</h3>
                        <p className="tip-card-desc">{currentTip?.description}</p>
                    </div>
                    <div className="tip-illustration">
                        <span className="tip-emoji">{currentTip?.emoji}</span>
                    </div>

                    {/* Navigation Buttons */}
                    <div className="tip-navigation">
                        <button
                            className="tip-nav-btn"
                            onClick={handlePrevious}
                            aria-label={language === 'ar' ? 'السابق' : 'Previous'}
                        >
                            {language === 'ar' ? '→' : '←'}
                        </button>
                        <span className="tip-counter">
                            {currentTipIndex + 1} / {filteredTips.length}
                        </span>
                        <button
                            className="tip-nav-btn"
                            onClick={handleNext}
                            aria-label={language === 'ar' ? 'التالي' : 'Next'}
                        >
                            {language === 'ar' ? '←' : '→'}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default WeeklyTip;
