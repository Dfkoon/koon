import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, IconButton, Chip, Tooltip,
    CircularProgress, Fab, Button, ButtonGroup, useTheme,
    Dialog, DialogTitle, DialogContent, DialogActions, Avatar, Card, CardContent, Divider
} from '@mui/material';
import Delete from '@mui/icons-material/Delete';
import Refresh from '@mui/icons-material/Refresh';
import InsertDriveFile from '@mui/icons-material/InsertDriveFile';
import CheckCircle from '@mui/icons-material/CheckCircle';
import SwapHoriz from '@mui/icons-material/SwapHoriz';
import VolunteerActivism from '@mui/icons-material/VolunteerActivism';
import PriorityHigh from '@mui/icons-material/PriorityHigh';
import Info from '@mui/icons-material/Info';
import ContactPhone from '@mui/icons-material/ContactPhone';
import Person from '@mui/icons-material/Person';
import AssignmentReturn from '@mui/icons-material/AssignmentReturn';
import VerifiedUser from '@mui/icons-material/VerifiedUser';
import { materialsService } from '../services/materialsService';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

export default function MaterialExchange() {
    const theme = useTheme();
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [systemStatus, setSystemStatus] = useState({ phase: 'donation' });
    const [view, setView] = useState('all'); // all, reserved, completed

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [materials, status] = await Promise.all([
                materialsService.getAllMaterials(),
                materialsService.getSystemStatus()
            ]);
            setItems(materials);
            setSystemStatus(status);
        } catch (error) {
            toast.error('حدث خطأ أثناء تحميل البيانات');
        }
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handlePhaseChange = async (newPhase) => {
        try {
            await materialsService.setSystemPhase(newPhase);
            setSystemStatus(prev => ({ ...prev, phase: newPhase }));
            toast.success(`تم تفعيل فترة: ${newPhase === 'donation' ? 'جمع المواد' : 'التبادل والاستلام'}`);
        } catch (error) {
            toast.error('فشل تغيير الفترة');
        }
    };

    const handleHandover = async (id) => {
        if (window.confirm('هل تم تسليم المادة للطالب؟')) {
            await materialsService.markAsHandedOver(id);
            setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'completed' } : item));
            toast.success('تم إتمام التسليم');
        }
    };

    const handleApprove = async (id) => {
        await materialsService.approveDonation(id);
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'approved' } : item));
        toast.success('تمت الموافقة على العرض');
    };

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من الحذف؟')) {
            await materialsService.deleteMaterial(id);
            toast.success('تم الحذف');
            setItems(prev => prev.filter(item => item.id !== id));
        }
    };

    const getStatusChip = (item) => {
        switch (item.status) {
            case 'pending': return <Chip label="قيد المراجعة" color="warning" size="small" />;
            case 'approved': return <Chip label="متوفر" color="success" size="small" variant="outlined" />;
            case 'reserved': return <Chip label="محجوز" color="info" size="small" />;
            case 'completed': return <Chip label="تم التسليم" color="default" size="small" />;
            default: return <Chip label="متاح" size="small" />;
        }
    };

    // Filter logic
    const filteredItems = items.filter(item => {
        if (view === 'all') return true;
        if (view === 'reserved') return item.status === 'reserved';
        if (view === 'completed') return item.status === 'completed';
        if (view === 'pending') return item.status === 'pending';
        return true;
    });

    return (
        <Box>
            {/* Header with Phase Controls */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="h4" fontWeight="bold" gutterBottom>تبادل المواد الدراسية</Typography>
                    <Typography variant="body2" color="text.secondary">إدارة عملية التبرع واستلام المواد بين الطلاب</Typography>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                    <ButtonGroup variant="contained" size="small">
                        <Button
                            color={systemStatus.phase === 'donation' ? 'primary' : 'inherit'}
                            onClick={() => handlePhaseChange('donation')}
                            startIcon={<VolunteerActivism />}
                        >
                            فترة التبرع
                        </Button>
                        <Button
                            color={systemStatus.phase === 'exchange' ? 'primary' : 'inherit'}
                            onClick={() => handlePhaseChange('exchange')}
                            startIcon={<SwapHoriz />}
                        >
                            فترة الاستلام
                        </Button>
                    </ButtonGroup>
                    <Chip
                        label={systemStatus.phase === 'donation' ? 'الحالة الحالية: جمع مواد' : 'الحالة الحالية: تبادل نشط'}
                        size="small"
                        sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'text.secondary' }}
                    />
                </Box>
            </Box>

            {/* View Filters */}
            <Box sx={{ mb: 3, display: 'flex', gap: 1 }}>
                {['all', 'pending', 'reserved', 'completed'].map((v) => (
                    <Button
                        key={v}
                        variant={view === v ? 'contained' : 'outlined'}
                        size="small"
                        onClick={() => setView(v)}
                        sx={{ borderRadius: 2 }}
                    >
                        {v === 'all' ? 'الكل' : v === 'pending' ? 'بانتظار الموافقة' : v === 'reserved' ? 'المحجوزة' : 'المسلمة'}
                    </Button>
                ))}
                <Box sx={{ flexGrow: 1 }} />
                <Fab color="primary" size="small" onClick={loadData}><Refresh /></Fab>
            </Box>

            {isLoading ? (
                <Box display="flex" justifyContent="center" mt={10}><CircularProgress /></Box>
            ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <TableContainer component={Paper} className="glass-panel" sx={{ background: 'transparent', boxShadow: 'none' }}>
                        <Table sx={{ minWidth: 800 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: 'text.secondary' }}>المادة</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>المتبرع</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>الحاصل عليها (المستلم)</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>الحالة والأولوية</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>إجراءات</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredItems.map((row, index) => (
                                    <TableRow
                                        key={row.id}
                                        sx={{
                                            bgcolor: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                            '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.05)' },
                                            transition: '0.2s'
                                        }}
                                    >
                                        {/* Material Info */}
                                        <TableCell>
                                            <Box>
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <InsertDriveFile color="primary" fontSize="small" />
                                                    <Typography fontWeight="bold">{row.itemName || (row.materials && row.materials[0]) || 'مادة دراسية'}</Typography>
                                                </Box>
                                                <Typography variant="caption" color="text.secondary">
                                                    {new Date(row.createdAt).toLocaleDateString()}
                                                </Typography>
                                                {row.materials?.length > 1 && (
                                                    <Box mt={0.5}>
                                                        <Chip label={`+${row.materials.length - 1} مواد أخرى`} size="mini" sx={{ fontSize: '10px', height: 16 }} />
                                                    </Box>
                                                )}
                                            </Box>
                                        </TableCell>

                                        {/* Donor Info */}
                                        <TableCell>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                                                <Box display="flex" alignItems="center" gap={0.5}>
                                                    <Person sx={{ fontSize: 14, color: 'primary.main' }} />
                                                    <Typography variant="body2">{row.studentName || 'غير معروف'}</Typography>
                                                </Box>
                                                <Box display="flex" alignItems="center" gap={0.5}>
                                                    <ContactPhone sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                    <Typography variant="caption" color="text.secondary">{row.phoneNumber || row.contactInfo}</Typography>
                                                </Box>
                                            </Box>
                                        </TableCell>

                                        {/* Taker Info */}
                                        <TableCell>
                                            {row.takerInfo ? (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                                                    <Box display="flex" alignItems="center" gap={0.5}>
                                                        <Person sx={{ fontSize: 14, color: 'info.main' }} />
                                                        <Typography variant="body2">{row.takerInfo.name}</Typography>
                                                    </Box>
                                                    <Typography variant="caption" color="text.secondary">{row.takerInfo.phone}</Typography>
                                                    {row.takerInfo.isDonor && (
                                                        <Chip
                                                            label="له أولوية (متبرع)"
                                                            size="small"
                                                            color="success"
                                                            icon={<VerifiedUser sx={{ fontSize: '12px !important' }} />}
                                                            sx={{ height: 20, fontSize: '10px', mt: 0.5 }}
                                                        />
                                                    )}
                                                </Box>
                                            ) : (
                                                <Typography variant="caption" color="text.disabled">لم تحجز بعد</Typography>
                                            )}
                                        </TableCell>

                                        {/* Status & Priority */}
                                        <TableCell>
                                            <Box display="flex" alignItems="center" gap={1}>
                                                {getStatusChip(row)}
                                                {row.status === 'reserved' && !row.takerInfo?.isDonor && (
                                                    <Tooltip title="يمكن للمتبرعين أخذ أولوية على هذا الحجز">
                                                        <PriorityHigh color="warning" sx={{ fontSize: 16 }} />
                                                    </Tooltip>
                                                )}
                                            </Box>
                                        </TableCell>

                                        {/* Actions */}
                                        <TableCell>
                                            <Box display="flex" gap={0.5}>
                                                {row.status === 'pending' && (
                                                    <Tooltip title="موافقة">
                                                        <IconButton color="success" size="small" onClick={() => handleApprove(row.id)}>
                                                            <CheckCircle />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}

                                                {row.status === 'reserved' && (
                                                    <Tooltip title="تسليم">
                                                        <IconButton color="info" size="small" onClick={() => handleHandover(row.id)}>
                                                            <AssignmentReturn />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}

                                                <Tooltip title="حذف">
                                                    <IconButton color="error" size="small" onClick={() => handleDelete(row.id)}>
                                                        <Delete />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {filteredItems.length === 0 && (
                        <Box textAlign="center" py={10} color="text.secondary">
                            <Info sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                            <Typography>لا توجد بيانات تطابق هذا الفلتر حالياً</Typography>
                        </Box>
                    )}
                </motion.div>
            )}
        </Box>
    );
}
