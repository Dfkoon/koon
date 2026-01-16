import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Chip, IconButton, Tooltip, CircularProgress, Fab, Paper,
    TableContainer, Table, TableHead, TableRow, TableCell, TableBody,
    Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField,
    FormControlLabel, Switch
} from '@mui/material';
import Delete from '@mui/icons-material/Delete';
import CheckCircle from '@mui/icons-material/CheckCircle';
import Refresh from '@mui/icons-material/Refresh';
import Chat from '@mui/icons-material/Chat';
import Person from '@mui/icons-material/Person';
import AccessTime from '@mui/icons-material/AccessTime';
import School from '@mui/icons-material/School';
import { motion, AnimatePresence } from 'framer-motion';
import { nashmiService } from '../services/nashmiService';
import toast from 'react-hot-toast';

export default function NashmiChat() {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedLog, setSelectedLog] = useState(null);
    const [trainingAnswer, setTrainingAnswer] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [filterNewOnly, setFilterNewOnly] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        const data = await nashmiService.getAllLogs();
        setLogs(data);
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

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من حذف هذا السجل؟')) {
            await nashmiService.deleteLog(id);
            toast.success('تم الحذف بنجاح');
            setLogs(prev => prev.filter(log => log.id !== id));
        }
    };

    const handleStatus = async (id, status) => {
        await nashmiService.updateStatus(id, status);
        toast.success('تم التحديث');
        setLogs(prev => prev.map(log => log.id === id ? { ...log, status } : log));
    };

    const handleOpenTrain = (log) => {
        setSelectedLog(log);
        setTrainingAnswer('');
        setOpenDialog(true);
    };

    const handleTrain = async () => {
        if (!trainingAnswer.trim()) return toast.error('يرجى إدخال إجابة');

        try {
            await nashmiService.addLogToKnowledge(selectedLog.message || selectedLog.question, trainingAnswer);
            await handleStatus(selectedLog.id, 'reviewed');
            toast.success('تمت إضافة المعلومة لنشـمي بنجاح! 🤖');
            setOpenDialog(false);
        } catch (error) {
            toast.error('حدث خطأ أثناء التدريب');
        }
    };

    return (
        <Box>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight="bold">سجلات نشمي شات</Typography>
                <Box display="flex" alignItems="center" gap={2}>
                    <FormControlLabel
                        control={<Switch checked={filterNewOnly} onChange={(e) => setFilterNewOnly(e.target.checked)} color="primary" />}
                        label="غير المراجع فقط"
                    />
                    <Fab color="primary" size="small" onClick={loadData}>
                        <Refresh />
                    </Fab>
                </Box>
            </Box>

            {isLoading ? (
                <Box display="flex" justifyContent="center" mt={10}><CircularProgress /></Box>
            ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <TableContainer component={Paper} className="glass-panel" sx={{ background: 'transparent', boxShadow: 'none' }}>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: 'text.secondary' }}>السؤال</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>الطالب</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>التوقيت</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>الحالة</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>إجراءات</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                <AnimatePresence>
                                    {logs.filter(log => !filterNewOnly || log.status !== 'reviewed').map((log) => (
                                        <TableRow
                                            key={log.id}
                                            component={motion.tr}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                                        >
                                            <TableCell sx={{ color: 'white', maxWidth: 400 }}>
                                                <Box display="flex" gap={1.5}>
                                                    <Chat color="primary" sx={{ mt: 0.5 }} />
                                                    <Typography variant="body2">{log.message || log.question}</Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <Person fontSize="small" />
                                                    {log.studentName || 'مجهول'}
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <AccessTime fontSize="small" />
                                                    {formatDate(log.timestamp || log.createdAt)}
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={log.status === 'reviewed' ? 'تمت المراجعة' : 'جديد'}
                                                    color={log.status === 'reviewed' ? 'success' : 'warning'}
                                                    variant="outlined"
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Box display="flex" gap={1}>
                                                    <Tooltip title="تدريب نشـمي">
                                                        <IconButton color="info" onClick={() => handleOpenTrain(log)}>
                                                            <School />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {log.status !== 'reviewed' && (
                                                        <Tooltip title="تمييز كـ مراجع">
                                                            <IconButton color="success" onClick={() => handleStatus(log.id, 'reviewed')}>
                                                                <CheckCircle />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip title="حذف">
                                                        <IconButton color="error" onClick={() => handleDelete(log.id)}>
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
                    {logs.length === 0 && (
                        <Box textAlign="center" py={10} color="text.secondary">لا توجد سجلات حالياً</Box>
                    )}
                </motion.div>
            )}

            {/* Training Dialog */}
            <Dialog
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                PaperProps={{ className: 'glass-panel', sx: { bgcolor: 'rgba(26,26,26,0.95)', minWidth: 500 } }}
            >
                <DialogTitle>تدريب نشـمي 🤖</DialogTitle>
                <DialogContent>
                    <Typography variant="subtitle2" color="primary" gutterBottom sx={{ mt: 2 }}>السؤال:</Typography>
                    <Typography variant="body1" sx={{ mb: 3, p: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                        {selectedLog?.message || selectedLog?.question}
                    </Typography>

                    <TextField
                        fullWidth
                        multiline
                        rows={4}
                        label="الإجابة النموذجية"
                        placeholder="اكتب الإجابة التي يجب أن يتذكرها نشمي..."
                        value={trainingAnswer}
                        onChange={(e) => setTrainingAnswer(e.target.value)}
                        variant="outlined"
                    />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenDialog(false)} color="inherit">إلغاء</Button>
                    <Button onClick={handleTrain} variant="contained" color="primary">حفظ في الذاكرة</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
