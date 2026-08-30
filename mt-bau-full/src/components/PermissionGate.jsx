// src/components/PermissionGate.jsx
import React from 'react';
import { usePermissions } from '../hooks/usePermissions';

export default function PermissionGate({ session, need, mode = 'any', fallback = null, children }) {
  const { can, canAny, canAll } = usePermissions(session);

  let allowed;
  if (Array.isArray(need)) {
    allowed = mode === 'all' ? canAll(need) : canAny(need);
  } else {
    allowed = can(need);
  }

  if (!allowed) return fallback;
  return <>{children}</>;
}
