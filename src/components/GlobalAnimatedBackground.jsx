import React from 'react';
import { Box, useTheme } from '@mui/material';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';

const GlobalAnimatedBackground = () => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // Define colors based on theme
    const primaryColor = isDark ? theme.palette.primary.dark : theme.palette.primary.light;
    const secondaryColor = isDark ? theme.palette.secondary.dark : theme.palette.secondary.light;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) return null;

    // Random floating configuration
    const shapes = isMobile
        ? [
            { size: 200, x: -50, y: -50, color: primaryColor, duration: 25 },
            { size: 250, x: '60%', y: '70%', color: secondaryColor, duration: 20 },
        ]
        : [
            { size: 300, x: -100, y: -100, color: primaryColor, duration: 25 },
            { size: 200, x: '80%', y: '60%', color: secondaryColor, duration: 20 },
            { size: 150, x: '10%', y: '80%', color: primaryColor, duration: 30 },
            { size: 400, x: '50%', y: '20%', color: secondaryColor, duration: 35 },
        ];

    return (
        <Box
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100vh',
                zIndex: -1,
                overflow: 'hidden',
                bgcolor: 'background.default', // Base background color
                pointerEvents: 'none', // Allow clicks to pass through
            }}
        >
            {/* Shapes */}
            {shapes.map((shape, index) => (
                <motion.div
                    key={index}
                    style={{
                        position: 'absolute',
                        width: shape.size,
                        height: shape.size,
                        borderRadius: '50%',
                        background: shape.color,
                        opacity: isDark ? 0.05 : 0.1, // Subtle opacity
                        filter: 'blur(80px)', // Aurora effect
                        top: 0,
                        left: 0,
                    }}
                    animate={{
                        x: [shape.x, typeof shape.x === 'string' ? `calc(${shape.x} + 100px)` : shape.x + 100, shape.x],
                        y: [shape.y, typeof shape.y === 'string' ? `calc(${shape.y} - 100px)` : shape.y - 100, shape.y],
                        scale: [1, 1.2, 1],
                    }}
                    transition={{
                        duration: shape.duration,
                        repeat: Infinity,
                        repeatType: 'reverse',
                        ease: 'easeInOut',
                    }}
                />
            ))}

            {/* Subtle Grid overlay for texture (optional) */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundImage: isDark
                        ? 'radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)'
                        : 'radial-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    opacity: 0.5,
                }}
            />
        </Box>
    );
};

export default GlobalAnimatedBackground;
