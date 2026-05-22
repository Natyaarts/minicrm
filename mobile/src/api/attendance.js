import client from './client';

export const getAttendanceStatus = async () => {
  try {
    const response = await client.get('/hrms/attendance/');
    // Usually returns a list of attendance records for today
    return response.data;
  } catch (error) {
    console.error('Failed to fetch attendance', error);
    return null;
  }
};

export const clockIn = async (latitude, longitude) => {
  try {
    const response = await client.post('/hrms/attendance/clock_in/', {
      latitude,
      longitude,
    });
    return { success: true, data: response.data };
  } catch (error) {
    const errorMsg = error.response?.data?.error || 'Clock in failed';
    return { success: false, error: errorMsg };
  }
};

export const clockOut = async () => {
  try {
    const response = await client.post('/hrms/attendance/clock_out/');
    return { success: true, data: response.data };
  } catch (error) {
    const errorMsg = error.response?.data?.error || 'Clock out failed';
    return { success: false, error: errorMsg };
  }
};
