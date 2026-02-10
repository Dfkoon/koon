import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Grid, IconButton, Chip, CircularProgress, Fab, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Paper
} from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Cancel from '@mui/icons-material/Cancel';
import Delete from '@mui/icons-material/Delete';
import Refresh from '@mui/icons-material/Refresh';
import Visibility from '@mui/icons-material/Visibility';
import LinkIcon from '@mui/icons-material/Link';
import Close from '@mui/icons-material/Close';
import { motion, AnimatePresence } from 'framer-motion';
import { contributionsService } from '../services/contributionsService';
import toast from 'react-hot-toast';

export default function Contributions() {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [previewItem, setPreviewItem] = useState(null);

    const loadData = async () => {
        setIsLoading(true);
        const data = await contributionsService.getAllContributions();
        setItems(data);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleStatus = async (id, newStatus) => {
        try {
            await contributionsService.updateStatus(id, newStatus);
            toast.success(newStatus === 'approved' ? 'تمت الموافقة على المساهمة' : 'تم الرفض');
            setItems(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
        } catch (error) {
            toast.error('حدث خطأ أثناء تحديث الحالة');
        }
    };

    const handleDelete = async (id, storagePath) => {
        if (window.confirm('هل أنت متأكد من حذف هذه المساهمة نهائياً؟')) {
            try {
                await contributionsService.deleteContribution(id, storagePath);
                toast.success('تم الحذف بنجاح');
                setItems(prev => prev.filter(item => item.id !== id));
            } catch (error) {
                toast.error('فشل الحذف');
            }
        }
    };

    const isImage = (item) => item?.fileType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(item?.fileName || '');
    const isPDF = (item) => item?.fileType?.includes('pdf') || /\.pdf$/i.test(item?.fileName || '');
    const isLink = (item) => item?.fileType === 'link' || item?.contributionType === 'external_link' || (!isImage(item) && !isPDF(item));

    const formatFileType = (item) => {
        if (isPDF(item)) return <Chip label="PDF" color="error" size="small" variant="outlined" />;
        if (item.fileType === 'link' || item.contributionType === 'external_link') return <Chip label="رابط" color="info" size="small" variant="outlined" />;
        if (isImage(item)) return <Chip label="صورة" color="primary" size="small" variant="outlined" />;
        return <Chip label="ملف" color="secondary" size="small" variant="outlined" />;
    };

    const getContributionLabel = (type) => {
        const mapping = {
            'past_papers': 'أسئلة سنوات',
            'quizzes': 'كويزات',
            'summaries': 'ملخصات',
            'material_pdf': 'مادة PDF',
            'external_link': 'رابط ملف'
        };
        return mapping[type] || 'غير محدد';
    };

    return (
        <Box>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold">مساهمات الطلاب</Typography>
                    <Typography variant="body2" color="text.secondary">مراجعة الملفات والكويزات المرفوعة من قبل الطلاب</Typography>
                </Box>
                <Fab color="primary" size="small" onClick={loadData}><Refresh /></Fab>
            </Box>

            {isLoading ? (
                <Box display="flex" justifyContent="center" height="50vh" alignItems="center"><CircularProgress /></Box>
            ) : (
                <Grid container spacing={3}>
                    <AnimatePresence>
                        {items.map((item) => (
                            <Grid item xs={12} sm={6} md={4} lg={3} key={item.id} component={motion.div} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                                <Paper
                                    sx={{
                                        position: 'relative',
                                        overflow: 'hidden',
                                        borderRadius: 4,
                                        bgcolor: 'var(--bg-card)',
                                        border: '1px solid var(--glass-border)',
                                        transition: '0.3s',
                                        '&:hover': { transform: 'translateY(-5px)', bgcolor: 'var(--bg-card-hover)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }
                                    }}
                                >
                                    {/* Preview Section */}
                                    <Box
                                        sx={{
                                            height: 180,
                                            bgcolor: 'var(--input-bg)',
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}
                                        onClick={() => setPreviewItem(item)}
                                    >
                                        {isImage(item) ? (
                                            <img src={item.fileUrl} alt={item.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : isPDF(item) ? (
                                            <Typography variant="h1" sx={{ opacity: 0.5 }}>📄</Typography>
                                        ) : (
                                            <Typography variant="h1" sx={{ opacity: 0.5 }}>🔗</Typography>
                                        )}

                                        {/* Overlay Icon */}
                                        <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.4)', opacity: 0, '&:hover': { opacity: 1 }, transition: '0.2s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                            <Visibility sx={{ color: '#fff', fontSize: 40 }} />
                                            <Typography sx={{ color: '#fff', fontWeight: 'bold' }}>عرض التفاصيل</Typography>
                                        </Box>

                                        {/* Status Badge */}
                                        <Box sx={{ position: 'absolute', top: 12, right: 12 }}>
                                            <Chip
                                                label={item.status === 'approved' ? 'مقبول' : item.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                                                color={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}
                                                size="small"
                                                sx={{ backdropFilter: 'blur(4px)', fontWeight: 'bold' }}
                                            />
                                        </Box>
                                    </Box>

                                    {/* Content Section */}
                                    <Box p={2}>
                                        <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                                            <Box>
                                                <Typography variant="h6" fontWeight="bold" noWrap sx={{ maxWidth: 150 }}>{item.studentName || 'فاعل خير'}</Typography>
                                                <Typography variant="caption" color="primary">{getContributionLabel(item.contributionType)}</Typography>
                                            </Box>
                                            {formatFileType(item)}
                                        </Box>

                                        <Typography variant="body2" color="text.secondary" noWrap sx={{ mb: 2, display: 'block' }}>
                                            {item.fileName}
                                        </Typography>

                                        {/* Actions */}
                                        <Box display="flex" justifyContent="space-between" pt={2} borderTop="1px solid var(--glass-border)">
                                            <Box>
                                                {item.status !== 'approved' && (
                                                    <Tooltip title="قبول">
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
                                            </Box>
                                            <Tooltip title="حذف نهائي">
                                                <IconButton color="error" onClick={() => handleDelete(item.id, item.storagePath)}>
                                                    <Delete />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>
                                </Paper>
                            </Grid>
                        ))}
                    </AnimatePresence>
                </Grid>
            )}

            {/* Unified Preview Dialog */}
            <Dialog
                open={!!previewItem}
                onClose={() => setPreviewItem(null)}
                maxWidth="lg"
                fullWidth={previewItem && (isPDF(previewItem) || isLink(previewItem))}
                PaperProps={{
                    sx: {
                        bgcolor: 'var(--bg-deep)',
                        borderRadius: 3,
                        overflow: 'hidden'
                    }
                }}
            >
                <DialogTitle sx={{ borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h6" fontWeight="bold">معاينة: {previewItem?.studentName || 'فاعل خير'}</Typography>
                        <Typography variant="caption" color="text.secondary">{previewItem?.fileName}</Typography>
                    </Box>
                    <IconButton onClick={() => setPreviewItem(null)} sx={{ color: 'var(--text-primary)' }}>
                        <Close />
                    </IconButton>
                </DialogTitle>

                <DialogContent sx={{ p: isImage(previewItem) ? 0 : 2, minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {previewItem && (
                        <>
                            {isImage(previewItem) ? (
                                <img
                                    src={previewItem.fileUrl}
                                    alt="preview"
                                    style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }}
                                />
                            ) : isPDF(previewItem) ? (
                                <iframe
                                    src={previewItem.fileUrl}
                                    title="PDF Preview"
                                    width="100%"
                                    height="600px"
                                    style={{ border: 'none', borderRadius: '8px', background: '#fff' }}
                                />
                            ) : (
                                <Box textAlign="center" p={5}>
                                    <LinkIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
                                    <Typography variant="h5" gutterBottom>رابط خارجي</Typography>
                                    <Typography color="text.secondary" mb={4}>هذه المساهمة عبارة عن رابط لموقع أو ملف خارجي</Typography>
                                    <Button
                                        variant="contained"
                                        size="large"
                                        href={previewItem.fileUrl}
                                        target="_blank"
                                        startIcon={<Visibility />}
                                    >
                                        فتح الرابط في نافذة جديدة
                                    </Button>
                                </Box>
                            )}
                        </>
                    )}
                </DialogContent>

                <DialogActions sx={{ borderTop: '1px solid var(--glass-border)', p: 2 }}>
                    <Button onClick={() => setPreviewItem(null)} color="inherit">إغلاق</Button>
                    {previewItem && (
                        <Button
                            variant="outlined"
                            startIcon={<LinkIcon />}
                            href={previewItem.fileUrl}
                            target="_blank"
                        >
                            فتح في المتصفح
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
}
