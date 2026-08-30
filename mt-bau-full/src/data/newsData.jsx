import React from 'react';

export const announcements = [
    {
        id: 'chain-magazine',
        type: 'new',
        date: '2025/9/2',
        icon: 'fas fa-lightbulb',
        color: '#1565c0',
        title: {
            ar: 'كلية الذكاء الاصطناعي تطلق مجل "CHAIN"',
            en: 'AI Faculty Launches "CHAIN" Magazine'
        },
        content: {
            ar: (
                <>
                    <p>
                        أطلقت كلية الذكاء الاصطناعي في جامعة البلقاء التطبيقية مجل <strong>"CHAIN"</strong>، في مكتب رئيس الجامعة الأستاذ الدكتور أحمد فري العجلوني...
                    </p>
                    <div className="img-placeholder" style={{ background: '#e3f2fd', color: '#1565c0', padding: '2rem', borderRadius: '12px', textAlign: 'center', margin: '1rem 0' }}>
                        <i className="fas fa-image" style={{ fontSize: '3rem', display: 'block', marginBottom: '10px' }}></i>
                        صور إطلاق المجل
                    </div>
                </>
            ),
            en: (
                <>
                    <p>
                        The Faculty of Artificial Intelligence at Al-Balqa Applied University launched <strong>"CHAIN"</strong> magazine, in the office of the University President, Prof. Dr. Ahmed Fakhri Al-Ajlouni...
                    </p>
                    <div className="img-placeholder" style={{ background: '#e3f2fd', color: '#1565c0', padding: '2rem', borderRadius: '12px', textAlign: 'center', margin: '1rem 0' }}>
                        <i className="fas fa-image" style={{ fontSize: '3rem', display: 'block', marginBottom: '10px' }}></i>
                        Magazine Launch Image
                    </div>
                </>
            )
        }
    },
    {
        id: 'fees-installments',
        type: 'important',
        date: '2025/9/2',
        icon: 'fas fa-info-circle',
        color: '#d41111',
        title: {
            ar: 'شروط وإجراءات تقسيط الرسوم الدراسي',
            en: 'Tuition Fees Installment Conditions'
        },
        content: {
            ar: (
                <>
                    <p style={{ color: '#d41111', fontWeight: 'bold' }}>📌 التفاصيل:</p>
                    <ul className="custom-list">
                        <li>التقسيط متاح للرسوم فوق <strong>250 دينار</strong>.</li>
                        <li>دفع أولى <strong>50%</strong> من رسوم الساعات.</li>
                    </ul>
                    <p style={{ color: '#388e3c', marginTop: '0.5rem' }}>📢 القرار ساري للفصل القادم.</p>
                </>
            ),
            en: (
                <>
                    <p style={{ color: '#d41111', fontWeight: 'bold' }}>📌 Details:</p>
                    <ul className="custom-list">
                        <li>Installment available for fees above <strong>250 JOD</strong>.</li>
                        <li>First payment <strong>50%</strong> of credit hour fees.</li>
                    </ul>
                    <p style={{ color: '#388e3c', marginTop: '0.5rem' }}>📢 Effective next semester.</p>
                </>
            )
        }
    },
    {
        id: 'drug-test',
        type: 'new',
        date: '2025/08/27',
        icon: 'fas fa-file-medical',
        color: '#1976d2',
        title: {
            ar: 'مقترح: فحص المدرات كشرط للقبول',
            en: 'Proposal: Drug Test as Admission Requirement'
        },
        content: {
            ar: (
                <p>
                    مطالب نيابي باعتماد فحص المدرات كشرط أساسي للقبول في الجامعات الحكومي والاص لضمان بيئ تعليمي آمن.
                </p>
            ),
            en: (
                <p>
                    Parliamentary proposal to adopt drug testing as a mandatory condition for admission to public and private universities to ensure a safe educational environment.
                </p>
            )
        }
    },
    {
        id: 'smoking-survey',
        type: 'general',
        date: '2025/9/10',
        icon: 'fas fa-leaf',
        color: '#388e3c',
        title: {
            ar: 'استبان تقييم بيئ التدين',
            en: 'Smoking Environment Assessment Survey'
        },
        content: {
            ar: (
                <>
                    <p>شاركونا في استبان تقييم بيئ التدين في الجامعات الأردني.</p>
                    <a href="https://forms.gle/Krwf1ZraCwtF1eXP6" target="_blank" rel="noopener noreferrer">
                        <i className="fas fa-link"></i> رابط الاستبان
                    </a>
                </>
            ),
            en: (
                <>
                    <p>Participate in the survey to assess the smoking environment in Jordanian universities.</p>
                    <a href="https://forms.gle/Krwf1ZraCwtF1eXP6" target="_blank" rel="noopener noreferrer">
                        <i className="fas fa-link"></i> Survey Link
                    </a>
                </>
            )
        }
    },
    {
        id: 'makeup-exam',
        type: 'important',
        date: '2026/9/8',
        icon: 'fas fa-calendar-check',
        color: '#d41111',
        title: {
            ar: 'امتحان الاكمال المئوي',
            en: 'Makeup Exam (100%)'
        },
        content: {
            ar: (
                <p>
                    بدء استقبال طلبات التقدم لامتحان الاكمال المئوي للريجين الراسبين بماد واحد، من <strong>10-9</strong> ولغاي <strong>14-9</strong>.
                </p>
            ),
            en: (
                <p>
                    Receiving applications for the 100% makeup exam for graduates failing a single subject, from <strong>10-9</strong> to <strong>14-9</strong>.
                </p>
            )
        }
    },
    {
        id: 'semiconductors-comp',
        type: 'new',
        date: '2025/9/1',
        icon: 'fas fa-microchip',
        color: '#388e3c',
        title: {
            ar: 'مسابق تصميم أشباه الموصلات JoSDC’25',
            en: 'Semiconductor Design Competition JoSDC’25'
        },
        content: {
            ar: (
                <>
                    <p>دعو للمشارك في النس الثالث من المسابق الوطني بجامع الحسين التقني.</p>
                    <p><strong>آخر موعد للتسجيل: 14 أيلول 2025</strong>.</p>
                </>
            ),
            en: (
                <>
                    <p>Invitation to participate in the 3rd edition of the National Competition at Al-Hussein Technical University.</p>
                    <p><strong>Registration deadline: September 14, 2025</strong>.</p>
                </>
            )
        }
    },
    {
        id: 'parallel-admission',
        type: 'admission',
        date: '2025/9/22',
        icon: 'fas fa-user-graduate',
        color: '#1e88e5',
        title: {
            ar: 'الدفع الأولى - الموازي',
            en: 'First Batch - Parallel Admission'
        },
        content: {
            ar: (
                <p>
                    آخر موعد لاستكمال إجراءات القبول ودفع الرسوم هو يوم الخميس <strong>25/9/2025</strong>. الإجراءات إلكتروني بالكامل.
                </p>
            ),
            en: (
                <p>
                    Last date to complete admission procedures and pay fees is Thursday <strong>25/9/2025</strong>. Procedures are fully electronic.
                </p>
            )
        }
    },
    {
        id: 'top-scientists',
        type: 'general',
        date: '2025/11/01',
        icon: 'fas fa-award',
        color: '#1976d2',
        title: {
            ar: 'إنجاز عالمي: 17 باحثاً في قائم ستانفورد',
            en: 'Global Achievement: 17 Researchers in Stanford List'
        },
        content: {
            ar: (
                <p>
                    جامعة البلقاء التطبيقية تفر باختيار 17 من أعضاء هيئتها التدريسية ضمن قائمة أفضل 2% من الباحثين الأكثر تأثيراً في العالم.
                </p>
            ),
            en: (
                <p>
                    Al-Balqa Applied University is proud to have 17 faculty members selected in the top 2% of most influential researchers globally.
                </p>
            )
        }
    },
    {
        id: 'registration-dates',
        type: 'important',
        date: '2025/9/22',
        icon: 'fas fa-calendar-alt',
        color: '#1976d2',
        title: {
            ar: 'مواعيد التسجيل للفصل الأول 2025/2026',
            en: 'Registration Dates for First Semester 2025/2026'
        },
        content: {
            ar: (
                <p>
                    تم الإعلان عن مواعيد السحب والإضاف. يرجى مراجع بوابة الطالب الإلكتروني لمعرف الموعد المخصص لك.
                </p>
            ),
            en: (
                <p>
                    Drop and add dates have been announced. Please check the student portal for your specific time slot.
                </p>
            )
        }
    },
    {
        id: 'digital-forensics-plan',
        type: 'important',
        date: '2025/9/22',
        icon: 'fas fa-exclamation-triangle',
        color: '#d32f2f',
        title: {
            ar: 'تغيير جذري في ط التحقيقات الجنائي الرقمي',
            en: 'Major Changes in Digital Forensics Plan'
        },
        content: {
            ar: (
                <p>
                    نود لفت انتباه طلبة "دفعة 2007-2025" لوجود تغييرات جذرية على متطلبات الجامعة الإجبارية والاختياري في الخطة الجديدة.
                </p>
            ),
            en: (
                <p>
                    We draw the attention of students (Batch 2007-2025) to radical changes in university mandatory and elective requirements in the new plan.
                </p>
            )
        }
    },
    {
        id: 'jordan-independence-day',
        type: 'national',
        date: '2026/5/25',
        icon: 'fas fa-flag',
        color: '#007a3d',
        title: {
            ar: 'عيد الاستقلال الأردني المجيد',
            en: 'Jordan\'s Glorious Independence Day'
        },
        content: {
            ar: (
                <>
                    <p style={{ fontSize: '1.1rem', lineHeight: '1.9' }}>
                        في هذه المناسب الوطني العظيم، نجدد عهدنا بالوطن الغالي.<br />
                        كل عام والأردن <strong>شامٌ بعز أبنائه</strong>، تحيا الأردن وطناً ومن تحته ثرى وفوقه سماء.
                    </p>
                    <p style={{ color: '#ce1126', fontWeight: 'bold', marginTop: '1rem' }}>
                        بكل حب وامتنان وانتماء — من مكانك الجامعي لكل أردني.
                    </p>
                </>
            ),
            en: (
                <>
                    <p style={{ fontSize: '1.1rem', lineHeight: '1.9' }}>
                        On this glorious national occasion, we renew our covenant with our beloved homeland.<br />
                        May Jordan stand forever tall with <strong>the pride of its people</strong>.
                    </p>
                    <p style={{ color: '#ce1126', fontWeight: 'bold', marginTop: '1rem' }}>
                        With all our love, gratitude, and belonging — from Makanak Al-Jami'i to every Jordanian.
                    </p>
                </>
            )
        }
    },
    {
        id: 'jordan-flag-day',
        type: 'national',
        date: '2026/4/16',
        icon: 'fas fa-star-and-crescent',
        color: '#ce1126',
        title: {
            ar: 'يوم العلم الأردني — 16 نيسان',
            en: 'Jordan Flag Day — April 16'
        },
        content: {
            ar: (
                <>
                    <p style={{ fontSize: '1.1rem', lineHeight: '1.9' }}>
                        رايتنا <strong style={{ color: '#000' }}>السوداء</strong> و<strong style={{ color: '#f5f5f5', textShadow: '0 0 3px #333' }}>البيضاء</strong> و<strong style={{ color: '#007a3d' }}>الضراء</strong> بقلبها <strong style={{ color: '#ce1126' }}>الأحمر</strong>...
                    </p>
                    <p>
                        علمٌ حملنا تحته أجمل الذكريات وأعمق الانتماء. في يوم العلم الأردني، نرفع رأسنا عالياً ونقول:
                    </p>
                    <p style={{ color: '#ce1126', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        هذا وطني وهذا علمي — من الجامعة لكل ركن أردني.
                    </p>
                </>
            ),
            en: (
                <>
                    <p style={{ fontSize: '1.1rem', lineHeight: '1.9' }}>
                        Our flag of <strong>black</strong>, <strong>white</strong>, and <strong style={{ color: '#007a3d' }}>green</strong> with its <strong style={{ color: '#ce1126' }}>red</strong> heart...
                    </p>
                    <p>
                        A flag under which we carry our most beautiful memories and deepest belonging.
                        On Jordan Flag Day, we raise our heads high and say:
                    </p>
                    <p style={{ color: '#ce1126', fontWeight: 'bold', fontSize: '1.1rem' }}>
                        This is my homeland, this is my flag — from campus to every Jordanian corner.
                    </p>
                </>
            )
        }
    }
];
