import React, { createContext, useContext, useState, useEffect } from 'react';

const BookmarksContext = createContext();

export const BookmarksProvider = ({ children }) => {
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      const saved = localStorage.getItem('koon_bookmarks_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('koon_bookmarks_v1', JSON.stringify(bookmarks));
    } catch (e) {
      console.error('Failed to save bookmarks:', e);
    }
  }, [bookmarks]);

  const addBookmark = (item) => {
    if (!bookmarks.some((b) => b.id === item.id)) {
      setBookmarks([...bookmarks, { ...item, savedAt: new Date().toISOString() }]);
    }
  };

  const removeBookmark = (id) => {
    setBookmarks(bookmarks.filter((b) => b.id !== id));
  };

  const isBookmarked = (id) => {
    return bookmarks.some((b) => b.id === id);
  };

  const toggleBookmark = (item) => {
    if (isBookmarked(item.id)) {
      removeBookmark(item.id);
    } else {
      addBookmark(item);
    }
  };

  return (
    <BookmarksContext.Provider
      value={{
        bookmarks,
        addBookmark,
        removeBookmark,
        isBookmarked,
        toggleBookmark
      }}
    >
      {children}
    </BookmarksContext.Provider>
  );
};

export const useBookmarks = () => useContext(BookmarksContext);
