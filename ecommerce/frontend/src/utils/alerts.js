import toast from 'react-hot-toast';

const alerts = { success: toast.success, error: toast.error, info: toast };
export const useAlert = () => alerts;
