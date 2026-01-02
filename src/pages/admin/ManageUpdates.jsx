import React, { useEffect, useState } from 'react';
import {
    Box, Paper, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow,
    IconButton, Button, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField,
    Select, MenuItem, FormControl, InputLabel, Chip
} from '@mui/material';
import { Delete, Edit, Add, Campaign, Link as LinkIcon } from '@mui/icons-material';
import { updatesService } from '../../services/updatesService';
import ShinyHeader from '../../components/ShinyHeader';
import { useLanguage } from '../../context/LanguageContext';
import toast from 'react-hot-toast';

export default function ManageUpdates() {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [updates, setUpdates] = useState([]);
    const [open, setOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        titleAr: '', titleEn: '',
        textAr: '', textEn: '',
        category: 'academic',
        link: '',
        isUrgent: false
    });

    const loadUpdates = async () => {
        const data = await updatesService.getAllUpdates();
        setUpdates(data);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadUpdates();
    }, []);

    const handleOpen = (update = null) => {
        if (update) {
            setFormData(update);
            setEditingId(update.id);
        } else {
            setFormData({
                titleAr: '', titleEn: '',
                textAr: '', textEn: '',
                category: 'academic',
                link: '',
                isUrgent: false
            });
            setEditingId(null);
        }
        setOpen(true);
    };

    const handleSubmit = async () => {
        let result;
        if (editingId) {
            result = await updatesService.updateUpdate(editingId, formData);
        } else {
            result = await updatesService.createUpdate(formData);
        }

        if (result.success) {
            toast.success(isAr ? 'تم الحفظ' : 'Saved successfully');
            setOpen(false);
            loadUpdates();
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm(isAr ? 'هل أنت متأكد من الحذف؟' : 'Are you sure?')) {
            const result = await updatesService.deleteUpdate(id);
            if (result.success) {
                toast.success(isAr ? 'تم الحذف' : 'Deleted');
                loadUpdates();
            }
        }
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
                <ShinyHeader text={isAr ? 'إدارة التحديثات' : 'Manage Updates'} variant="h4" />
                <Button variant="contained" startIcon={<Add />} onClick={() => handleOpen()}>
                    {isAr ? 'إضافة تحديث' : 'Add Update'}
                </Button>
            </Box>

            <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
                <Table>
                    <TableHead sx={{ bgcolor: 'action.hover' }}>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'العنوان' : 'Title'}</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'التصنيف' : 'Category'}</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>{isAr ? 'عاجل' : 'Urgent'}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{isAr ? 'إجراءات' : 'Actions'}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {updates.map((update) => (
                            <TableRow key={update.id} hover>
                                <TableCell>{isAr ? update.titleAr : update.titleEn}</TableCell>
                                <TableCell>
                                    <Chip size="small" label={update.category} />
                                </TableCell>
                                <TableCell>
                                    {update.isUrgent && <Campaign color="error" />}
                                </TableCell>
                                <TableCell align="center">
                                    <IconButton color="primary" onClick={() => handleOpen(update)}><Edit /></IconButton>
                                    <IconButton color="error" onClick={() => handleDelete(update.id)}><Delete /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
                <DialogTitle>{editingId ? (isAr ? 'تعديل' : 'Edit') : (isAr ? 'إضافة جديد' : 'Add New')}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField fullWidth label="العنوان (بالعربية)" value={formData.titleAr} onChange={(e) => setFormData({ ...formData, titleAr: e.target.value })} />
                            <TextField fullWidth label="Title (English)" value={formData.titleEn} onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })} />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField fullWidth multiline rows={3} label="النص (بالعربية)" value={formData.textAr} onChange={(e) => setFormData({ ...formData, textAr: e.target.value })} />
                            <TextField fullWidth multiline rows={3} label="Text (English)" value={formData.textEn} onChange={(e) => setFormData({ ...formData, textEn: e.target.value })} />
                        </Box>
                        <FormControl fullWidth>
                            <InputLabel>Category</InputLabel>
                            <Select value={formData.category} label="Category" onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                                <MenuItem value="academic">Academic</MenuItem>
                                <MenuItem value="event">Event</MenuItem>
                                <MenuItem value="news">News</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField fullWidth label="Link (Optional)" value={formData.link} onChange={(e) => setFormData({ ...formData, link: e.target.value })} InputProps={{ startAdornment: <LinkIcon sx={{ mr: 1, color: 'action.active' }} /> }} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
                    <Button variant="contained" onClick={handleSubmit}>{isAr ? 'حفظ' : 'Save'}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
