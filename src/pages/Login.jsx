import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Lock, Mail, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import './Login.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!email || !password) {
            return toast.error('يرجى إدخال البريد الإلكتروني وكلمة المرور');
        }

        try {
            setLoading(true);
            await login(email, password);
            toast.success('تم تسجيل الدخول بنجاح');
            navigate('/admin');
        } catch (error) {
            console.error('Login error:', error);
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                toast.error('بيانات الدخول غير صحيحة');
            } else if (error.code === 'auth/network-request-failed') {
                toast.error('تحقق من اتصال الإنترنت');
            } else {
                toast.error(`حدث خطأ: ${error.message || 'فشل في الاتصال'}`);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-login-root">
            <div className="login-bg-shapes">
                <div className="shape shape-1"></div>
                <div className="shape shape-2"></div>
            </div>

            <div className="login-container">
                <button className="back-to-site" onClick={() => navigate('/')}>
                    <ArrowLeft size={18} /> العودة للموقع
                </button>

                <div className="login-card glass-card">
                    <div className="login-header">
                        <div className="login-logo">
                            <Lock size={32} />
                        </div>
                        <h1>بوابة الإدارة</h1>
                        <p>يرجى تسجيل الدخول للمتابعة إلى لوحة التحكم</p>
                    </div>

                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="login-input-group">
                            <label>البريد الإلكتروني</label>
                            <div className="input-wrapper">
                                <Mail size={18} className="input-icon" />
                                <input
                                    type="email"
                                    placeholder="admin@makanak.edu"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="login-input-group">
                            <label>كلمة المرور</label>
                            <div className="input-wrapper">
                                <Lock size={18} className="input-icon" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="password-toggle"
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <button type="submit" className="login-submit-btn" disabled={loading}>
                            {loading ? (
                                <><Loader2 size={20} className="spinner" /> جاري التحقق...</>
                            ) : (
                                'تسجيل الدخول'
                            )}
                        </button>
                    </form>

                    <div className="login-footer">
                        <p>© {new Date().getFullYear()} موقع مكانك - جامعة البلقاء التطبيقية</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
