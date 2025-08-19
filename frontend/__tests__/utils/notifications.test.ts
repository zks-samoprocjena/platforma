import toast from 'react-hot-toast';
import { notify } from '@/utils/notifications';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
  loading: jest.fn(),
  promise: jest.fn(),
  dismiss: jest.fn(),
  custom: jest.fn(),
}));

describe('Notifications Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('notify.success', () => {
    it('calls toast.success with correct parameters', () => {
      const message = 'Operation successful!';
      notify.success(message);

      expect(toast.success).toHaveBeenCalledWith(message, {
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
    });
  });

  describe('notify.error', () => {
    it('calls toast.error with correct parameters', () => {
      const message = 'Something went wrong!';
      notify.error(message);

      expect(toast.error).toHaveBeenCalledWith(message, {
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
    });
  });

  describe('notify.loading', () => {
    it('calls toast.loading with correct parameters', () => {
      const message = 'Loading...';
      notify.loading(message);

      expect(toast.loading).toHaveBeenCalledWith(message, {
        position: 'top-right',
        style: {
          fontSize: '14px',
          padding: '12px 16px',
          borderRadius: '8px',
        },
      });
    });
  });

  describe('notify.promise', () => {
    it('calls toast.promise with correct parameters', async () => {
      const promise = Promise.resolve('Success!');
      const messages = {
        loading: 'Processing...',
        success: 'Done!',
        error: 'Failed!',
      };

      notify.promise(promise, messages);

      expect(toast.promise).toHaveBeenCalledWith(promise, messages, {
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
    });
  });

  describe('notify.dismiss', () => {
    it('calls toast.dismiss without parameters', () => {
      notify.dismiss();
      expect(toast.dismiss).toHaveBeenCalledWith();
    });

    it('calls toast.dismiss with specific toast ID', () => {
      const toastId = 'toast-123';
      notify.dismiss(toastId);
      expect(toast.dismiss).toHaveBeenCalledWith(toastId);
    });
  });

  describe('notify.custom', () => {
    it('calls toast.custom with message and default options', () => {
      const message = 'Custom notification';
      notify.custom(message);

      expect(toast.custom).toHaveBeenCalledWith(message, {
        position: 'top-right',
        duration: 4000,
      });
    });

    it('calls toast.custom with custom options', () => {
      const message = 'Custom notification';
      const options = { duration: 5000, position: 'bottom-center' as const };
      notify.custom(message, options);

      expect(toast.custom).toHaveBeenCalledWith(message, {
        position: 'top-right',
        duration: 4000,
        ...options,
      });
    });
  });
});