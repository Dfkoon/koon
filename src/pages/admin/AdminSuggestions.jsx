import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Paper, Card, CardContent,
    Button, Grid, TextField, Dialog, DialogTitle,
    DialogContent, DialogActions, Chip, Divider,
    IconButton, Tooltip
} from '@mui/material';
import {
    Delete, Reply, CheckCircle,
    ErrorOutline, Person, Category,
    Email as EmailIcon
} from '@mui/icons-material';
import { qnaService as suggestionsService } from '../../services/qnaService';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function AdminSuggestions() {
    const { t, language } = useLanguage();
    const isAr = language === 'ar';
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [openReply, setOpenReply] = useState(false);
    const [selectedMsg, setSelectedMsg] = useState(null);
    const [replyText, setReplyText] = useState('');

    const loadMessages = async () => {
        setIsLoading(true);
        const data = await suggestionsService.getAllSuggestions();
        setMessages(data);
        setIsLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadMessages();
    }, []);

    const handleReply = async (id) => {
        if (!replyText.trim()) return;
        const result = await suggestionsService.replyToSuggestion(id, replyText);
        if (result.success) {
            toast.success(isAr ? 'تم إرسال الرد' : 'Reply sent');
            setOpenReply(false);
            setReplyText('');
            loadMessages();
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm(isAr ? 'هل أنت متأكد من الحذف؟' : 'Are you sure?')) {
            const result = await suggestionsService.deleteSuggestion(id);
            if (result.success) {
                toast.success(isAr ? 'تم الحذف' : 'Deleted');
                loadMessages();
            }
        }
    };

    const toggleStatus = async (id, currentIsPublic) => {
        const result = await suggestionsService.updateSuggestion(id, { isPublic: !currentIsPublic });
        if (result.success) {
            toast.success(isAr ? 'تم تحديث الحالة' : 'Status updated');
            loadMessages();
        }
    };

    return (
        <Box>
            <Box sx={{ mb: 4 }}>
                <ShinyHeader text={t('adminSuggestions')} variant="h4" gutterBottom />
            </Box>

            {isLoading ? (
                <Typography>{isAr ? 'جاري التحميل...' : 'Loading...'}</Typography>
            ) : messages.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
                    <Typography variant="h6">{t('noSuggestions')}</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {messages.map((msg) => (
                        <Grid item xs={12} md={6} key={msg.id}>
                            <Card sx={{
                                height: '100%',
                                borderLeft: msg.isPublic ? '5px solid #4caf50' : '5px solid #ff9800',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <CardContent sx={{ flexGrow: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Person color="primary" fontSize="small" />
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                {msg.senderName || (isAr ? 'فاعل خير' : 'Anonymous')}
                                            </Typography>
                                        </Box>
                                        <Chip
                                            label={isAr ? (msg.isPublic ? 'منشور' : 'قيد الانتظار') : (msg.isPublic ? 'Public' : 'Pending')}
                                            size="small"
                                            color={msg.isPublic ? 'success' : 'warning'}
                                        />
                                    </Box>

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <Category color="action" fontSize="small" />
                                        <Typography variant="caption" color="text.secondary">
                                            {msg.category}
                                        </Typography>
                                    </Box>

                                    <Typography variant="body1" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
                                        {msg.text}
                                    </Typography>

                                    {msg.reply && (
                                        <Paper sx={{ p: 2, bgcolor: 'action.hover', borderRight: '3px solid #1a237e', mt: 2 }}>
                                            <Typography variant="caption" fontWeight="bold" color="primary" display="block" gutterBottom>
                                                {isAr ? 'رد الإدارة:' : 'Admin Reply:'}
                                            </Typography>
                                            <Typography variant="body2">{msg.reply}</Typography>
                                        </Paper>
                                    )}
                                </CardContent>

                                <Divider />

                                <Box sx={{ p: 1, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                    <Tooltip title={isAr ? 'تغيير الحالة' : 'Toggle Status'}>
                                        <IconButton onClick={() => toggleStatus(msg.id, msg.isPublic)} size="small" color="info">
                                            <CheckCircle fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Button
                                        size="small"
                                        startIcon={<Reply />}
                                        onClick={() => { setSelectedMsg(msg); setOpenReply(true); }}
                                    >
                                        {isAr ? 'رد' : 'Reply'}
                                    </Button>
                                    <IconButton onClick={() => handleDelete(msg.id)} size="small" color="error">
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </Box>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}

            <Dialog open={openReply} onClose={() => setOpenReply(false)} fullWidth maxWidth="sm">
                <DialogTitle>{isAr ? 'الرد على الاقتراح' : 'Reply to Suggestion'}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                        {selectedMsg?.text}
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        multiline
                        rows={4}
                        label={isAr ? 'اكتب ردك هنا' : 'Write your reply'}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenReply(false)}>{t('delete')}</Button>
                    <Button variant="contained" onClick={() => handleReply(selectedMsg.id)}>{t('submitReply')}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
