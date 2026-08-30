import React, { useState, useEffect } from 'react';
import './ReadingProgressBar.css';

/**
 * ReadingProgressBar – A thin progress bar at the top of every page
 * that shows how far the user has scrolled down the current page.
 */
const ReadingProgressBar = () => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const handleScroll = () => {
            const scrollTop = window.scrollY || document.documentElement.scrollTop;
            const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const pct = docHeight > 0 ? Math.min((scrollTop / docHeight) * 100, 100) : 0;
            setProgress(pct);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="reading-progress-track" aria-hidden="true">
            <div
                className="reading-progress-fill"
                style={{ width: `${progress}%` }}
            />
        </div>
    );
};

export default ReadingProgressBar;
