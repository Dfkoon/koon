import React, { useEffect, useState, useMemo } from 'react';
import {
    Box, Typography, Grid, Paper, Card, CardContent,
    CircularProgress, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import {
    TrendingUp, Visibility, AccessTime,
    ShowChart, BarChart as BarChartIcon, Public
} from '@mui/icons-material';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell
} from 'recharts';
import { analyticsService } from '../../services/analyticsService';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';

const COLORS = ['#1a237e', '#0d47a1', '#1565c0', '#1976d2', '#1e88e5', '#2196f3'];

const PATH_MAPPING = {
    '/': { ar: 'الرئيسية', en: 'Home' },
    '/grading-system/': { ar: 'حساب المعدل', en: 'GPA Calculator' },
    '/exams/': { ar: 'بنك الأسئلة', en: 'Exams Bank' },
    '/admin/analytics/': { ar: 'الإحصائيات', en: 'Analytics' },
    '/admin/reports/': { ar: 'البلاغات', en: 'Reports' },
    '/admin/subscribers/': { ar: 'المشتركون', en: 'Subscribers' },
    '/admin/testimonials/': { ar: 'الآراء', en: 'Testimonials' },
    '/admin/dashboard/': { ar: 'لوحة القيادة', en: 'Dashboard' },
    '/admin/calendar/': { ar: 'التقويم', en: 'Calendar' },
    '/admin/qna/': { ar: 'الأسئلة الشائعة', en: 'Q&A' },
    '/materials/': { ar: 'المواد الدراسية', en: 'Materials' },
};

