import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Card, CardContent, Button,
    Grid, Chip, Paper, IconButton, Divider,
    Dialog, DialogTitle, DialogContent
} from '@mui/material';
import {
    Delete, Visibility, HelpOutline,
    Person, ErrorOutline,
    ContentCopy, Close
} from '@mui/icons-material';
import { qnaService } from '../../services/qnaService';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function AdminReports() {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [reports, setReports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);

    const loadReports = async () => {
        setIsLoading(true);
        const data = await qnaService.getAllReports();
        setReports(data);
        setIsLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadReports();
    }, []);

    const handleDelete = async (id) => {
        if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا البلاغ؟' : 'Are you sure you want to delete this report?')) {
            const result = await qnaService.deleteReport(id);
            if (result.success) {
                toast.success(isAr ? 'تم حذف البلاغ' : 'Report deleted');
                loadReports();
            } else {
                toast.error(isAr ? 'فشل الحذف' : 'Deletion failed');
            }
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success(isAr ? 'تم النسخ' : 'Copied');
    };

    return (
        <Box>
            <ShinyHeader text={isAr ? 'بلاغات الأسئلة' : 'Question Reports'} variant="h4" gutterBottom />

            {isLoading ? (
                <Box sx={{ p: 5, textAlign: 'center' }}>
                    <Typography>{isAr ? 'جاري التحميل...' : 'Loading...'}</Typography>
                </Box>
            ) : reports.length === 0 ? (
                <Paper sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                    <Typography>{isAr ? 'لا توجد بلاغات حالياً' : 'No reports found'}</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {reports.map((report) => (
                        <Grid item xs={12} key={report.id}>
                            <Card sx={{
                                borderLeft: '4px solid #f44336',
                                transition: '0.3s',
                                '&:hover': { boxShadow: 4 }
                            }}>
                                <CardContent>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} md={3}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                <Person color="primary" fontSize="small" />
                                                <Typography variant="subtitle1" fontWeight="bold">
                                                    {report.senderName}
                                                </Typography>
                                            </Box>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                {new Date(report.createdAt).toLocaleString()}
                                            </Typography>
                                            <Box sx={{ mt: 2 }}>
                                                <Chip
                                                    label={isAr ? `سؤال رقم ${report.questionIndex}` : `Q #${report.reportId || report.questionIndex}`}
                                                    size="small"
                                                    color="info"
                                                    variant="outlined"
                                                />
                                            </Box>
                                        </Grid>

                                        <Grid item xs={12} md={report.image ? 6 : 9}>
                                            <Box sx={{ mb: 2 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                    <HelpOutline fontSize="small" color="action" />
                                                    <Typography variant="subtitle2" color="text.secondary">
                                                        {isAr ? 'نص السؤال:' : 'Question Text:'}
                                                    </Typography>
                                                    <IconButton size="small" onClick={() => copyToClipboard(report.questionText)}>
                                                        <ContentCopy fontSize="inherit" />
                                                    </IconButton>
                                                </Box>
                                                <Typography variant="body2" sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1, fontStyle: 'italic' }}>
                                                    {report.questionText}
                                                </Typography>
                                            </Box>

                                            <Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                    <ErrorOutline fontSize="small" color="error" />
                                                    <Typography variant="subtitle2" color="error">
                                                        {isAr ? 'وصف الخطأ:' : 'Error Description:'}
                                                    </Typography>
                                                </Box>
                                                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                                    {report.errorDescription}
                                                </Typography>
                                            </Box>
                                        </Grid>

                                        {report.image && (
                                            <Grid item xs={12} md={3}>
                                                <Box
                                                    onClick={() => setSelectedImage(report.image)}
                                                    sx={{
                                                        width: '100%',
                                                        height: '120px',
                                                        borderRadius: 1,
                                                        overflow: 'hidden',
                                                        cursor: 'zoom-in',
                                                        position: 'relative',
                                                        border: '1px solid',
                                                        borderColor: 'divider'
                                                    }}
                                                >
                                                    <img
                                                        src={report.image}
                                                        alt="Report Proof"
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                    <Box sx={{
                                                        position: 'absolute',
                                                        bottom: 0,
                                                        left: 0,
                                                        right: 0,
                                                        bgcolor: 'rgba(0,0,0,0.5)',
                                                        color: 'white',
                                                        p: 0.5,
                                                        textAlign: 'center'
                                                    }}>
                                                        <Visibility sx={{ fontSize: '1rem' }} />
                                                    </Box>
                                                </Box>
                                            </Grid>
                                        )}
                                    </Grid>

                                    <Divider sx={{ my: 2 }} />

                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <Button
                                            startIcon={<Delete />}
                                            color="error"
                                            size="small"
                                            onClick={() => handleDelete(report.id)}
                                        >
                                            {isAr ? 'حذف البلاغ' : 'Delete Report'}
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog
                open={Boolean(selectedImage)}
                onClose={() => setSelectedImage(null)}
                maxWidth="lg"
            >
                <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'flex-end' }}>
                    <IconButton onClick={() => setSelectedImage(null)}>
                        <Close />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <img src={selectedImage} alt="Full Preview" style={{ width: '100%', height: 'auto', borderRadius: '8px' }} />
                </DialogContent>
            </Dialog>
        </Box>
    );
}
