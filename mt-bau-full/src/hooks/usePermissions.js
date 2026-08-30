// src/hooks/usePermissions.js
import { useMemo } from 'react';
import { hasPermission } from '../config/permissions';

export function usePermissions(session) {
  const isAdmin = Boolean(session?.isAdmin);
  const perms = session?.permissions || {};

  const can = useMemo(() => {
    return (key) => {
      if (isAdmin) return true;
      return hasPermission(perms, key, { isAdmin: false });
    };
  }, [isAdmin, perms]);

  const canAny = (keys = []) => keys.some(k => can(k));
  const canAll = (keys = []) => keys.every(k => can(k));

  return { can, canAny, canAll, isAdmin };
}
