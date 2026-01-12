import React, { useEffect, useState } from 'react';
import {
    Box, Typography, IconButton, Chip, Avatar, Tooltip, Grid,
    useTheme, Button, Divider
} from '@mui/material';
import {
    Delete, CheckCircle, Cancel, Person,
    FormatQuote, School
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { testimonialsService } from '../../services/testimonialsService';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function ManageTestimonials() {
    const { language } = useLanguage();
    const theme = useTheme();
    const isAr = language === 'ar';
    const [testimonials, setTestimonials] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        const data = await testimonialsService.getAllTestimonials();
        setTestimonials(data);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleStatusUpdate = async (id, status) => {
        const result = await testimonialsService.updateStatus(id, status);
        if (result.success) {
            toast.success(isAr ? 'تم تحديث الحالة' : 'Status updated');
            loadData();
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm(isAr ? 'هل أنت متأكد من الحذف؟' : 'Are you sure?')) {
            const result = await testimonialsService.deleteTestimonial(id);
            if (result.success) {
                toast.success(isAr ? 'تم الحذف' : 'Deleted');
                loadData();
            }
        }
    };

    return (
        <Box sx={{ p: { xs: 1, md: 3 } }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <ShinyHeader text={isAr ? 'آراء واقتباسات الطلاب' : 'Student Testimonials'} variant="h3" gutterBottom={false} />
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
                    <Typography variant="h5" color="text.muted" className="animate-pulse">
                        {isAr ? 'جاري استدعاء الآراء...' : 'Fetching testimonials...'}
                    </Typography>
                </Box>
            ) : (
                <Grid container spacing={4}>
                    <AnimatePresence>
                        {testimonials.map((t, index) => (
                            <Grid item xs={12} sm={6} lg={4} key={t.id}>
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5, delay: index * 0.1 }}
                                >
                                    <Box className="glass-card" sx={{
                                        p: 4,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        position: 'relative',
                                        borderRadius: '24px',
                                        border: '1px solid var(--glass-border)',
                                        background: 'var(--bg-card)',
                                        backdropFilter: 'var(--glass-blur)',
                                        transition: 'var(--transition-smooth)',
                                        '&:hover': {
                                            transform: 'translateY(-10px)',
                                            borderColor: 'var(--primary)',
                                            boxShadow: '0 20px 40px rgba(0,0,0,0.4)'
                                        }
                                    }}>
                                        {/* Status Badge */}
                                        <Box sx={{ position: 'absolute', top: 20, left: 20 }}>
                                            <Chip
                                                label={isAr ? (t.status === 'approved' ? 'منشور' : 'معلق') : t.status}
                                                color={t.status === 'approved' ? 'success' : 'warning'}
                                                size="small"
                                                sx={{ fontWeight: 'bold', fontSize: '0.7rem' }}
                                            />
                                        </Box>

                                        {/* Quote Icon */}
                                        <FormatQuote sx={{
                                            position: 'absolute',
                                            top: 40,
                                            right: 20,
                                            fontSize: '3rem',
                                            opacity: 0.1,
                                            color: 'var(--primary)'
                                        }} />

                                        {/* Content */}
                                        <Box sx={{ flexGrow: 1, mt: 2 }}>
                                            <Typography variant="body1" sx={{
                                                fontStyle: 'italic',
                                                lineHeight: 1.8,
                                                fontSize: '1.1rem',
                                                mb: 4,
                                                color: 'var(--text-main)',
                                                position: 'relative',
                                                zIndex: 1
                                            }}>
                                                {(t.quote || t.text || t.content) ? `"${t.quote || t.text || t.content}"` : (isAr ? '"لا يوجد نص"' : '"No text provided"')}
                                            </Typography>
                                        </Box>

                                        <Divider sx={{ mb: 3, opacity: 0.1 }} />

                                        {/* Author Info */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                                            <Avatar
                                                sx={{
                                                    width: 56,
                                                    height: 56,
                                                    background: `linear-gradient(45deg, var(--primary), #FFD700)`,
                                                    boxShadow: '0 0 15px rgba(211, 47, 47, 0.3)'
                                                }}
                                            >
                                                {(t.author || t.name || 'U')[0].toUpperCase()}
                                            </Avatar>
                                            <Box>
                                                <Typography variant="h6" sx={{ fontWeight: 900, color: '#FFF', lineHeight: 1.2 }}>
                                                    {t.author || t.name || (isAr ? 'طالب مجهول' : 'Anonymous Student')}
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                                    <School sx={{ fontSize: '0.9rem', color: 'var(--primary)' }} />
                                                    <Typography variant="caption" sx={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                                        {t.company || t.major || t.role || (isAr ? 'تخصص غير محدد' : 'General Major')}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </Box>

                                        {/* Actions */}
                                        <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
                                            {t.status === 'pending' ? (
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    color="success"
                                                    startIcon={<CheckCircle />}
                                                    onClick={() => handleStatusUpdate(t.id, 'approved')}
                                                    sx={{ borderRadius: '12px' }}
                                                >
                                                    {isAr ? 'نشر الآن' : 'Publish'}
                                                </Button>
                                            ) : (
                                                <Button
                                                    fullWidth
                                                    variant="outlined"
                                                    color="warning"
                                                    startIcon={<Cancel />}
                                                    onClick={() => handleStatusUpdate(t.id, 'pending')}
                                                    sx={{ borderRadius: '12px' }}
                                                >
                                                    {isAr ? 'إخفاء' : 'Hide'}
                                                </Button>
                                            )}
                                            <IconButton
                                                color="error"
                                                onClick={() => handleDelete(t.id)}
                                                sx={{
                                                    bgcolor: 'rgba(255, 23, 68, 0.1)',
                                                    borderRadius: '12px',
                                                    '&:hover': { bgcolor: 'rgba(255, 23, 68, 0.2)' }
                                                }}
                                            >
                                                <Delete />
                                            </IconButton>
                                        </Box>
                                    </Box>
                                </motion.div>
                            </Grid>
                        ))}
                    </AnimatePresence>
                </Grid>
            )}
        </Box>
    );
}

