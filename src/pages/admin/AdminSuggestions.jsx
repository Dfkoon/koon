import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Button, Grid, TextField, Dialog, DialogTitle,
    DialogContent, DialogActions, Chip, Divider,
    IconButton, Tooltip, Avatar, useTheme, Card, CardContent,
    FormControl, InputLabel, Select, MenuItem, InputAdornment
} from '@mui/material';
import {
    Delete, Reply, CheckCircle,
    Person, Category, Email as EmailIcon,
    ChatBubbleOutline, Send, Close, FilterList, Search,
    Warning, PriorityHigh, Info
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { qnaService as suggestionsService } from '../../services/qnaService';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function AdminSuggestions() {
    const { t, language } = useLanguage();
    const theme = useTheme();
    const isAr = language === 'ar';
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [openReply, setOpenReply] = useState(false);
    const [selectedMsg, setSelectedMsg] = useState(null);
    const [replyText, setReplyText] = useState('');

    // Filter states
    const [filterType, setFilterType] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterPriority, setFilterPriority] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    const loadMessages = async () => {
        setIsLoading(true);
        const data = await suggestionsService.getAllSuggestions();
        setMessages(data);
        setIsLoading(false);
    };

    useEffect(() => {
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

    // Auto-assign priority based on keywords
    const getPriority = (msg) => {
        if (msg.priority) return msg.priority;
        const text = (msg.message || msg.text || '').toLowerCase();
        if (text.includes('عاجل') || text.includes('urgent') || text.includes('مهم') || text.includes('important')) {
            return 'urgent';
        }
        if (text.includes('شكوى') || text.includes('complaint') || text.includes('مشكلة') || text.includes('problem')) {
            return 'medium';
        }
        return 'normal';
    };

    // Filter messages
    const filteredMessages = messages.filter(msg => {
        // Type filter
        if (filterType !== 'all' && msg.type !== filterType) return false;

        // Status filter
        if (filterStatus === 'published' && !msg.isPublic) return false;
        if (filterStatus === 'pending' && msg.isPublic) return false;
        if (filterStatus === 'answered' && !msg.reply) return false;
        if (filterStatus === 'unanswered' && msg.reply) return false;

        // Priority filter
        if (filterPriority !== 'all' && getPriority(msg) !== filterPriority) return false;

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const text = (msg.message || msg.text || '').toLowerCase();
            const name = (msg.name || '').toLowerCase();
            const reply = (msg.reply || '').toLowerCase();
            if (!text.includes(query) && !name.includes(query) && !reply.includes(query)) {
                return false;
            }
        }

        return true;
    });

    // Calculate statistics
    const stats = {
        total: messages.length,
        pending: messages.filter(m => !m.isPublic).length,
        answered: messages.filter(m => m.reply).length,
        unanswered: messages.filter(m => !m.reply).length,
        urgent: messages.filter(m => getPriority(m) === 'urgent').length
    };

    return (
        <Box sx={{ p: { xs: 1, md: 3 } }}>
            <Box sx={{ mb: 4 }}>
                <ShinyHeader text={t('adminSuggestions')} variant="h3" gutterBottom />
            </Box>

            {/* Quick Stats Cards */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={6} sm={2.4}>
                    <Card sx={{ bgcolor: '#e8eaf6', borderLeft: '5px solid #1a237e' }}>
                        <CardContent sx={{ p: 2 }}>
                            <Typography variant="caption" color="text.secondary">{isAr ? 'الإجمالي' : 'Total'}</Typography>
                            <Typography variant="h4" fontWeight="bold">{stats.total}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={2.4}>
                    <Card sx={{ bgcolor: '#fff3e0', borderLeft: '5px solid #FF9800' }}>
                        <CardContent sx={{ p: 2 }}>
                            <Typography variant="caption" color="text.secondary">{isAr ? 'معلقة' : 'Pending'}</Typography>
                            <Typography variant="h4" fontWeight="bold">{stats.pending}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={2.4}>
                    <Card sx={{ bgcolor: '#e8f5e9', borderLeft: '5px solid #4CAF50' }}>
                        <CardContent sx={{ p: 2 }}>
                            <Typography variant="caption" color="text.secondary">{isAr ? 'مجابة' : 'Answered'}</Typography>
                            <Typography variant="h4" fontWeight="bold">{stats.answered}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={2.4}>
                    <Card sx={{ bgcolor: '#fce4ec', borderLeft: '5px solid #E91E63' }}>
                        <CardContent sx={{ p: 2 }}>
                            <Typography variant="caption" color="text.secondary">{isAr ? 'غير مجابة' : 'Unanswered'}</Typography>
                            <Typography variant="h4" fontWeight="bold">{stats.unanswered}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={2.4}>
                    <Card sx={{ bgcolor: '#ffebee', borderLeft: '5px solid #D32F2F' }}>
                        <CardContent sx={{ p: 2 }}>
                            <Typography variant="caption" color="text.secondary">{isAr ? 'عاجلة' : 'Urgent'}</Typography>
                            <Typography variant="h4" fontWeight="bold">{stats.urgent}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Filters */}
            <Card sx={{ p: 3, mb: 4, bgcolor: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={3}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder={isAr ? 'بحث...' : 'Search...'}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search />
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>{isAr ? 'النوع' : 'Type'}</InputLabel>
                            <Select value={filterType} label={isAr ? 'النوع' : 'Type'} onChange={(e) => setFilterType(e.target.value)}>
                                <MenuItem value="all">{isAr ? 'الكل' : 'All'}</MenuItem>
                                <MenuItem value="suggestion">{isAr ? 'اقتراح' : 'Suggestion'}</MenuItem>
                                <MenuItem value="complaint">{isAr ? 'شكوى' : 'Complaint'}</MenuItem>
                                <MenuItem value="question">{isAr ? 'استفسار' : 'Question'}</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>{isAr ? 'الحالة' : 'Status'}</InputLabel>
                            <Select value={filterStatus} label={isAr ? 'الحالة' : 'Status'} onChange={(e) => setFilterStatus(e.target.value)}>
                                <MenuItem value="all">{isAr ? 'الكل' : 'All'}</MenuItem>
                                <MenuItem value="published">{isAr ? 'منشور' : 'Published'}</MenuItem>
                                <MenuItem value="pending">{isAr ? 'معلق' : 'Pending'}</MenuItem>
                                <MenuItem value="answered">{isAr ? 'مجاب' : 'Answered'}</MenuItem>
                                <MenuItem value="unanswered">{isAr ? 'غير مجاب' : 'Unanswered'}</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={2}>
                        <FormControl fullWidth size="small">
                            <InputLabel>{isAr ? 'الأولوية' : 'Priority'}</InputLabel>
                            <Select value={filterPriority} label={isAr ? 'الأولوية' : 'Priority'} onChange={(e) => setFilterPriority(e.target.value)}>
                                <MenuItem value="all">{isAr ? 'الكل' : 'All'}</MenuItem>
                                <MenuItem value="urgent">{isAr ? 'عاجل' : 'Urgent'}</MenuItem>
                                <MenuItem value="medium">{isAr ? 'متوسط' : 'Medium'}</MenuItem>
                                <MenuItem value="normal">{isAr ? 'عادي' : 'Normal'}</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => {
                                setFilterType('all');
                                setFilterStatus('all');
                                setFilterPriority('all');
                                setSearchQuery('');
                            }}
                        >
                            {isAr ? 'إعادة تعيين' : 'Reset Filters'}
                        </Button>
                    </Grid>
                </Grid>
            </Card>

            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
                    <Typography variant="h5" color="text.muted" className="animate-pulse">
                        {isAr ? 'جاري التحميل...' : 'Loading suggestions...'}
                    </Typography>
                </Box>
            ) : filteredMessages.length === 0 ? (
                <Box className="glass-card" sx={{ p: 6, textAlign: 'center', borderRadius: '30px' }}>
                    <Typography variant="h6" color="text.muted">{isAr ? 'لا توجد نتائج' : 'No results found'}</Typography>
                </Box>
            ) : (
                <Grid container spacing={4}>
                    <AnimatePresence>
                        {filteredMessages.map((msg, index) => {
                            const priority = getPriority(msg);
                            const priorityColors = {
                                urgent: { bg: 'rgba(211, 47, 47, 0.1)', border: '#D32F2F', icon: <Warning sx={{ fontSize: '1rem' }} /> },
                                medium: { bg: 'rgba(255, 152, 0, 0.1)', border: '#FF9800', icon: <PriorityHigh sx={{ fontSize: '1rem' }} /> },
                                normal: { bg: 'rgba(76, 175, 80, 0.1)', border: '#4CAF50', icon: <Info sx={{ fontSize: '1rem' }} /> }
                            };
                            const priorityConfig = priorityColors[priority];

                            return (
                                <Grid item xs={12} key={msg.id}>
                                    <motion.div
                                        initial={{ opacity: 0, x: isAr ? 50 : -50 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ duration: 0.5, delay: index * 0.1 }}
                                    >
                                        <Box className="glass-card" sx={{
                                            p: 0,
                                            display: 'flex',
                                            flexDirection: { xs: 'column', md: 'row' },
                                            borderRadius: '30px',
                                            overflow: 'hidden',
                                            border: '1px solid var(--glass-border)',
                                            background: 'var(--bg-card)',
                                            transition: 'var(--transition-smooth)',
                                            '&:hover': {
                                                borderColor: msg.isPublic ? 'var(--success)' : 'var(--warning)',
                                                boxShadow: msg.isPublic ? '0 0 30px rgba(0, 230, 118, 0.1)' : '0 0 30px rgba(255, 171, 0, 0.1)'
                                            }
                                        }}>
                                            {/* Status Glow Bar */}
                                            <Box sx={{
                                                width: { xs: '100%', md: '8px' },
                                                height: { xs: '4px', md: 'auto' },
                                                bgcolor: msg.isPublic ? 'var(--success)' : 'var(--warning)',
                                                boxShadow: `0 0 15px ${msg.isPublic ? 'var(--success)' : 'var(--warning)'}`
                                            }} />

                                            {/* Ticket Side - User Info */}
                                            <Box sx={{
                                                p: 4,
                                                minWidth: '250px',
                                                bgcolor: 'rgba(255,255,255,0.02)',
                                                borderRight: isAr ? 'none' : '1px solid var(--glass-border)',
                                                borderLeft: isAr ? '1px solid var(--glass-border)' : 'none',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: 2
                                            }}>
                                                <Avatar sx={{
                                                    width: 80,
                                                    height: 80,
                                                    bgcolor: 'var(--bg-dark)',
                                                    border: `2px solid ${msg.isPublic ? 'var(--success)' : 'var(--warning)'}`,
                                                    boxShadow: `0 0 20px ${msg.isPublic ? 'var(--success)22' : 'var(--warning)22'}`
                                                }}>
                                                    <Person sx={{ fontSize: '3rem', color: msg.isPublic ? 'var(--success)' : 'var(--warning)' }} />
                                                </Avatar>
                                                <Box sx={{ textAlign: 'center' }}>
                                                    <Typography variant="h6" sx={{ fontWeight: 900, color: '#FFF' }}>
                                                        {msg.name || (isAr ? 'فاعل خير' : 'Anonymous')}
                                                    </Typography>
                                                    <Chip
                                                        icon={<Category sx={{ fontSize: '1rem !important' }} />}
                                                        label={msg.type}
                                                        size="small"
                                                        sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', fontWeight: 700 }}
                                                    />
                                                </Box>
                                            </Box>

                                            {/* Content Side */}
                                            <Box sx={{ p: 4, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                                    <Typography variant="caption" sx={{ color: 'var(--text-muted)', fontWeight: 700 }}>
                                                        {msg.createdAt ? new Date(msg.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US') : '---'}
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                                        <Chip
                                                            icon={priorityConfig.icon}
                                                            label={isAr ?
                                                                (priority === 'urgent' ? 'عاجل' : priority === 'medium' ? 'متوسط' : 'عادي') :
                                                                (priority.charAt(0).toUpperCase() + priority.slice(1))
                                                            }
                                                            size="small"
                                                            sx={{
                                                                bgcolor: priorityConfig.bg,
                                                                border: `1px solid ${priorityConfig.border}`,
                                                                color: priorityConfig.border,
                                                                fontWeight: 900
                                                            }}
                                                        />
                                                        <Chip
                                                            label={isAr ? (msg.isPublic ? 'منشور' : 'بانتظار الموافقة') : (msg.isPublic ? 'Published' : 'Pending Review')}
                                                            variant="outlined"
                                                            color={msg.isPublic ? 'success' : 'warning'}
                                                            size="small"
                                                            sx={{ fontWeight: 900 }}
                                                        />
                                                    </Box>
                                                </Box>

                                                <Typography variant="body1" sx={{
                                                    fontSize: '1.2rem',
                                                    lineHeight: 1.8,
                                                    color: 'var(--text-main)',
                                                    mb: 4,
                                                    whiteSpace: 'pre-wrap'
                                                }}>
                                                    {msg.message || msg.text}
                                                </Typography>

                                                {msg.reply && (
                                                    <Box sx={{
                                                        p: 3,
                                                        bgcolor: 'rgba(211, 47, 47, 0.05)',
                                                        borderRadius: '20px',
                                                        border: '1px solid rgba(211, 47, 47, 0.1)',
                                                        position: 'relative',
                                                        mt: 'auto'
                                                    }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                            <Send sx={{ fontSize: '1rem', color: 'var(--primary)' }} />
                                                            <Typography variant="caption" sx={{ fontWeight: 900, color: 'var(--primary)', letterSpacing: 1 }}>
                                                                {isAr ? 'رد الإدارة' : 'OFFICIAL REPLY'}
                                                            </Typography>
                                                        </Box>
                                                        <Typography variant="body2" sx={{ color: 'var(--text-main)', opacity: 0.9 }}>
                                                            {msg.reply}
                                                        </Typography>
                                                    </Box>
                                                )}

                                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
                                                    <Tooltip title={isAr ? 'تغيير حالة النشر' : 'Toggle Visibility'}>
                                                        <IconButton
                                                            onClick={() => toggleStatus(msg.id, msg.isPublic)}
                                                            sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: msg.isPublic ? 'var(--success)' : 'var(--text-muted)' }}
                                                        >
                                                            <CheckCircle />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Button
                                                        variant="contained"
                                                        color="primary"
                                                        startIcon={<Reply />}
                                                        onClick={() => { setSelectedMsg(msg); setOpenReply(true); }}
                                                        sx={{ borderRadius: '12px', fontWeight: 900 }}
                                                    >
                                                        {isAr ? 'رد إداري' : 'Official Reply'}
                                                    </Button>
                                                    <IconButton
                                                        onClick={() => handleDelete(msg.id)}
                                                        sx={{ bgcolor: 'rgba(255, 23, 68, 0.1)', color: 'var(--error)' }}
                                                    >
                                                        <Delete />
                                                    </IconButton>
                                                </Box>
                                            </Box>
                                        </Box>
                                    </motion.div>
                                </Grid>
                            );
                        })}
                    </AnimatePresence>
                </Grid>
            )}

            {/* Premium Reply Dialog */}
            <Dialog
                open={openReply}
                onClose={() => setOpenReply(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{
                    sx: {
                        borderRadius: '30px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--glass-border)',
                        boxShadow: '0 30px 60px rgba(0,0,0,0.8)'
                    }
                }}
            >
                <DialogTitle sx={{ p: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 900 }}>{isAr ? 'الرد على الاقتراح' : 'Admin Response'}</Typography>
                    <IconButton onClick={() => setOpenReply(false)} sx={{ color: 'var(--text-muted)' }}><Close /></IconButton>
                </DialogTitle>
                <DialogContent sx={{ px: 4, pb: 2 }}>
                    <Box sx={{ p: 3, mb: 4, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '20px', border: '1px solid var(--glass-border)' }}>
                        <Typography variant="caption" sx={{ color: 'var(--primary)', fontWeight: 900, mb: 1, display: 'block' }}>
                            {isAr ? 'نص الاقتراح:' : 'SUGGESTION CONTENT:'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'var(--text-main)', opacity: 0.8 }}>
                            {selectedMsg?.message || selectedMsg?.text}
                        </Typography>
                    </Box>
                    <TextField
                        autoFocus
                        fullWidth
                        multiline
                        rows={6}
                        label={isAr ? 'اكتب رد الإدارة الرسمي هنا...' : 'Type the official response...'}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        variant="filled"
                        sx={{
                            '& .MuiFilledInput-root': {
                                bgcolor: 'rgba(255,255,255,0.03)',
                                borderRadius: '20px',
                                border: '1px solid var(--glass-border)',
                                '&:before, &:after': { display: 'none' }
                            }
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 4 }}>
                    <Button onClick={() => setOpenReply(false)} sx={{ color: 'var(--text-muted)', fontWeight: 900 }}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
                    <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        startIcon={<Send />}
                        onClick={() => handleReply(selectedMsg.id)}
                        sx={{ borderRadius: '15px', px: 4, fontWeight: 900 }}
                    >
                        {isAr ? 'إرسال الرد' : 'Send Response'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

