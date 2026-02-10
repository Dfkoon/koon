import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Paper, Grid, TextField, Button, MenuItem,
    Switch, FormControlLabel, IconButton, Card, CardContent, Divider, Chip, CircularProgress
} from '@mui/material';
import Campaign from '@mui/icons-material/Campaign';
import Delete from '@mui/icons-material/Delete';
import Send from '@mui/icons-material/Send';
import Refresh from '@mui/icons-material/Refresh';
import History from '@mui/icons-material/History';
import { motion, AnimatePresence } from 'framer-motion';
import { broadcastService } from '../services/broadcastService';
import toast from 'react-hot-toast';

export default function Broadcasts() {
    const [broadcasts, setBroadcasts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newBroadcast, setNewBroadcast] = useState({
        title: '',
        message: '',
        type: 'info', // info, warning, urgent
        target: 'all', // all, students, guests
        link: '' // New link field
    });

    const loadData = async () => {
        try {
            setIsLoading(true);
            const data = await broadcastService.getAllBroadcasts();
            setBroadcasts(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Load broadcasts error:", error);
            setBroadcasts([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newBroadcast.title || !newBroadcast.message) return toast.error('يرجى ملء العنوان والنص');

        try {
            await broadcastService.addBroadcast(newBroadcast);
            toast.success('تم إرسال الإشعار بنجاح 🔔');
            setNewBroadcast({ title: '', message: '', type: 'info', target: 'all', link: '' });
            loadData();
        } catch (error) {
            toast.error('فشل في الإرسال');
        }
    };

    const handleDelete = async (id) => {
        if (!id) return;
        if (window.confirm('هل أنت متأكد من حذف هذا الإشعار؟')) {
            try {
                await broadcastService.deleteBroadcast(id);
                toast.success('تم الحذف');
                setBroadcasts(prev => prev.filter(b => b.id !== id));
            } catch (error) {
                toast.error('خطأ أثناء الحذف');
            }
        }
    };

    const handleToggle = async (id, status) => {
        try {
            await broadcastService.toggleActive(id, status);
            toast.success(status ? 'تم تفعيل الإشعار' : 'تم إيقاف الإشعار');
            setBroadcasts(prev => prev.map(b => b.id === id ? { ...b, active: status } : b));
        } catch (error) {
            toast.error('خطأ أثناء التحديث');
        }
    };

    return (
        <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ mb: 4 }}>نظام الإشعارات والأخبار 🔔</Typography>

            <Grid container spacing={4}>
                {/* Create Section */}
                <Grid item xs={12} md={5}>
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                        <Box component="form" onSubmit={handleSubmit} className="glass-panel" sx={{ p: 4 }}>
                            <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Send color="primary" /> إرسال إشعار جديد
                            </Typography>

                            <TextField
                                fullWidth
                                label="عنوان الإشعار (مثلاً: صدور النتائج)"
                                value={newBroadcast.title}
                                onChange={(e) => setNewBroadcast({ ...newBroadcast, title: e.target.value })}
                                sx={{ mb: 2 }}
                            />

                            <TextField
                                fullWidth
                                multiline
                                rows={4}
                                label="نص الإشعار التفصيلي"
                                value={newBroadcast.message}
                                onChange={(e) => setNewBroadcast({ ...newBroadcast, message: e.target.value })}
                                sx={{ mb: 2 }}
                            />

                            <TextField
                                fullWidth
                                label="رابط (اختياري) - مثلاً رابط النتائج"
                                value={newBroadcast.link}
                                onChange={(e) => setNewBroadcast({ ...newBroadcast, link: e.target.value })}
                                sx={{ mb: 2 }}
                                placeholder="https://example.com/results"
                            />

                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6}>
                                    <TextField
                                        select
                                        fullWidth
                                        label="الأهمية"
                                        value={newBroadcast.type}
                                        onChange={(e) => setNewBroadcast({ ...newBroadcast, type: e.target.value })}
                                    >
                                        <MenuItem value="info">إعلان عادي</MenuItem>
                                        <MenuItem value="warning">تنبيه هام</MenuItem>
                                        <MenuItem value="urgent">عاجل جداً 🔥</MenuItem>
                                    </TextField>
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        select
                                        fullWidth
                                        label="المستهدفون"
                                        value={newBroadcast.target}
                                        onChange={(e) => setNewBroadcast({ ...newBroadcast, target: e.target.value })}
                                    >
                                        <MenuItem value="all">كل الزوار</MenuItem>
                                        <MenuItem value="students">الطلاب المسجلين</MenuItem>
                                    </TextField>
                                </Grid>
                            </Grid>

                            <Button
                                type="submit"
                                variant="contained"
                                fullWidth
                                size="large"
                                startIcon={<Campaign />}
                                sx={{ py: 1.5 }}
                            >
                                إرسال الإشعار الآن
                            </Button>
                        </Box>
                    </motion.div>
                </Grid>

                {/* History Section */}
                <Grid item xs={12} md={7}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <History /> سجل الإشعارات المرسلة
                        </Typography>
                        <IconButton onClick={loadData}><Refresh /></IconButton>
                    </Box>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {isLoading ? <Box textAlign="center" py={5}><CircularProgress /></Box> : (
                            <AnimatePresence>
                                {broadcasts && broadcasts.map((b) => (
                                    <motion.div
                                        key={b.id || Math.random()}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                    >
                                        <Card className="glass-panel" sx={{ background: 'var(--bg-card)', borderLeft: `4px solid ${b.type === 'urgent' ? '#f44336' : b.type === 'warning' ? '#ff9800' : '#2196f3'}` }}>
                                            <CardContent>
                                                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                                                    <Box>
                                                        <Typography variant="subtitle1" fontWeight="bold">{b.title}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {b.createdAt instanceof Date ? b.createdAt.toLocaleString() : 'الآن'}
                                                        </Typography>
                                                        {b.link && (
                                                            <Chip
                                                                label="رابط مرفق"
                                                                size="small"
                                                                component="a"
                                                                href={b.link}
                                                                target="_blank"
                                                                clickable
                                                                color="primary"
                                                                variant="outlined"
                                                                sx={{ ml: 1, height: 20 }}
                                                            />
                                                        )}
                                                    </Box>
                                                    <Box display="flex" alignItems="center">
                                                        <FormControlLabel
                                                            control={
                                                                <Switch
                                                                    size="small"
                                                                    checked={!!b.active}
                                                                    onChange={(e) => handleToggle(b.id, e.target.checked)}
                                                                />
                                                            }
                                                            label={<Typography variant="caption">{b.active ? 'نشط' : 'متوقف'}</Typography>}
                                                        />
                                                        <IconButton color="error" size="small" onClick={() => handleDelete(b.id)}>
                                                            <Delete fontSize="small" />
                                                        </IconButton>
                                                    </Box>
                                                </Box>
                                                <Typography variant="body2" sx={{ opacity: 0.8 }}>{b.message}</Typography>
                                                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'text.disabled' }}>
                                                    الحالة: {b.active ? 'يظهر للطلاب الآن' : 'مخفي'}
                                                </Typography>
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                        {!isLoading && (!broadcasts || broadcasts.length === 0) && (
                            <Box textAlign="center" py={10} color="text.secondary">لا توجد إشعارات سابقة</Box>
                        )}
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
}
