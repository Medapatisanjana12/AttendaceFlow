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

  getRedirectUri() {
    return (
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:5000/api/google-drive/callback'
    );
  }

  getOAuth2Client() {
    if (!this.oauth2Client) {
      const redirectUri = this.getRedirectUri();
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      if (process.env.GOOGLE_REFRESH_TOKEN) {
        this.oauth2Client.setCredentials({
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
        });
      }

      this.oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
          console.log('[GoogleDriveService] New refresh token received and updated in memory.');
        }
      });
    }
    return this.oauth2Client;
  }

  initClient(customRefreshToken = null) {
    if (customRefreshToken) {
      process.env.GOOGLE_REFRESH_TOKEN = customRefreshToken;
    }

    if (!this.isConfigured()) {
      this.driveClient = null;
      return null;
    }

    try {
      const redirectUri = this.getRedirectUri();

      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        redirectUri
      );

      this.oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      });

      this.oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
          process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
          console.log('[GoogleDriveService] Stored new refresh token from token event.');
        }
      });

      this.driveClient = google.drive({
        version: 'v3',
        auth: this.oauth2Client,
      });

      console.log('[GoogleDriveService] Successfully initialized Google Drive API v3 client.');
      return this.driveClient;
    } catch (err) {
      console.error('[GoogleDriveService] Failed to initialize Google Drive client:', err.message);
      this.driveClient = null;
      return null;
    }
  }

  getDrive() {
    if (!this.driveClient && this.isConfigured()) {
      this.initClient();
    }
    return this.driveClient;
  }

  /**
   * Refreshes the OAuth access token explicitly.
   */
  async refreshAccessToken() {
    const oauth2 = this.getOAuth2Client();
    if (!oauth2) {
      throw new Error('OAuth2 client is not configured.');
    }
    const tokenResponse = await oauth2.getAccessToken();
    return {
      accessToken: tokenResponse?.token || null,
      res: tokenResponse?.res?.data || null,
    };
  }

  /**
   * Retrieves an existing folder by name and optional parentId.
   */
  async findFolder(folderName, parentFolderId = null) {
    const drive = this.getDrive();
    if (!drive) return null;

    let query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
    if (parentFolderId) {
      query += ` and '${parentFolderId}' in parents`;
    }

    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name, parents, mimeType)',
      spaces: 'drive',
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0];
    }
    return null;
  }

  /**
   * Gets metadata for an existing folder by ID.
   */
  async getFolder(folderId) {
    const drive = this.getDrive();
    if (!drive) return null;

    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, mimeType, trashed, parents',
    });
    return res.data;
  }

  /**
   * Creates a private Google Drive folder without public sharing.
   */
  async createFolder(folderName, parentFolderId = null) {
    const drive = this.getDrive();
    if (!drive) {
      throw new Error('Google Drive client is not configured.');
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentFolderId) {
      fileMetadata.parents = [parentFolderId];
    }

    const createRes = await drive.files.create({
      requestBody: fileMetadata,
      fields: 'id, name, parents',
    });

    const newId = createRes.data.id;
    const cacheKey = `${parentFolderId || 'root'}:${folderName}`;
    this.folderCache.set(cacheKey, newId);
    console.log(`[GoogleDriveService] Created private folder "${folderName}" (ID: ${newId}) under parent "${parentFolderId || 'root'}".`);
    return newId;
  }

  /**
   * Finds an existing folder or creates it if not found.
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

    const existing = await this.findFolder(folderName, parentFolderId);
    if (existing) {
      this.folderCache.set(cacheKey, existing.id);
      return existing.id;
    }

    const newId = await this.createFolder(folderName, parentFolderId);
    return newId;
  }

  /**
   * Ensures the core Workly folder structure exists:
   * Workly/
   *   Admin_to_User/
   *   User_to_Admin/
   */
  async ensureWorklyHierarchy() {
    if (!this.isConfigured()) {
      return {
        rootFolderId: 'mock_workly_root',
        adminToUserFolderId: 'mock_admin_to_user',
        userToAdminFolderId: 'mock_user_to_admin',
      };
    }

    const rootFolderId =
      process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ||
      (await this.getOrCreateFolder('Workly', null));

    const adminToUserFolderId = await this.getOrCreateFolder('Admin_to_User', rootFolderId);
    const userToAdminFolderId = await this.getOrCreateFolder('User_to_Admin', rootFolderId);

    return {
      rootFolderId,
      adminToUserFolderId,
      userToAdminFolderId,
    };
  }

  /**
   * Resolves the required folder hierarchy for a specific task:
   * Workly/
   *   Admin_to_User/ or User_to_Admin/
   *     TASK_<id>/
   */
  async resolveTaskFolder(uploadDirection, taskId) {
    const drive = this.getDrive();
    if (!drive) {
      return this.resolveMockFolder(uploadDirection, taskId);
    }

    const sanitizedDirection =
      uploadDirection === 'Admin_to_User' ? 'Admin_to_User' : 'User_to_Admin';
    const sanitizedTaskId = `TASK_${String(taskId).replace(/[^a-zA-Z0-9_-]/g, '')}`;

    const { rootFolderId, adminToUserFolderId, userToAdminFolderId } =
      await this.ensureWorklyHierarchy();

    const directionFolderId =
      sanitizedDirection === 'Admin_to_User' ? adminToUserFolderId : userToAdminFolderId;

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
   * Lists files inside a given Google Drive folder.
   */
  async listFiles(folderId, options = {}) {
    const drive = this.getDrive();
    if (!drive) return [];

    const pageSize = options.pageSize || 50;
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, createdTime, description)',
      pageSize,
    });

    return res.data.files || [];
  }

  /**
   * Retrieves a readable stream to download the file directly from Google Drive.
   */
  async downloadFile(googleDriveFileId) {
    return this.getDownloadStream(googleDriveFileId);
  }

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
    console.log(`[GoogleDriveService] File ${googleDriveFileId} permanently deleted from Google Drive.`);
    return true;
  }

  /**
   * Tests the Google Drive connection and verifies the Workly folder structure.
   */
  async testConnection() {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return {
        connected: false,
        status: 'missing_credentials',
        message: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured in environment.',
      };
    }

    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return {
        connected: false,
        status: 'missing_refresh_token',
        message: 'GOOGLE_REFRESH_TOKEN is not configured. Authorize via /api/google-drive/auth.',
      };
    }

    try {
      const drive = this.getDrive();
      if (!drive) {
        throw new Error('Google Drive client could not be initialized.');
      }

      // Verify API accessibility
      const aboutRes = await drive.about.get({
        fields: 'user, storageQuota',
      });

      const userEmail = aboutRes.data?.user?.emailAddress || 'Authorized User';

      // Verify / create Workly hierarchy
      const folders = await this.ensureWorklyHierarchy();

      return {
        connected: true,
        status: 'active',
        message: 'Google Drive API v3 connected and Workly folder hierarchy verified successfully.',
        authenticatedUser: userEmail,
        folders: {
          root: { name: 'Workly', id: folders.rootFolderId },
          adminToUser: { name: 'Admin_to_User', id: folders.adminToUserFolderId },
          userToAdmin: { name: 'User_to_Admin', id: folders.userToAdminFolderId },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        connected: false,
        status: 'error',
        message: 'Google Drive connection test failed: ' + err.message,
      };
    }
  }

  // --- LOCAL MOCK STORAGE FALLBACK (For offline/testing resilience) ---

  getMockStorageDir() {
    const dir = path.join(__dirname, 'uploads', 'google_drive_storage');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  resolveMockFolder(uploadDirection, taskId) {
    const base = this.getMockStorageDir();
    const dir = uploadDirection === 'Admin_to_User' ? 'Admin_to_User' : 'User_to_Admin';
    const folderPath = path.join(base, dir, `TASK_${taskId}`);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    return {
      rootFolderId: 'mock_workly_root',
      directionFolderId: `mock_${dir}`,
      taskFolderId: `mock_TASK_${taskId}`,
      folderPath,
    };
  }

  async uploadMockFile({ buffer, cleanFileName, originalName, mimeType, uploadDirection, taskId, description, uploadedBy, uploadedRole }) {
    const { folderPath, taskFolderId } = this.resolveMockFolder(uploadDirection, taskId);
    const targetPath = path.join(folderPath, cleanFileName);
    fs.writeFileSync(targetPath, buffer);

    const mockId = `mock_drive_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      googleDriveFileId: mockId,
      googleDriveFolderId: taskFolderId,
      fileName: cleanFileName,
      fileSize: buffer.length,
      fileType: mimeType,
      localMockPath: targetPath,
    };
  }

  async getMockDownloadStream(mockFileId) {
    const base = this.getMockStorageDir();
    let foundPath = null;
    let foundName = 'downloaded_file';

    function walk(dir) {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const full = path.join(dir, f);
        if (fs.statSync(full).isDirectory()) {
          walk(full);
        } else {
          foundPath = full;
          foundName = f;
          return;
        }
      }
    }
    walk(base);

    if (!foundPath || !fs.existsSync(foundPath)) {
      const fallbackPath = path.join(base, 'test_mock_file.txt');
      fs.writeFileSync(fallbackPath, 'Mock file content from Workly');
      foundPath = fallbackPath;
      foundName = 'test_mock_file.txt';
    }

    const stat = fs.statSync(foundPath);
    return {
      stream: fs.createReadStream(foundPath),
      fileName: foundName,
      fileType: 'application/octet-stream',
      fileSize: stat.size,
    };
  }

  async deleteMockFile(mockFileId) {
    return true;
  }
}

module.exports = new GoogleDriveService();
