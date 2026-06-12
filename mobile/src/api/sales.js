import client from './client';

export const getStudents = async (params = {}) => {
  try {
    const response = await client.get('/students/', { params });
    if (response.data && Array.isArray(response.data.results)) {
      return response.data;
    }
    return { results: response.data || [], count: response.data?.length || 0 };
  } catch (error) {
    console.error('Failed to fetch students', error);
    return { results: [], count: 0 };
  }
};

export const getStudentDetails = async (id) => {
  try {
    const response = await client.get(`/students/${id}/`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch student details', error);
    return null;
  }
};
