// src/config/permissions.js
// المصدر الوحيد للحقيقة (Single Source of Truth) لكل صلاحيات النظام

export const PERMISSION_GROUPS = [
  {
    id: 'main',
    labelAr: 'الرئيسية والمؤشرات',
    labelEn: 'Main & Indicators',
    icon: '📊',
    permissions: [
      { key: 'canViewAnalytics',   labelAr: 'لوحة الإحصائيات',      labelEn: 'Statistics Dashboard' },
      { key: 'canViewActivityLog', labelAr: 'سجل النشاط المباشر',   labelEn: 'Live Activity Log' },
      { key: 'canManageNotices',   labelAr: 'لوحة الإعلانات',        labelEn: 'Notices Board' },
    ],
  },
  {
    id: 'academic',
    labelAr: 'الشؤون الأكاديمية والمحتوى',
    labelEn: 'Academic Affairs & Content',
    icon: '📚',
    permissions: [
      { key: 'canAddCourses',           labelAr: 'إضافة مواد دراسية',           labelEn: 'Add Courses' },
      { key: 'canEditCourses',          labelAr: 'تعديل مواد دراسية',           labelEn: 'Edit Courses' },
      { key: 'canDeleteCourses',        labelAr: 'حذف مواد دراسية',             labelEn: 'Delete Courses', adminOnly: true },
      { key: 'canAddExams',             labelAr: 'إضافة اختبارات (بنك الأسئلة)', labelEn: 'Add Exams' },
      { key: 'canEditExams',            labelAr: 'تعديل اختبارات',               labelEn: 'Edit Exams' },
      { key: 'canApproveContributions', labelAr: 'مراجعة مساهمات الطلاب',       labelEn: 'Review Student Contributions' },
    ],
  },
  {
    id: 'volunteers',
    labelAr: 'فريق العمل والتطوع',
    labelEn: 'Team & Volunteering',
    icon: '🤝',
    permissions: [
      { key: 'canManageVolunteers',   labelAr: 'بوابة المتطوعين (RBAC)', labelEn: 'Volunteers Portal (RBAC)', adminOnly: true },
      { key: 'canManageCoordinators', labelAr: 'إدارة المنسقين',          labelEn: 'Manage Coordinators', adminOnly: true },
      { key: 'canReviewApplications', labelAr: 'طلبات الانضمام',          labelEn: 'Join Requests' },
    ],
  },
  {
    id: 'services',
    labelAr: 'الخدمات والعمليات',
    labelEn: 'Services & Operations',
    icon: '🔄',
    permissions: [
      { key: 'canManageSwap',            labelAr: 'تبادل الكتب والمواد',   labelEn: 'Book & Material Exchange' },
      { key: 'canManageServiceRequests', labelAr: 'طلبات الخدمات',         labelEn: 'Service Requests' },
      { key: 'canManageFAQ',             labelAr: 'نشمي والأسئلة الشائعة', labelEn: 'Chatbot & FAQ' },
    ],
  },
  {
    id: 'system',
    labelAr: 'النظام والملاحظات',
    labelEn: 'System & Feedback',
    icon: '⚙️',
    permissions: [
      { key: 'canManageReports',  labelAr: 'بلاغات الأسئلة',         labelEn: 'Question Reports' },
      { key: 'canManageFeedback', labelAr: 'التقييمات والآراء',       labelEn: 'Ratings & Feedback' },
      { key: 'canManageSettings', labelAr: 'الإعدادات العامة للنظام', labelEn: 'System Settings', adminOnly: true },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.key));

export const ADMIN_ONLY_KEYS = PERMISSION_GROUPS.flatMap(g =>
  g.permissions.filter(p => p.adminOnly).map(p => p.key)
);

export const DELETE_KEYS = ['canDeleteCourses', 'canDeleteUsers', 'canDeleteAnything'];

export function hasPermission(perms, key, { isAdmin = false } = {}) {
  if (!perms) return false;
  if (DELETE_KEYS.includes(key) && !isAdmin) return false;
  if (ADMIN_ONLY_KEYS.includes(key) && !isAdmin) return false;
  return Boolean(perms[key]);
}

export function sanitizePermissionsForVolunteer(perms) {
  const clean = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (DELETE_KEYS.includes(key)) continue;
    if (ADMIN_ONLY_KEYS.includes(key)) continue;
    clean[key] = Boolean(perms?.[key]);
  }
  return clean;
}
