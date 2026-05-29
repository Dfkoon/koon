import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Library,
    RefreshCcw,
    Newspaper,
    BarChart,
    Settings,
    LogOut,
    MessageSquare,
    FileUp,
    Flag,
    Rocket,
    Menu,
    Bot,
    Activity,
    X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Admin.css';

const AdminLayout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const { logout } = useAuth();
    const navigate = useNavigate();

    const handleRefresh = () => {
        setIsRefreshing(true);
        // Standard window reload to fetch fresh data and clear state
        setTimeout(() => {
            window.location.reload();
        }, 800); // Brief delay for visual effect
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/admin/login');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const navItems = [
        { name: 'لوحة التحكم', path: '/admin', icon: <LayoutDashboard size={20} />, exact: true },
        { name: 'مركز إدارة المواد', path: '/admin/materials', icon: <Library size={20} /> },
        { name: 'إدارة تبادل المواد', path: '/admin/exchange', icon: <RefreshCcw size={20} /> },
        { name: 'سجل المنسقين', path: '/admin/coordinators-log', icon: <Activity size={20} /> },
        { name: 'الأخبار والأخبار العاجلة', path: '/admin/news', icon: <Newspaper size={20} /> },
        { name: 'المساهمات والطلبات', path: '/admin/contributions', icon: <FileUp size={20} /> },
        { name: 'مشاريع الطلاب', path: '/admin/projects', icon: <Rocket size={20} /> },
        { name: 'مراقب محادثات نشمي', path: '/admin/chat-logs', icon: <Bot size={20} /> },
        { name: 'بلاغات الأسئلة', path: '/admin/reports', icon: <Flag size={20} /> },
        { name: 'الآراء والشكاوى', path: '/admin/feedback', icon: <MessageSquare size={20} /> },
        { name: 'الإحصائيات التحليلية', path: '/admin/analytics', icon: <BarChart size={20} /> },
        { name: 'الإعدادات', path: '/admin/settings', icon: <Settings size={20} /> },
    ];

    const closeSidebar = () => setIsSidebarOpen(false);

    return (
        <div className={`admin-layout ${isSidebarOpen ? 'sidebar-open' : ''}`}>
            {/* Mobile Overlay */}
            {isSidebarOpen && <div className="admin-overlay" onClick={closeSidebar}></div>}

            {/* Sidebar */}
            <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="admin-brand">
                    <div className="admin-logo">M</div>
                    <h2>لوحة التحكم</h2>
                    <button className="admin-close-mobile" onClick={closeSidebar}>
                        <X size={24} />
                    </button>
                </div>

                <nav className="admin-nav">
                    <ul>
                        {navItems.map((item) => (
                            <li key={item.name}>
                                <NavLink
                                    to={item.path}
                                    end={item.exact}
                                    onClick={closeSidebar}
                                    className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
                                >
                                    {item.icon}
                                    <span>{item.name}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                <div className="admin-sidebar-footer">
                    <button className="admin-logout-btn" onClick={handleLogout}>
                        <LogOut size={20} />
                        <span>تسجيل الخروج</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="admin-main">
                {/* Topbar */}
                <header className="admin-topbar">
                    <div className="topbar-left">
                        <button className="admin-menu-toggle" onClick={() => setIsSidebarOpen(true)}>
                            <Menu size={24} />
                        </button>
                        <div className="topbar-search">
                            <input type="text" placeholder="بحث في النظام..." />
                        </div>
                    </div>
                    <div className="topbar-right">
                        <button
                            className={`admin-refresh-btn ${isRefreshing ? 'refreshing' : ''}`}
                            onClick={handleRefresh}
                            title="تحديث النظام"
                        >
                            <RefreshCcw size={18} />
                        </button>
                        <div className="topbar-profile">
                            <div className="avatar">م</div>
                            <span className="profile-name">مسؤول النظام</span>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="admin-content-wrapper">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
