import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { faqData } from '../data/faqData';
import './FAQ.css';

// دالة لتطبيع النصوص العربية وتوحيد الهمزات والتاء المربوطة لتسهيل البحث
const normalizeArabic = (text) => {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
        .replace(/[أإآ]/g, 'ا') // توحيد الألفات
        .replace(/ة/g, 'ه') // توحيد التاء المربوطة والهاء
        .replace(/ى/g, 'ي') // توحيد الياء والألف المقصورة
        .replace(/[،,.\-_\(\)\/\\:;]/g, ' ') // إزالة الفواصل والرموز
        .replace(/\s+/g, ' ')
        .trim();
};

const FAQ = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [searchTerm, setSearchTerm] = useState('');
    const [openIndex, setOpenIndex] = useState(null);

    const toggleAccordion = (id) => {
        setOpenIndex(openIndex === id ? null : id);
    };

    // محرك بحث ذكي وشامل يبحث في العناوين والأسئلة والإجابات
    const displayedFAQs = useMemo(() => {
        const cleanTerm = normalizeArabic(searchTerm);
        if (!cleanTerm) return faqData;

        // تقسيم كلمات البحث لدعم البحث متعدد الكلمات (Multi-word search)
        const searchKeywords = cleanTerm.split(' ').filter(k => k.length > 0);

        const filtered = {};
        Object.keys(faqData).forEach(key => {
            const category = faqData[key];
            const catTitleNorm = normalizeArabic(category.title[language] || '');

            // فحص مطابقة الأسئلة والإجابات
            const matchingQuestions = category.questions.filter(q => {
                const questionTextNorm = normalizeArabic(q.q[language] || '');
                const answerTextNorm = normalizeArabic(q.a[language] || '');
                const fullItemText = `${catTitleNorm} ${questionTextNorm} ${answerTextNorm}`;

                // يجب أن تتطابق كل كلمة بحثية في أي جزء من السؤال أو الإجابة أو اسم القسم
                return searchKeywords.every(keyword => fullItemText.includes(keyword));
            });

            if (matchingQuestions.length > 0) {
                filtered[key] = { ...category, questions: matchingQuestions };
            }
        });
        return filtered;
    }, [searchTerm, language]);

    const categories = Object.keys(displayedFAQs);
    const totalResultsCount = useMemo(() => {
        return categories.reduce((sum, catKey) => sum + (displayedFAQs[catKey]?.questions?.length || 0), 0);
    }, [categories, displayedFAQs]);

    return (
        <div className="faq-page">
            <div className="faq-hero">
                <div className="hero-overlay"></div>
                <div className="faq-hero-content">
                    <motion.div 
                        className="faq-badge"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        <span>{isAr ? 'مركز المساعدة والاستفسارات' : 'Help & Inquiries Center'}</span>
                    </motion.div>
                    
                    <motion.h1
                        initial={{ opacity: 0, y: -15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        {isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
                    </motion.h1>
                    
                    <motion.p
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        {isAr ? 'دليلك الشامل لتعليمات المكرمة الملكية، القروض، المنح وخدمات الجامعة' : 'Your comprehensive guide to Royal Grants, Loans, and University Services'}
                    </motion.p>

                    <div className="faq-search">
                        <span className="search-icon">🔍</span>
                        <input
                            type="text"
                            placeholder={isAr ? 'ابحث في كافة الأسئلة، المكرمة، الجسيم، القروض، الشروط...' : 'Search all questions, grants, loans, requirements...'}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button className="clear-search-btn" onClick={() => setSearchTerm('')} title={isAr ? 'مسح البحث' : 'Clear search'}>
                                ✕
                            </button>
                        )}
                    </div>

                    {searchTerm && (
                        <motion.div 
                            className="search-stats-badge"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            {isAr 
                                ? `تم العثور على (${totalResultsCount}) إجابة مطابقة`
                                : `Found (${totalResultsCount}) matching answers`}
                        </motion.div>
                    )}
                </div>
            </div>

            <div className="faq-content">
                {categories.length === 0 ? (
                    <div className="no-results">
                        <div className="no-results-icon">🔎</div>
                        <h3>{isAr ? 'لم نتمكن من العثور على نتائج' : 'No matching results found'}</h3>
                        <p>{isAr ? 'جرب البحث بكلمات أخرى أو تصفح الأقسام مباشرة' : 'Try searching with different keywords or browse sections directly'}</p>
                        {searchTerm && (
                            <button className="btn-reset-search" onClick={() => setSearchTerm('')}>
                                {isAr ? 'عرض جميع الأسئلة' : 'Show All Questions'}
                            </button>
                        )}
                    </div>
                ) : (
                    categories.map(catKey => {
                        const category = displayedFAQs[catKey];
                        return (
                            <div key={catKey} className="faq-category">
                                <div className="faq-category-header">
                                    <h2>{category.title[language]}</h2>
                                    <span className="category-count">{category.questions.length} {isAr ? 'سؤال' : 'questions'}</span>
                                </div>
                                <div className="faq-list">
                                    {category.questions.map(item => {
                                        const isOpen = openIndex === item.id || (searchTerm.trim().length > 1);
                                        return (
                                            <div key={item.id} className={`faq-item ${isOpen ? 'active' : ''}`}>
                                                <button
                                                    className="faq-question"
                                                    onClick={() => toggleAccordion(item.id)}
                                                >
                                                    <span className="question-text">{item.q[language]}</span>
                                                    <span className="faq-icon">{isOpen ? '−' : '+'}</span>
                                                </button>
                                                <AnimatePresence>
                                                    {isOpen && (
                                                        <motion.div
                                                            className="faq-answer"
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            transition={{ duration: 0.25 }}
                                                        >
                                                            <div className="answer-text">
                                                                {item.a[language].split('\n').map((line, idx) => (
                                                                    <p key={idx} style={{ marginBottom: line.trim() ? '8px' : '4px' }}>
                                                                        {line}
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default FAQ;
