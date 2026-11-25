// Mentor Call Analytics API (outgoing mentor -> student calls and WhatsApp contacts logged with feedback).
// All three calls accept `channel` = all | phone | whatsapp (passed through with the other filters).
// Separate from the Sales call analytics (/crm/call-analytics/); shares only the axios instance.
import api from './axios';

// Drop empty filters so the backend applies its defaults (e.g. last 30 days).
const clean = (params = {}) =>
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined));

export const getMentorCallAnalytics = async (params = {}) => {
    const res = await api.get('mentor-call-analytics/', { params: clean(params) });
    return res.data;
};

export const getMentorCalls = async (params = {}) => {
    const res = await api.get('mentor-call-analytics/calls/', { params: clean(params) });
    return res.data;
};

// Every filtered row (not one page), downloaded as a file. Same blob pattern as the student CSV export.
const downloadCsv = async (url, params, filenamePrefix) => {
    const res = await api.get(url, { params: { ...clean(params), export: 'csv' }, responseType: 'blob' });
    const urlBlob = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = urlBlob;
    link.setAttribute('download', `${filenamePrefix}_${params.start_date || ''}_${params.end_date || ''}.csv`.replace(/__/g, '_'));
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(urlBlob);
};

// Accepts outcome='connected' for the Connected drill-down.
export const exportMentorCallsCsv = (params = {}) =>
    downloadCsv('mentor-call-analytics/calls/', params, params.outcome === 'connected' ? 'mentor_connected' : 'mentor_calls');

// Active students in scope with no connected contact (phone or WhatsApp) in the date range.
export const getPendingStudents = async (params = {}) => {
    const res = await api.get('mentor-call-analytics/pending-students/', { params: clean(params) });
    return res.data;
};

export const exportPendingStudentsCsv = (params = {}) =>
    downloadCsv('mentor-call-analytics/pending-students/', params, 'pending_students');

// Filter dropdown sources (existing read endpoints). Each may fail for some roles; callers handle that.
const toList = (data) => (Array.isArray(data) ? data : data?.results || []);
export const getProgramsForFilter = async () => toList((await api.get('programs/', { params: { page_size: 1000 } })).data);
export const getCoursesForFilter = async () => toList((await api.get('courses/', { params: { page_size: 1000 } })).data);
export const getBatchesForFilter = async () => toList((await api.get('batches/', { params: { page_size: 1000 } })).data);
