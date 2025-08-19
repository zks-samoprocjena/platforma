import toast from 'react-hot-toast';

export const notify = {
  success: (message: string) => {
    return toast.success(message, {
      duration: 4000,
      position: 'top-right',
      style: {
        background: '#10b981',
        color: '#fff',
        fontSize: '14px',
        padding: '12px 16px',
        borderRadius: '8px',
      },
      iconTheme: {
        primary: '#fff',
        secondary: '#10b981',
      },
    });
  },
  
  error: (message: string) => {
    return toast.error(message, {
      duration: 6000,
      position: 'top-right',
      style: {
        background: '#ef4444',
        color: '#fff',
        fontSize: '14px',
        padding: '12px 16px',
        borderRadius: '8px',
      },
      iconTheme: {
        primary: '#fff',
        secondary: '#ef4444',
      },
    });
  },
  
  loading: (message: string) => {
    return toast.loading(message, {
      position: 'top-right',
      style: {
        fontSize: '14px',
        padding: '12px 16px',
        borderRadius: '8px',
      },
    });
  },
  
  promise: <T,>(
    promise: Promise<T>,
    msgs: {
      loading: string;
      success: string;
      error: string;
    }
  ) => {
    return toast.promise(promise, msgs, {
      position: 'top-right',
      style: {
        fontSize: '14px',
        padding: '12px 16px',
        borderRadius: '8px',
      },
      success: {
        duration: 4000,
        style: {
          background: '#10b981',
          color: '#fff',
        },
        iconTheme: {
          primary: '#fff',
          secondary: '#10b981',
        },
      },
      error: {
        duration: 6000,
        style: {
          background: '#ef4444',
          color: '#fff',
        },
        iconTheme: {
          primary: '#fff',
          secondary: '#ef4444',
        },
      },
    });
  },
  
  dismiss: (toastId?: string) => {
    if (toastId) {
      toast.dismiss(toastId);
    } else {
      toast.dismiss();
    }
  },
  
  custom: (message: string | React.ReactNode, options?: any) => {
    return toast.custom(message, {
      position: 'top-right',
      duration: 4000,
      ...options,
    });
  },
};