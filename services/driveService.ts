
import { AdTemplate } from '../types';

export const listImagesInFolder = async (folderId: string, accessToken: string): Promise<AdTemplate[]> => {
  if (!folderId || !accessToken) {
    throw new Error("Missing folder ID or access token");
  }

  const query = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,thumbnailLink,webContentLink,description)&pageSize=50`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `Drive API Error: ${response.statusText}`);
    }

    const data = await response.json();
    const files = data.files || [];

    return files.map((file: any) => ({
      id: file.id,
      name: file.name,
      // Use thumbnailLink if available, but size it up (s400). Fallback to webContentLink.
      // Note: thumbnails might expire or require cookies in some contexts, but usually work for session.
      // webContentLink usually forces download.
      // A trick for thumbnails is replacing =s220 with =s1000
      imageUrl: file.thumbnailLink ? file.thumbnailLink.replace('=s220', '=s1000') : (file.webContentLink || ''), 
      description: file.description || 'Imported from Google Drive',
      tags: ['drive', 'imported'],
    }));

  } catch (error) {
    console.error("Failed to fetch Drive files:", error);
    throw error;
  }
};
