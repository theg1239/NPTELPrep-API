"use client";

import { useState } from "react";
import { TuiButton } from "@/components/tui/components";
import { useRouter } from "next/navigation";

interface AdminActionButtonsProps {
  apiKeyId: string;
  isRevoked: boolean;
}

export default function AdminActionButtons({ apiKeyId, isRevoked }: AdminActionButtonsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleRevoke = async () => {
    if (isRevoked) return;
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/api-keys/${apiKeyId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        router.refresh();
      } else {
        console.error('Failed to revoke API key');
      }
    } catch (error) {
      console.error('Error revoking API key:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleViewUsage = () => {
    router.push(`/dashboard/admin/api-keys/${apiKeyId}/usage`);
  };

  return (
    <div className="flex space-x-2">
      <TuiButton
        variant="secondary"
        size="sm"
        onClick={handleViewUsage}
        disabled={isLoading}
      >
        Usage
      </TuiButton>
      
      {!isRevoked && (
        <TuiButton
          variant="destructive"
          size="sm"
          onClick={handleRevoke}
          disabled={isLoading}
        >
          {isLoading ? "..." : "Revoke"}
        </TuiButton>
      )}
    </div>
  );
} 