import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Link } from 'react-router-dom';
import FileUploader from '../components/FileUploader';
import SmartAdvisor from '../components/SmartAdvisor';
import toast from 'react-hot-toast';
import './AcademicPlans.css';

// Import new plan images
import dataScienceNew from '../assets/plans/data-science-new.png';
import infoSecurityNew from '../assets/plans/info-security-new.png';
import digitalForensicsNew from '../assets/plans/digital-forensics-new.png';
import vrTreeNew from '../assets/plans/vr_tree_new.png';
import aiRoboticsNew from '../assets/plans/ai-robotics-new.png';
import plansHero from '../assets/heros/academic_plans_hero.png';

// Import old (tree) plan images
import dataScienceTree from '../assets/plans/data_science_tree.jpg';
import vrTree from '../assets/plans/vr_tree.jpg';
import cyberTree from '../assets/plans/cyber_tree.jpg';
import aiRoboticsTree from '../assets/plans/ai_robotics_tree.jpg';
import forensicsTree from '../assets/plans/forensics_tree.jpg';

// Import Prince Abdullah Bin Ghazi Faculty tree plan images
import cisTreeOld from '../assets/plans/cis_tree_old.png';
import cgaTreeOld from '../assets/plans/cga_tree_old.png';
import csTreeOld from '../assets/plans/cs_tree_old.png';
import seTreeOld from '../assets/plans/se_tree_old.jpg';

