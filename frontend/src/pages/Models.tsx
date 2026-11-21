import React, { useEffect, useState } from 'react'
import { modelsApi } from '../../lib/api'
import { ModelInfo, ModelType } from '../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import {
  Cube,
  CheckCircle,
  XCircle,
  Loader2,
  Download,
  Info,
  ExternalLink,
  Cpu,
  Database,
  Tag,
  AlertCircle,
} from 'lucide-react'
import { cn, getModelTypeLabel } from '../../lib/utils'

const modelTypeColors: Record<ModelType, string> = {
  unet: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  nnunet: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  attention_unet: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  swin_unetr: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  custom: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
}

export function Models() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [loadingModel, setLoadingModel] = useState<string | null>(null)

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await modelsApi.list({ active_only: true })
        setModels(response.data)
      } catch (error) {
        console.error('Failed to fetch models:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchModels()
  }, [])

  const handleLoadModel = async (modelName: string) => {
    setLoadingModel(modelName)
    try {
      const response = await modelsApi.load(modelName)
      if (response.data.success) {
        toast.success(`${modelName} loaded successfully`)
        // Refresh models to update loaded status
        const refreshed = await modelsApi.list({ active_only: true })
        setModels(refreshed.data)
      } else {
        toast.error(response.data.message || 'Failed to load model')
      }
    } catch (error) {
      toast.error('Failed to load model')
    } finally {
      setLoadingModel(null)
    }
  }

  const handleUnloadModel = async (modelName: string) => {
    try {
      await modelsApi.unload(modelName)
      toast.success(`${modelName} unloaded`)
      const refreshed = await modelsApi.list({ active_only: true })
      setModels(refreshed.data)
    } catch (error) {
      toast.error('Failed to unload model')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <LoadingSpinner size="lg" />
          <span className="text-surface-600 dark:text-surface-400">Loading models...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Models</h1>
        <p className="text-surface-600 dark:text-surface-400 mt-1">
          Available segmentation models. Load models into GPU memory for faster inference.
        </p>
      </div>

      {/* Loaded models section */}
      {models.filter(m => m.loaded).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              Loaded Models (GPU Memory)
            </CardTitle>
            <CardDescription>Models currently loaded in memory for fast inference</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {models.filter(m => m.loaded).map((model) => (
                <ModelCard key={model.name} model={model} onUnload={handleUnloadModel} loading={loadingModel === model.name} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available models */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Available Models</CardTitle>
              <CardDescription>Click to view details or load into memory</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <div className="text-center py-12">
              <Cube className="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-4" />
              <h3 className="text-lg font-medium text-surface-900 dark:text-white mb-2">No models available</h3>
              <p className="text-surface-600 dark:text-surface-400">
                Contact an administrator to register models in the system.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {models.filter(m => !m.loaded).map((model) => (
                <ModelCard key={model.name} model={model} onLoad={handleLoadModel} loading={loadingModel === model.name} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => { setShowDetailModal(false); setSelectedModel(null); }}
        title={selectedModel?.name}
        size="lg"
      >
        {selectedModel && (
          <ModelDetailModal model={selectedModel} onClose={() => setShowDetailModal(false)} />
        )}
      </Modal>
    </div>
  )
}

function ModelCard({ model, onLoad, onUnload, loading }: {
  model: ModelInfo
  onLoad?: (name: string) => void
  onUnload?: (name: string) => void
  loading?: boolean
}) {
  const isLoaded = model.loaded

  return (
    <Card className="hover:shadow-medical-lg transition-shadow" variant="hover">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-semibold text-surface-900 dark:text-white">{model.name}</h3>
            <p className="text-sm text-surface-500 dark:text-surface-400">{model.version}</p>
          </div>
          <Badge className={cn(modelTypeColors[model.model_type], 'text-xs')}>
            {getModelTypeLabel(model.model_type)}
          </Badge>
        </div>

        {model.description && (
          <p className="text-sm text-surface-600 dark:text-surface-400 mb-4 line-clamp-2">{model.description}</p>
        )}

        <div className="space-y-2 mb-4 text-sm">
          {model.architecture && (
            <div className="flex justify-between text-surface-600 dark:text-surface-400">
              <span>Architecture</span>
              <span className="font-medium text-surface-900 dark:text-white">{model.architecture}</span>
            </div>
          )}
          {model.dataset && (
            <div className="flex justify-between text-surface-600 dark:text-surface-400">
              <span>Training Dataset</span>
              <span className="font-medium text-surface-900 dark:text-white">{model.dataset}</span>
            </div>
          )}
          <div className="flex justify-between text-surface-600 dark:text-surface-400">
            <span>Framework</span>
            <span className="font-medium text-surface-900 dark:text-white capitalize">{model.framework}</span>
          </div>
          <div className="flex justify-between text-surface-600 dark:text-surface-400">
            <span>GPU Memory (Recommended)</span>
            <span className="font-medium text-surface-900 dark:text-white">{model.recommended_gpu_memory_gb} GB</span>
          </div>
          {model.tags && model.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {model.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
              {model.tags.length > 4 && (
                <Badge variant="secondary" className="text-xs">+{model.tags.length - 4} more</Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-surface-200 dark:border-surface-700">
          {isLoaded ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onUnload?.(model.name)}
              disabled={loading}
              loading={loading}
            >
              <XCircle className="w-4 h-4 mr-1" />
              Unload
            </Button>
          ) : (
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onLoad?.(model.name)}
              disabled={loading}
              loading={loading}
            >
              <Download className="w-4 h-4 mr-1" />
              Load Model
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => { /* open detail */ }}>
            <Info className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ModelDetailModal({ model, onClose }: { model: ModelInfo; onClose: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Badge className={cn(modelTypeColors[model.model_type], 'text-sm')}>
          {getModelTypeLabel(model.model_type)}
        </Badge>
        <span className="text-sm text-surface-500 dark:text-surface-400">v{model.version}</span>
        {model.is_default && (
          <Badge variant="primary" className="text-xs">Default</Badge>
        )}
      </div>

      {model.description && (
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-2">Description</h4>
          <p className="text-surface-600 dark:text-surface-400">{model.description}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-2">Architecture</h4>
          <p className="text-surface-600 dark:text-surface-400">{model.architecture || 'Not specified'}</p>
        </div>
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-2">Framework</h4>
          <p className="text-surface-600 dark:text-surface-400 capitalize">{model.framework}</p>
        </div>
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-2">Training Dataset</h4>
          <p className="text-surface-600 dark:text-surface-400">{model.dataset || 'Not specified'}</p>
        </div>
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-2">License</h4>
          <p className="text-surface-600 dark:text-surface-400">{model.license || 'Not specified'}</p>
        </div>
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-2">Min GPU Memory</h4>
          <p className="text-surface-600 dark:text-surface-400">{model.min_memory_gb} GB</p>
        </div>
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-2">Recommended GPU Memory</h4>
          <p className="text-surface-600 dark:text-surface-400">{model.recommended_gpu_memory_gb} GB</p>
        </div>
      </div>

      {model.metrics && Object.keys(model.metrics).length > 0 && (
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-3">Validation Metrics</h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(model.metrics).map(([key, value]) => (
              <div key={key} className="p-3 bg-surface-50 dark:bg-surface-800/50 rounded-lg">
                <p className="text-xs text-surface-500 dark:text-surface-400 capitalize">{key.replace(/_/g, ' ')}</p>
                <p className="text-lg font-bold text-surface-900 dark:text-white">{typeof value === 'number' ? value.toFixed(4) : value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {model.training_config && (
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-3">Training Configuration</h4>
          <pre className="text-xs text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-800 p-3 rounded-lg overflow-x-auto max-h-64">
            {JSON.stringify(model.training_config, null, 2)}
          </pre>
        </div>
      )}

      {model.citation && (
        <div>
          <h4 className="font-medium text-surface-900 dark:text-white mb-2">Citation</h4>
          <p className="text-sm text-surface-600 dark:text-surface-400">{model.citation}</p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-surface-200 dark:border-surface-700">
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  )
}

// Need to import toast
import { toast } from 'react-hot-toast'