import React, { useEffect, useRef, useState } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ onFinish }) => {
    const textRef = useRef(null);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const tryAnimate = () => {
            const el = textRef.current;
            if (!el) return;

            // Use getComputedTextLength for SVG text
            let len = 0;
            try { len = el.getComputedTextLength(); } catch (_) {}

            if (len <= 0) {
                setTimeout(tryAnimate, 60);
                return;
            }

            // Set up stroke draw animation
            el.style.strokeDasharray  = `${len}`;
            el.style.strokeDashoffset = `${len}`;
            el.style.fill             = 'none';

            requestAnimationFrame(() => requestAnimationFrame(() => {
                if (!textRef.current) return;
                // Draw stroke over 2.6s
                textRef.current.style.transition =
                    'stroke-dashoffset 2.6s cubic-bezier(0.4, 0, 0.2, 1)';
                textRef.current.style.strokeDashoffset = '0';

                // After stroke drawn → fade in fill (make stroke invisible, fill visible)
                setTimeout(() => {
                    if (!textRef.current) return;
                    textRef.current.style.transition = 'fill 0.6s ease, stroke 0.6s ease';
                    textRef.current.style.fill       = 'url(#shimmer)';
                    textRef.current.style.stroke     = 'transparent';
                }, 2700);
            }));
        };

        const kick = () => setTimeout(tryAnimate, 100);
        if (document.fonts?.ready) {
            document.fonts.ready.then(kick);
        } else {
            kick();
        }

        // Fade out after 4.2 seconds, call onFinish at 4.9s
        const fadeOut = setTimeout(() => setVisible(false), 4200);
        const done    = setTimeout(() => onFinish && onFinish(), 4900);

        return () => {
            clearTimeout(fadeOut);
            clearTimeout(done);
        };
    }, [onFinish]);

    return (
        <div className={`splash-root${visible ? '' : ' splash-exit'}`}>
            <svg
                className="splash-svg"
                viewBox="0 0 620 160"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Shimmer gradient that sweeps left→right */}
                    <linearGradient
                        id="shimmer"
                        x1="0%" y1="0%" x2="100%" y2="0%"
                        gradientUnits="userSpaceOnUse"
                    >
                        <stop offset="0%"   stopColor="#ffffff" />
                        <stop offset="35%"  stopColor="#f0b8c8" />
                        <stop offset="55%"  stopColor="#e8305a" />
                        <stop offset="75%"  stopColor="#f0b8c8" />
                        <stop offset="100%" stopColor="#ffffff" />
                        <animateTransform
                            attributeName="gradientTransform"
                            type="translate"
                            from="-620 0"
                            to="620 0"
                            dur="2.5s"
                            begin="2.7s"
                            repeatCount="indefinite"
                        />
                    </linearGradient>

                    {/* Stroke gradient for drawing phase */}
                    <linearGradient id="strokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%"   stopColor="#ffffff" />
                        <stop offset="50%"  stopColor="#f8d0dc" />
                        <stop offset="100%" stopColor="#ffffff" />
                    </linearGradient>
                </defs>

                <text
                    ref={textRef}
                    x="310"
                    y="118"
                    textAnchor="middle"
                    fontFamily="'Sacramento', cursive"
                    fontSize="108"
                    fill="none"
                    stroke="url(#strokeGrad)"
                    strokeWidth="1.5"
                    style={{ paintOrder: 'stroke fill' }}
                >
                    makanak
                </text>
            </svg>
        </div>
    );
};

export default SplashScreen;
