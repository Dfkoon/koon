import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Paper, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow,
    IconButton, Chip, TextField, InputAdornment,
    Button, CircularProgress
} from '@mui/material';
import { Delete, Email as EmailIcon, Search, Refresh } from '@mui/icons-material';
import { subscribersService as newsletterService } from '../../services/subscribersService';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function ManageSubscribers() {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [subscribers, setSubscribers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const loadSubscribers = async () => {
        setIsLoading(true);
        const data = await newsletterService.getSubscribers();
        setSubscribers(data);
        setIsLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadSubscribers();
    }, [refreshTrigger]);

    const handleDelete = async (id) => {
        if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا المشترك؟' : 'Are you sure you want to delete this subscriber?')) {
            const result = await newsletterService.unsubscribe(id);
            if (result.success) {
                toast.success(isAr ? 'تم الحذف بنجاح' : 'Deleted successfully');
                setRefreshTrigger(prev => prev + 1);
            }
        }
    };

    const filteredSubscribers = subscribers.filter(s =>
        s.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexWrap: 'wrap', gap: 2 }}>
                <ShinyHeader text={isAr ? 'إدارة المشتركين' : 'Manage Subscribers'} variant="h4" />
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                        size="small"
                        placeholder={isAr ? 'بحث عن بريد...' : 'Search email...'}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search fontSize="small" />
                                </InputAdornment>
                            ),
                        }}
                    />
                    <IconButton onClick={() => setRefreshTrigger(p => p + 1)} disabled={isLoading}>
                        <Refresh />
                    </IconButton>
                </Box>
            </Box>

            <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
                <TableContainer sx={{ maxHeight: 600 }}>
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'البريد الإلكتروني' : 'Email'}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'تاريخ الاشتراك' : 'Subscribed At'}</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'الحالة' : 'Status'}</TableCell>
                                <TableCell align="center" sx={{ fontWeight: 'bold' }}>{isAr ? 'إجراءات' : 'Actions'}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                                        <CircularProgress size={24} />
                                    </TableCell>
                                </TableRow>
                            ) : filteredSubscribers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                                        <Typography color="text.secondary">{isAr ? 'لا يوجد مشتركين' : 'No subscribers found'}</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : filteredSubscribers.map((sub, index) => (
                                <TableRow key={sub.id} hover>
                                    <TableCell>{index + 1}</TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <EmailIcon fontSize="small" color="action" />
                                            {sub.email}
                                        </Box>
                                    </TableCell>
                                    <TableCell>{new Date(sub.subscribedAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US')}</TableCell>
                                    <TableCell>
                                        <Chip label={isAr ? 'نشط' : 'Active'} color="success" size="small" variant="outlined" />
                                    </TableCell>
                                    <TableCell align="center">
                                        <IconButton color="error" onClick={() => handleDelete(sub.id)}>
                                            <Delete />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Box>
    );
}
