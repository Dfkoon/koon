import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Paper, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow,
    IconButton, Chip, Avatar, Tooltip
} from '@mui/material';
import { Delete, CheckCircle, Cancel, Person } from '@mui/icons-material';
import { testimonialsService } from '../../services/testimonialsService';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function ManageTestimonials() {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [testimonials, setTestimonials] = useState([]);

    const loadData = async () => {
        const data = await testimonialsService.getAllTestimonials();
        setTestimonials(data);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, []);

    const handleStatusUpdate = async (id, status) => {
        const result = await testimonialsService.updateStatus(id, status);
        if (result.success) {
            toast.success(isAr ? 'تم تحديث الحالة' : 'Status updated');
            loadData();
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm(isAr ? 'هل أنت متأكد من الحذف؟' : 'Are you sure?')) {
            const result = await testimonialsService.deleteTestimonial(id);
            if (result.success) {
                toast.success(isAr ? 'تم الحذف' : 'Deleted');
                loadData();
            }
        }
    };

    return (
        <Box>
            <ShinyHeader text={isAr ? 'إدارة التوصيات' : 'Manage Testimonials'} variant="h4" gutterBottom />

            <TableContainer component={Paper} sx={{ mt: 4, borderRadius: 3 }}>
                <Table>
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'الطالب' : 'Student'}</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'التعليق' : 'Comment'}</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'الحالة' : 'Status'}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{isAr ? 'إجراءات' : 'Actions'}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {testimonials.map((t) => (
                            <TableRow key={t.id} hover>
                                <TableCell>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Avatar sx={{ bgcolor: 'primary.main' }}>
                                            <Person />
                                        </Avatar>
                                        <Box>
                                            <Typography variant="subtitle2">{t.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">{t.major}</Typography>
                                        </Box>
                                    </Box>
                                </TableCell>
                                <TableCell sx={{ maxWidth: 300 }}>
                                    <Typography variant="body2" noWrap sx={{ fontStyle: 'italic' }}>
                                        "{t.text}"
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        size="small"
                                        label={isAr ? (t.status === 'approved' ? 'مقبول' : 'قيد الانتظار') : t.status}
                                        color={t.status === 'approved' ? 'success' : 'warning'}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                                        {t.status === 'pending' ? (
                                            <Tooltip title={isAr ? 'قبول' : 'Approve'}>
                                                <IconButton color="success" onClick={() => handleStatusUpdate(t.id, 'approved')}>
                                                    <CheckCircle />
                                                </IconButton>
                                            </Tooltip>
                                        ) : (
                                            <Tooltip title={isAr ? 'تعليق' : 'Suspend'}>
                                                <IconButton color="warning" onClick={() => handleStatusUpdate(t.id, 'pending')}>
                                                    <Cancel />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        <IconButton color="error" onClick={() => handleDelete(t.id)}>
                                            <Delete />
                                        </IconButton>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
