import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Paper, Card, CardContent,
    Button, Grid, Chip, Divider, IconButton, Tooltip,
    CircularProgress
} from '@mui/material';
import {
    Delete, CheckCircle, Person, Phone,
    Description, Event, LibraryBooks
} from '@mui/icons-material';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function ManageRequests() {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadRequests = async () => {
        setIsLoading(true);
        try {
            const q = query(collection(db, 'service_requests'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRequests(data);
        } catch (error) {
            console.error("Error loading requests:", error);
            toast.error(isAr ? 'فشل تحميل الطلبات' : 'Failed to load requests');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadRequests();
    }, []);

    const handleDelete = async (id) => {
        if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا الطلب؟' : 'Are you sure you want to delete this request?')) {
            try {
                await deleteDoc(doc(db, 'service_requests', id));
                toast.success(isAr ? 'تم الحذف بنجاح' : 'Deleted successfully');
                setRequests(requests.filter(req => req.id !== id));
            } catch (error) {
                toast.error(isAr ? 'حدث خطأ في الحذف' : 'Error deleting');
            }
        }
    };

    const handleComplete = async (id, currentStatus) => {
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
        try {
            await updateDoc(doc(db, 'service_requests', id), { status: newStatus });
            toast.success(isAr ? 'تم تحديث حالة الطلب' : 'Status updated');
            setRequests(requests.map(req => req.id === id ? { ...req, status: newStatus } : req));
        } catch (error) {
            toast.error(isAr ? 'فشل التحديث' : 'Update failed');
        }
    };

    return (
        <Box>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <ShinyHeader text={isAr ? 'طلبات الخدمات الطلابية' : 'Student Service Requests'} variant="h4" gutterBottom />
                    <Typography variant="body2" color="text.secondary">
                        {isAr ? 'إدارة طلبات المساعدة في المشاريع والبوربوينت والواجبات' : 'Manage project help, PowerPoint, and assignment requests'}
                    </Typography>
                </Box>
                <IconButton onClick={loadRequests} color="primary" disabled={isLoading}>
                    <LibraryBooks />
                </IconButton>
            </Box>

            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                    <CircularProgress />
                </Box>
            ) : requests.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', color: 'text.secondary', borderRadius: 4 }}>
                    <Typography variant="h6">{isAr ? 'لا توجد طلبات حالياً' : 'No requests at the moment'}</Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {requests.map((req) => (
                        <Grid item xs={12} md={6} key={req.id}>
                            <Card sx={{
                                height: '100%',
                                borderLeft: req.status === 'completed' ? '5px solid #4caf50' : '5px solid #2196f3',
                                borderRadius: 3,
                                boxShadow: 2
                            }}>
                                <CardContent>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                        <Chip
                                            label={req.service}
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                            sx={{ fontWeight: 'bold' }}
                                        />
                                        <Chip
                                            label={isAr ? (req.status === 'completed' ? 'مكتمل' : 'قيد الانتظار') : req.status}
                                            size="small"
                                            color={req.status === 'completed' ? 'success' : 'info'}
                                        />
                                    </Box>

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <Person color="action" fontSize="small" />
                                        <Typography variant="body1" fontWeight="bold">
                                            {req.name}
                                        </Typography>
                                    </Box>

                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <Phone color="action" fontSize="small" />
                                        <Typography
                                            variant="body2"
                                            component="a"
                                            href={`https://wa.me/962${req.whatsapp?.replace(/^0/, '')}`}
                                            target="_blank"
                                            sx={{ color: 'success.main', textDecoration: 'none' }}
                                        >
                                            {req.whatsapp} (WhatsApp)
                                        </Typography>
                                    </Box>

                                    <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'flex-start' }}>
                                        <Description color="action" fontSize="small" sx={{ mt: 0.5 }} />
                                        <Typography variant="body2" color="text.secondary">
                                            {req.details}
                                        </Typography>
                                    </Box>

                                    <Divider sx={{ my: 1.5 }} />

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Event fontSize="inherit" color="disabled" />
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(req.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <Tooltip title={isAr ? 'تغيير الحالة' : 'Change Status'}>
                                                <IconButton
                                                    onClick={() => handleComplete(req.id, req.status)}
                                                    color={req.status === 'completed' ? 'success' : 'default'}
                                                    size="small"
                                                >
                                                    <CheckCircle />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={isAr ? 'حذف' : 'Delete'}>
                                                <IconButton onClick={() => handleDelete(req.id)} color="error" size="small">
                                                    <Delete />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
}