// Expected Career Opportunities Data (Official BAU Faculty of AI Directory)
const CAREER_DATA = [
    {
        majorId: 'cybersecurity',
        nameAr: 'أمن المعلومات والفضاء الإلكتروني',
        nameEn: 'Info & Cybersecurity',
        icon: '🛡️',
        color: '#ef4444',
        accentBg: 'rgba(239, 68, 68, 0.08)',
        badgeText: '17 مهنة متوقعة',
        careers: [
            { ar: 'أخصائي أمن معلومات', en: 'Information Security Specialist' },
            { ar: 'محلل أمني', en: 'Security Analyst' },
            { ar: 'خبير اختبار الاختراق والقرصنة الأخلاقية', en: 'Penetration Tester / Ethical Hacker' },
            { ar: 'مدير أمن المعلومات التنفيذي', en: 'Chief Information Security Officer (CISO)' },
            { ar: 'مهندس أمن الشبكات', en: 'Network Security Engineer' },
            { ar: 'خبير استجابة للحوادث السيبرانية', en: 'Incident Responder' },
            { ar: 'مستشار أمني وقانوني سيبراني', en: 'Security & Legal Consultant' },
            { ar: 'خبير حماية البيانات والخصوصية', en: 'Data Protection Officer' },
            { ar: 'باحث في الثغرات البرمجية والأمنية', en: 'Vulnerability Researcher' },
            { ar: 'أخصائي ومدير أمن الحوسبة السحابية', en: 'Cloud Security Manager' },
            { ar: 'خبير أمن إنترنت الأشياء', en: 'IoT Security Expert' },
            { ar: 'محقق جرائم إلكترونية', en: 'Cybercrime Investigator' },
            { ar: 'مدير مخاطر الأمن السيبراني', en: 'Cybersecurity Risk Manager' },
            { ar: 'مسؤول ومطور سياسات الأمن السيبراني', en: 'Cybersecurity Policy Developer' },
            { ar: 'مدرب على نظم الأمن وبرمجياتها', en: 'Cybersecurity Systems Trainer' },
            { ar: 'مبرمجة ومطور نظم تشغيل وشبكات آمنة', en: 'Secure OS & Network Administrator' },
            { ar: 'أخصائي دعم فني لأمن الشبكات والمعلومات', en: 'Network Security Support Specialist' },
        ]
    },
    {
        majorId: 'datascience',
        nameAr: 'علم البيانات',
        nameEn: 'Data Science & AI',
        icon: '📊',
        color: '#3b82f6',
        accentBg: 'rgba(59, 130, 246, 0.08)',
        badgeText: '16 مهنة متوقعة',
        careers: [
            { ar: 'عالم بيانات', en: 'Data Scientist' },
            { ar: 'مهندس بيانات', en: 'Data Engineer' },
            { ar: 'محلل بيانات ورسوم بيانية', en: 'Data Analyst' },
            { ar: 'خبير تعلم الآلة', en: 'Machine Learning Engineer' },
            { ar: 'أخصائي ذكاء اصطناعي', en: 'AI Specialist' },
            { ar: 'مدير ومسؤول قواعد البيانات', en: 'Database Administrator' },
            { ar: 'محلل ذكاء الأعمال والبيانات', en: 'Business Intelligence Analyst' },
            { ar: 'خبير معالجة اللغة الطبيعية', en: 'NLP Specialist' },
            { ar: 'باحث في علوم البيانات', en: 'Data Researcher' },
            { ar: 'أخصائي تصور وتمثيل البيانات', en: 'Data Visualization Specialist' },
            { ar: 'مهندس نظم البيانات الضخمة', en: 'Big Data Engineer' },
            { ar: 'مستشار تحليلات وتنبؤات', en: 'Analytics Consultant' },
            { ar: 'محلل بيانات وسائل التواصل الاجتماعي والإعلام', en: 'Social Media & Media Data Analyst' },
            { ar: 'محلل التحليلات الرياضية والسياسية', en: 'Sports & Political Analytics Specialist' },
            { ar: 'مطور خوارزميات ونماذج التنبؤ', en: 'Predictive Algorithm Developer' },
            { ar: 'مهندس عرض واستخراج المعرفة من البيانات', en: 'Knowledge Extraction Engineer' },
        ]
    },
    {
        majorId: 'digitalforensics',
        nameAr: 'التحقيقات الجنائية الرقمية',
        nameEn: 'Digital Forensics',
        icon: '🔍',
        color: '#f59e0b',
        accentBg: 'rgba(245, 158, 11, 0.08)',
        badgeText: '15 مهنة متوقعة',
        careers: [
            { ar: 'محقق أدلة رقمية', en: 'Digital Forensics Investigator' },
            { ar: 'خبير استعادة البيانات المفقودة', en: 'Data Recovery Specialist' },
            { ar: 'محقق جرائم إلكترونية', en: 'Cybercrime Investigator' },
            { ar: 'أخصائي ومحلل أدلة جنائية رقمية', en: 'Digital Evidence Analyst' },
            { ar: 'خبير تحليل الهواتف والأجهزة المحمولة', en: 'Mobile Forensics Expert' },
            { ar: 'محقق في جرائم الاحتيال الإلكتروني', en: 'Fraud Examiner' },
            { ar: 'مختبر وفني أدلة رقمية جنائية', en: 'Forensic Lab Technician' },
            { ar: 'مستشار أمني وقانوني جنائي رقمي', en: 'Forensic Legal & Security Consultant' },
            { ar: 'محقق في جرائم الابتزاز الإلكتروني', en: 'Cyber Extortion Investigator' },
            { ar: 'خبير ومحلل حركة الشبكات الجنائي', en: 'Network Forensics Analyst' },
            { ar: 'محقق في جرائم التشفير والعملات الرقمية', en: 'Cryptocurrency Investigator' },
            { ar: 'خبير التحقيق في انتهاكات الخصوصية', en: 'Privacy Violation Investigator' },
            { ar: 'أخصائي ومحلل مركز عمليات الأمن (SOC)', en: 'SOC Analyst & Specialist' },
            { ar: 'أخصائي التشريعات السيبرانية والحوسبة الجنائية', en: 'Cyber Legislation Specialist' },
            { ar: 'محقق جنائي رقمي للشركات والجهات الأمنية', en: 'Corporate & Law Enforcement Forensic Analyst' },
        ]
    },
    {
        majorId: 'vr',
        nameAr: 'الواقع الافتراضي والمعزز',
        nameEn: 'Virtual Reality & AR',
        icon: '🥽',
        color: '#a855f7',
        accentBg: 'rgba(168, 85, 247, 0.08)',
        badgeText: '6 مهن متوقعة',
        careers: [
            { ar: 'مصمم رسومات الحاسوب الثابتة والمتحركة والتفاعلية 2D/3D', en: 'Interactive & Motion Computer Graphics Designer' },
            { ar: 'مصمم أنظمة ومحاكاة الواقع الافتراضي والتفاعل', en: 'VR Systems & Simulation Designer' },
            { ar: 'مصمم ومطور ألعاب إلكترونية ذكية', en: 'Smart Game Developer & Designer' },
            { ar: 'مطور تطبيقات وبرامج واقع افتراضي أو معزز', en: 'VR/AR Software Developer' },
            { ar: 'مطور تطبيقات القصص المصورة ثلاثية الأبعاد', en: '3D Storyboarding & Interactive Media Developer' },
            { ar: 'مصمم واجهات التفاعل بين الإنسان والحاسوب', en: 'Human-Computer Interaction (HCI) Designer' },
        ]
    },
    {
        majorId: 'airobotics',
        nameAr: 'الذكاء الاصطناعي والروبوتات',
        nameEn: 'AI & Robotics',
        icon: '🤖',
        color: '#10b981',
        accentBg: 'rgba(16, 185, 129, 0.08)',
        badgeText: '9 مهن متوقعة',
        careers: [
            { ar: 'أخصائي مهندس روبوتات وأتمتة', en: 'Robotics & Automation Engineer' },
            { ar: 'مطور برامج وأنظمة ذكية', en: 'AI Software Developer' },
            { ar: 'مطور نظم مضمنة وأجهزة ذكية', en: 'Smart Embedded Systems Developer' },
            { ar: 'محلل برامج وأنظمة ذكية', en: 'Smart Systems Analyst' },
            { ar: 'باحث في علوم الذكاء الاصطناعي والروبوتات وتطبيقاتها', en: 'AI & Robotics Researcher' },
            { ar: 'مهندس رؤية حاسوبية ومعالجة الصور', en: 'Computer Vision Engineer' },
            { ar: 'مبرمجة ألعاب فيديو ذكية', en: 'Smart Video Game Programmer' },
            { ar: 'مهندس نظم السيارات والتنقل الذكي', en: 'Autonomous & Smart Mobility Engineer' },
            { ar: 'أخصائي إدراك الأصوات والوجوه والرؤية السلوكية', en: 'Voice, Face & Perception Specialist' },
        ]
    },
    {
        majorId: 'cga',
        nameAr: 'الرسم الحاسوبي والرسوم المتحركة',
        nameEn: 'Computer Graphics & Animation',
        icon: '🎨',
        color: '#ec4899',
        accentBg: 'rgba(236, 72, 153, 0.08)',
        badgeText: '6 مهن متوقعة',
        careers: [
            { ar: 'مصمم رسومات ثنائية وثلاثية الأبعاد (2D/3D Graphic Designer)', en: '2D/3D Graphic Designer' },
            { ar: 'مبرمجة ومصمم رسوم متحركة (Animator)', en: '2D/3D Animator' },
            { ar: 'مطور خدع بصرية ومؤثرات رقمية (VFX Artist)', en: 'VFX & Effects Artist' },
            { ar: 'مصمم ومطور ألعاب إلكترونية (Game Designer)', en: 'Game Designer & Developer' },
            { ar: 'مصمم واجهات وتجربة المستخدم (UI/UX Designer)', en: 'UI/UX Designer' },
            { ar: 'مخرج ومصمم وسائط تفاعلية (Interactive Media Producer)', en: 'Interactive Media Producer' },
        ]
    },
    {
        majorId: 'cs',
        nameAr: 'علم الحاسوب',
        nameEn: 'Computer Science',
        icon: '💻',
        color: '#6366f1',
        accentBg: 'rgba(99, 102, 241, 0.08)',
        badgeText: '6 مهن متوقعة',
        careers: [
            { ar: 'مطور برمجيات وتطبيقات (Software Developer)', en: 'Software & Mobile Developer' },
            { ar: 'مهندس حاسوب ونظم تشغيل (Systems Engineer)', en: 'Systems & OS Engineer' },
            { ar: 'مبرمجة ومطور مواقع ويب (Web Developer)', en: 'Web Developer' },
            { ar: 'مهندس ذكاء اصطناعي وخوارزميات (AI & Algorithm Engineer)', en: 'AI & Algorithm Engineer' },
            { ar: 'مدير ومدقق قواعد بيانات وشبكات (Database Administrator)', en: 'Database Administrator' },
            { ar: 'باحث في علوم وتطبيقات الحاسوب (Computer Science Researcher)', en: 'Computer Science Researcher' },
        ]
    },
    {
        majorId: 'cis',
        nameAr: 'نظم المعلومات الحاسوبية',
        nameEn: 'Computer Information Systems (CIS)',
        icon: '🗄️',
        color: '#06b6d4',
        accentBg: 'rgba(6, 182, 212, 0.08)',
        badgeText: '6 مهن متوقعة',
        careers: [
            { ar: 'محلل ونظم معلومات ومشاريع (Systems Analyst)', en: 'Systems Analyst' },
            { ar: 'مدير ومسؤول قواعد البيانات (Database Administrator)', en: 'Database Administrator' },
            { ar: 'محلل ونظم أعمال وتطوير تقني (Business Systems Analyst)', en: 'Business Systems Analyst' },
            { ar: 'أخصائي وتكامل نظم معلومات المؤسسات (ERP Specialist)', en: 'ERP & Enterprise Systems Specialist' },
            { ar: 'مدير مشاريع تكنولوجيا المعلومات (IT Project Manager)', en: 'IT Project Manager' },
            { ar: 'مستشار حلول تكنولوجيا المعلومات (IT Solutions Consultant)', en: 'IT Solutions Consultant' },
        ]
    },
    {
        majorId: 'se',
        nameAr: 'هندسة البرمجيات',
        nameEn: 'Software Engineering',
        icon: '⚙️',
        color: '#8b5cf6',
        accentBg: 'rgba(139, 92, 246, 0.08)',
        badgeText: '6 مهن متوقعة',
        careers: [
            { ar: 'مهندس برمجيات (Software Engineer)', en: 'Software Engineer' },
            { ar: 'مهندس جودة واختبار برمجيات (Software QA Engineer)', en: 'Software QA & Testing Engineer' },
            { ar: 'مهندس معمارية برمجيات (Software Architect)', en: 'Software Architect' },
            { ar: 'مهندس وتطوير البنية التحتية (DevOps Engineer)', en: 'DevOps Engineer' },
            { ar: 'مطور تطبيقات شامله وحاسوب (Full Stack Developer)', en: 'Full Stack Developer' },
            { ar: 'مدير دورة حياة البرمجيات ومشاريع Agile (Software Project Manager)', en: 'Software Project Manager' },
        ]
    }
];

