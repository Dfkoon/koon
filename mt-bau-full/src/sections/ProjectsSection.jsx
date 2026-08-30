import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './ProjectsSection.css';

const ProjectsSection = () => {
    const { t, language } = useLanguage();
    const projects = [
        {
            id: 1,
            title: t('project.1.title'),
            desc: t('project.1.desc'),
            link: 'https://t.me/introtoai1',
            icon: '📢',
            size: 'large',
            color: '#0088cc'
        },
        {
            id: 2,
            title: t('project.2.title'),
            desc: t('project.2.desc'),
            link: 'https://sites.google.com/view/df-koon',
            icon: '🌐',
            size: 'medium',
            color: '#d32f2f'
        },
        {
            id: 3,
            title: t('project.3.title'),
            desc: t('project.3.desc'),
            link: 'https://s.craft.me/UNUi9tzHMcJvpi',
            icon: '✍️',
            size: 'small',
            color: '#f1c40f'
        },
        {
            id: 4,
            title: t('project.4.title'),
            desc: t('project.4.desc'),
            link: 'https://dfkoon.github.io/DF/',
            icon: '🕵️‍♂️',
            size: 'wide',
            color: '#2c3e50'
        }
    ];

    return (
        <section id="projects" className="projects-section">
            <div className="section-header" data-aos="fade-up">
                <h2 className="section-title">{t('projects.title')}</h2>
                <p className="section-subtitle">{t('projects.subtitle')}</p>
            </div>

            <div className="bento-grid-container">
                <div className="projects-bento-grid">
                    {projects.map((project, index) => (
                        <div
                            key={project.id}
                            className={`bento-item ${project.size}-card glass-card`}
                            style={{ '--accent-color': project.color }}
                            data-aos="zoom-in"
                            data-aos-delay={index * 150}
                        >
                            <div className="bento-content">
                                <div className="bento-icon-wrapper">
                                    <span className="bento-icon">{project.icon}</span>
                                    <div className="icon-glow"></div>
                                </div>
                                <div className="bento-text">
                                    <h3 className="project-title">{project.title}</h3>
                                    <p className="project-desc">{project.desc}</p>
                                </div>
                                <a href={project.link} target="_blank" rel="noopener noreferrer" className="bento-link">
                                    <span className="link-text">{t('projects.visit')}</span>
                                    <span className="link-arrow">{language === 'ar' ? '←' : '→'}</span>
                                </a>
                            </div>
                            <div className="card-decoration"></div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default ProjectsSection;
