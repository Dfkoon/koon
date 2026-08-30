import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import './ServicesSection.css';

const ServicesSection = () => {
    const { t, language } = useLanguage();
    const services = [
        {
            id: 1,
            title: t('service.1.title'),
            desc: t('service.1.desc'),
            icon: '📚',
            status: 'active',
            link: '/materials'
        },
        {
            id: 2,
            title: t('service.2.title'),
            desc: t('service.2.desc'),
            icon: '❓',
            status: 'active'
        },
        {
            id: 3,
            title: t('service.3.title'),
            desc: t('service.3.desc'),
            icon: '🎥',
            status: 'active'
        },
        {
            id: 4,
            title: t('service.4.title'),
            desc: t('service.4.desc'),
            icon: '📈',
            status: 'active'
        },
        {
            id: 6,
            title: t('service.6.title'),
            desc: t('service.6.desc'),
            icon: '🔄',
            status: 'active',
            link: '/exchange'
        }
    ];

    const allServices = [...services, ...services];

    return (
        <section id="services" className="services-section">
            <div className="section-header fade-in">
                <h2 className="section-title">{t('services.title')}</h2>
                <p className="section-subtitle">{t('services.subtitle')}</p>
            </div>

            <div className="services-container">
                <div className="services-track">
                    {allServices.map((service, index) => (
                        <div key={`${service.id}-${index}`} className="service-card glass-card">
                            <div className="service-icon">{service.icon}</div>
                            <h3 className="service-title">{service.title}</h3>
                            <p className="service-desc">{service.desc}</p>
                            {service.status === 'active' ? (
                                service.link ? (
                                    <Link to={service.link} className="service-btn active">{t('services.goto')}</Link>
                                ) : (
                                    <button className="service-btn active">{t('services.goto')}</button>
                                )
                            ) : (
                                <button className="service-btn pending" disabled>{t('services.soon')}</button>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default ServicesSection;
