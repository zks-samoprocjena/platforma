'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, StopCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface StreamingResponseProps {
  content: string;
  isStreaming: boolean;
  chunkCount?: number;
  error?: string | null;
  sources?: any[] | null;
  metadata?: any | null;
  onStop?: () => void;
  className?: string;
}

export function StreamingResponse({
  content,
  isStreaming,
  chunkCount = 0,
  error,
  sources,
  metadata,
  onStop,
  className,
}: StreamingResponseProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);

  // Auto-scroll to bottom as new content arrives
  useEffect(() => {
    if (contentRef.current && shouldScrollRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  // Detect if user scrolls up
  const handleScroll = () => {
    if (contentRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      // If user is near bottom (within 50px), keep auto-scrolling
      shouldScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
    }
  };

  if (error) {
    return (
      <Card className={cn('p-4 border-destructive', className)}>
        <p className="text-destructive">{error}</p>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Metadata display */}
      {metadata && (
        <div className="text-sm text-muted-foreground space-y-1">
          {metadata.security_level && (
            <p>Security Level: <span className="font-medium">{metadata.security_level}</span></p>
          )}
          {metadata.completion !== undefined && (
            <p>Assessment Progress: <span className="font-medium">{metadata.completion.toFixed(1)}%</span></p>
          )}
          {metadata.average_score !== undefined && (
            <p>Average Score: <span className="font-medium">{metadata.average_score.toFixed(2)}/5</span></p>
          )}
        </div>
      )}

      {/* Main content area */}
      <Card className="relative">
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="p-4 max-h-[500px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none"
        >
          {content ? (
            <>
              <div className="whitespace-pre-wrap">{content}</div>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
              )}
            </>
          ) : (
            isStreaming && (
              <div className="flex items-center space-x-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating response...</span>
              </div>
            )
          )}
        </div>

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="absolute top-2 right-2 flex items-center space-x-2">
            <div className="flex items-center space-x-1 text-xs text-muted-foreground">
              <div className="flex space-x-1">
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              {chunkCount > 0 && <span className="ml-2">{chunkCount} chunks</span>}
            </div>
            {onStop && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onStop}
                className="h-6 px-2"
              >
                <StopCircle className="h-3 w-3 mr-1" />
                Stop
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Sources display */}
      {sources && sources.length > 0 && (
        <Card className="p-4">
          <h4 className="text-sm font-medium mb-2">Sources</h4>
          <ul className="space-y-1">
            {sources.map((source, index) => (
              <li key={index} className="text-sm text-muted-foreground">
                • {source.source}
                {source.relevance_score && (
                  <span className="ml-2 text-xs">
                    (relevance: {(source.relevance_score * 100).toFixed(0)}%)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}