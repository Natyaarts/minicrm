export const getInfoAsync = async (uri) => ({ exists: !String(uri).includes('missing_file') });
export const uploadAsync = async (url, uri, opts) => ({ status: 200 });
export const FileSystemUploadType = { MULTIPART: 'MULTIPART' };
