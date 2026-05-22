import client from './client';

export const getStudents = async (params = {}) => {
  try {
    const response = await client.get('/students/', { params });
    return response.data.results || response.data || [];
  } catch (error) {
    console.error('Failed to fetch students', error);
    return [];
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
