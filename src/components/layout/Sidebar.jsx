import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Box, Typography, IconButton, Tooltip, Avatar } from '@mui/material';
import Dashboard from '@mui/icons-material/Dashboard';
import Mail from '@mui/icons-material/Mail';
import Star from '@mui/icons-material/Star';
import FolderShared from '@mui/icons-material/FolderShared';
import BugReport from '@mui/icons-material/BugReport';
import Chat from '@mui/icons-material/Chat';
import Campaign from '@mui/icons-material/Campaign';
import Logout from '@mui/icons-material/Logout';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import Backup from '@mui/icons-material/Backup';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const Sidebar = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { logout } = useAuth();
    const navigate = useNavigate();

    const menuItems = [
        { path: '/dashboard', label: 'لوحة القيادة', icon: <Dashboard /> },
        { path: '/suggestions', label: 'الشكاوى والاقتراحات', icon: <Mail /> },
        { path: '/testimonials', label: 'إدارة الآراء', icon: <Star /> },
        { path: '/materials', label: 'تبادل المواد', icon: <FolderShared /> },
        { path: '/contributions', label: 'مساهمات الطلاب', icon: <Backup /> },
        { path: '/questions', label: 'مراجعة الأسئلة', icon: <BugReport /> },
        { path: '/nashmi', label: 'نشمي شات', icon: <Chat /> },
        { path: '/broadcasts', label: 'الإعلانات العاجلة', icon: <Campaign /> },
    ];

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/login');
            toast.success('تم تسجيل الخروج');
        } catch (err) {
            console.error("Logout error:", err);
            toast.error('فشل تسجيل الخروج');
        }
    };

    return (
        <motion.div
            initial={{ width: 280 }}
            animate={{ width: collapsed ? 80 : 280 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            style={{
                height: '95vh',
                margin: '2.5vh 20px',
                position: 'sticky',
                top: '2.5vh',
                zIndex: 100
            }}
        >
            <Box className="glass-panel" sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                py: 4,
                overflow: 'hidden',
                position: 'relative'
            }}>
                {/* Header / Logo */}
                <Box sx={{
                    px: collapsed ? 2 : 4,
                    mb: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    justifyContent: collapsed ? 'center' : 'flex-start'
                }}>
                    <Avatar
                        sx={{
                            bgcolor: 'primary.main',
                            boxShadow: '0 0 20px var(--primary-glow)',
                            width: 40, height: 40
                        }}
                    >K</Avatar>

                    <AnimatePresence>
                        {!collapsed && (
                            <motion.div
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
                            >
                                <Typography variant="h6" fontWeight="800" sx={{ letterSpacing: 1 }}>
                                    KOON<span style={{ color: 'var(--primary)' }}>.ADMIN</span>
                                </Typography>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Box>

                {/* Navigation Links */}
                <Box sx={{ flex: 1, px: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {menuItems.map((item) => (
                        <NavLink
                            to={item.path}
                            key={item.path}
                            style={({ isActive }) => ({
                                textDecoration: 'none',
                                color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                            })}
                        >
                            {({ isActive }) => (
                                <Box sx={{
                                    p: 1.5,
                                    borderRadius: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 2,
                                    justifyContent: collapsed ? 'center' : 'flex-start',
                                    background: isActive ? 'linear-gradient(90deg, rgba(211,47,47,0.2), transparent)' : 'transparent',
                                    border: isActive ? '1px solid rgba(211,47,47,0.3)' : '1px solid transparent',
                                    transition: 'all 0.3s ease',
                                    '&:hover': {
                                        background: 'rgba(255,255,255,0.05)',
                                        transform: 'translateX(-5px)'
                                    }
                                }}>
                                    <Tooltip title={collapsed ? item.label : ""} placement="right">
                                        <Box sx={{
                                            color: isActive ? 'primary.main' : 'inherit',
                                            display: 'flex',
                                            '& svg': {
                                                filter: isActive ? 'drop-shadow(0 0 8px var(--primary-glow))' : 'none'
                                            }
                                        }}>
                                            {item.icon}
                                        </Box>
                                    </Tooltip>

                                    {!collapsed && (
                                        <Typography fontWeight={isActive ? 700 : 400} fontSize="0.95rem">
                                            {item.label}
                                        </Typography>
                                    )}

                                    {isActive && !collapsed && (
                                        <motion.div layoutId="active-indicator" style={{
                                            width: 4, height: 4, borderRadius: '50%',
                                            background: 'var(--primary)', marginLeft: 'auto',
                                            boxShadow: '0 0 10px var(--primary)'
                                        }} />
                                    )}
                                </Box>
                            )}
                        </NavLink>
                    ))}
                </Box>

                {/* Footer / Toggle */}
                <Box sx={{ px: 2, mt: 'auto' }}>
                    <IconButton
                        onClick={() => setCollapsed(!collapsed)}
                        sx={{
                            width: '100%',
                            borderRadius: '12px',
                            color: 'text.secondary',
                            mb: 2,
                            '&:hover': { background: 'rgba(255,255,255,0.05)' }
                        }}
                    >
                        {collapsed ? <ChevronLeft /> : <ChevronRight />}
                    </IconButton>

                    <Box
                        onClick={handleLogout}
                        sx={{
                            p: 1.5,
                            borderRadius: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            cursor: 'pointer',
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            color: 'error.main',
                            '&:hover': { background: 'rgba(255, 23, 68, 0.1)' }
                        }}
                    >
                        <Logout />
                        {!collapsed && <Typography fontWeight="600">تسجيل الخروج</Typography>}
                    </Box>
                </Box>
            </Box>
        </motion.div>
    );
};

export default Sidebar;
