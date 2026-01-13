import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Grid, IconButton, Chip, CircularProgress, Fab, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Zoom
} from '@mui/material';
import { CheckCircle, Cancel, Delete, FormatQuote, Refresh, Close } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { testimonialsService } from '../services/testimonialsService';
import toast from 'react-hot-toast';

export default function Testimonials() {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        const data = await testimonialsService.getAllTestimonials();
        setItems(data);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleStatus = async (e, id, newStatus) => {
        e.stopPropagation(); // Prevent card click
        await testimonialsService.updateStatus(id, newStatus);
        toast.success(newStatus === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus, approved: newStatus === 'approved' } : item));
        if (selectedItem?.id === id) {
            setSelectedItem(prev => ({ ...prev, status: newStatus, approved: newStatus === 'approved' }));
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation(); // Prevent card click
        if (window.confirm('هل أنت متأكد من الحذف؟ هذا الإجراء لا يمكن التراجع عنه.')) {
            try {
                await testimonialsService.deleteTestimonial(id);
                toast.success('تم الحذف بنجاح');
                setItems(prev => prev.filter(item => item.id !== id));
                if (selectedItem?.id === id) setIsDialogOpen(false);
            } catch (error) {
                toast.error('فشل الحذف، يرجى المحاولة لاحقاً');
            }
        }
    };

    const openDetails = (item) => {
        setSelectedItem(item);
        setIsDialogOpen(true);
    };

    // Helper to get text from various possible fields
    const getTestimonialText = (item) => {
        return item.quote || item.message || item.text || item.comment || "لا يوجد نص متاح لهذا الرأي";
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
                                    onClick={() => openDetails(item)}
                                    style={{ cursor: 'pointer', height: '100%' }}
                                >
                                    <Box className="glass-card" sx={{
                                        p: 3,
                                        height: '100%',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        position: 'relative',
                                        transition: '0.3s',
                                        border: item.approved ? '1px solid #4caf50' : '1px solid rgba(255,255,255,0.1)',
                                        '&:hover': {
                                            transform: 'translateY(-5px)',
                                            borderColor: 'var(--primary)',
                                            boxShadow: '0 10px 30px rgba(211, 47, 47, 0.1)'
                                        }
                                    }}>
                                        <FormatQuote sx={{ fontSize: 40, color: 'var(--primary)', opacity: 0.3, position: 'absolute', top: 10, left: 10 }} />

                                        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="h6" fontWeight="bold" sx={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {item.name}
                                            </Typography>
                                            <Chip
                                                label={item.status === 'approved' ? 'معتمد' : item.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                                                color={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}
                                                size="small"
                                            />
                                        </Box>

                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                            {item.major || item.role} - {item.year ? `السنة ${item.year}` : (item.role || 'طالب')}
                                        </Typography>

                                        <Typography variant="body1" sx={{
                                            minHeight: 80,
                                            mb: 2,
                                            fontStyle: 'italic',
                                            color: 'rgba(255,255,255,0.9)',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 3,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden'
                                        }}>
                                            "{getTestimonialText(item)}"
                                        </Typography>

                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 'auto', pt: 2, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                            {item.status !== 'approved' && (
                                                <Tooltip title="اعتماد">
                                                    <IconButton color="success" size="small" onClick={(e) => handleStatus(e, item.id, 'approved')}>
                                                        <CheckCircle />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            {item.status !== 'rejected' && (
                                                <Tooltip title="رفض">
                                                    <IconButton color="warning" size="small" onClick={(e) => handleStatus(e, item.id, 'rejected')}>
                                                        <Cancel />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            <Tooltip title="حذف">
                                                <IconButton color="error" size="small" onClick={(e) => handleDelete(e, item.id)}>
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

            {/* Expanded View Dialog */}
            <Dialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                TransitionComponent={Zoom}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(26, 26, 26, 0.95)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 4
                    }
                }}
            >
                {selectedItem && (
                    <>
                        <DialogTitle sx={{ pr: 6 }}>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="h5" fontWeight="bold">{selectedItem.name}</Typography>
                                <Chip
                                    label={selectedItem.status === 'approved' ? 'معتمد' : selectedItem.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                                    color={selectedItem.status === 'approved' ? 'success' : selectedItem.status === 'rejected' ? 'error' : 'warning'}
                                />
                            </Box>
                            <IconButton
                                onClick={() => setIsDialogOpen(false)}
                                sx={{ position: 'absolute', right: 8, top: 8, color: 'grey.500' }}
                            >
                                <Close />
                            </IconButton>
                        </DialogTitle>
                        <DialogContent dividers sx={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                            <Typography variant="subtitle1" color="primary" gutterBottom>
                                {selectedItem.major} - {selectedItem.year ? `السنة ${selectedItem.year}` : selectedItem.role}
                            </Typography>
                            <Box sx={{ mt: 3, p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, position: 'relative' }}>
                                <FormatQuote sx={{ opacity: 0.1, fontSize: 60, position: 'absolute', top: -10, left: -10 }} />
                                <Typography variant="body1" sx={{ fontStyle: 'italic', lineHeight: 1.8, position: 'relative' }}>
                                    {getTestimonialText(selectedItem)}
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'left' }}>
                                {selectedItem.date?.toLocaleDateString('ar-EG')}
                            </Typography>
                        </DialogContent>
                        <DialogActions sx={{ p: 2, gap: 1 }}>
                            <Button variant="outlined" color="error" startIcon={<Delete />} onClick={(e) => handleDelete(e, selectedItem.id)}>
                                حذف نهائي
                            </Button>
                            <Box sx={{ flexGrow: 1 }} />
                            {selectedItem.status !== 'approved' && (
                                <Button variant="contained" color="success" startIcon={<CheckCircle />} onClick={(e) => handleStatus(e, selectedItem.id, 'approved')}>
                                    اعتماد الرأي
                                </Button>
                            )}
                            {selectedItem.status !== 'rejected' && (
                                <Button variant="contained" color="warning" onClick={(e) => handleStatus(e, selectedItem.id, 'rejected')}>
                                    رفض
                                </Button>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Box>
    );
}
