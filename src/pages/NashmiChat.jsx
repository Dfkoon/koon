import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Tab, Tabs, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress, Chip, Alert, Divider } from '@mui/material';
import Delete from '@mui/icons-material/Delete';
import Refresh from '@mui/icons-material/Refresh';
import Send from '@mui/icons-material/Send';
import DeleteSweep from '@mui/icons-material/DeleteSweep';
import BugReport from '@mui/icons-material/BugReport';
import CheckCircle from '@mui/icons-material/CheckCircle';
import { nashmiService } from '../services/nashmiService';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function NashmiChat() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);
    const { currentUser } = useAuth();

    // Answer Dialog State
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedLog, setSelectedLog] = useState(null);
    const [answerText, setAnswerText] = useState('');

    // Debug Scanner State
    const [openScanner, setOpenScanner] = useState(false);
    const [scanResults, setScanResults] = useState(null);
    const [scanning, setScanning] = useState(false);

    const runScan = async () => {
        setScanning(true);
        setOpenScanner(true);
        const results = await nashmiService.scanCollections();
        setScanResults(results);
        setScanning(false);
    };

    const handleSwitchCollection = (colName) => {
        nashmiService.setCollectionName(colName);
        toast.success(`تم التحويل إلى المجموعة: ${colName}`);
        setOpenScanner(false);
        loadData();
    };

    const loadData = async () => {
        setLoading(true);
        // We filter for 'nashmi' type specifically
        const data = await nashmiService.getAllLogs(['nashmi', 'bot', 'chat']);
        setLogs(data);
        setLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    // Filter Logs
    const unansweredLogs = logs.filter(log => log.status !== 'answered');
    const answeredLogs = logs.filter(log => log.status === 'answered');

    const handleAnswerClick = (log) => {
        setSelectedLog(log);
        setAnswerText(''); // Reset or pre-fill if editing
        setOpenDialog(true);
    };

    const submitAnswer = async () => {
        if (!answerText.trim()) return;

        try {
            await nashmiService.markAsAnswered(selectedLog.id, selectedLog.question, answerText);
            toast.success('تم اعتماد الإجابة وإضافتها للبوت');
            setOpenDialog(false);
            loadData(); // Reload to update lists
        } catch (error) {
            console.error(error);
            toast.error('حدث خطأ أثناء الحفظ');
        }
    };

    const handleDeleteAll = async () => {
        if (window.confirm('⚠️ تحذير: هل أنت متأكد من حذف جميع سجلات المحادثة؟ لا يمكن التراجع عن هذا الإجراء.')) {
            try {
                await nashmiService.deleteAllLogs();
                toast.success('تم تنظيف السجلات بنجاح');
                setLogs([]);
            } catch (error) {
                toast.error('فشل الحذف');
            }
        }
    };

    const handleDeleteSingle = async (id) => {
        if (window.confirm('حذف هذا السجل؟')) {
            await nashmiService.deleteLog(id);
            setLogs(prev => prev.filter(l => l.id !== id));
            toast.success('تم الحذف');
        }
    };

    return (
        <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" fontWeight="bold">إدارة "نشمي شات"</Typography>
                <Box display="flex" gap={2}>
                    <Button
                        variant="outlined"
                        onClick={runScan}
                        startIcon={scanning ? <CircularProgress size={20} /> : <BugReport />}
                        disabled={scanning}
                        sx={{ color: 'warning.main', borderColor: 'warning.main' }}
                    >
                        فحص البيانات
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<DeleteSweep />}
                        onClick={handleDeleteAll}
                        sx={{ bgcolor: 'rgba(211,47,47,0.1)', color: 'var(--error)', boxShadow: 'none' }}
                    >
                        حذف الكل
                    </Button>
                    <IconButton onClick={loadData}><Refresh /></IconButton>
                </Box>
            </Box>

            {/* Tabs */}
            <Tabs
                value={tabValue}
                onChange={(e, v) => setTabValue(v)}
                textColor="primary"
                indicatorColor="primary"
                sx={{ mb: 2, borderBottom: '1px solid var(--glass-border)' }}
            >
                <Tab label={`أسئلة غير مجابة (${unansweredLogs.length})`} />
                <Tab label={`الأرشيف / تم الرد (${answeredLogs.length})`} />
            </Tabs>

            {/* Valid Content Area */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }} className="glass-panel">
                {loading ? (
                    <Box display="flex" justifyContent="center" p={5}><CircularProgress /></Box>
                ) : (
                    <>
                        {/* UNANSWERED TAB */}
                        {tabValue === 0 && (
                            <Box display="flex" flexDirection="column" gap={2}>
                                {unansweredLogs.length === 0 ? (
                                    <Typography align="center" color="text.secondary" py={5}>لا توجد أسئلة جديدة</Typography>
                                ) : (
                                    unansweredLogs.map(log => (
                                        <Paper key={log.id} sx={{ p: 2, bgcolor: 'var(--bg-card)', border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="body1" fontWeight="bold">"{log.question || log.message}"</Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG') : 'بدون تاريخ'}
                                                </Typography>
                                            </Box>
                                            <Box display="flex" gap={1}>
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    startIcon={<Send />}
                                                    onClick={() => handleAnswerClick(log)}
                                                >
                                                    إجابة واعتماد
                                                </Button>
                                                <IconButton color="error" size="small" onClick={() => handleDeleteSingle(log.id)}>
                                                    <Delete />
                                                </IconButton>
                                            </Box>
                                        </Paper>
                                    ))
                                )}
                            </Box>
                        )}

                        {/* ANSWERED TAB */}
                        {tabValue === 1 && (
                            <Box display="flex" flexDirection="column" gap={2}>
                                {answeredLogs.length === 0 ? (
                                    <Typography align="center" color="text.secondary" py={5}>الأرشيف فارغ</Typography>
                                ) : (
                                    answeredLogs.map(log => (
                                        <Paper key={log.id} sx={{ p: 2, bgcolor: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderLeft: '4px solid #4caf50' }}>
                                            <Box display="flex" justifyContent="space-between" mb={1}>
                                                <Typography variant="subtitle2" color="primary">السؤال:</Typography>
                                                <IconButton color="error" size="small" onClick={() => handleDeleteSingle(log.id)}><Delete fontSize="small" /></IconButton>
                                            </Box>
                                            <Typography variant="body1" gutterBottom>"{log.question || log.message}"</Typography>

                                            {/* Original Bot Response */}
                                            {(log.response || log.answer) && (
                                                <Box mt={1} p={1.5} bgcolor="var(--input-bg)" borderRadius={1} border="1px dashed var(--glass-border)">
                                                    <Typography variant="caption" color="text.secondary">
                                                        {log.adminAnswer ? "رد البوت الآلي (قبل التعديل):" : "الرد المسجل:"}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">"{log.response || log.answer}"</Typography>
                                                </Box>
                                            )}

                                            {/* Admin Answer (Only show if exists) */}
                                            {log.adminAnswer && (
                                                <Box mt={2} p={1.5} bgcolor="rgba(76, 175, 80, 0.1)" borderRadius={1}>
                                                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                                        <CheckCircle fontSize="small" color="success" />
                                                        <Typography variant="subtitle2" color="success.main">الإجابة المعتمدة (من المشرف):</Typography>
                                                    </Box>
                                                    <Typography variant="body2">{log.adminAnswer}</Typography>
                                                </Box>
                                            )}
                                        </Paper>
                                    ))
                                )}
                            </Box>
                        )}
                    </>
                )}
            </Box>

            {/* Answer Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
                <DialogTitle>إجابة واعتماد السؤال للبوت</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom fontWeight="bold" sx={{ mt: 1 }}>
                        السؤال: "{selectedLog?.question || selectedLog?.message}"
                    </Typography>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="الإجابة النموذجية"
                        fullWidth
                        multiline
                        rows={4}
                        variant="outlined"
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder="اكتب الإجابة التي سيعتمدها البوت في الردود القادمة..."
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDialog(false)}>إلغاء</Button>
                    <Button onClick={submitAnswer} variant="contained" color="primary">
                        حفظ واعتماد
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Data Scanner Dialog */}
            <Dialog open={openScanner} onClose={() => setOpenScanner(false)} fullWidth maxWidth="md">
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <BugReport color="warning" />
                        فحص مجموعات البيانات (Data Scanner)
                    </Box>
                </DialogTitle>
                <DialogContent dividers>
                    <Box sx={{ mb: 2, p: 2, bgcolor: 'var(--bg-card)', borderRadius: 2 }}>
                        <Typography variant="subtitle2" color="primary" gutterBottom>معلومات الحساب الحالي:</Typography>
                        <Typography variant="body2">
                            البريد الشخصي: <strong>{currentUser?.email || 'غير مسجل'}</strong>
                        </Typography>
                        <Alert severity={['admin@koon.bau.jo', 'hussienaldayyat@gmail.com'].includes(currentUser?.email) ? "success" : "warning"} sx={{ mt: 1 }}>
                            {['admin@koon.bau.jo', 'hussienaldayyat@gmail.com'].includes(currentUser?.email)
                                ? "أنت مسجل كأدمين (Admin) ولديك صلاحيات كاملة."
                                : "حسابك الحالي ليس لديه صلاحيات أدمن لإدارة هذه البيانات."}
                        </Alert>
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    {scanning && <Box display="flex" justifyContent="center" p={3}><CircularProgress /></Box>}

                    {!scanning && scanResults && (
                        <Box>
                            <Typography gutterBottom>نتائج الفحص:</Typography>
                            {scanResults.length === 0 ? (
                                <Alert severity="info">لم يتم العثور على أي مجموعات بيانات معروفة.</Alert>
                            ) : (
                                <Box display="flex" flexDirection="column" gap={2}>
                                    {scanResults.map((res) => (
                                        <Paper key={res.name} variant="outlined" sx={{ p: 2, borderColor: res.count > 0 ? 'success.main' : 'divider' }}>
                                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                                <Box>
                                                    <Typography variant="h6" color="primary">{res.name}</Typography>
                                                    <Typography variant="body2" color="text.secondary">Documents Found: {res.count}</Typography>
                                                    <Typography variant="caption" sx={{ display: 'block', mt: 1, fontFamily: 'monospace', bgcolor: 'var(--input-bg)', p: 0.5, borderRadius: 1 }}>
                                                        Keys: {res.keys}
                                                        <br />
                                                        Type: <strong>{res.sampleType}</strong>
                                                    </Typography>
                                                </Box>
                                                <Box display="flex" flexDirection="column" gap={1} alignItems="flex-end">
                                                    <Chip label={res.count} color={res.count > 0 ? "success" : "default"} />
                                                    {res.count > 0 && res.name !== 'nashmi_chat' && (
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            onClick={() => handleSwitchCollection(res.name)}
                                                            sx={{ fontSize: '10px' }}
                                                        >
                                                            استخدام هذه المجموعة
                                                        </Button>
                                                    )}
                                                </Box>
                                            </Box>
                                        </Paper>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenScanner(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
