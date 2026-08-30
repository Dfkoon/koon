import React from 'react';
import './PrintableDatabaseTable.css';

const PrintableDatabaseTable = ({
  title = '',
  subtitle = '',
  columns = [],
  rows = [],
}) => {
  const visibleRows = Array.isArray(rows) ? rows : [];

  return (
    <section className="print-section printable-table-card">
      <div className="print-card-header">
        <div>
          {title && <h2 className="print-card-title">{title}</h2>}
          {subtitle && <p className="print-card-subtitle">{subtitle}</p>}
        </div>

        <div className="print-actions no-print">
          <button type="button" className="btn-primary print-button" onClick={() => window.print()}>
            طباع
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="printable-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key || col.field}>{col.label || col.field}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length > 0 ? (
              visibleRows.map((row, index) => (
                <tr key={row.id ?? index}>
                  {columns.map((col) => (
                    <td key={col.key || col.field}>
                      {col.render ? col.render(row) : row[col.field] ?? ''}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="empty-row" colSpan={columns.length || 1}>
                  لا توجد بيانات للطباع
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default PrintableDatabaseTable;