// Official Descriptions & Graduate Specifications Data
const MAJOR_DESCRIPTIONS = [
    {
        id: 'cybersecurity',
        nameAr: 'أمن المعلومات والفضاء الإلكتروني',
        nameEn: 'Info Security & Cybersecurity',
        icon: '🛡️',
        color: '#ef4444',
        accentBg: 'rgba(239, 68, 68, 0.08)',
        overviewAr: `يهدف التخصص إلى إعداد القوى البشرية والكوادر المتخصصة في مجال أمن المعلومات والفضاء الإلكتروني لحماية الأنظمة والمعلومات من المخاطر والتهديدات الداخلية والخارجية. يُزود الطالب بالمعارف النظرية والعملية المناسبة لحل المشكلات، اتخاذ القرارات، وتطبيق أفضل سياسات الأمن السيبراني وإدارة الشبكات وقواعد البيانات بأمان.`,
        overviewEn: `Prepares human cadres specialized in Information Security and Cybersecurity to handle internal and external cyber threats. Equips students with theoretical and practical tools to protect networks, systems, cloud environments, and enact security policies.`,
        graduateSpecs: [
            'القدرة على تقييم وأمن الشبكات وأنظمة التشغيل والشبكات السحابية',
            'إعداد وتطبيق أفضل سياسات وممارسات الأمن السيبراني للمؤسسات',
            'فهم وتطبيق أدوات التشفير والدعم الفني للحماية من الجرائم الإلكترونية',
            'إتقان إدارة مخاطر أمن المعلومات واتخاذ القرارات الاستراتيجية'
        ],
        masterInfoAr: `درجة الماجستير في أمن المعلومات والفضاء الإلكتروني: يهدف برنامج الماجستير لتنمية المهارات المتخصصة والبحثية تحت إشراف هيئة تدريسية، وإعداد الطلبة للقيام بأدوار ومهام أمنية متقدمة في القطاع الحكومي والخاص وتطوير سياسات الحوكمة والتحقيقات الجنائية لمواجهة التزايد الهائل في الهجمات الإلكترونية.`,
        masterInfoEn: `Master's Degree: Focuses on specialized research and advanced security roles in government and enterprise sectors.`
    },
    {
        id: 'datascience',
        nameAr: 'علم البيانات',
        nameEn: 'Data Science & AI',
        icon: '📊',
        color: '#3b82f6',
        accentBg: 'rgba(59, 130, 246, 0.08)',
        overviewAr: `علم البيانات هو تخصص حديث يجمع بين علوم الحاسوب، الرياضيات، الإحصاء والذكاء الاصطناعي لاستخراج المعرفة والقيمة من البيانات الضخمة (Big Data). يُمكن الخريجين من بناء خوارزميات التنبؤ والنماذج الإحصائية وتنقيب البيانات في شتى القطاعات مثل الأعمال، المالية، الصحة، الإعلام، والتحليلات الرياضية والسياسية لمساعدة متخذي القرار في التنبؤ بالمستقبل وتسهيل تدفق المعلومات.`,
        overviewEn: `Combines computer science, math, statistics, and AI to extract valuable insights from Big Data. Enables graduates to build predictive algorithms, machine learning models, and data pipelines across business, health, and finance.`,
        graduateSpecs: [
            'إتقان أساسيات تنقيب البيانات الضخمة (Data Mining) والتعلم الآلي',
            'تطوير وبناء خوارزميات إحصائية للتنبؤ وتفسير البيانات',
            'عرض وتمثيل البيانات (Data Visualization) بطرق سهلة ومفيدة لأصحاب القرار',
            'تحليل بيانات منصات التواصل الاجتماعي والتحليلات الرياضية والسياسية'
        ]
    },
    {
        id: 'digitalforensics',
        nameAr: 'التحقيقات الجنائية الرقمية',
        nameEn: 'Digital Forensics',
        icon: '🔍',
        color: '#f59e0b',
        accentBg: 'rgba(245, 158, 11, 0.08)',
        overviewAr: `يركز برنامج التحقيقات الجنائية الرقمية على كشف وتحليل الجرائم الإلكترونية من خلال جمع الأدلة الرقمية وفحصها بطرق علمية وقانونية محكمة. يشمل الخطة دراسة التشريعات السيبرانية، الحوسبة الجنائية، استعادة البيانات، فحص الأجهزة المحمولة والشبكات، التحقيق في الاحتيال، الابتزاز، والعملات الرقمية المشفرة مع الالتزام التام بالمعايير القانونية والأخلاقية لتزويد الجهات الأمنية والقضائية بالخبراء.`,
        overviewEn: `Focuses on investigating digital crimes and gathering electronic evidence legally and scientifically. Covers mobile forensics, network forensics, data recovery, fraud, extortion, and cryptocurrency crime investigations.`,
        graduateSpecs: [
            'جمع وتحليل الأدلة الرقمية من الأجهزة المحمولة والشبكات والحواسيب',
            'استعادة البيانات المفقودة والممسوحة وتتبع المعاملات المشفرة',
            'فهم وتطبيق التشريعات السيبرانية المعمول بها أمام الجهات القضائية',
            'التحقيق في الجرائم الإلكترونية مثل الاحتيال والابتزاز وانتهاك الخصوصية'
        ]
    },
    {
        id: 'vr',
        nameAr: 'الواقع الافتراضي والمعزز',
        nameEn: 'Virtual Reality & AR',
        icon: '🥽',
        color: '#a855f7',
        accentBg: 'rgba(168, 85, 247, 0.08)',
        overviewAr: `تخصص هندسة وبرمجة الواقع الافتراضي والمعزز يهدف لإنشاء بيئات تفاعلية ثلاثية الأبعاد ومحاكاة ذكية للمحتوى والروبوتات والرسومات التفاعلية. يتعلم الطالب كيفية تصميم وإنشاء أنظمة الواقع الافتراضي، تفاعل الإنسان مع الحاسوب (HCI)، بناء الألعاب الإلكترونية الذكية وتطبيقات القصص المصورة ثلاثية الأبعاد، لخدمة كافة القطاعات التعليمية والترفيهية والطبية والصناعية.`,
        overviewEn: `Creates interactive 3D virtual environments and AI simulations. Focuses on VR/AR app development, smart 3D game design, and Human-Computer Interaction (HCI) technology.`,
        graduateSpecs: [
            'تصميم وإنشاء رسومات الحاسوب 2D/3D الثابتة والمتحركة والتفاعلية',
            'تطوير وبرمجة محاكاة الواقع الافتراضي والمعزز (VR/AR)',
            'تصميم وبناء الألعاب الإلكترونية الذكية ثلاثية الأبعاد',
            'إتقان مبادئ تفاعل الإنسان مع الحاسوب (Human-Computer Interaction)'
        ]
    },
    {
        id: 'airobotics',
        nameAr: 'الذكاء الاصطناعي والروبوتات',
        nameEn: 'Artificial Intelligence & Robotics',
        icon: '🤖',
        color: '#10b981',
        accentBg: 'rgba(16, 185, 129, 0.08)',
        overviewAr: `يجمع هذا التخصص بين امتيازات علمين فريدين: علم الذكاء الاصطناعي وعلم الروبوتات لبناء آلات وأنظمة ذكية قادرة على إدراك الأصوات والوجوه ومعالجة اللغات والرؤية الحاسوبية والتجاوب مع المحيط. يهدف لخلق جيل قادر على قيادة التكنولوجيا الحديثة والأتمتة في قطاعات تصنيع السيارات الذكية، النقل، الدفاع، والرعاية الصحية محلياً ودولياً.`,
        overviewEn: `Blends AI with Robotics to build intelligent autonomous machines. Covers machine vision, voice & speech recognition, NLP, smart embedded systems, and robotics programming.`,
        graduateSpecs: [
            'فهم عميق للمفاهيم الرياضية والإحصائية لبناء نماذج التعلم الآلي',
            'مهارات برمجية متقدمة بلغات (Python, C++, Java) لتطوير الأنظمة الذكية',
            'برمجة وتطوير الأنظمة الكهروميكانيكية والروبوتات والأتمتة',
            'الالتزام بأخلاقيات الذكاء الاصطناعي والقدرة على العمل في فرق متكاملة'
        ]
    }
];

