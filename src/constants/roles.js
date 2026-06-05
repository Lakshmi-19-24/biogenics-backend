export const ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  SALES_EXECUTIVE: 'sales'
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.OWNER]: 'Owner',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.MANAGER]: 'Manager',
  [ROLES.SALES_EXECUTIVE]: 'Sales Executive'
});

export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.OWNER];

export const MANAGEMENT_ROLES = [ROLES.OWNER, ROLES.ADMIN, ROLES.MANAGER];
