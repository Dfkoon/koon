import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../config/firebase';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, runTransaction, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getSystemSettings, updateSystemSettings } from '../services/adminService';
import toast from 'react-hot-toast';
import { RefreshCw, Power, Save } from 'lucide-react';
import './AdminExchange.css';

const AdminExchange = () => {
    // Hardcoded to Arabic for now as per project language context
    const isAr = true;
    const [settings, setSettings] = useState(null);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [donations, setDonations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all, pending, approved, reserved
    const [editingItem, setEditingItem] = useState(null); // { id, index, field, value }
    const [manualReserveItem, setManualReserveItem] = useState(null); // { id, index, materialName }
    const [manualTakerData, setManualTakerData] = useState({ name: '', phone: '', notes: '', time: '' });
    const [editTakerItem, setEditTakerItem] = useState(null);
    const [editTakerData, setEditTakerData] = useState({ name: '', phone: '', studentId: '' });

    // ===== التقرير المعدّل =====
    const [adjReports, setAdjReports] = useState([]);
    const [adjLoading, setAdjLoading] = useState(true);
    const [adjEditing, setAdjEditing] = useState(null); // id of row being edited
    const [adjEditData, setAdjEditData] = useState({ material: '', donorName: '', donorPhone: '', receiverName: '', receiverPhone: '', deliveryDate: '', notes: '' });
    const [adjAdding, setAdjAdding] = useState(false);
    const [inlineAdjGroup, setInlineAdjGroup] = useState(null);
    const [adjViewMode, setAdjViewMode] = useState('receivers'); // 'receivers' | 'donors'
    const [archiveOpen, setArchiveOpen] = useState(false);
    const endOfTableRef = useRef(null);

    const cutoffDate = new Date('2026-03-02T00:00:00');

    const normalizeDonorName = (name) => {
        if (!name) return 'غير معروف';
        const n = name.trim().replace(/\s+/g, ' ');
        if (n === 'الادمن حسين') return 'حسين الديات';
        return n;
    };

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
                const isArrayItem = Array.isArray(donation.materials);
                const materialObj = typeof m === 'object' && m !== null ? m : {
                    name: m,
                    // Only fallback to donation.status if it's NOT a multi-item array (legacy support)
                    status: isArrayItem ? 'pending' : donation.status
                };

                // Ensure status exists
                if (!materialObj.status) {
                    materialObj.status = isArrayItem ? 'pending' : (donation.status || 'pending');
                }

                // Taker info prioritization: item level ONLY for array items
                // We fallback to donation.takerInfo if it's an array item but missing takerInfo AND status is reserved/completed
                const isReservedStatus = materialObj.status === 'reserved' || materialObj.status === 'completed';
                const takerInfo = materialObj.takerInfo || (!isArrayItem || isReservedStatus ? donation.takerInfo : null) || null;

                return {
                    ...donation,
                    materialItem: {
                        ...materialObj,
                        takerInfo: takerInfo
                    },
                    originalIndex: idx,
                    uniqueKey: `${donation.id}-${idx}`
                };
            });
        });
    };

    const flattenedMaterials = getFlattenedMaterials();

    // تجميع البيانات حسب المستلم
    const groupedByReceiver = useMemo(() => {
        const groups = {};

        // 1. خريطة للسجلات المعالجة في التقرير المعدّل لتجنب التكرار
        const processedCount = {};
        adjReports.forEach(r => {
            if (!r.receiverName) return;
            const normalizedReceiver = r.receiverName.trim();
            const key = `${normalizedReceiver}-${r.material}`.toLowerCase().trim().replace(/\s+/g, ' ');
            processedCount[key] = (processedCount[key] || 0) + 1;
        });

        // 2. إضافة السجلات الموجودة مسبقاً في التقرير المعدّل
        adjReports.forEach(r => {
            // Filter: Only include in "Receivers View" if there is a receiver name
            // and it's not a placeholder like "بعدها ما حجزها حد" or "-"
            const rName = (r.receiverName || '').trim();
            const isPlaceholder = !rName || rName === 'بعدها ما حجزها حد' || rName.includes('بعدها ما حجزها') || rName === '-' || rName === '.';
            if (isPlaceholder) return;

            const key = rName;
            if (!groups[key]) {
                groups[key] = {
                    receiverName: key,
                    receiverPhone: r.receiverPhone,
                    items: []
                };
            }
            groups[key].items.push({
                ...r,
                status: r.status || 'reserved',
                isProcessed: true,
                originalId: r.id,
                originalIndex: -1 // Not used for adjustedReports
            });
        });

        // 3. إضافة المواد من السجل الخام التي تم حجزها ولم تنقل للتقرير بعد
        flattenedMaterials.forEach(fm => {
            const mStatus = fm.materialItem?.status || 'pending';
            const taker = fm.materialItem?.takerInfo;
            const isReserved = mStatus === 'reserved' || mStatus === 'completed';

            if (isReserved && taker && taker.name) {
                const rName = taker.name.trim();
                const mName = (fm.materialItem?.name || '').trim().replace(/\s+/g, ' ');
                const matchKey = `${rName}-${mName}`.toLowerCase().trim().replace(/\s+/g, ' ');

                const isPlaceholder = !rName || rName === 'بعدها ما حجزها حد' || rName.includes('بعدها ما حجزها') || rName === '-' || rName === '.';
                if (isPlaceholder) return;

                if (!processedCount[matchKey] || processedCount[matchKey] <= 0) {
                    if (!groups[rName]) {
                        groups[rName] = { receiverName: rName, receiverPhone: taker.phone || '', items: [] };
                    }
                    groups[rName].items.push({
                        id: `fm-${fm.uniqueKey}`,
                        originalId: fm.id,
                        originalIndex: fm.originalIndex,
                        material: mName,
                        donorName: fm.studentName,
                        donorPhone: fm.phoneNumber,
                        receiverName: rName,
                        receiverPhone: taker.phone || '',
                        deliveryDate: '-',
                        notes: fm.materialItem?.notes || fm.notes || '',
                        status: mStatus,
                        isProcessed: false
                    });
                } else {
                    processedCount[matchKey]--;
                }
            }
        });

        return Object.values(groups);
    }, [adjReports, flattenedMaterials]);

    // تجميع البيانات حسب المتبرع (شامل لكل التبرعات)
    const groupedByDonor = useMemo(() => {
        const groups = {};

        // 1. خريطة للسجلات المعالجة في التقرير المعدّل لتجنب التكرار
        const processedCount = {};
        adjReports.forEach(r => {
            const normalizedDonor = normalizeDonorName(r.donorName);
            const key = `${normalizedDonor}-${r.material}`.toLowerCase().trim().replace(/\s+/g, ' ');
            processedCount[key] = (processedCount[key] || 0) + 1;
        });

        // 2. إضافة السجلات الموجودة مسبقاً في التقرير المعدّل
        adjReports.forEach(r => {
            // Filter: Only include in "Donors View" if there is a donor name
            const dName = normalizeDonorName(r.donorName);
            if (!dName) return;

            const key = dName;
            if (!groups[key]) {
                groups[key] = {
                    donorName: key,
                    donorPhone: r.donorPhone,
                    items: []
                };
            }
            groups[key].items.push({
                ...r,
                status: r.status || 'reserved',
                isProcessed: true,
                originalId: r.id,
                originalIndex: -1 // Not used for adjustedReports
            });
        });

        // 3. إضافة المواد من السجل الخام التي لم تُحجز بعد
        flattenedMaterials.forEach(fm => {
            const dName = normalizeDonorName(fm.studentName);
            const mName = (fm.materialItem?.name || '').trim().replace(/\s+/g, ' ');
            const matchKey = `${dName}-${mName}`.toLowerCase().trim().replace(/\s+/g, ' ');

            if (!processedCount[matchKey] || processedCount[matchKey] <= 0) {
                if (!groups[dName]) {
                    groups[dName] = { donorName: dName, donorPhone: fm.phoneNumber, items: [] };
                }
                const mStatus = fm.materialItem?.status || 'pending';
                const taker = fm.materialItem?.takerInfo;
                const isReserved = mStatus === 'reserved' || mStatus === 'completed';

                groups[dName].items.push({
                    id: `fm-${fm.uniqueKey}`,
                    originalId: fm.id,
                    originalIndex: fm.originalIndex,
                    material: mName,
                    donorName: dName,
                    donorPhone: fm.phoneNumber,
                    receiverName: isReserved && taker?.name ? taker.name : 'بعدها ما حجزها حد',
                    receiverPhone: isReserved && taker?.phone ? taker.phone : '',
                    deliveryDate: '-',
                    notes: fm.materialItem?.notes || fm.notes || '',
                    status: isReserved ? mStatus : 'available',
                    isProcessed: false
                });
            } else {
                processedCount[matchKey]--;
            }
        });

        return Object.values(groups);
    }, [adjReports, flattenedMaterials]);

    const fetchSettings = async () => {
        setSettingsLoading(true);
        const data = await getSystemSettings();
        if (data) setSettings(data);
        setSettingsLoading(false);
    };

    const handleToggle = () => {
        setSettings(prev => ({ ...prev, isExchangeActive: !prev.isExchangeActive }));
    };

    const handleSaveSettings = async () => {
        setSaving(true);
        const toastId = toast.loading('جاري حفظ الإعدادات...');
        const result = await updateSystemSettings(settings);
        if (result.success) {
            toast.success('تم تحديث الإعدادات بنجاح', { id: toastId });
        } else {
            toast.error('حدث خطأ أثناء الحفظ', { id: toastId });
        }
        setSaving(false);
    };

    const emptyAdjRow = { material: '', donorName: '', donorPhone: '', receiverName: '', receiverPhone: '', notes: '', deliveryDate: '' };
    const [newAdjRow, setNewAdjRow] = useState(emptyAdjRow);

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

    // ===== CRUD للتقرير المعدّل =====
    const fetchAdjReports = async () => {
        setAdjLoading(true);
        try {
            const q = query(collection(db, 'adjustedReports'), orderBy('createdAt', 'asc'));
            const snap = await getDocs(q);
            setAdjReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error(e);
        } finally {
            setAdjLoading(false);
        }
    };

    const handleAdjAdd = async () => {
        // Relaxed validation: Material is required, and at least OR donorName OR receiverName
        if (!newAdjRow.material || (!newAdjRow.donorName && !newAdjRow.receiverName)) {
            toast.error('يرجى إدخال المادة واسم المتبرع أو المستلم على الأقل');
            return;
        }
        try {
            await addDoc(collection(db, 'adjustedReports'), {
                ...newAdjRow,
                donorName: normalizeDonorName(newAdjRow.donorName),
                createdAt: serverTimestamp()
            });
            toast.success('تمت إضافة الصف بنجاح ✅');
            setNewAdjRow(emptyAdjRow);
            setAdjAdding(false);
            setInlineAdjGroup(null);
            fetchAdjReports();
        } catch (e) {
            toast.error('فشل في الإضافة');
        }
    };

    const handleAdjSaveEdit = async () => {
        if (!adjEditing) return;
        try {
            if (adjEditing.startsWith('fm-')) {
                const parts = adjEditing.replace('fm-', '').split('-');
                const index = parseInt(parts.pop());
                const donationId = parts.join('-');

                if (!donationId || isNaN(index)) {
                    console.error('Invalid adjEditing ID format:', adjEditing);
                    toast.error('خطأ في معرّف السجل');
                    return;
                }

                const donationRef = doc(db, 'materialDonations', donationId);
                await runTransaction(db, async (transaction) => {
                    const donationDoc = await transaction.get(donationRef);
                    if (!donationDoc.exists()) throw new Error('Donation not found');

                    const donation = donationDoc.data();
                    const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                    const updatedMaterials = [...currentMaterials];

                    let itemToUpdate = updatedMaterials[index];
                    if (typeof itemToUpdate !== 'object' || itemToUpdate === null) {
                        itemToUpdate = { name: adjEditData.material };
                    } else {
                        itemToUpdate = { ...itemToUpdate, name: adjEditData.material };
                    }

                    // Update notes if provided
                    if (adjEditData.notes !== undefined) {
                        itemToUpdate.notes = adjEditData.notes;
                    }

                    // Map taker information (receiver)
                    const rName = adjEditData.receiverName || '';
                    const rPhone = adjEditData.receiverPhone || '';

                    if (rName && rName !== 'بعدها ما حجزها حد') {
                        itemToUpdate.takerInfo = {
                            ...(itemToUpdate.takerInfo || {}),
                            name: rName,
                            phone: rPhone,
                            bookedAt: itemToUpdate.takerInfo?.bookedAt || itemToUpdate.takerInfo?.reservedAt || new Date().toISOString()
                        };
                        itemToUpdate.status = 'reserved';
                    } else {
                        // If receiver name is cleared, make it available again
                        itemToUpdate.status = 'approved';
                        if (itemToUpdate.takerInfo) delete itemToUpdate.takerInfo;
                    }

                    updatedMaterials[index] = itemToUpdate;

                    transaction.update(donationRef, {
                        materials: updatedMaterials,
                        studentName: adjEditData.donorName || donation.studentName,
                        phoneNumber: adjEditData.donorPhone || donation.phoneNumber
                    });
                });
                toast.success(isAr ? 'تم تحديث التبرع في السجل الخام ✅' : 'Raw donation updated');
                fetchDonations();
            } else {
                await updateDoc(doc(db, 'adjustedReports', adjEditing), { ...adjEditData });
                toast.success('تم تحديث البيانات ✅');
                fetchAdjReports();
            }
            setAdjEditing(null);
        } catch (e) {
            console.error('Error saving adj edit:', e);
            toast.error('فشل في التحديث');
        }
    };

    const handleAdjComplete = async (it) => {
        if (!it.receiverName || it.receiverName === 'بعدها ما حجزها حد') {
            toast.error(isAr ? 'المادة غير محجوزة بعد' : 'Item is not reserved yet');
            return;
        }

        try {
            toast.loading(isAr ? 'جاري النقل للتقرير النهائي...' : 'Moving to final report...');

            if (it.id.startsWith('fm-')) {
                const parts = it.id.replace('fm-', '').split('-');
                const index = parseInt(parts.pop());
                const donationId = parts.join('-');

                if (!donationId || isNaN(index)) {
                    toast.dismiss();
                    toast.error('خطأ في معرّف السجل');
                    return;
                }

                const donationRef = doc(db, 'materialDonations', donationId);
                await runTransaction(db, async (transaction) => {
                    const donationDoc = await transaction.get(donationRef);
                    if (!donationDoc.exists()) throw new Error('Donation not found');

                    const donation = donationDoc.data();
                    const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                    const updatedMaterials = [...currentMaterials];

                    let itemToUpdate = updatedMaterials[index];
                    if (typeof itemToUpdate !== 'object' || itemToUpdate === null) {
                        itemToUpdate = { name: it.material, status: 'completed' };
                    } else {
                        itemToUpdate = { ...itemToUpdate, status: 'completed' };
                    }

                    updatedMaterials[index] = itemToUpdate;

                    transaction.update(donationRef, {
                        materials: updatedMaterials
                    });
                });
                toast.dismiss();
                toast.success(isAr ? 'تم النقل للتقرير النهائي بنجاح ✅' : 'Moved to final report successfully!');
                fetchDonations();
            } else {
                const adjRef = doc(db, 'adjustedReports', it.id);
                await updateDoc(adjRef, { status: 'completed' });
                toast.dismiss();
                toast.success(isAr ? 'تم النقل للتقرير النهائي بنجاح ✅' : 'Moved to final report successfully!');
                if (typeof fetchAdjReports === 'function') fetchAdjReports();
            }
        } catch (e) {
            console.error('Error completing item:', e);
            toast.dismiss();
            toast.error('فشل في التحديث');
        }
    };

    const handleAdjDelete = (id) => {
        // setTimeout prevents browser auto-dismissal of window.confirm usually caused by React state bubbling
        setTimeout(async () => {
            if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذا السجل بشكل نهائي؟' : 'Confirm deletion?')) return;
            try {
                if (id.startsWith('fm-')) {
                    const parts = id.replace('fm-', '').split('-');
                    const index = parseInt(parts.pop());
                    const donationId = parts.join('-');

                    const donationRef = doc(db, 'materialDonations', donationId);
                    await runTransaction(db, async (transaction) => {
                        const donationDoc = await transaction.get(donationRef);
                        if (!donationDoc.exists()) return;

                        const donation = donationDoc.data();
                        const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                        const updatedMaterials = [...currentMaterials];

                        updatedMaterials.splice(index, 1);

                        if (updatedMaterials.length === 0) {
                            transaction.delete(donationRef);
                        } else {
                            transaction.update(donationRef, {
                                materials: updatedMaterials
                            });
                        }
                    });
                    toast.success(isAr ? 'تم حذف التبرع من السجل الخام' : 'Deleted from raw donations');
                    fetchDonations();
                } else {
                    await deleteDoc(doc(db, 'adjustedReports', id));
                    toast.success('تم الحذف بنجاح');
                    fetchAdjReports();
                }
            } catch (e) {
                console.error('Error deleting adj record:', e);
                toast.error('فشل في الحذف');
            }
        }, 10);
    };

    const handleAdjClearAll = async () => {
        if (!window.confirm('⚠️ هل أنت متأكد من حذف جميع بيانات التقرير المعدّل؟ لا يمكن التراجع عن هذه الخطوة.')) return;
        try {
            toast.loading('جاري الحذف...');
            const q = query(collection(db, 'adjustedReports'));
            const snap = await getDocs(q);
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            toast.dismiss();
            toast.success('تم إفراغ الجدول بنجاح 🗑️');
            fetchAdjReports();
        } catch (e) {
            toast.dismiss();
            toast.error('فشل في إفراغ الجدول');
        }
    };

    const handleAdjDeduplicate = async () => {
        try {
            toast.loading('جاري تنظيف التكرار...');
            const q = query(collection(db, 'adjustedReports'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);

            const seen = new Set();
            const batch = writeBatch(db);
            let deletedCount = 0;

            snap.docs.forEach(docSnap => {
                const d = docSnap.data();
                const key = `${d.material}-${d.donorName}-${d.receiverName}`.toLowerCase().trim();

                if (seen.has(key)) {
                    batch.delete(docSnap.ref);
                    deletedCount++;
                } else {
                    seen.add(key);
                }
            });

            if (deletedCount > 0) {
                await batch.commit();
                toast.dismiss();
                toast.success(`تم حذف ${deletedCount} صف مكرر بنجاح 🧹`);
                fetchAdjReports();
            } else {
                toast.dismiss();
                toast.success('لا يوجد تكرار حالياً ✅');
            }
        } catch (e) {
            toast.dismiss();
            toast.error('فشل في عملية تنظيف التكرار');
        }
    };

    const syncImageBookings = async () => {
        const itemsFromImage = [
            { material: "مقدمة الى اليوتكس", donorName: "ديما حمزه العناسوه", donorPhone: "0779170252", receiverName: "سدين حمدي خليفات", receiverPhone: "0795336260", deliveryDate: "2024/02/16" },
            { material: "التفاضل والتكامل 2", donorName: "ديما حمزه العناسوه", donorPhone: "0779170252", receiverName: "سدين حمدي خليفات", receiverPhone: "0795336260", deliveryDate: "2024/02/16" },
            { material: "مختبر البرمجة الموجهة للكائنات", donorName: "سندس السعودي", donorPhone: "0797880384", receiverName: "سدين حمدي خليفات", receiverPhone: "0795336260", deliveryDate: "2024/02/16" },
            { material: "الهياكل والرياضيات المنفصلة", donorName: "سندس السعودي", donorPhone: "0797880384", receiverName: "سدين حمدي خليفات", receiverPhone: "0795336260", deliveryDate: "2024/02/16" },
            { material: "المقدمة الى اليونكس", donorName: "حسين الديات", donorPhone: "0782934685", receiverName: "سدين حمدي خليفات", receiverPhone: "0795336260", deliveryDate: "2024/02/16" },
            { material: "قواعد بيانات", donorName: "حسين الديات", donorPhone: "0782934685", receiverName: "سدين حمدي خليفات", receiverPhone: "0795336260", deliveryDate: "2024/02/16" },
            { material: "برمجة الذكاء الاصطناعي", donorName: "حسين الديات", donorPhone: "0782934685", receiverName: "سدين حمدي خليفات", receiverPhone: "0795336260", deliveryDate: "2024/02/16" },
            { material: "دوسية كالكولس 1", donorName: "علي الزعبي", donorPhone: "0772472126", receiverName: "لمار عماد", receiverPhone: "0776499376", deliveryDate: "2024/02/15" },
            { material: "اللغة الانجليزية تطبيقية (1)", donorName: "علي الزعبي", donorPhone: "0772472126", receiverName: "لمار عماد", receiverPhone: "0776499376", deliveryDate: "2024/02/15" },
            { material: "لغة انجليزية تطبيقية (1)", donorName: "علي الزعبي", donorPhone: "0772472126", receiverName: "لمار عماد", receiverPhone: "0776499376", deliveryDate: "2024/02/15" },
            { material: "التفاضل والتكامل 2", donorName: "علي الزعبي", donorPhone: "0772472126", receiverName: "لمار عماد", receiverPhone: "0776499376", deliveryDate: "2024/02/15" },
            { material: "اللغة العربية التطبيقية", donorName: "انس الدعيجي", donorPhone: "0796770493", receiverName: "لمار عماد", receiverPhone: "0776499376", deliveryDate: "2024/02/15" },
            { material: "اللغة العربية التطبيقية", donorName: "سندس السعودي", donorPhone: "0797880384", receiverName: "سامي ابو هديب", receiverPhone: "0790248584", deliveryDate: "2024/02/15" },
            { material: "القانون والاعلام والمجتمع", donorName: "سامي محمد ابو هديب", donorPhone: "0790248584", receiverName: "محمد الزغول", receiverPhone: "0775165828", deliveryDate: "2024/02/15" },
            { material: "الاحتمالات والاحصاء", donorName: "سرى الجراح", donorPhone: "0797972522", receiverName: "خالد العبيدات", receiverPhone: "0780205254", deliveryDate: "2024/02/15" },
            { material: "مفاهيم اقتصادية", donorName: "سرى الجراح", donorPhone: "0797972522", receiverName: "خالد العبيدات", receiverPhone: "0780205254", deliveryDate: "2024/02/15" },
            { material: "الهياكل والرياضيات المنفصلة", donorName: "محمد الزغول", donorPhone: "0775165828", receiverName: "مي احمد", receiverPhone: "0791016176", deliveryDate: "2024/02/14" },
            { material: "هياكل البيانات / لطلاب 1", donorName: "محمد الزغول", donorPhone: "0775165828", receiverName: "مي احمد", receiverPhone: "0791016176", deliveryDate: "2024/02/14" }
        ];

        try {
            toast.loading('جاري إضافة البيانات والمزامنة...');
            const existingKeys = new Set(adjReports.map(r => `${r.material}-${r.donorName}-${r.receiverName}`.toLowerCase().trim().replace(/\s+/g, ' ')));
            let added = 0;

            for (const item of itemsFromImage) {
                const key = `${item.material}-${item.donorName}-${item.receiverName}`.toLowerCase().trim().replace(/\s+/g, ' ');
                if (!existingKeys.has(key)) {
                    await addDoc(collection(db, 'adjustedReports'), { ...item, createdAt: serverTimestamp() });
                    added++;
                }
            }

            toast.dismiss();
            toast.success(`تمت إضافة ${added} سجل جديد بنجاح ✅`);
            fetchAdjReports();
        } catch (e) {
            toast.dismiss();
            toast.error('فشل في المزامنة');
            console.error(e);
        }
    };

    const handleFixDonorNames = async () => {
        try {
            toast.loading('جاري توحيد أسماء المتبرعين...');
            const batch = writeBatch(db);
            let updated = 0;
            adjReports.forEach(r => {
                if (r.donorName === 'ميار رائد') {
                    const ref = doc(db, 'adjustedReports', r.id);
                    batch.update(ref, { donorName: 'سندس السعودي', donorPhone: '0797880384' });
                    updated++;
                } else if (r.donorName === 'الادمن حسين') {
                    const ref = doc(db, 'adjustedReports', r.id);
                    batch.update(ref, { donorName: 'حسين الديات', donorPhone: '0782934685' });
                    updated++;
                }
            });
            if (updated > 0) {
                await batch.commit();
                toast.dismiss();
                toast.success(`تم توحيد ${updated} سجل بنجاح ✅`);
                fetchAdjReports();
            } else {
                toast.dismiss();
                toast.success('الأسماء موحدة بالفعل ✅');
            }
        } catch (e) {
            toast.dismiss();
            toast.error('فشل في توحيد الأسماء');
            console.error(e);
        }
    };

    const handleUpdateItem = async () => {
        if (!editingItem) return;
        const { id, index, field, value } = editingItem;

        try {
            const donationRef = doc(db, 'materialDonations', id);

            await runTransaction(db, async (transaction) => {
                const donationDoc = await transaction.get(donationRef);
                if (!donationDoc.exists()) return;

                const donation = donationDoc.data();
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

                transaction.update(donationRef, updateData);
            });

            toast.success(isAr ? 'تم تحديث البيانات بنجاح' : 'Updated successfully');
            setEditingItem(null);
            fetchDonations();
        } catch (error) {
            console.error('Error updating item:', error);
            toast.error(isAr ? 'فشل في تحديث البيانات' : 'Failed to update data');
        }
    };

    useEffect(() => {
        fetchSettings();
        fetchDonations();
        fetchAdjReports();
    }, []);



    const filteredMaterials = flattenedMaterials.filter(item => {
        if (filter === 'all') return !['reserved', 'completed'].includes(item.materialItem.status);
        return item.materialItem.status === filter;
    });

    const handleStatusUpdate = async (donationId, materialIndex, newStatus) => {
        try {
            const donationRef = doc(db, 'materialDonations', donationId);

            await runTransaction(db, async (transaction) => {
                const donationDoc = await transaction.get(donationRef);
                if (!donationDoc.exists()) return;

                const donation = donationDoc.data();
                const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                const updatedMaterials = [...currentMaterials];

                // Normalize and update specific item
                let itemToUpdate = updatedMaterials[materialIndex];
                if (typeof itemToUpdate !== 'object' || itemToUpdate === null) {
                    itemToUpdate = { name: itemToUpdate, status: newStatus };
                } else {
                    itemToUpdate = { ...itemToUpdate, status: newStatus };
                }

                // If canceling a reservation (going back to approved/pending), clear takerInfo
                if (newStatus === 'approved' || newStatus === 'pending') {
                    delete itemToUpdate.takerInfo;
                }

                updatedMaterials[materialIndex] = itemToUpdate;

                // Check if ALL materials are now reserved
                const allReserved = updatedMaterials.every(m => {
                    const status = typeof m === 'object' ? m.status : (donation.status || 'pending');
                    return status === 'reserved' || status === 'completed';
                });
                const newDocStatus = allReserved ? 'reserved' : 'approved';

                transaction.update(donationRef, {
                    materials: updatedMaterials,
                    status: newDocStatus
                });
            });

            toast.success(isAr ? `تم تحديث الحالة إلى ${newStatus === 'approved' ? 'موافق' : newStatus === 'pending' ? 'قيد الانتظار' : newStatus === 'completed' ? 'تم التسليم' : newStatus}` : `Status updated`);
            fetchDonations();
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error(isAr ? 'فشل في تحديث الحالة' : 'Failed to update status');
        }
    };

    const handleMoveToFinal = async (item) => {
        try {
            const donationId = item.id;
            const materialIndex = item.originalIndex;
            const takerInfo = item.materialItem?.takerInfo;

            if (!takerInfo?.name) {
                toast.error(isAr ? 'المادة غير محجوزة لطالب بعد' : 'Item is not reserved to a student');
                return;
            }

            toast.loading(isAr ? 'جاري الترحيل...' : 'Moving to final report...');

            // 1. Update status in materialDonations
            const donationRef = doc(db, 'materialDonations', donationId);
            await runTransaction(db, async (transaction) => {
                const donationDoc = await transaction.get(donationRef);
                if (!donationDoc.exists()) return;

                const donation = donationDoc.data();
                const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                const updatedMaterials = [...currentMaterials];

                let itemToUpdate = updatedMaterials[materialIndex];
                if (typeof itemToUpdate !== 'object' || itemToUpdate === null) {
                    itemToUpdate = { name: itemToUpdate, status: 'completed', takerInfo };
                } else {
                    itemToUpdate = { ...itemToUpdate, status: 'completed' };
                }
                updatedMaterials[materialIndex] = itemToUpdate;

                const allReserved = updatedMaterials.every(m => {
                    const status = typeof m === 'object' ? m.status : (donation.status || 'pending');
                    return status === 'reserved' || status === 'completed';
                });
                const newDocStatus = allReserved ? 'reserved' : 'approved';

                transaction.update(donationRef, {
                    materials: updatedMaterials,
                    status: newDocStatus
                });
            });

            // 2. Add to adjustedReports
            await addDoc(collection(db, 'adjustedReports'), {
                material: item.materialItem.name,
                donorName: normalizeDonorName(item.studentName),
                donorPhone: item.phoneNumber || '',
                receiverName: takerInfo.name,
                receiverPhone: takerInfo.phone || '',
                deliveryDate: new Date().toLocaleDateString('ar-EG'),
                notes: item.materialItem.notes || item.notes || '',
                createdAt: serverTimestamp()
            });

            toast.dismiss();
            toast.success(isAr ? 'تم النقل للتقرير النهائي بنجاح ✅' : 'Moved to final report successfully');
            fetchDonations();
            fetchAdjReports();
        } catch (error) {
            toast.dismiss();
            console.error('Error moving to final:', error);
            toast.error(isAr ? 'فشل في عملية النقل' : 'Failed to move to final');
        }
    };

    const handleManualReserve = async () => {
        if (!manualReserveItem || !manualTakerData.name || !manualTakerData.phone) {
            toast.error(isAr ? 'يرجى إكمال البيانات' : 'Please complete the details');
            return;
        }

        try {
            const donationRef = doc(db, 'materialDonations', manualReserveItem.id);

            await runTransaction(db, async (transaction) => {
                const donationDoc = await transaction.get(donationRef);
                if (!donationDoc.exists()) return;

                const donation = donationDoc.data();
                const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                const updatedMaterials = [...currentMaterials];

                let itemToUpdate = updatedMaterials[manualReserveItem.index];
                if (typeof itemToUpdate !== 'object' || itemToUpdate === null) {
                    itemToUpdate = { name: itemToUpdate };
                }

                updatedMaterials[manualReserveItem.index] = {
                    ...itemToUpdate,
                    status: 'reserved',
                    takerInfo: {
                        name: manualTakerData.name,
                        phone: manualTakerData.phone,
                        notes: manualTakerData.notes || '',
                        bookedAt: manualTakerData.time || new Date(),
                        reservedAt: new Date(),
                        manual: true
                    }
                };

                // Check if ALL materials are now reserved
                const allReserved = updatedMaterials.every(m => {
                    const status = typeof m === 'object' ? m.status : (donation.status || 'pending');
                    return status === 'reserved' || status === 'completed';
                });
                const newDocStatus = allReserved ? 'reserved' : 'approved';

                transaction.update(donationRef, {
                    materials: updatedMaterials,
                    status: newDocStatus
                });
            });

            toast.success(isAr ? 'تم الحجز يدوياً بنجاح' : 'Manually reserved successfully');
            setManualReserveItem(null);
            setManualTakerData({ name: '', phone: '', notes: '', time: '' });
            fetchDonations();
        } catch (error) {
            console.error('Error manual reserving:', error);
            toast.error(isAr ? 'فشل الحجز اليدوي' : 'Manual reservation failed');
        }
    };

    const handleEditTakerSave = async () => {
        if (!editTakerItem || !editTakerData.name || !editTakerData.phone) {
            toast.error('يرجى إدخال الاسم ورقم الهاتف');
            return;
        }
        try {
            const donationRef = doc(db, 'materialDonations', editTakerItem.id);
            await runTransaction(db, async (transaction) => {
                const donationDoc = await transaction.get(donationRef);
                if (!donationDoc.exists()) return;
                const donation = donationDoc.data();
                const currentMaterials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                const updatedMaterials = [...currentMaterials];
                let item = updatedMaterials[editTakerItem.index];
                if (typeof item !== 'object' || item === null) item = { name: item };
                updatedMaterials[editTakerItem.index] = {
                    ...item,
                    takerInfo: {
                        name: editTakerData.name,
                        phone: editTakerData.phone,
                        ...(editTakerData.studentId ? { studentId: editTakerData.studentId } : {}),
                        reservedAt: item.takerInfo?.reservedAt || new Date(),
                        editedAt: new Date(),
                        manual: true
                    }
                };
                transaction.update(donationRef, { materials: updatedMaterials });
            });
            toast.success('تم تحديث بيانات المستلم بنجاح ✅');
            setEditTakerItem(null);
            setEditTakerData({ name: '', phone: '', studentId: '' });
            fetchDonations();
        } catch (error) {
            console.error('Error editing taker:', error);
            toast.error('فشل في تحديث بيانات المستلم');
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

        const { donationId, materials: initialMaterials, itemIndex } = deleteConfirm;

        try {
            const donationRef = doc(db, 'materialDonations', donationId);

            await runTransaction(db, async (transaction) => {
                const donationDoc = await transaction.get(donationRef);
                if (!donationDoc.exists()) return;

                const donation = donationDoc.data();
                const materials = donation.materials || (donation.itemName ? [donation.itemName] : []);
                const updatedMaterials = [...materials];

                // Remove the specific item
                updatedMaterials.splice(itemIndex, 1);

                if (updatedMaterials.length === 0) {
                    transaction.delete(donationRef);
                } else {
                    transaction.update(donationRef, { materials: updatedMaterials });
                }
            });

            toast.success(isAr ? 'تم حذف المادة بنجاح' : 'Item deleted successfully');
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
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB') + ' ' + date.toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    const generateDeliveryReport = (item) => {
        const donorName = item.studentName || '-';
        const donorId = item.studentId || '';
        const donorPhone = item.phoneNumber || '-';
        const takerInfo = item.materialItem?.takerInfo || item.takerInfo || {};
        const receiverName = takerInfo.name || '-';
        const receiverPhone = takerInfo.phone || '-';
        const receiverId = takerInfo.studentId || '';
        const materialName = item.reportMaterialName || item.materialItem?.name || '-';
        const description = item.materialItem?.description || '-';
        const notes = item.reportNotes || item.materialItem?.notes || item.notes || '-';
        const bookingDateRaw = item.reportDate || item.materialItem?.takerInfo?.bookedAt || item.materialItem?.takerInfo?.reservedAt || item.materialItem?.reservedAt || item.reservedAt || item.updatedAt || item.createdAt;
        const bookingDate = formatDate(bookingDateRaw);
        const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const reportId = `KN-${item.id?.slice(-6).toUpperCase()}-${item.originalIndex}`;
        const statusLabel = item.materialItem?.status === 'completed' ? 'تم التسليم' : 'محجوز - في انتظار التسليم';

        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير التسليم - ${reportId}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: #fff; color: #1a1a2e; }
    .page { max-width: 800px; margin: 0 auto; padding: 30px 40px; }
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2c3e50; padding-bottom: 20px; margin-bottom: 25px; }
    .org-info h1 { font-size: 26px; font-weight: 900; color: #2c3e50; letter-spacing: 2px; }
    .org-info p { font-size: 12px; color: #555; margin-top: 4px; }
    .report-meta { text-align: left; }
    .report-meta .report-id { font-size: 11px; background: #2c3e50; color: #fff; padding: 4px 10px; border-radius: 4px; margin-bottom: 6px; display: inline-block; }
    .report-meta p { font-size: 11px; color: #555; }
    /* Title */
    .report-title { text-align: center; margin-bottom: 25px; }
    .report-title h2 { font-size: 22px; font-weight: 900; color: #2c3e50; border: 2px solid #2c3e50; display: inline-block; padding: 8px 40px; border-radius: 6px; }
    .report-title .status-badge { display: inline-block; margin-top: 10px; padding: 4px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; background: ${item.materialItem?.status === 'completed' ? '#27ae60' : '#e67e22'}; color: #fff; }
    /* Info sections */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .info-card { border: 1.5px solid #ddd; border-radius: 8px; padding: 16px; }
    .info-card.donor { border-right: 4px solid #2980b9; }
    .info-card.receiver { border-right: 4px solid #27ae60; }
    .info-card h3 { font-size: 13px; font-weight: 700; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .info-card .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #eee; }
    .info-card .info-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .info-card .label { font-size: 12px; color: #888; }
    .info-card .value { font-size: 13px; font-weight: 600; color: #1a1a2e; }
    /* Material section */
    .material-section { border: 1.5px solid #ddd; border-right: 4px solid #8e44ad; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .material-section h3 { font-size: 13px; font-weight: 700; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .material-name { font-size: 20px; font-weight: 900; color: #2c3e50; margin-bottom: 10px; }
    .material-detail { font-size: 12px; color: #555; margin-bottom: 6px; }
    /* Dates */
    .dates-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
    .date-card { background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; }
    .date-card .date-label { font-size: 11px; color: #888; margin-bottom: 4px; }
    .date-card .date-value { font-size: 13px; font-weight: 700; color: #2c3e50; }
    /* Signatures */
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
    .sig-box { text-align: center; }
    .sig-box .sig-label { font-size: 12px; font-weight: 700; color: #555; margin-bottom: 8px; }
    .sig-box .sig-area { border-bottom: 2px solid #2c3e50; height: 60px; margin-bottom: 8px; }
    .sig-box .sig-name { font-size: 11px; color: #888; }
    /* Footer */
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #aaa; }
    @media print {
      @page { margin: 0; }
      body { margin: 1.5cm; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="org-info">
        <h1>KOON</h1>
        <p>منصة تبادل المواد الدراسية</p>
        <p>وحدة التنسيق الطلابي</p>
      </div>
      <div class="report-meta">
        <div class="report-id">#${reportId}</div>
        <p>تاريخ الطباعة: ${printDate}</p>
      </div>
    </div>

    <div class="report-title">
      <h2>📋 وثيقة تسليم مادة دراسية</h2>
      <div class="status-badge">${statusLabel}</div>
    </div>

    <div class="info-grid">
      <div class="info-card donor">
        <h3>📤 المتبرع (المرسل)</h3>
        <div class="info-row"><span class="label">الاسم</span><span class="value">${donorName}</span></div>
        ${donorId ? `<div class="info-row"><span class="label">الرقم الجامعي</span><span class="value">${donorId}</span></div>` : ''}
        <div class="info-row"><span class="label">رقم الهاتف</span><span class="value" dir="ltr">${donorPhone}</span></div>
      </div>
      <div class="info-card receiver">
        <h3>📥 المستلم (الحاجز)</h3>
        <div class="info-row"><span class="label">الاسم</span><span class="value">${receiverName}</span></div>
        ${receiverId ? `<div class="info-row"><span class="label">الرقم الجامعي</span><span class="value">${receiverId}</span></div>` : ''}
        <div class="info-row"><span class="label">رقم الهاتف</span><span class="value" dir="ltr">${receiverPhone}</span></div>
      </div>
    </div>

    <div class="material-section">
      <h3>📚 تفاصيل المادة</h3>
      <div class="material-name">${materialName}</div>
      ${description !== '-' ? `<div class="material-detail"><strong>الوصف:</strong> ${description}</div>` : ''}
      ${notes !== '-' ? `<div class="material-detail"><strong>الملاحظات:</strong> ${notes}</div>` : ''}
    </div>

    <div class="dates-section">
      <div class="date-card">
        <div class="date-label">📅 تاريخ الحجز</div>
        <div class="date-value">${bookingDate}</div>
      </div>
      <div class="date-card">
        <div class="date-label">✅ تاريخ التسليم الفعلي</div>
        <div class="date-value">${item.materialItem?.status === 'completed' ? bookingDate : '............................'}</div>
      </div>
    </div>

    <div class="signatures">
      <div class="sig-box">
        <div class="sig-label">توقيع المتبرع</div>
        <div class="sig-area"></div>
        <div class="sig-name">${donorName}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">توقيع المستلم</div>
        <div class="sig-area"></div>
        <div class="sig-name">${receiverName}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">توقيع الإدارة</div>
        <div class="sig-area"></div>
        <div class="sig-name">KOON Admin</div>
      </div>
    </div>

    <div class="footer">
      وثيقة رسمية صادرة عن منصة KOON — جميع الحقوق محفوظة © ${new Date().getFullYear()}<br/>
      هذه الوثيقة تُثبت إتمام عملية تبادل المادة الدراسية بين الطرفين المذكورين أعلاه.
    </div>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (win) {
            win.document.write(html);
            win.document.close();
        } else {
            toast.error('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير');
        }
    };

    const generateAdjDeliveryReport = (row) => {
        const donorName = row.donorName || '-';
        const donorPhone = row.donorPhone || '-';
        const receiverName = row.receiverName || '-';
        const receiverPhone = row.receiverPhone || '-';
        const materialName = row.material || '-';
        const notes = row.notes || '-';
        const bookingDate = row.deliveryDate || '-';
        const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const reportId = `ADJ-${row.id?.slice(-6).toUpperCase()}`;
        const statusLabel = 'تقرير معدّل - تم التسليم';

        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>تقرير التسليم - ${reportId}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; background: #fff; color: #1a1a2e; }
    .page { max-width: 800px; margin: 0 auto; padding: 30px 40px; }
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2c3e50; padding-bottom: 20px; margin-bottom: 25px; }
    .org-info h1 { font-size: 26px; font-weight: 900; color: #2c3e50; letter-spacing: 2px; }
    .org-info p { font-size: 12px; color: #555; margin-top: 4px; }
    .report-meta { text-align: left; }
    .report-meta .report-id { font-size: 11px; background: #2c3e50; color: #fff; padding: 4px 10px; border-radius: 4px; margin-bottom: 6px; display: inline-block; }
    .report-meta p { font-size: 11px; color: #555; }
    /* Title */
    .report-title { text-align: center; margin-bottom: 25px; }
    .report-title h2 { font-size: 22px; font-weight: 900; color: #2c3e50; border: 2px solid #2c3e50; display: inline-block; padding: 8px 40px; border-radius: 6px; }
    .report-title .status-badge { display: inline-block; margin-top: 10px; padding: 4px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; background: #27ae60; color: #fff; }
    /* Info sections */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
    .info-card { border: 1.5px solid #ddd; border-radius: 8px; padding: 16px; }
    .info-card.donor { border-right: 4px solid #2980b9; }
    .info-card.receiver { border-right: 4px solid #27ae60; }
    .info-card h3 { font-size: 13px; font-weight: 700; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .info-card .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #eee; }
    .info-card .info-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .info-card .label { font-size: 12px; color: #888; }
    .info-card .value { font-size: 13px; font-weight: 600; color: #1a1a2e; }
    /* Material section */
    .material-section { border: 1.5px solid #ddd; border-right: 4px solid #8e44ad; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .material-section h3 { font-size: 13px; font-weight: 700; color: #888; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px; }
    .material-name { font-size: 20px; font-weight: 900; color: #2c3e50; margin-bottom: 10px; }
    .material-detail { font-size: 12px; color: #555; margin-bottom: 6px; }
    /* Dates */
    .dates-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px; }
    .date-card { background: #f8f9fa; border-radius: 8px; padding: 14px; text-align: center; }
    .date-card .date-label { font-size: 11px; color: #888; margin-bottom: 4px; }
    .date-card .date-value { font-size: 13px; font-weight: 700; color: #2c3e50; }
    /* Signatures */
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 30px; }
    .sig-box { text-align: center; }
    .sig-box .sig-label { font-size: 12px; font-weight: 700; color: #555; margin-bottom: 8px; }
    .sig-box .sig-area { border-bottom: 2px solid #2c3e50; height: 60px; margin-bottom: 8px; }
    .sig-box .sig-name { font-size: 11px; color: #888; }
    /* Footer */
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #aaa; }
    @media print {
      @page { margin: 0; }
      body { margin: 1.5cm; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="org-info">
        <h1>KOON</h1>
        <p>منصة تبادل المواد الدراسية</p>
        <p>وحدة التنسيق الطلابي</p>
      </div>
      <div class="report-meta">
        <div class="report-id">#${reportId}</div>
        <p>تاريخ الطباعة: ${printDate}</p>
      </div>
    </div>

    <div class="report-title">
      <h2>📋 وثيقة تسليم مادة دراسية</h2>
      <div class="status-badge">${statusLabel}</div>
    </div>

    <div class="info-grid">
      <div class="info-card donor">
        <h3>📤 المتبرع (المرسل)</h3>
        <div class="info-row"><span class="label">الاسم</span><span class="value">${donorName}</span></div>
        <div class="info-row"><span class="label">رقم الهاتف</span><span class="value" dir="ltr">${donorPhone}</span></div>
      </div>
      <div class="info-card receiver">
        <h3>📥 المستلم (الحاجز)</h3>
        <div class="info-row"><span class="label">الاسم</span><span class="value">${receiverName}</span></div>
        <div class="info-row"><span class="label">رقم الهاتف</span><span class="value" dir="ltr">${receiverPhone}</span></div>
      </div>
    </div>

    <div class="material-section">
      <h3>📚 تفاصيل المادة</h3>
      <div class="material-name">${materialName}</div>
      ${notes !== '-' ? `<div class="material-detail"><strong>الملاحظات:</strong> ${notes}</div>` : ''}
    </div>

    <div class="dates-section">
      <div class="date-card">
        <div class="date-label">📅 تاريخ الحجز</div>
        <div class="date-value">${bookingDate}</div>
      </div>
      <div class="date-card">
        <div class="date-label">✅ تاريخ التسليم الفعلي</div>
        <div class="date-value">${bookingDate}</div>
      </div>
    </div>

    <div class="signatures">
      <div class="sig-box">
        <div class="sig-label">توقيع المتبرع</div>
        <div class="sig-area"></div>
        <div class="sig-name">${donorName}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">توقيع المستلم</div>
        <div class="sig-area"></div>
        <div class="sig-name">${receiverName}</div>
      </div>
      <div class="sig-box">
        <div class="sig-label">توقيع الإدارة</div>
        <div class="sig-area"></div>
        <div class="sig-name">KOON Admin</div>
      </div>
    </div>

    <div class="footer">
      وثيقة رسمية صادرة عن منصة KOON — جميع الحقوق محفوظة © ${new Date().getFullYear()}<br/>
      هذه الوثيقة تُثبت إتمام عملية تبادل المادة الدراسية بين الطرفين المذكورين أعلاه.
    </div>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        if (win) {
            win.document.write(html);
            win.document.close();
        } else {
            toast.error('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير');
        }
    };

    const generateAdjGroupReport = (group) => {
        const receiverName = group.receiverName || '-';
        const receiverPhone = group.receiverPhone || '-';
        const items = group.items || [];
        const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const reportId = `GRP-RCV-${group.receiverName?.slice(0, 3).toUpperCase()}`;

        const rows = items.map((item, idx) => `<tr>
            <td>${idx + 1}</td>
            <td>${item.material}</td>
            <td>${item.donorName}</td>
            <td dir="ltr" style="font-size:11px">${item.donorPhone || '-'}</td>
            <td>${item.deliveryDate}</td>
        </tr>`).join('');

        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>وثيقة تسليم طالب - ${receiverName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 40px; }
    .header { border-bottom: 3px solid #3498db; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
    .title { text-align: center; margin-bottom: 30px; }
    .info-box { background: #f8f9fa; padding: 20px; border-radius: 8px; border-right: 5px solid #3498db; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
    th { background: #3498db; color: #fff; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
    .sig-box { border-bottom: 2px solid #333; height: 80px; text-align: center; padding-top: 90px; }
    .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #7f8c8d; }
    @media print {
      @page { margin: 0; }
      body { margin: 1.5cm; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div><h1>KOON</h1><p>وحدة التنسيق الطلابي</p></div>
    <div style="text-align: left;"><p>#${reportId}</p><p>التاريخ: ${printDate}</p></div>
  </div>
  <div class="title"><h2>📋 وثيقة استلام مواد دراسية (طالب)</h2></div>
  <div class="info-box">
    <p><strong>اسم الطالب المستلم:</strong> ${receiverName}</p>
    <p><strong>رقم الهاتف:</strong> ${receiverPhone}</p>
  </div>
  <table>
    <thead><tr><th>#</th><th>المادة</th><th>اسم المتبرع</th><th>هاتف المتبرع</th><th>تاريخ التسليم</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="signatures">
    <div style="text-align: center;">
      <div style="border-bottom: 2px solid #333; height: 50px; width: 150px; margin: 0 auto 10px;"></div>
      <p style="margin: 0;">توقيع المستلم</p>
    </div>
    <div style="position: relative; text-align: center;">
      <div style="position: absolute; top: -70px; left: 50%; transform: translateX(-50%); opacity: 0.8;">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="55" fill="none" stroke="#3498db" stroke-width="2" stroke-dasharray="5,3" />
          <circle cx="60" cy="60" r="48" fill="none" stroke="#3498db" stroke-width="1" />
          <text x="60" y="45" text-anchor="middle" fill="#3498db" font-size="10" font-weight="bold">وحدة التنسيق الطلابي</text>
          <text x="60" y="65" text-anchor="middle" fill="#3498db" font-size="18" font-weight="900">KOON</text>
          <text x="60" y="85" text-anchor="middle" fill="#3498db" font-size="10" font-weight="bold">مختوم - STAMPED</text>
          <path d="M30 60 Q 60 90 90 60" fill="none" stroke="#3498db" stroke-width="1" opacity="0.5" />
        </svg>
      </div>
      <div style="border-bottom: 2px solid #333; height: 50px; width: 150px; margin: 0 auto 10px; position: relative; z-index: 1;"></div>
      <p style="margin: 0; position: relative; z-index: 1;">ختم وتوقيع وحدة التنسيق</p>
    </div>
  </div>
  <div class="footer">جميع الحقوق محفوظة منصة KOON © ${new Date().getFullYear()}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        win.document.write(html);
        win.document.close();
    };

    const generateDonorSummaryReport = (group) => {
        const donorName = group.donorName || '-';
        const donorPhone = group.donorPhone || '-';
        const items = group.items || [];
        const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const rows = items.map((item, idx) => `<tr>
            <td>${idx + 1}</td>
            <td>${item.material} ${item.status === 'available' ? '<small style="color:#e67e22">(متاح)</small>' : ''}</td>
            <td>${item.status === 'available' ? 'بعدها ما حجزها حد' : (item.receiverName || '-')}</td>
            <td>${item.status === 'available' ? '-' : (item.receiverPhone || '-')}</td>
            <td>${item.deliveryDate || '-'}</td>
        </tr>`).join('');

        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>كشف تبرعات - ${donorName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 40px; }
    .header { border-bottom: 3px solid #2ecc71; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
    .title { text-align: center; margin-bottom: 30px; }
    .info-box { background: #f8f9fa; padding: 20px; border-radius: 8px; border-right: 5px solid #2ecc71; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: right; }
    th { background: #2ecc71; color: #fff; }
    .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #7f8c8d; }
    @media print {
      @page { margin: 0; }
      body { margin: 1.5cm; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div><h1>KOON</h1><p>وحدة التنسيق الطلابي</p></div>
    <div style="text-align: left;"><p>التاريخ: ${printDate}</p></div>
  </div>
  <div class="title"><h2>📜 كشف مساهمات وتبرعات مادة دراسية</h2></div>
  <div class="info-box">
    <p><strong>اسم المتبرع (المساهم):</strong> ${donorName}</p>
    <p><strong>رقم الهاتف:</strong> ${donorPhone}</p>
  </div>
  <table>
    <thead><tr><th>#</th><th>المادة المُتبرّع بها</th><th>اسم الطالب المستلم</th><th>هاتف المستلم</th><th>تاريخ التسليم</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 50px;">
    <div style="text-align: center; color: #7f8c8d; font-size: 14px;">
      <p>مع تحيات</p>
      <p><strong>فريق منصة KOON</strong></p>
    </div>
    <div style="position: relative; text-align: center;">
       <div style="position: absolute; top: -90px; left: 50%; transform: translateX(-50%); opacity: 0.8;">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="55" fill="none" stroke="#2ecc71" stroke-width="2" stroke-dasharray="5,3" />
          <circle cx="60" cy="60" r="48" fill="none" stroke="#2ecc71" stroke-width="1" />
          <text x="60" y="45" text-anchor="middle" fill="#2ecc7Green1" font-size="10" font-weight="bold">وحدة التنسيق الطلابي</text>
          <text x="60" y="65" text-anchor="middle" fill="#2ecc71" font-size="18" font-weight="900">KOON</text>
          <text x="60" y="85" text-anchor="middle" fill="#2ecc71" font-size="10" font-weight="bold">مختوم - STAMPED</text>
        </svg>
      </div>
      <div style="border-bottom: 2px dashed #2ecc71; width: 180px; margin-bottom: 10px;"></div>
      <p style="margin: 0; font-weight: bold; color: #2ecc71;">ختم وحدة التنسيق - كُون</p>
    </div>
  </div>
  <div class="footer">شكراً لمساهمتك في مساعدة زملائك - منصة KOON © ${new Date().getFullYear()}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=900,height=700');
        win.document.write(html);
        win.document.close();
    };


    const generateAllReportsPrint = () => {
        const bookings = flattenedMaterials.filter(d => ['reserved', 'completed'].includes(d.materialItem.status));
        if (bookings.length === 0) {
            toast.error('لا توجد حجوزات نشطة للطباعة');
            return;
        }

        const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const rows = bookings.map((item, idx) => {
            const takerInfo = item.materialItem?.takerInfo || item.takerInfo || {};
            const bookingDateRaw = item.materialItem?.takerInfo?.bookedAt || item.materialItem?.takerInfo?.reservedAt || item.materialItem?.reservedAt || item.reservedAt || item.updatedAt || item.createdAt;
            return `<tr>
              <td>${idx + 1}</td>
              <td>${item.materialItem?.name || '-'}</td>
              <td>${item.studentName || '-'}${item.studentId ? ` (${item.studentId})` : ''}<br/><small dir="ltr">${item.phoneNumber || ''}</small></td>
              <td>${takerInfo.name || '-'}${takerInfo.studentId ? ` (${takerInfo.studentId})` : ''}<br/><small dir="ltr">${takerInfo.phone || ''}</small></td>
              <td>${item.materialItem?.notes || item.notes || '-'}</td>
              <td>${formatDate(bookingDateRaw)}</td>
              <td><span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${item.materialItem?.status === 'completed' ? '#27ae60' : '#e67e22'};color:#fff">${item.materialItem?.status === 'completed' ? 'تم التسليم' : 'محجوز'}</span></td>
            </tr>`;
        }).join('');

        const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <title>تقرير شامل للحجوزات</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
    * { margin:0;padding:0;box-sizing:border-box; }
    body { font-family:'Cairo',Arial,sans-serif;direction:rtl;background:#fff;color:#1a1a2e;padding:30px 40px; }
    .hdr { display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #2c3e50;padding-bottom:16px;margin-bottom:24px; }
    .hdr h1 { font-size:24px;font-weight:900;color:#2c3e50; }
    .hdr p { font-size:12px;color:#666;margin-top:4px; }
    h2 { font-size:18px;font-weight:700;margin-bottom:18px;color:#2c3e50;text-align:center; }
    table { width:100%;border-collapse:collapse;font-size:12px; }
    th { background:#2c3e50;color:#fff;padding:10px 8px;text-align:right;font-weight:700; }
    td { padding:9px 8px;border-bottom:1px solid #eee;vertical-align:top; }
    tr:nth-child(even) td { background:#f8f9fa; }
    small { color:#888; }
    .footer { margin-top:24px;text-align:center;font-size:10px;color:#aaa;border-top:1px solid #ddd;padding-top:12px; }
    @media print {
      @page { margin: 0; }
      body { margin: 1.5cm; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="hdr">
    <div><h1>KOON — تقرير شامل للحجوزات</h1><p>تاريخ الطباعة: ${printDate}</p></div>
    <div style="font-size:13px;font-weight:700;">الإجمالي: ${bookings.length} حجز</div>
  </div>
  <h2>سجل عمليات تبادل المواد الدراسية</h2>
  <table>
    <thead><tr><th>#</th><th>المادة</th><th>المتبرع</th><th>المستلم</th><th>الملاحظات</th><th>تاريخ الحجز</th><th>الحالة</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">وثيقة رسمية صادرة عن منصة KOON © ${new Date().getFullYear()}</div>
  <script>window.onload=()=>window.print();<\/script>
</body>
</html>`;

        const win = window.open('', '_blank', 'width=1000,height=700');
        if (win) {
            win.document.write(html);
            win.document.close();
        } else {
            toast.error('يرجى السماح بالنوافذ المنبثقة لطباعة التقرير');
        }
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

    const getBookingDate = (item) => {
        return item.materialItem?.takerInfo?.bookedAt ||
            item.materialItem?.takerInfo?.reservedAt ||
            item.materialItem?.reservedAt ||
            item.reservedAt ||
            item.updatedAt ||
            item.createdAt;
    };

    const getBookingTime = (item) => {
        const d = getBookingDate(item);
        if (!d) return 0;
        return d.toDate ? d.toDate().getTime() : new Date(d).getTime();
    };

    const { newBookings, archiveBookings } = useMemo(() => {
        const all = flattenedMaterials.filter(d => ['reserved', 'completed'].includes(d.materialItem.status));
        const res = { newBookings: [], archiveBookings: [] };
        const cutoffTime = cutoffDate.getTime();

        all.forEach(b => {
            const time = getBookingTime(b);
            if (time >= cutoffTime) {
                res.newBookings.push(b);
            } else {
                res.archiveBookings.push(b);
            }
        });

        // Sort both
        res.newBookings.sort((a, b) => getBookingTime(b) - getBookingTime(a));
        res.archiveBookings.sort((a, b) => getBookingTime(b) - getBookingTime(a));

        return res;
    }, [flattenedMaterials, cutoffDate]);

    const combinedCompleted = useMemo(() => {
        const fromMaterials = flattenedMaterials
            .filter(d => d.materialItem && d.materialItem.status === 'completed')
            .map(fm => ({
                ...fm,
                isAdjRecord: false,
                reportMaterialName: fm.materialItem.name,
                reportDonorName: fm.studentName,
                reportDonorPhone: fm.phoneNumber,
                reportReceiverName: fm.materialItem?.takerInfo?.name || fm.takerInfo?.name || '',
                reportReceiverPhone: fm.materialItem?.takerInfo?.phone || fm.takerInfo?.phone || '',
                reportNotes: fm.materialItem?.notes || fm.notes || '',
                reportDate: fm.materialItem?.takerInfo?.bookedAt || fm.materialItem?.takerInfo?.reservedAt || fm.createdAt
            }));

        const fromAdj = adjReports
            .filter(r => r.status === 'completed')
            .map(r => ({
                id: r.id,
                uniqueKey: 'adj-' + r.id,
                isAdjRecord: true,
                materialItem: { name: r.material, status: 'completed' },
                studentName: r.donorName,
                phoneNumber: r.donorPhone,
                takerInfo: { name: r.receiverName, phone: r.receiverPhone },
                reportMaterialName: r.material,
                reportDonorName: r.donorName,
                reportDonorPhone: r.donorPhone,
                reportReceiverName: r.receiverName,
                reportReceiverPhone: r.receiverPhone,
                reportNotes: r.notes || '',
                reportDate: r.updatedAt || r.createdAt,
            }));

        return [...fromMaterials, ...fromAdj].sort((a, b) => {
            const ta = a.reportDate;
            const tb = b.reportDate;
            return (tb?.toDate ? tb.toDate().getTime() : new Date(tb).getTime()) - (ta?.toDate ? ta.toDate().getTime() : new Date(ta).getTime());
        });
    }, [flattenedMaterials, adjReports]);

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#2c3e50', borderRight: '5px solid #3498db', paddingRight: '15px' }}>
                    {isAr ? '📋 الجدول الرئيسي المعتمد' : 'Main Approved Table'}
                </h2>
                <div style={{ color: '#7f8c8d', fontSize: '0.9rem', fontWeight: 'bold' }}>
                    {filteredMaterials.length} {isAr ? 'سجل متاح' : 'Records available'}
                </div>
            </div>
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
                                                <div className="student-info">
                                                    <span className="name">{item.studentName}</span>
                                                    {item.studentId && <span className="student-id">({item.studentId})</span>}
                                                </div>
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
                                        {(item.materialItem.status === 'reserved' || item.materialItem.status === 'completed') && item.materialItem.takerInfo ? (
                                            <div className="taker-info">
                                                <div className="taker-name-row">
                                                    <span className="party-label" style={{ fontSize: '0.65rem', marginBottom: '2px' }}>{isAr ? 'المستلم' : 'Receiver'}</span>
                                                    <span className="taker-name">{item.materialItem.takerInfo.name}</span>
                                                    {item.materialItem.takerInfo.studentId && (
                                                        <span className="taker-id">({item.materialItem.takerInfo.studentId})</span>
                                                    )}
                                                </div>
                                                <a
                                                    href={getWhatsappLink(item.materialItem.takerInfo.phone)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="taker-phone whatsapp-link"
                                                    dir="ltr"
                                                >
                                                    {item.materialItem.takerInfo.phone}
                                                </a>
                                            </div>
                                        ) : (
                                            <span className="no-data">-</span>
                                        )}
                                    </td>
                                    <td className="date-cell">
                                        {formatDate(
                                            item.materialItem?.takerInfo?.bookedAt ||
                                            item.materialItem?.takerInfo?.reservedAt ||
                                            item.materialItem?.reservedAt ||
                                            item.reservedAt ||
                                            item.createdAt
                                        )}
                                    </td>
                                    <td className="status-cell">
                                        <span className={`status-badge ${item.materialItem.status}`}>
                                            {item.materialItem.status === 'approved' ? (isAr ? 'موافق' : 'Approved') :
                                                item.materialItem.status === 'reserved' ? (isAr ? 'محجوز' : 'Reserved') :
                                                    (isAr ? 'قيد الانتظار' : 'Pending')}
                                        </span>
                                    </td>
                                    <td className="actions-cell">
                                        <div className="action-buttons">
                                            {item.materialItem.status !== 'completed' && (
                                                <button
                                                    className="btn-approve"
                                                    onClick={() => {
                                                        if (window.confirm(isAr ? 'هل تريد تمييز هذه المادة كمكتملة ونقلها للتقرير النهائي؟' : 'Mark as completed and move to final report?')) {
                                                            handleStatusUpdate(item.id, item.originalIndex, 'completed');
                                                        }
                                                    }}
                                                    title={isAr ? 'مكتمل' : 'Completed'}
                                                    style={{ background: '#27ae60', padding: '6px 15px', width: 'auto' }}
                                                >
                                                    {isAr ? 'مكتمل' : 'Completed'}
                                                </button>
                                            )}
                                            {item.materialItem.status === 'approved' && (
                                                <button
                                                    className="btn-reserve-manual"
                                                    onClick={() => setManualReserveItem({ id: item.id, index: item.originalIndex, materialName: item.materialItem.name })}
                                                    title={isAr ? 'حجز يدوي' : 'Manual Reserve'}
                                                >
                                                    🔒
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

            {/* New Bookings Section */}
            <div className="bookings-section" style={{ marginTop: '4rem' }}>
                <div className="admin-header" style={{ marginBottom: '1.5rem', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2>{isAr ? 'الحجوزات الجديدة (من اليوم)' : 'New Bookings (From Today)'}</h2>
                        <p>{isAr ? 'قائمة بالمواد المحجوزة حديثاً التي تمت من تاريخ اليوم' : 'Recent bookings made from today'}</p>
                    </div>
                    <button
                        onClick={generateAllReportsPrint}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#2c3e50', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}
                        title={isAr ? 'طباعة تقرير شامل لجميع الحجوزات' : 'Print all bookings report'}
                    >
                        🖨️ {isAr ? 'طباعة تقرير شامل' : 'Print All Reports'}
                    </button>
                </div>

                <div className="table-container">
                    <table className="excel-table bookings-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{isAr ? 'المادة' : 'Material'}</th>
                                <th>{isAr ? 'المتبرع (المرسل)' : 'Donor (Sender)'}</th>
                                <th>{isAr ? 'الحاجز (المستلم)' : 'Borrower (Receiver)'}</th>
                                <th>{isAr ? 'الملاحظات' : 'Notes'}</th>
                                <th>{isAr ? 'تاريخ الحجز' : 'Booking Date'}</th>
                                <th>{isAr ? 'الإجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {newBookings.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="empty-cell">
                                        <div className="empty-icon">📭</div>
                                        {isAr ? 'لا توجد حجوزات جديدة حالياً' : 'No new bookings'}
                                    </td>
                                </tr>
                            ) : (
                                newBookings.map((item, index) => (
                                    <tr key={item.uniqueKey} className={`booking-row ${item.materialItem.status}`}>
                                        <td className="index-cell">{index + 1}</td>
                                        <td className="materials-cell">
                                            {editingItem && editingItem.id === item.id && editingItem.index === item.originalIndex && editingItem.field === 'materialName' ? (
                                                <div className="edit-material-wrapper">
                                                    <input type="text" value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })} className="edit-material-input" autoFocus />
                                                    <button onClick={handleUpdateItem} className="btn-save-edit">✓</button>
                                                    <button onClick={() => setEditingItem(null)} className="btn-cancel-edit">✕</button>
                                                </div>
                                            ) : (
                                                <span className="material-badge reserved-badge editable-badge">
                                                    {item.materialItem.name}
                                                    <button className="edit-material-btn" onClick={() => setEditingItem({ id: item.id, index: item.originalIndex, field: 'materialName', value: item.materialItem.name })} title={isAr ? 'تعديل الاسم' : 'Edit name'}>✎</button>
                                                </span>
                                            )}
                                        </td>
                                        <td className="party-cell donor">
                                            <div className="party-info">
                                                <span className="party-label">{isAr ? 'المتبرع' : 'Donor'}</span>
                                                <span className="party-name">{item.studentName}</span>
                                                {item.studentId && <small className="party-id">{item.studentId}</small>}
                                                <a href={getWhatsappLink(item.phoneNumber)} target="_blank" rel="noopener noreferrer" className="party-phone whatsapp-link" dir="ltr">{item.phoneNumber}</a>
                                            </div>
                                        </td>
                                        <td className="party-cell borrower">
                                            <div className="party-info">
                                                {(item.materialItem.takerInfo || item.takerInfo) ? (
                                                    <>
                                                        <span className="party-label">{isAr ? 'المستلم' : 'Receiver'}</span>
                                                        <span className="party-name">{(item.materialItem.takerInfo || item.takerInfo).name}</span>
                                                        {(item.materialItem.takerInfo || item.takerInfo).studentId && <small className="party-id">{(item.materialItem.takerInfo || item.takerInfo).studentId}</small>}
                                                        <a href={getWhatsappLink((item.materialItem.takerInfo || item.takerInfo).phone)} target="_blank" rel="noopener noreferrer" className="party-phone whatsapp-link" dir="ltr">{(item.materialItem.takerInfo || item.takerInfo).phone}</a>
                                                    </>
                                                ) : (
                                                    <span className="no-data" style={{ color: '#e74c3c', fontWeight: '700' }}>⚠️ غير مسجّل</span>
                                                )}
                                                <button onClick={() => {
                                                    const t = item.materialItem.takerInfo || item.takerInfo;
                                                    setEditTakerItem({ id: item.id, index: item.originalIndex, materialName: item.materialItem.name });
                                                    setEditTakerData({ name: t?.name || '', phone: t?.phone || '', studentId: t?.studentId || '' });
                                                }} title={isAr ? 'تعديل بيانات المستلم' : 'Edit receiver info'} style={{ marginTop: '6px', background: 'transparent', border: '1px solid #8e44ad', color: '#8e44ad', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>✏️ {isAr ? 'تعديل' : 'Edit'}</button>
                                            </div>
                                        </td>
                                        <td className="notes-cell" style={{ maxWidth: '150px' }}><span className="truncate-text" title={item.notes || '-'}>{item.notes || '-'}</span></td>
                                        <td className="date-cell">{formatDate(getBookingDate(item))}</td>
                                        <td className="actions-cell">
                                            <div className="action-buttons">
                                                <button className="btn-report" onClick={() => generateDeliveryReport(item)} title={isAr ? 'طباعة تقرير التسليم' : 'Print Delivery Report'} style={{ background: '#8e44ad', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'inherit', fontWeight: '700', whiteSpace: 'nowrap' }}>📄 {isAr ? 'تقرير' : 'Report'}</button>
                                                {item.materialItem.status === 'completed' ? (
                                                    <span className="status-badge completed">{isAr ? 'تم التسليم' : 'Completed'}</span>
                                                ) : (
                                                    <>
                                                        <button className="btn-approve" onClick={() => { if (window.confirm(isAr ? 'هل تم تسليم المادة بنجاح؟ سيتم نقلها فوراً للتقرير النهائي (الأرشيف).' : 'Confirm handover?')) { handleMoveToFinal(item); } }} title={isAr ? 'إتمام التسليم والترحيل' : 'Move to Final Report'} style={{ width: 'auto', minWidth: '100px', padding: '0 10px', gap: '4px', background: '#27ae60' }}>✓ {isAr ? 'إتمام وترحيل' : 'Done & Final'}</button>
                                                        <button className="btn-cancel" onClick={() => handleStatusUpdate(item.id, item.originalIndex, 'approved')} title={isAr ? 'إلغاء الحجز' : 'Cancel'}>🚫</button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Archive Bookings Section */}
            <div className="archive-section" style={{ marginTop: '2rem', background: '#fcfcfc', border: '2px dashed #ddd', borderRadius: '12px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setArchiveOpen(!archiveOpen)}>
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ fontSize: '1.2rem', color: '#666', marginBottom: '0.2rem' }}>📂 {isAr ? 'الأرشيف والتقرير النهائي' : 'Archive & Final Report'}</h2>
                        <p style={{ fontSize: '0.9rem', color: '#999' }}>{isAr ? 'الحجوزات السابقة وسجل عمليات التسليم المكتملة' : 'Previous bookings and completed delivery records'}</p>
                    </div>
                    <div style={{ fontSize: '1.5rem', color: '#999' }}>{archiveOpen ? '▼' : '▲'}</div>
                </div>

                {archiveOpen && (
                    <>
                        {/* Final Delivery Report Table inside Archive */}
                        <div className="bookings-section" style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                            <div className="admin-header" style={{ marginBottom: '1.5rem', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'transparent', padding: 0 }}>
                                <div>
                                    <h2 style={{ color: '#27ae60', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                                        📋 التقرير النهائي للتسليم
                                    </h2>
                                    <p style={{ fontSize: '0.85rem' }}>سجل عمليات التسليم المكتملة بين الطلاب</p>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span style={{ background: '#27ae60', color: '#fff', borderRadius: '20px', padding: '4px 14px', fontSize: '12px', fontWeight: '700' }}>
                                        {combinedCompleted.length} عملية مكتملة
                                    </span>
                                    <button
                                        onClick={() => {
                                            const completed = combinedCompleted;
                                            if (completed.length === 0) { toast.error('لا توجد عمليات مكتملة للطباعة'); return; }
                                            const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                                            const rows = completed.map((item, idx) => {
                                                const d = formatDate(item.reportDate);
                                                return `<tr>
                                                  <td>${idx + 1}</td>
                                                  <td><strong>${item.reportMaterialName || '-'}</strong></td>
                                                  <td>${item.reportDonorName || '-'}<br/><small dir="ltr">${item.reportDonorPhone || ''}</small></td>
                                                  <td>${item.reportReceiverName || '-'}<br/><small dir="ltr">${item.reportReceiverPhone || ''}</small></td>
                                                  <td>${d}</td>
                                                  <td style="text-align:center"><span style="background:#27ae60;color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700">✓ تم التسليم</span></td>
                                                </tr>`;
                                            }).join('');
                                            const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"/><title>التقرير النهائي للتسليم</title>
                                            <style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
                                            *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',Arial,sans-serif;direction:rtl;padding:30px 40px;color:#1a1a2e}
                                            .hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #27ae60;padding-bottom:16px;margin-bottom:24px}
                                            .hdr h1{font-size:22px;font-weight:900;color:#27ae60}.hdr p{font-size:12px;color:#666;margin-top:4px}
                                            h2{font-size:16px;font-weight:700;margin-bottom:16px;color:#2c3e50;text-align:center}
                                            table{width:100%;border-collapse:collapse;font-size:12px}
                                            th{background:#27ae60;color:#fff;padding:10px 8px;text-align:right;font-weight:700}
                                            td{padding:9px 8px;border-bottom:1px solid #eee;vertical-align:top}tr:nth-child(even) td{background:#f0fff4}
                                            small{color:#888}.footer{margin-top:24px;text-align:center;font-size:10px;color:#aaa;border-top:1px solid #ddd;padding-top:12px}
                                            @media print{@page{margin:0}body{margin:1.5cm;print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head>
                                            <body><div class="hdr"><div><h1>📋 KOON — التقرير النهائي للتسليم</h1><p>تاريخ الطباعة: ${printDate}</p></div>
                                            <div style="font-size:13px;font-weight:700;background:#27ae60;color:#fff;padding:6px 14px;border-radius:8px">${completed.length} عملية مكتملة</div></div>
                                            <h2>سجل عمليات تبادل وتسليم المواد الدراسية المكتملة</h2>
                                            <table><thead><tr><th>#</th><th>المادة</th><th>المتبرع</th><th>المستلم</th><th>تاريخ التسليم</th><th>الحالة</th></tr></thead>
                                            <tbody>${rows}</tbody></table>
                                            <div class="footer">وثيقة رسمية صادرة عن منصة KOON © ${new Date().getFullYear()}</div>
                                            <script>window.onload=()=>window.print();<\/script></body></html>`;
                                            const win = window.open('', '_blank', 'width=1000,height=700');
                                            if (win) { win.document.write(html); win.document.close(); }
                                            else toast.error('يرجى السماح بالنوافذ المنبثقة');
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                                    >
                                        🖨️ طباعة التقرير النهائي
                                    </button>
                                </div>
                            </div>

                            <div className="table-container">
                                <table className="excel-table bookings-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>المادة</th>
                                            <th>المتبرع (المرسل)</th>
                                            <th>الهاتف</th>
                                            <th>المستلم (الحاجز)</th>
                                            <th>الهاتف</th>
                                            <th>تاريخ التسليم</th>
                                            <th>الحالة</th>
                                            <th>تقرير</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {combinedCompleted.length === 0 ? (
                                            <tr>
                                                <td colSpan="9" className="empty-cell">لا توجد عمليات تسليم مكتملة بعد</td>
                                            </tr>
                                        ) : (
                                            combinedCompleted.map((item, index) => {
                                                const deliveryDate = formatDate(item.reportDate);
                                                return (
                                                    <tr key={item.uniqueKey} className="booking-row completed" style={{ background: 'rgba(39,174,96,0.04)', textDecoration: 'line-through', opacity: 0.7 }}>
                                                        <td className="index-cell">{index + 1}</td>
                                                        <td>
                                                            <span className="material-badge" style={{ background: 'rgba(39,174,96,0.12)', color: '#1e8449' }}>
                                                                {item.reportMaterialName || '-'}
                                                            </span>
                                                        </td>
                                                        <td>{item.reportDonorName || '-'}</td>
                                                        <td dir="ltr" style={{ fontSize: '11px' }}>{item.reportDonorPhone}</td>
                                                        <td>{item.reportReceiverName || '⚠️ غير مسجّل'}</td>
                                                        <td dir="ltr" style={{ fontSize: '11px' }}>{item.reportReceiverPhone}</td>
                                                        <td style={{ fontSize: '11px' }}>{deliveryDate}</td>
                                                        <td><span className="status-badge completed" style={{ background: '#27ae60' }}>✓ تم التسليم</span></td>
                                                        <td>
                                                            {!item.isAdjRecord && (
                                                                <button onClick={() => generateDeliveryReport(item)} style={{ background: '#8e44ad', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer' }}>📄</button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Previous Bookings Archive */}
                        <div style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '1.5rem' }}>
                            <h3 style={{ fontSize: '1rem', color: '#666', marginBottom: '1rem', textAlign: 'right' }}>📂 {isAr ? 'أرشيف الحجوزات السابقة (قبل اليوم)' : 'Previous Bookings Archive'}</h3>
                            <div className="table-container" style={{ opacity: 0.85 }}>
                                <table className="excel-table archive-table">
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>{isAr ? 'المادة' : 'Material'}</th>
                                            <th>{isAr ? 'المتبرع (المرسل)' : 'Donor (Sender)'}</th>
                                            <th>{isAr ? 'الحاجز (المستلم)' : 'Borrower (Receiver)'}</th>
                                            <th>{isAr ? 'تاريخ الحجز' : 'Booking Date'}</th>
                                            <th>{isAr ? 'الحالة' : 'Status'}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {archiveBookings.length === 0 ? (
                                            <tr>
                                                <td colSpan="6" className="empty-cell">{isAr ? 'لا توجد حجوزات مؤرشفة' : 'No archived bookings'}</td>
                                            </tr>
                                        ) : (
                                            archiveBookings.map((item, index) => (
                                                <tr key={item.uniqueKey} className="archive-row">
                                                    <td className="index-cell">{index + 1}</td>
                                                    <td>{item.materialItem.name}</td>
                                                    <td>{item.studentName}</td>
                                                    <td>{(item.materialItem.takerInfo || item.takerInfo)?.name || '-'}</td>
                                                    <td>{formatDate(getBookingDate(item))}</td>
                                                    <td>
                                                        <span className={`status-badge ${item.materialItem.status}`}>
                                                            {isAr ? (item.materialItem.status === 'completed' ? 'تم التسليم' : 'محجوز') : item.materialItem.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
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

            {/* Manual Reserve Modal */}
            {manualReserveItem && (
                <div className="confirmation-modal-overlay">
                    <div className="confirmation-modal">
                        <h3>{isAr ? 'حجز مادة يدوياً' : 'Manual Material Reserve'}</h3>
                        <p style={{ marginBottom: '1rem' }}>
                            {isAr ? 'حجز مادة: ' : 'Reserving item: '} <strong>{manualReserveItem.materialName}</strong>
                        </p>

                        <div className="booking-form" style={{ background: 'transparent', padding: 0 }}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <input
                                    type="text"
                                    placeholder={isAr ? 'اسم الطالب المستلم' : 'Receiver Name'}
                                    className="form-input"
                                    value={manualTakerData.name}
                                    onChange={(e) => setManualTakerData({ ...manualTakerData, name: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <input
                                    type="tel"
                                    placeholder={isAr ? 'رقم الهاتف' : 'Phone Number'}
                                    className="form-input"
                                    value={manualTakerData.phone}
                                    onChange={(e) => setManualTakerData({ ...manualTakerData, phone: e.target.value })}
                                    dir="ltr"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <input
                                    type="text"
                                    placeholder={isAr ? 'ملاحظات إضافية' : 'Notes'}
                                    className="form-input"
                                    value={manualTakerData.notes}
                                    onChange={(e) => setManualTakerData({ ...manualTakerData, notes: e.target.value })}
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: '700' }}>
                                    {isAr ? 'وقت الحجز (اختياري)' : 'Booking Time (Optional)'}
                                </label>
                                <input
                                    type="datetime-local"
                                    className="form-input"
                                    value={manualTakerData.time}
                                    onChange={(e) => setManualTakerData({ ...manualTakerData, time: e.target.value })}
                                    style={{ fontFamily: 'inherit' }}
                                />
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button
                                className="btn-cancel-modal"
                                onClick={() => {
                                    setManualReserveItem(null);
                                    setManualTakerData({ name: '', phone: '', notes: '', time: '' });
                                }}
                            >
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                className="btn-confirm-modal"
                                onClick={handleManualReserve}
                                style={{ background: '#3498db' }}
                            >
                                {isAr ? 'تأكيد الحجز' : 'Confirm Reserve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* ===== التقرير المعدّل الجديد ===== */}
            <div className="bookings-section" style={{ marginTop: '4rem', borderTop: '2px dashed #3498db', paddingTop: '2rem' }}>
                <div className="admin-header" style={{ marginBottom: '1.5rem', textAlign: 'right', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                        <h2 style={{ color: '#3498db', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🆕 التقرير المعدّل والجديد (منظم)
                        </h2>
                        <div style={{ display: 'flex', background: '#f1f2f6', borderRadius: '10px', padding: '4px', gap: '4px' }}>
                            <button
                                onClick={() => setAdjViewMode('receivers')}
                                style={{ flex: 1, padding: '8px 15px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '700', background: adjViewMode === 'receivers' ? '#fff' : 'transparent', color: adjViewMode === 'receivers' ? '#3498db' : '#666', boxShadow: adjViewMode === 'receivers' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.3s' }}
                            >
                                📥 سجل الحاجزين
                            </button>
                            <button
                                onClick={() => setAdjViewMode('donors')}
                                style={{ flex: 1, padding: '8px 15px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: '700', background: adjViewMode === 'donors' ? '#fff' : 'transparent', color: adjViewMode === 'donors' ? '#2ecc71' : '#666', boxShadow: adjViewMode === 'donors' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.3s' }}
                            >
                                📤 سجل المتبرعين
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={() => {
                                const becomingActive = !adjAdding;
                                setAdjAdding(becomingActive);
                                if (becomingActive) {
                                    setTimeout(() => {
                                        endOfTableRef.current?.scrollIntoView({ behavior: 'smooth' });
                                    }, 100);
                                }
                            }}
                            style={{ background: adjAdding ? '#e74c3c' : '#3498db', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                            {adjAdding ? 'إلغاء الإضافة' : '+ إضافة صف جديد'}
                        </button>
                    </div>
                </div>

                <div className="table-container">
                    <table className="excel-table bookings-table adj-table">
                        <thead>
                            {adjViewMode === 'receivers' ? (
                                <tr>
                                    <th style={{ width: '40px' }}>#</th>
                                    <th>الطالب المستلم</th>
                                    <th>هاتف المستلم</th>
                                    <th>المواد المحجوزة</th>
                                    <th>المتبرعون</th>
                                    <th>تاريخ التسليم</th>
                                    <th style={{ width: '120px' }}>الإجراءات</th>
                                </tr>
                            ) : (
                                <tr>
                                    <th style={{ width: '40px' }}>#</th>
                                    <th>المتبرع (المساهم)</th>
                                    <th>هاتف المتبرع</th>
                                    <th>المواد المُتبرّع بها</th>
                                    <th>المستلمون</th>
                                    <th>الحالة</th>
                                    <th style={{ width: '120px' }}>الإجراءات</th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {adjLoading ? (
                                <tr><td colSpan="7" className="loading-cell">جاري تحميل البيانات...</td></tr>
                            ) : adjViewMode === 'receivers' ? (
                                <>
                                    {groupedByReceiver.filter(group => group.items.some(it => it.status !== 'available')).map((group, idx) => (
                                        <tr key={idx}>
                                            <td>{idx + 1}</td>
                                            <td style={{ fontWeight: '700', color: '#2c3e50' }}>{group.receiverName}</td>
                                            <td dir="ltr" style={{ fontSize: '13px' }}>
                                                {group.receiverPhone ? (
                                                    <a href={getWhatsappLink(group.receiverPhone)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#3498db', cursor: 'pointer', fontWeight: '700' }} title="تواصل واتساب">
                                                        📱 {group.receiverPhone}
                                                    </a>
                                                ) : '-'}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    {group.items.filter(it => it.status !== 'available').map((it, i) => (
                                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8f9fa', padding: '4px 8px', borderRadius: '4px', borderRight: '3px solid #3498db' }}>
                                                            <span style={{ fontSize: '12px' }}>• {it.material}</span>
                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                {(it.status === 'reserved' || it.status === 'completed') && (
                                                                    <button
                                                                        className="btn-mini-action complete"
                                                                        onClick={(e) => { e.stopPropagation(); handleAdjComplete(it); }}
                                                                        title="تم واكتمل"
                                                                        style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px' }}
                                                                    >✅ تم</button>
                                                                )}
                                                                <button
                                                                    className="btn-mini-action edit"
                                                                    onClick={(e) => { e.stopPropagation(); setAdjEditing(it.id); setAdjEditData(it); }}
                                                                    title="تعديل"
                                                                >✏️</button>
                                                                <button
                                                                    className="btn-mini-action delete"
                                                                    onClick={(e) => { e.stopPropagation(); handleAdjDelete(it.id); }}
                                                                    title="حذف"
                                                                >🗑️</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {inlineAdjGroup === group.receiverName ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', background: '#e1f5fe', padding: '10px', borderRadius: '6px', border: '1px dashed #3498db' }}>
                                                            <input type="text" placeholder="المادة" value={newAdjRow.material} onChange={e => setNewAdjRow({ ...newAdjRow, material: e.target.value })} className="adj-input" autoFocus />
                                                            <input type="text" placeholder="المتبرع" value={newAdjRow.donorName} onChange={e => setNewAdjRow({ ...newAdjRow, donorName: e.target.value })} className="adj-input" />
                                                            <input type="text" placeholder="هاتف المتبرع" value={newAdjRow.donorPhone} onChange={e => setNewAdjRow({ ...newAdjRow, donorPhone: e.target.value })} className="adj-input" />
                                                            <input type="text" placeholder="ملاحظات" value={newAdjRow.notes} onChange={e => setNewAdjRow({ ...newAdjRow, notes: e.target.value })} className="adj-input" />
                                                            <input type="text" placeholder="التاريخ" value={newAdjRow.deliveryDate} onChange={e => setNewAdjRow({ ...newAdjRow, deliveryDate: e.target.value })} className="adj-input" />
                                                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                                <button onClick={handleAdjAdd} className="btn-save-adj" style={{ flex: 1 }}>✅ حفظ</button>
                                                                <button onClick={() => setInlineAdjGroup(null)} className="btn-cancel-adj" style={{ padding: '6px 12px' }}>❌ إلغاء</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => { setInlineAdjGroup(group.receiverName); setNewAdjRow({ ...emptyAdjRow, receiverName: group.receiverName, receiverPhone: group.receiverPhone }); }}
                                                            style={{ background: '#e1f5fe', color: '#01579b', border: '1px dashed #01579b', borderRadius: '4px', padding: '6px', fontSize: '11px', cursor: 'pointer', marginTop: '4px', fontWeight: '700', width: '100%' }}
                                                        >
                                                            ➕ إضافة مادة لهذا الطالب
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '11px', color: '#666' }}>
                                                    {group.items.filter(it => it.status !== 'available').map((it, i) => (
                                                        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                            👤 {it.donorName}
                                                            {it.donorPhone && (
                                                                <a href={getWhatsappLink(it.donorPhone)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#27ae60', cursor: 'pointer', fontSize: '10px' }} title="تواصل واتساب">
                                                                    📱 <span dir="ltr">{it.donorPhone}</span>
                                                                </a>
                                                            )}
                                                            <div style={{ display: 'flex', gap: '4px', marginRight: 'auto' }}>
                                                                {(it.status === 'reserved' || it.status === 'completed') && (
                                                                    <button
                                                                        className="btn-mini-action complete"
                                                                        onClick={(e) => { e.stopPropagation(); handleAdjComplete(it); }}
                                                                        title="تم واكتمل"
                                                                        style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px' }}
                                                                    >✅ تم</button>
                                                                )}
                                                                <button
                                                                    className="btn-mini-action edit"
                                                                    onClick={(e) => { e.stopPropagation(); setAdjEditing(it.id); setAdjEditData(it); }}
                                                                    title="تعديل"
                                                                >✏️</button>
                                                                <button
                                                                    className="btn-mini-action delete"
                                                                    onClick={(e) => { e.stopPropagation(); handleAdjDelete(it.id); }}
                                                                    title="حذف"
                                                                >🗑️</button>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </td>
                                            <td style={{ fontSize: '11px' }}>{group.items[0]?.deliveryDate}</td>
                                            <td>
                                                <button
                                                    onClick={() => generateAdjGroupReport(group)}
                                                    style={{ background: '#3498db', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                                                >
                                                    📄 وثيقة شاملة
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                    }
                                    {adjAdding && (
                                        <tr className="adding-row" style={{ background: '#fff9db' }} ref={endOfTableRef}>
                                            <td>+</td>
                                            <td><input type="text" placeholder="المستلم" value={newAdjRow.receiverName} onChange={e => setNewAdjRow({ ...newAdjRow, receiverName: e.target.value })} className="adj-input" /></td>
                                            <td><input type="text" placeholder="هاتف المستلم" value={newAdjRow.receiverPhone} onChange={e => setNewAdjRow({ ...newAdjRow, receiverPhone: e.target.value })} className="adj-input" /></td>
                                            <td><input type="text" placeholder="المادة" value={newAdjRow.material} onChange={e => setNewAdjRow({ ...newAdjRow, material: e.target.value })} className="adj-input" /></td>
                                            <td><input type="text" placeholder="المتبرع" value={newAdjRow.donorName} onChange={e => setNewAdjRow({ ...newAdjRow, donorName: e.target.value })} className="adj-input" /></td>
                                            <td><input type="text" placeholder="التاريخ" value={newAdjRow.deliveryDate} onChange={e => setNewAdjRow({ ...newAdjRow, deliveryDate: e.target.value })} className="adj-input" /></td>
                                            <td><button onClick={handleAdjAdd} className="btn-save-adj">✅ حفظ</button></td>
                                        </tr>
                                    )}
                                </>
                            ) : (
                                <>
                                    {adjAdding && (
                                        <tr className="adding-row" style={{ background: '#fff9db' }} ref={endOfTableRef}>
                                            <td>+</td>
                                            <td><input type="text" placeholder="المتبرع" value={newAdjRow.donorName} onChange={e => setNewAdjRow({ ...newAdjRow, donorName: e.target.value })} className="adj-input" /></td>
                                            <td><input type="text" placeholder="هاتف المتبرع" value={newAdjRow.donorPhone} onChange={e => setNewAdjRow({ ...newAdjRow, donorPhone: e.target.value })} className="adj-input" /></td>
                                            <td><input type="text" placeholder="المادة" value={newAdjRow.material} onChange={e => setNewAdjRow({ ...newAdjRow, material: e.target.value })} className="adj-input" /></td>
                                            <td><input type="text" placeholder="المستلم" value={newAdjRow.receiverName} onChange={e => setNewAdjRow({ ...newAdjRow, receiverName: e.target.value })} className="adj-input" /></td>
                                            <td>-</td>
                                            <td><button onClick={handleAdjAdd} className="btn-save-adj">✅ حفظ</button></td>
                                        </tr>
                                    )}
                                    {groupedByDonor.length === 0 ? (
                                        <tr><td colSpan="7" className="empty-cell">لا توجد بيانات متبرعين</td></tr>
                                    ) : (
                                        groupedByDonor.map((group, idx) => (
                                            <tr key={idx}>
                                                <td>{idx + 1}</td>
                                                <td style={{ fontWeight: '700', color: '#2ecc71' }}>{group.donorName}</td>
                                                <td dir="ltr" style={{ fontSize: '13px' }}>
                                                    {group.donorPhone ? (
                                                        <a href={getWhatsappLink(group.donorPhone)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#27ae60', cursor: 'pointer', fontWeight: '700' }} title="تواصل واتساب">
                                                            📱 {group.donorPhone}
                                                        </a>
                                                    ) : '-'}
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {group.items.map((it, i) => (
                                                            <div key={i} style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                background: it.status === 'available' ? '#fff5f5' : '#f0fff4',
                                                                padding: '4px 8px',
                                                                borderRadius: '4px',
                                                                borderRight: `3px solid ${it.status === 'available' ? '#e74c3c' : '#2ecc71'}`,
                                                                marginBottom: '2px'
                                                            }}>
                                                                <span
                                                                    style={{
                                                                        fontSize: '12px',
                                                                        fontWeight: it.status === 'available' ? '400' : '600',
                                                                        cursor: it.status === 'available' ? 'pointer' : 'default'
                                                                    }}
                                                                    onClick={() => {
                                                                        if (it.status === 'available') {
                                                                            const originalId = it.id.startsWith('fm-') ? it.id.split('-')[1] : it.id;
                                                                            setManualReserveItem({
                                                                                id: originalId,
                                                                                index: it.originalIndex,
                                                                                materialName: it.material
                                                                            });
                                                                        }
                                                                    }}
                                                                >
                                                                    • {it.material}
                                                                    {it.status === 'available' ? (
                                                                        <small style={{ color: '#e74c3c', marginRight: '5px' }}>(متاحة - اضغط للحجز)</small>
                                                                    ) : (
                                                                        it.receiverName && it.receiverName !== 'بعدها ما حجزها حد' && <small style={{ color: '#27ae60', marginRight: '10px', fontWeight: '800' }}>({isAr ? 'حجزها' : 'Reserved by'}: {it.receiverName})</small>
                                                                    )}
                                                                </span>
                                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                                    {(it.status === 'reserved' || it.status === 'completed') && (
                                                                        <button
                                                                            className="btn-mini-action complete"
                                                                            onClick={(e) => { e.stopPropagation(); handleAdjComplete(it); }}
                                                                            title="تم واكتمل"
                                                                            style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px' }}
                                                                        >✅ تم</button>
                                                                    )}
                                                                    <button
                                                                        className="btn-mini-action edit"
                                                                        onClick={(e) => { e.stopPropagation(); setAdjEditing(it.id); setAdjEditData(it); }}
                                                                        title="تعديل"
                                                                    >✏️</button>
                                                                    <button
                                                                        className="btn-mini-action delete"
                                                                        onClick={(e) => { e.stopPropagation(); handleAdjDelete(it.id); }}
                                                                        title="حذف"
                                                                    >🗑️</button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {inlineAdjGroup === group.donorName ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', background: '#e8f5e9', padding: '10px', borderRadius: '6px', border: '1px dashed #2ecc71' }}>
                                                                <input type="text" placeholder="المادة" value={newAdjRow.material} onChange={e => setNewAdjRow({ ...newAdjRow, material: e.target.value })} className="adj-input" autoFocus />
                                                                <input type="text" placeholder="المستلم" value={newAdjRow.receiverName} onChange={e => setNewAdjRow({ ...newAdjRow, receiverName: e.target.value })} className="adj-input" />
                                                                <input type="text" placeholder="هاتف المستلم" value={newAdjRow.receiverPhone} onChange={e => setNewAdjRow({ ...newAdjRow, receiverPhone: e.target.value })} className="adj-input" />
                                                                <input type="text" placeholder="ملاحظات" value={newAdjRow.notes} onChange={e => setNewAdjRow({ ...newAdjRow, notes: e.target.value })} className="adj-input" />
                                                                <input type="text" placeholder="التاريخ" value={newAdjRow.deliveryDate} onChange={e => setNewAdjRow({ ...newAdjRow, deliveryDate: e.target.value })} className="adj-input" />
                                                                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                                    <button onClick={handleAdjAdd} className="btn-save-adj" style={{ flex: 1 }}>✅ حفظ</button>
                                                                    <button onClick={() => setInlineAdjGroup(null)} className="btn-cancel-adj" style={{ padding: '6px 12px' }}>❌ إلغاء</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => { setInlineAdjGroup(group.donorName); setNewAdjRow({ ...emptyAdjRow, donorName: group.donorName, donorPhone: group.donorPhone }); }}
                                                                style={{ background: '#e8f5e9', color: '#2e7d32', border: '1px dashed #2e7d32', borderRadius: '4px', padding: '6px', fontSize: '11px', cursor: 'pointer', marginTop: '4px', fontWeight: '700', width: '100%' }}
                                                            >
                                                                ➕ إضافة تبرع جديد لهذا الشخص
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '11px', color: '#666' }}>
                                                        {group.items.map((it, i) => (
                                                            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                                {it.status === 'available' ? (
                                                                    <span style={{ color: '#95a5a6' }}>⏳ بعدها ما حجزها حد</span>
                                                                ) : (
                                                                    <>
                                                                        🎓 {it.receiverName}
                                                                        {it.receiverPhone && (
                                                                            <a href={getWhatsappLink(it.receiverPhone)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', color: '#27ae60', cursor: 'pointer', fontSize: '10px' }} title="تواصل واتساب">
                                                                                📱 <span dir="ltr">{it.receiverPhone}</span>
                                                                            </a>
                                                                        )}
                                                                    </>
                                                                )}
                                                                <div style={{ display: 'flex', gap: '4px', marginRight: 'auto' }}>
                                                                    {(it.status === 'reserved' || it.status === 'completed') && (
                                                                        <button
                                                                            className="btn-mini-action complete"
                                                                            onClick={(e) => { e.stopPropagation(); handleAdjComplete(it); }}
                                                                            title="تم واكتمل"
                                                                            style={{ background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '2px 6px', fontSize: '10px' }}
                                                                        >✅ تم</button>
                                                                    )}
                                                                    <button
                                                                        className="btn-mini-action edit"
                                                                        onClick={(e) => { e.stopPropagation(); setAdjEditing(it.id); setAdjEditData(it); }}
                                                                        title="تعديل"
                                                                    >✏️</button>
                                                                    {!it.isProcessed && it.id.startsWith('fm-') ? null : (
                                                                        <button
                                                                            className="btn-mini-action delete"
                                                                            onClick={(e) => { e.stopPropagation(); handleAdjDelete(it.id); }}
                                                                            title="حذف"
                                                                        >🗑️</button>
                                                                    )}
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </td>
                                                <td style={{ fontSize: '11px' }}>
                                                    {group.items.every(it => it.status !== 'available') ? (
                                                        <span style={{ color: '#27ae60', fontWeight: '700' }}>✅ مكتمل</span>
                                                    ) : group.items.every(it => it.status === 'available') ? (
                                                        <span style={{ color: '#e67e22', fontWeight: '600' }}>📦 متاح بالكامل</span>
                                                    ) : (
                                                        <span style={{ color: '#3498db', fontWeight: '600' }}>🔄 حجز جزئي</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <button
                                                        onClick={() => generateDonorSummaryReport(group)}
                                                        style={{ background: '#2ecc71', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}
                                                    >
                                                        📜 كشف تبرعات
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="report-mgmt-buttons">
                    <button className="btn-mgmt-blue" onClick={() => { setAdjAdding(!adjAdding); window.scrollTo({ top: document.querySelector('.adj-reports-table-container')?.offsetTop - 100, behavior: 'smooth' }); }}>
                        {adjAdding ? 'إلغاء الإضافة' : '+ إضافة صف جديد'}
                    </button>
                    <button className="btn-mgmt-purple" onClick={() => window.print()} style={{ background: '#8e44ad' }}>🖨️ طباعة السجل</button>
                </div>
            </div>


            {editTakerItem && (
                <div className="confirmation-modal-overlay">
                    <div className="confirmation-modal">
                        <h3>✏️ {isAr ? 'تعديل بيانات المستلم' : 'Edit Receiver Info'}</h3>
                        <p style={{ marginBottom: '1rem', color: '#666', fontSize: '13px' }}>
                            {isAr ? 'المادة: ' : 'Material: '} <strong>{editTakerItem.materialName}</strong>
                        </p>

                        <div className="booking-form" style={{ background: 'transparent', padding: 0 }}>
                            <div className="form-group" style={{ marginBottom: '0.8rem' }}>
                                <input
                                    type="text"
                                    placeholder={isAr ? 'اسم الطالب المستلم *' : 'Receiver Name *'}
                                    className="form-input"
                                    value={editTakerData.name}
                                    onChange={(e) => setEditTakerData({ ...editTakerData, name: e.target.value })}
                                    autoFocus
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '0.8rem' }}>
                                <input
                                    type="tel"
                                    placeholder={isAr ? 'رقم الهاتف *' : 'Phone Number *'}
                                    className="form-input"
                                    value={editTakerData.phone}
                                    onChange={(e) => setEditTakerData({ ...editTakerData, phone: e.target.value })}
                                    dir="ltr"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <input
                                    type="text"
                                    placeholder={isAr ? 'الرقم الجامعي (اختياري)' : 'Student ID (optional)'}
                                    className="form-input"
                                    value={editTakerData.studentId}
                                    onChange={(e) => setEditTakerData({ ...editTakerData, studentId: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="modal-actions">
                            <button
                                className="btn-cancel-modal"
                                onClick={() => { setEditTakerItem(null); setEditTakerData({ name: '', phone: '', studentId: '' }); }}
                            >
                                {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                            <button
                                className="btn-confirm-modal"
                                onClick={handleEditTakerSave}
                                style={{ background: '#8e44ad' }}
                            >
                                {isAr ? 'حفظ التعديل' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal لتعديل السجل الفردي في التقرير المعدّل */}
            {adjEditing && adjViewMode !== 'all' && (
                <div className="confirmation-modal-overlay">
                    <div className="confirmation-modal" style={{ maxWidth: '600px' }}>
                        <h3>✏️ تعديل بيانات السجل</h3>
                        <div className="booking-form" style={{ background: 'transparent', padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label style={{ fontSize: '12px', color: '#666' }}>المادة</label>
                                <input type="text" className="form-input" value={adjEditData.material} onChange={e => setAdjEditData({ ...adjEditData, material: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label style={{ fontSize: '12px', color: '#666' }}>اسم المتبرع</label>
                                <input type="text" className="form-input" value={adjEditData.donorName} onChange={e => setAdjEditData({ ...adjEditData, donorName: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label style={{ fontSize: '12px', color: '#666' }}>هاتف المتبرع</label>
                                <input type="text" className="form-input" value={adjEditData.donorPhone} onChange={e => setAdjEditData({ ...adjEditData, donorPhone: e.target.value })} dir="ltr" />
                            </div>
                            <div className="form-group">
                                <label style={{ fontSize: '12px', color: '#666' }}>اسم المستلم</label>
                                <input type="text" className="form-input" value={adjEditData.receiverName} onChange={e => setAdjEditData({ ...adjEditData, receiverName: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label style={{ fontSize: '12px', color: '#666' }}>هاتف المستلم</label>
                                <input type="text" className="form-input" value={adjEditData.receiverPhone} onChange={e => setAdjEditData({ ...adjEditData, receiverPhone: e.target.value })} dir="ltr" />
                            </div>
                            <div className="form-group">
                                <label style={{ fontSize: '12px', color: '#666' }}>تاريخ التسليم</label>
                                <input type="text" className="form-input" value={adjEditData.deliveryDate} onChange={e => setAdjEditData({ ...adjEditData, deliveryDate: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label style={{ fontSize: '12px', color: '#666' }}>ملاحظات</label>
                                <input type="text" className="form-input" value={adjEditData.notes} onChange={e => setAdjEditData({ ...adjEditData, notes: e.target.value })} />
                            </div>
                        </div>
                        <div className="modal-actions" style={{ marginTop: '20px' }}>
                            <button className="btn-cancel-modal" onClick={() => setAdjEditing(null)}>إلغاء</button>
                            <button className="btn-confirm-modal" style={{ background: '#2ecc71' }} onClick={handleAdjSaveEdit}>✅ حفظ التعديلات</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminExchange;
