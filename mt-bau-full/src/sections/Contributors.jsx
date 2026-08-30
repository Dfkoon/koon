import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './Contributors.css';

const Contributors = () => {
    const { t } = useLanguage();

    return (
        <section id="contributors" className="contributors-section">
            <div className="section-header">
                <h2 className="section-title">{t('contributors.title')}</h2>
                <p className="section-subtitle">{t('contributors.subtitle')}</p>
            </div>

            <div className="contributors-soon-container glass-card">
                {/* Supporters Section Inside */}


                {/* Original Contribution Invitation */}
                <div className="soon-icon">🏆</div>
                <p className="invitation-text">{t('contributors.invitation')}</p>
                <div className="contribute-hint">
                    {t('materials.contribution.text')}
                </div>
            </div>

            <div className="contributors-footer">
                <p className="thanks-message">{t('contributors.thanks')}</p>
            </div>
        </section>
    );
};

export default Contributors;
