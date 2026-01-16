import React, { useEffect, useState } from 'react';
import { Box, Typography, Grid, IconButton, Chip, CircularProgress, Paper, Tooltip } from '@mui/material';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Delete from '@mui/icons-material/Delete';
import BugReport from '@mui/icons-material/BugReport';
import Refresh from '@mui/icons-material/Refresh';
import Assignment from '@mui/icons-material/Assignment';
import Person from '@mui/icons-material/Person';
import AccessTime from '@mui/icons-material/AccessTime';
import { motion, AnimatePresence } from 'framer-motion';
import { questionReportsService } from '../services/questionReportsService';
import toast from 'react-hot-toast';

export default function QuestionReports() {
    const [reports, setReports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = async () => {
        setIsLoading(true);
        const data = await questionReportsService.getAllReports();
        setReports(data);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const formatDate = (date) => {
        if (!date) return 'بدون تاريخ';
        try {
            if (date.toDate) return date.toDate().toLocaleString('ar-EG');
            const d = new Date(date);
            return isNaN(d.getTime()) ? 'تاريخ غير صالح' : d.toLocaleString('ar-EG');
        } catch (e) {
            return 'خطأ في التاريخ';
        }
    };

    const handleStatus = async (id, newStatus) => {
        await questionReportsService.updateStatus(id, newStatus);
        toast.success(newStatus === 'resolved' ? 'تم حل المشكلة' : 'تم التحديث');
        setReports(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    };

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من الحذف؟')) {
            await questionReportsService.deleteReport(id);
            toast.success('تم الحذف');
            setReports(prev => prev.filter(r => r.id !== id));
        }
    };

    return (
        <Box>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight="bold">مراجعة أسئلة الاختبارات</Typography>
                <IconButton color="primary" onClick={loadData} className="glass-panel" sx={{ p: 1.5 }}>
                    <Refresh />
                </IconButton>
            </Box>

            {isLoading ? (
                <Box display="flex" justifyContent="center" height="50vh" alignItems="center"><CircularProgress /></Box>
            ) : reports.length === 0 ? (
                <Box sx={{ textAlign: 'center', mt: 10, opacity: 0.5 }}>
                    <BugReport sx={{ fontSize: 100, mb: 2 }} />
                    <Typography variant="h6">لا توجد تقارير حالياً</Typography>
                </Box>
            ) : (
                <Grid container spacing={3}>
                    <AnimatePresence>
                        {reports.map((report, index) => (
                            <Grid item xs={12} md={6} key={report.id}>
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <Box className="glass-panel" sx={{ p: 3, position: 'relative' }}>
                                        <Box display="flex" justifyContent="space-between" mb={2}>
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Assignment color="primary" />
                                                <Typography variant="subtitle1" fontWeight="bold">
                                                    سؤال #{report.questionId || 'غير معروف'}
                                                </Typography>
                                            </Box>
                                            <Chip
                                                label={report.status === 'resolved' ? 'تم الحل' : 'قيد المراجعة'}
                                                color={report.status === 'resolved' ? 'success' : 'warning'}
                                                size="small"
                                            />
                                        </Box>

                                        <Typography variant="body1" sx={{ mb: 2, bgcolor: 'rgba(0,0,0,0.2)', p: 2, borderRadius: 2 }}>
                                            {report.comment || report.text || 'لا يوجد تعليق'}
                                        </Typography>

                                        <Box display="flex" flexDirection="column" gap={1} mb={2}>
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Person fontSize="small" color="disabled" />
                                                <Typography variant="caption" color="text.secondary">
                                                    الطالب: {report.studentName || 'مجهول'} ({report.studentId || 'N/A'})
                                                </Typography>
                                            </Box>
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <AccessTime fontSize="small" color="disabled" />
                                                <Typography variant="caption" color="text.secondary">
                                                    التاريخ: {formatDate(report.createdAt)}
                                                </Typography>
                                            </Box>
                                        </Box>

                                        <Box display="flex" justifyContent="flex-end" gap={1} pt={2} borderTop="1px solid rgba(255,255,255,0.05)">
                                            {report.status !== 'resolved' && (
                                                <Tooltip title="تم الحل">
                                                    <IconButton color="success" onClick={() => handleStatus(report.id, 'resolved')}>
                                                        <CheckCircle />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title="حذف">
                                                <IconButton color="error" onClick={() => handleDelete(report.id)}>
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
