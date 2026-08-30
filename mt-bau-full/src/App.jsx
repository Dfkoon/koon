import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ScrollToTop from './components/ScrollToTop';
import { Toaster } from 'react-hot-toast';
import HeroSection from './sections/HeroSection';
import AnnouncementMarquee from './components/AnnouncementMarquee';
import LemonChat from './sections/LemonChat';
import UpcomingEvents from './sections/UpcomingEvents';
import NewsSection from './sections/NewsSection';
import ProjectsSection from './sections/ProjectsSection';
import ServicesSection from './sections/ServicesSection';
import RequestServicesSection from './sections/RequestServicesSection';
import FeatureShowcase from './sections/FeatureShowcase';
import UsefulSitesSection from './sections/UsefulSitesSection';
import WeeklyTip from './sections/WeeklyTip';
import Testimonials from './sections/Testimonials';
import SuggestionsSection from './sections/SuggestionsSection';
import GraduationPromo from './sections/GraduationPromo';
import CourseWatcherSection from './sections/CourseWatcherSection';
import Footer from './components/Footer';
import PageTitleUpdater from './components/PageTitleUpdater';

import StudyMaterials from './pages/StudyMaterials';
import AcademicPlans from './pages/AcademicPlans';
import Quiz from './pages/Quiz';
import AcademicCalendar from './pages/AcademicCalendar';
import GradingSystem from './pages/GradingSystem';
import MaterialExchange from './pages/MaterialExchange';
import CourseWatcherPage from './pages/CourseWatcherPage';
import AdminDashboard from './pages/AdminDashboard';
import VolunteerPortal from './pages/VolunteerPortal';
import SecureGateway from './pages/SecureGateway';
import FAQ from './pages/FAQ';
import AboutUs from './pages/AboutUs';

import Legal from './pages/Legal';
import './index.css';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from './config/firebase';

import FeedbackPopup from './components/FeedbackPopup';
import CookieConsent from './components/CookieConsent';
import SplashScreen from './components/SplashScreen';

import ReportModal from './components/ReportModal';
import InstallPWAButton from './components/InstallPWAButton';
import StudyProgressTracker from './components/StudyProgressTracker';
import ReadingProgressBar from './components/ReadingProgressBar';
import DailyMotivation from './components/DailyMotivation';
import BackToTopBtn from './components/BackToTopBtn';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';
import NoticeBoard from './components/NoticeBoard';
import MaintenanceBanner from './components/MaintenanceBanner';

const HomePage = () => {
  const location = useLocation();
  const [homeSections, setHomeSections] = React.useState({});
  const sectionEnabled = (key) => homeSections[key] !== false;

  React.useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'system_configs', 'global_settings'), (snapshot) => {
      if (!snapshot.exists()) return;
      const settings = snapshot.data();
      setHomeSections(Object.fromEntries(
        Object.entries(settings).filter(([key]) => key.startsWith('home_'))
      ));
    }, (error) => console.warn('Failed to load homepage settings:', error));
    return () => unsubscribe();
  }, []);
  React.useEffect(() => {
    // Handle manual scroll state
    if (location.state?.scrollToReviews) {
      const section = document.getElementById('testimonials-section');
      if (section) {
        setTimeout(() => {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }

    // Handle hash fragments (e.g., #/#lemon-chat)
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
      }
    }
  }, [location]);

  return (
    <>
      {sectionEnabled('home_hero_enabled') && <HeroSection />}
      {sectionEnabled('home_marquee_enabled') && <AnnouncementMarquee />}

      <LemonChat />
      {sectionEnabled('home_events_enabled') && <UpcomingEvents />}
      {sectionEnabled('home_graduation_enabled') && <GraduationPromo />}
      {sectionEnabled('home_course_watcher_enabled') && <CourseWatcherSection />}
      {/* <NewsSection /> */}
      {sectionEnabled('home_weekly_tip_enabled') && <WeeklyTip />}
      {sectionEnabled('home_projects_enabled') && <ProjectsSection />}
      {sectionEnabled('home_services_enabled') && <ServicesSection />}
      {sectionEnabled('home_request_services_enabled') && <RequestServicesSection />}
      {sectionEnabled('home_useful_sites_enabled') && <UsefulSitesSection />}
      {sectionEnabled('home_testimonials_enabled') && <div id="testimonials-section"><Testimonials /></div>}
      {sectionEnabled('home_suggestions_enabled') && <SuggestionsSection />}
    </>
  );
};


const StudyProgressSection = () => (
  <div style={{ padding: '0 16px' }}>
    <StudyProgressTracker />
  </div>
);

