'use client';

import { useState, useCallback } from 'react';

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

interface ToastProps {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

// Simple toast store
let toasts: ToastMessage[] = [];
let listeners: Array<() => void> = [];

const generateId = () => Math.random().toString(36).substr(2, 9);

const addToast = (toast: ToastProps) => {
  const newToast: ToastMessage = {
    id: generateId(),
    ...toast,
    duration: toast.duration || 5000,
  };
  
  toasts = [...toasts, newToast];
  listeners.forEach(listener => listener());
  
  // Auto remove after duration
  setTimeout(() => {
    removeToast(newToast.id);
  }, newToast.duration);
  
  return newToast.id;
};

const removeToast = (id: string) => {
  toasts = toasts.filter(toast => toast.id !== id);
  listeners.forEach(listener => listener());
};

export const useToast = () => {
  const [, forceUpdate] = useState({});
  
  const refresh = useCallback(() => {
    forceUpdate({});
  }, []);
  
  // Subscribe to toast updates
  useState(() => {
    listeners.push(refresh);
    return () => {
      listeners = listeners.filter(listener => listener !== refresh);
    };
  });
  
  const toast = useCallback((props: ToastProps) => {
    return addToast(props);
  }, []);
  
  const dismiss = useCallback((id: string) => {
    removeToast(id);
  }, []);
  
  return {
    toast,
    dismiss,
    toasts,
  };
};

// Toast component styles and display logic would typically be handled by a Toast provider
// For now, this provides the basic functionality
export default useToast; 