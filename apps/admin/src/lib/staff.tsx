import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PermissionMatrix, Role, StaffUser } from '@aus/contracts';
import { PERMISSION_MATRIX, ROLE_LABELS } from '@aus/contracts';
import { api, getStaffId, setStaffId } from './api';

interface StaffCtx {
  staff: StaffUser | null;
  permissions: PermissionMatrix | null;
  staffList: StaffUser[];
  setRole: (id: string) => void;
  loading: boolean;
  can: (perm: keyof PermissionMatrix) => boolean;
}

const Ctx = createContext<StaffCtx>(null as never);

export function StaffProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

  const perms = useQuery({
    queryKey: ['my-perms', getStaffId()],
    queryFn: () => api.admin.permissions(),
    retry: false,
  });

  const demoInfo = useQuery<{ demoAccounts: { staff: StaffUser[]; customers: unknown[] } }>({
    queryKey: ['demo-info'],
    queryFn: () => api.demo.info(),
    staleTime: 300_000,
  });

  const staff = perms.data?.staff ?? null;
  const permissions = perms.data?.permissions ?? null;
  const staffList = demoInfo.data?.demoAccounts.staff ?? [];

  const setRole = useCallback((id: string) => {
    setStaffId(id);
    qc.clear();
  }, [qc]);

  // Demo convenience: act as ADMIN until a role is explicitly chosen in the switcher.
  useEffect(() => {
    if (!getStaffId() && staffList.length > 0) {
      const admin = staffList.find((s) => s.role === 'ADMIN') ?? staffList[0];
      setStaffId(admin.id);
      qc.invalidateQueries();
    }
  }, [staffList, qc]);

  const value = useMemo<StaffCtx>(() => ({
    staff,
    permissions,
    staffList,
    setRole,
    loading: perms.isLoading || demoInfo.isLoading,
    can: (perm) => !!permissions?.[perm],
  }), [staff, permissions, staffList, setRole, perms.isLoading, demoInfo.isLoading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStaff(): StaffCtx {
  return useContext(Ctx);
}

export { ROLE_LABELS, PERMISSION_MATRIX };
export type { Role, PermissionMatrix };
