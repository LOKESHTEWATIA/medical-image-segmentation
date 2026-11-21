import React from 'react'
import { cn } from '../lib/utils'
import { LoadingSpinner } from './LoadingSpinner'

interface Column<T> {
  key: string
  header: string
  render?: (row: T, index: number) => React.ReactNode
  className?: string
  sortable?: boolean
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  isLoading?: boolean
  emptyMessage?: string
  rowClassName?: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  striped?: boolean
  hoverable?: boolean
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No data available',
  rowClassName,
  onRowClick,
  striped = true,
  hoverable = true,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.className}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    <LoadingSpinner size="sm" className="mx-auto" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="table-container">
        <div className="px-6 py-12 text-center">
          <LoadingSpinner size="lg" className="mx-auto mb-4 text-surface-300 dark:text-surface-600" />
          <p className="text-surface-500 dark:text-surface-400">{emptyMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="table-container">
      <table className="table" role="table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  col.className,
                  col.sortable && 'cursor-pointer select-none hover:bg-surface-100 dark:hover:bg-surface-800'
                )}
                scope="col"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr
              key={keyExtractor(row)}
              className={cn(
                rowClassName?.(row, index),
                onRowClick && 'cursor-pointer',
                hoverable && 'hover:bg-surface-50 dark:hover:bg-surface-800/50',
                striped && index % 2 === 1 && 'bg-surface-50/50 dark:bg-surface-800/50'
              )}
              onClick={() => onRowClick?.(row)}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={(e) => {
                if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onRowClick(row)
                }
              }}
              role={onRowClick ? 'button' : undefined}
              aria-pressed={onRowClick ? 'false' : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
                  {col.render ? col.render(row, index) : String((row as any)[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  showPageSize?: boolean
  pageSize?: number
  onPageSizeChange?: (size: number) => void
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  showPageSize = false,
  pageSize,
  onPageSizeChange,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const pages = React.useMemo(() => {
    const result: (number | string)[] = []
    const delta = 2

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        result.push(i)
      } else if (
        (i === currentPage - delta - 1 || i === currentPage + delta + 1) &&
        result[result.length - 1] !== '...'
      ) {
        result.push('...')
      }
    }
    return result
  }, [currentPage, totalPages])

  return (
    <nav className="flex items-center justify-between px-4 py-3 border-t border-surface-200 dark:border-surface-700" aria-label="Pagination">
      <div className="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-400">
        <span>Page {currentPage} of {totalPages}</span>
        {showPageSize && pageSize && onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="input w-auto px-2 py-1 text-xs"
            aria-label="Page size"
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-surface-400 dark:hover:bg-surface-800"
          aria-label="First page"
          aria-disabled={currentPage === 1}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-surface-400 dark:hover:bg-surface-800"
          aria-label="Previous page"
          aria-disabled={currentPage === 1}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {pages.map((page, i) =>
          page === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-surface-400">...</span>
          ) : (
            <button
              key={page}
              onClick={() => onPageChange(page as number)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                page === currentPage
                  ? 'bg-primary-600 text-white'
                  : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
              )}
              aria-label={`Page ${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-surface-400 dark:hover:bg-surface-800"
          aria-label="Next page"
          aria-disabled={currentPage === totalPages}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg text-surface-600 hover:bg-surface-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-surface-400 dark:hover:bg-surface-800"
          aria-label="Last page"
          aria-disabled={currentPage === totalPages}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7m-8-14l7 7-7 7" />
          </svg>
        </button>
      </div>
    </nav>
  )
}