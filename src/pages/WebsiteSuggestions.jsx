import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Chip, CircularProgress, Link, Button, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Divider } from '@mui/material';
import Delete from '@mui/icons-material/Delete';
import Language from '@mui/icons-material/Language';
import Refresh from '@mui/icons-material/Refresh';
import { websiteSuggestionsService } from '../services/websiteSuggestionsService';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { nashmiService } from '../services/nashmiService';

export default function WebsiteSuggestions() {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const { currentUser } = useAuth();

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Try to fetch with filtering for website/tool types
            let data = await websiteSuggestionsService.getAllSuggestions(['website', 'tool', 'resource', 'link']);
            setSuggestions(data);
        } catch (error) {
            console.error("Load website suggestions error:", error);
            toast.error("خطأ في تحميل البيانات");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من حذف هذا الاقتراح؟')) {
            try {
                await websiteSuggestionsService.deleteSuggestion(id);
                toast.success('تم الحذف بنجاح');
                setSuggestions(prev => prev.filter(item => item.id !== id));
            } catch (error) {
                toast.error('حدث خطأ أثناء الحذف');
            }
        }
    };

    // Debug Scanner State
    const [openScanner, setOpenScanner] = useState(false);
    const [scanResults, setScanResults] = useState(null);
    const [scanning, setScanning] = useState(false);
    const [scanError, setScanError] = useState(null);

    const runScan = async () => {
        setScanning(true);
        setOpenScanner(true);
        try {
            const results = await nashmiService.scanCollections();
            setScanResults(results);
        } catch (err) {
            console.error(err);
            setScanError("Failed to run scan. Check console.");
        }
        setScanning(false);
    };

    const handleSwitchCollection = (colName) => {
        websiteSuggestionsService.setCollectionName(colName);
        toast.success(`تم التحويل إلى المجموعة: ${colName}`);
        setOpenScanner(false);
        loadData();
    };

    return (
        <Box sx={{ p: 0, height: 'calc(100vh - 100px)' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
                <Typography variant="h4" fontWeight="bold">اقتراحات المواقع والأدوات</Typography>
                <Box display="flex" gap={2}>
                    <Button
                        variant="outlined"
                        onClick={runScan}
                        startIcon={scanning ? <CircularProgress size={20} /> : <Language />}
                        disabled={scanning}
                        sx={{ color: 'warning.main', borderColor: 'warning.main' }}
                    >
                        فحص البيانات
                    </Button>
                    <IconButton onClick={loadData} color="primary" sx={{ bgcolor: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
                        <Refresh />
                    </IconButton>
                </Box>
            </Box>

            <TableContainer component={Paper} className="glass-panel" sx={{ maxHeight: '100%', overflowY: 'auto' }}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: 'var(--bg-card)', color: 'var(--text-secondary)' }}>اسم الموقع / الأداة</TableCell>
                            <TableCell sx={{ bgcolor: 'var(--bg-card)', color: 'var(--text-secondary)' }}>شرح / ملاحظات</TableCell>
                            <TableCell sx={{ bgcolor: 'var(--bg-card)', color: 'var(--text-secondary)' }}>الرابط</TableCell>
                            <TableCell sx={{ bgcolor: 'var(--bg-card)', color: 'var(--text-secondary)' }} align="left">إجراءات</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 10 }}>
                                    <CircularProgress />
                                </TableCell>
                            </TableRow>
                        ) : suggestions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 10, color: 'text.secondary' }}>
                                    لا توجد اقتراحات حالياً
                                </TableCell>
                            </TableRow>
                        ) : (
                            suggestions.map((row) => (
                                <TableRow key={row.id} sx={{ '&:hover': { bgcolor: 'var(--bg-card-hover)' } }}>
                                    <TableCell>
                                        <Typography variant="subtitle1" fontWeight="bold">
                                            {row.siteName || row.name || 'بدون اسم'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 400 }}>
                                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>
                                            {row.description || row.note || row.text || 'لا يوجد شرح'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        {row.link || row.url ? (
                                            <Chip
                                                icon={<Language sx={{ fontSize: '1rem !important' }} />}
                                                label="زيارة الموقع"
                                                component="a"
                                                href={row.link || row.url}
                                                target="_blank"
                                                clickable
                                                color="primary"
                                                variant="outlined"
                                                size="small"
                                            />
                                        ) : (
                                            <Typography variant="caption" color="text.secondary">لا يوجد رابط</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell align="left">
                                        <IconButton color="error" onClick={() => handleDelete(row.id)}>
                                            <Delete />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Data Scanner Dialog */}
            <Dialog open={openScanner} onClose={() => setOpenScanner(false)} fullWidth maxWidth="md">
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <Language color="warning" />
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
                                                    {res.count > 0 && res.name !== 'site_suggestions' && (
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
                    {scanError && <Alert severity="error">{scanError}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenScanner(false)}>إغلاق</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
