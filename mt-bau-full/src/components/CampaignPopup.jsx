import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import './CampaignPopup.css';

const CampaignPopup = ({ isOpen, onClose }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();

    if (!isOpen) return null;

    const now = new Date();
    const campaignStart = new Date(now.getFullYear(), 6, 1, 9, 0, 0);
    const campaignIsOpen = now >= campaignStart;

    const title = campaignIsOpen
        ? t('campaign.title.open')
        : t('campaign.title.soon');

    const text = campaignIsOpen
        ? t('campaign.text.open')
        : t('campaign.text.soon');

    const handleAction = () => {
        navigate('/exchange');
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    className="campaign-popup-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                >
                    <motion.div
                        className="campaign-popup-card glass-card"
                        initial={{ scale: 0.88, opacity: 0, y: 24 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.88, opacity: 0, y: 24 }}
                        transition={{ duration: 0.35, ease: 'easeOut' }}
                    >
                        <div className="campaign-status-badge">
                            {campaignIsOpen ? t('campaign.badge.open') : t('campaign.badge.soon')}
                        </div>
                        <div className="campaign-icon">🎁</div>
                        <h3 className="campaign-title">{title}</h3>
                        <p className="campaign-text">{text}</p>

                        <div className="campaign-actions">
                            <button className="btn-campaign" onClick={handleAction}>
                                {campaignIsOpen ? t('campaign.button.open') : t('campaign.button.soon')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CampaignPopup;