const AcademicPlans = () => {
    const { t, language } = useLanguage();
    const isAr = language === 'ar';
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [planType, setPlanType] = useState('new'); // 'new' or 'old'
    const [showUploader, setShowUploader] = useState(false);

    // Career section state
    const [activeCareerTab, setActiveCareerTab] = useState('all');
    const [careerSearchQuery, setCareerSearchQuery] = useState('');

    // State for Faculty Filter: 'all', 'ai', 'abdullah_ghazi'
    const [selectedFaculty, setSelectedFaculty] = useState('all');

    // Old Plans (Includes AI Faculty Old Trees + Prince Abdullah Bin Ghazi Faculty Trees)
    const oldPlans = [
        // Faculty of AI
        {
            id: 'old-1',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'علم البيانات',
            nameEn: 'Data Science',
            icon: '📊',
            image: dataScienceTree,
            pdf: 'https://www.bau.edu.jo/bauar/Colleges/AI/media/101.pdf',
            color: '#2196F3'
        },
        {
            id: 'old-2',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'الواقع الافتراضي',
            nameEn: 'Virtual Reality',
            icon: '🥽',
            image: vrTree,
            pdf: 'https://www.bau.edu.jo/bauar/Colleges/AI/media/VR%20Arabic.pdf',
            color: '#9C27B0'
        },
        {
            id: 'old-3',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'أمن المعلومات والفضاء الإلكتروني',
            nameEn: 'Cyber Security',
            icon: '🔒',
            image: cyberTree,
            pdf: 'https://www.bau.edu.jo/bauar/Colleges/AI/media/100.pdf',
            color: '#F44336'
        },
        {
            id: 'old-4',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'الذكاء الاصطناعي والروبوتات',
            nameEn: 'AI & Robotics',
            icon: '🤖',
            image: aiRoboticsTree,
            pdf: 'https://www.bau.edu.jo/bauar/colleges/ai/media/105.pdf',
            color: '#4CAF50'
        },
        {
            id: 'old-5',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'التحقيقات الجنائية الرقمية',
            nameEn: 'Digital Forensics',
            icon: '🔍',
            image: forensicsTree,
            pdf: 'https://www.bau.edu.jo/bauar/Colleges/AI/media/102.pdf',
            color: '#FF9800'
        },
        // Prince Abdullah Bin Ghazi Faculty of IT (Tree Plans)
        {
            id: 'abg-old-1',
            faculty: 'abdullah_ghazi',
            facultyAr: 'كلية الأمير عبد الله بن غازي لتكنولوجيا المعلومات',
            facultyEn: 'Prince Abdullah Bin Ghazi Faculty of IT',
            name: 'الرسم الحاسوبي والرسوم المتحركة',
            nameEn: 'Computer Graphics & Animation',
            icon: '🎨',
            image: cgaTreeOld,
            color: '#ec4899',
            status: 'active'
        },
        {
            id: 'abg-old-2',
            faculty: 'abdullah_ghazi',
            facultyAr: 'كلية الأمير عبد الله بن غازي لتكنولوجيا المعلومات',
            facultyEn: 'Prince Abdullah Bin Ghazi Faculty of IT',
            name: 'علم الحاسوب',
            nameEn: 'Computer Science',
            icon: '💻',
            image: csTreeOld,
            color: '#6366f1',
            status: 'active'
        },
        {
            id: 'abg-old-3',
            faculty: 'abdullah_ghazi',
            facultyAr: 'كلية الأمير عبد الله بن غازي لتكنولوجيا المعلومات',
            facultyEn: 'Prince Abdullah Bin Ghazi Faculty of IT',
            name: 'نظم المعلومات الحاسوبية',
            nameEn: 'Computer Information Systems (CIS)',
            icon: '🗄️',
            image: cisTreeOld,
            color: '#06b6d4',
            status: 'active'
        },
        {
            id: 'abg-old-4',
            faculty: 'abdullah_ghazi',
            facultyAr: 'كلية الأمير عبد الله بن غازي لتكنولوجيا المعلومات',
            facultyEn: 'Prince Abdullah Bin Ghazi Faculty of IT',
            name: 'هندسة البرمجيات',
            nameEn: 'Software Engineering',
            icon: '⚙️',
            image: seTreeOld,
            color: '#8b5cf6',
            status: 'active'
        }
    ];

    // New Plans (2025/2026 - Faculty of AI)
    const newPlans = [
        {
            id: 'new-1',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'أمن المعلومات والفضاء الإلكتروني',
            nameEn: 'Info & Cyber Security',
            icon: '🛡️',
            image: infoSecurityNew,
            color: '#F44336',
            status: 'active'
        },
        {
            id: 'new-2',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'علم البيانات',
            nameEn: 'Data Science',
            icon: '📊',
            image: dataScienceNew,
            color: '#2196F3',
            status: 'active'
        },
        {
            id: 'new-3',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'التحقيقات الجنائية الرقمية',
            nameEn: 'Digital Forensics',
            icon: '🔍',
            image: digitalForensicsNew,
            color: '#FF9800',
            status: 'active'
        },
        {
            id: 'new-4',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'الذكاء الاصطناعي والروبوتات',
            nameEn: 'AI & Robotics',
            icon: '🤖',
            image: aiRoboticsNew,
            color: '#4CAF50',
            status: 'active'
        },
        {
            id: 'new-5',
            faculty: 'ai',
            facultyAr: 'كلية الذكاء الاصطناعي',
            facultyEn: 'Faculty of AI',
            name: 'الواقع الافتراضي',
            nameEn: 'Virtual Reality',
            icon: '🥽',
            image: vrTreeNew,
            color: '#9C27B0',
            status: 'active'
        }
    ];

    const currentPlans = (planType === 'new' ? newPlans : oldPlans).filter(p => {
        if (selectedFaculty === 'all') return true;
        return p.faculty === selectedFaculty;
    });

    const openModal = (plan) => {
        if (plan.status === 'construction') {
            toast(isAr ? 'نعمل حالياً على تحديث هذه الخطة 🛠️' : 'We are currently updating this plan 🛠️', {
                icon: '🚧',
                style: {
                    borderRadius: '10px',
                    background: '#333',
                    color: '#fff',
                },
            });
            return;
        }
        setSelectedPlan(plan);
    };

    const closeModal = () => {
        setSelectedPlan(null);
    };

    // Filter career data based on active tab & search query
    const filteredCareerData = CAREER_DATA.filter(major => {
        if (activeCareerTab !== 'all' && major.majorId !== activeCareerTab) return false;
        return true;
    }).map(major => {
        if (!careerSearchQuery.trim()) return major;
        const q = careerSearchQuery.toLowerCase().trim();
        const matchedCareers = major.careers.filter(c =>
            c.ar.toLowerCase().includes(q) || c.en.toLowerCase().includes(q)
        );
        return { ...major, careers: matchedCareers };
    }).filter(major => major.careers.length > 0);

    const totalCareersCount = CAREER_DATA.reduce((acc, curr) => acc + curr.careers.length, 0);

    return (
        <div className="academic-plans-page">
            {/* Hero Section */}
            <section className="plans-hero" style={{ backgroundImage: `url(${plansHero})` }}>
                <div className="hero-overlay"></div>
                <div className="hero-content">
                    <h1 className="hero-title">{t('plans.hero.title')}</h1>
                    <p className="hero-subtitle">{t('plans.hero.subtitle')}</p>
                </div>
            </section>

            {/* Plan Type Toggle */}
            <div className="plan-type-toggle">
                <button
                    className={`toggle-btn ${planType === 'new' ? 'active' : ''}`}
                    onClick={() => setPlanType('new')}
                >
                    <span className="toggle-icon">✨</span>
                    {isAr ? 'الخطط الجديدة (2025)' : 'New Plans (2025)'}
                </button>
                <button
                    className={`toggle-btn ${planType === 'old' ? 'active' : ''}`}
                    onClick={() => setPlanType('old')}
                >
                    <span className="toggle-icon">📜</span>
                    {isAr ? 'الخطط القديمة' : 'Old Plans'}
                </button>
            </div>

            {/* Plans Grid */}
            <div className="plans-container">
                <div className="section-header">
                    <h2>
                        {planType === 'new' ? (isAr ? 'الخطط الشجرية الحديثة' : 'Modern Tree Plans') : (isAr ? 'الخطط الدراسية السابقة' : 'Previous Academic Plans')}
                    </h2>
                    <p>
                        {planType === 'new'
                            ? (isAr ? 'هذه هي الخطط المعتمدة للعام الدراسي 2025/2026' : 'These are the approved plans for the 2025/2026 academic year')
                            : (isAr ? 'هذه الخطط للطلاب المقبولين في الأعوام السابقة' : 'These plans are for students admitted in previous years')}
                    </p>
                </div>

                {/* Faculty Selector Tabs */}
                <div className="faculty-filter-tabs">
                    <button
                        className={`faculty-tab-btn ${selectedFaculty === 'all' ? 'active' : ''}`}
                        onClick={() => setSelectedFaculty('all')}
                    >
                        🌟 {isAr ? 'جميع الكليات' : 'All Faculties'}
                    </button>
                    <button
                        className={`faculty-tab-btn ${selectedFaculty === 'ai' ? 'active' : ''}`}
                        onClick={() => setSelectedFaculty('ai')}
                    >
                        🤖 {isAr ? 'كلية الذكاء الاصطناعي' : 'Faculty of AI'}
                    </button>
                    <button
                        className={`faculty-tab-btn ${selectedFaculty === 'abdullah_ghazi' ? 'active' : ''}`}
                        onClick={() => setSelectedFaculty('abdullah_ghazi')}
                    >
                        💻 {isAr ? 'كلية الأمير عبد الله بن غازي لتكنولوجيا المعلومات' : 'Prince Abdullah Bin Ghazi Faculty of IT'}
                    </button>
                </div>

                <div className="plans-grid">
                    {currentPlans.map(plan => (
                        <div
                            key={plan.id}
                            className={`plan-card glass-card ${plan.status === 'construction' ? 'construction' : ''}`}
                            onClick={() => openModal(plan)}
                            style={{ '--plan-color': plan.color }}
                        >
                            {plan.facultyAr && (
                                <span className="plan-faculty-tag" style={{ background: plan.color + '22', color: plan.color, border: `1px solid ${plan.color}55` }}>
                                    {isAr ? plan.facultyAr : plan.facultyEn}
                                </span>
                            )}
                            <div className="plan-icon">{plan.icon}</div>
                            <h3 className="plan-name">{isAr ? plan.name : plan.nameEn}</h3>
                            <p className="plan-name-en">{isAr ? plan.nameEn : plan.name}</p>

                            <div className={`plan-badge ${plan.status === 'construction' ? 'badge-warning' : 'badge-new'}`}>
                                {plan.status === 'construction'
                                    ? (isAr ? 'قيد التحديث' : 'Updating')
                                    : (planType === 'new' ? (isAr ? 'جديد 2025' : 'New 2025') : (isAr ? 'قديم' : 'Old'))}
                            </div>

                            <button className="view-btn">
                                {plan.status === 'construction'
                                    ? (isAr ? 'قريباً' : 'Coming Soon')
                                    : plan.driveFolder
                                        ? (isAr ? '📂 عرض مجلد Google Drive' : '📂 Open Drive Folder')
                                        : (t('plans.btn.view') + ' 👁️')}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* CAREERS & JOB OPPORTUNITIES SECTION (المهن والفرص الوظيفية المتوقعة) */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            <section className="careers-section">
                <div className="careers-container">
                    <div className="careers-header">
                        <div className="careers-badge">
                            <span>💼</span> {isAr ? 'دليل سوق العمل والوظائف' : 'Career & Job Guide'}
                        </div>
                        <h2 className="careers-title">
                            {isAr ? 'المهن والفرص الوظيفية المتوقعة خريجي كل تخصص' : 'Expected Careers & Job Roles by Major'}
                        </h2>
                        <p className="careers-subtitle">
                            {isAr
                                ? 'استكشف آفاق المستقبل الوظيفي والمسميات المهنية المستهدفة لكل تخصص من تخصصات كلية الذكاء الاصطناعي'
                                : 'Explore future career prospects and targeted job titles for each AI Faculty specialization'}
                        </p>
                    </div>

                    {/* Filter Controls: Tabs & Search */}
                    <div className="careers-controls">
                        <div className="careers-tabs">
                            <button
                                className={`career-tab-btn ${activeCareerTab === 'all' ? 'active' : ''}`}
                                onClick={() => setActiveCareerTab('all')}
                            >
                                🌟 {isAr ? 'جميع التخصصات' : 'All Majors'} ({totalCareersCount})
                            </button>
                            {CAREER_DATA.map(m => (
                                <button
                                    key={m.majorId}
                                    className={`career-tab-btn ${activeCareerTab === m.majorId ? 'active' : ''}`}
                                    onClick={() => setActiveCareerTab(m.majorId)}
                                    style={{ '--tab-color': m.color }}
                                >
                                    <span>{m.icon}</span> {isAr ? m.nameAr : m.nameEn}
                                </button>
                            ))}
                        </div>

                        {/* Search Input */}
                        <div className="career-search-box">
                            <span className="search-icon">🔍</span>
                            <input
                                type="text"
                                value={careerSearchQuery}
                                onChange={(e) => setCareerSearchQuery(e.target.value)}
                                placeholder={isAr ? 'ابحث عن مسمى وظيفي (مثال: محقق، أخصائي، Analyst)...' : 'Search for job title (e.g. Analyst, Engineer)...'}
                            />
                            {careerSearchQuery && (
                                <button className="clear-search-btn" onClick={() => setCareerSearchQuery('')}>✕</button>
                            )}
                        </div>
                    </div>

                    {/* Careers Display Grid */}
                    {filteredCareerData.length === 0 ? (
                        <div className="careers-empty-state glass-card">
                            <span className="empty-icon">🔎</span>
                            <h3>{isAr ? 'لم نثمل على نتائج مطابقة لبحثك' : 'No matching careers found'}</h3>
                            <p>{isAr ? 'جرب البحث بمفردات أخرى أو اختر تخصصاً آخر من القائمة' : 'Try searching with different terms or select another major'}</p>
                            <button className="reset-search-btn" onClick={() => { setCareerSearchQuery(''); setActiveCareerTab('all'); }}>
                                🔄 {isAr ? 'إعادة إظهار الكل' : 'Reset View'}
                            </button>
                        </div>
                    ) : (
                        <div className="careers-majors-wrapper">
                            {filteredCareerData.map(major => (
                                <div key={major.majorId} className="major-careers-card glass-card" style={{ '--major-color': major.color }}>
                                    <div className="major-card-header" style={{ background: major.accentBg }}>
                                        <div className="major-title-group">
                                            <span className="major-header-icon">{major.icon}</span>
                                            <div>
                                                <h3 className="major-header-title">{isAr ? major.nameAr : major.nameEn}</h3>
                                                <span className="major-header-sub">{isAr ? major.nameEn : major.nameAr}</span>
                                            </div>
                                        </div>
                                        <span className="major-count-badge" style={{ background: major.color }}>
                                            {major.careers.length} {isAr ? 'مهنة' : 'careers'}
                                        </span>
                                    </div>

                                    <div className="careers-grid">
                                        {major.careers.map((career, idx) => (
                                            <div key={idx} className="career-item-pill">
                                                <span className="career-number" style={{ color: major.color }}>
                                                    #{String(idx + 1).padStart(2, '0')}
                                                </span>
                                                <div className="career-titles">
                                                    <strong className="career-ar">{career.ar}</strong>
                                                    <span className="career-en">{career.en}</span>
                                                </div>
                                                <span className="career-arrow">✦</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Official Major Overviews & Graduate Specifications */}
            <section className="major-descriptions-section" style={{ marginTop: '4rem' }}>
                <div className="careers-container">
                    <div className="careers-header">
                        <div className="careers-badge" style={{ background: 'rgba(99, 102, 241, 0.12)', borderColor: 'rgba(99, 102, 241, 0.3)', color: '#818cf8' }}>
                            <span>📚</span> {isAr ? 'دليل ومواصفات خريجي الكلية' : 'Faculty Majors & Graduate Specs'}
                        </div>
                        <h2 className="careers-title">
                            {isAr ? 'وصف التخصصات ومواصفات خريجي الكلية' : 'Official Major Overviews & Graduate Specs'}
                        </h2>
                        <p className="careers-subtitle">
                            {isAr
                                ? 'تعرف على الرؤية الأكاديمية والمهارات المكتسبة وخطة ماجستير أمن المعلومات بكلية الذكاء الاصطناعي بجامعة البلقاء التطبيقية'
                                : 'Discover academic visions, graduate specifications, and master programs at BAU AI Faculty'}
                        </p>
                    </div>

                    <div className="major-descriptions-grid">
                        {MAJOR_DESCRIPTIONS.map((item) => (
                            <div key={item.id} className="major-desc-card glass-card" style={{ '--card-color': item.color }}>
                                <div className="major-desc-header" style={{ background: item.accentBg }}>
                                    <span className="major-desc-icon">{item.icon}</span>
                                    <div>
                                        <h3 className="major-desc-title">{isAr ? item.nameAr : item.nameEn}</h3>
                                        <span className="major-desc-sub">{isAr ? item.nameEn : item.nameAr}</span>
                                    </div>
                                </div>
                                <div className="major-desc-body">
                                    <p className="overview-text">{isAr ? item.overviewAr : item.overviewEn}</p>

                                    <div className="specs-box">
                                        <h4>📋 {isAr ? 'مواصفات وتأهيل الخريجين المكتسبة:' : 'Graduate Specifications & Skills:'}</h4>
                                        <ul>
                                            {item.graduateSpecs.map((spec, sIdx) => (
                                                <li key={sIdx}><span>✅</span> {spec}</li>
                                            ))}
                                        </ul>
                                    </div>

                                    {item.masterInfoAr && (
                                        <div className="master-info-box">
                                            <h4>🎓 {isAr ? 'درجة الماجستير في التخصص:' : 'Master\'s Degree Overview:'}</h4>
                                            <p>{isAr ? item.masterInfoAr : item.masterInfoEn}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Smart Advisor Section */}
            <SmartAdvisor />

            {/* Info Banner */}
            <div className="info-banner glass-card" style={{ marginTop: '5rem' }}>
                <h3>{t('plans.note.title')}</h3>
                <p style={{ whiteSpace: 'pre-line' }}>{t('plans.note.text')}</p>
            </div>

            {/* Modal */}
            {selectedPlan && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-btn" onClick={closeModal}>✕</button>
                        <div className="modal-header">
                            <span className="modal-icon">{selectedPlan.icon}</span>
                            <h2>{isAr ? selectedPlan.name : selectedPlan.nameEn}</h2>
                            <p>{isAr ? selectedPlan.nameEn : selectedPlan.name}</p>
                            <span className="modal-badge">
                                {planType === 'new' ? '2025 ✨' : 'Old version 📜'}
                            </span>
                        </div>
                        <div className="modal-body">
                            {selectedPlan.image && (
                                <img
                                    src={selectedPlan.image}
                                    alt={selectedPlan.name}
                                    className="plan-image"
                                />
                            )}
                            <div className="image-actions">
                                {selectedPlan.driveFolder && (
                                    <a
                                        href={selectedPlan.driveFolder}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="drive-folder-btn"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        📂 {isAr ? 'فتح مجلد الخطة الشجرية على Google Drive' : 'Open Tree Plan Folder on Google Drive'} ↗
                                    </a>
                                )}
                                {selectedPlan.image && (
                                    <>
                                        <a
                                            href={selectedPlan.image}
                                            download={`${selectedPlan.nameEn}-${planType}.png`}
                                            className="download-btn"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {t('plans.btn.download')}
                                        </a>
                                        <a
                                            href={selectedPlan.image}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="open-btn"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {t('plans.btn.open')}
                                        </a>
                                    </>
                                )}
                                {selectedPlan.pdf && (
                                    <a
                                        href={selectedPlan.pdf}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="pdf-btn"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        📄 {isAr ? 'الخطة التفصيلية (PDF)' : 'Detailed Plan (PDF)'}
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* File Uploader */}
            {showUploader && <FileUploader onClose={() => setShowUploader(false)} />}
        </div>
    );
};

export default AcademicPlans;