const LegacyAdminRedirect = () => {
  React.useEffect(() => {
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
    const adminPath = `${basePath}/admin`;

    if (window.location.pathname.replace(/\/$/, '') === adminPath && !window.location.hash) {
      window.location.replace(`${basePath}/#/admin`);
    }
  }, []);

  return null;
};


function App() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [maintenanceSettings, setMaintenanceSettings] = React.useState({ enabled: false, message: '' });
  const [showFeedbackPopup, setShowFeedbackPopup] = React.useState(false);
  const [feedbackPopupEnabled, setFeedbackPopupEnabled] = React.useState(false);
  const [feedbackPopupLoaded, setFeedbackPopupLoaded] = React.useState(false);

  // Splash screen disabled
  const [showSplash] = React.useState(false);
  const handleSplashFinish = React.useCallback(() => { }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  React.useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'system_configs', 'global_settings'), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      setMaintenanceSettings({
        enabled: data.maintenance_mode === true,
        message: data.maintenance_message || ''
      });
    }, (error) => console.warn('Failed to load maintenance setting:', error));
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsDoc = await getDoc(doc(db, 'system_configs', 'global_settings'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setFeedbackPopupEnabled(data.feedbackPopupEnabled ?? true);
        } else {
          setFeedbackPopupEnabled(true);
        }
      } catch (err) {
        console.warn('Failed to load feedback popup setting:', err);
        setFeedbackPopupEnabled(true);
      } finally {
        setFeedbackPopupLoaded(true);
      }
    };

    loadSettings();
  }, []);

  React.useEffect(() => {
    if (!feedbackPopupLoaded || !feedbackPopupEnabled) return;
    const hasSeenPopup = localStorage.getItem('koon_rated_v1');
    if (hasSeenPopup) return;

    const timer = window.setTimeout(() => {
      setShowFeedbackPopup(true);
    }, 180000);

    return () => window.clearTimeout(timer);
  }, [feedbackPopupLoaded, feedbackPopupEnabled]);

  const handleClosePopup = () => {
    setShowFeedbackPopup(false);
    localStorage.setItem('koon_rated_v1', 'true');
  };

  return (
    <>
      <MaintenanceBanner enabled={maintenanceSettings.enabled} message={maintenanceSettings.message} />
      {showSplash && <SplashScreen onFinish={handleSplashFinish} />}
      <LegacyAdminRedirect />
      <Router>
        <InstallPWAButton isAr={true} />
        <ScrollToTop />
        <PageTitleUpdater />
        <Toaster
          position="top-center"
          reverseOrder={false}
          containerStyle={{
            zIndex: 99999, // Ensure it's above everything including navbar
          }}
          toastOptions={{
            style: {
              zIndex: 99999,
            },
          }}
        />
        <Routes>
          {/* Standalone report page - no navbar/footer */}
          <Route path="/report" element={<ReportModal />} />

          {/* 🔒 Isolated coordinator gateway - completely hidden from site, no navbar/footer/sidebar */}
          <Route path="/portal" element={<SecureGateway />} />

          {/* 🔒 Isolated admin dashboard - no public navbar/footer/sidebar */}
          <Route path="/admin" element={<AdminDashboard />} />

          {/* 🤝 Volunteer Portal - isolated page for volunteers */}
          <Route path="/volunteer-portal" element={<VolunteerPortal />} />

          {/* All other pages wrapped in site layout */}
          <Route path="*" element={
            <div className="app-container">
              <Navbar toggleSidebar={toggleSidebar} />
              <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />

              <FeedbackPopup
                isOpen={showFeedbackPopup}
                onClose={handleClosePopup}
              />

              <CookieConsent />

              <main>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/materials" element={<StudyMaterials />} />
                  <Route path="/plans" element={<AcademicPlans />} />
                  <Route path="/quiz" element={<Quiz />} />
                  <Route path="/quiz/:quizId" element={<Quiz />} />
                  <Route path="/calendar" element={<AcademicCalendar />} />
                  <Route path="/grading" element={<GradingSystem />} />
                  <Route path="/exchange" element={<MaterialExchange />} />
                  <Route path="/watcher" element={<CourseWatcherPage />} />


                  <Route path="/faq" element={<FAQ />} />
                  <Route path="/about" element={<AboutUs />} />

                  <Route path="/legal" element={<Legal />} />
                </Routes>
              </main>

              {/* Back to top button */}
              <BackToTopBtn />
              {/* Keyboard shortcuts help modal (press ?) */}
              <KeyboardShortcutsHelp />
              {/* Reading scroll progress bar */}
              <ReadingProgressBar />
              {/* Admin notice board (Firebase-driven) */}
              <NoticeBoard />
              <Footer />
            </div>
          } />
        </Routes>

      </Router>
    </>
  );
}

export default App;
