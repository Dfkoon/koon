import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './KeyboardShortcutsHelp.css';

const SHORTCUTS = [
    { keys: ['Ctrl', 'K'], keysAr: ['Ctrl', 'K'], labelAr: 'فتح البحث العام', labelEn: 'Open global search' },
    { keys: ['?'], keysAr: ['?'], labelAr: 'عرض اختصارات لوح المفاتيح', labelEn: 'Show keyboard shortcuts' },
    { keys: ['Esc'], keysAr: ['Esc'], labelAr: 'إغلاق أي نافذ مفتوح', labelEn: 'Close any open modal' },
    { keys: ['Alt', '←'], keysAr: ['Alt', '→'], labelAr: 'العود للصفح السابق', labelEn: 'Go back to previous page' },
    { keys: ['Alt', '→'], keysAr: ['Alt', '←'], labelAr: 'الذهاب للصفح التالي', labelEn: 'Go forward to next page' },
];

const KeyboardShortcutsHelp = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = (e) => {
            if (
                e.key === '?' &&
                document.activeElement.tagName !== 'INPUT' &&
                document.activeElement.tagName !== 'TEXTAREA'
            ) {
                setOpen(prev => !prev);
            }
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    if (!open) return null;

    return (
        <div className="kb-shortcuts-overlay" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
            <div className="kb-shortcuts-modal glass-card" onClick={e => e.stopPropagation()}>
                <div className="kb-header">
                    <h2 className="kb-title">⌨️ {isAr ? 'اختصارات لوح المفاتيح' : 'Keyboard Shortcuts'}</h2>
                    <button className="kb-close-btn" onClick={() => setOpen(false)} aria-label="Close">×</button>
                </div>
                <div className="kb-list">
                    {SHORTCUTS.map((s, i) => (
                        <div key={i} className="kb-item">
                            <div className="kb-keys">
                                {(isAr ? s.keysAr : s.keys).map((k, ki) => (
                                    <React.Fragment key={ki}>
                                        <kbd className="kb-key">{k}</kbd>
                                        {ki < s.keys.length - 1 && <span className="kb-plus">+</span>}
                                    </React.Fragment>
                                ))}
                            </div>
                            <span className="kb-label">{isAr ? s.labelAr : s.labelEn}</span>
                        </div>
                    ))}
                </div>
                <p className="kb-footer-note">
                    {isAr ? 'اضغط على ? أو Esc للإغلاق' : 'Press ? or Esc to close'}
                </p>
            </div>
        </div>
    );
};

export default KeyboardShortcutsHelp;
