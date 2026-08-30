import React, { useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './Legal.css';

const Legal = () => {
    const { language, t } = useLanguage();
    const isAr = language === 'ar';

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <div className="legal-page">
            <div className="legal-hero">
                <div className="legal-hero-overlay"></div>
                <div className="legal-hero-content">
                    <h1>{isAr ? 'حقوق الملكي والصوصي' : 'Copyright & Privacy'} ⚖️</h1>
                    <p>{isAr ? 'المعلومات القانوني وسياس استدام منصة مكانك الجامعي' : 'Legal information and usage policy for Makanak Al-Jami\'i'}</p>
                </div>
            </div>

            <div className="legal-container">
                <section className="legal-section glass-card animate-fade">
                    <h2>{isAr ? '🛡️ الملكي الفكري' : '🛡️ Intellectual Property'}</h2>
                    <p>
                        {isAr
                            ? 'جميع المحتويات المتوفر على منصة "مكانك الجامعي"، بما في ذلك التصاميم، النصوص، البرمجيات، الصور، والشعارات، هي ملكي حصري للمطور "حسين Koon" وفريق العمل، ومحمي بموجب قوانين الملكي الفكري المعمول بها.'
                            : 'All content available on the "Makanak Al-Jami\'i" platform, including designs, text, software, images, and logos, is the exclusive property of developer "Hussien Koon" and the team, protected under applicable intellectual property laws.'}
                    </p>
                    <p>
                        {isAr
                            ? 'يُمنع منعاً باتاً نس، إعاد إنتاج، أو توزيع أي جزء من الموقع لأغراض تجاري دون الحصول على إذن طي مسبق.'
                            : 'It is strictly prohibited to copy, reproduce, or distribute any part of the site for commercial purposes without prior written permission.'}
                    </p>
                </section>

                <section className="legal-section glass-card animate-fade" style={{ animationDelay: '0.1s' }}>
                    <h2>{isAr ? '📜 سياس الاستدام' : '📜 Terms of Use'}</h2>
                    <ul>
                        <li>
                            {isAr
                                ? 'يتم توفير المحتوى والمواد الدراسي للأغراض التعليمي فقط لمساعد الطلاب.'
                                : 'Content and study materials are provided for educational purposes only to assist students.'}
                        </li>
                        <li>
                            {isAr
                                ? 'الموقع غير مسؤول عن أي محتوى ارجي يتم الوصول إليه عبر الروابط الموجود.'
                                : 'The site is not responsible for any external content reached via existing links.'}
                        </li>
                        <li>
                            {isAr
                                ? 'يجب استدام "نشمي شات" لأغراض أكاديمي ومهذب، وأي إساء ستعرض المستدم للمساءل.'
                                : '"Nashmi Chat" must be used for academic and polite purposes; any abuse will hold the user accountable.'}
                        </li>
                    </ul>
                </section>

                <section className="legal-section glass-card animate-fade" style={{ animationDelay: '0.2s' }}>
                    <h2>{isAr ? '🔒 سياس الصوصي' : '🔒 Privacy Policy'}</h2>
                    <p>
                        {isAr
                            ? 'نحن نحترم صوصيتك. الموقع لا يقوم بجمع أي بيانات شصي حساس دون علمك. البيانات التي يتم جمعها في قسم "الاقتراحات" أو "تبادل المواد" تُستدم فقط لغرض التواصل وتحسين الدم.'
                            : 'We respect your privacy. The site does not collect sensitive personal data without your knowledge. Data collected in the "Suggestions" or "Material Exchange" sections is used only for communication and service improvement.'}
                    </p>
                </section>

                <section className="legal-section glass-card animate-fade" style={{ animationDelay: '0.3s' }}>
                    <h2>{isAr ? '⚖️ إلاء المسؤولي' : '⚖️ Disclaimer'}</h2>
                    <p>
                        {isAr
                            ? 'مشروع "مكانك الجامعي" هو مبادرة طلابي تطوعي غير رسمي، ولا يمثل جامعة البلقاء التطبيقية بشكل رسمي. جميع المعلومات الوارد هي اجتهادات شصي لمساعد الطلاب.'
                            : '"Makanak Al-Jami\'i" project is an unofficial voluntary student initiative and does not officially represent Al-Balqa Applied University. All information provided consists of personal efforts to help students.'}
                    </p>
                </section>
            </div>
        </div>
    );
};

export default Legal;
