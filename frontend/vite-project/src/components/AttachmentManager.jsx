import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import socket from '../socket';
import { API_BASE_URL } from '../config';

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch (e) {
    return dateString;
  }
}

export function getFileTypeBadge(fileType, originalFileName = '') {
  const ext = originalFileName.split('.').pop()?.toUpperCase() || '';
  const type = (fileType || '').toLowerCase();

  if (type.includes('pdf') || ext === 'PDF') {
    return { label: 'PDF', bg: '#FEE2E2', color: '#DC2626' };
  }
  if (type.includes('word') || ext === 'DOC' || ext === 'DOCX') {
    return { label: ext || 'DOC', bg: '#EFF6FF', color: '#2563EB' };
  }
  if (type.includes('excel') || type.includes('spreadsheet') || ext === 'XLS' || ext === 'XLSX') {
    return { label: ext || 'XLS', bg: '#ECFDF5', color: '#059669' };
  }
  if (type.includes('image') || ['PNG', 'JPG', 'JPEG', 'WEBP'].includes(ext)) {
    return { label: ext || 'IMG', bg: '#FFF2EB', color: '#F87524' };
  }
  return { label: ext || 'FILE', bg: '#F3F4F6', color: '#4B5563' };
}

export default function AttachmentManager({
  taskId,
  currentUser,
  uploadDirection = 'User_to_Admin', // 'Admin_to_User' or 'User_to_Admin'
  canUpload = true,
  title = 'Task Attachments',
  readOnly = false,
  filterDirection = null, // null (show tabs) | 'Admin_to_User' | 'User_to_Admin'
  hideTabs = false,
  emptyMessage = null,
  onAttachmentCountChange = null,
}) {
  const [attachments, setAttachments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [description, setDescription] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'admin', 'user'
  const fileInputRef = useRef(null);

  const fetchAttachments = async () => {
    if (!taskId) return;
    try {
      setIsLoading(true);
      setErrorMsg('');
      const res = await axios.get(`${API_BASE_URL}/attachments/${taskId}`, {
        params: {
          role: currentUser?.role || 'user',
          email: currentUser?.email || '',
        },
      });
      if (Array.isArray(res.data)) {
        setAttachments(res.data);
        if (onAttachmentCountChange) {
          onAttachmentCountChange(res.data.length);
        }
      }
    } catch (err) {
      console.error('Failed to load attachments:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to load task attachments.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
  }, [taskId]);

  // Real-time socket events for attachment changes
  useEffect(() => {
    const handleUploaded = (newAtt) => {
      if (newAtt && String(newAtt.taskId).trim() === String(taskId).trim()) {
        setAttachments((prev) => {
          if (prev.some((a) => a.attachmentId === newAtt.attachmentId)) return prev;
          const updated = [newAtt, ...prev];
          if (onAttachmentCountChange) onAttachmentCountChange(updated.length);
          return updated;
        });
      }
    };

    const handleDeleted = ({ attachmentId, taskId: deletedTaskId }) => {
      if (String(deletedTaskId).trim() === String(taskId).trim()) {
        setAttachments((prev) => {
          const updated = prev.filter((a) => a.attachmentId !== attachmentId);
          if (onAttachmentCountChange) onAttachmentCountChange(updated.length);
          return updated;
        });
      }
    };

    socket.on('attachment_uploaded', handleUploaded);
    socket.on('attachment_deleted', handleDeleted);

    return () => {
      socket.off('attachment_uploaded', handleUploaded);
      socket.off('attachment_deleted', handleDeleted);
    };
  }, [taskId]);

  const handleFileSelect = (file) => {
    if (!file) return;
    setErrorMsg('');
    setSuccessMsg('');

    // Check size limit: 10 MB
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('File exceeds the 10 MB maximum upload limit.');
      return;
    }

    // Check extension
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const allowed = ['.pdf', '.jpeg', '.jpg', '.png', '.webp', '.doc', '.docx', '.xls', '.xlsx'];
    if (!allowed.includes(ext)) {
      setErrorMsg(`File format ${ext} is not supported. Permitted formats: PDF, JPEG, PNG, WebP, DOC, DOCX, XLS, XLSX.`);
      return;
    }

    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!selectedFile || !taskId) return;

    setErrorMsg('');
    setSuccessMsg('');
    setIsUploading(true);
    setUploadProgress(10);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('taskId', taskId);
    formData.append('uploadDirection', uploadDirection);
    formData.append('uploadedBy', currentUser?.name || currentUser?.username || currentUser?.email || 'User');
    formData.append('uploadedRole', currentUser?.role || 'user');
    formData.append('description', description.trim());

    try {
      const res = await axios.post(`${API_BASE_URL}/attachments/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 90) / progressEvent.total);
            setUploadProgress(pct);
          }
        },
      });

      setUploadProgress(100);
      setSuccessMsg(`Successfully uploaded "${selectedFile.name}" to Google Drive.`);
      setSelectedFile(null);
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      setAttachments((prev) => [res.data, ...prev.filter((a) => a.attachmentId !== res.data.attachmentId)]);
      if (onAttachmentCountChange) onAttachmentCountChange(attachments.length + 1);

      setTimeout(() => {
        setUploadProgress(0);
        setSuccessMsg('');
      }, 3500);
    } catch (err) {
      console.error('Attachment upload failed:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to upload file to Google Drive.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = (attachment) => {
    const url = `${API_BASE_URL}/attachments/download/${attachment.attachmentId}?role=${currentUser?.role || 'user'}&email=${encodeURIComponent(currentUser?.email || '')}`;
    window.open(url, '_blank');
  };

  const handleDelete = async (attachment) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to remove "${attachment.originalFileName || attachment.fileName}" from the website? The file will remain safely preserved in Google Drive.`
    );
    if (!confirmDelete) return;

    setErrorMsg('');
    try {
      await axios.delete(`${API_BASE_URL}/attachments/${attachment.attachmentId}`, {
        params: {
          role: currentUser?.role || 'user',
          email: currentUser?.email || '',
        },
      });

      setAttachments((prev) => prev.filter((a) => a.attachmentId !== attachment.attachmentId));
      setSuccessMsg('Attachment removed from website (file remains stored in Google Drive).');
      if (onAttachmentCountChange) onAttachmentCountChange(attachments.length - 1);
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Delete attachment error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to delete attachment.');
    }
  };

  // Filter attachments based on filterDirection or active tab
  const filteredAttachments = attachments.filter((att) => {
    if (filterDirection) {
      return att.uploadDirection === filterDirection;
    }
    if (filterTab === 'admin') return att.uploadDirection === 'Admin_to_User';
    if (filterTab === 'user') return att.uploadDirection === 'User_to_Admin';
    return true;
  });

  const adminDocsCount = attachments.filter((a) => a.uploadDirection === 'Admin_to_User').length;
  const userDocsCount = attachments.filter((a) => a.uploadDirection === 'User_to_Admin').length;
  const shouldShowTabs = !hideTabs && !filterDirection;

  return (
    <div className="attachment-manager-card">
      <div className="attachment-manager-header">
        <div className="att-title-wrap">
          <h4 className="att-title">{title}</h4>
          <span className="att-count-badge">
            {filteredAttachments.length} {filteredAttachments.length === 1 ? 'File' : 'Files'}
          </span>
        </div>

        {shouldShowTabs && (
          <div className="att-filter-tabs">
            <button
              type="button"
              className={`att-tab ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All Files ({attachments.length})
            </button>
            <button
              type="button"
              className={`att-tab ${filterTab === 'admin' ? 'active' : ''}`}
              onClick={() => setFilterTab('admin')}
            >
              Admin Briefs ({adminDocsCount})
            </button>
            <button
              type="button"
              className={`att-tab ${filterTab === 'user' ? 'active' : ''}`}
              onClick={() => setFilterTab('user')}
            >
              Deliverables ({userDocsCount})
            </button>
          </div>
        )}
      </div>

      {errorMsg && <div className="att-alert error">{errorMsg}</div>}
      {successMsg && <div className="att-alert success">{successMsg}</div>}

      {/* UPLOAD SECTION (Only when write allowed and not readOnly) */}
      {!readOnly && canUpload && (
        <div className="att-upload-section">
          <div
            className={`att-dropzone ${isDragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files?.[0]) {
                handleFileSelect(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="att-file-input-hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
              accept=".pdf,.jpeg,.jpg,.png,.webp,.doc,.docx,.xls,.xlsx"
            />

            {!selectedFile ? (
              <div className="dropzone-prompt">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F87524" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div className="dropzone-text">
                  <strong>Click or Drag & Drop file here</strong>
                  <small>
                    Upload to Google Drive ({uploadDirection === 'Admin_to_User' ? 'Admin Brief' : 'Deliverable'}) • Max 10 MB
                  </small>
                </div>
              </div>
            ) : (
              <div className="dropzone-selected-file" onClick={(e) => e.stopPropagation()}>
                <div className="selected-file-info">
                  <span className="selected-file-name">{selectedFile.name}</span>
                  <span className="selected-file-size">({formatFileSize(selectedFile.size)})</span>
                </div>
                <button
                  type="button"
                  className="btn-remove-selected"
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  title="Remove selection"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {selectedFile && (
            <div className="att-upload-controls">
              <input
                type="text"
                placeholder="Add optional note or deliverable summary..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="att-description-input"
                disabled={isUploading}
              />
              <button
                type="button"
                className="btn-att-upload-submit"
                onClick={handleUploadSubmit}
                disabled={isUploading}
              >
                {isUploading ? `Uploading (${uploadProgress}%)...` : 'Upload to Google Drive'}
              </button>
            </div>
          )}

          {isUploading && (
            <div className="att-progress-bar-container">
              <div className="att-progress-bar" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>
      )}

      {/* COMPACT HORIZONTAL ROWS ATTACHMENT LIST */}
      <div className="att-list-container">
        {isLoading ? (
          <div className="att-loading-state">Loading attachments...</div>
        ) : filteredAttachments.length === 0 ? (
          <div className="att-empty-state">
            <p>{emptyMessage || 'No attachments available in this view.'}</p>
          </div>
        ) : (
          <div className="att-horizontal-list">
            {filteredAttachments.map((att) => {
              const badge = getFileTypeBadge(att.fileType, att.originalFileName);
              const isAdminFile = att.uploadDirection === 'Admin_to_User';
              const canDeleteThis = true; // Both admin and assigned users can delete files from website

              return (
                <div key={att.attachmentId} className="att-row-item">
                  {/* Left Side: File type badge, filename, size, date */}
                  <div className="att-row-left">
                    <span
                      className="att-row-type-badge"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>

                    <div className="att-row-info">
                      <div className="att-row-name-line">
                        <span
                          className="att-row-name"
                          title={att.originalFileName || att.fileName}
                        >
                          {att.originalFileName || att.fileName}
                        </span>
                        {att.description && (
                          <span className="att-row-desc" title={att.description}>
                            — "{att.description}"
                          </span>
                        )}
                      </div>

                      <div className="att-row-meta">
                        <span>{formatFileSize(att.fileSize)}</span>
                        <span className="att-meta-sep">•</span>
                        <span>{formatDate(att.uploadedDate)}</span>
                        {att.uploadedBy && (
                          <>
                            <span className="att-meta-sep">•</span>
                            <span>From {att.uploadedBy}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Category badge, download & delete actions */}
                  <div className="att-row-right">
                    <span
                      className={`att-category-pill ${isAdminFile ? 'cat-admin' : 'cat-user'}`}
                    >
                      {isAdminFile ? 'Admin Brief' : 'Deliverable'}
                    </span>

                    <div className="att-row-actions">
                      <button
                        type="button"
                        className="btn-att-row-download"
                        onClick={() => handleDownload(att)}
                        title="Download file from Google Drive"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        <span>Download</span>
                      </button>

                      {canDeleteThis && !readOnly && (
                        <button
                          type="button"
                          className="btn-att-row-delete"
                          onClick={() => handleDelete(att)}
                          title="Delete from website (remains stored in Google Drive)"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
