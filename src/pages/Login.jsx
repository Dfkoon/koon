import React, { useState } from 'react';
import { Box, Typography, Button, TextField, InputAdornment, IconButton, Alert, Link } from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Lock from '@mui/icons-material/Lock';
import Email from '@mui/icons-material/Email';
import Fingerprint from '@mui/icons-material/Fingerprint';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);

    const { login, register } = useAuth();
    const navigate = useNavigate();

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isRegistering) {
                await register(email, password);
                toast.success('تم إنشاء الحساب بنجاح! 🚀');
            } else {
                await login(email, password);
                toast.success('تم تسجيل الدخول بنجاح! 🔓');
            }
            navigate('/dashboard');
        } catch (err) {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                setError('هذا الإيميل مسجل مسبقاً، حاول تسجيل الدخول بدلاً من إنشاء حساب.');
            } else if (err.code === 'auth/weak-password') {
                setError('كلمة المرور ضعيفة. يرجى استخدام 6 أحرف على الأقل.');
            } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setError('بيانات الدخول غير صحيحة.');
            } else {
                setError('حدث خطأ غير متوقع: ' + err.message);
            }
            toast.error('فشلت العملية ❌');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            height="100vh"
            sx={{ position: 'relative', zIndex: 10 }}
        >
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <Box
                    component="form"
                    onSubmit={handleAuth}
                    className="glass-panel"
                    sx={{
                        p: 5,
                        width: '100%',
                        maxWidth: 450,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        alignItems: 'center',
                        border: '1px solid rgba(211, 47, 47, 0.3)',
                        boxShadow: '0 0 40px rgba(211, 47, 47, 0.1)'
                    }}
                >
                    <Box sx={{
                        width: 80, height: 80,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 20px var(--primary-glow)',
                        mb: 1
                    }}>
                        <Lock sx={{ fontSize: 40, color: 'white' }} />
                    </Box>

                    <Typography variant="h4" fontWeight="bold">{isRegistering ? 'إنشاء حساب مسؤول' : 'بوابة الإدارة'}</Typography>
                    <Typography variant="body2" color="text.secondary" textAlign="center">
                        {isRegistering ? 'سجل بياناتك للبدء كمسؤول جديد' : 'منطقة محظورة: الدخول للمصرح لهم فقط'}
                    </Typography>

                    {error && <Alert severity="error" sx={{ width: '100%', direction: 'rtl' }}>{error}</Alert>}

                    <TextField
                        fullWidth
                        label="البريد الإلكتروني"
                        variant="outlined"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Email color="primary" /></InputAdornment>,
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                                '&:hover fieldset': { borderColor: 'var(--primary)' },
                            }
                        }}
                    />

                    <TextField
                        fullWidth
                        label="كلمة المرور"
                        type={showPassword ? 'text' : 'password'}
                        variant="outlined"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Fingerprint color="primary" /></InputAdornment>,
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                                '&:hover fieldset': { borderColor: 'var(--primary)' },
                            }
                        }}
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        fullWidth
                        size="large"
                        disabled={loading}
                        sx={{
                            mt: 2,
                            height: 50,
                            fontSize: '1.1rem',
                            borderRadius: '12px',
                            bgcolor: loading ? 'grey.800' : 'primary.main'
                        }}
                    >
                        {loading ? 'جاري التحقق...' : (isRegistering ? 'إنشاء الحساب' : 'دخول آمن')}
                    </Button>

                    {/* 
                    <Box mt={2}>
                        <Typography
                            variant="body2"
                            onClick={() => {
                                setIsRegistering(!isRegistering);
                                setError('');
                            }}
                            sx={{
                                color: 'text.secondary',
                                textDecoration: 'underline',
                                cursor: 'pointer',
                                '&:hover': { color: 'primary.main' }
                            }}
                        >
                            {isRegistering ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'ليس لديك حساب؟ إنشاء حساب جديد'}
                        </Typography>
                    </Box> 
                    */}

                </Box>
            </motion.div>
        </Box>
    );
}
