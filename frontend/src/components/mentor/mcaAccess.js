// Who sees the "Call Analytics" tab in the Mentor Module. Mirrors backend/core/call_analytics.py
// (ALL_SCOPE_ROLES + HEAD_MENTOR_ROLES). The backend 403 is the real enforcement; this only hides the tab.
export const MCA_ALL_SCOPE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'];
export const MCA_HEAD_MENTOR_ROLES = ['HEAD - MENTOR'];

export const normalizeRole = (user) => String(user?.role || '').toUpperCase().trim();

export const canViewMentorCallAnalytics = (user) => {
    if (!user) return false;
    if (user.is_superuser) return true;
    const role = normalizeRole(user);
    return MCA_ALL_SCOPE_ROLES.includes(role) || MCA_HEAD_MENTOR_ROLES.includes(role);
};
