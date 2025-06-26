import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface TemplateStatus {
  category: string;
  templateId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  recordsProcessed: number;
  totalRecords: number;
  errors: string[];
  lastUpdated: string;
}

interface MigrationProgress {
  overallProgress: number;
  categories: {
    estudiantes: { completed: number; total: number; status: string };
    financiero: { completed: number; total: number; status: string };
    becas: { completed: number; total: number; status: string };
  };
  totalTemplates: number;
  completedTemplates: number;
  totalErrors: number;
}

export function useMigrationStatus() {
  const queryClient = useQueryClient();

  // Get current migration status
  const { data: migrationProgress, isLoading } = useQuery<MigrationProgress>({
    queryKey: ['/api/migration/status'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Update template status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ category, templateId, status, recordsProcessed = 0, totalRecords = 0, errors = [] }: {
      category: string;
      templateId: string;
      status: 'pending' | 'in_progress' | 'completed' | 'error';
      recordsProcessed?: number;
      totalRecords?: number;
      errors?: string[];
    }) => {
      const response = await fetch('/api/migration/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          category,
          templateId,
          status,
          recordsProcessed,
          totalRecords,
          errors
        })
      });

      if (!response.ok) {
        throw new Error('Error updating migration status');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/migration/status'] });
    }
  });

  // Reset migration progress
  const resetProgressMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/migration/reset', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Error resetting migration progress');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/migration/status'] });
    }
  });

  return {
    migrationProgress,
    isLoading,
    updateStatus: updateStatusMutation.mutate,
    isUpdating: updateStatusMutation.isPending,
    resetProgress: resetProgressMutation.mutate,
    isResetting: resetProgressMutation.isPending
  };
}