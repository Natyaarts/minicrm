import client from './client';

export const getAttendanceStatus = async (date) => {
  try {
    const params = { my_only: 'true' };
    if (date) params.start_date = date; // only fetch today's record
    if (date) params.end_date = date;
    const response = await client.get('/hrms/attendance/', { params });
    // Usually returns a list of attendance records for today
    return response.data;
  } catch (error) {
    console.warn('Failed to fetch attendance:', error?.response?.status || error?.message);
    return null;
  }
};



export const clockIn = async (latitude, longitude, photo) => {
  try {
    const payload = { latitude, longitude };
    if (photo) {
      payload.photo = photo; // Base64 string from expo-image-picker
    }
    
    const response = await client.post('/hrms/attendance/clock_in/', payload);
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
