import client from './client';

const toList = (data) => (Array.isArray(data) ? data : data?.results || []);

// Backend scopes this by role: admins see every batch, mentors/teachers only their assigned batches.
// student_count only counts active, converted students (matches the student list).
export const getMentorBatches = async (params = {}) => {
  const response = await client.get('/students/mentor-batches/', { params });
  return toList(response.data);
};

// Same filter as the web dashboard: only converted (enrolled) students
export const getMentorStudents = async (params = {}) => {
  const response = await client.get('/students/', {
    // own_only: mentors see only their own batches' students (not their subordinates')
    params: { lead_status: 'CONVERTED', own_only: 'true', ...params },
  });
  return toList(response.data);
};

export const getBatchStudents = async (batchId) => {
  return getMentorStudents({ batch: batchId });
};

// own_only matches getMentorStudents: the student is looked up in the mentor's own batches only,
// so the backend never walks the reporting hierarchy for these per-student calls.
export const getStudentFeedbacks = async (studentId) => {
  const response = await client.get(`/students/${studentId}/feedbacks/`, { params: { own_only: 'true' } });
  return toList(response.data);
};

export const addStudentFeedback = async (studentId, payload) => {
  const response = await client.post(`/students/${studentId}/add_feedback/`, payload, {
    params: { own_only: 'true' },
  });
  return response.data;
};


export const uploadFeedbackRecording = async (studentId, p) => {
  // p = { mobileCallId, uri, name, type }
  const form = new FormData();
  form.append('mobile_call_id', p.mobileCallId);
  form.append('audio_recording', { uri: p.uri, name: p.name, type: p.type });
  const response = await client.post(`/students/${studentId}/feedback-recording/`, form, {
    params: { own_only: 'true' },
    headers: { 'Content-Type': 'multipart/form-data' },
    transformRequest: (d) => d, // hand FormData to the RN networking layer untouched
    timeout: 120000,
  });
  return response.data;
};


// Same numbers as the web Mentor dashboard (students_all = total, students = active)
export const getMentorDashboardStats = async (params = {}) => {
  const response = await client.get('/dashboard-stats/', { params: { own_only: 'true', ...params } });
  return response.data;
};

// Mentor call log: recent student feedback/call records for this mentor's students
export const getMentorRecentCalls = async (params = {}) => {
  const response = await client.get('/students/recent_feedbacks/', { params });
  return response.data;
};

// On break / rejoined / discontinued counts, same as the web dashboard
export const getMentorBreakMetrics = async (params = {}) => {
  const response = await client.get('/students/break_metrics/', { params: { own_only: 'true', ...params } });
  return response.data;
};