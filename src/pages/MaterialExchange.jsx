import React, { useEffect, useState } from 'react';
import {
    Box, Typography, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, IconButton, Chip, Tooltip, CircularProgress, Fab
} from '@mui/material';
import { Delete, CloudDownload, Refresh, InsertDriveFile } from '@mui/icons-material';
import { materialsService } from '../services/materialsService';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function MaterialExchange() {
    const [items, setItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = async () => {
        setIsLoading(true);
        const data = await materialsService.getAllMaterials();
        setItems(data);
        setIsLoading(false);
    };

    useEffect(() => { loadData(); }, []);

    const handleDelete = async (id) => {
        if (window.confirm('هل أنت متأكد من الحذف؟')) {
            await materialsService.deleteMaterial(id);
            toast.success('تم الحذف');
            setItems(prev => prev.filter(item => item.id !== id));
        }
    };

    return (
        <Box>
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" fontWeight="bold">تبادل المواد</Typography>
                <Fab color="primary" size="small" onClick={loadData}><Refresh /></Fab>
            </Box>

            {isLoading ? (
                <Box display="flex" justifyContent="center" mt={10}><CircularProgress /></Box>
            ) : (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <TableContainer component={Paper} className="glass-panel" sx={{ background: 'transparent', boxShadow: 'none' }}>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: 'text.secondary' }}>اسم المادة</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>الوصف</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>معلومات التواصل</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>التاريخ</TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>إجراءات</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((row, index) => (
                                    <TableRow
                                        key={row.id}
                                        sx={{
                                            '&:last-child td, &:last-child th': { border: 0 },
                                            bgcolor: index % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                                            '&:hover': { bgcolor: 'rgba(211, 47, 47, 0.05)' }
                                        }}
                                    >
                                        <TableCell component="th" scope="row" sx={{ color: 'white', fontWeight: 'bold' }}>
                                            <Box display="flex" alignItems="center" gap={2}>
                                                <InsertDriveFile color="primary" />
                                                {row.itemName}
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.7)' }}>{row.description || 'لا يوجد وصف'}</TableCell>
                                        <TableCell>
                                            <Box display="flex" flexDirection="column" gap={0.5}>
                                                {row.contactInfo && <Chip label={row.contactInfo} size="small" variant="outlined" sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)' }} />}
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                            {new Date(row.createdAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <Tooltip title="حذف">
                                                <IconButton color="error" onClick={() => handleDelete(row.id)}>
                                                    <Delete />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    {items.length === 0 && (
                        <Box textAlign="center" py={5} color="text.secondary">لا توجد مواد مضافة حالياً</Box>
                    )}
                </motion.div>
            )}
        </Box>
    );
}
