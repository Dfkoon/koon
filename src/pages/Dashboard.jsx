import React, { useEffect, useState } from 'react';
import { Box, Grid, Typography, CircularProgress } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import People from '@mui/icons-material/People';
import Message from '@mui/icons-material/Message';
import Star from '@mui/icons-material/Star';
import Visibility from '@mui/icons-material/Visibility';
import BugReport from '@mui/icons-material/BugReport';
import Chat from '@mui/icons-material/Chat';
import Backup from '@mui/icons-material/Backup';
import Language from '@mui/icons-material/Language';
import { motion } from 'framer-motion';
import { statsService } from '../services/statsService';

// Chart data is now fetched from server

const StatCard = ({ title, value, icon, color, delay }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay * 0.1 }}
    >
        <Box className="glass-card" sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{title}</Typography>
                <Typography variant="h4" fontWeight="bold">{value}</Typography>
            </Box>
            <Box sx={{
                p: 1.5,
                borderRadius: '16px',
                background: `rgba(${color}, 0.1)`,
                color: `rgb(${color})`,
                display: 'flex'
            }}>
                {icon}
            </Box>
        </Box>
    </motion.div>
);

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadStats = async () => {
            const [globalStats, visitsData] = await Promise.all([
                statsService.getGlobalStats(),
                statsService.getWeeklyVisits()
            ]);

            setStats(globalStats);
            setChartData(visitsData);
            setLoading(false);
        };
        loadStats();
    }, []);

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" height="70vh">
                <CircularProgress color="primary" />
            </Box>
        )
    }

    return (
        <Box>
            <Typography variant="h4" fontWeight="bold" sx={{ mb: 1 }}>لوحة القيادة</Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                مرحباً بك في لوحة تحكم KOON المتطورة 👋
            </Typography>

            {/* Stats Grid */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={2}>
                    <StatCard title="الزوار (تقريبياً)" value={stats?.visitors || '0'} icon={<Visibility />} color="211, 47, 47" delay={1} />
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                    <StatCard title="الشكاوى" value={stats?.complaints || '0'} icon={<Message />} color="241, 196, 15" delay={2} />
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                    <StatCard title="الآراء المعتمدة" value={stats?.testimonials || '0'} icon={<Star />} color="0, 230, 118" delay={3} />
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                    <StatCard title="تبادل المواد" value={stats?.materials || '0'} icon={<People />} color="41, 182, 246" delay={4} />
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                    <StatCard title="بلاغات الأسئلة" value={stats?.reports || '0'} icon={<BugReport />} color="155, 89, 182" delay={5} />
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                    <StatCard title="نشمي شات" value={stats?.nashmi || '0'} icon={<Chat />} color="156, 39, 176" delay={6} />
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                    <StatCard title="مساهمات الطلاب" value={stats?.contributions || '0'} icon={<Backup />} color="33, 150, 243" delay={7} />
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                    <StatCard title="اقتراحات المواقع" value={stats?.websites || '0'} icon={<Language />} color="255, 152, 0" delay={8} />
                </Grid>
            </Grid>

            {/* Charts Section */}
            <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                        <Box className="glass-panel" sx={{ p: 3, height: 400 }}>
                            <Typography variant="h6" sx={{ mb: 3 }}>إحصائيات الزوار (أسبوعي)</Typography>
                            <ResponsiveContainer width="100%" height="85%">
                                <BarChart data={chartData}>
                                    <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)' }} />
                                    <YAxis stroke="var(--text-secondary)" tick={{ fill: 'var(--text-secondary)' }} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'var(--bg-card)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '12px',
                                            color: 'var(--text-primary)'
                                        }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                    />
                                    <Bar dataKey="visits" radius={[4, 4, 0, 0]}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#d32f2f' : '#f1c40f'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Box>
                    </motion.div>
                </Grid>

                <Grid item xs={12} md={4}>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                        <Box className="glass-panel" sx={{ p: 3, height: 400, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                            <Typography variant="h6" sx={{ mb: 2 }}>حالة النظام</Typography>
                            <Box sx={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Box className="animate-pulse-glow" sx={{
                                    position: 'absolute', width: '100%', height: '100%',
                                    borderRadius: '50%', border: '4px solid var(--primary)'
                                }} />
                                <Typography variant="h3" fontWeight="bold">98%</Typography>
                            </Box>
                            <Typography color="text.secondary" sx={{ mt: 2 }}>كفاءة الأداء</Typography>
                        </Box>
                    </motion.div>
                </Grid>
            </Grid>
        </Box>
    );
}
