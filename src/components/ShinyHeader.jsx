import React from 'react';
import { styled, Typography, useTheme, Box } from '@mui/material';

const ShinyHeader = ({ text, variant = "h4", align = "center", gutterBottom = true, sx = {} }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const gradient = isDark
    ? `linear-gradient(to right, #ccc 0, #fff 10%, #ccc 20%)`
    : `linear-gradient(to right, #444 0, #888 10%, #444 20%)`;

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
      mb: gutterBottom ? 4 : 2,
      width: '100%'
    }}>
      <StyledWrapper align={align} gradient={gradient} baseColor={isDark ? '#fff' : '#333'}>
        <Typography variant={variant} component="div" className="shiny-text" gutterBottom={false} sx={{ fontWeight: 'bold', ...sx }}>
          {text}
        </Typography>
      </StyledWrapper>

      <Box sx={{
        width: 150,
        height: 4,
        background: `linear-gradient(90deg, transparent, ${theme.palette.primary.main}, transparent)`,
        mt: 1,
        borderRadius: 2
      }} />
    </Box>
  );
}

const StyledWrapper = styled('div')(({ align, gradient, baseColor }) => ({
  display: 'flex',
  justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
  width: '100%',

  '& .shiny-text': {
    position: 'relative',
    display: 'inline-block',
    color: baseColor,

    background: gradient,

    backgroundPosition: '0',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    animation: 'shine 3s infinite linear',
    animationFillMode: 'forwards',
    WebkitTextSizeAdjust: 'none',
    textDecoration: 'none',
    whiteSpace: 'nowrap',

    marginBottom: '0.35em',
  },

  '@keyframes shine': {
    '0%': {
      backgroundPosition: '0',
    },
    '60%': {
      backgroundPosition: '280px',
    },
    '100%': {
      backgroundPosition: '280px',
    }
  }
}));

export default ShinyHeader;
