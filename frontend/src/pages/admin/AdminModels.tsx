import React, { useEffect, useState } from 'react'
import { adminApi, modelsApi } from '../../../lib/api'
import { ModelInfo, ModelType } from '../../../types'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
  Eye,
  Download,
  Trash2,
  Cube,
  Cpu,
  Database,
  Plus,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit,
  Tag,
} from 'lucide-react'
import { cn, getModelTypeLabel, getRoleColor } from '../../../lib/utils'

const modelTypeColors: Record<ModelType, string> = {
  unet: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  nnunet: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  attention_unet: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  swin_unetr: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  custom: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
}

export function AdminModels() {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [registerLoading, setRegisterLoading] = useState(false)

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    try {
      const response = await modelsApi.list({ active_only: false })
      setModels(response.data)
    } catch (error) {
      console.error('Failed to fetch models:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setRegisterLoading(true)
    try {
      const formData = new FormData(e.currentTarget)
      const data = {
        name: formData.get('name'),
        model_type: formData.get('model_type'),
        version: formData.get('version'),
        file_path: formData.get('file_path'),
        file_hash: formData.get('file_hash'),
        file_size: parseInt(formData.get('file_size') as string, 10),
        description: formData.get('description'),
        architecture: formData.get('architecture'),
        framework: formData.get('framework') || 'pytorch',
        dataset: formData.get('dataset'),
        min_memory_gb: parseInt(formData.get('min_memory_gb') as string, 10) || 4,
        recommended_gpu_memory_gb: parseInt(formData.get('recommended_gpu_memory_gb') as string, 10) || 8,
        tags: (formData.get('tags') as string).split(',').map(t => t.trim()).filter(Boolean),
        license: formData.get('license'),
        citation: formData.get('citation'),
        is_default: formData.get('is_default') === 'on',
      }

      // In a real app, this would call an admin register endpoint
      alert('Model registration would call admin API endpoint')
      setShowRegisterModal(false)
    } catch (error) {
      alert('Failed to register model')
    } finally {
      setRegisterLoading(false)
    }
  }

  const handleActivate = async (modelId: string, active: boolean) => {
    try {
      // Call admin activate endpoint
      alert(`${active ? 'Activate' : 'Deactivate'} model endpoint`)
      fetchModels()
    } catch (error) {
      alert('Failed to update model status')
    }
  }

  const handleSetDefault = async (modelId: string) => {
    try {
      // Call admin set default endpoint
      alert('Set default model endpoint')
      fetchModels()
    } catch (error) {
      alert('Failed to set default model')
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Model Registry</h1>
          <p className="text-surface-600 dark:text-surface-400 mt-1">Manage segmentation models in the system</p>
        </div>
        <Button onClick={() => setShowRegisterModal(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Register Model
        </Button>
      </div>

      {/* Models table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Registered Models</CardTitle>
              <CardDescription>All models in the registry</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <div className="text-center py-12">
              <Cube className="w-12 h-12 mx-auto text-surface-300 dark:text-surface-600 mb-4" />
              <h3 className="text-lg font-medium text-surface-900 dark:text-white mb-2">No models registered</h3>
              <p className="text-surface-600 dark:text-surface-400 mb-4">
                Register a new model to get started
              </p>
              <Button onClick={() => setShowRegisterModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Register Model
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-200 dark:border-surface-700">
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 uppercase tracking-wider">Model</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 uppercase tracking-wider">Version</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 uppercase tracking-wider">GPU Memory</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 uppercase tracking-wider">Default</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-surface-600 dark:text-surface-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-200 dark:divide-surface-700">
                  {models.map((model) => (
                    <tr key={model.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-surface-900 dark:text-white">{model.name}</p>
                          <p className="text-xs text-surface-500">{model.architecture || 'Unknown architecture'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn(modelTypeColors[model.model_type], 'text-xs')}>
                          {getModelTypeLabel(model.model_type)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-surface-600 dark:text-surface-400">v{model.version}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={model.is_active ? 'success' : 'secondary'} className="gap-1">
                          {model.is_active ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" />
                              Inactive
                            </>
                          )}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-surface-600 dark:text-surface-400">
                          {model.recommended_gpu_memory_gb} GB
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {model.is_default ? (
                          <Badge variant="primary" className="gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Default
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1" onClick={() => handleSetDefault(model.id)}>
                            <Cpu className="w-3 h-3" />
                            Set Default
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleActivate(model.id, !model.is_active)}
                            className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
                            aria-label={model.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {model.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => alert(`Edit model ${model.name}`)}
                            className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800"
                            aria-label="Edit model"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => alert(`Delete model ${model.name}`)}
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            aria-label="Delete model"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Register Modal */}
      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="Register New Model"
        size="xl"
      >
        <form onSubmit={handleRegister} className="space-y-6" noValidate>
          <div className="grid gap-6 sm:grid-cols-2">
            <Input label="Model Name" placeholder="e.g., unet_brats_v1" name="name" required />
            <select name="model_type" className="input" required>
              <option value="">Select model type</option>
              <option value="unet">U-Net</option>
              <option value="nnunet">nnU-Net</option>
              <option value="attention_unet">Attention U-Net</option>
              <option value="swin_unetr">Swin UNETR</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <Input label="Version" placeholder="1.0.0" name="version" required />
            <Input label="Framework" placeholder="pytorch" name="framework" defaultValue="pytorch" />
            <Input type="number" label="Min GPU Memory (GB)" placeholder="4" name="min_memory_gb" defaultValue="4" />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Input type="number" label="Recommended GPU Memory (GB)" placeholder="8" name="recommended_gpu_memory_gb" defaultValue="8" />
            <Input label="File Path" placeholder="/app/models/model.pth" name="file_path" required />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Input label="File Hash (SHA256)" placeholder="a1b2c3..." name="file_hash" required />
            <Input type="number" label="File Size (bytes)" placeholder="123456789" name="file_size" required />
          </div>

          <Input label="Architecture" placeholder="U-Net 3D" name="architecture" />
          <Input label="Training Dataset" placeholder="BraTS 2021" name="dataset" />

          <div>
            <label className="label">Tags (comma-separated)</label>
            <Input placeholder="brain, segmentation, medical" name="tags" />
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <Input label="License" placeholder="MIT" name="license" />
            <Input label="Citation" placeholder="Doe et al. 2023" name="citation" />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea name="description" rows={3} className="input resize-y" placeholder="Model description..." />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" id="is_default" name="is_default" className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500" />
            <label htmlFor="is_default" className="text-sm text-surface-700 dark:text-surface-300 cursor-pointer">
              Set as default model
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-700">
            <Button type="button" variant="secondary" onClick={() => setShowRegisterModal(false)}>Cancel</Button>
            <Button type="submit" loading={registerLoading}>
              <Loader2 className="w-4 h-4 mr-2" />
              Register Model
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}