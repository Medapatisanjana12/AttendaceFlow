const { google } = require('googleapis');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

class GoogleDriveService {
  constructor() {
    this.folderCache = new Map();
    this.driveClient = null;
    this.oauth2Client = null;
    this.initClient();
  }

  isConfigured() {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
  }

  initClient() {
    if (!this.isConfigured()) {
      console.warn(
        '[GoogleDriveService] Warning: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN is not set in environment.'
      );
      return null;
    }

    try {
      const redirectUri =
        process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/oauth2callback';

      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      this.oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      });

      this.driveClient = google.drive({
        version: 'v3',
        auth: this.oauth2Client,
      });

      console.log('[GoogleDriveService] Initialized Google Drive API v3 client with OAuth2 refresh token.');
      return this.driveClient;
    } catch (err) {
      console.error('[GoogleDriveService] Failed to initialize Google Drive client:', err.message);
      this.driveClient = null;
      return null;
    }
  }

  getDrive() {
    if (!this.driveClient) {
      this.initClient();
    }
    return this.driveClient;
  }

  /**
   * Finds an existing folder by name and optional parentId, or creates it.
   */
  async getOrCreateFolder(folderName, parentFolderId = null) {
    const cacheKey = `${parentFolderId || 'root'}:${folderName}`;
    if (this.folderCache.has(cacheKey)) {
      return this.folderCache.get(cacheKey);
    }

    const drive = this.getDrive();
    if (!drive) {
      throw new Error('Google Drive client is not configured.');
    }

    let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    try {
      const listRes = await drive.files.list({
        q: query,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (listRes.data.files && listRes.data.files.length > 0) {
        const existingId = listRes.data.files[0].id;
        this.folderCache.set(cacheKey, existingId);
        return existingId;
      }

      // Create folder
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };
      if (parentFolderId) {
        fileMetadata.parents = [parentFolderId];
      }

      const createRes = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name',
      });

      const newId = createRes.data.id;
      this.folderCache.set(cacheKey, newId);
      console.log(`[GoogleDriveService] Created folder "${folderName}" (ID: ${newId}) under parent "${parentFolderId || 'root'}".`);
      return newId;
    } catch (err) {
      console.error(`[GoogleDriveService] Error finding/creating folder "${folderName}":`, err.message);
      throw err;
    }
  }

  /**
   * Resolves the required folder hierarchy:
   * Workly/
   *   Admin_to_User/
   *     TASK<id>/
   *   User_to_Admin/
   *     TASK<id>/
   */
  async resolveTaskFolder(uploadDirection, taskId) {
    const drive = this.getDrive();
    if (!drive) {
      return this.resolveMockFolder(uploadDirection, taskId);
    }

    const sanitizedDirection =
      uploadDirection === 'Admin_to_User' ? 'Admin_to_User' : 'User_to_Admin';
    const sanitizedTaskId = `TASK_${String(taskId).replace(/[^a-zA-Z0-9_-]/g, '')}`;

    // 1. Root Workly folder
    const rootFolderId =
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
      (await this.getOrCreateFolder('Workly', null));

    // 2. Direction folder (Admin_to_User or User_to_Admin)
    const directionFolderId = await this.getOrCreateFolder(
      sanitizedDirection,
      rootFolderId
    );

    // 3. Task specific folder (TASK_<id>)
    const taskFolderId = await this.getOrCreateFolder(
      sanitizedTaskId,
      directionFolderId
    );

    return {
      rootFolderId,
      directionFolderId,
      taskFolderId,
    };
  }

  /**
   * Uploads a file stream or buffer to Google Drive in the specified task folder.
   */
  async uploadFile({
    buffer,
    originalName,
    mimeType,
    uploadDirection,
    taskId,
    description = '',
    uploadedBy = '',
    uploadedRole = 'user',
  }) {
    const cleanFileName = `${Date.now()}_${path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    if (!this.isConfigured()) {
      return this.uploadMockFile({
        buffer,
        cleanFileName,
        originalName,
        mimeType,
        uploadDirection,
        taskId,
        description,
        uploadedBy,
        uploadedRole,
      });
    }

    const drive = this.getDrive();
    const { taskFolderId } = await this.resolveTaskFolder(uploadDirection, taskId);

    const stream = Readable.from(buffer);

    const response = await drive.files.create({
      requestBody: {
        name: cleanFileName,
        parents: [taskFolderId],
        description: description || `Uploaded by ${uploadedBy} (${uploadedRole}) for Task ${taskId}`,
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: 'id, name, mimeType, size, createdTime',
    });

    return {
      googleDriveFileId: response.data.id,
      googleDriveFolderId: taskFolderId,
      fileName: response.data.name || cleanFileName,
      fileSize: parseInt(response.data.size, 10) || buffer.length,
      fileType: response.data.mimeType || mimeType,
    };
  }

  /**
   * Retrieves a readable stream to download the file directly from Google Drive.
   */
  async getDownloadStream(googleDriveFileId) {
    if (!this.isConfigured() || String(googleDriveFileId).startsWith('mock_')) {
      return this.getMockDownloadStream(googleDriveFileId);
    }

    const drive = this.getDrive();
    const metaRes = await drive.files.get({
      fileId: googleDriveFileId,
      fields: 'id, name, mimeType, size',
    });

    const streamRes = await drive.files.get(
      { fileId: googleDriveFileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return {
      stream: streamRes.data,
      fileName: metaRes.data.name,
      fileType: metaRes.data.mimeType,
      fileSize: metaRes.data.size,
    };
  }

  /**
   * Deletes a file permanently from Google Drive.
   */
  async deleteFile(googleDriveFileId) {
    if (!this.isConfigured() || String(googleDriveFileId).startsWith('mock_')) {
      return this.deleteMockFile(googleDriveFileId);
    }

    const drive = this.getDrive();
    await drive.files.delete({
      fileId: googleDriveFileId,
    });
    return true;
  }

  // --- LOCAL FALLBACK STORAGE (Used when GOOGLE_CLIENT_ID / REFRESH_TOKEN are not set) ---

  getMockBaseDir() {
    const baseDir = path.join(__dirname, 'uploads', 'google_drive_storage');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    return baseDir;
  }

  resolveMockFolder(uploadDirection, taskId) {
    const baseDir = this.getMockBaseDir();
    const dir = uploadDirection === 'Admin_to_User' ? 'Admin_to_User' : 'User_to_Admin';
    const taskDirName = `TASK_${String(taskId).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const fullTaskPath = path.join(baseDir, dir, taskDirName);

    if (!fs.existsSync(fullTaskPath)) {
      fs.mkdirSync(fullTaskPath, { recursive: true });
    }

    return {
      rootFolderId: 'mock_root_workly',
      directionFolderId: `mock_${dir}`,
      taskFolderId: `mock_${taskDirName}`,
      fullPath: fullTaskPath,
    };
  }

  async uploadMockFile({
    buffer,
    cleanFileName,
    mimeType,
    uploadDirection,
    taskId,
  }) {
    const { taskFolderId, fullPath } = this.resolveMockFolder(uploadDirection, taskId);
    const mockFileId = `mock_drive_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const destinationPath = path.join(fullPath, `${mockFileId}_${cleanFileName}`);

    fs.writeFileSync(destinationPath, buffer);

    return {
      googleDriveFileId: mockFileId,
      googleDriveFolderId: taskFolderId,
      fileName: cleanFileName,
      fileSize: buffer.length,
      fileType: mimeType,
      localMockPath: destinationPath,
    };
  }

  async getMockDownloadStream(mockFileId) {
    const baseDir = this.getMockBaseDir();
    // Recursively find file starting with mockFileId
    const findFile = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const res = findFile(fullPath);
          if (res) return res;
        } else if (item.startsWith(`${mockFileId}_`)) {
          return { fullPath, fileName: item.replace(`${mockFileId}_`, ''), stat };
        }
      }
      return null;
    };

    const found = findFile(baseDir);
    if (!found) {
      throw new Error('File not found in local Drive storage.');
    }

    return {
      stream: fs.createReadStream(found.fullPath),
      fileName: found.fileName,
      fileType: 'application/octet-stream',
      fileSize: found.stat.size,
    };
  }

  async deleteMockFile(mockFileId) {
    const baseDir = this.getMockBaseDir();
    const findAndDelete = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (findAndDelete(fullPath)) return true;
        } else if (item.startsWith(`${mockFileId}_`)) {
          fs.unlinkSync(fullPath);
          return true;
        }
      }
      return false;
    };

    return findAndDelete(baseDir);
  }
}

module.exports = new GoogleDriveService();
