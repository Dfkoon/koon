import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useLanguage } from '../../contexts/LanguageContext';
import { listDeletedItems, restoreArchivedItem } from '../../services/deletedItemsService';

const formatDate = (timestamp, isAr) => {
    if (!timestamp) return '—';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString(isAr ? 'ar-JO' : 'en-US');
};

const AdminDeletedItems = () => {
    const { language } = useLanguage();
    const isAr = language === 'ar';
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadItems = async () => {
        setLoading(true);
        try {
            setItems(await listDeletedItems());
        } catch (error) {
            console.error('Failed to load deleted items:', error);
            toast.error(isAr ? 'فشل تحميل المحذوفات' : 'Failed to load deleted items');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadItems(); }, []);

    const handleRestore = async (item) => {
        if (!window.confirm(isAr ? 'هل تريد استعادة هذا العنصر؟' : 'Restore this item?')) return;
        try {
            await restoreArchivedItem(item);
            setItems(current => current.filter(entry => entry.id !== item.id));
            toast.success(isAr ? 'تمت الاستعادة بنجاح' : 'Item restored successfully');
        } catch (error) {
            console.error('Failed to restore deleted item:', error);
            toast.error(isAr ? 'فشلت الاستعادة' : 'Restore failed');
        }
    };

    return (
        <div className="admin-panel-section admin-fade-in" style={{ direction: 'rtl', textAlign: 'right' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                    <h3 className="admin-section-title">🗑️ {isAr ? 'المحذوفات والأرشيف' : 'Deleted Items & Archive'}</h3>
                    <p style={{ color: 'var(--text-muted)' }}>{isAr ? 'العناصر لا تحذف نهائيًا ويمكن للإدارة العامة استعادتها.' : 'Items are retained and can be restored by general administration.'}</p>
                </div>
                <button className="admin-action-btn" onClick={loadItems}>{isAr ? 'تحديث' : 'Refresh'}</button>
            </div>
            {loading ? <div className="admin-loading-container"><div className="admin-spinner" /></div> : items.length === 0 ? (
                <div className="admin-empty-state">{isAr ? 'لا توجد عناصر محذوفة.' : 'No deleted items.'}</div>
            ) : (
                <div className="archives-list">
                    {items.map(item => {
                        const data = item.itemData || {};
                        return (
                            <div key={item.id} className="archive-item-card">
                                <div className="archive-item-top">
                                    <div className="archive-item-info">
                                        <h4>{data.studentName || data.materialName || data.title || data.name || (isAr ? 'عنصر محذوف' : 'Deleted item')}</h4>
                                        <p className="archive-item-date">{item.originalCollection} · {formatDate(item.deletedAt, isAr)}</p>
                                        <p>{isAr ? 'بواسطة:' : 'By:'} {item.deletedByName || item.deletedBy || '—'}</p>
                                    </div>
                                    <button className="admin-action-btn approve" onClick={() => handleRestore(item)}>{isAr ? 'استعادة' : 'Restore'}</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AdminDeletedItems;