export default function AdminAnalytics() {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [rawData, setRawData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [daysFilter, setDaysFilter] = useState(7);

    const loadData = async () => {
        setIsLoading(true);
        const data = await analyticsService.getAnalyticsStats();
        setRawData(data);
        setIsLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, []);

    const stats = useMemo(() => {
        if (!rawData.length) return null;

        const dateMap = {};
        const pathMap = {};
        const durationMap = {};

        rawData.forEach(item => {
            const dateStr = item.date || new Date(item.timestamp?.seconds * 1000).toISOString().split('T')[0];
            dateMap[dateStr] = (dateMap[dateStr] || 0) + 1;
            pathMap[item.path] = (pathMap[item.path] || 0) + 1;
            if (!durationMap[item.path]) durationMap[item.path] = { total: 0, count: 0 };
            durationMap[item.path].total += (item.duration || 0);
            durationMap[item.path].count += 1;
        });

        const dailyData = Object.keys(dateMap).sort().map(date => ({
            date: date,
            visits: dateMap[date]
        })).slice(-daysFilter);

        const pathData = Object.keys(pathMap).map(path => {
            // Normalize path to ensure it matches mapping keys (add trailing slash if needed for exact match, or just use includes)
            const cleanPath = path.replace('/KOON.BAU.JO', '');
            let name = cleanPath;

            // Try explicit match
            const mapping = PATH_MAPPING[cleanPath] || PATH_MAPPING[cleanPath + '/'];

            if (mapping) {
                name = isAr ? mapping.ar : mapping.en;
            } else {
                // Fallback for sub-routes
                if (cleanPath.includes('admin')) name = isAr ? 'لوحة التحكم' : 'Admin Panel';
                else if (cleanPath.includes('grading')) name = isAr ? 'حساب المعدل' : 'GPA';
                else if (cleanPath.includes('exams')) name = isAr ? 'الامتحانات' : 'Exams';
            }

            return {
                name: name,
                visits: pathMap[path],
                avgDuration: Math.round(durationMap[path].total / durationMap[path].count)
            };
        }).sort((a, b) => b.visits - a.visits).slice(0, 10);

        const totalVisits = rawData.length;
        const totalDuration = rawData.reduce((acc, curr) => acc + (curr.duration || 0), 0);
        const avgDuration = totalVisits > 0 ? Math.round(totalDuration / totalVisits) : 0;
        const uniqueVisitors = new Set(rawData.map(i => i.visitorId || i.sessionId)).size;
        const totalSessions = new Set(rawData.map(i => i.sessionId)).size;

        return { dailyData, pathData, totalVisits, avgDuration, uniqueVisitors, totalSessions };
    }, [rawData, daysFilter, isAr]);

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
                <ShinyHeader text={isAr ? 'إحصائيات الزوار' : 'Visitor Analytics'} variant="h4" />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel id="days-filter-label">{isAr ? 'الفترة الزمنية' : 'Time Period'}</InputLabel>
                    <Select
                        labelId="days-filter-label"
                        value={daysFilter}
                        label={isAr ? 'الفترة الزمنية' : 'Time Period'}
                        onChange={(e) => setDaysFilter(e.target.value)}
                    >
                        <MenuItem value={7}>{isAr ? 'آخر 7 أيام' : 'Last 7 Days'}</MenuItem>
                        <MenuItem value={14}>{isAr ? 'آخر 14 يوم' : 'Last 14 Days'}</MenuItem>
                        <MenuItem value={30}>{isAr ? 'آخر 30 يوم' : 'Last 30 Days'}</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={4}>
                    <Card sx={{ bgcolor: '#e8eaf6', borderLeft: '5px solid #1a237e' }}>
                        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Visibility color="primary" fontSize="large" />
                            <Box>
                                <Typography variant="caption" color="text.secondary">{isAr ? 'إجمالي المشاهدات' : 'Total Views'}</Typography>
                                <Typography variant="h5" fontWeight="bold">{stats?.totalVisits || 0}</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                    <Card sx={{ bgcolor: '#e3f2fd', borderLeft: '5px solid #0d47a1' }}>
                        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Public color="primary" fontSize="large" />
                            <Box>
                                <Typography variant="caption" color="text.secondary">{isAr ? 'الزوار الفريدين' : 'Unique Visitors'}</Typography>
                                <Typography variant="h5" fontWeight="bold">{stats?.uniqueVisitors || 0}</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                    <Card sx={{ bgcolor: '#f3e5f5', borderLeft: '5px solid #7b1fa2' }}>
                        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <TrendingUp color="secondary" fontSize="large" />
                            <Box>
                                <Typography variant="caption" color="text.secondary">{isAr ? 'إجمالي الجلسات' : 'Total Sessions'}</Typography>
                                <Typography variant="h5" fontWeight="bold">{stats?.totalSessions || 0}</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                    <Card sx={{ bgcolor: '#fff3e0', borderLeft: '5px solid #ef6c00' }}>
                        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <AccessTime sx={{ color: '#ef6c00' }} fontSize="large" />
                            <Box>
                                <Typography variant="caption" color="text.secondary">{isAr ? 'متوسط البقاء (ثانية)' : 'Avg Stay (sec)'}</Typography>
                                <Typography variant="h5" fontWeight="bold">{stats?.avgDuration || 0}s</Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {(!stats || stats.totalVisits === 0) ? (
                <Paper sx={{ p: 5, textAlign: 'center', color: 'text.secondary' }}>
                    <Typography>{isAr ? 'لا توجد بيانات كافية لعرض الرسوم البيانية حالياً' : 'Not enough data to display charts yet'}</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3} flexDirection="column">
                    <Grid item xs={12}>
                        <Paper sx={{ p: 3, height: '600px', display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                                <ShowChart color="primary" />
                                <Typography variant="h6" fontWeight="bold">{isAr ? 'معدل الزيارات اليومية' : 'Daily Visits Rate'}</Typography>
                            </Box>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={stats?.dailyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                                    <XAxis dataKey="date" fontSize={12} tickMargin={10} />
                                    <YAxis fontSize={12} axisLine={false} tickLine={false} orientation={isAr ? "right" : "left"} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="visits"
                                        stroke="#1a237e"
                                        strokeWidth={3}
                                        dot={{ r: 4, fill: '#1a237e' }}
                                        activeDot={{ r: 6 }}
                                        name={isAr ? 'الزيارات' : 'Visits'}
                                        label={{ position: 'top', fill: '#1a237e', fontSize: 12 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </Paper>
                    </Grid>
                    <Grid item xs={12}>
                        <Paper sx={{ p: 3, height: '600px', display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                                <BarChartIcon color="primary" />
                                <Typography variant="h6" fontWeight="bold">{isAr ? 'الأكثر تصفحاً' : 'Most Viewed'}</Typography>
                            </Box>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={stats?.pathData}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                                    <XAxis type="number" hide reversed={isAr} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        orientation={isAr ? "right" : "left"}
                                        fontSize={12}
                                        width={180}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip cursor={{ fill: '#f5f5f5' }} />
                                    <Bar dataKey="visits" radius={isAr ? [4, 0, 0, 4] : [0, 4, 4, 0]} name={isAr ? 'المشاهدات' : 'Views'} label={{ position: isAr ? 'left' : 'right', fill: '#000', fontSize: 12 }}>
                                        {stats?.pathData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </Paper>
                    </Grid>
                    <Grid item xs={12}>
                        <Paper sx={{ p: 3, height: '600px', display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                                <AccessTime color="primary" />
                                <Typography variant="h6" fontWeight="bold">{isAr ? 'متوسط الوقت لكل قسم' : 'Avg Time per Section'}</Typography>
                            </Box>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={stats?.pathData}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eee" />
                                    <XAxis type="number" hide reversed={isAr} />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        orientation={isAr ? "right" : "left"}
                                        fontSize={12}
                                        width={180}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip cursor={{ fill: '#f5f5f5' }} />
                                    <Bar dataKey="avgDuration" fill="#ef6c00" radius={isAr ? [4, 0, 0, 4] : [0, 4, 4, 0]} name={isAr ? 'الثواني' : 'Seconds'} label={{ position: isAr ? 'left' : 'right', fill: '#000', fontSize: 12 }} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Paper>
                    </Grid>
                </Grid>
            )}
        </Box>
    );
}
