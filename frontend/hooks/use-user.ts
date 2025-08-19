import { useParams } from 'next/navigation';

export function useUser() {
  const params = useParams();
  const locale = (params?.locale as string) || 'hr';
  
  return {
    locale
  };
}