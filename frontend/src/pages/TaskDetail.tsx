import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { tasksApi } from '../../lib/api'
import { Task, TaskStatus } from '../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { LoadingSpinner, LoadingOverlay } from '../../components/ui/LoadingSpinner'
import {
  ArrowLeft,
  Download,
  X,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Clock,
  FileText,
  Cube,
  Info,
  Eye,
  Layers,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Move,
  Contrast,
  HelpCircle,
} from 'lucide-react'
import { formatDate, formatFileSize, getStatusColor, cn, CLASS_COLORS } from '../../lib/utils'
import { statusIcons } from './Dashboard'

interface ViewerState {
  slice: number
  maxSlice: number
  windowLevel: { center: number; width: number }
  overlayOpacity: number
  showOverlay: boolean
  colormap: string
}

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const [task, setTask] = useState<Task | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [viewerState, setViewerState] = useState<ViewerState>({
    slice: 0,
    maxSlice: 0,
    windowLevel: { center: 0, width: 1 },
    overlayOpacity: 0.5,
    showOverlay: true,
    colormap: 'viridis',
  })
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [downloadType, setDownloadType] = useState<'segmentation' | 'probabilities' | 'original'>('segmentation')

  // Refs for canvas rendering
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const originalImageRef = useRef<Float32Array | null>(null)
  const segmentationRef = useRef<Uint8Array | null>(null)
  const imageDimensions = useRef<{ width: number; height: number; depth: number } | null>(null)

  useEffect(() => {
    if (!taskId) return

    const fetchTask = async () => {
      try {
        const response = await tasksApi.get(taskId)
        setTask(response.data)
        
        // Start polling if task is not completed
        if (response.data.status === 'pending' || response.data.status === 'queued' || response.data.status === 'processing') {
          setPolling(true)
        }
      } catch (error) {
        toast.error('Failed to load task')
        navigate('/tasks')
      } finally {
        setIsLoading(false)
      }
    }

    fetchTask()
  }, [taskId, navigate])

  // Poll for status updates
  useEffect(() => {
    if (!polling || !taskId) return

    const interval = setInterval(async () => {
      try {
        const response = await tasksApi.getStatus(taskId)
        setTask(prev => prev ? { ...prev, ...response.data } : null)
        
        if (response.data.status === 'completed' || response.data.status === 'failed' || response.data.status === 'cancelled') {
          setPolling(false)
          if (response.data.status === 'completed') {
            toast.success('Segmentation completed!')
            // Load the segmentation result
            loadSegmentationResult()
          }
        }
      } catch (error) {
        console.error('Polling failed:', error)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [polling, taskId])

  const loadSegmentationResult = async () => {
    if (!task?.output_filename) return
    
    try {
      const blob = await tasksApi.download(taskId!, 'segmentation')
      // In a real implementation, you would parse the NIfTI file here
      // For now, we'll simulate loading
      console.log('Segmentation loaded:', blob.size, 'bytes')
    } catch (error) {
      console.error('Failed to load segmentation:', error)
    }
  }

  const handleDownload = async (type: 'segmentation' | 'probabilities' | 'original') => {
    if (!task) return
    
    try {
      const blob = await tasksApi.download(taskId!, type)
      const filename = type === 'original' 
        ? task.original_filename 
        : type === 'probabilities' 
          ? `${task.original_filename.replace(/\.[^.]+$/, '')}_probs.nii.gz`
          : `seg_${task.original_filename}`
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      window.URL.revokeObjectURL(url)
      
      toast.success('Download started')
      setShowDownloadModal(false)
    } catch (error) {
      toast.error('Download failed')
    }
  }

  const handleRetry = async () => {
    if (!task) return
    try {
      await tasksApi.cancel(task.id)
      toast.success('Task reset. Re-upload the file to try again.')
      navigate('/tasks')
    } catch (error) {
      toast.error('Failed to reset task')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <LoadingSpinner size="lg" />
          <span className="text-surface-600 dark:text-surface-400">Loading task...</span>
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <h2 className="text-xl font-semibold text-surface-900 dark:text-white mb-2">Task not found</h2>
        <Button onClick={() => navigate('/tasks')}>Back to Tasks</Button>
      </div>
    )
  }

  const StatusIcon = statusIcons[task.status as keyof typeof statusIcons] || Clock
  const statusColor = getStatusColor(task.status).replace('badge-', '')

  return (
    <LoadingOverlay isLoading={isLoading}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-surface-900 dark:text-white truncate max-w-[400px]">
                {task.original_filename}
              </h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-surface-600 dark:text-surface-400">
                <Badge variant={statusColor as any} className="gap-1">
                  <StatusIcon className="w-3 h-3" />
                  {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                </Badge>
                <span>{task.model_type.toUpperCase()}</span>
                <span>•</span>
                <span>{formatDate(task.created_at)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {task.status === 'completed' && task.output_filename && (
              <>
                <Button variant="outline" onClick={() => { setDownloadType('segmentation'); setShowDownloadModal(true); }}>
                  <Download className="w-4 h-4 mr-2" />
                  Segmentation
                </Button>
                <Button variant="outline" onClick={() => { setDownloadType('probabilities'); setShowDownloadModal(true); }}>
                  <Layers className="w-4 h-4 mr-2" />
                  Probabilities
                </Button>
                <Button variant="outline" onClick={() => { setDownloadType('original'); setShowDownloadModal(true); }}>
                  <FileText className="w-4 h-4 mr-2" />
                  Original
                </Button>
              </>
            )}
            {task.status === 'failed' && (
              <Button variant="outline" onClick={handleRetry}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main viewer */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image viewer */}
            <Card>
              <CardHeader>
                <CardTitle>Segmentation Viewer</CardTitle>
                <CardDescription>
                  {task.status === 'completed' 
                    ? 'Navigate through slices and adjust visualization' 
                    : 'Segmentation will appear here when processing completes'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-surface-900 rounded-lg relative overflow-hidden">
                  {task.status === 'completed' ? (
                    <>
                      <canvas
                        ref={canvasRef}
                        className="w-full h-full"
                        style={{ imageRendering: 'pixelated' }}
                      />
                      {/* Viewer controls */}
                      <div className="absolute bottom-4 left-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg p-3 flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-white text-sm">
                            <input
                              type="checkbox"
                              checked={viewerState.showOverlay}
                              onChange={(e) => setViewerState(prev => ({ ...prev, showOverlay: e.target.checked }))}
                              className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                            />
                            Show Segmentation
                          </label>
                          <div className="flex items-center gap-2 text-white text-sm">
                            <span>Opacity</span>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.1"
                              value={viewerState.overlayOpacity}
                              onChange={(e) => setViewerState(prev => ({ ...prev, overlayOpacity: parseFloat(e.target.value) }))}
                              className="w-24 h-2 bg-surface-600 rounded-lg appearance-none accent-primary-500"
                            />
                            <span className="w-8 text-right">{Math.round(viewerState.overlayOpacity * 100)}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2 text-white text-sm">
                            <span>Slice</span>
                            <input
                              type="range"
                              min="0"
                              max={viewerState.maxSlice - 1}
                              value={viewerState.slice}
                              onChange={(e) => setViewerState(prev => ({ ...prev, slice: parseInt(e.target.value) }))}
                              className="flex-1 h-2 bg-surface-600 rounded-lg appearance-none accent-primary-500"
                            />
                            <span className="w-16 text-center">{viewerState.slice + 1} / {viewerState.maxSlice}</span>
                          </label>
                        </div>
                      </div>
                      {/* Slice navigation */}
                      <div className="absolute top-4 right-4 flex gap-2">
                        <button
                          onClick={() => setViewerState(prev => ({ ...prev, slice: Math.max(0, prev.slice - 1) }))}
                          className="p-2 bg-black/50 rounded-lg text-white hover:bg-black/70"
                          aria-label="Previous slice"
                        >
                          <RotateCcw className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setViewerState(prev => ({ ...prev, slice: Math.min(prev.maxSlice - 1, prev.slice + 1) }))}
                          className="p-2 bg-black/50 rounded-lg text-white hover:bg-black/70"
                          aria-label="Next slice"
                        >
                          <RotateCcw className="w-5 h-5 transform rotate-180" />
                        </button>
                      </div>
                    </>
                  ) : task.status === 'processing' || task.status === 'queued' ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary-500 mb-4" />
                        <p className="text-white text-lg">{task.status.charAt(0).toUpperCase() + task.status.slice(1)}...</p>
                        <p className="text-surface-400 mt-2">{task.progress}% complete</p>
                        <div className="w-64 mx-auto mt-4 h-2 bg-surface-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary-500 transition-all duration-300"
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-center">
                      <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
                      <p className="text-white text-lg">Segmentation Failed</p>
                      <p className="text-surface-400 mt-2">{task.error_message || 'Unknown error'}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Legend */}
            {task.status === 'completed' && task.metrics && (
              <Card>
                <CardHeader>
                  <CardTitle>Segmentation Results</CardTitle>
                  <CardDescription>Class volumes and confidence metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(task.metrics).map(([key, value], index) => {
                      const className = key.replace(/_volume_voxels|_volume_mm3|_mean_confidence/, '')
                      const isVolume = key.includes('volume')
                      const isConfidence = key.includes('confidence')
                      
                      return (
                        <div key={key} className="p-4 bg-surface-50 dark:bg-surface-800/50 rounded-lg border-l-4" style={{ borderColor: CLASS_COLORS[index % CLASS_COLORS.length] }}>
                          <p className="text-sm font-medium text-surface-900 dark:text-white capitalize">{className.replace(/_/g, ' ')}</p>
                          <p className="text-2xl font-bold text-surface-900 dark:text-white mt-1">
                            {isVolume ? `${value.toLocaleString()} voxels` : isConfidence ? `${(value * 100).toFixed(1)}%` : value.toFixed(2)}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Task info */}
            <Card>
              <CardHeader>
                <CardTitle>Task Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-surface-600 dark:text-surface-400">Task ID</dt>
                    <dd className="font-mono text-surface-900 dark:text-white truncate max-w-[150px]">{task.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-surface-600 dark:text-surface-400">File Hash</dt>
                    <dd className="font-mono text-surface-900 dark:text-white truncate max-w-[150px]">{task.file_hash.slice(0, 16)}...</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-surface-600 dark:text-surface-400">File Size</dt>
                    <dd className="text-surface-900 dark:text-white">{formatFileSize(task.file_size)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-surface-600 dark:text-surface-400">Modality</dt>
                    <dd className="text-surface-900 dark:text-white">{task.modality || 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-surface-600 dark:text-surface-400">Body Part</dt>
                    <dd className="text-surface-900 dark:text-white">{task.body_part || 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-surface-600 dark:text-surface-400">Model</dt>
                    <dd className="font-mono text-surface-900 dark:text-white">{task.model_type.toUpperCase()}</dd>
                  </div>
                  {task.model_version && (
                    <div className="flex justify-between">
                      <dt className="text-surface-600 dark:text-surface-400">Model Version</dt>
                      <dd className="text-surface-900 dark:text-white">{task.model_version}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-surface-600 dark:text-surface-400">Created</dt>
                    <dd className="text-surface-900 dark:text-white">{formatDate(task.created_at)}</dd>
                  </div>
                  {task.started_at && (
                    <div className="flex justify-between">
                      <dt className="text-surface-600 dark:text-surface-400">Started</dt>
                      <dd className="text-surface-900 dark:text-white">{formatDate(task.started_at)}</dd>
                    </div>
                  )}
                  {task.completed_at && (
                    <div className="flex justify-between">
                      <dt className="text-surface-600 dark:text-surface-400">Completed</dt>
                      <dd className="text-surface-900 dark:text-white">{formatDate(task.completed_at)}</dd>
                    </div>
                  )}
                  {task.processing_time_ms && (
                    <div className="flex justify-between">
                      <dt className="text-surface-600 dark:text-surface-400">Processing Time</dt>
                      <dd className="text-surface-900 dark:text-white">{(task.processing_time_ms / 1000).toFixed(1)}s</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Notes */}
            {task.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-surface-600 dark:text-surface-400 whitespace-pre-wrap">{task.notes}</p>
                </CardContent>
              </Card>
            )}

            {/* Error details */}
            {task.status === 'failed' && task.error_message && (
              <Card className="border-red-200 dark:border-red-900/30">
                <CardHeader>
                  <CardTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Error Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                    {task.error_message}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Download Modal */}
      <Modal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        title="Download File"
        description="Select the file type to download"
      >
        <div className="space-y-3">
          {[
            { type: 'segmentation' as const, label: 'Segmentation', desc: 'Segmentation mask (NIfTI)', icon: CheckCircle },
            { type: 'probabilities' as const, label: 'Probabilities', desc: 'Class probability maps (NIfTI)', icon: Layers },
            { type: 'original' as const, label: 'Original', desc: 'Original uploaded file', icon: FileText },
          ].map(({ type, label, desc, icon }) => (
            <button
              key={type}
              onClick={() => { setDownloadType(type); handleDownload(type); }}
              className={cn(
                'w-full p-4 rounded-lg border transition-colors text-left',
                downloadType === type
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50'
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', 
                  downloadType === type ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' 
                    : 'bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400'
                )}>
                  <icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium text-surface-900 dark:text-white">{label}</p>
                  <p className="text-sm text-surface-500 dark:text-surface-400">{desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </Modal>
    </LoadingOverlay>
  )
}