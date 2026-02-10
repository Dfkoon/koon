import React, { useEffect, useState } from 'react';
import {
    Box, Typography, IconButton, Chip, CircularProgress, Fab, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Zoom, Avatar, TextField
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Cancel from '@mui/icons-material/Cancel';
import Delete from '@mui/icons-material/Delete';
import FormatQuote from '@mui/icons-material/FormatQuote';
import Refresh from '@mui/icons-material/Refresh';
import Close from '@mui/icons-material/Close';
import Edit from '@mui/icons-material/Edit';
import { motion, AnimatePresence } from 'framer-motion';
import { testimonialsService } from '../services/testimonialsService';
import toast from 'react-hot-toast';

// Helper for random attractive colors
const getAvatarColor = (name) => {
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#009688', '#4caf50', '#ff9800', '#ff5722'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
};

export default function Testimonials() {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // View/Edit State
    const [selectedItem, setSelectedItem] = useState(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editText, setEditText] = useState('');

    const loadData = async () => {
        setIsLoading(true);
        const data = await testimonialsService.getAllTestimonials();
        setItems(data);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleStatus = async (e, id, newStatus) => {
        if (e) e.stopPropagation();
        await testimonialsService.updateStatus(id, newStatus);
        toast.success(newStatus === 'approved' ? 'تمت الموافقة' : 'تم الرفض');
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus, approved: newStatus === 'approved' } : item));
        if (selectedItem?.id === id) {
            setSelectedItem(prev => ({ ...prev, status: newStatus, approved: newStatus === 'approved' }));
        }
    };

    const handleDelete = async (e, id) => {
        if (e) e.stopPropagation();
        if (window.confirm('هل أنت متأكد من الحذف؟')) {
            await testimonialsService.deleteTestimonial(id);
            toast.success('تم الحذف');
            setItems(prev => prev.filter(item => item.id !== id));
            setIsDialogOpen(false);
        }
    };

    const handleSaveEdit = async () => {
        try {
            await testimonialsService.updateTestimonialDetails(selectedItem.id, editText);
            toast.success('تم تحديث النص');
            setItems(prev => prev.map(item => item.id === selectedItem.id ? { ...item, quote: editText, text: editText } : item));
            setSelectedItem(prev => ({ ...prev, quote: editText, text: editText }));
            setEditMode(false);
        } catch (error) {
            toast.error('فشل التحديث');
        }
    };

    const openDetails = (item) => {
        setSelectedItem(item);
        setEditMode(false);
        setEditText(getTestimonialText(item));
        setIsDialogOpen(true);
    };

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
                <Box sx={{ columnCount: { xs: 1, sm: 2, md: 3 }, columnGap: 3 }}>
                    <AnimatePresence>
                        {items.map((item, index) => (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ delay: index * 0.05 }}
                                onClick={() => openDetails(item)}
                                style={{ breakInside: 'avoid', marginBottom: 24 }}
                            >
                                <Box sx={{
                                    p: 3,
                                    borderRadius: 4,
                                    bgcolor: 'var(--bg-card)',
                                    border: item.approved ? '1px solid #4caf50' : '1px solid var(--glass-border)',
                                    position: 'relative',
                                    transition: '0.3s',
                                    cursor: 'pointer',
                                    '&:hover': { transform: 'translateY(-5px)', bgcolor: 'var(--bg-card-hover)', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }
                                }}>
                                    {/* Quote Icon */}
                                    <FormatQuote sx={{
                                        fontSize: 60,
                                        color: getAvatarColor(item.name || '?'),
                                        opacity: 0.1,
                                        position: 'absolute',
                                        top: 10,
                                        right: 10,
                                        transform: 'scaleX(-1)' // Flip for Arabic
                                    }} />

                                    {/* Header: Avatar & Info */}
                                    <Box display="flex" alignItems="center" gap={2} mb={2}>
                                        <Avatar sx={{ bgcolor: getAvatarColor(item.name || '?'), width: 48, height: 48, fontWeight: 'bold' }}>
                                            {item.name ? item.name.charAt(0) : '?'}
                                        </Avatar>
                                        <Box>
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {item.name}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {item.major || 'غير محدد'}
                                            </Typography>
                                        </Box>
                                    </Box>

                                    {/* Body */}
                                    <Typography variant="body2" sx={{
                                        mb: 3,
                                        lineHeight: 1.7,
                                        color: 'var(--text-primary)',
                                        fontStyle: 'italic',
                                        maxHeight: 200,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 8,
                                        WebkitBoxOrient: 'vertical'
                                    }}>
                                        "{getTestimonialText(item)}"
                                    </Typography>

                                    {/* Footer Details */}
                                    <Box display="flex" justifyContent="space-between" alignItems="center" borderTop="1px solid rgba(255,255,255,0.05)" pt={2}>
                                        <Chip
                                            label={item.status === 'approved' ? 'معتمد' : item.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار'}
                                            color={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}
                                            size="small"
                                            variant="outlined"
                                        />
                                        <Typography variant="caption" color="text.secondary">
                                            {item.date ? new Date(item.date).toLocaleDateString('ar-EG') : ''}
                                        </Typography>
                                    </Box>
                                </Box>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </Box>
            )}

            {/* Editing Dialog */}
            <Dialog
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                TransitionComponent={Zoom}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { bgcolor: 'var(--bg-surface)', backgroundImage: 'none', borderRadius: 3 } }}
            >
                {selectedItem && (
                    <>
                        <DialogTitle>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Avatar sx={{ bgcolor: getAvatarColor(selectedItem.name || '?') }}>
                                    {selectedItem.name ? selectedItem.name.charAt(0) : '?'}
                                </Avatar>
                                <Box>
                                    <Typography variant="h6">{selectedItem.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{selectedItem.major}</Typography>
                                </Box>
                            </Box>
                            <IconButton onClick={() => setIsDialogOpen(false)} sx={{ position: 'absolute', right: 8, top: 8 }}>
                                <Close />
                            </IconButton>
                        </DialogTitle>

                        <DialogContent dividers sx={{ borderColor: 'var(--glass-border)' }}>
                            {editMode ? (
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={6}
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    variant="outlined"
                                    placeholder="اكتب التعديل هنا..."
                                    sx={{ mt: 1 }}
                                />
                            ) : (
                                <Typography variant="body1" sx={{ lineHeight: 1.8, fontSize: '1.1rem', fontStyle: 'italic', position: 'relative', p: 2 }}>
                                    <FormatQuote sx={{ fontSize: 40, opacity: 0.2, position: 'absolute', top: -5, left: -5, transform: 'scaleX(-1)' }} />
                                    "{getTestimonialText(selectedItem)}"
                                </Typography>
                            )}
                        </DialogContent>

                        <DialogActions sx={{ p: 2 }}>
                            {editMode ? (
                                <>
                                    <Button onClick={() => setEditMode(false)} color="inherit">إلغاء</Button>
                                    <Button onClick={handleSaveEdit} variant="contained" color="primary">حفظ التغييرات</Button>
                                </>
                            ) : (
                                <>
                                    <Button startIcon={<Delete />} color="error" onClick={(e) => handleDelete(e, selectedItem.id)}>حذف</Button>
                                    <Button startIcon={<Edit />} color="info" onClick={() => setEditMode(true)}>تعديل النص</Button>
                                    <Box flexGrow={1} />
                                    {selectedItem.status !== 'approved' && (
                                        <Button variant="contained" color="success" onClick={(e) => handleStatus(e, selectedItem.id, 'approved')}>اعتماد</Button>
                                    )}
                                    {selectedItem.status !== 'rejected' && (
                                        <Button variant="outlined" color="warning" onClick={(e) => handleStatus(e, selectedItem.id, 'rejected')}>رفض</Button>
                                    )}
                                </>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Box>
    );
}
