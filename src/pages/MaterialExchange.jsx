import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import Refresh from '@mui/icons-material/Refresh';
import './MaterialExchange.css';

const MaterialExchange = () => {
    // Hardcoded to Arabic for now as per project language context
    const isAr = true;
    const [donations, setDonations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, pending, approved, reserved
    const [editingItem, setEditingItem] = useState(null); // { id, index, field, value }

    const fetchDonations = async () => {
        setLoading(true);
        try {
            const q = query(
                collection(db, 'materialDonations'),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            const donationsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setDonations(donationsData);
            console.log('Donations Data:', donationsData); // Debug: Check field names
        } catch (error) {
            console.error('Error fetching donations:', error);
            toast.error(isAr ? 'فشل في تحميل البيانات' : 'Failed to fetch donations');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateItem = async () => {
        if (!editingItem) return;
        const { id, index, field, value } = editingItem;

        try {
            const donation = donations.find(d => d.id === id);
            if (!donation) return;

            const donationRef = doc(db, 'materialDonations', id);
            let updateData = {};

            if (['materialName', 'description', 'notes'].includes(field)) {
                const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                const updatedMaterials = [...currentMaterials];

                // Ensure we have an object to update
                let itemToUpdate = updatedMaterials[index];
                if (typeof itemToUpdate !== 'object' || itemToUpdate === null) {
                    itemToUpdate = { name: itemToUpdate, status: donation.status || 'pending' };
                } else {
                    itemToUpdate = { ...itemToUpdate }; // Clone it
                }

                // Update the specific field
                if (field === 'materialName') itemToUpdate.name = value;
                if (field === 'description') itemToUpdate.description = value;
                if (field === 'notes') itemToUpdate.notes = value;

                updatedMaterials[index] = itemToUpdate;
                updateData.materials = updatedMaterials;
            } else {
                // For studentName, phoneNumber, email
                updateData[field] = value;
            }

            await updateDoc(donationRef, updateData);
            toast.success(isAr ? 'تم تحديث البيانات بنجاح' : 'Updated successfully');
            setEditingItem(null);
            fetchDonations();
        } catch (error) {
            console.error('Error updating item:', error);
            toast.error(isAr ? 'فشل في تحديث البيانات' : 'Failed to update data');
        }
    };

    useEffect(() => {
        fetchDonations();
    }, []);

    // Flatten donations into individual material items
    const getFlattenedMaterials = () => {
        return donations.flatMap(donation => {
            let materials = donation.materials;

            // Legacy support and safety check
            if (!Array.isArray(materials)) {
                if (donation.itemName) {
                    materials = [donation.itemName];
                } else {
                    materials = [];
                }
            }

            return materials.map((m, idx) => {
                // Normalize material object
                const materialObj = typeof m === 'object' && m !== null ? m : { name: m, status: donation.status };
                // Ensure status exists (legacy fallback)
                if (!materialObj.status) materialObj.status = donation.status;

                return {
                    ...donation,
                    materialItem: materialObj,
                    originalIndex: idx,
                    uniqueKey: `${donation.id}-${idx}`
                };
            });
        });
    };

    const flattenedMaterials = getFlattenedMaterials();

    const filteredMaterials = flattenedMaterials.filter(item => {
        if (filter === 'all') return item.materialItem.status !== 'reserved';
        return item.materialItem.status === filter;
    });

    const handleStatusUpdate = async (donationId, materialIndex, newStatus) => {
        try {
            const donation = donations.find(d => d.id === donationId);
            if (!donation) return;

            const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
            const updatedMaterials = [...currentMaterials];

            // Normalize and update specific item
            let itemToUpdate = updatedMaterials[materialIndex];
            if (typeof itemToUpdate !== 'object' || itemToUpdate === null) {
                itemToUpdate = { name: itemToUpdate, status: newStatus };
            } else {
                itemToUpdate = { ...itemToUpdate, status: newStatus };
            }
            updatedMaterials[materialIndex] = itemToUpdate;

            const donationRef = doc(db, 'materialDonations', donationId);

            // Allow parent status update if needed, but primarily we update the array
            // We can also update the parent status to 'partial' or 'updated' if we want, but for now let's keep it simple.
            // If all items are approved, maybe set parent to approved?
            // For now, just update the materials array.

            await updateDoc(donationRef, { materials: updatedMaterials });
            toast.success(isAr ? `تم تحديث الحالة إلى ${newStatus === 'approved' ? 'موافق' : newStatus === 'pending' ? 'قيد الانتظار' : newStatus}` : `Status updated`);
            fetchDonations();
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error(isAr ? 'فشل في تحديث الحالة' : 'Failed to update status');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm(isAr ? 'هل أنت متأكد من حذف هذا السجل بالكامل؟' : 'Are you sure you want to delete this entire record?')) {
            try {
                const donationRef = doc(db, 'materialDonations', id);
                await deleteDoc(donationRef);
                toast.success(isAr ? 'تم الحذف بنجاح' : 'Deleted successfully');
                fetchDonations();
            } catch (error) {
                console.error('Error deleting donation:', error);
                toast.error(isAr ? 'فشل في الحذف' : 'Failed to delete');
            }
        }
    };

    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const handleDeleteItem = (donationId, currentMaterials, itemIndex) => {
        setDeleteConfirm({
            donationId,
            materials: currentMaterials,
            itemIndex,
            type: 'single'
        });
    };

    const confirmDeleteAction = async () => {
        if (!deleteConfirm) return;

        const { donationId, materials: currentMaterials, itemIndex } = deleteConfirm;

        try {
            const updatedMaterials = [...currentMaterials];
            updatedMaterials.splice(itemIndex, 1);

            const donationRef = doc(db, 'materialDonations', donationId);

            if (updatedMaterials.length === 0) {
                await deleteDoc(donationRef);
                toast.success(isAr ? 'تم حذف الطلب بالكامل لعدم وجود مواد' : 'Request deleted (empty)');
            } else {
                await updateDoc(donationRef, { materials: updatedMaterials });
                toast.success(isAr ? 'تم حذف المادة' : 'Item deleted');
            }
            fetchDonations();
        } catch (error) {
            console.error('Error deleting item:', error);
            toast.error(isAr ? 'فشل في حذف المادة' : 'Failed to delete item');
        } finally {
            setDeleteConfirm(null);
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate();
        return date.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB') + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getWhatsappLink = (phone) => {
        if (!phone) return '#';
        let cleanPhone = phone.replace(/[^\d]/g, ''); // Remove non-digits
        if (cleanPhone.startsWith('0')) {
            cleanPhone = '962' + cleanPhone.substring(1); // Jordan format assumption
        }
        return `https://wa.me/${cleanPhone}`;
    };

    const stats = {
        total: flattenedMaterials.length,
        pending: flattenedMaterials.filter(m => m.materialItem.status === 'pending').length,
        approved: flattenedMaterials.filter(m => m.materialItem.status === 'approved').length,
        reserved: flattenedMaterials.filter(m => m.materialItem.status === 'reserved').length,
    };
    return (
        <div className="admin-donations-page">
            <div className="admin-header">
                <div className="header-title-row">
                    <div>
                        <h1>{isAr ? 'لوحة التحكم: تبرعات المواد الدراسية' : 'Admin: Material Donations Control'}</h1>
                        <p>{isAr ? 'إدارة ومراجعة طلبات التبرع بالمواد الدراسية' : 'Manage and review material donation requests'}</p>
                    </div>
                    <button
                        className={`refresh-btn ${loading ? 'spinning' : ''}`}
                        onClick={fetchDonations}
                        disabled={loading}
                        title={isAr ? 'تحديث البيانات' : 'Refresh Data'}
                    >
                        <Refresh />
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="stats-container">
                <div className="stat-card">
                    <div className="stat-icon">📊</div>
                    <div className="stat-info">
                        <h3>{stats.total}</h3>
                        <p>{isAr ? 'إجمالي المواد' : 'Total Items'}</p>
                    </div>
                </div>
                <div className="stat-card pending">
                    <div className="stat-icon">⏳</div>
                    <div className="stat-info">
                        <h3>{stats.pending}</h3>
                        <p>{isAr ? 'قيد الانتظار' : 'Pending'}</p>
                    </div>
                </div>
                <div className="stat-card approved">
                    <div className="stat-icon">✅</div>
                    <div className="stat-info">
                        <h3>{stats.approved}</h3>
                        <p>{isAr ? 'موافق عليها' : 'Approved'}</p>
                    </div>
                </div>
                <div className="stat-card reserved">
                    <div className="stat-icon">🔒</div>
                    <div className="stat-info">
                        <h3>{stats.reserved}</h3>
                        <p>{isAr ? 'محجوزة' : 'Reserved'}</p>
                    </div>
                </div>
            </div>

            {/* Filter Buttons */}
            <div className="filter-buttons">
                <button
                    className={filter === 'all' ? 'active' : ''}
                    onClick={() => setFilter('all')}
                >
                    {isAr ? 'الكل' : 'All'}
                </button>
                <button
                    className={filter === 'pending' ? 'active' : ''}
                    onClick={() => setFilter('pending')}
                >
                    {isAr ? 'قيد الانتظار' : 'Pending'}
                </button>
                <button
                    className={filter === 'approved' ? 'active' : ''}
                    onClick={() => setFilter('approved')}
                >
                    {isAr ? 'موافق عليها' : 'Approved'}
                </button>
                <button
                    className={filter === 'reserved' ? 'active' : ''}
                    onClick={() => setFilter('reserved')}
                >
                    {isAr ? 'محجوزة' : 'Reserved'}
                </button>
            </div>

            {/* Excel-style Table */}
            <div className="table-container">
                <table className="excel-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>{isAr ? 'اسم الطالب' : 'Student Name'}</th>
                            <th>{isAr ? 'رقم الهاتف' : 'Phone Number'}</th>
                            <th>{isAr ? 'البريد الإلكتروني' : 'Email'}</th>
                            <th>{isAr ? 'المادة' : 'Material'}</th>
                            <th>{isAr ? 'ملاحظات' : 'Notes'}</th>
                            <th>{isAr ? 'المستلم (الحجز)' : 'Booked By'}</th>
                            <th>{isAr ? 'التاريخ' : 'Date'}</th>
                            <th>{isAr ? 'الحالة' : 'Status'}</th>
                            <th>{isAr ? 'الإجراءات' : 'Actions'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="10" className="loading-cell">
                                    <div className="loading-spinner"></div>
                                    {isAr ? 'جاري التحميل...' : 'Loading...'}
                                </td>
                            </tr>
                        ) : filteredMaterials.length === 0 ? (
                            <tr>
                                <td colSpan="10" className="empty-cell">
                                    <div className="empty-icon">📭</div>
                                    {isAr ? 'لا توجد سجلات' : 'No records found'}
                                </td>
                            </tr>
                        ) : (
                            filteredMaterials.map((item, index) => (
                                <tr key={item.uniqueKey}>
                                    <td className="index-cell">{index + 1}</td>
                                    <td className="name-cell">
                                        {editingItem && editingItem.id === item.id && editingItem.field === 'studentName' ? (
                                            <div className="edit-material-wrapper">
                                                <input
                                                    type="text"
                                                    value={editingItem.value}
                                                    onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                                    className="edit-material-input"
                                                    autoFocus
                                                />
                                                <button onClick={handleUpdateItem} className="btn-save-edit">✓</button>
                                                <button onClick={() => setEditingItem(null)} className="btn-cancel-edit">✕</button>
                                            </div>
                                        ) : (
                                            <div className="editable-text-wrapper">
                                                <span>{item.studentName}</span>
                                                <button
                                                    className="inline-edit-btn"
                                                    onClick={() => setEditingItem({ id: item.id, field: 'studentName', value: item.studentName })}
                                                >✎</button>
                                            </div>
                                        )}
                                    </td>
                                    <td className="phone-cell" dir="ltr">
                                        {editingItem && editingItem.id === item.id && editingItem.field === 'phoneNumber' ? (
                                            <div className="edit-material-wrapper">
                                                <input
                                                    type="text"
                                                    value={editingItem.value}
                                                    onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                                    className="edit-material-input"
                                                    autoFocus
                                                />
                                                <button onClick={handleUpdateItem} className="btn-save-edit">✓</button>
                                                <button onClick={() => setEditingItem(null)} className="btn-cancel-edit">✕</button>
                                            </div>
                                        ) : (
                                            <div className="editable-text-wrapper">
                                                <a href={getWhatsappLink(item.phoneNumber)} target="_blank" rel="noopener noreferrer" className="whatsapp-link">
                                                    {item.phoneNumber}
                                                </a>
                                                <button
                                                    className="inline-edit-btn"
                                                    onClick={() => setEditingItem({ id: item.id, field: 'phoneNumber', value: item.phoneNumber })}
                                                >✎</button>
                                            </div>
                                        )}
                                    </td>
                                    <td className="email-cell">
                                        {editingItem && editingItem.id === item.id && editingItem.field === 'email' ? (
                                            <div className="edit-material-wrapper">
                                                <input
                                                    type="email"
                                                    value={editingItem.value}
                                                    onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                                    className="edit-material-input"
                                                    autoFocus
                                                />
                                                <button onClick={handleUpdateItem} className="btn-save-edit">✓</button>
                                                <button onClick={() => setEditingItem(null)} className="btn-cancel-edit">✕</button>
                                            </div>
                                        ) : (
                                            <div className="editable-text-wrapper">
                                                <span>{item.email || '-'}</span>
                                                <button
                                                    className="inline-edit-btn"
                                                    onClick={() => setEditingItem({ id: item.id, field: 'email', value: item.email || '' })}
                                                >✎</button>
                                            </div>
                                        )}
                                    </td>
                                    <td className="materials-cell">
                                        {editingItem && editingItem.id === item.id && editingItem.index === item.originalIndex && editingItem.field === 'materialName' ? (
                                            <div className="edit-material-wrapper">
                                                <input
                                                    type="text"
                                                    value={editingItem.value}
                                                    onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                                    className="edit-material-input"
                                                    autoFocus
                                                />
                                                <button onClick={handleUpdateItem} className="btn-save-edit">✓</button>
                                                <button onClick={() => setEditingItem(null)} className="btn-cancel-edit">✕</button>
                                            </div>
                                        ) : (
                                            <span className="material-badge editable-badge">
                                                {item.materialItem.name}
                                                <button
                                                    className="edit-material-btn"
                                                    onClick={() => setEditingItem({ id: item.id, index: item.originalIndex, field: 'materialName', value: item.materialItem.name })}
                                                    title={isAr ? 'تعديل الاسم' : 'Edit name'}
                                                >
                                                    ✎
                                                </button>
                                            </span>
                                        )}
                                    </td>
                                    <td className="description-cell">
                                        {editingItem && editingItem.id === item.id && editingItem.index === item.originalIndex && editingItem.field === 'description' ? (
                                            <div className="edit-material-wrapper">
                                                <textarea
                                                    value={editingItem.value}
                                                    onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                                    className="edit-material-input"
                                                    autoFocus
                                                    rows={1}
                                                />
                                                <button onClick={handleUpdateItem} className="btn-save-edit">✓</button>
                                                <button onClick={() => setEditingItem(null)} className="btn-cancel-edit">✕</button>
                                            </div>
                                        ) : (
                                            <div className="editable-text-wrapper" title={item.materialItem.description}>
                                                <span className="truncate-text">{item.materialItem.description || '-'}</span>
                                                <button
                                                    className="inline-edit-btn"
                                                    onClick={() => setEditingItem({ id: item.id, index: item.originalIndex, field: 'description', value: item.materialItem.description || '' })}
                                                >✎</button>
                                            </div>
                                        )}
                                    </td>
                                    <td className="taker-cell">
                                        {item.materialItem.status === 'reserved' && item.takerInfo ? (
                                            <div className="taker-info">
                                                <span className="taker-name">{item.takerInfo.name}</span>
                                                <span className="taker-phone" dir="ltr">{item.takerInfo.phone}</span>
                                            </div>
                                        ) : (
                                            <span className="no-data">-</span>
                                        )}
                                    </td>
                                    <td className="date-cell">{formatDate(item.createdAt)}</td>
                                    <td className="status-cell">
                                        <span className={`status-badge ${item.materialItem.status}`}>
                                            {item.materialItem.status === 'approved' ? (isAr ? 'موافق' : 'Approved') :
                                                item.materialItem.status === 'reserved' ? (isAr ? 'محجوز' : 'Reserved') :
                                                    (isAr ? 'قيد الانتظار' : 'Pending')}
                                        </span>
                                    </td>
                                    <td className="actions-cell">
                                        <div className="action-buttons">
                                            {item.materialItem.status !== 'approved' && (
                                                <button
                                                    className="btn-approve"
                                                    onClick={() => handleStatusUpdate(item.id, item.originalIndex, 'approved')}
                                                    title={isAr ? 'موافقة' : 'Approve'}
                                                >
                                                    ✓
                                                </button>
                                            )}
                                            {item.materialItem.status === 'approved' && (
                                                <button
                                                    className="btn-pending"
                                                    onClick={() => handleStatusUpdate(item.id, item.originalIndex, 'pending')}
                                                    title={isAr ? 'إرجاع للانتظار' : 'Set Pending'}
                                                >
                                                    ⏸
                                                </button>
                                            )}
                                            {item.materialItem.status === 'reserved' && (
                                                <button
                                                    className="btn-cancel"
                                                    onClick={() => handleStatusUpdate(item.id, item.originalIndex, 'approved')}
                                                    title={isAr ? 'إلغاء الحجز' : 'Cancel Booking'}
                                                >
                                                    🚫
                                                </button>
                                            )}
                                            <button
                                                className="btn-delete"
                                                onClick={() => handleDeleteItem(item.id, item.materials || (item.itemName ? [item.itemName] : []), item.originalIndex)}
                                                title={isAr ? 'حذف' : 'Delete'}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Active Bookings Section */}
            <div className="bookings-section" style={{ marginTop: '4rem' }}>
                <div className="admin-header" style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
                    <h2>{isAr ? 'الحجوزات النشطة (التسليم والاستلام)' : 'Active Bookings'}</h2>
                    <p>{isAr ? 'قائمة بالمواد المحجوزة التي تنتظر التسليم بين الطلاب' : 'List of reserved materials awaiting handover'}</p>
                </div>

                <div className="table-container">
                    <table className="excel-table bookings-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{isAr ? 'المادة' : 'Material'}</th>
                                <th>{isAr ? 'المتبرع (المرسل)' : 'Donor (Sender)'}</th>
                                <th>{isAr ? 'الحاجز (المستلم)' : 'Borrower (Receiver)'}</th>
                                <th>{isAr ? 'تاريخ الحجز' : 'Booking Date'}</th>
                                <th>{isAr ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {flattenedMaterials.filter(d => ['reserved', 'completed'].includes(d.materialItem.status)).length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="empty-cell">
                                        <div className="empty-icon">📭</div>
                                        {isAr ? 'لا توجد حجوزات نشطة حالياً' : 'No active bookings'}
                                    </td>
                                </tr>
                            ) : (
                                flattenedMaterials.filter(d => ['reserved', 'completed'].includes(d.materialItem.status)).map((item, index) => (
                                    <tr key={item.uniqueKey} className={`booking-row ${item.materialItem.status}`}>
                                        <td className="index-cell">{index + 1}</td>

                                        {/* Material Info */}
                                        <td className="materials-cell">
                                            {editingItem && editingItem.id === item.id && editingItem.index === item.originalIndex && editingItem.field === 'materialName' ? (
                                                <div className="edit-material-wrapper">
                                                    <input
                                                        type="text"
                                                        value={editingItem.value}
                                                        onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                                                        className="edit-material-input"
                                                        autoFocus
                                                    />
                                                    <button onClick={handleUpdateItem} className="btn-save-edit">✓</button>
                                                    <button onClick={() => setEditingItem(null)} className="btn-cancel-edit">✕</button>
                                                </div>
                                            ) : (
                                                <span className="material-badge reserved-badge editable-badge">
                                                    {item.materialItem.name}
                                                    <button
                                                        className="edit-material-btn"
                                                        onClick={() => setEditingItem({ id: item.id, index: item.originalIndex, field: 'materialName', value: item.materialItem.name })}
                                                        title={isAr ? 'تعديل الاسم' : 'Edit name'}
                                                    >
                                                        ✎
                                                    </button>
                                                </span>
                                            )}
                                        </td>

                                        {/* Donor Info */}
                                        <td className="party-cell donor">
                                            <div className="party-info">
                                                <span className="party-label">{isAr ? 'المتبرع' : 'Donor'}</span>
                                                <span className="party-name">{item.studentName}</span>
                                                <a href={getWhatsappLink(item.phoneNumber)} target="_blank" rel="noopener noreferrer" className="party-phone whatsapp-link" dir="ltr">
                                                    {item.phoneNumber}
                                                </a>
                                            </div>
                                        </td>

                                        {/* Borrower Info */}
                                        <td className="party-cell borrower">
                                            {item.takerInfo ? (
                                                <div className="party-info">
                                                    <span className="party-label">{isAr ? 'المستلم' : 'Receiver'}</span>
                                                    <span className="party-name">{item.takerInfo.name}</span>
                                                    <a href={getWhatsappLink(item.takerInfo.phone)} target="_blank" rel="noopener noreferrer" className="party-phone whatsapp-link" dir="ltr">
                                                        {item.takerInfo.phone}
                                                    </a>
                                                </div>
                                            ) : <span className="no-data">-</span>}
                                        </td>

                                        <td className="date-cell">
                                            {formatDate(item.reservedAt || item.updatedAt || item.createdAt)}
                                        </td>

                                        <td className="actions-cell">
                                            {item.materialItem.status === 'completed' ? (
                                                <span className="status-badge completed">{isAr ? 'تم التسليم' : 'Completed'}</span>
                                            ) : (
                                                <div className="action-buttons">
                                                    <button
                                                        className="btn-approve"
                                                        onClick={() => {
                                                            if (window.confirm(isAr ? 'هل تم تسليم المادة بنجاح؟ سيتم نقلها للأرشيف.' : 'Confirm handover?')) {
                                                                handleStatusUpdate(item.id, item.originalIndex, 'completed');
                                                            }
                                                        }}
                                                        title={isAr ? 'تم التسليم' : 'Handover Complete'}
                                                        style={{ width: 'auto', padding: '0 10px', gap: '5px' }}
                                                    >
                                                        ✓ {isAr ? 'تم التسليم' : 'Done'}
                                                    </button>

                                                    <button
                                                        className="btn-cancel"
                                                        onClick={() => handleStatusUpdate(item.id, item.originalIndex, 'approved')}
                                                        title={isAr ? 'إلغاء الحجز' : 'Cancel'}
                                                    >
                                                        🚫
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {/* Confirmation Modal */}
            {deleteConfirm && (
                <div className="confirmation-modal-overlay">
                    <div className="confirmation-modal">
                        <h3>{isAr ? 'تأكيد الحذف' : 'Confirm Deletion'}</h3>
                        <p>
                            {isAr
                                ? 'هل أنت متأكد من حذف هذه المادة؟ لا يمكن التراجع عن هذا الإجراء.'
                                : 'Are you sure you want to delete this item? This cannot be undone.'}
                        </p>
                        <div className="modal-actions">
                            <button
                                className="btn-cancel-modal"
                                onClick={() => setDeleteConfirm(null)}
                            >
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                className="btn-confirm-modal"
                                onClick={confirmDeleteAction}
                            >
                                {isAr ? 'حذف' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MaterialExchange;
