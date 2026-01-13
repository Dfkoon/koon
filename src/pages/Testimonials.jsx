import React, { useEffect, useState } from 'react';
import { Box, Typography, Grid, IconButton, Chip, CircularProgress, Fab, Tooltip } from '@mui/material';
import { CheckCircle, Cancel, Delete, FormatQuote, Refresh } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { testimonialsService } from '../services/testimonialsService';
import toast from 'react-hot-toast';

export default function Testimonials() {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = async () => {
        setIsLoading(true);
        const data = await testimonialsService.getAllTestimonials();
        setItems(data);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleStatus = async (id, newStatus) => {
        await testimonialsService.updateStatus(id, newStatus);
        toast.success(newStatus === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus, approved: newStatus === 'approved' } : item));
    };

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من الحذف؟')) {
            await testimonialsService.deleteTestimonial(id);
            toast.success('تم الحذف');
            setItems(prev => prev.filter(item => item.id !== id));
        }
    };

    return (
        <Box>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight="bold">إدارة آراء الطلاب</Typography>
                <Fab color="primary" size="small" onClick={loadData}><Refresh /></Fab>
            </Box>

            {isLoading ? (
                <Box display="flex" justifyContent="center" height="50vh" alignItems="center"><CircularProgress /></Box>
            ) : (
                <Grid container spacing={3}>
                    <AnimatePresence>
                        {items.map((item, index) => (
                            <Grid item xs={12} sm={6} md={4} key={item.id}>
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <Box className="glass-card" sx={{
                                        p: 3,
                                        height: '100%',
                                        position: 'relative',
                                        border: item.approved ? '1px solid var(--success)' : '1px solid var(--glass-border)',
                                        boxShadow: item.approved ? '0 0 15px rgba(0, 230, 118, 0.1)' : 'none'
                                    }}>
                                        <FormatQuote sx={{ fontSize: 40, color: 'var(--primary)', opacity: 0.3, position: 'absolute', top: 10, left: 10 }} />

                                        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="h6" fontWeight="bold">{item.name}</Typography>
                                            <Chip
                                                label={item.status === 'approved' ? 'معتمد' : item.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                                                color={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}
                                                size="small"
                                            />
                                        </Box>

                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{item.major} - السنة {item.year}</Typography>

                                        <Typography variant="body1" sx={{
                                            minHeight: 80,
                                            mb: 2,
                                            fontStyle: 'italic',
                                            color: 'rgba(255,255,255,0.9)'
                                        }}>
                                            "{item.message}"
                                        </Typography>

                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 'auto', pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            {item.status !== 'approved' && (
                                                <Tooltip title="اعتماد">
                                                    <IconButton color="success" onClick={() => handleStatus(item.id, 'approved')}>
                                                        <CheckCircle />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            {item.status !== 'rejected' && (
                                                <Tooltip title="رفض">
                                                    <IconButton color="warning" onClick={() => handleStatus(item.id, 'rejected')}>
                                                        <Cancel />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            <Tooltip title="حذف">
                                                <IconButton color="error" onClick={() => handleDelete(item.id)}>
                                                    <Delete />
                                                </IconButton>
                                            </Tooltip>
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
