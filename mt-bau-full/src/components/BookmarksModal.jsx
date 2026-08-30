import React from 'react';
import { useBookmarks } from '../contexts/BookmarksContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import './BookmarksModal.css';

const BookmarksModal = ({ isOpen, onClose }) => {
  const { bookmarks, removeBookmark } = useBookmarks();
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleNavigate = (link) => {
    onClose();
    if (link) navigate(link);
  };

  return (
    <div className="bookmarks-overlay" onClick={onClose}>
      <div className="bookmarks-container" onClick={(e) => e.stopPropagation()}>
        <div className="bookmarks-header">
          <h3>📌 {isAr ? 'زانتي الأكاديمي (المحفوظات)' : 'My Saved Locker'}</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="bookmarks-list">
          {bookmarks.length === 0 ? (
            <div className="no-bookmarks">
              <span className="locker-icon">🎒</span>
              <p>{isAr ? 'زانتك فارغ حالياً' : 'Your saved locker is currently empty'}</p>
              <small>
                {isAr
                  ? 'انقر على يار الحفظ (📌) بجانب أي مادة أو ملص للوصول إليه بسرع هنا'
                  : 'Click the save icon (📌) next to any material to access it here quickly'}
              </small>
            </div>
          ) : (
            bookmarks.map((item) => (
              <div key={item.id} className="bookmark-item">
                <span className="bookmark-icon">{item.icon || '📄'}</span>
                <div className="bookmark-info" onClick={() => handleNavigate(item.link)}>
                  <span className="bookmark-title">{item.title}</span>
                  <span className="bookmark-type">{item.type || (isAr ? 'مرجع دراسي' : 'Material')}</span>
                </div>
                <button
                  className="remove-bookmark-btn"
                  onClick={() => removeBookmark(item.id)}
                  title={isAr ? 'إزال من المحفوظات' : 'Remove'}
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default BookmarksModal;
