import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Grid, IconButton, Chip, CircularProgress, Fab, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Zoom,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper
} from '@mui/material';
import { CheckCircle, Cancel, Delete, Refresh, Visibility, Link as LinkIcon, Close } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { contributionsService } from '../services/contributionsService';
import toast from 'react-hot-toast';

export default function Contributions() {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);

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

    const formatFileType = (type) => {
        if (type === 'link') return <Chip label="رابط" color="info" size="small" variant="outlined" />;
        if (type?.includes('pdf')) return <Chip label="PDF" color="error" size="small" variant="outlined" />;
        return <Chip label="صورة" color="primary" size="small" variant="outlined" />;
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
                <TableContainer component={Paper} className="glass-panel" sx={{ background: 'transparent', boxShadow: 'none' }}>
                    <Table sx={{ minWidth: 800 }}>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: 'text.secondary' }}>المادة / النوع</TableCell>
                                <TableCell sx={{ color: 'text.secondary' }}>الملف</TableCell>
                                <TableCell sx={{ color: 'text.secondary' }}>معاينة</TableCell>
                                <TableCell sx={{ color: 'text.secondary' }}>الحالة</TableCell>
                                <TableCell sx={{ color: 'text.secondary', textAlign: 'center' }}>إجراءات</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            <AnimatePresence>
                                {items.map((item, index) => (
                                    <TableRow
                                        key={item.id}
                                        component={motion.tr}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        sx={{
                                            '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.05)' },
                                            transition: '0.2s'
                                        }}
                                    >
                                        <TableCell>
                                            <Typography fontWeight="bold">{item.studentName || 'عام'}</Typography>
                                            <Typography variant="caption" color="primary">{getContributionLabel(item.contributionType)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {formatFileType(item.fileType)}
                                                <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.fileName}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            {item.fileType?.startsWith('image/') ? (
                                                <Box
                                                    component="img"
                                                    src={item.fileUrl}
                                                    sx={{
                                                        width: 50,
                                                        height: 50,
                                                        borderRadius: 1,
                                                        objectFit: 'cover',
                                                        cursor: 'pointer',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        '&:hover': { transform: 'scale(1.1)' },
                                                        transition: '0.2s'
                                                    }}
                                                    onClick={() => setSelectedImage(item.fileUrl)}
                                                />
                                            ) : (
                                                <IconButton size="small" onClick={() => window.open(item.fileUrl, '_blank')}>
                                                    {item.fileType === 'link' ? <LinkIcon /> : <Visibility />}
                                                </IconButton>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={item.status === 'approved' ? 'مقبول' : item.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                                                color={item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'error' : 'warning'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'center' }}>
                                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                {item.status === 'pending' && (
                                                    <Tooltip title="موافقة">
                                                        <IconButton color="success" size="small" onClick={() => handleStatus(item.id, 'approved')}>
                                                            <CheckCircle />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {item.status !== 'rejected' && (
                                                    <Tooltip title="رفض">
                                                        <IconButton color="warning" size="small" onClick={() => handleStatus(item.id, 'rejected')}>
                                                            <Cancel />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                <Tooltip title="حذف نهائي">
                                                    <IconButton color="error" size="small" onClick={() => handleDelete(item.id, item.storagePath)}>
                                                        <Delete />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Image Preview Dialog */}
            <Dialog open={!!selectedImage} onClose={() => setSelectedImage(null)} maxWidth="lg">
                <Box sx={{ position: 'relative', p: 1, bgcolor: '#000' }}>
                    <IconButton
                        onClick={() => setSelectedImage(null)}
                        sx={{ position: 'absolute', right: 8, top: 8, color: '#fff', bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
                    >
                        <Close />
                    </IconButton>
                    <img src={selectedImage} alt="Large preview" style={{ maxWidth: '100%', maxHeight: '90vh', display: 'block' }} />
                </Box>
            </Dialog>
        </Box>
    );
}
