import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './ExamTimer.css';

/**
 * ExamTimer – A Pomodoro-style study/exam timer
 * Modes: Study (25 min), Short Break (5 min), Custom
 */
const MODES = [
    { id: 'study', labelAr: 'جلس دراس', labelEn: 'Study Session', minutes: 25, color: '#e02b20' },
    { id: 'short', labelAr: 'استراح قصير', labelEn: 'Short Break', minutes: 5, color: '#10b981' },
    { id: 'long', labelAr: 'استراح طويل', labelEn: 'Long Break', minutes: 15, color: '#3b82f6' },
];

const ExamTimer = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';

    const [modeIdx, setModeIdx] = useState(0);
    const [secondsLeft, setSecondsLeft] = useState(MODES[0].minutes * 60);
    const [running, setRunning] = useState(false);
    const [customMin, setCustomMin] = useState('');
    const [showCustom, setShowCustom] = useState(false);
    const [completed, setCompleted] = useState(0);
    const intervalRef = useRef(null);

    const mode = MODES[modeIdx];
    const totalSeconds = showCustom && customMin ? parseInt(customMin) * 60 : mode.minutes * 60;
    const progress = totalSeconds > 0 ? ((totalSeconds - secondsLeft) / totalSeconds) * 100 : 0;

    useEffect(() => {
        if (running) {
            intervalRef.current = setInterval(() => {
                setSecondsLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(intervalRef.current);
                        setRunning(false);
                        setCompleted(c => c + 1);
                        // Play a soft beep
                        try {
                            const ctx = new AudioContext();
                            const osc = ctx.createOscillator();
                            const gain = ctx.createGain();
                            osc.connect(gain);
                            gain.connect(ctx.destination);
                            osc.frequency.setValueAtTime(880, ctx.currentTime);
                            gain.gain.setValueAtTime(0.3, ctx.currentTime);
                            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
                            osc.start(ctx.currentTime);
                            osc.stop(ctx.currentTime + 1);
                        } catch { /* ignore */ }
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            clearInterval(intervalRef.current);
        }
        return () => clearInterval(intervalRef.current);
    }, [running]);

    const handleModeChange = (idx) => {
        clearInterval(intervalRef.current);
        setModeIdx(idx);
        setRunning(false);
        setShowCustom(false);
        setSecondsLeft(MODES[idx].minutes * 60);
    };

    const handleReset = () => {
        clearInterval(intervalRef.current);
        setRunning(false);
        setSecondsLeft(showCustom && customMin ? parseInt(customMin) * 60 : mode.minutes * 60);
    };

    const handleCustomConfirm = () => {
        const mins = parseInt(customMin);
        if (mins > 0 && mins <= 180) {
            setSecondsLeft(mins * 60);
            setRunning(false);
        }
    };

    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Urgency: red pulse when < 60s
    const urgent = secondsLeft < 60 && running;

    return (
        <div className="exam-timer-wrapper">
            <div className="exam-timer-card glass-card" style={{ '--timer-color': mode.color }}>
                <div className="timer-card-header">
                    <h3 className="timer-title">
                        ⏱️ {isAr ? 'مؤقت الدراس' : 'Study Timer'}
                    </h3>
                    {completed > 0 && (
                        <span className="sessions-completed">
                            🍅 ×{completed} {isAr ? 'جلس' : 'sessions'}
                        </span>
                    )}
                </div>

                {/* Mode Selector */}
                <div className="timer-mode-tabs">
                    {MODES.map((m, idx) => (
                        <button
                            key={m.id}
                            className={`timer-mode-btn ${modeIdx === idx && !showCustom ? 'active' : ''}`}
                            onClick={() => { handleModeChange(idx); }}
                            style={modeIdx === idx && !showCustom ? { '--tab-clr': m.color } : {}}
                        >
                            {isAr ? m.labelAr : m.labelEn}
                        </button>
                    ))}
                    <button
                        className={`timer-mode-btn ${showCustom ? 'active' : ''}`}
                        onClick={() => { setShowCustom(!showCustom); setRunning(false); }}
                        style={showCustom ? { '--tab-clr': '#8b5cf6' } : {}}
                    >
                        {isAr ? 'مصص' : 'Custom'}
                    </button>
                </div>

                {showCustom && (
                    <div className="custom-time-row">
                        <input
                            type="number"
                            min="1"
                            max="180"
                            placeholder={isAr ? 'الدقائق...' : 'Minutes...'}
                            value={customMin}
                            onChange={e => setCustomMin(e.target.value)}
                            className="custom-time-input"
                        />
                        <button className="custom-confirm-btn" onClick={handleCustomConfirm}>✅</button>
                    </div>
                )}

                {/* Circular Progress + Time Display */}
                <div className="timer-circle-wrapper">
                    <svg className="timer-progress-svg" viewBox="0 0 120 120">
                        <circle cx="60" cy="60" r="54" className="timer-track" />
                        <circle
                            cx="60"
                            cy="60"
                            r="54"
                            className="timer-progress"
                            strokeDasharray="339.29"
                            strokeDashoffset={339.29 - (progress / 100) * 339.29}
                            style={{ stroke: mode.color }}
                        />
                    </svg>
                    <div className={`timer-display ${urgent ? 'urgent' : ''}`}>
                        <span className="timer-time">{display}</span>
                        <span className="timer-mode-label">{isAr ? mode.labelAr : mode.labelEn}</span>
                    </div>
                </div>

                {/* Controls */}
                <div className="timer-controls">
                    <button
                        className={`timer-btn main-timer-btn ${running ? 'pause' : 'play'}`}
                        onClick={() => setRunning(!running)}
                        disabled={secondsLeft === 0}
                    >
                        {running ? (isAr ? '⏸ إيقاف مؤقت' : '⏸ Pause') : (isAr ? '▶ ابدأ' : '▶ Start')}
                    </button>
                    <button className="timer-btn reset-btn" onClick={handleReset}>
                        {isAr ? '🔄 إعاد' : '🔄 Reset'}
                    </button>
                </div>

                {secondsLeft === 0 && (
                    <div className="timer-done-msg">
                        🎉 {isAr ? 'انتهى الوقت! ذ استراح تستحقها.' : "Time's up! You deserve a break."}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExamTimer;
