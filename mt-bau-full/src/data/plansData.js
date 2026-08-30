export const plansData = {
    old: {
        'forensics_old': {
            name: 'التحقيقات الجنائي الرقمي (الط القديم)',
            nameEn: 'Digital Forensics (Old Plan)',
            description: 'للأجيال 2003، 2004، 2005، 2006',
            semesters: [
                {
                    id: 1,
                    name: 'المواد الأساسي والجامعي',
                    courses: [
                        { id: 'math101', name: 'التفاضل والتكامل (1)', nameEn: 'Calculus 1', credits: 3 },
                        { id: 'arabic101', name: 'الاللغة العربية التطبيقية', nameEn: 'Applied Arabic', credits: 3 },
                        { id: 'eng101', name: 'الاللغة الإنجليزية التطبيقية (1)', nameEn: 'Applied English 1', credits: 3 },
                        { id: 'comp_skills', name: 'مهارات الحاسوب والتعليم الإلكتروني', nameEn: 'Computer Skills', credits: 3 },
                        { id: 'unix_intro', name: 'مقدمة إلى يونكس', nameEn: 'Intro to Unix', credits: 3 }
                    ]
                },
                {
                    id: 2,
                    name: 'المستوى الثاني (تأسيس)',
                    courses: [
                        { id: 'math102', name: 'التفاضل والتكامل (2)', nameEn: 'Calculus 2', credits: 3, prereq: 'math101' },
                        { id: 'eng102', name: 'الاللغة الإنجليزية التطبيقية (2)', nameEn: 'Applied English 2', credits: 3, prereq: 'eng101' },
                        { id: 'oop', name: 'البرمجة الموجهة للكائنات + مختبر', nameEn: 'OOP + Lab', credits: 4, prereq: 'comp_skills' },
                        { id: 'logic', name: 'تصميم المنطق الرقمي + مختبر', nameEn: 'Digital Logic + Lab', credits: 4 },
                        { id: 'sec_intro', name: 'مبادئ أمن المعلومات والفضاء الإلكتروني', nameEn: 'Security Principles', credits: 3 }
                    ]
                },
                {
                    id: 3,
                    name: 'المستوى الثالث (تخصص)',
                    courses: [
                        { id: 'ds', name: 'هياكل بيانات', nameEn: 'Data Structures', credits: 3, prereq: 'oop' },
                        { id: 'discrete', name: 'هياكل ورياضيات منفصل', nameEn: 'Discrete Mathematics', credits: 3, prereq: 'math102' },
                        { id: 'stats', name: 'الاحتمالات والإحصاء', nameEn: 'Probability & Statistics', credits: 3, prereq: 'math102' },
                        { id: 'networks1', name: 'شبكات الحاسوب (1) + مختبر', nameEn: 'Networking 1 + Lab', credits: 4, prereq: 'logic' },
                        { id: 'crypto', name: 'أساسيات التشفير', nameEn: 'Cryptography', credits: 3, prereq: 'sec_intro' }
                    ]
                },
                {
                    id: 4,
                    name: 'المستوى الرابع (تحقيقات متقدم)',
                    courses: [
                        { id: 'algorithms', name: 'تصميم وتحليل الوارزميات + مختبر', nameEn: 'Algorithms + Lab', credits: 4, prereq: 'ds' },
                        { id: 'db_design', name: 'تصميم وإدار قواعد البيانات + مختبر', nameEn: 'DB Design + Lab', credits: 4 },
                        { id: 'net_sec', name: 'أمن شبكات + مختبر', nameEn: 'Network Security + Lab', credits: 4, prereq: 'networks1' },
                        { id: 'net_forensics', name: 'تحقيقات جنائي في الشبكات', nameEn: 'Network Forensics', credits: 3, prereq: 'networks1' },
                        { id: 'os_forensics', name: 'التحقيقات الرقمي لأنظم التشغيل', nameEn: 'OS Forensics', credits: 3 }
                    ]
                },
                {
                    id: 5,
                    name: 'المستوى الخامس (تخصص دقيق)',
                    courses: [
                        { id: 'data_recovery', name: 'استعاد البيانات + مختبر', nameEn: 'Data Recovery + Lab', credits: 4, prereq: 'os_forensics' },
                        { id: 'db_forensics', name: 'التحقيقات الجنائي لقواعد البيانات', nameEn: 'Database Forensics', credits: 3, prereq: 'db_design' },
                        { id: 'mobile_forensics', name: 'تحقيقات الأجهزة النقالة', nameEn: 'Mobile Forensics', credits: 3, prereq: 'net_forensics' },
                        { id: 'privacy', name: 'صوصي وحماي بيانات', nameEn: 'Data Privacy', credits: 3, prereq: 'sec_intro' },
                        { id: 'justice', name: 'التحقيقات الجنائي الرقمي والعدال الجنائي', nameEn: 'DF & Criminal Justice', credits: 3 }
                    ]
                },
                {
                    id: 6,
                    name: 'الذكاء الاصطناعي والمواضيع العام',
                    courses: [
                        { id: 'ai_intro', name: 'مقدمة في الذكاء الاصطناعي', nameEn: 'AI Intro', credits: 3, prereq: 'stats' },
                        { id: 'ml', name: 'تعلم الآل + مختبر', nameEn: 'Machine Learning + Lab', credits: 4, prereq: 'ai_intro' },
                        { id: 'fraud_audit', name: 'تدقيق الاحتيال الرقمي', nameEn: 'Digital Fraud Audit', credits: 3, prereq: 'privacy' },
                        { id: 'unihost', name: 'التربية الوطنية والسلوك الجامعي', nameEn: 'National Education', credits: 3 }
                    ]
                }
            ]
        },
        'infosec_old': {
            name: 'امن المعلومات والفضاء الالكتروني (الط القديم)',
            nameEn: 'Information Security & Cyberspace (Old Plan)',
            description: 'للأجيال 2003، 2004، 2005، 2006',
            semesters: [
                {
                    id: 1,
                    name: 'الفصل الأول (تأسيس)',
                    courses: [
                        { id: 'math101', name: 'التفاضل والتكامل (1)', nameEn: 'Calculus 1', credits: 3 },
                        { id: 'comp_skills', name: 'مهارات الحاسوب والتعليم الإلكتروني', nameEn: 'Computer Skills', credits: 3 },
                        { id: 'arabic101', name: 'الاللغة العربية التطبيقية', nameEn: 'Applied Arabic', credits: 3 },
                        { id: 'eng101', name: 'الاللغة الإنجليزية التطبيقية (1)', nameEn: 'Applied English 1', credits: 3 },
                        { id: 'unix_intro', name: 'مقدمة إلى يونكس', nameEn: 'Intro to Unix', credits: 3 }
                    ]
                },
                {
                    id: 2,
                    name: 'الفصل الثاني',
                    courses: [
                        { id: 'math102', name: 'التفاضل والتكامل (2)', nameEn: 'Calculus 2', credits: 3, prereq: 'math101' },
                        { id: 'comp_skills2', name: 'مهارات الحاسوب (2)', nameEn: 'Computer Skills 2', credits: 3, prereq: 'comp_skills' },
                        { id: 'eng102', name: 'الاللغة الإنجليزية التطبيقية (2)', nameEn: 'Applied English 2', credits: 3, prereq: 'eng101' },
                        { id: 'oop', name: 'البرمجة الموجهة للكائنات + مختبر', nameEn: 'OOP + Lab', credits: 4, prereq: 'comp_skills' },
                        { id: 'sec_intro', name: 'مبادئ أمن المعلومات والفضاء الإلكتروني', nameEn: 'Security Principles', credits: 3 }
                    ]
                },
                {
                    id: 3,
                    name: 'الفصل الثالث',
                    courses: [
                        { id: 'discrete', name: 'هياكل ورياضيات منفصل', nameEn: 'Discrete Mathematics', credits: 3, prereq: 'math102' },
                        { id: 'stats', name: 'الاحتمالات والإحصاء', nameEn: 'Probability & Statistics', credits: 3, prereq: 'math102' },
                        { id: 'networks1', name: 'شبكات الحاسوب (1) + مختبر', nameEn: 'Networking 1 + Lab', credits: 4 },
                        { id: 'scripting', name: 'البرمجة النصي', nameEn: 'Scripting Programming', credits: 3, prereq: 'oop' },
                        { id: 'logic', name: 'تصميم المنطق الرقمي + مختبر', nameEn: 'Digital Logic + Lab', credits: 4 }
                    ]
                },
                {
                    id: 4,
                    name: 'الفصل الرابع',
                    courses: [
                        { id: 'ds', name: 'هياكل البيانات', nameEn: 'Data Structures', credits: 3, prereq: 'oop' },
                        { id: 'net_sec', name: 'أمن شبكات + مختبر', nameEn: 'Network Security + Lab', credits: 4, prereq: 'networks1' },
                        { id: 'num_theory', name: 'مقدمة في نظري الأعداد', nameEn: 'Intro to Number Theory', credits: 3 },
                        { id: 'mobile_dev', name: 'تطوير تطبيقات الهاتف المحمول + مختبر', nameEn: 'Mobile App Dev + Lab', credits: 4, prereq: 'scripting' },
                        { id: 'cyber_law', name: 'قانون وألاقيات الفضاء الإلكتروني', nameEn: 'Cyber Law & Ethics', credits: 3 }
                    ]
                },
                {
                    id: 5,
                    name: 'الفصل الخامس',
                    courses: [
                        { id: 'algorithms', name: 'تصميم وتحليل الوارزميات + مختبر', nameEn: 'Algorithms + Lab', credits: 4, prereq: 'ds' },
                        { id: 'crypto_basics', name: 'أساسيات التشفير + مختبر', nameEn: 'Cryptography Basics + Lab', credits: 4, prereq: 'num_theory' },
                        { id: 'secure_se', name: 'هندس البرمجيات الآمن', nameEn: 'Secure Software Engineering', credits: 3 },
                        { id: 'ai_intro', name: 'مقدمة في الذكاء الاصطناعي', nameEn: 'AI Intro', credits: 3 },
                        { id: 'risk_mgmt', name: 'إدار ماطر', nameEn: 'Risk Management', credits: 3 }
                    ]
                },
                {
                    id: 6,
                    name: 'الفصل السادس',
                    courses: [
                        { id: 'adv_crypto', name: 'التشفير المتقدم + مختبر', nameEn: 'Advanced Cryptography + Lab', credits: 4, prereq: 'crypto_basics' },
                        { id: 'os_eng', name: 'هندس نظم التشغيل + مختبر', nameEn: 'OS Engineering + Lab', credits: 4 },
                        { id: 'db_design', name: 'تصميم وإدار قواعد البيانات + مختبر', nameEn: 'DB Design + Lab', credits: 4 },
                        { id: 'ml', name: 'تعلم الآل + مختبر', nameEn: 'Machine Learning + Lab', credits: 4, prereq: 'ai_intro' },
                        { id: 'ai_prog', name: 'برمجة الذكاء الاصطناعي', nameEn: 'AI Programming', credits: 3 }
                    ]
                }
            ]
        },
        'datasci_old': {
            name: 'علم البيانات (الط القديم)',
            nameEn: 'Data Science (Old Plan)',
            description: 'للأجيال 2003، 2004، 2005، 2006',
            semesters: [
                {
                    id: 1,
                    name: 'الفصل الأول (تأسيس)',
                    courses: [
                        { id: 'math101', name: 'التفاضل والتكامل (1)', nameEn: 'Calculus 1', credits: 3 },
                        { id: 'comp_skills', name: 'مهارات الحاسوب والتعليم الإلكتروني', nameEn: 'Computer Skills', credits: 3 },
                        { id: 'arabic101', name: 'الاللغة العربية التطبيقية', nameEn: 'Applied Arabic', credits: 3 },
                        { id: 'eng101', name: 'الاللغة الإنجليزية التطبيقية (1)', nameEn: 'Applied English 1', credits: 3 },
                        { id: 'unix_intro', name: 'مقدمة إلى يونكس', nameEn: 'Intro to Unix', credits: 3 }
                    ]
                },
                {
                    id: 2,
                    name: 'الفصل الثاني',
                    courses: [
                        { id: 'math102', name: 'التفاضل والتكامل (2)', nameEn: 'Calculus 2', credits: 3, prereq: 'math101' },
                        { id: 'comp_skills2', name: 'مهارات الحاسوب (2)', nameEn: 'Computer Skills 2', credits: 3, prereq: 'comp_skills' },
                        { id: 'eng102', name: 'الاللغة الإنجليزية التطبيقية (2)', nameEn: 'Applied English 2', credits: 3, prereq: 'eng101' },
                        { id: 'oop', name: 'البرمجة الموجهة للكائنات + مختبر', nameEn: 'OOP + Lab', credits: 4, prereq: 'comp_skills' },
                        { id: 'comp_net_sec', name: 'أمن الحاسوب والشبكات', nameEn: 'Computer & Network Security', credits: 3 }
                    ]
                },
                {
                    id: 3,
                    name: 'الفصل الثالث',
                    courses: [
                        { id: 'discrete', name: 'هياكل ورياضيات منفصل', nameEn: 'Discrete Mathematics', credits: 3, prereq: 'math102' },
                        { id: 'stats', name: 'الاحتمالات والإحصاء', nameEn: 'Probability & Statistics', credits: 3, prereq: 'math102' },
                        { id: 'ds', name: 'هياكل البيانات + مختبر', nameEn: 'Data Structures + Lab', credits: 4, prereq: 'oop' },
                        { id: 'ds_fundamentals', name: 'أساسيات علم البيانات + مختبر', nameEn: 'DS Fundamentals + Lab', credits: 4 },
                        { id: 'ai_intro', name: 'مقدمة في الذكاء الاصطناعي', nameEn: 'AI Intro', credits: 3 }
                    ]
                },
                {
                    id: 4,
                    name: 'الفصل الرابع',
                    courses: [
                        { id: 'adv_ds', name: 'هياكل بيانات متقدم + مختبر', nameEn: 'Advanced Data Structures + Lab', credits: 4, prereq: 'ds' },
                        { id: 'algorithms', name: 'تصميم وتحليل الوارزميات + مختبر', nameEn: 'Algorithms + Lab', credits: 4, prereq: 'ds' },
                        { id: 'data_mining', name: 'تنقيب البيانات + مختبر', nameEn: 'Data Mining + Lab', credits: 4, prereq: 'stats' },
                        { id: 'data_analysis', name: 'تحليل البيانات', nameEn: 'Data Analysis', credits: 3, prereq: 'stats' },
                        { id: 'descriptive_analysis', name: 'مبادئ التحليل الوصفي', nameEn: 'Descriptive Analysis Principles', credits: 3 }
                    ]
                },
                {
                    id: 5,
                    name: 'الفصل الخامس',
                    courses: [
                        { id: 'ml', name: 'تعلم الآل + مختبر', nameEn: 'Machine Learning + Lab', credits: 4, prereq: 'ai_intro' },
                        { id: 'mobile_dev', name: 'تطوير تطبيقات الهاتف المحمول + مختبر', nameEn: 'Mobile App Dev + Lab', credits: 4 },
                        { id: 'scripting', name: 'البرمجة النصي', nameEn: 'Scripting Programming', credits: 3, prereq: 'oop' },
                        { id: 'ds_langs', name: 'لغات برمجة علم البيانات', nameEn: 'DS Programming Languages', credits: 3 }
                    ]
                },
                {
                    id: 6,
                    name: 'الفصل السادس',
                    courses: [
                        { id: 'cv', name: 'الرؤي بالحاسوب', nameEn: 'Computer Vision', credits: 3, prereq: 'ml' },
                        { id: 'sentiment_big_data', name: 'تحليل الميول للبيانات الضم', nameEn: 'Sentiment Analysis for Big Data', credits: 3 },
                        { id: 'db_design', name: 'تصميم وإدار قواعد البيانات (1) + مختبر', nameEn: 'DB Design 1 + Lab', credits: 4 },
                        { id: 'se_ds', name: 'هندس البرمجيات لعلم البيانات', nameEn: 'Software Engineering for DS', credits: 3 }
                    ]
                }
            ]
        },
        'ai_old': {
            name: 'الذكاء الاصطناعي والروبوتات (الط القديم)',
            nameEn: 'AI & Robotics (Old Plan)',
            description: 'للأجيال 2003، 2004، 2005، 2006',
            semesters: [
                {
                    id: 1,
                    name: 'المستوى الأول',
                    courses: [
                        { id: 'math101', name: 'التفاضل والتكامل (1)', nameEn: 'Calculus 1', credits: 3 },
                        { id: 'comp_skills', name: 'مهارات الحاسوب والتعليم الإلكتروني', nameEn: 'Computer Skills', credits: 3 },
                        { id: 'unix_intro', name: 'مقدمة إلى يونكس', nameEn: 'Intro to Unix', credits: 3 },
                        { id: 'arabic101', name: 'الاللغة العربية التطبيقية', nameEn: 'Applied Arabic', credits: 3 },
                        { id: 'eng101', name: 'الاللغة الإنجليزية التطبيقية (1)', nameEn: 'Applied English 1', credits: 3 }
                    ]
                },
                {
                    id: 2,
                    name: 'المستوى الثاني',
                    courses: [
                        { id: 'math102', name: 'التفاضل والتكامل (2)', nameEn: 'Calculus 2', credits: 3, prereq: 'math101' },
                        { id: 'linear_alg', name: 'الجبر الطي', nameEn: 'Linear Algebra', credits: 3, prereq: 'math102' },
                        { id: 'stats', name: 'الاحتمالات والإحصاء', nameEn: 'Probability & Statistics', credits: 3, prereq: 'math102' },
                        { id: 'comp_skills2', name: 'مهارات الحاسوب (2) لطلبة الكليات العلميةةة + مختبر', nameEn: 'Computer Skills 2 (Scientific) + Lab', credits: 3, prereq: 'comp_skills' },
                        { id: 'eng102', name: 'الاللغة الإنجليزية التطبيقية (2)', nameEn: 'Applied English 2', credits: 3, prereq: 'eng101' }
                    ]
                },
                {
                    id: 3,
                    name: 'المستوى الثالث',
                    courses: [
                        { id: 'ai_intro', name: 'مقدمة في الذكاء الاصطناعي', nameEn: 'Intro to AI', credits: 3 },
                        { id: 'oop', name: 'البرمجة الموجهة للكائنات + مختبر', nameEn: 'OOP + Lab', credits: 4, prereq: 'comp_skills2' },
                        { id: 'logic', name: 'تصميم المنطق الرقمي + مختبر', nameEn: 'Digital Logic + Lab', credits: 4 },
                        { id: 'comp_arch', name: 'معماري الحاسوب', nameEn: 'Computer Architecture', credits: 3, prereq: 'logic' }
                    ]
                },
                {
                    id: 4,
                    name: 'المستوى الرابع',
                    courses: [
                        { id: 'ai_prog', name: 'برمجة الذكاء الاصطناعي', nameEn: 'AI Programming', credits: 3, prereq: 'ai_intro' },
                        { id: 'ml', name: 'تعلم الآل', nameEn: 'Machine Learning', credits: 3, prereq: 'ai_intro' },
                        { id: 'ds', name: 'هياكل البيانات', nameEn: 'Data Structures', credits: 3, prereq: 'oop' },
                        { id: 'os_eng', name: 'نظم التشغيل الهندس', nameEn: 'Engineering OS', credits: 3, prereq: 'comp_arch' },
                        { id: 'embedded', name: 'الأنظم المضمن', nameEn: 'Embedded Systems', credits: 3, prereq: 'comp_arch' },
                        { id: 'robot_circuits', name: 'الدوائر والالكترونيات لطلبة الذكاء والروبوتات', nameEn: 'Circuits & Electronics', credits: 3 },
                        { id: 'robot_dynamics', name: 'أساسيات الحركي والديناميكا لطلبة الذكاء والروبوتات', nameEn: 'Statics & Dynamics', credits: 3 }
                    ]
                },
                {
                    id: 5,
                    name: 'المستوى الخامس (متقدم)',
                    courses: [
                        { id: 'se', name: 'هندس البرمجيات', nameEn: 'Software Engineering', credits: 3 },
                        { id: 'algorithms', name: 'تصميم وتحليل الوارزميات + مختبر', nameEn: 'Algorithms + Lab', credits: 4, prereq: 'ds' },
                        { id: 'robot_control', name: 'أنظم التحكم الآلي للروبوتات + مختبر', nameEn: 'Robot Control Systems + Lab', credits: 4 },
                        { id: 'knowledge_rep', name: 'تمثيل المعرف والاستدلال', nameEn: 'Knowledge Representation', credits: 3, prereq: 'ai_intro' },
                        { id: 'nlp', name: 'معالجة اللغة الطبيعية', nameEn: 'NLP', credits: 3, prereq: 'ai_intro' },
                        { id: 'mobile_robots', name: 'مقدمة الروبوتات المتنقل', nameEn: 'Intro to Mobile Robots', credits: 3 },
                        { id: 'deep_learning', name: 'التعلم العميق + مختبر', nameEn: 'Deep Learning + Lab', credits: 4, prereq: 'ml' },
                        { id: 'robot_vision', name: 'روبوت الرؤي', nameEn: 'Robot Vision', credits: 3 },
                        { id: 'robot_perception', name: 'روبوتات الإدراك + مختبر', nameEn: 'Robot Perception + Lab', credits: 4 },
                        { id: 'hri', name: 'تفاعل الإنسان والروبوت', nameEn: 'HRI', credits: 3 },
                        { id: 'text_mining', name: 'التنقيب الذكي عن النصوص', nameEn: 'Intelligent Text Mining', credits: 3, prereq: 'nlp' },
                        { id: 'social_net', name: 'تحليل الشبكات الاجتماعي', nameEn: 'Social Network Analysis', credits: 3 },
                        { id: 'speech_rec', name: 'التعرف على الكلام وفهمه', nameEn: 'Speech Recognition', credits: 3 },
                        { id: 'parallel_prog', name: 'البرمجة المتوازي للتطبيقات الذكي', nameEn: 'Parallel Programming for AI', credits: 3 }
                    ]
                }
            ]
        },
        'vr_old': {
            name: 'الواقع الافتراضي (الط القديم)',
            nameEn: 'Virtual Reality (Old Plan)',
            description: 'للأجيال 2003، 2004، 2005، 2006',
            semesters: [
                {
                    id: 1,
                    name: 'المستوى الأول (تأسيس)',
                    courses: [
                        { id: 'math101', name: 'التفاضل والتكامل (1)', nameEn: 'Calculus 1', credits: 3 },
                        { id: 'comp_skills', name: 'مهارات حاسوب وتعلم الكتروني', nameEn: 'Computer Skills', credits: 3 },
                        { id: 'eng101', name: 'الاللغة الإنجليزية التطبيقية (1)', nameEn: 'Applied English 1', credits: 3 },
                        { id: 'arabic101', name: 'الاللغة العربية التطبيقية', nameEn: 'Applied Arabic', credits: 3 },
                        { id: 'unix_intro', name: 'مقدمة إلى يونكس', nameEn: 'Intro to Unix', credits: 3 }
                    ]
                },
                {
                    id: 2,
                    name: 'المستوى الثاني',
                    courses: [
                        { id: 'math102', name: 'التفاضل والتكامل (2)', nameEn: 'Calculus 2', credits: 3, prereq: 'math101' },
                        { id: 'comp_skills2', name: 'مهارات حاسوب (2)', nameEn: 'Computer Skills 2', credits: 3, prereq: 'comp_skills' },
                        { id: 'intro_vr', name: 'مقدمة إلى الواقع الافتراضي', nameEn: 'Intro to VR', credits: 3 },
                        { id: 'math_graphics', name: 'الرياضيات للرسم بالحاسوب', nameEn: 'Math for Computer Graphics', credits: 3, prereq: 'math101' },
                        { id: 'eng102', name: 'الاللغة الإنجليزية التطبيقية (2)', nameEn: 'Applied English 2', credits: 3, prereq: 'eng101' }
                    ]
                },
                {
                    id: 3,
                    name: 'المستوى الثالث',
                    courses: [
                        { id: 'oop', name: 'البرمجة الموجهة للكائنات + مختبر', nameEn: 'OOP + Lab', credits: 4, prereq: 'comp_skills2' },
                        { id: 'discrete', name: 'هياكل رياضيات منفصل', nameEn: 'Discrete Mathematics', credits: 3, prereq: 'math102' },
                        { id: 'story_vr', name: 'تصميم القص المصور للواقع الافتراضي', nameEn: 'VR Storyboard Design', credits: 3, prereq: 'intro_vr' },
                        { id: 'hci', name: 'تفاعل الانسان والحاسوب', nameEn: 'HCI', credits: 3 },
                        { id: 'comp_draw', name: 'الرسم بالحاسوب', nameEn: 'Computer Drawing', credits: 3, prereq: 'math_graphics' }
                    ]
                },
                {
                    id: 4,
                    name: 'المستوى الرابع',
                    courses: [
                        { id: 'ds', name: 'هياكل بيانات ووارزميات + مختبر', nameEn: 'Data Structures + Lab', credits: 4, prereq: 'oop' },
                        { id: 'image_proc', name: 'معالج الصور', nameEn: 'Image Processing', credits: 3, prereq: 'math_graphics' },
                        { id: 'anim_2d', name: 'رسوم متحرك ثنائي الابعاد + مختبر', nameEn: '2D Animation + Lab', credits: 4, prereq: 'comp_draw' },
                        { id: 'multimedia', name: 'الوسائط المتعدد', nameEn: 'Multimedia', credits: 3 },
                        { id: 'ux_design', name: 'تصميم تجرب المستدم', nameEn: 'User Experience Design', credits: 3, prereq: 'hci' }
                    ]
                },
                {
                    id: 5,
                    name: 'المستوى الخامس (متقدم)',
                    courses: [
                        { id: 'ai_intro', name: 'مقدمة في الذكاء الاصطناعي', nameEn: 'Intro to AI', credits: 3 },
                        { id: 'modeling_3d', name: 'تصميم النماذج ثلاثي الابعاد', nameEn: '3D Modeling', credits: 3 },
                        { id: 'vr_systems', name: 'تصميم وبناء أنظم الواقع الافتراضي', nameEn: 'VR Systems Design', credits: 3, prereq: 'modeling_3d' },
                        { id: 'game_dev', name: 'تصميم وتطوير الألعاب الإلكترونية + مختبر', nameEn: 'Game Dev + Lab', credits: 4 },
                        { id: 'haptics', name: 'المقدمة الى تكنولوجيا الهابتك', nameEn: 'Intro to Haptics', credits: 3 }
                    ]
                }
            ]
        }
    },
    new: {
        'forensics_new': {
            name: 'التحقيقات الجنائي الرقمي (ط 2025)',
            nameEn: 'Digital Forensics (2025 Plan)',
            description: 'لجيل 2007 وما بعده',
            semesters: [
                {
                    id: 1,
                    name: 'قريباً...',
                    courses: []
                }
            ]
        },
        'infosec_new': {
            name: 'أمن الفضاء الإلكتروني (ط 2025)',
            nameEn: 'Cyber Security (2025 Plan)',
            description: 'لجيل 2007 وما بعده',
            semesters: [
                {
                    id: 1,
                    name: 'قريباً...',
                    courses: []
                }
            ]
        },
        'ds_new': {
            name: 'علم البيانات (ط 2025)',
            nameEn: 'Data Science (2025 Plan)',
            description: 'لجيل 2007 وما بعده',
            semesters: [
                {
                    id: 1,
                    name: 'الفصل الأول',
                    courses: [
                        { id: 'math101', name: 'تفاضل وتكامل (1)', nameEn: 'Calculus 1', credits: 3 },
                        { id: 'prog1', name: 'برمجة (1) جافا', nameEn: 'Programming 1 (Java)', credits: 3 }
                    ]
                }
            ]
        }
    }
};
