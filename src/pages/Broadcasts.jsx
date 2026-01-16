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
        target: 'all' // all, students, guests
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
        console.log("Broadcasts component mounted");
        loadData();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!newBroadcast.title || !newBroadcast.message) return toast.error('يرجى ملء جميع الحقول');

        try {
            await broadcastService.addBroadcast(newBroadcast);
            toast.success('تم نشر الإعلان بنجاح 📢');
            setNewBroadcast({ title: '', message: '', type: 'info', target: 'all' });
            loadData();
        } catch (error) {
            toast.error('فشل في نشر الإعلان');
        }
    };

    const handleDelete = async (id) => {
        if (!id) return;
        if (window.confirm('بعد الحذف سيختفي الإعلان من موقع الطلاب، هل أنت متأكد؟')) {
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
        if (!id) return;
        try {
            await broadcastService.toggleActive(id, status);
            toast.success(status ? 'تم تفعيل الإعلان' : 'تم إيقاف الإعلان');
            setBroadcasts(prev => prev.map(b => b.id === id ? { ...b, active: status } : b));
        } catch (error) {
            toast.error('خطأ أثناء التحديث');
        }
    };

    return (
        <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ mb: 4 }}>الإعلانات العاجلة 📢</Typography>

            <Grid container spacing={4}>
                {/* Create Section */}
                <Grid item xs={12} md={5}>
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                        <Box component="form" onSubmit={handleSubmit} className="glass-panel" sx={{ p: 4 }}>
                            <Typography variant="h6" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Send color="primary" /> نشر إعلان جديد
                            </Typography>

                            <TextField
                                fullWidth
                                label="عنوان الإعلان"
                                value={newBroadcast.title}
                                onChange={(e) => setNewBroadcast({ ...newBroadcast, title: e.target.value })}
                                sx={{ mb: 2 }}
                            />

                            <TextField
                                fullWidth
                                multiline
                                rows={4}
                                label="نص الإعلان"
                                value={newBroadcast.message}
                                onChange={(e) => setNewBroadcast({ ...newBroadcast, message: e.target.value })}
                                sx={{ mb: 2 }}
                            />

                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6}>
                                    <TextField
                                        select
                                        fullWidth
                                        label="نوع الإعلان"
                                        value={newBroadcast.type}
                                        onChange={(e) => setNewBroadcast({ ...newBroadcast, type: e.target.value })}
                                    >
                                        <MenuItem value="info">معلومة (أزرق)</MenuItem>
                                        <MenuItem value="warning">تنبيه (أصفر)</MenuItem>
                                        <MenuItem value="urgent">عاجل (أحمر)</MenuItem>
                                    </TextField>
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        select
                                        fullWidth
                                        label="الجمهور المستهدف"
                                        value={newBroadcast.target}
                                        onChange={(e) => setNewBroadcast({ ...newBroadcast, target: e.target.value })}
                                    >
                                        <MenuItem value="all">الكل</MenuItem>
                                        <MenuItem value="students">طلاب مسجلين</MenuItem>
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
                                بث الإعلان الآن
                            </Button>
                        </Box>
                    </motion.div>
                </Grid>

                {/* History Section */}
                <Grid item xs={12} md={7}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <History /> سجل الإعلانات
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
                                        <Card className="glass-panel" sx={{ background: 'rgba(255,255,255,0.02)', borderLeft: `4px solid ${b.type === 'urgent' ? '#f44336' : b.type === 'warning' ? '#ff9800' : '#2196f3'}` }}>
                                            <CardContent>
                                                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                                                    <Box>
                                                        <Typography variant="subtitle1" fontWeight="bold">{b.title}</Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {b.createdAt instanceof Date ? b.createdAt.toLocaleString() : 'التاريخ غير متوفر'} • المستهدف: {b.target === 'all' ? 'الكل' : 'الطلاب'}
                                                        </Typography>
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
                                            </CardContent>
                                        </Card>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        )}
                        {!isLoading && (!broadcasts || broadcasts.length === 0) && (
                            <Box textAlign="center" py={10} color="text.secondary">لا توجد إعلانات سابقة</Box>
                        )}
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
}
