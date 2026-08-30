import React, { useState } from 'react';

/**
 * Material Filters and Search Component
 * Provides search and filtering for available materials
 */
const MaterialFiltersSection = ({
    materials,
    onFilterChange,
    isAr
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [availabilityFilter, setAvailabilityFilter] = useState('all');

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        onFilterChange({
            searchQuery: query,
            status: statusFilter,
            availability: availabilityFilter
        });
    };

    const handleStatusChange = (status) => {
        setStatusFilter(status);
        onFilterChange({
            searchQuery,
            status,
            availability: availabilityFilter
        });
    };

    const handleAvailabilityChange = (availability) => {
        setAvailabilityFilter(availability);
        onFilterChange({
            searchQuery,
            status: statusFilter,
            availability
        });
    };

    return (
        <div className="material-filters-container">
            <div className="filters-header">
                <h3>{isAr ? '🔍 البحث والفلاتر' : '🔍 Search & Filters'}</h3>
            </div>

            {/* Search Box */}
            <div className="search-box-wrapper">
                <div className="search-input-group">
                    <span className="search-icon">🔎</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder={isAr ? 'ابحث عن مادة، كتاب، أو وصف...' : 'Search for material, book, or description...'}
                        value={searchQuery}
                        onChange={handleSearchChange}
                    />
                    {searchQuery && (
                        <button
                            className="clear-search-btn"
                            onClick={() => handleSearchChange({ target: { value: '' } })}
                            title={isAr ? 'مسح البحث' : 'Clear'}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* Filter Pills */}
            <div className="filters-row">
                <div className="filter-group">
                    <span className="filter-label">{isAr ? 'الحال:' : 'Status:'}</span>
                    <div className="filter-buttons">
                        <button
                            className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
                            onClick={() => handleStatusChange('all')}
                        >
                            {isAr ? 'الكل' : 'All'}
                        </button>
                        <button
                            className={`filter-pill ${statusFilter === 'pending' ? 'active' : ''}`}
                            onClick={() => handleStatusChange('pending')}
                        >
                            ⏳ {isAr ? 'قيد المراجع' : 'Pending'}
                        </button>
                        <button
                            className={`filter-pill ${statusFilter === 'approved' ? 'active' : ''}`}
                            onClick={() => handleStatusChange('approved')}
                        >
                            ✅ {isAr ? 'معتمد' : 'Approved'}
                        </button>
                    </div>
                </div>

                <div className="filter-group">
                    <span className="filter-label">{isAr ? 'التوفر:' : 'Availability:'}</span>
                    <div className="filter-buttons">
                        <button
                            className={`filter-pill ${availabilityFilter === 'all' ? 'active' : ''}`}
                            onClick={() => handleAvailabilityChange('all')}
                        >
                            {isAr ? 'الكل' : 'All'}
                        </button>
                        <button
                            className={`filter-pill ${availabilityFilter === 'available' ? 'active' : ''}`}
                            onClick={() => handleAvailabilityChange('available')}
                        >
                            ✨ {isAr ? 'متاح' : 'Available'}
                        </button>
                        <button
                            className={`filter-pill ${availabilityFilter === 'reserved' ? 'active' : ''}`}
                            onClick={() => handleAvailabilityChange('reserved')}
                        >
                            🔒 {isAr ? 'محجوز' : 'Reserved'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Results Count */}
            <div className="filters-info">
                <p className="results-count">
                    {isAr ? `عدد النتائج: ${materials.length}` : `Results: ${materials.length}`}
                </p>
            </div>
        </div>
    );
};

export default MaterialFiltersSection;
