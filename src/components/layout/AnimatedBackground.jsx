import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';

const AnimatedBackground = () => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let width, height;
        let particles = [];

        const resize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        const createParticles = () => {
            particles = [];
            const particleCount = 50;
            for (let i = 0; i < particleCount; i++) {
                particles.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    size: Math.random() * 2 + 1,
                    color: Math.random() > 0.5 ? 'rgba(211, 47, 47, 0.2)' : 'rgba(255, 255, 255, 0.1)'
                });
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, width, height);

            // Draw Deep Space Gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, '#050505');
            gradient.addColorStop(1, '#0a0a0a');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            // Draw Particles
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.fill();
            });

            // Draw Glow Spots
            const glow = ctx.createRadialGradient(width * 0.8, height * 0.2, 0, width * 0.8, height * 0.2, 400);
            glow.addColorStop(0, 'rgba(211, 47, 47, 0.05)');
            glow.addColorStop(1, 'transparent');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, width, height);

            requestAnimationFrame(animate);
        };

        window.addEventListener('resize', resize);
        resize();
        createParticles();
        animate();

        return () => window.removeEventListener('resize', resize);
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                zIndex: 0,
                pointerEvents: 'none'
            }}
        />
    );
};

export default AnimatedBackground;
