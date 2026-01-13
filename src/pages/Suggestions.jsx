import React, { useEffect, useState } from 'react';
import { Box, Typography, Chip, IconButton, Tooltip, CircularProgress, Fab, Paper } from '@mui/material';
import { Delete, Visibility, VisibilityOff, Refresh, Person, AccessTime, Reply, Message } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { qnaService } from '../services/qnaService';
import toast from 'react-hot-toast';

export default function Suggestions() {
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedId, setSelectedId] = useState(null);

    // Category mapping from the form
    const categoryMap = {
        'complaint': { label: 'شكوى', color: '#d32f2f', emoji: '⚠️' },
        'suggestion': { label: 'اقتراح تحسين', color: '#1976d2', emoji: '💡' },
        'technical': { label: 'مشكلة تقنية', color: '#f57c00', emoji: '🔧' },
        'thanks': { label: 'شكري', color: '#388e3c', emoji: '❤️' },
        'other': { label: 'أخرى', color: '#757575', emoji: '📝' }
    };

    const getCategoryInfo = (type) => {
        return categoryMap[type] || categoryMap['other'];
    };

    const loadData = async () => {
        setIsLoading(true);
        const data = await qnaService.getAllSuggestions();
        setMessages(data);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleDelete = async (e, id, source) => {
        e.stopPropagation();
        if (window.confirm('هل أنت متأكد من الحذف؟')) {
            await qnaService.deleteSuggestion(id, source);
            toast.success('تم الحذف بنجاح');
            setMessages(prev => prev.filter(m => m.id !== id));
            if (selectedId === id) setSelectedId(null);
        }
    };

    const handleTogglePublic = async (e, id, status, source) => {
        e.stopPropagation();
        await qnaService.togglePublicStatus(id, !status, source);
        toast.success(!status ? 'تم النشر' : 'تم الإخفاء');
        setMessages(prev => prev.map(m => m.id === id ? { ...m, isPublic: !status } : m));
    };

    const selectedMessage = messages.find(m => m.id === selectedId);

    return (
        <Box sx={{ height: 'calc(100vh - 100px)', display: 'flex', gap: 3 }}>
            {/* Inbox List */}
            <Box className="glass-panel" sx={{
                width: { xs: '100%', md: '350px' },
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
                    <Typography variant="h6" fontWeight="bold">البريد الوارد</Typography>
                    <IconButton size="small" onClick={loadData}><Refresh /></IconButton>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
                    {isLoading ? (
                        <Box display="flex" justifyContent="center" mt={4}><CircularProgress size={30} /></Box>
                    ) : (
                        <AnimatePresence>
                            {messages.map((msg, index) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    onClick={() => setSelectedId(msg.id)}
                                >
                                    <Box sx={{
                                        p: 2, mb: 1.5,
                                        borderRadius: '16px',
                                        background: selectedId === msg.id ? 'rgba(211, 47, 47, 0.15)' : 'rgba(255,255,255,0.03)',
                                        border: selectedId === msg.id ? '1px solid var(--primary)' : '1px solid transparent',
                                        cursor: 'pointer',
                                        '&:hover': { background: 'rgba(255,255,255,0.05)' }
                                    }}>
                                        <Box display="flex" justifyContent="space-between" mb={1}>
                                            <Typography variant="subtitle2" fontWeight="bold">
                                                {msg.name || 'مجهول'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleDateString() : new Date(msg.createdAt).toLocaleDateString()}
                                            </Typography>
                                        </Box>
                                        <Typography variant="body2" color="text.secondary" noWrap>
                                            {msg.text}
                                        </Typography>
                                        <Box mt={1} display="flex" gap={1}>
                                            <Chip
                                                label={`${getCategoryInfo(msg.type).emoji} ${getCategoryInfo(msg.type).label}`}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontSize: '0.7rem',
                                                    bgcolor: getCategoryInfo(msg.type).color,
                                                    color: 'white'
                                                }}
                                            />
                                            {msg.isPublic && <Chip label="منشور" size="small" color="success" sx={{ height: 20, fontSize: '0.7rem' }} />}
                                        </Box>
                                    </Box>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </Box>
            </Box>

            {/* Message Detail View */}
            <Box className="glass-panel" sx={{
                flex: 1,
                p: 4,
                display: { xs: selectedId ? 'block' : 'none', md: 'block' },
                position: 'relative'
            }}>
                {selectedMessage ? (
                    <motion.div
                        key={selectedMessage.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                    >
                        {/* Header */}
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Box sx={{
                                    width: 50, height: 50, borderRadius: '50%',
                                    bgcolor: 'rgba(255,255,255,0.1)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Person fontSize="large" color="primary" />
                                </Box>
                                <Box>
                                    <Typography variant="h5" fontWeight="bold">{selectedMessage.name || 'فاعل خير'}</Typography>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <AccessTime fontSize="small" sx={{ color: 'text.secondary', fontSize: 16 }} />
                                        <Typography variant="body2" color="text.secondary">
                                            {new Date(selectedMessage.createdAt).toLocaleString()}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>

                            <Box display="flex" gap={1}>
                                <Tooltip title={selectedMessage.isPublic ? "إخفاء" : "نشر"}>
                                    <IconButton
                                        onClick={(e) => handleTogglePublic(e, selectedMessage.id, selectedMessage.isPublic, selectedMessage.source)}
                                        color={selectedMessage.isPublic ? "success" : "default"}
                                    >
                                        {selectedMessage.isPublic ? <Visibility /> : <VisibilityOff />}
                                    </IconButton>
                                </Tooltip>

                                <Tooltip title="رد (WhatsApp)">
                                    <IconButton color="primary" onClick={() => window.open(`https://wa.me/?text=رد على رسالتك: ${selectedMessage.text}`, '_blank')}>
                                        <Reply />
                                    </IconButton>
                                </Tooltip>

                                <Tooltip title="حذف">
                                    <IconButton
                                        color="error"
                                        onClick={(e) => handleDelete(e, selectedMessage.id, selectedMessage.source)}
                                    >
                                        <Delete />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Box>

                        {/* Category Badge */}
                        <Box mb={3}>
                            <Chip
                                label={`${getCategoryInfo(selectedMessage.type).emoji} ${getCategoryInfo(selectedMessage.type).label}`}
                                sx={{
                                    bgcolor: getCategoryInfo(selectedMessage.type).color,
                                    color: 'white',
                                    fontWeight: 'bold',
                                    fontSize: '0.9rem',
                                    px: 2,
                                    py: 2.5
                                }}
                            />
                        </Box>

                        {/* Content */}
                        <Paper elevation={0} sx={{
                            p: 3,
                            bgcolor: 'rgba(255,255,255,0.03)',
                            borderRadius: '20px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            minHeight: '200px'
                        }}>
                            <Typography variant="h6" sx={{ lineHeight: 1.8, color: 'white' }}>
                                "{selectedMessage.text}"
                            </Typography>
                        </Paper>

                        {/* Meta Info */}
                        <Box mt={3} display="flex" gap={2} flexWrap="wrap">
                            {selectedMessage.email && (
                                <Chip label={`Email: ${selectedMessage.email}`} variant="outlined" />
                            )}
                            {selectedMessage.phone && (
                                <Chip label={`Phone: ${selectedMessage.phone}`} variant="outlined" />
                            )}
                            <Chip label={`Source: ${selectedMessage.source}`} variant="outlined" color="primary" />
                        </Box>

                    </motion.div>
                ) : (
                    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" color="text.secondary">
                        <Message sx={{ fontSize: 80, opacity: 0.2, mb: 2 }} />
                        <Typography variant="h6">اختر رسالة لعرض التفاصيل</Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
