import { useState, useCallback, useRef } from 'react';
import { QuestionRequest } from '@/types/ai';
import { streamingRequest } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

interface StreamingState {
  isStreaming: boolean;
  response: string;
  error: string | null;
  chunks: string[];
  metadata: any | null;
  sources: any[] | null;
  generationTime: number | null;
  chunkCount: number;
}

interface UseAIStreamingOptions {
  onChunk?: (chunk: string) => void;
  onComplete?: (fullResponse: string, metadata: any) => void;
  onError?: (error: string) => void;
  onSources?: (sources: any[]) => void;
}

export function useAIStreaming(options: UseAIStreamingOptions = {}) {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    response: '',
    error: null,
    chunks: [],
    metadata: null,
    sources: null,
    generationTime: null,
    chunkCount: 0,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const startStreaming = useCallback(async (request: QuestionRequest) => {
    console.log('[useAIStreaming] Starting streaming with request:', {
      question: request.question,
      organization_id: request.organization_id,
      assessment_id: request.assessment_id,
      control_id: request.control_id,
      context: request.context,
      language: request.language
    });

    // Reset state
    setState({
      isStreaming: true,
      response: '',
      error: null,
      chunks: [],
      metadata: null,
      sources: null,
      generationTime: null,
      chunkCount: 0,
    });

    try {
      // Create abort controller
      abortControllerRef.current = new AbortController();

      await streamingRequest(
        '/api/v1/ai/question/stream',
        request,
        (chunk) => {
          console.log('[useAIStreaming] Received chunk:', chunk.substring(0, 50));
          setState(prev => ({
            ...prev,
            response: prev.response + chunk,
            chunks: [...prev.chunks, chunk],
            chunkCount: prev.chunkCount + 1,
          }));
          options.onChunk?.(chunk);
        },
        (fullResponse, metadata) => {
          console.log('[useAIStreaming] Streaming complete:', {
            responseLength: fullResponse.length,
            metadata: metadata
          });
          setState(prev => ({
            ...prev,
            isStreaming: false,
            metadata: metadata,
          }));
          options.onComplete?.(fullResponse, metadata);
        },
        (error) => {
          console.error('[useAIStreaming] Streaming error:', error);
          setState(prev => ({
            ...prev,
            isStreaming: false,
            error: error,
          }));
          options.onError?.(error);
          
          toast({
            title: 'Streaming Error',
            description: error,
            variant: 'destructive',
          });
        }
      );

    } catch (error: any) {
      const errorMessage = error.message || 'Failed to stream response';
      console.error('[useAIStreaming] Stream start failed:', error);
      setState(prev => ({
        ...prev,
        isStreaming: false,
        error: errorMessage,
      }));
      options.onError?.(errorMessage);
      
      if (error.name !== 'AbortError') {
        toast({
          title: 'Streaming Error',
          description: errorMessage,
          variant: 'destructive',
        });
      }
    }
  }, [options, toast]);

  const stopStreaming = useCallback(() => {
    console.log('[useAIStreaming] Stopping streaming');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({ ...prev, isStreaming: false }));
  }, []);

  const reset = useCallback(() => {
    console.log('[useAIStreaming] Resetting streaming state');
    stopStreaming();
    setState({
      isStreaming: false,
      response: '',
      error: null,
      chunks: [],
      metadata: null,
      sources: null,
      generationTime: null,
      chunkCount: 0,
    });
  }, [stopStreaming]);

  return {
    ...state,
    startStreaming,
    stopStreaming,
    reset,
  };
}